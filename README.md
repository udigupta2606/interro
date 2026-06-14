# Interro

**AI-powered voice mock interview platform.** Upload your resume, speak your answers — Interro reads every line of your resume and grills you like a real MAANG interviewer. Asks follow-ups, challenges your metrics, and gives a structured hiring report at the end.

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square) ![Groq](https://img.shields.io/badge/Groq-llama--3.3--70b-orange?style=flat-square) ![Redis](https://img.shields.io/badge/Upstash-Redis-red?style=flat-square) ![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

---

## What it does

- **Resume-aware** — Upload a PDF resume; the AI reads it before asking a single question
- **Voice-to-voice** — Speaks questions aloud, listens to your spoken answers via browser mic, no typing needed
- **Company-specific** — Different interviewer style for Google, Amazon, Meta, Microsoft, Apple, Flipkart, Deutsche Bank, or any custom company
- **Adversarial** — Challenges every metric: *"You said 40% improvement — how exactly did you measure that baseline?"*
- **Structured feedback** — Overall / Technical / Communication scores, resume claim audit, and a hire/no-hire verdict

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Framework | Next.js 14 (App Router) | Full-stack in one repo, Vercel deploy |
| LLM | Groq `llama-3.3-70b-versatile` | Free tier, OpenAI-compatible, fast inference |
| Streaming | Server-Sent Events (SSE) | Unidirectional token stream, no WebSocket overhead |
| Session state | Upstash Redis | Ephemeral sessions, 24hr TTL, serverless-compatible |
| PDF parsing | pdf-parse v2 | Server-side text extraction from resume PDFs |
| Voice STT | Web Speech API | Real-time interim transcripts, zero latency, free |
| Voice TTS | OpenAI `tts-1` (onyx) | Natural interviewer voice; falls back to browser synthesis |

---

## Architecture

```
Browser
  │
  ├── POST /api/upload    →  pdf-parse v2  →  Redis session  →  { sessionId }
  ├── POST /api/chat      →  Groq SSE stream  →  persist to Redis
  ├── POST /api/tts       →  OpenAI tts-1  →  audio/mpeg  (browser fallback)
  └── POST /api/evaluate  →  Groq JSON eval  →  EvaluationResult
```

**Voice loop (one turn):**
1. AI text streams in via SSE → rendered word by word
2. Full text sent to `/api/tts` → audio plays via `new Audio(objectURL)`
3. `audio.onended` → `SpeechRecognition.start()` activates mic
4. Interim results update transcript live → `onend` submits on silence
5. Repeat

**Session lifecycle:** `POST /api/upload` creates `session:{uuid}` in Redis with resume + company + role + empty messages[]. Every `/api/chat` reads the session, builds the system prompt, streams the response, writes updated messages back. Sessions expire after 24 hours.

---

## Local Setup

### Prerequisites
- Node.js 18+
- [Groq API key](https://console.groq.com) — free, no card needed
- [Upstash Redis](https://upstash.com) — free database
- OpenAI API key — optional, only needed for premium TTS voice

### Install

```bash
git clone https://github.com/YOUR_USERNAME/interro.git
cd interro
npm install
```

### Configure

Create `.env.local`:

```env
# Required
GROQ_API_KEY=gsk_...
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token

# Optional — enables premium TTS voice
OPENAI_API_KEY=sk-...
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Key Design Decisions

**Groq over OpenAI for chat** — Free (14,400 req/day), OpenAI-compatible (same SDK, different `baseURL`). Provider toggle is one env variable.

**SSE over WebSockets** — Token streaming is strictly server→client. SSE is HTTP-native, no protocol upgrade, works in serverless. WebSockets need persistent connections.

**Redis over PostgreSQL** — Sessions are ephemeral (24hr TTL), single-key access, need sub-ms reads. Redis is the exact right tool; no schema, no migrations.

**Web Speech API over Whisper** — Zero latency, real-time interim results, free. Whisper requires record→upload→wait (1–3s extra per turn).

---

## Limitations

- Voice mode requires Chrome or Edge (Web Speech API)
- Scanned/image PDFs will fail text extraction
- No interview history — sessions are anonymous and expire after 24 hours
- TTS degrades to browser synthesis if OpenAI credits unavailable

---

## License

MIT
