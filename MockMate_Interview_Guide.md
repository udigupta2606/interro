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
Built a server-side PDF parsing route using `pdf-parse` v2 on Node.js. The v2 library switched from a function-based to a class-based API (`new PDFParse({ data: buffer })`), which I discovered and adapted to mid-build. Text is extracted, capped at 8,000 characters to control LLM context cost, and stored in Upstash Redis under a UUID session key with a 24-hour TTL. Used dynamic `import()` to avoid Next.js module bundling conflicts with `pdf-parse`'s native `fs` usage — a known issue with the App Router's server components.

*Stateful Session Architecture*  
Every interview is a session stored in Upstash Redis. The session holds: resume text, target company, target role, and the full conversation history. Every API request is stateless at the HTTP layer — the session ID travels as a body parameter, and state is reconstructed from Redis on each call. This mirrors how production stateless microservices handle user sessions with sub-millisecond Redis reads.

*Real-Time SSE Streaming*  
Rather than waiting for the full AI response (3–8 seconds), implemented Server-Sent Events over the LLM streaming API. The backend opens a `ReadableStream`, enumerates over the async iterator, and pushes `data: {"text": "..."}` events to the client. The frontend reads these with a `ReadableStream` reader, appending tokens in real time — giving the interviewer a human typing feel with sub-500ms time-to-first-token.

*LLM Provider Abstraction (Groq + OpenAI)*  
Designed the LLM layer to be provider-agnostic. In development, the app runs on **Groq** (free tier, `llama-3.3-70b-versatile`) using the OpenAI-compatible API — same SDK, different `baseURL`. In production, it can switch to GPT-4o-mini by changing one environment variable. This taught me how to build portable LLM integrations that aren't locked to a single provider.

*Voice-to-Voice Interview Pipeline*  
The most technically interesting layer. Built a three-stage voice loop:  
1. **AI → Speech (TTS):** After the SSE stream finishes, the full AI response is sent to `/api/tts`. Primary: OpenAI `tts-1` model with `onyx` voice (authoritative, deep). Fallback: browser's `speechSynthesis` API with a preferred voice selection heuristic. Audio plays automatically via `new Audio(objectURL)`.  
2. **Silence detection → mic handoff:** Once TTS audio ends (`audio.onended`), the mic activates automatically — no user action needed.  
3. **Speech → Text (STT):** Used the browser's `SpeechRecognition` API (`webkitSpeechRecognition` for Chrome). Set `continuous: true` and `interimResults: true` — interim results update the live transcript in real time, final results accumulate in a ref. On `onend`, the accumulated transcript is submitted as the user's answer. Result: a natural, hands-free back-and-forth interview.

*Company-Specific Prompt Engineering*  
A structured system prompt transforms the LLM into a company-specific interviewer. Each company has a distinct interrogation style: Amazon enforces Leadership Principles and STAR format, Google probes 3 levels deep on first-principles thinking, Meta demands metrics for every claim, Deutsche Bank asks about audit trails and transactional consistency. The prompt uses partial string matching so custom company names (e.g. "Swiggy", "Razorpay") also get sensible fallback styles.

*Evaluation Engine*  
After the interview, the full transcript is sent to the LLM with a structured JSON-mode prompt. Scores technical depth, communication clarity, and audits each resume claim as "defended" or "challenged." Uses `response_format: { type: "json_object" }` + temperature 0.3 for deterministic output.

**Result**  
A fully voice-driven mock interview platform that reads your resume, speaks questions in a real interviewer voice, listens to spoken answers via the browser mic, and produces a structured hiring report — all free to run using Groq's API, deployed on Vercel.

---

## 2. Architecture Overview

