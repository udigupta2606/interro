import { NextRequest } from "next/server";
import OpenAI from "openai";
import { getSession, setSession } from "@/lib/redis";
import { buildSystemPrompt } from "@/lib/prompts";
import type { ChatMessage } from "@/lib/types";

// Groq = free tier, OpenAI-compatible, very fast. Falls back to OpenAI if no Groq key.
const openai = new OpenAI(
  process.env.GROQ_API_KEY
    ? { apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" }
    : { apiKey: process.env.OPENAI_API_KEY }
);
const CHAT_MODEL = process.env.GROQ_API_KEY ? "llama-3.3-70b-versatile" : "gpt-4o-mini";

export async function POST(req: NextRequest) {
  try {
    const { sessionId, messages }: { sessionId: string; messages: ChatMessage[] } = await req.json();

    const session = await getSession(sessionId);
    if (!session) return new Response("Session not found", { status: 404 });

    const systemPrompt = buildSystemPrompt(session.resumeText, session.company, session.role);

    const stream = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ] as OpenAI.Chat.ChatCompletionMessageParam[],
      stream: true,
      max_tokens: 400,
      temperature: 0.75,
    });

    const encoder = new TextEncoder();
    let fullResponse = "";

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content ?? "";
            if (text) {
              fullResponse += text;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
            }
          }
          session.messages = [...messages, { role: "assistant", content: fullResponse }];
          await setSession(sessionId, session);
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          // Surface quota / auth errors clearly
          const isQuota = msg.includes("insufficient_quota") || msg.includes("429");
          const friendly = isQuota
            ? "OpenAI free credits exhausted. Add billing at platform.openai.com → Billing."
            : `AI error: ${msg}`;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: friendly })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const isQuota = msg.includes("insufficient_quota") || msg.includes("429");
    const status = isQuota ? 402 : 500;
    return new Response(
      isQuota
        ? "OpenAI free credits exhausted. Add billing at platform.openai.com → Billing."
        : `Internal error: ${msg}`,
      { status }
    );
  }
}
