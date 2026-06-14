import { NextRequest } from "next/server";
import OpenAI from "openai";

// Voice priority: ElevenLabs → OpenAI → browser fallback (handled client-side)

// ElevenLabs — "Adam": professional, calm, clearly AI but pleasantly human
// Other good options: Rachel = pNInz6obpgDQGcFmaJgB, Antoni = ErXwobaYiN019PkySvjV
const ELEVENLABS_VOICE_ID = "pNInz6obpgDQGcFmaJgB"; // Adam

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const { text } = await req.json();
  if (!text?.trim()) return new Response("No text", { status: 400 });

  const input = text.slice(0, 1000);

  // ── 1. ElevenLabs (best quality, free tier) ─────────────────────────────
  if (process.env.ELEVENLABS_API_KEY) {
    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": process.env.ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text: input,
            model_id: "eleven_turbo_v2_5",   // fastest + best quality on free tier
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0.3,
              use_speaker_boost: true,
            },
          }),
        }
      );
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        return new Response(buffer, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Content-Length": buffer.length.toString(),
            "Cache-Control": "no-store",
          },
        });
      }
    } catch { /* fall through */ }
  }

  // ── 2. OpenAI TTS (if credits available) ────────────────────────────────
  if (process.env.OPENAI_API_KEY) {
    try {
      const audio = await openai.audio.speech.create({
        model: "tts-1",
        voice: "onyx",
        input,
        speed: 0.95,
      });
      const buffer = Buffer.from(await audio.arrayBuffer());
      return new Response(buffer, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": buffer.length.toString(),
          "Cache-Control": "no-store",
        },
      });
    } catch { /* fall through */ }
  }

  // ── 3. No provider available — client will use browser speechSynthesis ──
  return new Response("No TTS provider available", { status: 503 });
}
