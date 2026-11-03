# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A multi-tenant SaaS platform for deploying conversational AI agents (chat + voice) via embeddable widgets. The monorepo has three independent packages: `backend/` (Express 5 API), `frontend/` (Vite + React dashboard), and `widget/` (Preact embeddable chat widget, built to `widget/dist/`).

Reference: `charge.md` (full spec in French) and `ROADMAP.md` (phased implementation plan). Current phase per ROADMAP: Phase 3 (voice pipeline, browser-based) in progress; Phases 1, 2, 4 done.

## Dev commands

**Backend** (run from `backend/`):
```bash
npm run dev          # nodemon + auto-restart, port 4000
npm run db:generate  # prisma generate (after schema changes)
npm run db:migrate   # Prisma migration (dev)
npm run db:push      # push schema without migration history
npm run db:seed      # seed initial data
npm run db:studio    # Prisma Studio GUI
```

**Frontend** (run from `frontend/`):
```bash
npm run dev          # Vite dev server, port 5173 (proxies /api → localhost:4000)
npm run build        # production build → dist/
npm run lint         # ESLint
npm run preview      # serve the production build
```

**Widget** (run from `widget/`): `npm run dev` / `npm run build` / `npm run preview` — Preact + Vite, no dev proxy (calls the backend API directly; set the API base URL in `widget/src/api.js`).

No tests exist yet (Vitest/Playwright planned for Phase 8).

## Stack — actual (not spec)

| Layer | What's actually used |
|---|---|
| Language | Plain JavaScript ESM (`"type": "module"`) — no TypeScript yet |
| Backend | Express 5, Prisma 7 ORM, Neon PostgreSQL |
| Frontend | React 19, Vite 8, TanStack Query 5, Zustand 5, Tailwind v4, React Router v7, Axios |
| LLM | Gemini Flash (primary) + Anthropic (`@anthropic-ai/sdk` also installed), with model cascade and key rotation |
| ASR | Groq Whisper large-v3 (`stt.service.js`) |
| TTS | MS Edge Neural TTS — free, no API key (`tts.service.js`) |
| Auth | JWT Bearer tokens (`jsonwebtoken`) |
| Validation | `express-validator` |
| Crypto | AES-256-GCM for API keys stored in DB (`crypto.js`) |
| Email | Resend (`resend`, `RESEND_API_KEY`) — `email.service.js` |
| Uploads | `multer` |

The spec mentions ElevenLabs, Drizzle, tRPC, shadcn/ui — **none of these are implemented** (Claude SDK is installed but the LLM path runs on Gemini).

## Architecture

### Backend structure
```
src/
  app.js              — Express app factory (CORS, Helmet, routes)
  server.js           — entry point (listen)
  controllers/        — request handlers, one file per route group
                      (auth, agents, conversations, chat, voice, llm-keys,
                       tenant, services, appointments, public)
  routes/             — Express routers, wire controllers + auth middleware
  services/           — business logic
    llm.service.js    — Gemini streaming with retry + key rotation
    conversation.compact.js — async compaction of long conversations
    tts.service.js    — MS Edge TTS → MP3 buffer
    stt.service.js    — Groq Whisper transcription
    voice/…           — browser voice pipeline (Web Speech API côté client)
    appointment.service.js / availability.service.js — bookings + free slots
    email.service.js  — transactional email via Resend
    crypto.js         — AES-256-GCM encrypt/decrypt for LLM keys
    db.js             — Prisma client singleton
  middleware/
    auth.js           — requireAuth (JWT), requireRole
    error.js          — RFC 9457 error handler
```

API surface (mounted in `app.js`): `/api/v1/health`, `/api/v1/auth`, `/api/v1/agents`, `/api/v1/conversations`, `/api/v1/chat`, `/api/v1/voice`, `/api/v1/llm-keys`, `/api/v1/tenant/profile`, `/api/v1/services`, `/api/v1/appointments`, and `/api/v1/public` (unauthenticated widget endpoints, mounted **before** the global CORS so it can set its own headers).

### Data model
8 models: `Tenant, User, Agent, Conversation, Message, Service, Appointment, LlmApiKey`. Multi-tenancy via `tenantId` on every row (no Postgres RLS yet — Phase 5). Cascade deletes: `Tenant → Agent → Conversation → Message`.

