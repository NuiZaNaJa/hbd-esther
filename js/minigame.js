/* ============================================================
   catch.love — มินิเกมเก็บหัวใจ (ธีม terminal)
   - จับ ♥ (+1) และ ★ (+5) ที่ร่วงลงมา หลีกเลี่ยง ✖ (มัลแวร์)
   - จับต่อเนื่องได้คอมโบ x2 / x3 · รอบละ 45 วินาที
   - มี 3 หัวใจ: จับโดน ✖ = เสีย 1 ดวง
   - เล่นได้ทั้งจอสัมผัส (ลากนิ้ว) เมาส์ และปุ่มลูกศร ← →
   - สถิติสูงสุด (BEST) เก็บใน localStorage
   - เสียงจิ๋ว ๆ สังเคราะห์ด้วย WebAudio (ไม่ใช้ไฟล์เสียง)
   ============================================================ */

const MiniGame = (() => {
  const $ = (id) => document.getElementById(id);

  const win = $("game-window");
  const canvas = $("game-canvas");
  const stage = $("game-stage");
  const overlay = $("game-overlay");
  const card = $("game-card");
  const hudScore = $("hud-score");
  const hudCombo = $("hud-combo");
  const hudTime = $("hud-time");
  const hudLives = $("hud-lives");

  const NICK = (typeof CONFIG !== "undefined" && CONFIG.nickname) || "ที่รัก";
  const ROUND = 45; // วินาทีต่อรอบ
  const BEST_KEY = "hbd.kunfan.catchlove.best";
  /* สถิติของทิมมี่ (216) — ใช้เทียบคะแนนทุกรอบ */
  const GAME_CFG = (typeof CONFIG !== "undefined" && CONFIG.game) || {};
  const RIVAL = typeof GAME_CFG.rivalScore === "number" ? GAME_CFG.rivalScore : 216;
  const BEAT_MSG = GAME_CFG.beatMsg || "เก่งงงจังงเลยยย ฉันต้องยอมเป็นไอกากของเองสินะ";
  const LOSE_MSG = GAME_CFG.loseMsg || "ถึงจะชนะฉันก็ยังต้องเป็นไอกากของเองอยู่ดี";
  function rivalMessage(score) {
    return score > RIVAL ? BEAT_MSG : LOSE_MSG;
  }
  const FONT = 'Menlo, "DejaVu Sans Mono", "Cascadia Mono", Consolas, "Apple Color Emoji", "Segoe UI Emoji", monospace';

  /* ---------------- สถานะเกม ---------------- */
  let open = false;
  let running = false;
  let rafId = 0;
  let last = 0;
  let W = 800, H = 600, DPR = 1;

  const S = {
    score: 0,
    lives: 3,
    timeLeft: ROUND,
    streak: 0,
    mult: 1,
    elapsed: 0,
    spawnAcc: 0,
    shake: 0,
    catcher: { x: 0.5 },
    items: [],
    parts: [],
  };

  let best = 0;
  try { best = parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0; } catch (e) {}

  const keys = new Set();

  /* ---------------- เสียงจิ๋ว (WebAudio) ---------------- */
  let actx = null;
  function tone(freq, dur, type, vol, slide) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      const t0 = actx.currentTime;
      const osc = actx.createOscillator();
      const g = actx.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, t0);
      if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
      g.gain.setValueAtTime(vol || 0.1, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(actx.destination);
      osc.start(t0);
      osc.stop(t0 + dur);
    } catch (e) { /* ไม่มีเสียงก็ยังเล่นได้ */ }
  }

  /* ---------------- ขนาดผืนผ้าใบ ---------------- */
  function fit() {
    const rect = stage.getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(200, rect.width);
    H = Math.max(200, rect.height);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
  }

  /* ตำแหน่ง/ขนาดของแปลนรับหัวใจ */
  function catcherGeom() {
    return {
      cx: S.catcher.x * W,
      cy: H - Math.max(24, H * 0.055),
      cw: Math.max(64, W * 0.14),
      ch: Math.max(12, H * 0.026),
    };
  }

  /* ---------------- รีเซ็ตรอบใหม่ ---------------- */
  function reset() {
    S.score = 0;
    S.lives = 3;
    S.timeLeft = ROUND;
    S.streak = 0;
    S.mult = 1;
    S.elapsed = 0;
    S.spawnAcc = 0;
    S.shake = 0;
    S.catcher.x = 0.5;
    S.items = [];
    S.parts = [];
    updateHud();
  }

  /* ---------------- การเกิดของไอเทม ---------------- */
  function spawnItem(prog) {
    const r = Math.random();
    const bugP = 0.1 + 0.14 * prog; // มัลแวร์เยอะขึ้นตามเวลา
    const type = r < bugP ? "bug" : r < bugP + 0.13 ? "star" : "heart";
    const vy = (0.3 + 0.34 * prog) * (0.85 + Math.random() * 0.3);
    S.items.push({
      type,
      x: 0.06 + Math.random() * 0.88,
      y: -0.04,
      vy,
      ph: Math.random() * 6.28,
      size: Math.max(16, H * 0.05),
    });
  }

  /* ---------------- คะแนน / คอมโบ ---------------- */
  function recomputeMult() {
    S.mult = S.streak >= 10 ? 3 : S.streak >= 5 ? 2 : 1;
  }

  function burst(px, py, col, size) {
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * 6.28;
      const sp = 60 + Math.random() * 110;
      S.parts.push({
        x: px, y: py,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        life: 0.5, max: 0.5,
        col,
        size: Math.max(3, size * 0.16),
      });
    }
  }

  function catchItem(it, px, py) {
    if (it.type === "bug") {
      S.lives--;
      S.streak = 0;
      recomputeMult();
      S.shake = 1;
      tone(150, 0.28, "sawtooth", 0.12, 80);
      burst(px, py, "#ff4d5e", it.size);
      updateHud();
      if (S.lives <= 0) endGame("BUG ATTACK — GAME OVER");
      return;
    }
    const pts = (it.type === "star" ? 5 : 1) * S.mult;
    S.score += pts;
    S.streak++;
    recomputeMult();
    tone(it.type === "star" ? 880 : 620, it.type === "star" ? 0.14 : 0.09, "sine", 0.1, it.type === "star" ? 1320 : 930);
    burst(px, py, it.type === "star" ? "#ffd23a" : "#ff5fb0", it.size);
    S.parts.push({
      txt: "+" + pts,
      x: px, y: py - it.size,
      vx: 0, vy: -46,
      life: 0.7, max: 0.7,
      col: "#ffffff",
      size: Math.max(12, H * 0.028),
    });
    updateHud();
  }

  /* ---------------- อัปเดตต่อเฟรม ---------------- */
  function update(dt) {
    S.elapsed += dt;
    S.timeLeft -= dt;
    if (S.timeLeft <= 0) { endGame("=== TIME UP ==="); return; }

    const prog = 1 - S.timeLeft / ROUND;

    // เกิดไอเทมใหม่ (ถี่ขึ้นเรื่อย ๆ)
    S.spawnAcc += dt;
    if (S.spawnAcc >= 0.8 - 0.44 * prog) {
      S.spawnAcc = 0;
      spawnItem(prog);
    }

    // แปลนรับ: ปุ่มลูกศร / A-D
    if (keys.has("ArrowLeft") || keys.has("a")) S.catcher.x -= 1.1 * dt;
    if (keys.has("ArrowRight") || keys.has("d")) S.catcher.x += 1.1 * dt;
    S.catcher.x = Math.max(0.04, Math.min(0.96, S.catcher.x));

    const g = catcherGeom();

    for (let i = S.items.length - 1; i >= 0; i--) {
      const it = S.items[i];
      it.y += it.vy * dt;
      const sw = it.type === "bug" ? 0.02 : 0.05;
      it.x += Math.sin(S.elapsed * 2.4 + it.ph) * sw * dt;
      it.x = Math.max(0.03, Math.min(0.97, it.x));

      const px = it.x * W, py = it.y * H;
      const inBand = py >= g.cy - g.ch * 0.6 && py <= g.cy + g.ch * 2.4;
      const inX = Math.abs(px - g.cx) < g.cw / 2 + it.size * 0.35;
      if (inBand && inX) {
        S.items.splice(i, 1);
        catchItem(it, px, py);
        if (!running) return; // แพ้ระหว่างจับ
        continue;
      }
      if (it.y > 1.12) {
        S.items.splice(i, 1);
        if (it.type !== "bug") {
          // ปล่อยหลุด → คอมโบแตก
          S.streak = 0;
          recomputeMult();
          updateHud();
        }
      }
    }

    // อนุภาคเวลาจับได้
    for (let i = S.parts.length - 1; i >= 0; i--) {
      const p = S.parts[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) S.parts.splice(i, 1);
    }

    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 2.2);
  }

  /* ---------------- วาดภาพ ---------------- */
  function draw() {
    const ctx = canvas.getContext("2d");
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (S.shake > 0) {
      const a = S.shake * 5;
      ctx.translate((Math.random() * 2 - 1) * a, (Math.random() * 2 - 1) * a);
    }
    ctx.clearRect(-12, -12, W + 24, H + 24);

    // ไอเทมร่วง
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const it of S.items) {
      const px = it.x * W, py = it.y * H;
      const col = it.type === "heart" ? "#ff5fb0" : it.type === "star" ? "#ffd23a" : "#ff4d5e";
      ctx.save();
      ctx.font = "bold " + it.size + "px " + FONT;
      ctx.shadowColor = col;
      ctx.shadowBlur = it.size * 0.7;
      ctx.fillStyle = col;
      if (it.type === "bug") {
        ctx.translate(px, py);
        ctx.rotate(Math.sin(S.elapsed * 6 + it.ph) * 0.25);
        ctx.fillText("✖", 0, 0);
      } else {
        ctx.fillText(it.type === "heart" ? "♥" : "★", px, py);
      }
      ctx.restore();
    }

    // แปลนรับหัวใจ (terminal bracket)
    const g = catcherGeom();
    const post = Math.max(3, W * 0.005);
    ctx.save();
    ctx.shadowColor = "#3dffa8";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#3dffa8";
    ctx.fillRect(g.cx - g.cw / 2, g.cy, g.cw, g.ch);
    ctx.fillRect(g.cx - g.cw / 2, g.cy - g.ch * 1.4, post, g.ch * 1.4);
    ctx.fillRect(g.cx + g.cw / 2 - post, g.cy - g.ch * 1.4, post, g.ch * 1.4);
    ctx.restore();

    // อนุภาค + ป้ายคะแนนลอย
    for (const p of S.parts) {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.col;
      if (p.txt) {
        ctx.font = "bold " + p.size + "px " + FONT;
        ctx.fillText(p.txt, p.x, p.y);
      } else {
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  function loop(now) {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000) || 0;
    last = now;
    update(dt);
    if (running) draw();
  }

  /* ---------------- HUD ---------------- */
  function updateHud() {
    hudScore.textContent = "LOVE: " + S.score;
    hudCombo.textContent = S.mult > 1 ? "COMBO x" + S.mult : "";
    const t = Math.max(0, Math.ceil(S.timeLeft));
    hudTime.textContent = "TIME " + t;
    hudTime.classList.toggle("low", t <= 10 && running);
    hudLives.innerHTML =
      '<span class="lv-full">' + "♥".repeat(Math.max(0, S.lives)) + "</span>" +
      '<span class="lv-empty">' + "♡".repeat(Math.max(0, 3 - S.lives)) + "</span>";
  }

  /* ---------------- หน้าจอเริ่ม / จบเกม ---------------- */
  function showStart() {
    card.innerHTML =
      '<div class="game-logo">catch.love</div>' +
      '<div class="game-sub">v1.0 — catch the hearts ♥</div>' +
      '<p class="game-msg">เก็บ ♥ ให้ได้เยอะที่สุดใน ' + ROUND + ' วินาที · ★ ให้ +5 · <b>อย่าจับ ✖ เด็ดขาด!</b><br>ขยับด้วยการลากนิ้ว / เมาส์ หรือปุ่มลูกศร ← →</p>' +
      '<div class="game-best">' + (best > 0 ? "BEST: " + best + " · " : "") + "สถิติทิมมี่: " + RIVAL + "</div>" +
      '<button id="game-start" class="btn-ghost pink" type="button">▶ START</button>';
    overlay.classList.remove("hidden");
  }

  function endGame(reason) {
    running = false;
    cancelAnimationFrame(rafId);
    keys.clear();
    tone(240, 0.5, "triangle", 0.12, 110);

    if (S.score > best) {
      best = S.score;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {}
    }

    const msg = rivalMessage(S.score);
    const hint = S.score >= 200
      ? '<div class="game-hint">&gt;&gt; ปลดล็อกคำใบ้: ลอง <code>sudo unlock --gift</code> สิ</div>'
      : "";

    card.innerHTML =
      '<div class="game-logo">' + reason + "</div>" +
      '<div class="game-final">LOVE: ' + S.score + "</div>" +
      '<div class="game-best">BEST: ' + best + " · สถิติทิมมี่: " + RIVAL + "</div>" +
      '<p class="game-msg">' + msg + "</p>" +
      hint +
      '<div class="game-actions">' +
      '<button id="game-again" class="btn-ghost" type="button">↺ PLAY AGAIN</button>' +
      '<button id="game-close2" class="btn-ghost pink" type="button">✕ CLOSE</button>' +
      "</div>";
    overlay.classList.remove("hidden");
  }

  /* ---------------- เริ่ม / ปิดเกม ---------------- */
  function startGame() {
    reset();
    overlay.classList.add("hidden");
    running = true;
    last = performance.now();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
    tone(520, 0.12, "square", 0.08, 780);
  }

  function openGame() {
    if (open) return;
    open = true;
    win.classList.remove("hidden");
    void win.offsetWidth; // force reflow ให้ transition เล่น
    win.classList.add("in");
    fit();
    reset();
    showStart();
    tone(420, 0.1, "sine", 0.06, 640);
  }

  function closeGame() {
    if (!open) return;
    open = false;
    running = false;
    cancelAnimationFrame(rafId);
    keys.clear();
    win.classList.remove("in");
    win.classList.add("hidden");
  }

  /* ---------------- ปุ่มควบคุม ---------------- */
  function moveCatcher(e) {
    if (!open) return;
    const rect = canvas.getBoundingClientRect();
    S.catcher.x = Math.max(0.04, Math.min(0.96, (e.clientX - rect.left) / rect.width));
  }

  canvas.addEventListener("pointermove", moveCatcher);
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    moveCatcher(e);
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    }
  });

  document.addEventListener("keydown", (e) => {
    if (!open) return;
    if (e.key === "Escape") { closeGame(); return; }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) {
      e.preventDefault();
      keys.add(e.key);
    }
    if (e.key.length === 1) keys.add(e.key.toLowerCase());
  });
  document.addEventListener("keyup", (e) => {
    keys.delete(e.key);
    if (e.key.length === 1) keys.delete(e.key.toLowerCase());
  });

  /* ปุ่มในการ์ด (สร้างใหม่ทุกรอบ — ใช้ delegation) */
  overlay.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.id === "game-start" || btn.id === "game-again") startGame();
    else if (btn.id === "game-close2") closeGame();
  });

  $("btn-game").addEventListener("click", openGame);
  $("game-close").addEventListener("click", closeGame);
  window.addEventListener("resize", () => { if (open) fit(); });

  return { open: openGame, close: closeGame, rivalMessage, rivalScore: RIVAL };
})();
