"use strict";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
    file: null,
    imageEl: null,     // HTMLImageElement
    imageBitmap: null, // ImageBitmap (optional future use)
    lastBlueDataUrl: null,
};

function setStatus(msg) {
    $("#status").textContent = msg;
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return "";
    const units = ["B", "KB", "MB", "GB"];
    let v = bytes;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function switchTool(toolId) {
    $$(".toolBtn").forEach(b => b.classList.toggle("active", b.dataset.tool === toolId));
    $$(".toolCard").forEach(c => c.classList.toggle("show", c.id === toolId));
}

function setPreviewImage(img) {
    const previewImg = $("#previewImg");
    const empty = $("#previewEmpty");

    if (!img) {
        previewImg.style.display = "none";
        empty.style.display = "flex";
        return;
    }
    previewImg.src = img.src;
    previewImg.style.display = "block";
    empty.style.display = "none";
}

function enableButtons(enabled) {
    $("#btnExportPDF").disabled = !enabled;
    $("#btnRenderA4").disabled = !enabled;
    $("#btnExportA4").disabled = !enabled;
    $("#btnApplyBlue").disabled = !enabled;
    $("#btnExportBlue").disabled = !enabled;
}

async function loadImageFromFile(file) {
    const url = URL.createObjectURL(file);

    const img = new Image();
    img.decoding = "async";
    img.loading = "eager";
    img.src = url;

    await new Promise((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("فشل تحميل الصورة"));
    });

    // Cleanup previous object URL
    try { URL.revokeObjectURL(url); } catch { }

    return img;
}

/** A4 pixels from DPI (A4 = 210 x 297 mm = 8.27 x 11.69 in) */
function a4Pixels(dpi) {
    const wIn = 8.27;
    const hIn = 11.69;
    return {
        w: Math.round(wIn * dpi),
        h: Math.round(hIn * dpi),
    };
}

/** draw image to canvas as contain/cover within target w,h */
function drawFit(ctx, img, targetW, targetH, mode, bg) {
    ctx.clearRect(0, 0, targetW, targetH);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, targetW, targetH);

    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    const scale = (mode === "cover")
        ? Math.max(targetW / iw, targetH / ih)
        : Math.min(targetW / iw, targetH / ih);

    const dw = Math.round(iw * scale);
    const dh = Math.round(ih * scale);

    const dx = Math.round((targetW - dw) / 2);
    const dy = Math.round((targetH - dh) / 2);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, dx, dy, dw, dh);
}

/** apply blue filter on canvas (in-place) */
function applyBlueFilter(canvas, strength, mode) {
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;

    const imgData = ctx.getImageData(0, 0, width, height);
    const d = imgData.data;

    const s = Math.max(0, Math.min(100, strength)) / 100;

    for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];

        if (mode === "shift") {
            // Shift channels to increase blue, reduce red slightly (simple and effective)
            const nr = Math.max(0, r * (1 - 0.25 * s));
            const ng = g;
            const nb = Math.min(255, b + 90 * s);
            d[i] = nr;
            d[i + 1] = ng;
            d[i + 2] = nb;
        } else {
            // Tint: blend with a blue color (0, 90, 255)
            const tintR = 0, tintG = 90, tintB = 255;
            d[i] = Math.round(r * (1 - s) + tintR * s);
            d[i + 1] = Math.round(g * (1 - s) + tintG * s);
            d[i + 2] = Math.round(b * (1 - s) + tintB * s);
        }
        // alpha unchanged
    }

    ctx.putImageData(imgData, 0, 0);
}

function downloadBlob(blob, filename) {
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function canvasToBlob(canvas, type = "image/png", quality) {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), type, quality);
    });
}

function safeBaseName(fileName) {
    const name = (fileName || "image")
        .replace(/\.[^/.]+$/, "")
        .replace(/[^\w\u0600-\u06FF\- ]+/g, "")
        .trim()
        .replace(/\s+/g, "_");
    return name || "image";
}

/* -------------------- EVENTS -------------------- */

$$(".toolBtn").forEach(btn => {
    btn.addEventListener("click", () => switchTool(btn.dataset.tool));
});

$("#btnTheme").addEventListener("click", () => {
    document.documentElement.classList.toggle("light");
});

