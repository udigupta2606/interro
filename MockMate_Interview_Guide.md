# Interro — Complete Interview Guide (v2)

> Every architectural decision, trade-off, alternative, and the full STAR story.
> Use this to answer **any** question an interviewer asks about this project.

---

## 1. STAR Format — "Tell me about Interro"

**Situation**
Most mock interview tools are generic — they ask the same pre-set questions regardless of who you are. A candidate who spent six months building a distributed payment system gets asked "reverse a linked list." There was no tool that read your actual resume and interrogated you the way a real MAANG interviewer would — challenging your specific metrics, drilling into your exact decisions, and giving structured feedback. And every existing tool was text-only, even though real interviews are spoken conversations.

**Task**
Build a full-stack AI mock interview platform where a candidate uploads their resume, selects a target company and role, and is put into a fully voice-driven, real-time interview with an AI that has read their resume — challenging everything in it, speaking questions aloud, listening to spoken answers, and generating a structured hiring report at the end.

**Action**

*Resume Ingestion Pipeline*
Built a server-side PDF parsing route using `pdf-parse` v2 on Node.js. The v2 library switched from a function-based to a class-based API (`new PDFParse({ data: buffer })`), which I discovered and adapted to mid-build. Text is extracted, capped at 8,000 characters to control LLM context cost, and stored in Upstash Redis under a UUID session key with a 24-hour TTL. Used dynamic `import()` to avoid Next.js module bundling conflicts with `pdf-parse`'s native `fs` usage.

*Stateful Session Architecture*
Every interview is a session stored in Upstash Redis. The session holds: resume text, target company, target role, and the full conversation history. Every API request is stateless at the HTTP layer — the session ID travels as a body parameter, and state is reconstructed from Redis on each call. This mirrors how production stateless microservices handle user sessions with sub-millisecond Redis reads.

*Real-Time SSE Streaming*
Rather than waiting for the full AI response (3–8 seconds), implemented Server-Sent Events over the LLM streaming API. The backend opens a `ReadableStream`, enumerates over the async iterator, and pushes `data: {"text": "..."}` events to the client. The frontend reads these with a `ReadableStream` reader, appending tokens in real time — giving the interviewer a human typing feel with sub-500ms time-to-first-token.

*LLM Provider Abstraction (Groq + OpenAI)*
Designed the LLM layer to be provider-agnostic. The app runs on Groq (free tier, `llama-3.3-70b-versatile`) using the OpenAI-compatible API — same SDK, different `baseURL`. Can switch to GPT-4o-mini by changing one environment variable. This is a portable LLM integration that isn't locked to a single provider.

*Voice-to-Voice Interview Pipeline*
The most technically interesting layer. Built a three-stage voice loop:
1. **AI → Speech (TTS):** After the SSE stream finishes, the full AI response is sent to `/api/tts`. The route tries providers in order: ElevenLabs (`eleven_turbo_v2_5`, Adam voice) → OpenAI `tts-1` (onyx) → returns 503 for client-side browser fallback. Audio plays via `new Audio(objectURL)`.
2. **Silence detection → mic handoff:** Once TTS audio ends (`audio.onended`), the mic activates automatically — no user action needed.
3. **Speech → Text (STT):** Browser `SpeechRecognition` API with `continuous: true` and `interimResults: true`. Interim results update the live transcript in real time, finals accumulate in a ref. `onend` fires on silence and submits the answer automatically.

*Company-Specific Prompt Engineering*
A structured system prompt transforms the LLM into a company-specific interviewer. Each company has a distinct interrogation style: Amazon enforces Leadership Principles and STAR format, Google probes 3 levels deep on first-principles thinking, Meta demands metrics for every claim, Deutsche Bank asks about audit trails and transactional consistency. Uses partial string matching so custom company names ("Swiggy", "Razorpay") get sensible fallback styles.

*Evaluation Engine*
After the interview, the full transcript is sent to the LLM with a structured JSON-mode prompt. Scores technical depth, communication clarity, and audits each resume claim as "defended" or "challenged." Uses `response_format: { type: "json_object" }` + temperature 0.3 for deterministic output.

**Result**
A fully voice-driven mock interview platform that reads your resume, speaks questions in a human-sounding AI voice (ElevenLabs), listens to spoken answers via the browser mic, and produces a structured hiring report — entirely free to run using Groq + ElevenLabs free tiers.

---

## 2. Architecture Overview

