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
- Clean minimal light theme with ochre/amber accents; large tap targets

## Tech
- Backend: FastAPI + Motor (MongoDB) + emergentintegrations (Claude + OpenAI TTS) + PyJWT + bcrypt
- Frontend: Expo Router, React Query, expo-audio, @react-native-vector-icons/material-design-icons
- Storage: MongoDB (users, maintenance, chat_messages)

## Deferred
- Whisper voice input in chat (STT)
- Offline persistence of diagnostic tree/guides (currently online-fetched but stateless)
- Chat history restore across sessions

## Test user
rider@motoresq.app / rider1234