`LlmApiKey` stores encrypted API keys (AES-256-GCM, `LLM_KEY_SECRET` env var). Keys are loaded at startup, cached 5 min, rotated round-robin on 429/503.

### Chat flow (SSE streaming)
`POST /api/v1/chat` → `chatHandler` → `streamGemini` → SSE events:
- `event: token` — text chunk
- `event: done` — final `{ messageId, tokens }`
- `event: error` — on failure

After the response is sent, `maybeCompact(conversationId)` runs fire-and-forget: when cumulative tokens > 15 000, old messages are summarized by Gemini Flash Lite and replaced with a `[Résumé]` system message. The summary is injected into the system prompt on subsequent turns via `buildSystemPrompt`.

### LLM retry strategy (`llm.service.js`)
For each API key: try each model in `MODELS` array up to 3 times (300/600/1 200 ms delays) on 429/503. If all models fail on a key, rotate to the next key. Retry happens **before** opening SSE headers to avoid partial responses.

### Auth
`requireAuth` validates `Authorization: Bearer <token>`, attaches `req.user` (`{ id, tenantId, role }`). `requireRole(...roles)` guards admin-only routes. `tenantId` is always taken from `req.user` — never from request body.

### Frontend structure
```
src/
  api/            — Axios wrappers per resource (auth, agents, chat, voice, appointments, services, company, conversations, llm-keys)
  hooks/          — TanStack Query hooks (useAgents, useChat, useConversations, useVoice, useSpeechQueue, useAppointments, useServices, useCompanyProfile, useAuth, useLlmKeys…)
  store/          — Zustand stores (auth.store.js — persisted to localStorage)
  pages/          — Route-level components (Login, Register, Dashboard, Agents, AgentDetail, Conversations, ConversationDetail, Appointments, Services, CompanyProfile, LlmKeys)
  components/     — Shared components (AuthGuard, ui/)
  layouts/        — DashboardLayout (sidebar + outlet)
  lib/            — query-client.js singleton
```

Vite proxies all `/api` requests to `http://localhost:4000` — no CORS issues in dev. Both Vite dev servers use `host: true` + `allowedHosts: true` + `proxy.ws: true`, so the dashboard (`https://<IP_LAN>:5173`) and the widget demo (`http://<IP_LAN>:5174`) work from a phone on the same Wi-Fi, including the Live voice WebSocket (`/api/v1/live`) which rides the same-origin proxy (wss). The browser mic requires a secure context → use the **https** frontend URL on the phone and accept the self-signed certificate.

Backend CORS accepts a comma-separated allowlist: `FRONTEND_URL` plus optional `FRONTEND_URLS` (e.g. `FRONTEND_URLS=https://localhost:5173,https://192.168.1.42:5173`) in `backend/.env`.

### Widget structure
`widget/src/` — Preact app (`Widget.jsx`, `main.jsx`, `api.js`, `styles.js`), built with Vite to `widget/dist/` and embedded on client sites via a script tag. Chat mode is live (Phase 4); voice mode is planned (Phase 3 reuse).

## Environment variables

Backend requires `backend/.env`:
```
DATABASE_URL=        # Neon PostgreSQL connection string
PORT=4000
NODE_ENV=development
FRONTEND_URL=https://localhost:5173  # CORS origin for the dashboard (https — basicSsl)
FRONTEND_URLS=                      # optional extra origins, comma-separated (phone LAN IP…)
JWT_SECRET=          # arbitrary secret, keep strong in prod
GEMINI_API_KEY=      # Google AI Studio key (GEMINI_API_KEY_* = extra rotation keys)
ANTHROPIC_API_KEY=   # optional, SDK installed
LLM_KEY_SECRET=      # 32-byte hex string for AES-256-GCM
GROQ_API_KEY=        # gsk_... format
RESEND_API_KEY=      # transactional email
```

## Key files

- `charge.md` — full technical specification (French), authoritative for architecture decisions
- `ROADMAP.md` — phased plan; check current phase before implementing new features
- `backend/prisma/schema.prisma` — source of truth for the data model
- `backend/src/services/llm.service.js` — LLM routing, retry, key rotation, system prompt builder
- `backend/src/services/conversation.compact.js` — conversation compaction logic
