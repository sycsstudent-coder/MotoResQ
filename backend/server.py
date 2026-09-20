from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Response, UploadFile, File, Query
from fastapi.concurrency import run_in_threadpool
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import tempfile
import requests
from pathlib import Path
from pydantic import BaseModel, EmailStr
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

# Emergent Object Storage
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "motoresq"
storage_key: Optional[str] = None

def init_storage() -> str:
    global storage_key
    if storage_key:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    if resp.status_code == 402:
        raise HTTPException(402, "Storage credits exhausted — photo upload unavailable right now")
    resp.raise_for_status()
    return resp.json()

def get_object(path: str) -> tuple:
    global storage_key
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 503:
        storage_key = None
        key = init_storage()
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

@asynccontextmanager
async def lifespan(_: FastAPI):
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.maintenance.create_index([("user_id", 1), ("date", -1)])
    await db.chat_messages.create_index([("user_id", 1), ("session_id", 1), ("created_at", 1)])
    await db.emergency_contacts.create_index([("user_id", 1), ("created_at", 1)])
    try:
        await run_in_threadpool(init_storage)
    except Exception as e:
        logging.warning("storage init failed: %s", e)
    yield
    client.close()

app = FastAPI(title="MotoResQ API", lifespan=lifespan)
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
    bike_photo: Optional[str] = None

class OdometerIn(BaseModel):
    odometer: int

class ContactIn(BaseModel):
    name: str
    phone: str
    kind: str = "personal"  # tow | roadside | personal

class ContactOut(ContactIn):
    id: str

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
        motorcycle=u.get("motorcycle"), bike_photo=u.get("bike_photo"),
    )

def user_from_token(token: str) -> Optional[str]:
    try:
        return pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])["sub"]
    except Exception:
        return None

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

@api.patch("/motorcycle/odometer", response_model=PublicUser)
async def update_odometer(body: OdometerIn, user: dict = Depends(get_current_user)):
    if not user.get("motorcycle"):
        raise HTTPException(400, "Add your motorcycle first")
    if body.odometer < 0:
        raise HTTPException(400, "Odometer must be positive")
    await db.users.update_one({"id": user["id"]}, {"$set": {"motorcycle.odometer": body.odometer}})
    user["motorcycle"]["odometer"] = body.odometer
    return public_user(user)

IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic"}
MAX_IMAGE_BYTES = 8 * 1024 * 1024

@api.post("/motorcycle/photo", response_model=PublicUser)
async def upload_bike_photo(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ct = (file.content_type or "").lower()
    ext = IMAGE_TYPES.get(ct) or Path(file.filename or "").suffix.lstrip(".").lower()
    if ext not in IMAGE_TYPES.values():
        raise HTTPException(415, "Please upload a JPG, PNG or WEBP image")
    data = await file.read(MAX_IMAGE_BYTES + 1)
    if not data:
        raise HTTPException(400, "Empty file")
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Image must be under 8 MB")
    path = f"{APP_NAME}/uploads/{user['id']}/{uuid.uuid4()}.{ext}"
    try:
        result = await run_in_threadpool(put_object, path, data, ct or "image/jpeg")
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("photo upload failed")
        raise HTTPException(502, f"Photo upload failed: {str(e)[:120]}")
    stored = result.get("path", path)
    await db.users.update_one({"id": user["id"]}, {"$set": {"bike_photo": stored}})
    user["bike_photo"] = stored
    return public_user(user)

@api.get("/files/{path:path}")
async def get_file(path: str, token: Optional[str] = Query(None), authorization: Optional[str] = Header(None)):
    raw = token or (authorization.split(" ", 1)[1].strip() if authorization and authorization.lower().startswith("bearer ") else None)
    uid = user_from_token(raw) if raw else None
    if not uid:
        raise HTTPException(401, "Unauthorized")
    owner = await db.users.find_one({"id": uid, "bike_photo": path}, {"_id": 0, "id": 1})
    if not owner:
        raise HTTPException(404, "File not found")
    try:
        content, ct = await run_in_threadpool(get_object, path)
    except Exception:
        logging.exception("file fetch failed")
        raise HTTPException(502, "Could not load file")
    return Response(content=content, media_type=ct, headers={"Cache-Control": "private, max-age=86400"})

# ---------- Emergency contacts ----------
@api.get("/emergency/contacts", response_model=List[ContactOut])
async def list_contacts(user: dict = Depends(get_current_user)):
    docs = await db.emergency_contacts.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).sort("created_at", 1).to_list(50)
    return docs

