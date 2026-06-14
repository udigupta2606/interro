import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { setSession } from "@/lib/redis";
import type { SessionData } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("resume") as File | null;
    const company = (form.get("company") as string) || "General";
    const role = (form.get("role") as string) || "General";

    let resumeText = "";

    // Resume is optional — only parse if provided
    if (file && file.size > 0) {
      const buffer = Buffer.from(await file.arrayBuffer());

      // pdf-parse v2 uses a class-based API
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      const text = result.text;

      if (!text.trim()) {
        return NextResponse.json(
          { error: "Could not extract text. Make sure the PDF is not a scanned image." },
          { status: 422 }
        );
      }

      resumeText = text.trim().slice(0, 8000);
    }

    const sessionId = randomUUID();
    const session: SessionData = {
      sessionId,
      resumeText,
      company,
      role,
      messages: [],
      createdAt: Date.now(),
    };

    await setSession(sessionId, session);
    return NextResponse.json({ sessionId });

  } catch (err) {
    console.error("[upload]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
