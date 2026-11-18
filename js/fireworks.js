/* ============================================================
   Fireworks — เอนจิ้นพลุ (canvas particle system)
   - จรวดพุ่งขึ้นจากด้านล่าง แล้วระเบิดเป็นประกายสี neon
   - บางลูกระเบิดเป็นรูปหัวใจ (สีชมพู)
   - เคารพ prefers-reduced-motion (ลดจำนวน particle)
   ============================================================ */

const Fireworks = (() => {
  let canvas = null, ctx = null;
  let W = 0, H = 0, dpr = 1;
  let rockets = [], sparks = [];
  let running = false, rafId = 0, launchTimer = null;

  const REDUCED =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const rand = (a, b) => a + Math.random() * (b - a);

  function init(cv) {
    canvas = cv;
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ยิงจรวดลูกใหม่ */
  function launch() {
    rockets.push({
      x: rand(W * 0.15, W * 0.85),
      y: H + 10,
      vx: rand(-0.5, 0.5),
      vy: -(H * 0.0125 + rand(0, 2)),
      hue: Math.random() < 0.3 ? 330 : Math.floor(rand(0, 360)),
      targetY: rand(H * 0.18, H * 0.45),
    });
  }

  /* ระเบิดที่จุด (x, y) — 35% เป็นรูปหัวใจ */
  function explode(x, y, hue) {
    const isHeart = Math.random() < 0.35;
    const count = REDUCED ? 28 : 90;

    if (isHeart) {
      // สมการหัวใจ: x=16sin^3(t), y=13cos(t)-5cos(2t)-2cos(3t)-cos(4t)
      const h = 335 + rand(-12, 12); // ชมพูเป็นหลัก
      for (let i = 0; i < count; i++) {
        const t = (i / count) * Math.PI * 2;
        const hx = 16 * Math.pow(Math.sin(t), 3);
        const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        const s = rand(0.16, 0.24);
        sparks.push({
          x, y,
          vx: hx * s,
          vy: hy * s * 0.9,
          life: rand(0.9, 1.15),
          decay: rand(0.008, 0.012),
          hue: h + rand(-15, 15),
          g: 0.018,
          size: 2,
        });
      }
    } else {
      for (let i = 0; i < count; i++) {
        const a = rand(0, Math.PI * 2);
        const sp = Math.sqrt(Math.random()) * rand(2.2, 4.4);
        sparks.push({
          x, y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: rand(0.8, 1.1),
          decay: rand(0.008, 0.014),
          hue: hue + rand(-24, 24),
          g: 0.035,
          size: rand(1.4, 2.4),
        });
      }
    }
  }

  function tick() {
    if (!running) return;

    // ลากเทรล: ลบพิกเซลเก่าจาง ๆ แทนการทาสีดำทับ — canvas อยู่เหนือหน้าต่างเค้ก
    // (ถ้าทาสีดำจะทำให้เค้กมืดลงทุกเฟรม; destination-out ลบให้กลับโปร่งใส)
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = "lighter";

    // จรวด
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.x += r.vx;
      r.y += r.vy;
      r.vy += 0.07;
      ctx.beginPath();
      ctx.fillStyle = "hsla(" + r.hue + ", 100%, 72%, 0.95)";
      ctx.arc(r.x, r.y, 2, 0, Math.PI * 2);
      ctx.fill();
      if (r.vy > -1.4 || r.y <= r.targetY) {
        explode(r.x, r.y, r.hue);
        rockets.splice(i, 1);
      }
    }

    // ประกายไฟ
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.g;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.life -= p.decay;
      if (p.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.fillStyle =
        "hsla(" + p.hue + ", 100%, " + (55 + 25 * p.life).toFixed(0) + "%, " +
        Math.min(1, p.life).toFixed(2) + ")";
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }

    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (running) return;
    running = true;
    tick();
    launchTimer = setInterval(() => {
      if (rockets.length < 3) {
        launch();
        if (Math.random() < 0.5) launch();
      }
    }, REDUCED ? 1600 : 750);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
    if (launchTimer) { clearInterval(launchTimer); launchTimer = null; }
    rockets = [];
    sparks = [];
    if (ctx) ctx.clearRect(0, 0, W, H);
  }

  return { init, start, stop };
})();