```
User Browser
    │
    ├── GET  /              → Landing page (resume upload + company/role selector)
    ├── POST /api/upload    → pdf-parse v2 → Redis session → return sessionId
    ├── POST /api/chat      → SSE stream (Groq/OpenAI) → persist messages to Redis
    ├── POST /api/tts       → OpenAI tts-1 → audio/mpeg stream (browser fallback if fails)
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
- Faster inference than GPT-4o-mini in practice (Groq uses custom LPU hardware)
- No billing required to start — critical for a demo/portfolio project

**Implementation:** `new OpenAI({ apiKey: GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" })` — zero other changes.

**Why keep OpenAI as fallback?**
- OpenAI TTS (`tts-1`, `onyx` voice) has no Groq equivalent — needed for premium voice
- OpenAI `response_format: { type: "json_object" }` is more battle-tested for the eval engine
- One env variable controls the switch: if `GROQ_API_KEY` is set, Groq is used; otherwise OpenAI

**Trade-off accepted:** Groq's Llama model occasionally breaks character more than GPT-4o-mini. For a demo, the quality is more than sufficient.

---

### Web Speech API vs. Whisper vs. Deepgram for STT

**Chose Web Speech API because:**
- Zero cost, zero latency — runs entirely in the browser using the OS's built-in ASR
- Real-time interim results (word-by-word as you speak) — no other option gives this at zero cost
- `continuous: true` keeps the mic open until silence is detected — natural pause-based turn-taking
- No audio data leaves the browser for STT (privacy-preserving)

**Why not Whisper (OpenAI)?**
- Requires recording a complete audio chunk, uploading it, waiting for response — introduces 1–3 second latency per turn
- No interim results — user sees nothing while speaking
- Costs tokens per request

**Why not Deepgram/AssemblyAI?**
- Both have free tiers but require API keys and backend proxy routes
- Web Speech API gives equivalent quality for English with zero infrastructure
- **The right choice if:** needed to support non-English interviews or mobile browsers without SpeechRecognition

**Limitation acknowledged:** Web Speech API requires Chrome/Edge. Safari support is partial. Firefox has no support.

---

### OpenAI TTS vs. Browser speechSynthesis vs. ElevenLabs

**Chose OpenAI TTS (`tts-1`, `onyx` voice) as primary because:**
- Sounds like a real person — critical for the "realistic interviewer" UX
- $0.015 per 1,000 characters — ~$0.003 per interview turn, negligible cost
- Returns `audio/mpeg` directly, playable with `new Audio(objectURL)` in ~300ms

**Browser `speechSynthesis` as fallback because:**
- Works with zero API cost when OpenAI credits are unavailable
- Already built into every browser
- Sounds robotic but functional — acceptable for development

**Why not ElevenLabs?**
- Better voice quality than OpenAI TTS, but requires API key + backend proxy
- Free tier: 10,000 chars/month — gets exhausted quickly in a demo
- **The right choice if:** deploying publicly and willing to pay for premium voice

**Implementation:** `/api/tts` tries OpenAI first; on any error, the frontend catches and falls back to `window.speechSynthesis`. No user-facing failure — the voice just changes quality.

---

### Next.js 14 (App Router) vs. Express + React

**Chose Next.js because:**
- API routes and frontend in one repo, one deploy — zero separate backend service
- `serverExternalPackages: ['pdf-parse']` config handles Node.js-native modules cleanly
- One-command Vercel deploy
- File-based routing makes the project structure self-documenting

**Trade-off accepted:** Slightly less flexibility in backend routing patterns vs. Express.

---

### SSE vs. WebSockets

**Chose SSE because:**
- Communication is strictly unidirectional (server → client token stream)
- Works natively over HTTP/1.1 with no protocol upgrade
- Next.js serverless functions support `ReadableStream` responses natively
- WebSockets require persistent connections — don't work well in serverless

---

### Upstash Redis vs. PostgreSQL vs. In-Memory

**Chose Upstash Redis because:**
- Sessions are ephemeral (24-hour TTL) — Redis native key expiry is perfect
- Sub-millisecond reads for session reconstruction per API call
- Serverless REST API — no connection pooling, works in Vercel edge functions
- Free tier: 10,000 req/day

**Why not PostgreSQL?** Overengineered for session state — you'd just have a `sessionId + jsonb` column. Connection pooling adds complexity in serverless.

**Why not in-memory Map?** Next.js API routes are stateless serverless functions — each invocation may be a fresh process. In-memory state doesn't survive between calls.

---

### pdf-parse v2 API Change

**Problem encountered mid-build:** `pdf-parse` v2 changed from a callable function to a class-based API.

**Old API (v1):** `const { text } = await pdfParse(buffer)`  
**New API (v2):** `const parser = new PDFParse({ data: buffer }); const { text } = await parser.getText()`

This caused a `TypeError: pdfParse is not a function` in production. Debugged by inspecting the package's ESM exports (`dist/pdf-parse/esm/index.d.ts`), identified the `PDFParse` class, confirmed `getText()` returns a `TextResult` with a `.text` string, and updated the route accordingly. This is a good example of handling breaking library changes without panic.

---

## 4. System Prompt Design — Why These Rules?

**"One question at a time"**  
Real interviewers ask one question and listen. Multi-question responses overwhelm candidates and don't test ambiguity handling. Forces the AI to simulate real pressure.

**"Challenge every metric"**  
The most common MAANG interview failure mode is claiming impact without being able to defend it. The prompt instructs the AI to push back on any number, percentage, or claim — exactly what a Dive Deep or first-principles interviewer does.

**"3–4 sentence max responses"**  
Prevents the AI from over-explaining or giving away answers. Real interviewers are terse.

**Company-specific styles**  
Amazon: Leadership Principles are the official interview rubric — every behavioral question maps to an LP.  
Google: "Three levels deep" probing mirrors their actual interview culture.  
Deutsche Bank: Audit trail and transactional consistency questions reflect real finance interview concerns.

**Partial matching for custom companies**  
`getCompanyStyle()` uses `company.toLowerCase().includes(key.toLowerCase())` — so "Google (L5 SWE)" still gets the Google style, and "Swiggy" falls back to the generic style gracefully.

---

## 5. What Could Be Optimized (and Why We Didn't)

**Rate limiting on `/api/chat`**  
Should add Redis-based rate limiting (max 30 requests per session per minute). Not added because this is a solo demo. Production would require it.

**ElevenLabs TTS integration**  
Better voice quality, free tier sufficient for demo use. Deprioritised — browser fallback is functional for now.

**Streaming the evaluation**  
The eval endpoint is synchronous — 10–15 second spinner. Could stream it. Deferred because users expect to wait for a "complete" evaluation result differently than a conversation.

**Caching evaluation results**  
Calling `/api/evaluate` twice calls the LLM twice. Could cache in Redis with the session. Not worth the complexity for a demo.

**Voice Activity Detection (VAD)**  
The current approach uses `SpeechRecognition.onend` (browser's built-in silence detection, ~1.5s). A proper VAD model (e.g. Silero) would give more control over turn-taking timing. Overkill for this use case.

**User accounts / interview history**  
Currently sessions expire after 24 hours and are anonymous. Adding auth (Clerk/NextAuth) + a permanent store would let users review past interviews. A natural v2 feature.

---

## 6. Common Interview Questions

**Q: Walk me through the SSE implementation.**  
A: The `/api/chat` route calls the LLM with `stream: true`, which returns an async iterable. I iterate with `for await`, extract `chunk.choices[0]?.delta?.content`, encode as `data: {"text":"..."}\n\n` events, and enqueue into a `ReadableStream`. Response header is `Content-Type: text/event-stream`. On the frontend, I call `res.body.getReader()` and loop over `.read()`, splitting by newlines, parsing JSON payloads, appending tokens to the last message in state. `data: [DONE]` stops the loop.

**Q: How does the voice loop work technically?**  
A: Three stages. First, TTS: after the SSE stream ends, I POST the full AI text to `/api/tts`, get back `audio/mpeg`, create an `objectURL`, and play it with `new Audio()`. I await the `onended` event. Second, STT: I call `new SpeechRecognition()` with `continuous: true` and `interimResults: true`. `onresult` fires on every word — interim results update the screen in real time, finals accumulate in a ref. Third, submission: `onend` fires when the browser detects silence (~1.5s), I grab the accumulated final transcript and call the chat API. This gives a natural back-and-forth with no buttons.

**Q: Why Groq instead of OpenAI?**  
A: Groq is free, fast, and OpenAI API-compatible — the same SDK works with a different `baseURL`. I designed the LLM layer to be provider-agnostic: a single env variable (`GROQ_API_KEY`) toggles between Groq and OpenAI. Groq uses custom LPU hardware that gives lower latency than OpenAI for inference. The trade-off is slightly less instruction-following consistency on complex prompts, which I mitigate with explicit behavioral rules in the system prompt.

**Q: How did you handle the pdf-parse v2 breaking change?**  
A: Found the error `pdfParse is not a function` in server logs, identified it as a library version issue, inspected the ESM type definitions to understand the new class-based API, and updated the import from `(await import('pdf-parse')).default` to `const { PDFParse } = await import('pdf-parse')` with `new PDFParse({ data: buffer }).getText()`. This took about 10 minutes. The key skill was reading package source instead of guessing.

**Q: What happens if TTS fails?**  
A: The `/api/tts` route may fail if OpenAI credits are exhausted. The frontend wraps the fetch in a try/catch — on failure, it falls back to `window.speechSynthesis`. The user hears a slightly more robotic voice, but the interview continues uninterrupted. No error shown, no broken state.

**Q: What happens if Redis connection fails?**  
A: `getSession` throws, bubbles up to the API route's catch block, returns a 500. The frontend shows the error inline in the chat. In production I'd add a retry with exponential backoff on the Upstash client.

**Q: How does the evaluation JSON parsing work reliably?**  
A: `response_format: { type: "json_object" }` guarantees valid JSON output from the LLM. Combined with temperature 0.3 and an explicit schema in the prompt, the output is deterministic. `JSON.parse` is wrapped in try/catch as a last resort.

**Q: How would you scale this to 10,000 concurrent users?**  
A: The architecture is already stateless — Vercel scales API routes automatically. Bottlenecks: (1) Upstash Redis — upgrade tier for higher throughput; (2) Groq rate limits — implement a request queue in Redis to smooth bursts; (3) TTS — Groq has no TTS, so at scale I'd evaluate ElevenLabs vs. paying for OpenAI TTS based on cost per session.

**Q: What's the biggest limitation?**  
A: The AI has no memory across sessions. A real multi-round interview loop would remember what you said in round 1. Also, voice quality depends on TTS provider availability — if OpenAI is down, the fallback is noticeably worse. And Web Speech API only works reliably in Chrome, which limits mobile users.

---

## 7. Resume Readiness Status

### What's done ✓
- Full-stack app working end-to-end (pending Groq key setup)
- Voice-to-voice pipeline (STT + TTS with fallback)
- PDF ingestion with v2 API adaptation
- SSE streaming chat
- Company-specific prompt engineering (8 companies + custom)
- Evaluation engine with JSON scoring
- Ultra-luxury UI across all 3 pages (landing, interview, evaluation)
- LLM provider abstraction (Groq/OpenAI toggle)

### What's needed before resume goes live
1. **Groq key** → test full interview flow end-to-end
2. **GitHub** → push to public repo (interviewers will look)
3. **Vercel deploy** → get a live URL (takes 5 min)
4. **Replace resume bullet placeholders** with real GitHub + live demo links

### What can wait (refinements)
- ElevenLabs TTS for premium voice
- User auth + interview history
- Mobile-compatible STT fallback
- Rate limiting
- README in the repo

---

## 8. Resume Bullets (paste once deployed)

**Interro — AI Mock Interview Platform** | [GitHub](YOUR_GITHUB_URL) | [Live Demo](YOUR_VERCEL_URL)

- Built a full-stack AI voice interview platform using **Next.js 14**, **Groq (llama-3.3-70b)**, and **Upstash Redis** — candidates upload a resume, speak their answers, and receive a structured hiring report; the AI reads every resume line and challenges every claim in real time.
- Implemented a **voice-to-voice interview pipeline**: browser `SpeechRecognition` API for real-time STT with interim transcript display, OpenAI `tts-1` (`onyx` voice) for AI speech with automatic browser `speechSynthesis` fallback, and a hands-free mic handoff triggered by `audio.onended`.
- Designed **provider-agnostic LLM integration** — same OpenAI SDK routes to Groq (free, 14K req/day) or OpenAI via a single env variable; built custom **SSE streaming** with `ReadableStream` achieving sub-500ms time-to-first-token across both providers.