$("#fileInput").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    state.file = file;
    setStatus(`تم اختيار: ${file.name} (${formatBytes(file.size)})`);

    try {
        const img = await loadImageFromFile(file);
        state.imageEl = img;

        setPreviewImage(img);
        enableButtons(true);

        // clear canvases and empty labels
        $("#a4Empty").style.display = "flex";
        $("#blueEmpty").style.display = "flex";
        state.lastBlueDataUrl = null;

    } catch (err) {
        console.error(err);
        setStatus("تعذر تحميل الصورة. جرّب صورة ثانية.");
        state.imageEl = null;
        setPreviewImage(null);
        enableButtons(false);
    }
});

/* -------- Tool 1: Image -> PDF (A4) -------- */
$("#btnExportPDF").addEventListener("click", async () => {
    if (!state.imageEl || !state.file) return;

    const orientation = $("#pdfOrientation").value; // "p" or "l"
    const marginMm = Number($("#pdfMargin").value || 0);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: orientation === "l" ? "landscape" : "portrait",
        unit: "mm",
        format: "a4",
        compress: true
    });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    // Draw on temp canvas to get a clean bitmap
    const tmp = document.createElement("canvas");
    tmp.width = state.imageEl.naturalWidth;
    tmp.height = state.imageEl.naturalHeight;
    const tctx = tmp.getContext("2d");
    tctx.drawImage(state.imageEl, 0, 0);

    const imgDataUrl = tmp.toDataURL("image/jpeg", 0.92);

    // Fit inside A4 minus margins
    const usableW = Math.max(10, pageW - 2 * marginMm);
    const usableH = Math.max(10, pageH - 2 * marginMm);

    // Compute fit ratio based on image aspect ratio
    const iw = state.imageEl.naturalWidth;
    const ih = state.imageEl.naturalHeight;
    const scale = Math.min(usableW / (iw / 10), usableH / (ih / 10));
    // Note: above is a quick fit; alternatively compute in mm directly:
    // We'll compute in a more stable way below:

    const imgAspect = iw / ih;
    let drawW = usableW;
    let drawH = drawW / imgAspect;
    if (drawH > usableH) {
        drawH = usableH;
        drawW = drawH * imgAspect;
    }

    const x = (pageW - drawW) / 2;
    const y = (pageH - drawH) / 2;

    doc.addImage(imgDataUrl, "JPEG", x, y, drawW, drawH, undefined, "FAST");

    const base = safeBaseName(state.file.name);
    doc.save(`${base}_A4.pdf`);
});

/* -------- Tool 2: A4 PNG -------- */
async function renderA4() {
    if (!state.imageEl) return;

    const dpi = Number($("#a4Dpi").value);
    const mode = $("#a4Mode").value; // contain/cover
    const bg = $("#a4Bg").value;

    const { w, h } = a4Pixels(dpi);
    const canvas = $("#a4Canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    drawFit(ctx, state.imageEl, w, h, mode, bg);

    $("#a4Empty").style.display = "none";
}

$("#btnRenderA4").addEventListener("click", renderA4);

$("#btnExportA4").addEventListener("click", async () => {
    if (!state.imageEl || !state.file) return;

    await renderA4();

    const canvas = $("#a4Canvas");
    const blob = await canvasToBlob(canvas, "image/png");
    const base = safeBaseName(state.file.name);
    downloadBlob(blob, `${base}_A4.png`);
});

/* -------- Tool 3: Blue Filter -------- */
$("#blueStrength").addEventListener("input", () => {
    $("#blueStrengthVal").textContent = $("#blueStrength").value;
});

$("#btnApplyBlue").addEventListener("click", async () => {
    if (!state.imageEl) return;

    const strength = Number($("#blueStrength").value);
    const mode = $("#blueMode").value;

    const canvas = $("#blueCanvas");
    canvas.width = state.imageEl.naturalWidth;
    canvas.height = state.imageEl.naturalHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(state.imageEl, 0, 0);

    applyBlueFilter(canvas, strength, mode);

    $("#blueEmpty").style.display = "none";
    state.lastBlueDataUrl = canvas.toDataURL("image/png");
});

$("#btnExportBlue").addEventListener("click", async () => {
    if (!state.imageEl || !state.file) return;

    const canvas = $("#blueCanvas");
    if (!canvas.width || !canvas.height) {
        // if user didn't apply yet, apply once
        $("#btnApplyBlue").click();
    }

    const blob = await canvasToBlob(canvas, "image/png");
    const base = safeBaseName(state.file.name);
    downloadBlob(blob, `${base}_blue.png`);
});

/* Default tool */
switchTool("tool-image-pdf");
enableButtons(false);
setPreviewImage(null);
