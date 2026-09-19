from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Response
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import hashlib
from pathlib import Path
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta, timezone
import bcrypt
import jwt as pyjwt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Config
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALG = "HS256"
JWT_EXP_MIN = int(os.getenv("JWT_EXPIRE_MINUTES", "10080"))
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

app = FastAPI(title="MotoResQ API")
api = APIRouter(prefix="/api")

# ---------- Models ----------
class SignupIn(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class PublicUser(BaseModel):
    id: str
    email: EmailStr
    name: Optional[str] = None
    motorcycle: Optional[Dict[str, Any]] = None

class TokenOut(BaseModel):
    access_token: str
    user: PublicUser

class MotorcycleIn(BaseModel):
    make: str
    model: str
    year: int
    odometer: int = 0
    vin: Optional[str] = None
    nickname: Optional[str] = None

class MaintenanceIn(BaseModel):
    service_type: str
    date: str  # ISO date
    odometer: int
    cost: float = 0
    notes: Optional[str] = None

class MaintenanceOut(MaintenanceIn):
    id: str
    created_at: str

class DiagnoseAnswerIn(BaseModel):
    category: str
    answers: Dict[str, str]

class ChatIn(BaseModel):
    session_id: str
    message: str
    motorcycle: Optional[Dict[str, Any]] = None

class ChatOut(BaseModel):
    reply: str

class TTSIn(BaseModel):
    text: str
    voice: Optional[str] = "nova"

# ---------- Helpers ----------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def make_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "iat": now, "exp": now + timedelta(minutes=JWT_EXP_MIN)}
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except Exception:
        raise HTTPException(401, "Invalid or expired token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user

def public_user(u: dict) -> PublicUser:
    return PublicUser(
        id=u["id"], email=u["email"], name=u.get("name"),
        motorcycle=u.get("motorcycle"),
    )

# ---------- Auth ----------
@api.post("/auth/signup", response_model=TokenOut)
async def signup(body: SignupIn):
    email = body.email.lower().strip()
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(409, "Email already registered")
    uid = str(uuid.uuid4())
    doc = {
        "id": uid, "email": email, "name": body.name,
        "password_hash": hash_password(body.password),
        "motorcycle": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    return TokenOut(access_token=make_token(uid), user=public_user(doc))

@api.post("/auth/login", response_model=TokenOut)
async def login(body: LoginIn):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    return TokenOut(access_token=make_token(user["id"]), user=public_user(user))

@api.get("/auth/me", response_model=PublicUser)
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)

# ---------- Motorcycle profile ----------
@api.put("/motorcycle", response_model=PublicUser)
async def update_motorcycle(body: MotorcycleIn, user: dict = Depends(get_current_user)):
    moto = body.dict()
    await db.users.update_one({"id": user["id"]}, {"$set": {"motorcycle": moto}})
    user["motorcycle"] = moto
    return public_user(user)

# ---------- Maintenance ----------
@api.get("/maintenance", response_model=List[MaintenanceOut])
async def list_maintenance(user: dict = Depends(get_current_user)):
    docs = await db.maintenance.find({"user_id": user["id"]}, {"_id": 0}).sort("date", -1).to_list(500)
    return [MaintenanceOut(**{k: v for k, v in d.items() if k != "user_id"}) for d in docs]

@api.post("/maintenance", response_model=MaintenanceOut)
async def add_maintenance(body: MaintenanceIn, user: dict = Depends(get_current_user)):
    entry = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "service_type": body.service_type,
        "date": body.date,
        "odometer": body.odometer,
        "cost": body.cost,
        "notes": body.notes,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.maintenance.insert_one(entry)
    return MaintenanceOut(**{k: v for k, v in entry.items() if k != "user_id"})

@api.delete("/maintenance/{item_id}")
async def delete_maintenance(item_id: str, user: dict = Depends(get_current_user)):
    r = await db.maintenance.delete_one({"id": item_id, "user_id": user["id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}

# ---------- Static: diagnostic questionnaire & repair guides ----------
DIAG_TREE = {
    "wont_start": {
        "title": "Won't Start",
        "questions": [
            {"id": "battery_lights", "q": "Do the dashboard lights turn on when you turn the key?",
             "options": [{"v": "no", "l": "No lights at all"}, {"v": "dim", "l": "Dim / weak lights"}, {"v": "yes", "l": "Bright lights"}]},
            {"id": "starter_sound", "q": "When you press the start button, what do you hear?",
             "options": [{"v": "nothing", "l": "Nothing"}, {"v": "click", "l": "Clicking sound"}, {"v": "cranks", "l": "Engine cranks but no start"}]},
            {"id": "fuel", "q": "Do you have fuel in the tank?",
             "options": [{"v": "yes", "l": "Yes, plenty"}, {"v": "low", "l": "Very low"}, {"v": "unsure", "l": "Not sure"}]},
        ],
        "rules": [
            {"if": {"battery_lights": "no"}, "cause": "Dead battery or loose battery terminals", "severity": "medium", "guide_id": "battery"},
            {"if": {"battery_lights": "dim", "starter_sound": "click"}, "cause": "Weak battery — not enough charge to crank", "severity": "medium", "guide_id": "battery"},
            {"if": {"fuel": "low"}, "cause": "Out of fuel or fuel pump not priming", "severity": "low", "guide_id": "fuel"},
            {"if": {"starter_sound": "cranks"}, "cause": "Fuel or ignition issue — spark plug or fuel delivery", "severity": "medium", "guide_id": "spark_plug"},
        ],
    },
    "overheating": {
        "title": "Overheating",
        "questions": [
            {"id": "coolant", "q": "Is coolant level in the reservoir low?",
             "options": [{"v": "yes", "l": "Yes, very low"}, {"v": "no", "l": "No, level is fine"}, {"v": "unsure", "l": "Not sure"}]},
            {"id": "fan", "q": "Is the radiator fan running when hot?",
             "options": [{"v": "yes", "l": "Yes"}, {"v": "no", "l": "No"}, {"v": "unsure", "l": "Cannot tell"}]},
        ],
        "rules": [
            {"if": {"coolant": "yes"}, "cause": "Low coolant — possible leak in system", "severity": "high", "guide_id": "coolant"},
            {"if": {"fan": "no"}, "cause": "Radiator fan not working — check fuse and relay", "severity": "high", "guide_id": "cooling_fan"},
        ],
    },
    "brakes": {
        "title": "Brake Issues",
        "questions": [
            {"id": "feel", "q": "How does the brake lever feel?",
             "options": [{"v": "spongy", "l": "Spongy / soft"}, {"v": "hard", "l": "Very hard"}, {"v": "normal", "l": "Normal but weak"}]},
            {"id": "noise", "q": "Any noise when braking?",
             "options": [{"v": "squeal", "l": "Squealing / grinding"}, {"v": "none", "l": "No noise"}]},
        ],
        "rules": [
            {"if": {"feel": "spongy"}, "cause": "Air in brake lines — needs bleeding", "severity": "high", "guide_id": "brake_bleed"},
            {"if": {"noise": "squeal"}, "cause": "Worn brake pads", "severity": "high", "guide_id": "brake_pads"},
        ],
    },
    "flat_tire": {
        "title": "Flat Tire",
        "questions": [
            {"id": "puncture", "q": "Can you see a nail or object in the tire?",
             "options": [{"v": "yes", "l": "Yes"}, {"v": "no", "l": "No"}]},
            {"id": "side", "q": "Is the damage on the tread or sidewall?",
             "options": [{"v": "tread", "l": "Tread (center)"}, {"v": "sidewall", "l": "Sidewall"}, {"v": "unsure", "l": "Not sure"}]},
        ],
        "rules": [
            {"if": {"side": "sidewall"}, "cause": "Sidewall damage — tire cannot be safely repaired, replace", "severity": "high", "guide_id": "tire_replace"},
            {"if": {"puncture": "yes", "side": "tread"}, "cause": "Tread puncture — plug kit can get you home", "severity": "medium", "guide_id": "tire_plug"},
        ],
    },
    "chain": {
        "title": "Chain / Drive",
        "questions": [
            {"id": "slack", "q": "How much slack does the chain have (up-down play at midpoint)?",
             "options": [{"v": "loose", "l": "Very loose (>50mm)"}, {"v": "ok", "l": "About right (20-30mm)"}, {"v": "tight", "l": "Very tight"}]},
            {"id": "lube", "q": "Is the chain dry, rusty, or dirty?",
             "options": [{"v": "yes", "l": "Yes"}, {"v": "no", "l": "No, looks clean and oiled"}]},
        ],
        "rules": [
            {"if": {"slack": "loose"}, "cause": "Chain too loose — needs adjustment", "severity": "medium", "guide_id": "chain_adjust"},
            {"if": {"slack": "tight"}, "cause": "Chain over-tight — will damage sprockets", "severity": "medium", "guide_id": "chain_adjust"},
            {"if": {"lube": "yes"}, "cause": "Chain needs cleaning and lubrication", "severity": "low", "guide_id": "chain_lube"},
        ],
    },
    "electrical": {
        "title": "Electrical",
        "questions": [
            {"id": "which", "q": "What is not working?",
             "options": [{"v": "headlight", "l": "Headlight"}, {"v": "indicators", "l": "Indicators"}, {"v": "horn", "l": "Horn"}, {"v": "all", "l": "Nothing electrical works"}]},
        ],
        "rules": [
            {"if": {"which": "all"}, "cause": "Main fuse blown or dead battery", "severity": "medium", "guide_id": "fuse"},
            {"if": {"which": "headlight"}, "cause": "Blown headlight bulb or fuse", "severity": "low", "guide_id": "fuse"},
            {"if": {"which": "indicators"}, "cause": "Flasher relay or bulb failed", "severity": "low", "guide_id": "fuse"},
            {"if": {"which": "horn"}, "cause": "Horn fuse or wiring issue", "severity": "low", "guide_id": "fuse"},
        ],
    },
}

REPAIR_GUIDES = {
    "battery": {"id": "battery", "title": "Jump-start or Replace Battery", "category": "Electrical", "time": "15 min", "difficulty": "Easy",
        "tools": ["Multimeter (optional)", "Spanner set", "Jumper cables or a helper bike"],
        "warnings": ["Never short battery terminals with metal tools.", "Wear safety glasses — batteries can vent hydrogen gas."],
        "steps": [
            "Turn ignition off and remove the key.",
            "Locate the battery (under the seat on most bikes).",
            "Check terminals for corrosion — clean with a wire brush if needed.",
            "Reconnect terminals tight: positive (+) first, then negative (-).",
            "If dead, connect jumper cables to a running vehicle (12V): + to +, - to a metal frame ground.",
            "Try to start the bike. Let it run 15-20 minutes to recharge, or ride to a shop.",
        ]},
    "fuel": {"id": "fuel", "title": "Fuel System — Empty Tank / Priming", "category": "Engine", "time": "10 min", "difficulty": "Easy",
        "tools": ["Fuel container", "Funnel"],
        "warnings": ["Do not smoke or use open flames near fuel.", "Fuel vapors are flammable — refuel in ventilated areas."],
        "steps": [
            "Confirm fuel gauge or dip stick reading.",
            "Add at least 1 litre of the correct octane petrol.",
            "Turn ignition to ON position (do not crank) — listen for fuel pump prime (2-3 seconds).",
            "Wait for the pump to complete, then start engine.",
            "If still won't start, fuel pump or filter may be at fault.",
        ]},
    "spark_plug": {"id": "spark_plug", "title": "Inspect and Replace Spark Plug", "category": "Engine", "time": "30 min", "difficulty": "Medium",
        "tools": ["Spark plug socket & extension", "Torque wrench", "Feeler gauge", "New spark plug (correct heat range)"],
        "warnings": ["Let the engine cool completely before removing plugs.", "Do not overtighten — it can strip the head threads."],
        "steps": [
            "Remove the fuel tank or side panel to access plugs (varies by bike).",
            "Pull the plug cap straight up.",
            "Use a spark plug socket to unscrew the plug counter-clockwise.",
            "Inspect: black soot = rich mixture, white = lean/overheating, wet = fouled.",
            "Gap new plug per manual (usually 0.7-0.9mm).",
            "Screw in by hand first, then torque to manufacturer spec (~13 Nm).",
            "Refit cap firmly.",
        ]},
    "coolant": {"id": "coolant", "title": "Top-up Coolant Safely", "category": "Cooling", "time": "10 min", "difficulty": "Easy",
        "tools": ["Coolant (50/50 pre-mix)", "Funnel"],
        "warnings": ["NEVER open the radiator cap while hot — scalding fluid will spray out.", "Wait until engine is fully cool (30+ min)."],
        "steps": [
            "Park on level ground, engine cold.",
            "Locate the reservoir — usually a translucent tank marked MIN/MAX.",
            "Top up to just below MAX with pre-mixed coolant.",
            "Check the radiator for leaks — look for green/pink stains under the bike.",
            "If reservoir empties again quickly, do not ride — get it towed.",
        ]},
    "cooling_fan": {"id": "cooling_fan", "title": "Radiator Fan Not Running", "category": "Cooling", "time": "20 min", "difficulty": "Medium",
        "tools": ["Multimeter", "Spare fuse", "Spanner set"],
        "warnings": ["Hot components — allow to cool.", "Do not operate the bike with a non-working fan in slow traffic."],
        "steps": [
            "Locate the fan fuse in the fusebox (see owner's manual).",
            "Pull fuse and check with multimeter or visually — replace if blown.",
            "If fuse is fine, tap the fan blade gently while stationary — sometimes the motor bearings stick.",
            "Check the fan sensor connector for corrosion.",
            "If still not working, replace the fan motor or relay.",
        ]},
    "brake_bleed": {"id": "brake_bleed", "title": "Bleed Brakes (Remove Air)", "category": "Brakes", "time": "45 min", "difficulty": "Medium",
        "tools": ["Brake fluid (correct DOT rating)", "Clear hose", "Container", "Spanner"],
        "warnings": ["DOT brake fluid damages paint — wipe up spills immediately.", "Use only the fluid grade specified by the manufacturer."],
        "steps": [
            "Top up the master cylinder to MAX with fresh fluid.",
            "Attach clear hose to caliper bleed nipple, other end into container.",
            "Squeeze brake lever, hold; open nipple 1/4 turn; close nipple; release lever. Repeat.",
            "Watch for air bubbles in the hose — continue until fluid runs clear.",
            "Keep the master cylinder topped up throughout — do not let it run dry.",
            "Tighten bleed nipple, test lever firmness before riding.",
        ]},
    "brake_pads": {"id": "brake_pads", "title": "Replace Brake Pads", "category": "Brakes", "time": "40 min", "difficulty": "Medium",
        "tools": ["Allen key set", "Pin punch", "New brake pads (matched to model)"],
        "warnings": ["Bed in new pads gently for the first 100km — no hard stops.", "Do not touch the friction surface with oily hands."],
        "steps": [
            "Remove the caliper mounting bolts.",
            "Slide caliper off the disc carefully — do not let it hang by the hose.",
            "Push out the retaining pin and remove old pads.",
            "Push caliper pistons back in slowly using a plastic tool.",
            "Insert new pads and refit retaining pin.",
            "Bolt caliper back on to spec torque.",
            "Pump brake lever until firm before moving the bike.",
        ]},
    "tire_replace": {"id": "tire_replace", "title": "Tire Replacement (Get Towed)", "category": "Tires", "time": "Shop visit", "difficulty": "Hard",
        "tools": ["Call for roadside assistance"],
        "warnings": ["A damaged sidewall can blow out under load — do NOT ride the bike.", "Motorcycle tire changes require specialist balancing equipment."],
        "steps": [
            "Do not ride. Sidewall damage is not repairable.",
            "Call roadside assistance or a friend with a truck.",
            "At the shop, replace the tire with the correct size (sidewall marking).",
            "Have both wheels balanced.",
        ]},
    "tire_plug": {"id": "tire_plug", "title": "Emergency Tire Plug Repair", "category": "Tires", "time": "20 min", "difficulty": "Medium",
        "tools": ["Tire plug kit", "CO2 inflator or 12V pump", "Pliers"],
        "warnings": ["A plug is a temporary fix — replace the tire soon after.", "Do not exceed 80 km/h on a plugged tire.", "Sidewall plugs are UNSAFE."],
        "steps": [
            "Locate the puncture — spraying soapy water helps find leaks.",
            "Remove the object with pliers.",
            "Use the reamer tool to clean out the hole.",
            "Coat a plug strip with rubber cement and thread it into the insertion tool.",
            "Push the tool firmly into the hole until half the plug is inside; twist and pull out.",
            "Trim excess plug flush with the tread.",
            "Inflate to recommended pressure and check for leaks.",
        ]},
    "chain_adjust": {"id": "chain_adjust", "title": "Adjust Chain Slack", "category": "Drivetrain", "time": "30 min", "difficulty": "Medium",
        "tools": ["Spanner set", "Ruler", "Torque wrench"],
        "warnings": ["Wheel alignment marks on the swingarm — keep both sides equal.", "Chain tension is measured with rider weight ON the bike (or per manual)."],
        "steps": [
            "Put bike on paddock stand or centre stand.",
            "Loosen the rear axle nut half a turn.",
            "Loosen the lock nuts on both chain adjusters.",
            "Turn adjuster bolts equally on each side to move the wheel back or forward.",
            "Aim for 20-30mm of vertical play at chain midpoint (verify manual).",
            "Tighten lock nuts, torque axle nut to spec (typically 90-100 Nm).",
        ]},
    "chain_lube": {"id": "chain_lube", "title": "Clean and Lubricate Chain", "category": "Drivetrain", "time": "20 min", "difficulty": "Easy",
        "tools": ["Chain cleaner spray", "Rag", "Chain lube (O-ring safe)"],
        "warnings": ["Never lube a hot chain from a hard ride — wait to cool slightly.", "Keep spray away from tire and brake disc."],
        "steps": [
            "Warm the chain by rolling the bike a few meters.",
            "Spray chain cleaner while slowly rotating the rear wheel.",
            "Scrub with soft brush, wipe clean with a rag.",
            "Apply chain lube evenly to the inside of the chain while rotating.",
            "Let it soak in for 5 minutes.",
            "Wipe off excess to prevent fling on your rim.",
        ]},
    "fuse": {"id": "fuse", "title": "Check and Replace a Fuse", "category": "Electrical", "time": "10 min", "difficulty": "Easy",
        "tools": ["Fuse puller (usually in fuse box)", "Spare fuses (same rating)"],
        "warnings": ["Never replace with a higher-rated fuse — will damage wiring.", "If the new fuse blows immediately, there is a short circuit — do not force it."],
        "steps": [
            "Find the fuse box (owner's manual will show location).",
            "Match the affected item to the fuse label.",
            "Pull the suspect fuse.",
            "Check visually — a broken filament means it's blown.",
            "Replace with a fuse of the exact same amp rating.",
            "Test the circuit.",
        ]},
}

@api.get("/diagnostic/categories")
async def diag_categories():
    return [{"id": k, "title": v["title"]} for k, v in DIAG_TREE.items()]

@api.get("/diagnostic/{category}")
async def diag_questions(category: str):
    if category not in DIAG_TREE:
        raise HTTPException(404, "Unknown category")
    return DIAG_TREE[category]

@api.post("/diagnostic/analyze")
async def diag_analyze(body: DiagnoseAnswerIn):
    tree = DIAG_TREE.get(body.category)
    if not tree:
        raise HTTPException(404, "Unknown category")
    matches = []
    for rule in tree["rules"]:
        cond = rule["if"]
        if all(body.answers.get(k) == v for k, v in cond.items()):
            matches.append({
                "cause": rule["cause"],
                "severity": rule["severity"],
                "guide_id": rule["guide_id"],
            })
    if not matches:
        matches.append({
            "cause": "Symptoms don't match a common pattern. Try the AI Chat for personalized help, or consult a mechanic.",
            "severity": "low",
            "guide_id": None,
        })
    return {"results": matches}

@api.get("/guides")
async def list_guides():
    return [{"id": g["id"], "title": g["title"], "category": g["category"],
             "time": g["time"], "difficulty": g["difficulty"]} for g in REPAIR_GUIDES.values()]

@api.get("/guides/{gid}")
async def get_guide(gid: str):
    g = REPAIR_GUIDES.get(gid)
    if not g:
        raise HTTPException(404, "Guide not found")
    return g

# ---------- AI Chat ----------
CHAT_SYSTEM = (
    "You are MotoResQ, an expert motorcycle mechanic assistant. "
    "You help riders diagnose problems, explain repair steps, and give safety warnings. "
    "Be concise, practical, and safety-focused. Format numbered steps for repairs. "
    "When appropriate, remind users when a problem needs a professional mechanic."
)

@api.post("/chat", response_model=ChatOut)
async def chat(body: ChatIn, user: dict = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "AI not configured")
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        raise HTTPException(500, f"AI library error: {e}")

    # Load history from DB for this session
    history_docs = await db.chat_messages.find(
        {"user_id": user["id"], "session_id": body.session_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(50)

    moto = body.motorcycle or user.get("motorcycle") or {}
    system_msg = CHAT_SYSTEM
    if moto:
        system_msg += f"\n\nThe rider's motorcycle: {moto.get('year','')} {moto.get('make','')} {moto.get('model','')}. Odometer: {moto.get('odometer','?')} km."

    chat_obj = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"{user['id']}-{body.session_id}",
        system_message=system_msg,
    ).with_model("anthropic", "claude-sonnet-4-6")

    try:
        reply = await chat_obj.send_message(UserMessage(text=body.message))
    except Exception as e:
        logging.exception("chat failed")
        raise HTTPException(502, f"AI request failed: {str(e)[:200]}")

    now = datetime.now(timezone.utc).isoformat()
    await db.chat_messages.insert_many([
        {"id": str(uuid.uuid4()), "user_id": user["id"], "session_id": body.session_id,
         "role": "user", "content": body.message, "created_at": now},
        {"id": str(uuid.uuid4()), "user_id": user["id"], "session_id": body.session_id,
         "role": "assistant", "content": str(reply), "created_at": now},
    ])
    return ChatOut(reply=str(reply))

@api.get("/chat/history/{session_id}")
async def chat_history(session_id: str, user: dict = Depends(get_current_user)):
    docs = await db.chat_messages.find(
        {"user_id": user["id"], "session_id": session_id}, {"_id": 0, "user_id": 0}
    ).sort("created_at", 1).to_list(200)
    return docs

# ---------- TTS ----------
@api.post("/tts")
async def tts(body: TTSIn, user: dict = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "TTS not configured")
    if not body.text.strip():
        raise HTTPException(400, "Text is required")
    text = body.text[:4000]
    try:
        from emergentintegrations.llm.openai import OpenAITextToSpeech
    except Exception as e:
        raise HTTPException(500, f"TTS library error: {e}")

    try:
        tts_client = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
        audio = await tts_client.generate_speech(
            text=text, model="tts-1", voice=body.voice or "nova", response_format="mp3"
        )
    except Exception as e:
        logging.exception("tts failed")
        raise HTTPException(502, f"TTS failed: {str(e)[:200]}")

    return Response(content=audio, media_type="audio/mpeg",
                    headers={"Cache-Control": "no-store"})

# ---------- Health ----------
@api.get("/")
async def root():
    return {"ok": True, "service": "MotoResQ"}

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def _startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.maintenance.create_index([("user_id", 1), ("date", -1)])
    await db.chat_messages.create_index([("user_id", 1), ("session_id", 1), ("created_at", 1)])

@app.on_event("shutdown")
async def _shutdown():
    client.close()