```
User Browser
    │
    ├── GET  /              → Landing page (resume upload + company/role selector)
    ├── POST /api/upload    → pdf-parse v2 → Redis session → return sessionId
    ├── POST /api/chat      → SSE stream (Groq/OpenAI) → persist messages to Redis
    ├── POST /api/tts       → ElevenLabs → OpenAI tts-1 → 503 (browser fallback)
    ├── POST /api/evaluate  → Full transcript → JSON evaluation (Groq/OpenAI)
    │
    ├── GET  /interview     → Voice+text interview (SSE consumer + Web Speech API)
    └── GET  /evaluation    → Hiring report dashboard
```

**Voice loop lifecycle (single turn):**
1. AI finishes streaming text via SSE
2. Frontend POSTs full AI text to `/api/tts` → gets `audio/mpeg` blob back
3. Creates `objectURL`, plays via `new Audio()`, waits for `onended`
4. `SpeechRecognition.start()` activates mic
5. Interim results update live transcript on screen
6. `onend` fires (silence timeout) → accumulated transcript sent to `/api/chat`
7. Repeat

**Chat request lifecycle:**
1. Frontend sends `POST /api/chat` with `{ sessionId, messages[] }`
2. Route fetches session from Redis → gets resume + company + role
3. Builds system prompt with resume context injected
4. Calls `openai.chat.completions.create({ stream: true })` (Groq or OpenAI endpoint)
5. Pipes token chunks as `data: {"text":"..."}` SSE events
6. After stream ends, saves updated messages array back to Redis
7. Frontend receives `data: [DONE]`, triggers TTS

---

## 3. Technology Decisions — Why/Why-Not

### Groq vs. OpenAI for Chat

**Chose Groq (primary) because:**
- Completely free tier — 14,400 requests/day on `llama-3.3-70b-versatile`
- OpenAI-compatible REST API — same SDK, same request format, different `baseURL`
- Faster inference than GPT-4o-mini (Groq uses custom LPU hardware)
- No billing required to start

**Implementation:** `new OpenAI({ apiKey: GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" })` — zero other changes.

**Why keep OpenAI as fallback?**
- If Groq key is absent, falls back to OpenAI automatically — one env variable controls the switch
- OpenAI `response_format: { type: "json_object" }` is more battle-tested for the eval engine

**Trade-off accepted:** Groq's Llama model occasionally breaks character more than GPT-4o-mini. Mitigated with strict behavioral rules in the system prompt.

---

### ElevenLabs vs. OpenAI TTS vs. Browser speechSynthesis

**Chose ElevenLabs as primary because:**
- Free tier: 10,000 characters/month — covers ~30–40 interview turns
- Sounds genuinely human — critical for the "realistic interviewer" UX
- `eleven_turbo_v2_5` model: optimised for low latency (faster first-audio-byte than standard)
- Adam voice (`pNInz6obpgDQGcFmaJgB`): professional, calm, clearly AI but natural — right tone for an interviewer
- Simple REST API — no SDK needed, just a POST with `xi-api-key` header

**Why not OpenAI TTS as primary?**
- Requires paid credits — free tier is exhausted immediately
- `onyx` voice quality is excellent but not meaningfully better than ElevenLabs for interview Q&A
- Kept as secondary fallback since the key may already be configured

**Why not browser `speechSynthesis` as primary?**
- Sounds robotic — breaks the "realistic interviewer" illusion completely
- No control over voice selection across OS/browser combinations
- Kept as last-resort fallback: if both ElevenLabs and OpenAI fail, the interview still continues

**TTS priority chain in `/api/tts`:**
```
ELEVENLABS_API_KEY present? → try ElevenLabs → on success return audio/mpeg
                             → on failure fall through
OPENAI_API_KEY present?     → try OpenAI tts-1 → on success return audio/mpeg
                             → on failure fall through
No provider available       → return 503
Client receives 503         → use window.speechSynthesis (browser fallback)
```

---

### Web Speech API vs. Whisper vs. Deepgram for STT

**Chose Web Speech API because:**
- Zero cost, zero latency — runs in the browser using OS's built-in ASR
- Real-time interim results (word-by-word as you speak) — no other option gives this free
- `continuous: true` keeps the mic open until silence — natural pause-based turn-taking
- No audio data leaves the browser for STT (privacy-preserving)

