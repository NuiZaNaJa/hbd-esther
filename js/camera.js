/* ============================================================
   camera.js — take photo: กล้อง instax Mini Evo (หลังกล้องจากรูปที่ตัดไว้)
   ------------------------------------------------------------
   - กดปุ่ม take photo ที่ฉากเค้ก → กล้องเด้งขึ้น
   - จอ LCD โชว์ "เค้กตัวจริง" แบบสด ๆ (เฟรม ASCII ของ BirthdayCake
     วาดลง canvas ทีละเซลล์ ให้เหมือนมองเข้าเลนส์)
   - กดชัตเตอร์ (ปุ่มกลม ๆ / กดที่จอ / Enter) → แฟลชขาวทั้งหน้าจอ
   - ฟิล์มปริ้นออกมาเป็นโพลารอยด์ (สั่น ๆ เหมือนมอเตอร์จริง)
     ภาพเทา ๆ ค่อย ๆ ขึ้นชัดแบบฟิล์ม instant
   - กดบันทึก → ต่อทุกเฟรมเป็น GIF แอนิเมตัน (เทียนไฟกระพริบ หัวใจลอย
     แล้วเป่าเทียนก่อนจุดใหม่!) โหลดลงเครื่องเป็นไฟล์ .gif
     เอาไปลงสตอรี่ IG ได้เลย ♥
   - รูปกล้อง: วางไฟล์ที่ตัดไว้ที่ img/instax-evo.png แล้วระบบจะสลับไปใช้
     เอง (จอ LCD หาตำแหน่งขาว ๆ ในรูปให้เอง) — ถ้ายังไม่มีไฟล์
     กล้องจะถูกวาดด้วย CSS แทนชั่วคราว
   ============================================================ */

