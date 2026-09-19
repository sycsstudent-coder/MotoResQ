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
- Soothing "Botanical & Ceramic" light theme (sage green #4E6A5C brand on #F7F7F5), all colors via src/theme.ts

## Tech
- Backend: FastAPI (lifespan) + Motor (MongoDB) + emergentintegrations (Claude, OpenAI TTS, Whisper STT) + Emergent Object Storage + PyJWT + bcrypt; static data in backend/data.py
- Frontend: Expo Router, React Query, expo-audio, expo-image-picker, expo-location, @react-native-vector-icons/material-design-icons
- Storage: MongoDB (users{bike_photo}, maintenance, chat_messages, emergency_contacts)

## Deferred
- Offline persistence of diagnostic tree/guides (currently online-fetched but stateless)
- Chat history restore across sessions
- Rate limiting on /transcriptions

## Test user
rider@motoresq.app / rider1234