**Why not Whisper (OpenAI)?**
- Requires recording a complete audio chunk, uploading, waiting for response — 1–3s latency per turn
- No interim results — user sees nothing while speaking
- Costs tokens per request

**Why not Deepgram/AssemblyAI?**
- Both require API keys and backend proxy routes
- Web Speech API gives equivalent quality for English with zero infrastructure
- Right choice if: needed non-English support or mobile browser compatibility

**Limitation:** Web Speech API requires Chrome or Edge. Firefox/Safari unsupported.

---

### Next.js 14 (App Router) vs. Express + React

**Chose Next.js because:**
- API routes and frontend in one repo, one deploy
- `serverExternalPackages: ['pdf-parse']` config handles Node.js-native modules cleanly
- One-command Vercel deploy
- File-based routing makes the project structure self-documenting

---

### SSE vs. WebSockets

**Chose SSE because:**
- Communication is strictly unidirectional (server → client token stream)
- HTTP-native, no protocol upgrade, works in Next.js serverless functions
- WebSockets require persistent connections — don't work well serverless

---

### Upstash Redis vs. PostgreSQL vs. In-Memory

**Chose Upstash Redis because:**
- Sessions are ephemeral (24-hour TTL) — Redis native key expiry is perfect
- Sub-millisecond reads per API call
- Serverless REST API — no connection pooling, works in Vercel edge functions
- Free tier: 10,000 req/day

**Why not PostgreSQL?** Overengineered for session state. **Why not in-memory Map?** Next.js API routes are stateless serverless functions — in-memory state doesn't survive between invocations.

---

### pdf-parse v2 API Change

**Problem:** `pdf-parse` v2 changed from a callable function to a class-based API mid-build.

**Old (v1):** `const { text } = await pdfParse(buffer)`
**New (v2):** `const parser = new PDFParse({ data: buffer }); const { text } = await parser.getText()`

Debugged by inspecting the package ESM exports (`dist/pdf-parse/esm/index.d.ts`), identified the `PDFParse` class, confirmed `getText()` returns `TextResult` with a `.text` string. Fixed in ~10 minutes by reading source instead of guessing.

---

## 4. System Prompt Design — Why These Rules?

**"One question at a time"** — Real interviewers ask one question and listen. Forces the AI to simulate real pressure.

**"Challenge every metric"** — Most common MAANG failure mode: claiming impact without defending it. The prompt instructs the AI to push back on any number, percentage, or claim.

**"3–4 sentence max responses"** — Prevents the AI from over-explaining or giving away answers. Real interviewers are terse.

**Company-specific styles** — Amazon LPs are the official interview rubric. Google's "three levels deep" mirrors their actual culture. Deutsche Bank audit questions reflect real finance interview concerns.

**Partial matching for custom companies** — `company.toLowerCase().includes(key.toLowerCase())` so "Google (L5 SWE)" still gets Google style, and "Swiggy" falls back gracefully.

---

## 5. What Could Be Optimized (and Why We Didn't)

**ElevenLabs free tier limit** — 10k chars/month gets exhausted after ~30–40 turns. Production would need a paid plan or per-user quota tracking via Redis.

**Rate limiting on `/api/chat`** — Should add Redis-based rate limiting. Not added for a solo demo.

**Streaming the evaluation** — Eval endpoint is synchronous (10–15s spinner). Could stream it. Deferred — users expect to wait for a "complete" evaluation.

**Caching evaluation results** — Calling `/api/evaluate` twice calls the LLM twice. Could cache in Redis. Not worth complexity for a demo.

**Voice Activity Detection (VAD)** — Current approach uses browser silence detection (~1.5s). A proper VAD model (Silero) would give more control over turn-taking timing. Overkill for this use case.

**User accounts / interview history** — Sessions are anonymous, expire after 24 hours. Auth + permanent store is a natural v2 feature.

---

## 6. Common Interview Questions

**Q: Walk me through the SSE implementation.**
A: `/api/chat` calls the LLM with `stream: true`, iterates with `for await`, extracts `chunk.choices[0]?.delta?.content`, encodes as `data: {"text":"..."}\n\n` events, enqueues into a `ReadableStream`. Response header: `Content-Type: text/event-stream`. Frontend calls `res.body.getReader()`, loops over `.read()`, splits by newlines, parses JSON payloads, appends tokens to the last message in state. `data: [DONE]` stops the loop.

