import { useState, useRef, useEffect } from "react";

// ── DESIGN TOKENS ─────────────────────────────────────────────────────────────
const T = {
  yellow: "#F7C200", yellowDark: "#A68100",
  black: "#111111", paper: "#FAF8F2", ink: "#1C1814",
  muted: "#8C8176", border: "#E4DFDA", success: "#15803D",
  driverColor: "#F7C200", passengerColor: "#3B82F6", rooftopColor: "#0F9E7B",
};

const BRANDS = ["Bajaj Auto", "TVS Motor", "Mahindra Alpha", "Piaggio Ape", "Atul Auto", "Other"];

const SECTIONS = {
  driver: {
    label: "Driver Seat Cover", emoji: "💺",
    color: T.driverColor, textOnColor: "#1C1814", bg: "#FFFBE6",
    fields: [
      { key: "seatLength", label: "Seat Length",    hint: "Front to back of seat pad" },
      { key: "seatWidth",  label: "Seat Width",     hint: "Left to right of seat pad" },
      { key: "sideHeight", label: "Side Flap Height", hint: "Drop on each side" },
      { key: "backrestH",  label: "Backrest Height", hint: "Top to base of backrest" },
      { key: "backrestW",  label: "Backrest Width",  hint: "Left to right of backrest" },
    ],
  },
  passenger: {
    label: "Passenger Seat Cover", emoji: "👥",
    color: T.passengerColor, textOnColor: "#FFFFFF", bg: "#EFF6FF",
    fields: [
      { key: "seatLength", label: "Seat Length",    hint: "Front to back of bench" },
      { key: "seatWidth",  label: "Seat Width",     hint: "Full bench width" },
      { key: "sideHeight", label: "Side Flap Height", hint: "Drop on each side" },
      { key: "backrestH",  label: "Backrest Height", hint: "Top to base of backrest" },
      { key: "backrestW",  label: "Backrest Width",  hint: "Full backrest width" },
    ],
  },
  rooftop: {
    label: "Rooftop Cover", emoji: "🏠",
    color: T.rooftopColor, textOnColor: "#FFFFFF", bg: "#F0FDFB",
    fields: [
      { key: "length",       label: "Roof Length",          hint: "Total front to back" },
      { key: "width",        label: "Roof Width",           hint: "Total side to side" },
      { key: "frontOverhang",label: "Front Overhang",       hint: "Extension past front edge" },
      { key: "rearOverhang", label: "Rear Overhang",        hint: "Extension past rear edge" },
      { key: "sideOverhang", label: "Side Overhang (each)", hint: "Per-side extension" },
    ],
  },
};

const COVER_KEYS = ["driver", "passenger", "rooftop"];

const FILTERS = [
  { key: "original",  label: "Original",  icon: "🖼" },
  { key: "enhanced",  label: "Enhanced",  icon: "✨" },
  { key: "bw",        label: "B&W",       icon: "⬛" },
  { key: "warm",      label: "Warm",      icon: "🟡" },
];

const initSection = () => ({ image: null, measurements: {}, notes: "" });

// ── APPLY IMAGE FILTER (Google Drive style) ───────────────────────────────────
function applyFilter(dataURL, filter) {
  return new Promise(resolve => {
    if (filter === "original") { resolve(dataURL); return; }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width  = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;

      for (let i = 0; i < d.length; i += 4) {
        if (filter === "enhanced") {
          d[i]   = Math.min(255, Math.max(0, (d[i]   - 128) * 1.35 + 140));
          d[i+1] = Math.min(255, Math.max(0, (d[i+1] - 128) * 1.35 + 140));
          d[i+2] = Math.min(255, Math.max(0, (d[i+2] - 128) * 1.35 + 140));
        } else if (filter === "bw") {
          const gray = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
          const val  = Math.min(255, Math.max(0, (gray - 128) * 1.6 + 150));
          d[i] = d[i+1] = d[i+2] = val;
        } else if (filter === "warm") {
          d[i]   = Math.min(255, d[i]   + 18);
          d[i+1] = Math.min(255, d[i+1] + 6);
          d[i+2] = Math.max(0,   d[i+2] - 12);
        }
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.src = dataURL;
  });
}

// ── OPENCV.JS WORKFLOW ─────────────────────────────────────────────────────────────

// Load OpenCV.js dynamically with proper promise handling
function loadOpenCV() {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (typeof cv !== 'undefined' && cv.Mat) {
      resolve(cv);
      return;
    }

    // Check if script already exists
    const existingScript = document.querySelector('script[src*="opencv.js"]');
    if (existingScript) {
      // Wait for it to load
      const checkCV = setInterval(() => {
        if (typeof cv !== 'undefined' && cv.Mat) {
          clearInterval(checkCV);
          resolve(cv);
        }
      }, 100);
      return;
    }

    // Load OpenCV.js
    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.5.5/opencv.js';
    script.async = true;
    
    script.onload = () => {
      // Wait for OpenCV to be fully initialized
      const checkCV = setInterval(() => {
        if (typeof cv !== 'undefined' && cv.Mat) {
          clearInterval(checkCV);
          console.log('OpenCV.js loaded successfully');
          resolve(cv);
        }
      }, 100);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkCV);
        reject(new Error('OpenCV.js load timeout'));
      }, 10000);
    };
    
    script.onerror = () => {
      reject(new Error('Failed to load OpenCV.js'));
    };
    
    document.head.appendChild(script);
  });
}

