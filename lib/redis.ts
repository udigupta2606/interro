import { Redis } from "@upstash/redis";
import type { SessionData } from "./types";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const TTL = 60 * 60 * 24; // 24 hours

export async function getSession(sessionId: string): Promise<SessionData | null> {
  const raw = await redis.get<SessionData | string>(`session:${sessionId}`);
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function setSession(sessionId: string, session: SessionData): Promise<void> {
  await redis.set(`session:${sessionId}`, JSON.stringify(session), { ex: TTL });
}
