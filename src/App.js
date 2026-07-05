import { useState, useRef, useEffect } from "react";

// ── DESIGN TOKENS ─────────────────────────────────────────────────────────────
const T = {
  yellow: "#F7C200",
  yellowDim: "#A68100",
  black: "#111111",
  paper: "#FAF8F2",
  ink: "#1C1814",
  muted: "#8C8176",
  border: "#E4DFDA",
  driverColor: "#F7C200",
  passengerColor: "#3B82F6",
  rooftopColor: "#0F9E7B",
  success: "#15803D",
};

// ── DATA ──────────────────────────────────────────────────────────────────────
const BRANDS = ["Bajaj Auto", "TVS Motor", "Mahindra Alpha", "Piaggio Ape", "Atul Auto", "Other"];

const SECTIONS = {
  driver: {
    label: "Driver Seat Cover",
    emoji: "💺",
    color: T.driverColor,
    textOnColor: "#1C1814",
    bg: "#FFFBE6",
    fields: [
      { key: "seatLength", label: "Seat Length", hint: "Front to back of seat pad" },
      { key: "seatWidth", label: "Seat Width", hint: "Left to right of seat pad" },
      { key: "sideHeight", label: "Side Flap Height", hint: "Drop on each side" },
      { key: "backrestH", label: "Backrest Height", hint: "Top to base of backrest" },
      { key: "backrestW", label: "Backrest Width", hint: "Left to right of backrest" },
    ],
  },
  passenger: {
    label: "Passenger Seat Cover",
    emoji: "👥",
    color: T.passengerColor,
    textOnColor: "#FFFFFF",
    bg: "#EFF6FF",
    fields: [
      { key: "seatLength", label: "Seat Length", hint: "Front to back of bench" },
      { key: "seatWidth", label: "Seat Width", hint: "Full bench width" },
      { key: "sideHeight", label: "Side Flap Height", hint: "Drop on each side" },
      { key: "backrestH", label: "Backrest Height", hint: "Top to base of backrest" },
      { key: "backrestW", label: "Backrest Width", hint: "Full backrest width" },
    ],
  },
  rooftop: {
    label: "Rooftop Cover",
    emoji: "🏠",
    color: T.rooftopColor,
    textOnColor: "#FFFFFF",
    bg: "#F0FDFB",
    fields: [
      { key: "length", label: "Roof Length", hint: "Total front to back" },
      { key: "width", label: "Roof Width", hint: "Total side to side" },
      { key: "frontOverhang", label: "Front Overhang", hint: "Extension past front edge" },
      { key: "rearOverhang", label: "Rear Overhang", hint: "Extension past rear edge" },
      { key: "sideOverhang", label: "Side Overhang (each)", hint: "Per-side extension" },
    ],
  },
};

const COVER_KEYS = ["driver", "passenger", "rooftop"];