// ── IMAGE PROCESSING PIPELINE ─────────────────────────────────────────────────────

async function processImageForMeasurements(imageDataURL) {
  try {
    console.log('Starting image processing...');
    
    // Load OpenCV
    const cv = await loadOpenCV();
    console.log('OpenCV loaded');
    
    // Step 1: Load image
    const img = await createImageElement(imageDataURL);
    console.log('Image loaded');
    
    const src = cv.imread(img);
    if (!src || src.empty()) {
      throw new Error('Failed to read image');
    }
    console.log('Image converted to OpenCV format');
    
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    console.log('Converted to grayscale');
    
    // Step 2: Edge detection
    const edges = new cv.Mat();
    cv.Canny(gray, edges, 50, 150, 3);
    console.log('Edge detection complete');
    
    // Step 3: Contour detection
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    console.log('Contour detection complete');
    
    // Step 4: Find A4 paper (largest quadrilateral)
    let a4Contour = null;
    let a4Area = 0;
    const contourCount = contours.size();
    console.log(`Found ${contourCount} contours`);
    
    for (let i = 0; i < contourCount; i++) {
      const contour = contours.get(i);
      const perimeter = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);
      
      if (approx.rows === 4) {
        const area = cv.contourArea(contour);
        if (area > a4Area && area > 1000) {
          a4Area = area;
          a4Contour = approx.clone();
          console.log(`Found A4 candidate with area: ${area}`);
        }
      }
      approx.delete();
    }
    
    if (!a4Contour) {
      cleanup(src, gray, edges, contours, hierarchy);
      return { error: 'No A4 paper detected. Please place A4 paper next to the seat.' };
    }
    console.log('A4 paper detected');
    
    // Step 5: Perspective transform (correct A4 to straight rectangle)
    const a4Points = getContourPoints(a4Contour);
    const a4Width = 21; // A4 width in cm
    const a4Height = 29.7; // A4 height in cm
    
    const dstPoints = [
      [0, 0],
      [a4Width * 100, 0], // Scale up for precision
      [a4Width * 100, a4Height * 100],
      [0, a4Height * 100]
    ];
    
    const transformMat = cv.getPerspectiveTransform(a4Points, dstPoints);
    const warped = new cv.Mat();
    const dstSize = new cv.Size(Math.round(a4Width * 100), Math.round(a4Height * 100));
    cv.warpPerspective(src, warped, transformMat, dstSize);
    console.log('Perspective transform complete');
    
    // Step 6: Calculate pixels per cm
    const pixelsPerCm = dstSize.width / a4Width;
    console.log(`Pixels per cm: ${pixelsPerCm}`);
    
    // Step 7: Detect seat outline in the warped image
    const seatGray = new cv.Mat();
    cv.cvtColor(warped, seatGray, cv.COLOR_RGBA2GRAY);
    
    const seatEdges = new cv.Mat();
    cv.Canny(seatGray, seatEdges, 30, 100, 3);
    
    const seatContours = new cv.MatVector();
    const seatHierarchy = new cv.Mat();
    cv.findContours(seatEdges, seatContours, seatHierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    
    // Find the largest contour (likely the seat)
    let seatContour = null;
    let seatArea = 0;
    const seatCount = seatContours.size();
    console.log(`Found ${seatCount} seat contours`);
    
    for (let i = 0; i < seatCount; i++) {
      const contour = seatContours.get(i);
      const area = cv.contourArea(contour);
      if (area > seatArea && area > 500) {
        seatArea = area;
        seatContour = contour.clone();
        console.log(`Seat candidate area: ${area}`);
      }
    }
    
    if (!seatContour) {
      cleanup(src, gray, edges, contours, hierarchy, warped, seatGray, seatEdges, seatContours, seatHierarchy);
      return { error: 'No seat detected. Please ensure the seat is clearly visible.' };
    }
    console.log('Seat detected');
    
    // Step 8: Calculate seat measurements
    const rect = cv.boundingRect(seatContour);
    const lengthCm = rect.width / pixelsPerCm;
    const widthCm = rect.height / pixelsPerCm;
    console.log(`Measurements: ${lengthCm}cm x ${widthCm}cm`);
    
    // Step 9: Generate visualization
    const resultImg = warped.clone();
    
    // Draw seat rectangle
    const color = new cv.Scalar(0, 255, 0, 255);
    cv.rectangle(resultImg, rect, color, 3);
    
    // Draw A4 paper outline (for reference)
    const a4Rect = new cv.Rect(0, 0, dstSize.width, dstSize.height);
    const a4Color = new cv.Scalar(255, 0, 0, 255);
    cv.rectangle(resultImg, a4Rect, a4Color, 2);
    
    // Add measurements text
    const textColor = new cv.Scalar(0, 255, 0, 255);
    const font = cv.FONT_HERSHEY_SIMPLEX;
    cv.putText(resultImg, `Length: ${lengthCm.toFixed(1)} cm`, new cv.Point(10, 30), font, 0.7, textColor, 2);
    cv.putText(resultImg, `Width: ${widthCm.toFixed(1)} cm`, new cv.Point(10, 60), font, 0.7, textColor, 2);
    cv.putText(resultImg, `A4 Reference: ${pixelsPerCm.toFixed(1)} px/cm`, new cv.Point(10, 90), font, 0.5, new cv.Scalar(255, 0, 0, 255), 1);
    
    // Convert result to data URL
    const resultDataURL = matToDataURL(resultImg);
    console.log('Result image generated');
    
    // Cleanup
    cleanup(src, gray, edges, contours, hierarchy, warped, seatGray, seatEdges, seatContours, seatHierarchy, resultImg);
    
    return {
      success: true,
      lengthCm: parseFloat(lengthCm.toFixed(1)),
      widthCm: parseFloat(widthCm.toFixed(1)),
      pixelsPerCm: parseFloat(pixelsPerCm.toFixed(1)),
      imageDataURL: resultDataURL,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    };
    
  } catch (error) {
    console.error('Image processing error:', error);
    return { error: 'Processing failed: ' + error.message };
  }
}

