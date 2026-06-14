# Interro

**AI-powered voice mock interview platform.** Upload your resume, speak your answers — Interro reads every line of your resume and grills you like a real MAANG interviewer. Asks follow-ups, challenges your metrics, and gives a structured hiring report at the end.

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square) ![Groq](https://img.shields.io/badge/Groq-llama--3.3--70b-orange?style=flat-square) ![ElevenLabs](https://img.shields.io/badge/ElevenLabs-TTS-purple?style=flat-square) ![Redis](https://img.shields.io/badge/Upstash-Redis-red?style=flat-square) ![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

---

## What it does

- **Resume-aware** — Upload a PDF resume; the AI reads it before asking a single question
- **Voice-to-voice** — Speaks questions aloud (ElevenLabs), listens to spoken answers via browser mic, no typing needed
- **Company-specific** — Different interviewer style for Google, Amazon, Meta, Microsoft, Apple, Flipkart, Deutsche Bank, or any custom company
- **Adversarial** — Challenges every metric: *"You said 40% improvement — how exactly did you measure that baseline?"*
- **Structured feedback** — Overall / Technical / Communication scores, resume claim audit, and a hire/no-hire verdict

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Framework | Next.js 14 (App Router) | Full-stack in one repo, Vercel deploy |
| LLM | Groq `llama-3.3-70b-versatile` | Free tier, OpenAI-compatible, fast LPU inference |
| Streaming | Server-Sent Events (SSE) | Unidirectional token stream, no WebSocket overhead |
| Session state | Upstash Redis | Ephemeral sessions, 24hr TTL, serverless-compatible |
| PDF parsing | pdf-parse v2 | Server-side text extraction from resume PDFs |
| Voice STT | Web Speech API | Real-time interim transcripts, zero latency, free |
| Voice TTS | ElevenLabs `eleven_turbo_v2_5` | Human-sounding AI voice, free tier, low latency |
| TTS fallback | OpenAI `tts-1` → browser `speechSynthesis` | Graceful degradation if ElevenLabs unavailable |

---

## Architecture

```
Browser
  │
  ├── POST /api/upload    →  pdf-parse v2  →  Redis session  →  { sessionId }
  ├── POST /api/chat      →  Groq SSE stream  →  persist to Redis
  ├── POST /api/tts       →  ElevenLabs → OpenAI tts-1 → 503 (browser fallback)
  └── POST /api/evaluate  →  Groq JSON eval  →  EvaluationResult
```

**Voice loop (one turn):**
1. AI text streams via SSE → rendered word by word
2. Full text POSTed to `/api/tts` → ElevenLabs returns `audio/mpeg`
3. Audio plays via `new Audio(objectURL)`, awaits `onended`
4. `SpeechRecognition.start()` activates mic automatically
5. Interim results update live transcript → `onend` submits on silence
6. Repeat

**TTS priority chain:**
1. **ElevenLabs** (`eleven_turbo_v2_5`, Adam voice) — human-sounding, free 10k chars/month
2. **OpenAI TTS** (`tts-1`, onyx voice) — if ElevenLabs unavailable
3. **Browser `speechSynthesis`** — zero-cost fallback, handled client-side

---

## Local Setup

### Prerequisites
- Node.js 18+
- [Groq API key](https://console.groq.com) — free, no card
- [Upstash Redis](https://upstash.com) — free database
- [ElevenLabs API key](https://elevenlabs.io) — free, 10k chars/month
- OpenAI API key — optional, TTS fallback only

### Install

```bash
git clone https://github.com/udigupta2606/interro.git
cd interro
npm install
```

### Configure

Create `.env.local`:

```env
# LLM — required
GROQ_API_KEY=gsk_...

# Session storage — required
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token

# TTS — at least one recommended
ELEVENLABS_API_KEY=your_key   # primary, free tier
OPENAI_API_KEY=sk-...         # fallback TTS only
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Key Design Decisions

**Groq over OpenAI for chat** — Free (14,400 req/day), OpenAI-compatible (same SDK, different `baseURL`). Provider is a single env variable toggle.

**ElevenLabs over OpenAI TTS** — Free tier (10k chars/month), sounds genuinely human. OpenAI TTS requires paid credits. `eleven_turbo_v2_5` has lower latency than the standard model.

**SSE over WebSockets** — Token streaming is strictly server→client. SSE is HTTP-native, no protocol upgrade, works in Next.js serverless functions.

**Redis over PostgreSQL** — Sessions are ephemeral (24hr TTL), single-key access, sub-ms reads. No schema, no migrations.

**Web Speech API over Whisper** — Zero latency, real-time interim results, free. Whisper requires record→upload→wait (1–3s extra per turn).

---

## Limitations

- Voice mode requires Chrome or Edge (Web Speech API)
- Scanned/image PDFs will fail text extraction
- No interview history — sessions expire after 24 hours
- ElevenLabs free tier: 10k chars/month (~30–40 interview turns)

---

## License

MIT