const initSection = () => ({ image: null, measurements: {}, notes: "", chat: [] });

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function RexiFitApp() {
  const [step, setStep] = useState(0);
  const [brand, setBrand] = useState("");
  const [customBrand, setCustomBrand] = useState("");
  const [regNo, setRegNo] = useState("");
  const [jobDate, setJobDate] = useState(new Date().toISOString().slice(0, 10));

  const [sectionData, setSectionData] = useState({
    driver: initSection(),
    passenger: initSection(),
    rooftop: initSection(),
  });

  const [cameraOpen, setCameraOpen] = useState(false);
  const [previewImg, setPreviewImg] = useState(null);
  const [flash, setFlash] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [chatInput, setChatInput] = useState("");

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const chatBottomRef = useRef(null);

  const isCoverStep = step >= 1 && step <= 3;
  const coverKey = isCoverStep ? COVER_KEYS[step - 1] : null;
  const coverSec = coverKey ? SECTIONS[coverKey] : null;
  const coverData = coverKey ? sectionData[coverKey] : null;
  const brandName = brand === "Other" ? customBrand : brand;

  // Attach stream to video after camera opens
  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOpen]);

  // Scroll chat
  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }); });

  // ── CAMERA ──────────────────────────────────────────────────────────────────
  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
      alert("Camera access denied. Use file upload instead.");
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };

  const captureFrame = () => {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth || 640;
    c.height = v.videoHeight || 480;
    c.getContext("2d").drawImage(v, 0, 0);
    const dataURL = c.toDataURL("image/jpeg", 0.85);
    setFlash(true);
    setTimeout(() => setFlash(false), 220);
    stopCamera();
    setPreviewImg(dataURL);
  };

  const handleUpload = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPreviewImg(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const confirmImage = async () => {
    if (!previewImg || !coverKey) return;
    const img = previewImg;
    setSection(coverKey, "image", img);
    setPreviewImg(null);
    await analyzeImage(img, coverKey);
  };

  // ── AI ───────────────────────────────────────────────────────────────────────
  const analyzeImage = async (dataURL, secKey) => {
    setAiLoading(true);
    const base64 = dataURL.split(",")[1];
    const sec = SECTIONS[secKey];
    const guide = sec.fields.map(f => `• ${f.label}: ${f.hint}`).join("\n");

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
              {
                type: "text",
                text: `You are RexiFit AI — a measurement guide for auto rickshaw rexine cover fabrication in Mumbai, India.

Scanned item: **${sec.label}**

Tasks:
1. In 1–2 sentences, describe what you see and confirm the image is usable.
2. Give specific measurement guidance for each of these dimensions:
${guide}
3. Flag any issues affecting fabrication (wear, unusual shape, extra padding, stitching type).

Keep it concise and practical. Always use cm. Refer to what you see in the image specifically.`,
              },
            ],
          }],
        }),
      });
      const result = await res.json();
      const text = result.content?.map(b => b.text || "").join("").trim() ||
        "Image saved. Enter measurements below — ask me if you need help.";
      pushChat(secKey, "ai", text);
    } catch {
      pushChat(secKey, "ai", `📸 ${sec.label} image saved! Enter the measurements below. I'm here if you need guidance on any dimension.`);
    }
    setAiLoading(false);
  };

  const sendChat = async () => {
    if (!chatInput.trim() || !coverKey || aiLoading) return;
    const msg = chatInput.trim();
    setChatInput("");
    pushChat(coverKey, "user", msg);
    setAiLoading(true);

    const history = (sectionData[coverKey]?.chat || []).map(m => ({
      role: m.role === "ai" ? "assistant" : "user",
      content: m.text,
    }));

    const enteredMeasurements = Object.entries(sectionData[coverKey]?.measurements || {})
      .filter(([, v]) => v).map(([k, v]) => `${k}: ${v} cm`).join(", ");

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 700,
          system: `You are RexiFit AI, measurement assistant for auto rickshaw rexine cover fabrication in Mumbai.
Current section: ${coverSec?.label}. Measurements entered so far: ${enteredMeasurements || "none"}.
Be concise, practical, always use cm. Help the user measure accurately.`,
          messages: [...history, { role: "user", content: msg }],
        }),
      });
      const result = await res.json();
      const text = result.content?.map(b => b.text || "").join("").trim() || "Please try again.";
      pushChat(coverKey, "ai", text);
    } catch {
      pushChat(coverKey, "ai", "Connection issue. Please try again.");
    }
    setAiLoading(false);
  };

  // ── STATE HELPERS ────────────────────────────────────────────────────────────
  const setSection = (key, field, value) =>
    setSectionData(p => ({ ...p, [key]: { ...p[key], [field]: value } }));

  const setMeasurement = (secKey, fieldKey, value) =>
    setSectionData(p => ({
      ...p,
      [secKey]: { ...p[secKey], measurements: { ...p[secKey].measurements, [fieldKey]: value } },
    }));

  const pushChat = (secKey, role, text) =>
    setSectionData(p => ({
      ...p,
      [secKey]: {
        ...p[secKey],
        chat: [
          ...(p[secKey]?.chat || []),
          { role, text, time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) },
        ],
      },
    }));

  const getProgress = secKey => {
    const fields = SECTIONS[secKey].fields;
    const m = sectionData[secKey].measurements;
    return fields.filter(f => m[f.key]).length;
  };

  // ── EXPORT ───────────────────────────────────────────────────────────────────
  const saveReport = () => {
    const lines = [
      "═══════════════════════════════════",
      "     REXIFIT COVER MEASUREMENT",
      "═══════════════════════════════════",
      `Brand   : ${brandName}`,
      `Reg No  : ${regNo || "—"}`,
      `Date    : ${jobDate}`,
      "───────────────────────────────────",
    ];
    COVER_KEYS.forEach(key => {
      const sec = SECTIONS[key];
      const sd = sectionData[key];
      lines.push("", `[ ${sec.label} ]`);
      sec.fields.forEach(f => {
        const val = sd.measurements[f.key];
        lines.push(`  ${f.label.padEnd(22)}: ${val ? val + " cm" : "—"}`);
      });
      if (sd.notes) lines.push(`  Notes: ${sd.notes}`);
    });
    lines.push("", "═══════════════════════════════════");
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rexifit-${brandName.replace(/ /g, "_")}-${jobDate}.txt`;
    a.click();
  };

  // ── STYLES ───────────────────────────────────────────────────────────────────
  const s = {
    page: { minHeight: "100vh", background: T.paper, fontFamily: "'Helvetica Neue', Arial, system-ui, sans-serif", color: T.ink },
    header: { background: T.black, padding: "14px 20px", display: "flex", alignItems: "center", gap: 14, position: "sticky", top: 0, zIndex: 50 },
    body: { maxWidth: 620, margin: "0 auto", padding: "0 16px 80px" },
    card: { background: "white", borderRadius: 14, padding: 20, marginBottom: 14, border: `1px solid ${T.border}` },
    label: { fontSize: 12, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8, display: "block" },
    input: { width: "100%", padding: "11px 14px", border: `1.5px solid ${T.border}`, borderRadius: 9, fontSize: 15, boxSizing: "border-box", outline: "none", fontFamily: "inherit", color: T.ink, background: "white" },
    btn: (bg, col, disabled) => ({
      padding: "13px 20px", borderRadius: 10, border: "none",
      background: disabled ? "#E4DFDA" : bg, color: disabled ? T.muted : col,
      fontWeight: 800, fontSize: 15, cursor: disabled ? "not-allowed" : "pointer",
      letterSpacing: "0.02em",
    }),
    measureRow: { display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: T.paper, borderRadius: 9, marginBottom: 8, border: `1px solid ${T.border}` },
    numInput: { width: 70, padding: "8px 10px", border: `1.5px solid ${T.border}`, borderRadius: 7, fontSize: 17, textAlign: "right", fontWeight: 700, outline: "none", fontFamily: "inherit", color: T.ink },
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // CAMERA OVERLAY
  // ─────────────────────────────────────────────────────────────────────────────
  if (cameraOpen) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#000", display: "flex", flexDirection: "column", zIndex: 9999 }}>
        {flash && <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.85)", zIndex: 20, pointerEvents: "none" }} />}

        <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
          <video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} playsInline muted />

          {/* Scan window overlay */}
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {/* Dark surround */}
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }} />
            {/* Clear window */}
            <div style={{
              position: "absolute", top: "18%", left: "6%", right: "6%", bottom: "22%",
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
              borderRadius: 6,
            }}>
              {/* Corners */}
              {[
                { top: 0, left: 0, borderTop: `3px solid ${T.yellow}`, borderLeft: `3px solid ${T.yellow}` },
                { top: 0, right: 0, borderTop: `3px solid ${T.yellow}`, borderRight: `3px solid ${T.yellow}` },
                { bottom: 0, left: 0, borderBottom: `3px solid ${T.yellow}`, borderLeft: `3px solid ${T.yellow}` },
                { bottom: 0, right: 0, borderBottom: `3px solid ${T.yellow}`, borderRight: `3px solid ${T.yellow}` },
              ].map((st, i) => (
                <div key={i} style={{ position: "absolute", width: 24, height: 24, ...st }} />
              ))}
              {/* Center crosshair */}
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}>
                <div style={{ width: 20, height: 1, background: `rgba(${T.yellow},0.6)`, background: "rgba(247,194,0,0.5)" }} />
                <div style={{ width: 1, height: 20, background: "rgba(247,194,0,0.5)", position: "absolute", top: -10, left: 9 }} />
              </div>
            </div>
          </div>

          {/* Top bar */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "16px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick={stopCamera} style={{ background: "rgba(0,0,0,0.6)", border: "none", color: "white", padding: "8px 16px", borderRadius: 20, cursor: "pointer", fontSize: 14 }}>
              ✕ Cancel
            </button>
            <div style={{ background: "rgba(0,0,0,0.65)", padding: "6px 14px", borderRadius: 20 }}>
              <span style={{ color: T.yellow, fontSize: 13, fontWeight: 700 }}>
                {coverSec?.emoji} {coverSec?.label}
              </span>
            </div>
          </div>

          <p style={{ position: "absolute", bottom: "24%", left: 0, right: 0, textAlign: "center", color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
            Align cover within frame · keep flat · good light
          </p>
        </div>

        {/* Shutter bar */}
        <div style={{ padding: "18px 24px", background: "#0A0A0A", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={() => { stopCamera(); fileRef.current?.click(); }}
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "white", padding: "10px 18px", borderRadius: 20, cursor: "pointer", fontSize: 13 }}>
            📁 Upload
          </button>
          <button onClick={captureFrame}
            style={{ width: 72, height: 72, borderRadius: "50%", background: "white", border: `5px solid ${T.yellow}`, cursor: "pointer", fontSize: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
            📷
          </button>
          <div style={{ width: 80 }} />
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // IMAGE PREVIEW
  // ─────────────────────────────────────────────────────────────────────────────
  if (previewImg) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#0D0D0D", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 9999 }}>
        <p style={{ color: T.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Review scan</p>
        <h2 style={{ color: "white", fontSize: 20, margin: "0 0 18px", textAlign: "center" }}>{coverSec?.label}</h2>
        <img src={previewImg} alt="preview"
          style={{ maxWidth: "100%", maxHeight: "55vh", borderRadius: 12, border: `2px solid ${T.yellow}`, objectFit: "contain" }} />
        <p style={{ color: T.muted, fontSize: 13, marginTop: 14, textAlign: "center" }}>
          Is the image clear and well-lit?
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
          <button onClick={() => setPreviewImg(null)}
            style={{ padding: "12px 28px", borderRadius: 10, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "white", cursor: "pointer", fontSize: 14 }}>
            🔄 Retake
          </button>
          <button onClick={confirmImage}
            style={{ padding: "12px 28px", borderRadius: 10, background: T.yellow, border: "none", color: T.ink, fontWeight: 800, cursor: "pointer", fontSize: 14 }}>
            ✓ Use This Photo
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MAIN APP
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleUpload} />

      {/* ── HEADER ── */}
      <div style={s.header}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: T.yellow, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
          🛺
        </div>
        <div>
          <div style={{ color: T.yellow, fontWeight: 800, fontSize: 17, letterSpacing: "0.03em" }}>RexiFit Measure</div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Auto Rickshaw Cover Measurement</div>
        </div>
        {brandName && step > 0 && (
          <div style={{ marginLeft: "auto", color: T.yellow, fontSize: 12, fontWeight: 700, background: "rgba(247,194,0,0.12)", padding: "5px 12px", borderRadius: 20, border: "1px solid rgba(247,194,0,0.25)" }}>
            {brandName}
          </div>
        )}
      </div>

      {/* ── STEP TABS ── */}
      <div style={{ background: "white", borderBottom: `1px solid ${T.border}`, overflowX: "auto" }}>
        <div style={{ maxWidth: 620, margin: "0 auto", display: "flex" }}>
          {[
            { icon: "🛺", label: "Brand" },
            { icon: "💺", label: "Driver" },
            { icon: "👥", label: "Pax Seat" },
            { icon: "🏠", label: "Rooftop" },
            { icon: "📋", label: "Preview" },
          ].map((tab, i) => {
            const active = i === step;
            const done = i < step;
            return (
              <div key={i} onClick={() => done && setStep(i)}
                style={{
                  flex: 1, padding: "10px 4px", textAlign: "center",
                  cursor: done ? "pointer" : "default",
                  borderBottom: `3px solid ${active ? T.yellow : "transparent"}`,
                  color: active ? T.ink : done ? T.muted : "#C4BFBA",
                  minWidth: 60,
                }}>
                <div style={{ fontSize: 18, marginBottom: 2 }}>{done && !active ? "✓" : tab.icon}</div>
                <div style={{ fontSize: 10, fontWeight: active ? 800 : 500, letterSpacing: "0.04em" }}>{tab.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={s.body}>

        {/* ══════════════════════════════════════════════════════════════════════
            STEP 0 — BRAND
        ══════════════════════════════════════════════════════════════════════ */}
        {step === 0 && (
          <div style={{ paddingTop: 20 }}>
            {/* Hero */}
            <div style={{ textAlign: "center", padding: "28px 0 22px" }}>
              <div style={{ fontSize: 64, marginBottom: 12 }}>🛺</div>
              <h1 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 800, color: T.ink }}>
                Auto Rickshaw Details
              </h1>
              <p style={{ margin: 0, color: T.muted, fontSize: 14 }}>
                Select the brand to start capturing cover measurements
              </p>
            </div>

            {/* Brand picker */}
            <div style={s.card}>
              <span style={s.label}>Auto Rickshaw Brand *</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {BRANDS.map(b => (
                  <button key={b} onClick={() => setBrand(b)} style={{
                    padding: "12px 10px", borderRadius: 10, cursor: "pointer", fontSize: 13,
                    fontWeight: brand === b ? 800 : 500, textAlign: "center",
                    border: `2px solid ${brand === b ? T.yellow : T.border}`,
                    background: brand === b ? "#FFFBE6" : "#FAFAF8",
                    color: brand === b ? "#8A6700" : T.ink,
                  }}>{b}</button>
                ))}
              </div>
              {brand === "Other" && (
                <input value={customBrand} onChange={e => setCustomBrand(e.target.value)}
                  placeholder="Enter brand name..."
                  style={{ ...s.input, marginTop: 10 }} />
              )}
            </div>

            {/* Vehicle info */}
            <div style={s.card}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <span style={s.label}>Reg. Number</span>
                  <input value={regNo} onChange={e => setRegNo(e.target.value)}
                    placeholder="MH 01 AB 1234" style={s.input} />
                </div>
                <div>
                  <span style={s.label}>Measurement Date</span>
                  <input type="date" value={jobDate} onChange={e => setJobDate(e.target.value)}
                    style={s.input} />
                </div>
              </div>
            </div>

            <button disabled={!brandName} onClick={() => setStep(1)} style={{ ...s.btn(T.yellow, T.ink, !brandName), width: "100%" }}>
              Start Measuring →
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            STEPS 1–3 — COVER SECTIONS
        ══════════════════════════════════════════════════════════════════════ */}
        {isCoverStep && coverKey && (
          <div style={{ paddingTop: 16 }}>
            {/* Section heading */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 16 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 13, background: coverSec.bg,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 26, border: `2px solid ${coverSec.color}22`,
              }}>
                {coverSec.emoji}
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{coverSec.label}</h2>
                <p style={{ margin: 0, color: T.muted, fontSize: 12 }}>Step {step} of 3 · Scan → Measure → Notes</p>
              </div>
              <div style={{ fontSize: 12, color: T.muted }}>
                {getProgress(coverKey)}/{coverSec.fields.length} fields
              </div>
            </div>

            {/* ── SCAN CARD ── */}
            <div style={s.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>📸 Scan Image</span>
                {coverData?.image
                  ? <span style={{ fontSize: 11, color: T.success, background: "#DCFCE7", padding: "3px 10px", borderRadius: 20, fontWeight: 700 }}>✓ Captured</span>
                  : <span style={{ fontSize: 11, color: T.muted }}>Scan for AI guidance</span>
                }
              </div>

              {coverData?.image ? (
                <div style={{ position: "relative" }}>
                  <img src={coverData.image} alt="scan"
                    style={{ width: "100%", borderRadius: 10, maxHeight: 180, objectFit: "cover", display: "block" }} />
                  <button onClick={() => setSection(coverKey, "image", null)} style={{
                    position: "absolute", top: 8, right: 8,
                    background: "rgba(0,0,0,0.65)", border: "none", color: "white",
                    padding: "5px 12px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 600
                  }}>🔄 Rescan</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={openCamera} style={{
                    flex: 1, padding: 16, borderRadius: 10, fontSize: 14, fontWeight: 700,
                    border: `2px dashed ${coverSec.color}`, background: coverSec.bg,
                    color: T.ink, cursor: "pointer",
                  }}>
                    📷 Camera Scan
                  </button>
                  <button onClick={() => fileRef.current?.click()} style={{
                    flex: 1, padding: 16, borderRadius: 10, fontSize: 14,
                    border: `2px dashed ${T.border}`, background: T.paper,
                    color: T.muted, cursor: "pointer",
                  }}>
                    📁 Upload Photo
                  </button>
                </div>
              )}
            </div>

            {/* ── AI ASSISTANT ── */}
            <div style={{
              background: "#0D0D0D", borderRadius: 14, marginBottom: 14, overflow: "hidden",
              border: "1px solid #2A2A2A",
            }}>
              {/* AI header */}
              <div style={{ padding: "11px 16px", borderBottom: "1px solid #1E1E1E", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: aiLoading ? "#F59E0B" : "#22C55E" }} />
                <span style={{ color: T.yellow, fontWeight: 800, fontSize: 14 }}>RexiFit AI</span>
                <span style={{ color: "#3D3D3D", fontSize: 12 }}>measurement assistant</span>
                {aiLoading && <span style={{ marginLeft: "auto", color: "#555", fontSize: 12 }}>analyzing ●●●</span>}
              </div>

              {/* Chat messages */}
              <div style={{ height: 210, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                {(!coverData?.chat || coverData.chat.length === 0) && !aiLoading && (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <span style={{ fontSize: 36 }}>🤖</span>
                    <p style={{ color: "#3A3A3A", fontSize: 13, textAlign: "center", margin: 0, lineHeight: 1.6 }}>
                      Scan or upload a photo to get<br />AI measurement guidance
                    </p>
                  </div>
                )}

                {coverData?.chat?.map((msg, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: msg.role === "user" ? "row-reverse" : "row", gap: 8, alignItems: "flex-start" }}>
                    {msg.role === "ai" && (
                      <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#1A1A1A", border: "1px solid #2A2A2A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0, marginTop: 2 }}>
                        🤖
                      </div>
                    )}
                    <div style={{
                      maxWidth: "82%", padding: "10px 14px", fontSize: 13, lineHeight: 1.6,
                      borderRadius: msg.role === "ai" ? "4px 12px 12px 12px" : "12px 4px 12px 12px",
                      background: msg.role === "ai" ? "#1A1A1A" : T.yellow,
                      color: msg.role === "ai" ? "#D4D0CC" : T.ink,
                      whiteSpace: "pre-wrap", wordBreak: "break-word",
                    }}>
                      {msg.text}
                      <div style={{ fontSize: 10, opacity: 0.4, marginTop: 5, textAlign: "right" }}>{msg.time}</div>
                    </div>
                  </div>
                ))}

                {aiLoading && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#1A1A1A", border: "1px solid #2A2A2A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🤖</div>
                    <div style={{ background: "#1A1A1A", padding: "10px 14px", borderRadius: "4px 12px 12px 12px", color: "#444", fontSize: 16, letterSpacing: 4 }}>●●●</div>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Chat input */}
              <div style={{ padding: "8px 12px", borderTop: "1px solid #1E1E1E", display: "flex", gap: 8 }}>
                <input
                  value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChat()}
                  placeholder="Ask about measurements, size, fit..."
                  style={{
                    flex: 1, background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 20,
                    padding: "9px 16px", color: "#D4D0CC", fontSize: 13, outline: "none",
                  }}
                />
                <button onClick={sendChat} disabled={!chatInput.trim() || aiLoading} style={{
                  background: T.yellow, border: "none", borderRadius: 20, padding: "9px 16px",
                  color: T.ink, fontWeight: 800, fontSize: 16, cursor: "pointer",
                  opacity: chatInput.trim() && !aiLoading ? 1 : 0.35,
                }}>↑</button>
              </div>
            </div>

            {/* ── MEASUREMENTS FORM ── */}
            <div style={s.card}>
              <span style={s.label}>📏 Measurements</span>
              {coverSec.fields.map(field => (
                <div key={field.key} style={s.measureRow}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{field.label}</div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>{field.hint}</div>
                  </div>
                  <input
                    type="number" min="0" step="0.5"
                    value={coverData?.measurements?.[field.key] || ""}
                    onChange={e => setMeasurement(coverKey, field.key, e.target.value)}
                    placeholder="—"
                    style={s.numInput}
                  />
                  <span style={{ fontSize: 12, color: T.muted, width: 18, flexShrink: 0 }}>cm</span>
                </div>
              ))}
            </div>

            {/* ── NOTES ── */}
            <div style={s.card}>
              <span style={s.label}>📝 Notes & Special Instructions</span>
              <textarea
                value={coverData?.notes || ""}
                onChange={e => setSection(coverKey, "notes", e.target.value)}
                placeholder="e.g. Torn on right edge, double-layer foam, custom color request, velcro type..."
                rows={3}
                style={{ ...s.input, resize: "none", lineHeight: 1.55, padding: "11px 14px" }}
              />
            </div>

            {/* ── NAV ── */}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep(s => s - 1)} style={{ ...s.btn("white", T.ink, false), flex: 1, border: `1px solid ${T.border}` }}>
                ← Back
              </button>
              <button onClick={() => setStep(s => s + 1)} style={{ ...s.btn(coverSec.color, coverSec.textOnColor, false), flex: 2 }}>
                {step < 3 ? `Next: ${SECTIONS[COVER_KEYS[step]]?.label.split(" ")[0]} →` : "Preview Report →"}
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            STEP 4 — PREVIEW / REPORT
        ══════════════════════════════════════════════════════════════════════ */}
        {step === 4 && (
          <div style={{ paddingTop: 16 }}>
            {/* Report header card */}
            <div style={{
              background: T.black, borderRadius: 16, padding: 24, marginBottom: 16,
              position: "relative", overflow: "hidden",
            }}>
              {/* Yellow accent bar */}
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: T.yellow }} />

              <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 14, background: "rgba(247,194,0,0.12)",
                  border: "1.5px solid rgba(247,194,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, flexShrink: 0,
                }}>🛺</div>
                <div>
                  <div style={{ color: T.yellow, fontWeight: 800, fontSize: 22, marginBottom: 3 }}>{brandName}</div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    RexiFit Cover Measurement Report
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {regNo && (
                  <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 14px" }}>
                    <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Reg. Number</div>
                    <div style={{ color: "white", fontWeight: 700, fontSize: 15 }}>{regNo}</div>
                  </div>
                )}
                <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Date</div>
                  <div style={{ color: "white", fontWeight: 700, fontSize: 15 }}>
                    {new Date(jobDate + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </div>
                </div>
              </div>
            </div>

            {/* Section measurement cards */}
            {COVER_KEYS.map(key => {
              const sec = SECTIONS[key];
              const sd = sectionData[key];
              const hasMeasurements = sec.fields.some(f => sd.measurements[f.key]);
              const filled = sec.fields.filter(f => sd.measurements[f.key]).length;

              return (
                <div key={key} style={{ background: "white", borderRadius: 14, marginBottom: 14, overflow: "hidden", border: `1px solid ${T.border}` }}>
                  {/* Section header */}
                  <div style={{ background: sec.color, padding: "13px 18px", display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 22 }}>{sec.emoji}</span>
                    <span style={{ color: sec.textOnColor, fontWeight: 800, fontSize: 15, flex: 1 }}>{sec.label}</span>
                    <span style={{
                      background: "rgba(0,0,0,0.15)", color: sec.textOnColor,
                      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20
                    }}>
                      {filled}/{sec.fields.length} measured
                    </span>
                    {sd.image && (
                      <span style={{ fontSize: 11, color: sec.textOnColor, opacity: 0.8, marginLeft: 4 }}>📷</span>
                    )}
                  </div>

                  {/* Image thumbnail */}
                  {sd.image && (
                    <img src={sd.image} alt={sec.label}
                      style={{ width: "100%", maxHeight: 130, objectFit: "cover", display: "block", borderBottom: `1px solid ${T.border}` }} />
                  )}

                  <div style={{ padding: "14px 16px" }}>
                    {hasMeasurements ? (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        {sec.fields.map(f => {
                          const val = sd.measurements[f.key];
                          return (
                            <div key={f.key} style={{
                              background: val ? sec.bg : T.paper,
                              borderRadius: 10, padding: "10px 12px",
                              border: `1px solid ${val ? sec.color + "33" : T.border}`,
                            }}>
                              <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{f.label}</div>
                              <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                                <span style={{ fontSize: 22, fontWeight: 800, color: val ? T.ink : "#C4BFBA" }}>
                                  {val || "—"}
                                </span>
                                {val && <span style={{ fontSize: 12, color: T.muted, fontWeight: 500 }}>cm</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ textAlign: "center", padding: "16px", color: T.muted, fontSize: 13 }}>
                        No measurements entered
                      </div>
                    )}

                    {sd.notes && (
                      <div style={{ marginTop: 10, background: "#FFFBE6", border: "1px solid #FDE68A", borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontSize: 10, color: "#92400E", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                          📝 Notes
                        </div>
                        <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.5 }}>{sd.notes}</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Fabric estimate */}
            <div style={{ background: T.black, borderRadius: 14, padding: 18, marginBottom: 16, border: "1px solid #222" }}>
              <div style={{ color: T.yellow, fontWeight: 800, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 14 }}>
                📐 Fabric Estimate (incl. 20cm buffer)
              </div>
              {COVER_KEYS.map(key => {
                const sec = SECTIONS[key];
                const sd = sectionData[key];
                const l = parseFloat(sd.measurements.seatLength || sd.measurements.length || 0);
                const w = parseFloat(sd.measurements.seatWidth || sd.measurements.width || 0);
                if (!l || !w) return null;
                const area = ((l + 20) * (w + 20) / 10000).toFixed(2);
                return (
                  <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #1C1C1C" }}>
                    <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>{sec.emoji} {sec.label}</span>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ color: "white", fontWeight: 800, fontSize: 16 }}>≈ {area}</span>
                      <span style={{ color: T.muted, fontSize: 12 }}> m²</span>
                    </div>
                  </div>
                );
              })}
              <p style={{ color: "#333", fontSize: 11, margin: "10px 0 0" }}>
                +20 cm seam allowance added to length & width of each section
              </p>
            </div>

            {/* AI chat summary prompt */}
            {COVER_KEYS.some(k => sectionData[k].chat.length > 0) && (
              <div style={{ background: "#0D0D0D", borderRadius: 14, padding: 16, marginBottom: 16, border: "1px solid #1E1E1E" }}>
                <div style={{ color: T.yellow, fontWeight: 700, fontSize: 13, marginBottom: 10 }}>🤖 AI Measurement Notes</div>
                {COVER_KEYS.map(key => {
                  const firstAI = sectionData[key].chat.find(m => m.role === "ai");
                  if (!firstAI) return null;
                  return (
                    <div key={key} style={{ marginBottom: 10 }}>
                      <div style={{ color: T.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                        {SECTIONS[key].emoji} {SECTIONS[key].label}
                      </div>
                      <div style={{ color: "#A09896", fontSize: 12, lineHeight: 1.6 }}>
                        {firstAI.text.slice(0, 180)}{firstAI.text.length > 180 ? "..." : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
              <button onClick={() => setStep(3)} style={{ ...s.btn("white", T.ink, false), flex: 1, border: `1px solid ${T.border}` }}>
                ← Edit
              </button>
              <button onClick={saveReport} style={{ ...s.btn("#15803D", "white", false), flex: 1 }}>
                ⬇ Save .txt
              </button>
              <button onClick={() => window.print()} style={{ ...s.btn(T.yellow, T.ink, false), flex: 1 }}>
                🖨 Print
              </button>
            </div>

            {/* Start new */}
            <button onClick={() => {
              setBrand(""); setCustomBrand(""); setRegNo(""); setStep(0);
              setSectionData({ driver: initSection(), passenger: initSection(), rooftop: initSection() });
            }} style={{ ...s.btn(T.paper, T.muted, false), width: "100%", border: `1px solid ${T.border}`, marginTop: 4 }}>
              + New Measurement Job
            </button>

            <div style={{ height: 40 }} />
          </div>
        )}
      </div>
    </div>
  );
}