// ── HELPER FUNCTIONS ─────────────────────────────────────────────────────────────

function createImageElement(dataURL) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataURL;
  });
}

function getContourPoints(contour) {
  const points = [];
  for (let i = 0; i < contour.rows; i++) {
    const x = contour.data32S[i * 2];
    const y = contour.data32S[i * 2 + 1];
    points.push([x, y]);
  }
  return points;
}

function matToDataURL(mat) {
  const canvas = document.createElement('canvas');
  cv.imshow(canvas, mat);
  return canvas.toDataURL('image/jpeg', 0.9);
}

function cleanup(...mats) {
  mats.forEach(mat => {
    if (mat && mat.delete) {
      try { mat.delete(); } catch (e) {}
    }
  });
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function RexiFitApp() {
  const [step,        setStep]        = useState(0);
  const [brand,       setBrand]       = useState("");
  const [customBrand, setCustomBrand] = useState("");
  const [regNo,       setRegNo]       = useState("");
  const [jobDate,     setJobDate]     = useState(new Date().toISOString().slice(0, 10));
  const [sectionData, setSectionData] = useState({
    driver: initSection(), passenger: initSection(), rooftop: initSection(),
  });
  const [cameraOpen,    setCameraOpen]    = useState(false);
  const [rawImg,        setRawImg]        = useState(null);   // original capture
  const [previewImg,    setPreviewImg]    = useState(null);   // filter-applied preview
  const [activeFilter,  setActiveFilter]  = useState("original");
  const [flash,         setFlash]         = useState(false);
  const [filterLoading, setFilterLoading] = useState(false);
  
  // OpenCV states
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState(null);
  const [showProcessedImage, setShowProcessedImage] = useState(false);
  const [opencvLoaded, setOpencvLoaded] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef   = useRef(null);

  const isCoverStep = step >= 1 && step <= 3;
  const coverKey  = isCoverStep ? COVER_KEYS[step - 1] : null;
  const coverSec  = coverKey ? SECTIONS[coverKey] : null;
  const coverData = coverKey ? sectionData[coverKey] : null;
  const brandName = brand === "Other" ? customBrand : brand;

  // Attach stream once camera opens
  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOpen]);

  // Apply filter whenever rawImg or activeFilter changes
  useEffect(() => {
    if (!rawImg) return;
    setFilterLoading(true);
    applyFilter(rawImg, activeFilter).then(result => {
      setPreviewImg(result);
      setFilterLoading(false);
    });
  }, [rawImg, activeFilter]);

  // Preload OpenCV on component mount
  useEffect(() => {
    loadOpenCV()
      .then(() => setOpencvLoaded(true))
      .catch(err => console.error('Failed to load OpenCV:', err));
  }, []);

  // ── CAMERA ──────────────────────────────────────────────────────────────────
  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
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
    c.width  = v.videoWidth  || 1280;
    c.height = v.videoHeight || 720;
    c.getContext("2d").drawImage(v, 0, 0);
    const dataURL = c.toDataURL("image/jpeg", 0.9);
    setFlash(true);
    setTimeout(() => setFlash(false), 220);
    stopCamera();
    setActiveFilter("original");
    setRawImg(dataURL);
  };

  const handleUpload = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setActiveFilter("original");
      setRawImg(ev.target.result);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const confirmImage = () => {
    if (!previewImg || !coverKey) return;
    setSection(coverKey, "image", previewImg);
    setRawImg(null);
    setPreviewImg(null);
    setActiveFilter("original");
    setProcessResult(null);
    setShowProcessedImage(false);
  };

  const retake = () => {
    setRawImg(null);
    setPreviewImg(null);
    setActiveFilter("original");
    setProcessResult(null);
    setShowProcessedImage(false);
  };

  // ── STATE HELPERS ────────────────────────────────────────────────────────────
  const setSection = (key, field, value) =>
    setSectionData(p => ({ ...p, [key]: { ...p[key], [field]: value } }));

  const setMeasurement = (secKey, fieldKey, value) =>
    setSectionData(p => ({
      ...p,
      [secKey]: { ...p[secKey], measurements: { ...p[secKey].measurements, [fieldKey]: value } },
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
      const sd  = sectionData[key];
      lines.push("", `[ ${sec.label} ]`);
      sec.fields.forEach(f => {
        const val = sd.measurements[f.key];
        lines.push(`  ${f.label.padEnd(24)}: ${val ? val + " cm" : "—"}`);
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

  // ── SHARED STYLES ────────────────────────────────────────────────────────────
  const card     = { background:"white", borderRadius:14, padding:20, marginBottom:14, border:`1px solid ${T.border}` };
  const lbl      = { fontSize:12, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8, display:"block" };
  const inp      = { width:"100%", padding:"11px 14px", border:`1.5px solid ${T.border}`, borderRadius:9, fontSize:15, boxSizing:"border-box", outline:"none", fontFamily:"inherit", color:T.ink, background:"white" };
  const numInp   = { width:72, padding:"8px 10px", border:`1.5px solid ${T.border}`, borderRadius:7, fontSize:17, textAlign:"right", fontWeight:700, outline:"none", fontFamily:"inherit", color:T.ink };
  const btn      = (bg, col, dis) => ({ padding:"13px 20px", borderRadius:10, border:"none", background:dis?"#E4DFDA":bg, color:dis?T.muted:col, fontWeight:800, fontSize:15, cursor:dis?"not-allowed":"pointer" });

  // ─────────────────────────────────────────────────────────────────────────────
  // CAMERA OVERLAY
  // ─────────────────────────────────────────────────────────────────────────────
  if (cameraOpen) {
    return (
      <div style={{ position:"fixed", inset:0, background:"#000", display:"flex", flexDirection:"column", zIndex:9999 }}>
        {flash && <div style={{ position:"absolute", inset:0, background:"rgba(255,255,255,0.9)", zIndex:20, pointerEvents:"none" }} />}

        <div style={{ position:"relative", flex:1, overflow:"hidden" }}>
          <video ref={videoRef} style={{ width:"100%", height:"100%", objectFit:"cover" }} playsInline muted />

          {/* Scan overlay */}
          <div style={{ position:"absolute", inset:0, pointerEvents:"none" }}>
            <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.5)" }} />
            {/* Scan window */}
            <div style={{
              position:"absolute", top:"14%", left:"5%", right:"5%", bottom:"20%",
              boxShadow:"0 0 0 9999px rgba(0,0,0,0.5)", borderRadius:6,
            }}>
              {/* Corner brackets */}
              {[
                { top:0,    left:0,  borderTop:`3px solid ${T.yellow}`, borderLeft:`3px solid ${T.yellow}` },
                { top:0,    right:0, borderTop:`3px solid ${T.yellow}`, borderRight:`3px solid ${T.yellow}` },
                { bottom:0, left:0,  borderBottom:`3px solid ${T.yellow}`, borderLeft:`3px solid ${T.yellow}` },
                { bottom:0, right:0, borderBottom:`3px solid ${T.yellow}`, borderRight:`3px solid ${T.yellow}` },
              ].map((st, i) => <div key={i} style={{ position:"absolute", width:28, height:28, ...st }} />)}

              {/* Scan line animation */}
              <div style={{
                position:"absolute", left:0, right:0, height:2,
                background:`linear-gradient(to right, transparent, ${T.yellow}, transparent)`,
                animation:"scanline 2s linear infinite",
                top:"40%",
              }} />
            </div>
          </div>

          {/* Top bar */}
          <div style={{ position:"absolute", top:0, left:0, right:0, padding:"16px 18px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <button onClick={stopCamera} style={{ background:"rgba(0,0,0,0.65)", border:"none", color:"white", padding:"8px 16px", borderRadius:20, cursor:"pointer", fontSize:14 }}>
              ✕ Cancel
            </button>
            <div style={{ background:"rgba(0,0,0,0.65)", padding:"6px 16px", borderRadius:20 }}>
              <span style={{ color:T.yellow, fontSize:13, fontWeight:700 }}>{coverSec?.emoji} {coverSec?.label}</span>
            </div>
          </div>

          <p style={{ position:"absolute", bottom:"22%", left:0, right:0, textAlign:"center", color:"rgba(255,255,255,0.7)", fontSize:13, margin:0 }}>
            Align cover within frame · keep flat · good lighting
          </p>
        </div>

        {/* Shutter bar */}
        <div style={{ padding:"18px 28px", background:"#0A0A0A", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <button onClick={() => { stopCamera(); fileRef.current?.click(); }}
            style={{ background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.15)", color:"white", padding:"10px 18px", borderRadius:20, cursor:"pointer", fontSize:13 }}>
            📁 Upload
          </button>
          <button onClick={captureFrame}
            style={{ width:76, height:76, borderRadius:"50%", background:"white", border:`5px solid ${T.yellow}`, cursor:"pointer", fontSize:30, display:"flex", alignItems:"center", justifyContent:"center" }}>
            📷
          </button>
          <div style={{ width:90 }} />
        </div>

        <style>{`@keyframes scanline { 0%{top:5%} 50%{top:90%} 100%{top:5%} }`}</style>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // IMAGE PREVIEW + FILTER SELECTION (Google Drive style)
  // ─────────────────────────────────────────────────────────────────────────────
  if (rawImg) {
    return (
      <div style={{ position:"fixed", inset:0, background:"#0D0D0D", display:"flex", flexDirection:"column", zIndex:9999 }}>

        {/* Header */}
        <div style={{ padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid #1E1E1E" }}>
          <button onClick={retake} style={{ background:"none", border:"none", color:T.yellow, fontSize:14, fontWeight:700, cursor:"pointer" }}>
            ← Retake
          </button>
          <span style={{ color:"white", fontWeight:700, fontSize:15 }}>Review Scan</span>
          <button onClick={confirmImage} disabled={filterLoading}
            style={{ background:T.yellow, border:"none", color:T.ink, fontWeight:800, padding:"8px 18px", borderRadius:20, cursor:filterLoading?"not-allowed":"pointer", fontSize:14 }}>
            Use Photo ✓
          </button>
        </div>

        {/* Auto-Measurement Bar */}
        <div style={{ padding: "12px 18px", background: "#1a1a1a", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid #1E1E1E" }}>
          <button 
            onClick={async () => {
              if (!rawImg) {
                alert('Please capture or upload an image first');
                return;
              }
              
              if (!opencvLoaded) {
                alert('OpenCV is loading. Please wait a moment and try again.');
                return;
              }
              
              setProcessing(true);
              setProcessResult(null);
              
              try {
                const result = await processImageForMeasurements(rawImg);
                
                if (result.error) {
                  alert(result.error);
                  setProcessing(false);
                  return;
                }
                
                setProcessResult(result);
                
                // Auto-fill measurements
                if (coverKey && result.lengthCm && result.widthCm) {
                  setMeasurement(coverKey, "seatLength", result.lengthCm.toString());
                  setMeasurement(coverKey, "seatWidth", result.widthCm.toString());
                }
              } catch (error) {
                console.error('Processing error:', error);
                alert('Processing failed: ' + error.message);
              }
              
              setProcessing(false);
            }}
            style={{
              background: T.yellow,
              border: "none",
              color: T.ink,
              fontWeight: 700,
              padding: "10px 20px",
              borderRadius: 10,
              cursor: (processing || !opencvLoaded) ? "not-allowed" : "pointer",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 8,
              opacity: (processing || !opencvLoaded) ? 0.5 : 1
            }}
            disabled={processing || !opencvLoaded}
          >
            {processing ? "⏳ Processing..." : !opencvLoaded ? "⏳ Loading OpenCV..." : "📐 Auto-Measure"}
          </button>
          
          {processResult && (
            <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <span>📏 L: <strong style={{ color: "#4ADE80" }}>{processResult.lengthCm} cm</strong></span>
              <span>📐 W: <strong style={{ color: "#4ADE80" }}>{processResult.widthCm} cm</strong></span>
              <button 
                onClick={() => setShowProcessedImage(!showProcessedImage)}
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "white", padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}
              >
                {showProcessedImage ? "Hide" : "Show"} Analysis
              </button>
            </div>
          )}
        </div>

        {/* Image preview */}
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:12, overflow:"hidden" }}>
          {filterLoading ? (
            <div style={{ color:"rgba(255,255,255,0.4)", fontSize:14 }}>Applying filter...</div>
          ) : (
            <img src={previewImg} alt="preview"
              style={{ maxWidth:"100%", maxHeight:"100%", borderRadius:8, objectFit:"contain" }} />
          )}
        </div>

        {/* Filter strip — like Google Drive */}
        <div style={{ background:"#111", borderTop:"1px solid #1E1E1E", padding:"14px 0 20px" }}>
          <p style={{ color:"rgba(255,255,255,0.3)", fontSize:11, textAlign:"center", margin:"0 0 12px", textTransform:"uppercase", letterSpacing:"0.08em" }}>
            Choose Filter
          </p>
          <div style={{ display:"flex", justifyContent:"center", gap:16, padding:"0 16px" }}>
            {FILTERS.map(f => {
              const active = activeFilter === f.key;
              return (
                <button key={f.key} onClick={() => setActiveFilter(f.key)} style={{
                  display:"flex", flexDirection:"column", alignItems:"center", gap:6,
                  background:active ? "rgba(247,194,0,0.15)" : "rgba(255,255,255,0.05)",
                  border:`2px solid ${active ? T.yellow : "transparent"}`,
                  borderRadius:12, padding:"10px 14px", cursor:"pointer", minWidth:64,
                }}>
                  <span style={{ fontSize:22 }}>{f.icon}</span>
                  <span style={{ fontSize:11, color:active ? T.yellow : "rgba(255,255,255,0.5)", fontWeight:active?700:400 }}>
                    {f.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Processed image overlay */}
        {showProcessedImage && processResult && processResult.imageDataURL && (
          <div style={{ 
            position: "fixed", 
            inset: 0, 
            background: "rgba(0,0,0,0.85)", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center", 
            zIndex: 10000,
            padding: 20
          }}>
            <div style={{ 
              background: "#1a1a1a", 
              borderRadius: 16, 
              padding: 16, 
              maxWidth: "90vw", 
              maxHeight: "90vh",
              overflow: "auto"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ color: "white", fontWeight: 700 }}>📊 Measurement Analysis</span>
                <button 
                  onClick={() => setShowProcessedImage(false)}
                  style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "white", padding: "4px 12px", borderRadius: 6, cursor: "pointer" }}
                >
                  ✕ Close
                </button>
              </div>
              <img 
                src={processResult.imageDataURL} 
                alt="Analysis" 
                style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 8 }}
              />
              <div style={{ 
                display: "grid", 
                gridTemplateColumns: "1fr 1fr 1fr", 
                gap: 10, 
                marginTop: 12, 
                padding: 12, 
                background: "rgba(255,255,255,0.05)", 
                borderRadius: 8 
              }}>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase" }}>Length</div>
                  <div style={{ color: "#4ADE80", fontWeight: 700, fontSize: 18 }}>{processResult.lengthCm} cm</div>
                </div>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase" }}>Width</div>
                  <div style={{ color: "#4ADE80", fontWeight: 700, fontSize: 18 }}>{processResult.widthCm} cm</div>
                </div>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase" }}>Resolution</div>
                  <div style={{ color: "#60A5FA", fontWeight: 500, fontSize: 14 }}>{processResult.pixelsPerCm} px/cm</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MAIN APP
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:T.paper, fontFamily:"'Helvetica Neue', Arial, system-ui, sans-serif", color:T.ink }}>
      <canvas ref={canvasRef} style={{ display:"none" }} />
      <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleUpload} />

      {/* HEADER */}
      <div style={{ background:T.black, padding:"14px 20px", position:"sticky", top:0, zIndex:50 }}>
        <div style={{ maxWidth:620, margin:"0 auto", display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ width:40, height:40, borderRadius:10, background:T.yellow, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>🛺</div>
          <div>
            <div style={{ color:T.yellow, fontWeight:800, fontSize:17, letterSpacing:"0.03em" }}>RexiFit Measure</div>
            <div style={{ color:"rgba(255,255,255,0.4)", fontSize:11 }}>Auto Rickshaw Cover Measurement</div>
          </div>
          {brandName && step > 0 && (
            <div style={{ marginLeft:"auto", color:T.yellow, fontSize:12, fontWeight:700, background:"rgba(247,194,0,0.12)", padding:"5px 12px", borderRadius:20, border:"1px solid rgba(247,194,0,0.2)" }}>
              {brandName}
            </div>
          )}
        </div>
      </div>

      {/* STEP TABS */}
      <div style={{ background:"white", borderBottom:`1px solid ${T.border}`, overflowX:"auto" }}>
        <div style={{ maxWidth:620, margin:"0 auto", display:"flex" }}>
          {[
            { icon:"🛺", label:"Brand" },
            { icon:"💺", label:"Driver" },
            { icon:"👥", label:"Pax Seat" },
            { icon:"🏠", label:"Rooftop" },
            { icon:"📋", label:"Preview" },
          ].map((tab, i) => {
            const active = i === step, done = i < step;
            return (
              <div key={i} onClick={() => done && setStep(i)}
                style={{ flex:1, padding:"10px 4px", textAlign:"center", cursor:done?"pointer":"default", minWidth:56,
                  borderBottom:`3px solid ${active ? T.yellow : "transparent"}`,
                  color: active ? T.ink : done ? T.muted : "#C4BFBA",
                }}>
                <div style={{ fontSize:18, marginBottom:2 }}>{done && !active ? "✓" : tab.icon}</div>
                <div style={{ fontSize:10, fontWeight:active?800:500, letterSpacing:"0.04em" }}>{tab.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ maxWidth:620, margin:"0 auto", padding:"0 16px 80px" }}>

        {/* ══ STEP 0 — BRAND ══════════════════════════════════════════════════ */}
        {step === 0 && (
          <div style={{ paddingTop:20 }}>
            <div style={{ textAlign:"center", padding:"28px 0 22px" }}>
              <div style={{ fontSize:64, marginBottom:12 }}>🛺</div>
              <h1 style={{ margin:"0 0 6px", fontSize:24, fontWeight:800 }}>Auto Rickshaw Details</h1>
              <p style={{ margin:0, color:T.muted, fontSize:14 }}>Select brand to start capturing cover measurements</p>
            </div>

            <div style={card}>
              <span style={lbl}>Auto Rickshaw Brand *</span>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {BRANDS.map(b => (
                  <button key={b} onClick={() => setBrand(b)} style={{
                    padding:"12px 10px", borderRadius:10, cursor:"pointer", fontSize:13, textAlign:"center",
                    fontWeight: brand === b ? 800 : 500,
                    border:`2px solid ${brand === b ? T.yellow : T.border}`,
                    background: brand === b ? "#FFFBE6" : "#FAFAF8",
                    color: brand === b ? "#8A6700" : T.ink,
                  }}>{b}</button>
                ))}
              </div>
              {brand === "Other" && (
                <input value={customBrand} onChange={e => setCustomBrand(e.target.value)}
                  placeholder="Enter brand name..." style={{ ...inp, marginTop:10 }} />
              )}
            </div>

            <div style={card}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                <div>
                  <span style={lbl}>Reg. Number</span>
                  <input value={regNo} onChange={e => setRegNo(e.target.value)} placeholder="MH 01 AB 1234" style={inp} />
                </div>
                <div>
                  <span style={lbl}>Measurement Date</span>
                  <input type="date" value={jobDate} onChange={e => setJobDate(e.target.value)} style={inp} />
                </div>
              </div>
            </div>

            <button disabled={!brandName} onClick={() => setStep(1)} style={{ ...btn(T.yellow, T.ink, !brandName), width:"100%" }}>
              Start Measuring →
            </button>
          </div>
        )}

        {/* ══ STEPS 1–3 — COVER SECTIONS ══════════════════════════════════════ */}
        {isCoverStep && coverKey && (
          <div style={{ paddingTop:16 }}>
            {/* Section heading */}
            <div style={{ display:"flex", alignItems:"center", gap:12, paddingBottom:16 }}>
              <div style={{ width:48, height:48, borderRadius:13, background:coverSec.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, border:`2px solid ${coverSec.color}33`, flexShrink:0 }}>
                {coverSec.emoji}
              </div>
              <div style={{ flex:1 }}>
                <h2 style={{ margin:0, fontSize:20, fontWeight:800 }}>{coverSec.label}</h2>
                <p style={{ margin:0, color:T.muted, fontSize:12 }}>Step {step} of 3 · Scan → Measure → Notes</p>
              </div>
              <div style={{ fontSize:13, fontWeight:700, color:T.muted }}>
                {getProgress(coverKey)}/{coverSec.fields.length}
              </div>
            </div>

            {/* SCAN CARD */}
            <div style={card}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <span style={{ fontWeight:700, fontSize:14 }}>📸 Scan Image</span>
                {coverData?.image
                  ? <span style={{ fontSize:11, color:T.success, background:"#DCFCE7", padding:"3px 10px", borderRadius:20, fontWeight:700 }}>✓ Captured</span>
                  : <span style={{ fontSize:11, color:T.muted }}>Tap to scan with camera</span>
                }
              </div>

              {coverData?.image ? (
                <div style={{ position:"relative" }}>
                  <img src={coverData.image} alt="scan"
                    style={{ width:"100%", borderRadius:10, maxHeight:200, objectFit:"cover", display:"block" }} />
                  <button onClick={() => setSection(coverKey, "image", null)} style={{
                    position:"absolute", top:8, right:8,
                    background:"rgba(0,0,0,0.65)", border:"none", color:"white",
                    padding:"5px 12px", borderRadius:20, cursor:"pointer", fontSize:12, fontWeight:600,
                  }}>🔄 Rescan</button>
                </div>
              ) : (
                <div style={{ display:"flex", gap:10 }}>
                  <button onClick={openCamera} style={{
                    flex:1, padding:18, borderRadius:10, fontSize:14, fontWeight:700, cursor:"pointer",
                    border:`2px dashed ${coverSec.color}`, background:coverSec.bg, color:T.ink,
                  }}>📷 Camera Scan</button>
                  <button onClick={() => fileRef.current?.click()} style={{
                    flex:1, padding:18, borderRadius:10, fontSize:14, cursor:"pointer",
                    border:`2px dashed ${T.border}`, background:T.paper, color:T.muted,
                  }}>📁 Upload Photo</button>
                </div>
              )}
            </div>

            {/* MEASUREMENTS FORM */}
            <div style={card}>
              <span style={lbl}>📏 Measurements (cm)</span>
              {coverSec.fields.map(field => (
                <div key={field.key} style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 12px", background:T.paper, borderRadius:9, marginBottom:8, border:`1px solid ${T.border}` }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700 }}>{field.label}</div>
                    <div style={{ fontSize:11, color:T.muted, marginTop:1 }}>{field.hint}</div>
                  </div>
                  <input
                    type="number" min="0" step="0.5"
                    value={coverData?.measurements?.[field.key] || ""}
                    onChange={e => setMeasurement(coverKey, field.key, e.target.value)}
                    placeholder="—"
                    style={numInp}
                  />
                  <span style={{ fontSize:12, color:T.muted, width:18, flexShrink:0 }}>cm</span>
                </div>
              ))}
            </div>

            {/* NOTES */}
            <div style={card}>
              <span style={lbl}>📝 Notes</span>
              <textarea
                value={coverData?.notes || ""}
                onChange={e => setSection(coverKey, "notes", e.target.value)}
                placeholder="e.g. Torn on right edge, double foam, custom color, velcro type..."
                rows={3}
                style={{ ...inp, resize:"none", lineHeight:1.55, padding:"11px 14px" }}
              />
            </div>

            {/* NAV */}
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setStep(s => s - 1)} style={{ ...btn("white", T.ink, false), flex:1, border:`1px solid ${T.border}` }}>← Back</button>
              <button onClick={() => setStep(s => s + 1)} style={{ ...btn(coverSec.color, coverSec.textOnColor, false), flex:2 }}>
                {step < 3 ? `Next: ${SECTIONS[COVER_KEYS[step]]?.label.split(" ")[0]} →` : "Preview Report →"}
              </button>
            </div>
          </div>
        )}

        {/* ══ STEP 4 — PREVIEW ════════════════════════════════════════════════ */}
        {step === 4 && (
          <div style={{ paddingTop:16 }}>
            {/* Report header */}
            <div style={{ background:T.black, borderRadius:16, padding:24, marginBottom:16, position:"relative", overflow:"hidden" }}>
              <div style={{ position:"absolute", top:0, left:0, right:0, height:4, background:T.yellow }} />
              <div style={{ display:"flex", alignItems:"flex-start", gap:16, marginBottom:20 }}>
                <div style={{ width:56, height:56, borderRadius:14, background:"rgba(247,194,0,0.12)", border:"1.5px solid rgba(247,194,0,0.3)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:30, flexShrink:0 }}>🛺</div>
                <div>
                  <div style={{ color:T.yellow, fontWeight:800, fontSize:22, marginBottom:3 }}>{brandName}</div>
                  <div style={{ color:"rgba(255,255,255,0.4)", fontSize:12, textTransform:"uppercase", letterSpacing:"0.08em" }}>RexiFit Cover Measurement Report</div>
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                {regNo && (
                  <div style={{ background:"rgba(255,255,255,0.06)", borderRadius:10, padding:"10px 14px" }}>
                    <div style={{ color:"rgba(255,255,255,0.35)", fontSize:10, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>Reg. Number</div>
                    <div style={{ color:"white", fontWeight:700, fontSize:15 }}>{regNo}</div>
                  </div>
                )}
                <div style={{ background:"rgba(255,255,255,0.06)", borderRadius:10, padding:"10px 14px" }}>
                  <div style={{ color:"rgba(255,255,255,0.35)", fontSize:10, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>Date</div>
                  <div style={{ color:"white", fontWeight:700, fontSize:15 }}>
                    {new Date(jobDate + "T00:00:00").toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" })}
                  </div>
                </div>
              </div>
            </div>

            {/* Section cards */}
            {COVER_KEYS.map(key => {
              const sec = SECTIONS[key];
              const sd  = sectionData[key];
              const hasMeasurements = sec.fields.some(f => sd.measurements[f.key]);
              const filled = sec.fields.filter(f => sd.measurements[f.key]).length;
              return (
                <div key={key} style={{ background:"white", borderRadius:14, marginBottom:14, overflow:"hidden", border:`1px solid ${T.border}` }}>
                  <div style={{ background:sec.color, padding:"13px 18px", display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:22 }}>{sec.emoji}</span>
                    <span style={{ color:sec.textOnColor, fontWeight:800, fontSize:15, flex:1 }}>{sec.label}</span>
                    <span style={{ background:"rgba(0,0,0,0.15)", color:sec.textOnColor, fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:20 }}>
                      {filled}/{sec.fields.length} measured
                    </span>
                  </div>

                  {sd.image && (
                    <img src={sd.image} alt={sec.label} style={{ width:"100%", maxHeight:140, objectFit:"cover", display:"block", borderBottom:`1px solid ${T.border}` }} />
                  )}

                  <div style={{ padding:"14px 16px" }}>
                    {hasMeasurements ? (
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                        {sec.fields.map(f => {
                          const val = sd.measurements[f.key];
                          return (
                            <div key={f.key} style={{ background:val ? sec.bg : T.paper, borderRadius:10, padding:"10px 12px", border:`1px solid ${val ? sec.color + "33" : T.border}` }}>
                              <div style={{ fontSize:10, color:T.muted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4 }}>{f.label}</div>
                              <div style={{ display:"flex", alignItems:"baseline", gap:3 }}>
                                <span style={{ fontSize:22, fontWeight:800, color:val ? T.ink : "#C4BFBA" }}>{val || "—"}</span>
                                {val && <span style={{ fontSize:12, color:T.muted, fontWeight:500 }}>cm</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ textAlign:"center", padding:"16px", color:T.muted, fontSize:13 }}>No measurements entered</div>
                    )}
                    {sd.notes && (
                      <div style={{ marginTop:10, background:"#FFFBE6", border:"1px solid #FDE68A", borderRadius:8, padding:"10px 12px" }}>
                        <div style={{ fontSize:10, color:"#92400E", fontWeight:800, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4 }}>📝 Notes</div>
                        <div style={{ fontSize:13, lineHeight:1.5 }}>{sd.notes}</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Fabric estimate */}
            <div style={{ background:T.black, borderRadius:14, padding:18, marginBottom:16, border:"1px solid #222" }}>
              <div style={{ color:T.yellow, fontWeight:800, fontSize:13, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:14 }}>
                📐 Rexine Fabric Estimate (+20cm buffer)
              </div>
              {COVER_KEYS.map(key => {
                const sec = SECTIONS[key];
                const sd  = sectionData[key];
                const l = parseFloat(sd.measurements.seatLength || sd.measurements.length || 0);
                const w = parseFloat(sd.measurements.seatWidth  || sd.measurements.width  || 0);
                if (!l || !w) return null;
                const area = ((l + 20) * (w + 20) / 10000).toFixed(2);
                return (
                  <div key={key} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 0", borderBottom:"1px solid #1C1C1C" }}>
                    <span style={{ color:"rgba(255,255,255,0.6)", fontSize:14 }}>{sec.emoji} {sec.label}</span>
                    <div>
                      <span style={{ color:"white", fontWeight:800, fontSize:16 }}>≈ {area}</span>
                      <span style={{ color:T.muted, fontSize:12 }}> m²</span>
                    </div>
                  </div>
                );
              })}
              <p style={{ color:"#333", fontSize:11, margin:"10px 0 0" }}>+20 cm seam allowance added to length & width</p>
            </div>

            {/* Actions */}
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setStep(3)} style={{ ...btn("white", T.ink, false), flex:1, border:`1px solid ${T.border}` }}>← Edit</button>
              <button onClick={saveReport}       style={{ ...btn("#15803D", "white", false), flex:1 }}>⬇ Save</button>
              <button onClick={() => window.print()} style={{ ...btn(T.yellow, T.ink, false), flex:1 }}>🖨 Print</button>
            </div>

            <button onClick={() => {
              setBrand(""); setCustomBrand(""); setRegNo(""); setStep(0);
              setSectionData({ driver:initSection(), passenger:initSection(), rooftop:initSection() });
            }} style={{ ...btn(T.paper, T.muted, false), width:"100%", marginTop:10, border:`1px solid ${T.border}` }}>
              + New Measurement Job
            </button>
            <div style={{ height:40 }} />
          </div>
        )}
      </div>
    </div>
  );
}