**Q: How does the voice loop work technically?**
A: Three stages. TTS: after SSE ends, POST the full AI text to `/api/tts`. Route tries ElevenLabs first (`eleven_turbo_v2_5`, Adam voice) — if that fails, tries OpenAI `tts-1` — if that fails, returns 503 and the client falls back to `window.speechSynthesis`. Frontend creates an `objectURL` from the audio blob and plays it with `new Audio()`, awaiting `onended`. STT: `new SpeechRecognition()` with `continuous: true` and `interimResults: true` — interim results update the screen live, finals accumulate in a ref. `onend` fires on ~1.5s silence, submits the accumulated transcript to `/api/chat`.

**Q: Why ElevenLabs over OpenAI TTS?**
A: ElevenLabs has a free tier (10k chars/month) whereas OpenAI TTS requires paid credits. The `eleven_turbo_v2_5` model has lower latency than `tts-1` and the Adam voice sounds natural for an interviewer context. I designed the TTS route as a priority chain — ElevenLabs → OpenAI → browser — so the app degrades gracefully regardless of which keys are available.

**Q: Why Groq instead of OpenAI?**
A: Groq is free (14,400 req/day), fast (LPU hardware), and OpenAI-compatible — same SDK, different `baseURL`. One env variable toggles between them. The trade-off is Groq's Llama occasionally breaks character; I mitigate this with strict behavioral rules in the system prompt.

**Q: How did you handle the pdf-parse v2 breaking change?**
A: Got `TypeError: pdfParse is not a function` in server logs, identified it as a library version issue, read the ESM type definitions to find the new class-based API, updated the import. Took ~10 minutes. The key skill was reading package source instead of guessing.

**Q: What happens if TTS fails?**
A: ElevenLabs fails → tries OpenAI TTS → if both fail, returns 503. The frontend catches the non-ok response and falls back to `window.speechSynthesis`. The interview continues uninterrupted with a slightly more robotic voice — no error shown, no broken state.

**Q: How does the evaluation JSON parsing work reliably?**
A: `response_format: { type: "json_object" }` guarantees valid JSON output. Combined with temperature 0.3 and explicit schema in the prompt, output is deterministic. `JSON.parse` wrapped in try/catch as last resort.

**Q: How would you scale this to 10,000 concurrent users?**
A: Architecture is already stateless — Vercel scales automatically. Bottlenecks: (1) Upstash Redis — upgrade tier; (2) Groq rate limits — implement a request queue in Redis; (3) ElevenLabs — free tier exhausts quickly, need paid plan or per-user quota tracking.

**Q: What's the biggest limitation?**
A: Voice mode only works in Chrome/Edge — Web Speech API has no Firefox/Safari support. ElevenLabs free tier is 10k chars/month which limits demo use. And the AI has no memory across sessions — multi-round interview loops aren't possible yet.

---

## 7. Resume Readiness Checklist

### Done ✓
- Full-stack app working end-to-end (Groq + ElevenLabs + Redis)
- Voice-to-voice pipeline with 3-tier TTS fallback
- PDF ingestion with v2 API adaptation
- SSE streaming chat
- Company-specific prompt engineering (8 companies + custom)
- Evaluation engine with JSON scoring
- Ultra-luxury UI across all 3 pages
- LLM provider abstraction (Groq/OpenAI toggle)
- README + Interview Guide updated

### Still needed
1. Push to GitHub (public repo: `udigupta2606/interro`)
2. Deploy on Vercel → get live URL
3. Update resume bullets with real links

---

## 8. Resume Bullets

**Interro — AI Voice Mock Interview Platform** | [GitHub](https://github.com/udigupta2606/interro) | [Live Demo](YOUR_VERCEL_URL)

- Built a full-stack AI voice interview platform using **Next.js 14**, **Groq (llama-3.3-70b)**, and **Upstash Redis** — candidates upload a resume, speak their answers, and receive a structured hiring report; the AI reads every resume line and challenges every metric in real time.
- Implemented a **voice-to-voice pipeline**: browser `SpeechRecognition` for real-time STT with interim transcript display; **ElevenLabs TTS** (`eleven_turbo_v2_5`) as primary with OpenAI `tts-1` and browser `speechSynthesis` as graceful fallbacks; hands-free mic activation via `audio.onended`.
- Designed **provider-agnostic LLM integration** — same OpenAI SDK routes to Groq (free, 14K req/day) or OpenAI via a single env variable; custom **SSE streaming** with `ReadableStream` achieving sub-500ms time-to-first-token across both providers.