@api.post("/emergency/contacts", response_model=ContactOut)
async def add_contact(body: ContactIn, user: dict = Depends(get_current_user)):
    name, phone = body.name.strip(), body.phone.strip()
    if not name or not phone:
        raise HTTPException(400, "Name and phone are required")
    if body.kind not in ("tow", "roadside", "personal"):
        raise HTTPException(400, "Invalid contact type")
    doc = {"id": str(uuid.uuid4()), "user_id": user["id"], "name": name, "phone": phone, "kind": body.kind,
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.emergency_contacts.insert_one(doc)
    return ContactOut(id=doc["id"], name=name, phone=phone, kind=body.kind)

@api.delete("/emergency/contacts/{cid}")
async def delete_contact(cid: str, user: dict = Depends(get_current_user)):
    r = await db.emergency_contacts.delete_one({"id": cid, "user_id": user["id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}

# ---------- Service reminders ----------
SERVICE_SCHEDULE = [
    {"id": "oil", "label": "Engine oil change", "interval_km": 5000, "icon": "oil", "keywords": ["oil"]},
    {"id": "chain_lube", "label": "Chain clean & lube", "interval_km": 800, "icon": "link-variant", "keywords": ["lube", "lubric"]},
    {"id": "chain_adjust", "label": "Chain tension check", "interval_km": 1500, "icon": "cog-outline", "keywords": ["chain adjust", "tension", "slack"]},
    {"id": "tire", "label": "Tire inspection / pressure", "interval_km": 3000, "icon": "tire", "keywords": ["tire", "tyre"]},
    {"id": "brake", "label": "Brake pads & fluid", "interval_km": 10000, "icon": "car-brake-alert", "keywords": ["brake"]},
    {"id": "air_filter", "label": "Air filter", "interval_km": 12000, "icon": "air-filter", "keywords": ["air filter", "air-filter"]},
    {"id": "spark", "label": "Spark plug", "interval_km": 15000, "icon": "flash-outline", "keywords": ["spark"]},
    {"id": "coolant", "label": "Coolant flush", "interval_km": 24000, "icon": "thermometer", "keywords": ["coolant"]},
]
STATUS_RANK = {"overdue": 0, "due_soon": 1, "unknown": 2, "ok": 3}

def match_service(service_type: str) -> Optional[str]:
    s = service_type.lower()
    for svc in SERVICE_SCHEDULE:
        if any(k in s for k in svc["keywords"]):
            return svc["id"]
    return None

@api.get("/reminders")
async def reminders(user: dict = Depends(get_current_user)):
    moto = user.get("motorcycle")
    odo = int(moto.get("odometer", 0)) if moto else 0
    logs = await db.maintenance.find({"user_id": user["id"]}, {"_id": 0}).to_list(1000)
    last: Dict[str, dict] = {}
    for log in logs:
        sid = match_service(log.get("service_type", ""))
        if not sid:
            continue
        cur = last.get(sid)
        if not cur or (log.get("odometer", 0), log.get("date", "")) > (cur.get("odometer", 0), cur.get("date", "")):
            last[sid] = log
    items = []
    for svc in SERVICE_SCHEDULE:
        entry = {"id": svc["id"], "label": svc["label"], "interval_km": svc["interval_km"], "icon": svc["icon"],
                 "log_type": svc["label"]}
        lg = last.get(svc["id"])
        if not lg:
            entry.update({"status": "unknown", "last_odometer": None, "last_date": None, "due_at_km": None,
                          "remaining_km": None, "progress": 0,
                          "message": "No record yet — log your last service to start tracking"})
        else:
            last_odo = int(lg.get("odometer", 0))
            due_at = last_odo + svc["interval_km"]
            remaining = due_at - odo
            progress = max(0.0, min(1.0, (odo - last_odo) / svc["interval_km"]))
            if remaining < 0:
                status, msg = "overdue", f"Overdue by {abs(remaining):,} km"
            elif remaining <= max(int(svc["interval_km"] * 0.15), 100):
                status, msg = "due_soon", f"Due in {remaining:,} km"
            else:
                status, msg = "ok", f"Next in {remaining:,} km"
            entry.update({"status": status, "last_odometer": last_odo, "last_date": lg.get("date"),
                          "due_at_km": due_at, "remaining_km": remaining, "progress": round(progress, 3), "message": msg})
        items.append(entry)
    items.sort(key=lambda x: (STATUS_RANK[x["status"]], x["remaining_km"] if x["remaining_km"] is not None else 10**9))
    summary = {"overdue": sum(i["status"] == "overdue" for i in items),
               "due_soon": sum(i["status"] == "due_soon" for i in items),
               "tracked": sum(i["status"] != "unknown" for i in items)}
    return {"odometer": odo, "has_motorcycle": bool(moto), "summary": summary, "items": items}

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
from data import DIAG_TREE, REPAIR_GUIDES

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

@api.get("/chat/sessions")
async def chat_sessions(user: dict = Depends(get_current_user)):
    pipeline = [
        {"$match": {"user_id": user["id"]}},
        {"$sort": {"created_at": 1}},
        {"$group": {
            "_id": "$session_id",
            "first_user": {"$first": {"$cond": [{"$eq": ["$role", "user"]}, "$content", None]}},
            "messages": {"$push": {"role": "$role", "content": "$content"}},
            "last_at": {"$max": "$created_at"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"last_at": -1}},
        {"$limit": 100},
    ]
    out = []
    async for s in db.chat_messages.aggregate(pipeline):
        title = s.get("first_user") or next((m["content"] for m in s["messages"] if m["role"] == "user"), "Conversation")
        out.append({"session_id": s["_id"], "title": title[:80], "last_at": s["last_at"], "count": s["count"]})
    return out

@api.delete("/chat/sessions/{session_id}")
async def delete_chat_session(session_id: str, user: dict = Depends(get_current_user)):
    r = await db.chat_messages.delete_many({"user_id": user["id"], "session_id": session_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Session not found")
    return {"ok": True, "deleted": r.deleted_count}

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

# ---------- STT (Whisper) ----------
AUDIO_EXTS = {".m4a", ".mp4", ".webm", ".wav", ".mp3", ".mpeg", ".mpga", ".ogg"}
MAX_AUDIO_BYTES = 25 * 1024 * 1024
STT_PROMPT = "A motorcycle rider describing symptoms: engine, starter, battery, chain, brakes, clutch, coolant, tire, fuel, carburetor, spark plug."

@api.post("/transcriptions")
async def transcribe(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "STT not configured")
    data = await file.read(MAX_AUDIO_BYTES + 1)
    if not data:
        raise HTTPException(400, "Empty audio")
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "Audio must be under 25 MB")
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in AUDIO_EXTS:
        ct = (file.content_type or "").lower()
        suffix = ".webm" if "webm" in ct else ".wav" if "wav" in ct else ".m4a"
    try:
        from emergentintegrations.llm.openai import OpenAISpeechToText
    except Exception as e:
        raise HTTPException(500, f"STT library error: {e}")
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
        with open(tmp_path, "rb") as fh:
            result = await stt.transcribe(fh, model="whisper-1", prompt=STT_PROMPT)
        text = result.text if hasattr(result, "text") else (result.get("text", "") if isinstance(result, dict) else str(result))
    except Exception as e:
        logging.exception("stt failed")
        raise HTTPException(502, f"Transcription failed: {str(e)[:160]}")
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
    return {"text": (text or "").strip()}

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