const Camera = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);

  const win = $("cam-window");
  const face = $("cam-face");
  const lcdWrap = $("cam-lcd");
  const lcd = $("cam-lcd-canvas");
  const lcdStatus = $("cam-lcd-status");
  const shutter = $("cam-shutter");
  const btnClose = $("cam-close");
  const btnOpen = $("btn-cam");
  const flash = $("cam-flash");
  const printArea = $("cam-print-area");
  const polaroid = $("cam-polaroid");
  const polar = $("cam-polaroid-canvas");
  const develop = $("cam-develop");
  const actions = $("cam-print-actions");
  const btnSave = $("cam-save");
  const btnSaveLabel = $("cam-save-label");
  const btnRetake = $("cam-retake");

  const REDUCED =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- เสียงชุดเล็ก (สไตล์เดียวกับห้อง instax) ---------------- */
  let actx = null;
  function tone(freq, dur, type, vol, slide) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = type || "square";
      o.frequency.value = freq;
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, actx.currentTime + dur);
      g.gain.value = vol || 0.05;
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
      o.connect(g).connect(actx.destination);
      o.start();
      o.stop(actx.currentTime + dur);
    } catch (e) { /* เงียบไว้ */ }
  }
  const sfxClick = () => tone(420, 0.05, "square", 0.05);
  function sfxShutter() {
    tone(1500, 0.04, "square", 0.055);
    setTimeout(() => tone(850, 0.05, "square", 0.05), 55);
  }
  let whirrTimer = 0;
  function startWhirr() {
    stopWhirr();
    whirrTimer = setInterval(() => {
      tone(105 + Math.random() * 18, 0.05, "square", 0.04);
    }, 110);
  }
  function stopWhirr() {
    if (whirrTimer) { clearInterval(whirrTimer); whirrTimer = 0; }
  }
  function sfxChime() {
    tone(880, 0.12, "sine", 0.06);
    setTimeout(() => tone(1318, 0.22, "sine", 0.05), 130);
  }

  /* ---------------- เค้ก ASCII → canvas ---------------- */
  const FALLBACK_HEX = "#9a8aa8";
  let cakeFn = null;
  function ensureCake() {
    if (!cakeFn && window.BirthdayCake) cakeFn = window.BirthdayCake.create();
    return cakeFn;
  }
  const pal = () => (window.BirthdayCake && window.BirthdayCake.meta && window.BirthdayCake.meta.palette) || {};

  /* วาดเฟรม ASCII (เฉพาะช่วง crop) ลงกล่อง (x, y, w, h) แบบพิกเซลตาราง */
  function drawArt(ctx, x, y, w, h, t, crop) {
    const fn = ensureCake();
    const meta = (window.BirthdayCake && window.BirthdayCake.meta) || {};
    const cols = meta.cols || 80;
    const rows = meta.rows || 36;
    const c0 = crop ? crop.c0 : 0;
    const c1 = crop ? crop.c1 : cols - 1;
    const r0 = crop ? crop.r0 : 0;
    const r1 = crop ? crop.r1 : rows - 1;
    const cw = c1 - c0 + 1;
    const ch = r1 - r0 + 1;
    const cell = Math.max(1, Math.floor(Math.min(w / cw, h / ch)));
    const ox = Math.round(x + (w - cell * cw) / 2);
    const oy = Math.round(y + (h - cell * ch) / 2);
    if (!fn) { ctx.fillStyle = "#1c1424"; ctx.fillRect(x, y, w, h); return; }
    const P = pal();
    const f = fn(t % 10);
    /* เฟรมเก็บเป็นสตริงแถวละ cols ตัว + "\n" ท้ายแถว → แยกแถวก่อนวาด */
    const tRows = f.text.split("\n");
    const cRows = f.color.split("\n");
    for (let r = r0; r <= r1; r++) {
      const tRow = tRows[r] || "";
      const cRow = cRows[r] || "";
      for (let c = c0; c <= c1; c++) {
        if (tRow.charAt(c) === " " || tRow.charAt(c) === "") continue;
        const key = cRow.charAt(c);
        if (key === " " || key === "") continue;
        ctx.fillStyle = P[key] || FALLBACK_HEX;
        ctx.fillRect(ox + (c - c0) * cell, oy + (r - r0) * cell, cell + 0.5, cell + 0.5);
      }
    }
  }

  /* ---------------- หัวใจลอย + สปาร์คเกิ้ล (ตำแหน่งตายตัวตาม t) ---------------- */
  const HEART = [
    "0110110",
    "1111111",
    "1111111",
    "0111110",
    "0011100",
    "0001000",
  ];
  function drawHeart(ctx, cx, cy, s, color, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (let r = 0; r < HEART.length; r++) {
      for (let c = 0; c < 7; c++) {
        if (HEART[r][c] !== "1") continue;
        ctx.fillRect(cx + (c - 3.5) * s, cy + (r - 3) * s, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- แบนเนอร์พิกเซล (ฟอนต์บล็อกชุดเดียวกับ big-text.js) ---------------- */
  const BANNER_FONT = {
    A: ".##.|#..#|####|#..#|#..#", B: "###.|#..#|###.|#..#|###.", C: ".###|#...|#...|#...|.###",
    D: "###.|#..#|#..#|#..#|###.", E: "####|#...|###.|#...|####", F: "####|#...|###.|#...|#...",
    G: ".###|#...|#.##|#..#|.###", H: "#..#|#..#|####|#..#|#..#", I: "#|#|#|#|#",
    J: "...#|...#|...#|#..#|.##.", K: "#..#|#.#.|##..|#.#.|#..#", L: "#...|#...|#...|#...|####",
    M: "#...#|##.##|#.#.#|#...#|#...#", N: "#...#|##..#|#.#.#|#..##|#...#", O: ".##.|#..#|#..#|#..#|.##.",
    P: "###.|#..#|###.|#...|#...", Q: ".##.|#..#|#..#|#.#.|.#.#", R: "###.|#..#|###.|#.#.|#..#",
    S: ".###|#...|.##.|...#|###.", T: "#####|..#..|..#..|..#..|..#..", U: "#..#|#..#|#..#|#..#|.##.",
    V: "#...#|#...#|#...#|.#.#.|..#..", W: "#...#|#...#|#.#.#|##.##|#...#", X: "#...#|.#.#.|..#..|.#.#.|#...#",
    Y: "#...#|.#.#.|..#..|..#..|..#..", Z: "####|...#|..#.|.#..|####",
  };

  function makeBannerSprite(text, cell) {
    const glyphs = [...String(text).toUpperCase()]
      .map((ch) => BANNER_FONT[ch])
      .filter(Boolean)
      .map((g) => g.split("|"));
    if (!glyphs.length) return null;
    const gap = Math.round(cell * 0.9);
    const rows = 5;
    const inkW = glyphs.reduce((w, g, i) => w + g[0].length * cell + (i ? gap : 0), 0);
    const inkH = rows * cell;
    const pad = Math.ceil(cell * 2.2);
    const cv = document.createElement("canvas");
    cv.width = inkW + pad * 2;
    cv.height = inkH + pad * 2;
    const x = cv.getContext("2d");
    const off = Math.max(2, Math.round(cell * 0.5));
    /* เงา (น้ำเงินหม่น เลื่อนครึ่งเซลล์) */
    x.fillStyle = "#35466b";
    let gx = pad;
    glyphs.forEach((g, gi) => {
      g.forEach((line, ry) => {
        for (let i = 0; i < line.length; i++) {
          if (line[i] !== "#") continue;
          x.fillRect(gx + i * cell + off, pad + ry * cell + off, cell, cell);
        }
      });
      gx += g[0].length * cell + (gi < glyphs.length - 1 ? gap : 0);
    });
    /* ตัวอักษรชมพู + เรืองแสง */
    x.fillStyle = "#ff4fd8";
    x.shadowColor = "rgba(255,79,216,0.65)";
    x.shadowBlur = Math.max(4, cell * 1.1);
    gx = pad;
    glyphs.forEach((g, gi) => {
      g.forEach((line, ry) => {
        for (let i = 0; i < line.length; i++) {
          if (line[i] !== "#") continue;
          x.fillRect(gx + i * cell, pad + ry * cell, cell + 0.6, cell + 0.6);
        }
      });
      gx += g[0].length * cell + (gi < glyphs.length - 1 ? gap : 0);
    });
    return { cv, pad, inkH };
  }

  let bannerSprites = null;
  function ensureBanner() {
    if (bannerSprites) return bannerSprites;
    const name = window.CONFIG && CONFIG.name ? String(CONFIG.name).toUpperCase() : "ESTHER";
    bannerSprites = ["HAPPY", "BIRTHDAY", name]
      .map((s) => makeBannerSprite(s, 14))
      .filter(Boolean);
    return bannerSprites;
  }

  /* ลำแสงกวาดผ่านตัวอักษร (mask ด้วย source-atop ให้วิ่งเฉพาะหมึก) */
  const glintTmp = new Map();
  function drawBannerLine(ctx, sprite, cx, inkTop, t) {
    const { cv, pad } = sprite;
    const x = Math.round(cx - cv.width / 2);
    const y = Math.round(inkTop - pad);
    ctx.drawImage(cv, x, y);
    const u = ((((t - 0.5) % 3.2) + 3.2) % 3.2) / 2.4;
    if (u >= 1) return;
    let tmp = glintTmp.get(cv);
    if (!tmp) {
      tmp = document.createElement("canvas");
      tmp.width = cv.width;
      tmp.height = cv.height;
      glintTmp.set(cv, tmp);
    }
    const g = tmp.getContext("2d");
    g.clearRect(0, 0, tmp.width, tmp.height);
    g.drawImage(cv, 0, 0);
    g.globalCompositeOperation = "source-atop";
    const bx = -cv.width * 0.35 + cv.width * 1.7 * u;
    const bw = Math.max(24, cv.width * 0.14);
    g.save();
    g.translate(bx, cv.height / 2);
    g.rotate(0.32);
    const grad = g.createLinearGradient(-bw, 0, bw, 0);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.85)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(-bw, -cv.height, bw * 2, cv.height * 2);
    g.restore();
    g.globalCompositeOperation = "source-over";
    ctx.drawImage(tmp, x, y);
  }

  /* ดอกไม้ไฟพิกเซลเล็ก ๆ ข้างแบนเนอร์ */
  const BURSTS = [[118, 100, 26, "#ffd23a"], [606, 138, 34, "#7ee8ff"], [640, 300, 22, "#ff7aa2"]];
  function drawBursts(ctx, t) {
    BURSTS.forEach(([bx, by, r, col], bi) => {
      const ph = (t * 0.55 + bi * 0.37) % 1;
      const a = Math.max(0, 1 - ph * 1.6);
      if (a <= 0.02) return;
      ctx.globalAlpha = a * 0.8;
      ctx.fillStyle = col;
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2 + bi;
        const d = r * (0.4 + ph * 1.3);
        ctx.fillRect(bx + Math.cos(ang) * d, by + Math.sin(ang) * d, 3, 3);
      }
      ctx.globalAlpha = 1;
    });
  }

  function drawStoryFloaties(ctx, t) {
    const colsH = ["#ff7aa2", "#ff9ec4", "#ffc2d8"];
    for (let i = 0; i < 9; i++) {
      const rise = (t * 34 + i * 151) % (PH + 140);
      const hx = 44 + ((i * 197 + 53) % (PW - 88));
      const hy = PH + 50 - rise;
      drawHeart(ctx, hx, hy, 5 + (i % 3) * 2.5, colsH[i % 3], 0.2 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2 + i * 1.7)));
    }
    for (let i = 0; i < 24; i++) {
      const a = Math.max(0, Math.sin(t * 2.6 + i * 2.1));
      if (a <= 0.05) continue;
      ctx.globalAlpha = a * 0.75;
      ctx.fillStyle = i % 3 ? "#ffe9b0" : "#ffffff";
      const s = 3 + (i % 2);
      ctx.fillRect(((i * 137 + 31) % (PW - 24)) + 12, ((i * 89 + 17) % (PH - 24)) + 12, s, s);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- การ์ดสตอรี่ 9:16 (720×1280) — โพลารอยด์กลางฉากสวย ๆ ---------------- */
  const PW = 720, PH = 1280;
  const CROP = { c0: 13, c1: 67, r0: 1, r1: 33 }; // ครอปฉากเค้กให้เต็มกรอบรูป
  const CARD_W = 600, CARD_BORDER = 24, CARD_BOTTOM = 136;
  const CARD_CX = PW / 2, CARD_CY = 660;

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* โพลารอยด์ + กรอบขาว + แคปชัน (วาดในพิกัดกลางการ์ด) */
  function drawCard(ctx, t) {
    const photoW = CARD_W - CARD_BORDER * 2;
    const cw = CROP.c1 - CROP.c0 + 1;
    const ch = CROP.r1 - CROP.r0 + 1;
    const cell = Math.max(1, Math.floor(photoW / cw));
    const artW = cell * cw;
    const artH = cell * ch;
    const photoH = artH + 12;
    const cardH = CARD_BORDER + photoH + CARD_BOTTOM + CARD_BORDER;

    ctx.save();
    ctx.translate(CARD_CX, CARD_CY);
    ctx.rotate(-2.6 * Math.PI / 180);

    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 44;
    ctx.shadowOffsetY = 20;
    ctx.fillStyle = "#fdfaf3";
    roundRect(ctx, -CARD_W / 2, -cardH / 2, CARD_W, cardH, 12);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    /* พื้นรูปครีมอ่อน */
    const px = -CARD_W / 2 + CARD_BORDER;
    const py = -cardH / 2 + CARD_BORDER;
    ctx.fillStyle = "#fff4e8";
    ctx.fillRect(px, py, photoW, photoH);

    /* เค้กตัวจริง (ครอปให้เต็มกรอบ) */
    drawArt(ctx, px + (photoW - artW) / 2, py + (photoH - artH) / 2, artW, artH, t, CROP);

    /* ขอบรูปบาง ๆ */
    ctx.strokeStyle = "rgba(90,74,106,0.16)";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, photoW - 2, photoH - 2);

    /* แคปชันในกรอบล่าง */
    ctx.textAlign = "center";
    ctx.fillStyle = "#5a4a6a";
    ctx.font = "700 46px Itim, Mitr, sans-serif";
    ctx.fillText("HBD อ้วนๆ ♥", 0, cardH / 2 - CARD_BOTTOM + 60);
    ctx.fillStyle = "#a494bc";
    ctx.font = "26px Itim, Mitr, sans-serif";
    ctx.fillText("18 พ.ย. 2569", 0, cardH / 2 - CARD_BOTTOM + 100);

    ctx.restore();
  }

  /* ภาพรวมสตอรี่ทั้งใบ: ฉากหลังห้องมืด + ธงราว + หัวใจ + การ์ดโพลารอยด์ */
  function drawStory(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, PH);
    g.addColorStop(0, "#22102e");
    g.addColorStop(0.45, "#3a1b40");
    g.addColorStop(0.75, "#2a1330");
    g.addColorStop(1, "#170c1d");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, PW, PH);

    /* bokeh วงเบลอ ๆ */
    const bok = [
      [96, 190, 150, 0.06, "#ff9ec4"],
      [620, 128, 180, 0.05, "#c86aff"],
      [110, 1100, 190, 0.045, "#ffd23a"],
      [640, 1050, 160, 0.055, "#ff7aa2"],
      [360, 250, 250, 0.03, "#ffffff"],
    ];
    for (const [bx, by, br, al, col] of bok) {
      const rg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      rg.addColorStop(0, col);
      rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = al;
      ctx.fillStyle = rg;
      ctx.fillRect(bx - br, by - br, br * 2, br * 2);
    }
    ctx.globalAlpha = 1;

    drawBursts(ctx, t);

    /* แบนเนอร์ HAPPY / BIRTHDAY / ชื่อ */
    let by = 40;
    for (const sp of ensureBanner()) {
      drawBannerLine(ctx, sp, PW / 2, by, t);
      by += sp.inkH + 18;
    }

    drawStoryFloaties(ctx, t);
    drawCard(ctx, t);

    /* ท้ายเรื่อง: บรรทัดเทอร์มินอลน่ารัก ๆ */
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(126,240,192,0.62)";
    ctx.font = '26px "Monocraft", "Mitr", monospace';
    ctx.fillText("esther@love:~$ from timmy ♥", PW / 2, 1040);
    ctx.fillStyle = "rgba(255,236,214,0.5)";
    ctx.font = "24px Itim, Mitr, sans-serif";
    ctx.fillText("ขอให้ปีนี้นะ มีแต่เรื่องดี ๆ ♥", PW / 2, 1092);
  }

  /* ---------------- จอ LCD สด (มองผ่านช่องจอของกล้อง) ---------------- */
  function drawLCD(t) {
    const w = lcd.width, h = lcd.height;
    const ctx = lcd.getContext("2d");
    ctx.fillStyle = "#120d1a";
    ctx.fillRect(0, 0, w, h);
    drawArt(ctx, 0, 0, w, h, t, CROP);
  }

  /* ---------------- สถานะ + ลูปวาด ---------------- */
  let open = false;
  let state = "idle"; // idle → ready → snap → print → develop → done → saving
  let rafId = 0;
  let t0 = 0;
  let lastDraw = 0;
  const timers = [];
  let closeTimer = 0;
  function later(fn, ms) {
    timers.push(setTimeout(fn, ms));
  }
  function clearTimers() {
    while (timers.length) clearTimeout(timers.pop());
  }
  function setState(next) {
    state = next;
    shutter.disabled = next !== "ready";
    lcdWrap.classList.toggle("busy", next !== "ready");
  }
  function setStatus(s) {
    if (lcdStatus) lcdStatus.textContent = s;
  }
  function restep(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function loop(now) {
    if (!open) return;
    rafId = requestAnimationFrame(loop);
    if (now - lastDraw < 46) return; // ~20fps พอสำหรับพิกเซลอาร์ต
    lastDraw = now;
    const t = ((now - t0) / 1000 + 0.4) % 10;
    drawLCD(t);
    if (!polaroid.classList.contains("hidden")) {
      drawStory(polar.getContext("2d"), t);
    }
  }

  /* ---------------- หารูปกล้องที่ตัดไว้ + หา "ช่องจอโปร่งใส" ให้เอง ----------------
     รูปที่ตัดมาจะเจาะช่องจอ LCD เป็นพื้นโปร่งใส → หาแถบที่ alpha ต่ำที่สุด
     (ทำงานเมื่อเปิดผ่าน http/Live Server — บน file:// เบราว์เซอร์บล็อกการอ่านพิกเซล
      แต่ค่า --lcd-* ตั้งต้นถูกวัดจากรูปจริงไว้แล้ว) */
  function autoDetectLCD(img) {
    try {
      const w = 210;
      const h = Math.max(30, Math.round(w * (img.naturalHeight / img.naturalWidth)));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h).data;
      const hole = new Uint8Array(w * h);
      for (let i = 0, p = 3; i < hole.length; i++, p += 4) {
        hole[i] = d[p] < 40 ? 1 : 0;
      }
      const rowC = new Float32Array(h);
      const colC = new Float32Array(w);
      for (let y = 0; y < h; y++) { let s = 0; for (let x = 0; x < w; x++) s += hole[y * w + x]; rowC[y] = s / w; }
      for (let x = 0; x < w; x++) { let s = 0; for (let y = 0; y < h; y++) s += hole[y * w + x]; colC[x] = s / h; }
      const band = (arr, thr) => {
        let best = [0, -1], cur = null;
        for (let i = 0; i < arr.length; i++) {
          if (arr[i] > thr) {
            if (!cur) cur = [i, i]; else cur[1] = i;
          } else if (cur) {
            if (cur[1] - cur[0] > best[1] - best[0]) best = cur;
            cur = null;
          }
        }
        if (cur && cur[1] - cur[0] > best[1] - best[0]) best = cur;
        return best;
      };
      const [x0, x1] = band(colC, 0.35);
      const [y0, y1] = band(rowC, 0.35);
      const bw = (x1 - x0 + 1) / w, bh = (y1 - y0 + 1) / h;
      if (bw >= 0.2 && bh >= 0.2) {
        face.style.setProperty("--lcd-x", (x0 / w) * 100 + "%");
        face.style.setProperty("--lcd-y", (y0 / h) * 100 + "%");
        face.style.setProperty("--lcd-w", (bw * 100) + "%");
        face.style.setProperty("--lcd-h", (bh * 100) + "%");
        // จัดสัดส่วน canvas ให้ตรงช่องจอ (ภาพไม่ยืด)
        const holeW = bw * img.naturalWidth;
        const holeH = bh * img.naturalHeight;
        lcd.width = 300;
        lcd.height = Math.max(80, Math.round(300 * (holeH / holeW)));
      }
    } catch (e) { /* ใช้ตำแหน่งตั้งต้นแทน */ }
  }
  let bodyProbed = false;
  function probeBody() {
    if (bodyProbed) return;
    bodyProbed = true;
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 10) {
        face.style.aspectRatio = img.naturalWidth + " / " + img.naturalHeight;
        face.classList.add("png-body");
        autoDetectLCD(img);
      }
    };
    img.src = "img/instax-evo.png?v=28";
  }

  /* ---------------- ควบคุมหน้าต่าง ---------------- */
  function openWin() {
    if (open) return;
    open = true;
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = 0; }
    setState("ready");
    win.classList.remove("hidden");
    requestAnimationFrame(() => win.classList.add("in"));
    t0 = performance.now();
    lastDraw = 0;
    setStatus("READY ♥");
    if (!rafId) rafId = requestAnimationFrame(loop);
    sfxClick();
    probeBody();
  }
  function closeWin() {
    if (!open) return;
    open = false;
    stopWhirr();
    clearTimers();
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    win.classList.remove("in");
    closeTimer = setTimeout(() => {
      win.classList.add("hidden");
      closeTimer = 0;
    }, 280);
    resetFlow();
  }
  function resetFlow() {
    face.classList.remove("printing");
    printArea.classList.remove("ejecting");
    polaroid.classList.add("hidden");
    polaroid.classList.remove("print");
    actions.classList.add("hidden");
    develop.classList.remove("on", "go");
    flash.classList.remove("go");
    if (open) setState("ready");
    else setState("idle");
  }

  /* ---------------- ถ่าย → แฟลช → ปริ้น → ฟิล์มขึ้นชัด ---------------- */
  function shoot() {
    if (!open || state !== "ready") return;
    setState("snap");
    sfxShutter();
    setStatus("SNAP!");
    restep(flash, "go");
    later(() => printOut(), REDUCED ? 110 : 150);
    later(() => flash.classList.remove("go"), 720);
  }
  function printOut() {
    if (!open) return;
    setState("print");
    startWhirr();
    face.classList.add("printing");
    develop.classList.remove("go");
    develop.classList.add("on");
    polaroid.classList.remove("hidden");
    restep(polaroid, "print");
    printArea.classList.add("ejecting");
    setStatus("PRINTING…");
    try { printArea.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "nearest" }); } catch (e) {}
    later(() => printArea.classList.remove("ejecting"), REDUCED ? 520 : 2320);
    later(developFilm, REDUCED ? 560 : 2450);
  }
  function developFilm() {
    if (!open || state !== "print") return;
    setState("develop");
    stopWhirr();
    face.classList.remove("printing");
    develop.classList.remove("on");
    void develop.offsetWidth;
    develop.classList.add("go");
    setStatus("DEVELOPING…");
    later(done, REDUCED ? 420 : 2150);
  }
  function done() {
    if (!open || state !== "develop") return;
    setState("done");
    actions.classList.remove("hidden");
    sfxChime();
    setStatus("DONE ♥");
    try { actions.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "nearest" }); } catch (e) {}
  }
  function retake() {
    if (!open) return;
    clearTimers();
    stopWhirr();
    resetFlow();
    setStatus("READY ♥");
    sfxClick();
  }

  /* ---------------- บันทึกเป็น GIF แอนิเมตัน ---------------- */
  const GIF_FRAMES = 20;   // 20 เฟรม × 0.24 วิ = ช่วง 4.8 วิ (เทียนไฟลุก → เป่า → จุดใหม่)
  const GIF_STEP = 0.24;
  const GIF_START = 3.2;   // เริ่มตอนเทียนไฟลุกสวย ๆ จบตอนจุดกลับมา → ลูปไม่กระตุก
  const gifCanvas = document.createElement("canvas");
  gifCanvas.width = PW;
  gifCanvas.height = PH;
  const gifCtx = gifCanvas.getContext("2d", { willReadFrequently: true });
  let saving = false;

  async function save() {
    if (saving || state !== "done") return;
    saving = true;
    const oldLabel = (btnSaveLabel && btnSaveLabel.textContent) || "บันทึก GIF";
    const setLabel = (s) => { if (btnSaveLabel) btnSaveLabel.textContent = s; };
    btnSave.disabled = true;
    try {
      try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
      setStatus("MAKING GIF…");
      const blob = await GifMaker.encode({
        width: PW,
        height: PH,
        count: GIF_FRAMES,
        delayMs: GIF_STEP * 1000,
        getFrame: (i) => {
          drawStory(gifCtx, (GIF_START + i * GIF_STEP) % 10);
          return gifCtx.getImageData(0, 0, PW, PH);
        },
        onProgress: (p) => {
          setLabel("ต่อ GIF… " + Math.round(p * 100) + "%");
        },
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "hbd-timmy-polaroid.gif";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setLabel("บันทึกแล้ว! เอาไปลงสตอรี่ได้เลย ♥");
      setStatus("SAVED ♥");
      setTimeout(() => {
        setLabel(oldLabel);
        btnSave.disabled = false;
      }, 2800);
    } catch (e) {
      setLabel("เซฟไม่สำเร็จ ลองใหม่นะ");
      setStatus("ERROR");
      setTimeout(() => {
        setLabel(oldLabel);
        btnSave.disabled = false;
      }, 2800);
    }
    saving = false;
  }

  /* ---------------- เชื่อมปุ่ม ---------------- */
  if (btnOpen) btnOpen.addEventListener("click", openWin);
  if (shutter) shutter.addEventListener("click", shoot);
  if (lcdWrap) lcdWrap.addEventListener("click", () => { if (state === "ready") shoot(); });
  if (btnClose) btnClose.addEventListener("click", closeWin);
  if (btnSave) btnSave.addEventListener("click", save);
  if (btnRetake) btnRetake.addEventListener("click", retake);
  document.addEventListener("keydown", (e) => {
    if (!open) return;
    if (e.key === "Escape") closeWin();
    else if ((e.key === "Enter" || e.key === " ") && state === "ready") {
      e.preventDefault();
      shoot();
    }
  });

  /* ---------------- จอเล็กบนตัวกล้องในฉากเค้ก (โชว์เค้กสด ๆ) ---------------- */
  const miniLcd = $("cake-cam-lcd");
  if (miniLcd && btnOpen) {
    const mctx = miniLcd.getContext("2d");
    let mLast = 0;
    const mT0 = performance.now();
    const miniLoop = (now) => {
      requestAnimationFrame(miniLoop);
      if (now - mLast < 90) return; // ~11fps พอสำหรับจอจิ๋ว
      mLast = now;
      if (open || btnOpen.offsetParent === null) return; // กล้องเต็มจออยู่ / ยังไม่โชว์ปุ่ม
      const w = miniLcd.width, h = miniLcd.height;
      mctx.fillStyle = "#120d1a";
      mctx.fillRect(0, 0, w, h);
      drawArt(mctx, 0, 0, w, h, ((now - mT0) / 1000 + 0.4) % 10, CROP);
    };
    requestAnimationFrame(miniLoop);
  }

  /* รูปกล้องถ้ามี — เช็กตั้งแต่โหลดเลย */
  probeBody();

  return { open: openWin, close: closeWin };
})();
