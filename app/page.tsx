"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const COMPANIES = ["Google", "Amazon", "Microsoft", "Apple", "Meta", "Flipkart", "Zomato", "Deutsche Bank", "Other"];
const ROLES = ["SDE-1", "SDE-2", "Senior SDE", "PM", "ML Engineer", "Data Scientist", "UI/UX Designer", "DevOps / SRE", "Other"];

export default function Home() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [company, setCompany] = useState("");
  const [customCompany, setCustomCompany] = useState("");
  const [role, setRole] = useState("");
  const [customRole, setCustomRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const G = "#c9a96e";

  const handleFile = (f: File) => {
    if (f.type !== "application/pdf") { setError("Only PDF files are supported."); return; }
    if (f.size > 5 * 1024 * 1024) { setError("File too large — max 5MB."); return; }
    setFile(f); setError("");
  };

  const handleStart = async () => {
    setLoading(true); setError("");
    const finalCompany = company === "Other" ? customCompany.trim() : company;
    const finalRole = role === "Other" ? customRole.trim() : role;
    try {
      const form = new FormData();
      if (file) form.append("resume", file);
      form.append("company", finalCompany || "General");
      form.append("role", finalRole || "General");
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to start");
      const { sessionId } = await res.json();
      router.push(`/interview?session=${sessionId}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setLoading(false);
    }
  };

  const chip = (selected: boolean) => ({
    padding: "5px 13px",
    fontSize: "10px",
    fontWeight: 500,
    letterSpacing: "0.04em",
    cursor: "pointer",
    transition: "all 0.2s",
    border: `1px solid ${selected ? G : "rgba(201,169,110,0.15)"}`,
    background: selected ? G : "transparent",
    color: selected ? "#09080a" : "rgba(240,235,224,0.4)",
    outline: "none",
  } as React.CSSProperties);

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#09080a", color: "#f0ebe0" }}>

      {/* Nav */}
      <nav style={{ borderBottom: "1px solid rgba(201,169,110,0.1)", padding: "22px 56px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <span style={{ fontSize: "10px", letterSpacing: "0.28em", color: G, fontWeight: 700, textTransform: "uppercase" }}>Interro</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#4ade80" }} />
          <span style={{ fontSize: "10px", color: "rgba(240,235,224,0.25)", letterSpacing: "0.12em", textTransform: "uppercase" }}>Live</span>
        </div>
      </nav>

      {/* Body — vertically centered, two equal columns */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 56px" }}>
        <div style={{ width: "100%", maxWidth: "1100px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "80px", alignItems: "center" }}>

          {/* ── Left ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "36px" }}>

            {/* Eyebrow */}
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <div style={{ height: "1px", width: "28px", background: G, flexShrink: 0 }} />
              <span style={{ fontSize: "9px", letterSpacing: "0.28em", color: G, textTransform: "uppercase", fontWeight: 600 }}>
                The Interview, Redefined
              </span>
            </div>

            {/* Headline */}
            <div>
              <h1 style={{ margin: 0, fontWeight: 200, lineHeight: 1.05, letterSpacing: "-0.025em", fontSize: "clamp(40px, 4.5vw, 62px)", color: "#f0ebe0" }}>
                Face the interview<br />
                <em style={{ fontStyle: "italic", fontWeight: 700 }}>you&apos;re afraid of.</em>
              </h1>
              <div style={{ width: "40px", height: "2px", background: G, marginTop: "24px" }} />
            </div>

            {/* Body */}
            <p style={{ margin: 0, fontSize: "14px", lineHeight: 1.8, color: "rgba(240,235,224,0.38)", maxWidth: "340px" }}>
              Upload your resume. An AI reads every line — then challenges every claim with the precision of a real MAANG interviewer.
            </p>

            {/* Features — compact horizontal lines */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              {[
                ["01", "Resume-aware", "Challenges every bullet."],
                ["02", "Company-specific", "Amazon LPs. Google depth."],
                ["03", "Scored feedback", "Hire / No-hire verdict."],
              ].map(([num, title, sub]) => (
                <div key={num} style={{ display: "flex", alignItems: "center", gap: "16px", padding: "14px 0", borderBottom: "1px solid rgba(201,169,110,0.08)" }}>
                  <span style={{ fontSize: "9px", color: "rgba(201,169,110,0.4)", letterSpacing: "0.1em", width: "20px", flexShrink: 0 }}>{num}</span>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "rgba(240,235,224,0.8)", letterSpacing: "0.02em" }}>{title}</span>
                  <span style={{ fontSize: "11px", color: "rgba(240,235,224,0.25)", marginLeft: "auto" }}>{sub}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right: Form ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "28px", padding: "44px", border: "1px solid rgba(201,169,110,0.1)", background: "rgba(255,255,255,0.015)" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ height: "1px", flex: 1, background: "rgba(201,169,110,0.08)" }} />
              <span style={{ fontSize: "8px", letterSpacing: "0.3em", color: "rgba(201,169,110,0.4)", textTransform: "uppercase" }}>Configure Interview</span>
              <div style={{ height: "1px", flex: 1, background: "rgba(201,169,110,0.08)" }} />
            </div>

            {/* Resume */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "9px", letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(240,235,224,0.4)", fontWeight: 600 }}>Resume</span>
                <span style={{ fontSize: "9px", color: "rgba(240,235,224,0.18)", letterSpacing: "0.08em" }}>Optional</span>
              </div>
              <label style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                height: "72px", cursor: "pointer", transition: "all 0.3s",
                border: `1px dashed ${dragOver ? G : file ? "rgba(74,222,128,0.4)" : "rgba(201,169,110,0.12)"}`,
                background: dragOver ? "rgba(201,169,110,0.06)" : "transparent",
              }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              >
                <input type="file" accept=".pdf" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
                {file ? (
                  <div style={{ textAlign: "center" }}>
                    <p style={{ margin: 0, fontSize: "11px", color: "#4ade80", fontWeight: 600, letterSpacing: "0.03em" }}>✓ {file.name}</p>
                    <button type="button" onClick={(e) => { e.preventDefault(); setFile(null); }}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: "9px", color: "rgba(240,235,224,0.2)", marginTop: "4px", letterSpacing: "0.08em" }}>
                      Remove
                    </button>
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: "10px", color: "rgba(240,235,224,0.22)", letterSpacing: "0.06em" }}>
                    Drop PDF · or <span style={{ color: G, textDecoration: "underline", textUnderlineOffset: "3px" }}>browse</span>
                  </p>
                )}
              </label>
            </div>

            <div style={{ height: "1px", background: "rgba(201,169,110,0.07)" }} />

            {/* Company */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "9px", letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(240,235,224,0.4)", fontWeight: 600 }}>Company</span>
                <span style={{ fontSize: "9px", color: "rgba(240,235,224,0.18)", letterSpacing: "0.08em" }}>Optional</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                {COMPANIES.map((c) => (
                  <button key={c} onClick={() => { setCompany(c === company ? "" : c); setCustomCompany(""); }} style={chip(company === c)}>{c}</button>
                ))}
              </div>
              {company === "Other" && (
                <input type="text" value={customCompany} onChange={(e) => setCustomCompany(e.target.value)}
                  placeholder="e.g. Swiggy, Razorpay..." autoFocus
                  style={{ background: "transparent", border: "none", borderBottom: `1px solid rgba(201,169,110,0.25)`, color: "#f0ebe0", fontSize: "11px", padding: "6px 0", outline: "none", width: "100%", letterSpacing: "0.04em" }} />
              )}
            </div>

            {/* Role */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "9px", letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(240,235,224,0.4)", fontWeight: 600 }}>Role</span>
                <span style={{ fontSize: "9px", color: "rgba(240,235,224,0.18)", letterSpacing: "0.08em" }}>Optional</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                {ROLES.map((r) => (
                  <button key={r} onClick={() => { setRole(r === role ? "" : r); setCustomRole(""); }} style={chip(role === r)}>{r}</button>
                ))}
              </div>
              {role === "Other" && (
                <input type="text" value={customRole} onChange={(e) => setCustomRole(e.target.value)}
                  placeholder="e.g. Backend Engineer..." autoFocus
                  style={{ background: "transparent", border: "none", borderBottom: `1px solid rgba(201,169,110,0.25)`, color: "#f0ebe0", fontSize: "11px", padding: "6px 0", outline: "none", width: "100%", letterSpacing: "0.04em" }} />
              )}
            </div>

            {error && <p style={{ margin: 0, fontSize: "11px", color: "#f87171" }}>{error}</p>}

            {/* CTA */}
            <button onClick={handleStart} disabled={loading}
              style={{ width: "100%", padding: "15px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1, transition: "all 0.3s", background: G, color: "#09080a", border: "none", outline: "none", marginTop: "4px" }}>
              {loading ? "Preparing..." : "Begin Interview"}
            </button>

            <p style={{ margin: 0, fontSize: "8px", color: "rgba(240,235,224,0.15)", textAlign: "center", letterSpacing: "0.15em", textTransform: "uppercase" }}>
              All fields optional
            </p>
          </div>

        </div>
      </div>
    </main>
  );
}
