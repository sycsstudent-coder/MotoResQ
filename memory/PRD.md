# MotoResQ — Product Requirements Document

## What it is
MotoResQ is a mobile app that helps motorcycle riders diagnose problems, follow step-by-step repair guides, keep a maintenance log, and chat with an AI mechanic (Claude Sonnet 4.6). Voice-out on AI answers via OpenAI TTS.

## v1 Features (shipped)
- Email/password auth (JWT, bcrypt) with signup, login, session persistence
- Motorcycle profile (make/model/year/odometer/nickname)
- Diagnostics: 6 categories (Won't Start, Overheating, Brakes, Flat Tire, Chain, Electrical) → guided Q&A → cause + severity + repair guide link
- Repair guides library: 12 hands-on guides with tools, safety warnings, numbered steps
- Maintenance log: add / list / delete services with cost + odometer + notes
- AI chat with Claude Sonnet 4.6 (Emergent Universal Key), motorcycle-aware system prompt, TTS "Speak" on every reply
- Voice input: mic button in chat → expo-audio recording → OpenAI Whisper STT (`POST /api/transcriptions`) fills the input
- Bike photo: pick/take photo → Emergent Object Storage (`POST /api/motorcycle/photo`, served via `GET /api/files/{path}?token=`), shown on Home card
- Emergency SOS (`/sos`): call 112, find & share GPS location, rescue contacts CRUD (tow / roadside / personal) with call + SMS
- Service reminders (`/reminders`): 8 km-based intervals computed from maintenance log + odometer (overdue / due soon / on track), odometer quick-update, "Log service" prefill
- Soothing theme replaced by **Black & Red** signature dark theme (default) with a white & red light variant; toggle in More > Appearance (persisted)
- Chat history: past AI conversations listed (`/chat-history`), reopen with full transcript, new-chat button, delete session
- Offline guides & diagnostics: network-first cache in AsyncStorage (prefetched on launch); rule engine also runs on-device when `/diagnostic/analyze` is unreachable; "Offline — showing saved copy" badge
- Voice Diagnose: mic or typed symptom on Diagnose tab → keyword match → jumps to the right category; no match → "Ask AI" with prefilled chat

## Tech
- Backend: FastAPI (lifespan) + Motor (MongoDB) + emergentintegrations (Claude, OpenAI TTS, Whisper STT) + Emergent Object Storage + PyJWT + bcrypt; static data in backend/data.py
- Frontend: Expo Router, React Query, expo-audio, expo-image-picker, expo-location, AsyncStorage, @react-native-vector-icons/material-design-icons
- Storage: MongoDB (users{bike_photo}, maintenance, chat_messages, emergency_contacts)

## Deferred
- Rate limiting on /transcriptions
- Cache TTL / manual "re-sync offline content" button

## Test user
rider@motoresq.app / rider1234
