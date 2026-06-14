"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { ChatMessage } from "@/lib/types";

const G = "#c9a96e";

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

function InterviewContent() {
  const params = useSearchParams();
  const router = useRouter();
  const sessionId = params.get("session");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [ended, setEnded] = useState(false);
  const [voiceMode, setVoiceMode] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [voiceSupported, setVoiceSupported] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef("");
  const sendingRef = useRef(false);

  useEffect(() => {
    const supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    setVoiceSupported(supported);
    if (!supported) setVoiceMode(false);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, transcript]);

  // ── TTS: speak AI response ──────────────────────────────────────────────
  const speak = useCallback(async (text: string): Promise<void> => {
    setIsSpeaking(true);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        await new Promise<void>((resolve) => {
          audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
          audio.onerror = () => resolve();
          audio.play().catch(() => resolve());
        });
        return;
      }
    } catch { /* fall through to browser TTS */ }

    // Fallback: browser speech synthesis
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.92;
      utterance.pitch = 0.88;
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v => v.name.includes("Daniel") || v.name.includes("Google UK English Male") || v.name.includes("en-GB"));
      if (preferred) utterance.voice = preferred;
      await new Promise<void>((resolve) => {
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
      });
    }
  }, []);

  // ── Mic: listen for user input ──────────────────────────────────────────
  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || isListening || sendingRef.current) return;

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    recognitionRef.current = rec;
    finalTranscriptRef.current = "";

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
      }
      if (final) finalTranscriptRef.current += final;
      setTranscript(finalTranscriptRef.current + interim);
    };

    rec.onend = () => {
      setIsListening(false);
      const text = finalTranscriptRef.current.trim();
      if (text && !sendingRef.current) {
        setTranscript("");
        sendMessage(text);
      } else {
        setTranscript("");
      }
    };

    rec.onerror = () => { setIsListening(false); setTranscript(""); };
    rec.start();
    setIsListening(true);
  }, [isListening]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  // ── Core send ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    if (sendingRef.current || ended) return;
    sendingRef.current = true;
    setStreaming(true);

    const outgoing: ChatMessage[] = text
      ? [...messages, { role: "user", content: text }]
      : messages;

    if (text) setMessages(outgoing);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, messages: outgoing }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "Unknown error");
        throw new Error(errText || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let aiText = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.error) {
              setMessages((prev) => [
                ...prev.slice(0, -1),
                { role: "assistant", content: `⚠️ ${parsed.error}` },
              ]);
              return;
            }
            if (parsed.text) {
              aiText += parsed.text;
              setMessages((prev) => [
                ...prev.slice(0, -1),
                { role: "assistant", content: aiText },
              ]);
            }
          } catch { /* skip */ }
        }
      }

      // After AI is done streaming, speak it then start mic
      if (voiceMode && aiText) {
        await speak(aiText);
        setIsSpeaking(false);
        if (!ended) startListening();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection error";
      setMessages((prev) => [
        ...prev.slice(0, prev.length > 0 ? -1 : 0),
        { role: "assistant", content: `⚠️ ${msg}` },
      ]);
    } finally {
      sendingRef.current = false;
      setStreaming(false);
      setIsSpeaking(false);
      textareaRef.current?.focus();
    }
  }, [messages, sessionId, voiceMode, ended, speak, startListening]); // eslint-disable-line react-hooks/exhaustive-deps

  // Kick off first question on mount
  useEffect(() => {
    if (sessionId) sendMessage("");
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const endInterview = () => {
    setEnded(true);
    stopListening();
    window.speechSynthesis?.cancel();
    router.push(`/evaluation?session=${sessionId}`);
  };

  const canEnd = messages.length >= 6 && !streaming && !isListening;
  const lastAIMsg = [...messages].reverse().find(m => m.role === "assistant")?.content ?? "";

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#09080a", color: "#f0ebe0" }}>

      {/* Nav */}
      <nav style={{ borderBottom: "1px solid rgba(201,169,110,0.1)", padding: "18px 48px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <span style={{ fontSize: "10px", letterSpacing: "0.28em", color: G, fontWeight: 700, textTransform: "uppercase" }}>Interro</span>
          <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
            <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#ef4444", animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: "9px", color: "rgba(240,235,224,0.3)", letterSpacing: "0.14em", textTransform: "uppercase" }}>Live Interview</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {voiceSupported && (
            <button
              onClick={() => {
                if (isListening) stopListening();
                setVoiceMode(v => !v);
              }}
              style={{ fontSize: "9px", letterSpacing: "0.16em", textTransform: "uppercase", color: voiceMode ? G : "rgba(240,235,224,0.3)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              {voiceMode ? "● Voice" : "○ Voice"}
            </button>
          )}
          <button
            onClick={endInterview}
            disabled={!canEnd}
            style={{ padding: "8px 20px", fontSize: "9px", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", cursor: canEnd ? "pointer" : "not-allowed", opacity: canEnd ? 1 : 0.3, background: "transparent", border: `1px solid rgba(239,68,68,0.4)`, color: "#ef4444", transition: "all 0.2s" }}>
            End & Feedback
          </button>
        </div>
      </nav>

      {/* ── VOICE MODE ── */}
      {voiceMode ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 56px", gap: "48px" }}>

          {/* AI message display */}
          <div style={{ maxWidth: "680px", textAlign: "center" }}>
            {messages.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
                <div style={{ display: "flex", gap: "6px" }}>
                  {[0, 0.2, 0.4].map((d, i) => (
                    <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: G, animation: `bounce 1.2s ${d}s infinite` }} />
                  ))}
                </div>
                <p style={{ fontSize: "12px", color: "rgba(240,235,224,0.3)", letterSpacing: "0.12em" }}>Your interviewer is preparing...</p>
              </div>
            ) : (
              <>
                <p style={{ fontSize: "10px", letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(201,169,110,0.5)", marginBottom: "20px" }}>
                  {isSpeaking ? "Speaking" : streaming ? "Thinking" : "Interviewer"}
                </p>
                <p style={{ fontSize: "clamp(16px, 2.2vw, 22px)", fontWeight: 300, lineHeight: 1.7, color: "#f0ebe0", letterSpacing: "0.01em" }}>
                  {lastAIMsg || (
                    <span style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                      {[0, 0.15, 0.3].map((d, i) => (
                        <span key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: "rgba(201,169,110,0.4)", display: "inline-block", animation: `bounce 1.2s ${d}s infinite` }} />
                      ))}
                    </span>
                  )}
                </p>
              </>
            )}
          </div>

          {/* User transcript */}
          {transcript && (
            <p style={{ fontSize: "13px", color: "rgba(240,235,224,0.35)", fontStyle: "italic", maxWidth: "500px", textAlign: "center", lineHeight: 1.6 }}>
              &ldquo;{transcript}&rdquo;
            </p>
          )}

          {/* Mic button */}
          {!streaming && messages.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
              <button
                onClick={() => isListening ? stopListening() : startListening()}
                disabled={isSpeaking}
                style={{
                  width: "80px", height: "80px", borderRadius: "50%",
                  background: isListening ? G : "transparent",
                  border: `2px solid ${isListening ? G : "rgba(201,169,110,0.25)"}`,
                  cursor: isSpeaking ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.3s",
                  boxShadow: isListening ? `0 0 0 12px rgba(201,169,110,0.12), 0 0 0 24px rgba(201,169,110,0.05)` : "none",
                  opacity: isSpeaking ? 0.3 : 1,
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="9" y="2" width="6" height="11" rx="3" fill={isListening ? "#09080a" : G} />
                  <path d="M5 10a7 7 0 0 0 14 0" stroke={isListening ? "#09080a" : G} strokeWidth="2" strokeLinecap="round" />
                  <line x1="12" y1="17" x2="12" y2="22" stroke={isListening ? "#09080a" : G} strokeWidth="2" strokeLinecap="round" />
                  <line x1="8" y1="22" x2="16" y2="22" stroke={isListening ? "#09080a" : G} strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              <span style={{ fontSize: "9px", letterSpacing: "0.2em", textTransform: "uppercase", color: isListening ? G : "rgba(240,235,224,0.2)" }}>
                {isListening ? "Listening — tap to send" : isSpeaking ? "Interviewer speaking..." : "Tap to speak"}
              </span>

              {/* Or type */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "8px", width: "320px" }}>
                <div style={{ height: "1px", flex: 1, background: "rgba(201,169,110,0.07)" }} />
                <span style={{ fontSize: "8px", color: "rgba(240,235,224,0.15)", letterSpacing: "0.16em" }}>OR TYPE</span>
                <div style={{ height: "1px", flex: 1, background: "rgba(201,169,110,0.07)" }} />
              </div>
              <div style={{ display: "flex", gap: "8px", width: "320px" }}>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && input.trim()) { e.preventDefault(); setInput(""); sendMessage(input.trim()); } }}
                  placeholder="Type your answer..."
                  style={{ flex: 1, background: "transparent", border: "none", borderBottom: `1px solid rgba(201,169,110,0.15)`, color: "#f0ebe0", fontSize: "12px", padding: "8px 0", outline: "none", letterSpacing: "0.03em" }}
                />
                <button onClick={() => { if (input.trim()) { const t = input.trim(); setInput(""); sendMessage(t); } }}
                  disabled={!input.trim()}
                  style={{ background: "none", border: "none", cursor: input.trim() ? "pointer" : "not-allowed", color: input.trim() ? G : "rgba(201,169,110,0.2)", fontSize: "16px", padding: "4px" }}>
                  →
                </button>
              </div>
            </div>
          )}
        </div>

      ) : (
        /* ── TEXT MODE ── */
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "32px 48px" }}>
            <div style={{ maxWidth: "680px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>
              {messages.length === 0 && (
                <div style={{ textAlign: "center", marginTop: "80px" }}>
                  <div style={{ display: "flex", justifyContent: "center", gap: "6px", marginBottom: "16px" }}>
                    {[0, 0.2, 0.4].map((d, i) => (
                      <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: G, animation: `bounce 1.2s ${d}s infinite` }} />
                    ))}
                  </div>
                  <p style={{ fontSize: "11px", color: "rgba(240,235,224,0.25)", letterSpacing: "0.12em" }}>Your interviewer is preparing...</p>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} style={{ display: "flex", gap: "16px", flexDirection: msg.role === "user" ? "row-reverse" : "row" }}>
                  <div style={{ width: "30px", height: "30px", borderRadius: "50%", border: `1px solid ${msg.role === "assistant" ? "rgba(201,169,110,0.3)" : "rgba(240,235,224,0.1)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: "8px", letterSpacing: "0.08em", color: msg.role === "assistant" ? G : "rgba(240,235,224,0.4)", fontWeight: 600 }}>
                      {msg.role === "assistant" ? "AI" : "YOU"}
                    </span>
                  </div>
                  <div style={{
                    maxWidth: "78%", padding: "14px 18px", lineHeight: 1.75,
                    fontSize: "13px", letterSpacing: "0.01em",
                    background: msg.role === "assistant" ? "rgba(201,169,110,0.04)" : "rgba(240,235,224,0.04)",
                    border: `1px solid ${msg.role === "assistant" ? "rgba(201,169,110,0.1)" : "rgba(240,235,224,0.06)"}`,
                    color: msg.role === "assistant" ? "#f0ebe0" : "rgba(240,235,224,0.7)",
                  }}>
                    {msg.content || (
                      <span style={{ display: "inline-flex", gap: "4px", alignItems: "center" }}>
                        {[0, 0.15, 0.3].map((d, j) => (
                          <span key={j} style={{ width: "5px", height: "5px", borderRadius: "50%", background: "rgba(201,169,110,0.4)", display: "inline-block", animation: `bounce 1.2s ${d}s infinite` }} />
                        ))}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </div>

          <div style={{ borderTop: "1px solid rgba(201,169,110,0.08)", padding: "20px 48px", flexShrink: 0 }}>
            <div style={{ maxWidth: "680px", margin: "0 auto", display: "flex", gap: "12px", alignItems: "flex-end" }}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (input.trim()) { const t = input.trim(); setInput(""); sendMessage(t); } } }}
                placeholder={streaming ? "Interviewer is responding..." : "Your answer… (Enter to send)"}
                disabled={streaming || ended}
                rows={3}
                style={{ flex: 1, background: "transparent", border: "none", borderBottom: `1px solid rgba(201,169,110,0.15)`, color: "#f0ebe0", fontSize: "13px", padding: "8px 0", outline: "none", resize: "none", letterSpacing: "0.02em", lineHeight: 1.7, opacity: (streaming || ended) ? 0.4 : 1 }}
              />
              <button
                onClick={() => { if (input.trim()) { const t = input.trim(); setInput(""); sendMessage(t); } }}
                disabled={!input.trim() || streaming || ended}
                style={{ width: "40px", height: "40px", background: input.trim() && !streaming ? G : "transparent", border: `1px solid ${input.trim() && !streaming ? G : "rgba(201,169,110,0.15)"}`, cursor: input.trim() && !streaming ? "pointer" : "not-allowed", color: input.trim() && !streaming ? "#09080a" : "rgba(201,169,110,0.2)", fontSize: "16px", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                ↑
              </button>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes bounce { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-6px); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}

export default function InterviewPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#09080a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "32px", height: "32px", borderRadius: "50%", border: "2px solid rgba(201,169,110,0.15)", borderTopColor: "#c9a96e", animation: "spin 0.8s linear infinite" }} />
      </div>
    }>
      <InterviewContent />
    </Suspense>
  );
}
