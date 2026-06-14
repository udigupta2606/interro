"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { EvaluationResult } from "@/lib/types";

const G = "#c9a96e";

function ScoreRing({ score, label }: { score: number; label: string }) {
  const color = score >= 8 ? "#4ade80" : score >= 6 ? G : "#f87171";
  const pct = (score / 10) * 100;
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(201,169,110,0.08)" strokeWidth="3" />
        <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 36 36)" style={{ transition: "stroke-dasharray 1s ease" }} />
        <text x="36" y="36" textAnchor="middle" dominantBaseline="central"
          style={{ fontSize: "16px", fontWeight: 700, fill: color, fontFamily: "inherit" }}>
          {score}
        </text>
      </svg>
      <span style={{ fontSize: "8px", letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(240,235,224,0.3)" }}>{label}</span>
    </div>
  );
}

function EvaluationContent() {
  const params = useSearchParams();
  const router = useRouter();
  const sessionId = params.get("session");

  const [ev, setEv] = useState<EvaluationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionId) return;
    fetch("/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then(r => r.json())
      .then(d => { setEv(d); setLoading(false); })
      .catch(() => { setError("Failed to generate evaluation."); setLoading(false); });
  }, [sessionId]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#09080a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "24px" }}>
        <div style={{ position: "relative", width: "56px", height: "56px" }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `1px solid rgba(201,169,110,0.1)`, borderTopColor: G, animation: "spin 1s linear infinite" }} />
        </div>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "#f0ebe0", fontSize: "14px", letterSpacing: "0.04em", margin: 0 }}>Analyzing your performance</p>
          <p style={{ color: "rgba(240,235,224,0.25)", fontSize: "10px", letterSpacing: "0.12em", marginTop: "8px" }}>Usually 10–15 seconds</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !ev) {
    return (
      <div style={{ minHeight: "100vh", background: "#09080a", display: "flex", alignItems: "center", justifyContent: "center", color: "#f87171", fontSize: "13px" }}>
        {error || "Something went wrong."}
      </div>
    );
  }

  const recStyle: Record<string, { border: string; color: string; bg: string }> = {
    "Strong Hire": { border: "rgba(74,222,128,0.3)", color: "#4ade80", bg: "rgba(74,222,128,0.06)" },
    "Hire":        { border: `rgba(201,169,110,0.4)`, color: G, bg: `rgba(201,169,110,0.06)` },
    "Borderline":  { border: "rgba(251,191,36,0.3)", color: "#fbbf24", bg: "rgba(251,191,36,0.06)" },
    "No Hire":     { border: "rgba(248,113,113,0.3)", color: "#f87171", bg: "rgba(248,113,113,0.06)" },
  };
  const rec = recStyle[ev.recommendation] ?? recStyle["Borderline"];

  return (
    <div style={{ minHeight: "100vh", background: "#09080a", color: "#f0ebe0" }}>

      {/* Nav */}
      <nav style={{ borderBottom: "1px solid rgba(201,169,110,0.1)", padding: "22px 56px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "10px", letterSpacing: "0.28em", color: G, fontWeight: 700, textTransform: "uppercase" }}>Interro</span>
        <span style={{ fontSize: "9px", letterSpacing: "0.2em", color: "rgba(240,235,224,0.2)", textTransform: "uppercase" }}>Interview Report</span>
      </nav>

      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "56px 32px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "56px" }}>
          <div>
            <p style={{ fontSize: "9px", letterSpacing: "0.28em", color: "rgba(201,169,110,0.5)", textTransform: "uppercase", margin: "0 0 12px" }}>Your result</p>
            <h1 style={{ margin: 0, fontWeight: 200, fontSize: "clamp(32px, 4vw, 48px)", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
              Interview<br /><em style={{ fontStyle: "italic", fontWeight: 700 }}>complete.</em>
            </h1>
          </div>
          <div style={{ padding: "14px 24px", border: `1px solid ${rec.border}`, background: rec.bg, textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: "9px", letterSpacing: "0.2em", color: "rgba(240,235,224,0.3)", textTransform: "uppercase", marginBottom: "6px" }}>Verdict</p>
            <p style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: rec.color, letterSpacing: "0.04em" }}>{ev.recommendation}</p>
          </div>
        </div>

        <div style={{ width: "100%", height: "1px", background: "rgba(201,169,110,0.08)", marginBottom: "48px" }} />

        {/* Scores */}
        <div style={{ marginBottom: "48px" }}>
          <p style={{ fontSize: "9px", letterSpacing: "0.24em", color: "rgba(201,169,110,0.5)", textTransform: "uppercase", margin: "0 0 28px" }}>Scores</p>
          <div style={{ display: "flex", gap: "48px" }}>
            <ScoreRing score={ev.overallScore} label="Overall" />
            <ScoreRing score={ev.technicalScore} label="Technical" />
            <ScoreRing score={ev.communicationScore} label="Communication" />
          </div>
        </div>

        <div style={{ width: "100%", height: "1px", background: "rgba(201,169,110,0.08)", marginBottom: "48px" }} />

        {/* Strengths & Weaknesses */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px", marginBottom: "48px" }}>
          <div>
            <p style={{ fontSize: "9px", letterSpacing: "0.24em", color: "#4ade80", textTransform: "uppercase", margin: "0 0 20px" }}>Strengths</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {ev.strengths.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: "12px" }}>
                  <span style={{ color: "rgba(74,222,128,0.5)", fontSize: "10px", marginTop: "1px", flexShrink: 0 }}>—</span>
                  <span style={{ fontSize: "12px", color: "rgba(240,235,224,0.65)", lineHeight: 1.6 }}>{s}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p style={{ fontSize: "9px", letterSpacing: "0.24em", color: "#f87171", textTransform: "uppercase", margin: "0 0 20px" }}>To improve</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {ev.weaknesses.map((w, i) => (
                <div key={i} style={{ display: "flex", gap: "12px" }}>
                  <span style={{ color: "rgba(248,113,113,0.5)", fontSize: "10px", marginTop: "1px", flexShrink: 0 }}>—</span>
                  <span style={{ fontSize: "12px", color: "rgba(240,235,224,0.65)", lineHeight: 1.6 }}>{w}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ width: "100%", height: "1px", background: "rgba(201,169,110,0.08)", marginBottom: "48px" }} />

        {/* Resume Claim Audit */}
        {ev.resumeClaimsVerified[0] !== "N/A — no resume provided" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px", marginBottom: "48px" }}>
              <div>
                <p style={{ fontSize: "9px", letterSpacing: "0.24em", color: G, textTransform: "uppercase", margin: "0 0 20px" }}>Claims defended</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {ev.resumeClaimsVerified.map((c, i) => (
                    <div key={i} style={{ display: "flex", gap: "12px" }}>
                      <span style={{ color: "rgba(201,169,110,0.4)", fontSize: "10px", flexShrink: 0 }}>✓</span>
                      <span style={{ fontSize: "11px", color: "rgba(240,235,224,0.45)", lineHeight: 1.6 }}>{c}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p style={{ fontSize: "9px", letterSpacing: "0.24em", color: "#fbbf24", textTransform: "uppercase", margin: "0 0 20px" }}>Claims challenged</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {ev.resumeClaimsChallenged.map((c, i) => (
                    <div key={i} style={{ display: "flex", gap: "12px" }}>
                      <span style={{ color: "rgba(251,191,36,0.4)", fontSize: "10px", flexShrink: 0 }}>!</span>
                      <span style={{ fontSize: "11px", color: "rgba(240,235,224,0.45)", lineHeight: 1.6 }}>{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ width: "100%", height: "1px", background: "rgba(201,169,110,0.08)", marginBottom: "48px" }} />
          </>
        )}

        {/* Detailed Feedback */}
        <div style={{ marginBottom: "56px" }}>
          <p style={{ fontSize: "9px", letterSpacing: "0.24em", color: "rgba(201,169,110,0.5)", textTransform: "uppercase", margin: "0 0 24px" }}>Detailed assessment</p>
          <p style={{ fontSize: "13px", lineHeight: 1.9, color: "rgba(240,235,224,0.55)", whiteSpace: "pre-wrap", fontWeight: 300 }}>
            {ev.detailedFeedback}
          </p>
        </div>

        {/* CTA */}
        <button
          onClick={() => router.push("/")}
          style={{ width: "100%", padding: "16px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", cursor: "pointer", background: G, color: "#09080a", border: "none", outline: "none", transition: "opacity 0.2s" }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
        >
          Try Another Interview
        </button>

      </div>
    </div>
  );
}

export default function EvaluationPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#09080a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "32px", height: "32px", borderRadius: "50%", border: "2px solid rgba(201,169,110,0.15)", borderTopColor: G, animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <EvaluationContent />
    </Suspense>
  );
}
