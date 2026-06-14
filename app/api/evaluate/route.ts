import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getSession } from "@/lib/redis";
import { buildEvaluationPrompt } from "@/lib/prompts";

// Groq = free tier, OpenAI-compatible. Falls back to OpenAI if no Groq key.
const openai = new OpenAI(
  process.env.GROQ_API_KEY
    ? { apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" }
    : { apiKey: process.env.OPENAI_API_KEY }
);
const EVAL_MODEL = process.env.GROQ_API_KEY ? "llama-3.3-70b-versatile" : "gpt-4o-mini";

export async function POST(req: NextRequest) {
  const { sessionId } = await req.json();

  const session = await getSession(sessionId);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.messages.length < 4) {
    return NextResponse.json({ error: "Interview too short to evaluate" }, { status: 400 });
  }

  const transcript = session.messages
    .map((m) => `${m.role === "assistant" ? "INTERVIEWER" : "CANDIDATE"}: ${m.content}`)
    .join("\n\n");

  const response = await openai.chat.completions.create({
    model: EVAL_MODEL,
    messages: [
      {
        role: "user",
        content: buildEvaluationPrompt(session.resumeText, session.company, session.role, transcript),
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  try {
    const evaluation = JSON.parse(response.choices[0].message.content ?? "{}");
    return NextResponse.json(evaluation);
  } catch {
    return NextResponse.json({ error: "Failed to parse evaluation" }, { status: 500 });
  }
}
