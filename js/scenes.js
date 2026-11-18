/* ============================================================
   Scenes — ผู้กำกับฉากของทั้งเว็บ
   ฉาก 1: landing (ข้อความชวนใส่เทป + เครื่องเล่นเทป)
   ฉาก 2: ข้อความหวานขึ้นทีละประโยค → พลุ + เค้ก + ชื่อใหญ่ → ปุ่มห้องภาพ/มินิเกม
   (หน้า "จดหมาย" เดิมถูกลบแล้ว — ข้อความของมันย้ายมาขึ้นก่อนเค้กแทน)
   ============================================================ */

(() => {
  const $ = (id) => document.getElementById(id);

  const els = {
    scene1: $("scene-1"),
    scene2: $("scene-2"),
    canvas: $("fx-canvas"),
    love: $("love-lines"),
    loveAscii: $("love-ascii"),
    loveLine: $("love-line"),
    loveNasa: $("love-nasa"),
    nasaFrame: $("nasa-frame"),
    nasaImg: $("nasa-img"),
    nasaCap: $("nasa-cap"),
    nasaLabel: $("nasa-label"),
    media: $("love-media"),
    mediaImg: $("media-img"),
    mediaCap: $("media-cap"),
    storyBars: $("story-bars"),
    storyPause: $("story-pause"),
    gestures: $("story-gestures"),
    cakeWindow: $("cake-window"),
    cake: $("cake"),
    title: $("big-title"),
    actions: $("show-actions"),
    skipBtn: $("skip-btn"),
    replayBtn: $("replay-btn"),
  };

  /* ------------------------------------------------ สลับฉาก */
  function show(n) {
    document.body.dataset.scene = String(n);
    [1, 2].forEach((i) => {
      els["scene" + i].classList.toggle("active", i === n);
    });
    // กลับมาหน้าแรกทุกครั้ง → อัปเดตสถานะเครื่องเล่นเทป
    if (n === 1 && typeof TapePlayer !== "undefined") TapePlayer.syncLanding();
  }

  /* --------------------------------------- หน้า landing
     (หน้าต่าง terminal เดิมถูกลบไปแล้ว — เหลือข้อความชวนใส่เทป + เครื่องเล่น) */
  function initLanding() {}

  /* ------------------ ฉาก 2: ข้อความแบบ story IG —
     แถบเวลาแบ่งช่องด้านบน | แตะขวา = หน้าต่อไป | แตะซ้าย = ย้อนกลับ | กดค้าง = หยุดพัก */
  let loveSkip = false;

  const story = {
    steps: [], idx: 0, raf: 0, t0: 0, elapsed: 0,
    paused: false, held: false, holdTimer: 0, running: false,
    finish: null, skipped: false,
  };

  /* รับได้ทั้งข้อความธรรมดา และ {text, img, cap} — กันการขึ้น [object Object] */
  function normStep(raw, extra) {
    if (typeof raw === "string") return Object.assign({ type: "text", text: raw }, extra || {});
    if (raw && typeof raw === "object") {
      const t = typeof raw.text === "string" ? raw.text
        : typeof raw.message === "string" ? raw.message
        : typeof raw.title === "string" ? raw.title : "";
      return Object.assign({
        type: "text",
        text: t,
        img: typeof raw.img === "string" ? raw.img : undefined,
        cap: typeof raw.cap === "string" ? raw.cap : undefined,
      }, extra || {});
    }
    return null;
  }

  /* ประโยคใช้ฟอนต์บล็อกได้เฉพาะ A-Z 0-9 เท่านั้น (ฟอนต์ big-text ไม่มีตัวไทย) */
  function isBlockText(s) {
    return /^[A-Za-z0-9 .,!?'":;+=\/_-]+$/.test(s);
  }

  /* เล่นอนิเมชั่น "เข้าใหม่" — ถอดคลาสออกก่อนแล้วใส่คืน เพื่อให้ทุกหน้ามีท่าเข้าของตัวเอง */
  function restep(el) {
    el.classList.remove("step-in");
    void el.offsetWidth;
    el.classList.add("step-in");
  }

  /* โชว์ประโยคธรรมดา (ไทยหรือประโยคยาว) — มี img = รูปจาง ๆ เต็มจออยู่หลังข้อความ */
  function showTextSentence(s, st) {
    BigBanner.stop();
    els.loveNasa.classList.add("hidden");
    els.loveNasa.classList.remove("show");
    els.loveAscii.classList.add("hidden");
    els.loveAscii.innerHTML = "";
    els.loveLine.classList.remove("hidden", "show");
    els.loveLine.textContent = s;
    if (st && st.img) {
      els.mediaImg.onerror = () => els.media.classList.add("hidden"); // รูปพัง = เลิกโชว์รูป
      els.mediaImg.alt = st.cap || "";
      els.mediaCap.textContent = st.cap || "";
      els.mediaImg.src = st.img;
      els.love.classList.add("has-media");
      // รูปโหลดไว้ล่วงหน้าแล้วตอนเริ่มลำดับ — โชว์พร้อมอนิเมชั่นจางเข้าได้เลย
      els.media.classList.remove("hidden");
      restep(els.media);
    } else {
      els.media.classList.add("hidden");
      els.love.classList.remove("has-media");
    }
    restep(els.loveLine); // ข้อความลอยขึ้น+เบลอจางหายทุกครั้งที่เปลี่ยนหน้า
    els.loveLine.classList.add("show");
  }

  /* โชว์สไลด์รูป NASA (ภาพอวกาศวันเกิด) */
  function showNasaSlide() {
    BigBanner.stop();
    els.loveLine.classList.add("hidden");
    els.loveLine.classList.remove("show");
    els.loveAscii.classList.add("hidden");
    els.loveAscii.innerHTML = "";
    els.media.classList.add("hidden"); // ซ่อนภาพประกอบหน้าก่อน ไม่ให้ค้างคู่กับ NASA
    els.love.classList.remove("has-media");
    els.loveNasa.classList.remove("hidden");
    restep(els.loveNasa); // อนิเมชั่นเข้าของสไลด์ NASA เล่นใหม่ทุกครั้ง
    els.loveNasa.classList.add("show");
  }

  /* เคลียร์ทุกอย่างหลังลำดับจบ */
  function hideAllLove() {
    BigBanner.stop();
    els.loveNasa.classList.add("hidden");
    els.loveNasa.classList.remove("show");
    els.media.classList.add("hidden");
    els.loveAscii.innerHTML = "";
    els.loveAscii.classList.add("hidden");
    els.loveLine.classList.remove("show");
    els.loveLine.textContent = "";
    els.love.classList.add("hidden");
    els.love.classList.remove("fading", "has-media");
  }

  /* สร้างลำดับขั้นจาก CONFIG — ทุกแถวรับได้ทั้ง string และ object */
  function buildSteps() {
    const steps = [];
    (CONFIG.wishes || []).forEach((w) => {
      const s = normStep(w);
      if (s && s.text) steps.push(s);
    });
    (CONFIG.thisDay || []).forEach((d) => {
      const s = normStep(d);
      if (s && (s.text || s.img)) steps.push(s);
    });
    if (CONFIG.nasa && CONFIG.nasa.src) steps.push({ type: "nasa" });
    const last = normStep(CONFIG.signoff, { isLast: true });
    if (last && last.text) steps.push(last);
    return steps;
  }

  /* ความนานแต่ละหน้า (มิลลิวินาที จาก CONFIG.loveTiming) */
  function stepDur(st) {
    const LT = CONFIG.loveTiming || {};
    const T_TEXT = LT.text || 3400;
    const T_NASA = LT.nasa || 5200;
    const T_LAST = LT.last || 4200;
    if (st.type === "nasa") return T_NASA;
    return st.isLast ? T_LAST : T_TEXT + (st.img ? 1600 : 0);
  }

  /* วาดหน้าปัจจุบัน (เรียกซ้ำได้เรื่อย ๆ เพราะย้อนกลับได้) */
  function renderStep(st) {
    BigBanner.stop();
    if (st.type === "nasa") { showNasaSlide(); return; }
    const s = st.text;
    // จอกว้าง + ประโยคอังกฤษสั้น → ฟอนต์บล็อก ASCII / ไทย → ตัวหนังสือใหญ่
    const useBlock = typeof s === "string" && window.BigBanner
      && window.innerWidth >= 700 && isBlockText(s) && !st.img;
    if (useBlock) {
      els.media.classList.add("hidden");
      els.love.classList.remove("has-media");
      els.loveLine.classList.add("hidden");
      els.loveAscii.classList.remove("hidden");
      BigBanner.start(els.loveAscii, [s], { hRatio: 0.42, maxFont: 30 });
    } else {
      showTextSentence(s, st);
    }
  }

  /* แถบเวลาด้านบน — หนึ่งช่องต่อหนึ่งหน้า */
  function buildBars() {
    els.storyBars.innerHTML = "";
    story.steps.forEach(() => {
      const seg = document.createElement("i");
      seg.className = "seg";
      els.storyBars.appendChild(seg);
    });
  }

  function paintBars() {
    Array.prototype.forEach.call(els.storyBars.children, (seg, i) => {
      seg.classList.toggle("done", i < story.idx);
      seg.classList.toggle("cur", i === story.idx);
      if (i !== story.idx) seg.style.setProperty("--p", i < story.idx ? "1" : "0");
    });
  }

  function tick() {
    story.raf = requestAnimationFrame(tick);
    const now = performance.now();
    if (story.paused) { story.t0 = now; return; }
    story.elapsed += now - story.t0;
    story.t0 = now;
    const seg = els.storyBars.children[story.idx];
    const p = Math.min(1, story.elapsed / stepDur(story.steps[story.idx]));
    if (seg) seg.style.setProperty("--p", p.toFixed(3));
    if (p >= 1) next();
  }

  function goto(i) {
    story.idx = i;
    story.elapsed = 0;
    story.t0 = performance.now();
    paintBars();
    renderStep(story.steps[i]);
  }

  function next() {
    if (story.idx >= story.steps.length - 1) { finish(); return; }
    goto(story.idx + 1);
  }

  function back() {
    if (story.idx > 0) goto(story.idx - 1);
  }

  function finish() {
    if (!story.running) return;
    story.running = false;
    cancelAnimationFrame(story.raf);
    els.gestures.classList.add("hidden");
    els.storyBars.classList.add("hidden");
    els.storyPause.classList.add("hidden");
    loveSkip = story.skipped; // กดข้าม = ชื่อบนเค้กโชว์แบบ instant
    hideAllLove();
    if (story.finish) story.finish();
  }

  async function loveSequence() {
    /* ลำดับ: บทเปิด → เกร็ด "วันนั้นโลกมีอะไร" → รูป NASA วันเกิด → ประโยคปิดท้าย */
    story.steps = buildSteps();
    if (!story.steps.length) return;

    els.love.classList.remove("hidden", "fading", "has-media");
    els.loveLine.classList.remove("show");
    els.loveLine.textContent = "";

    /* เตรียมรูปล่วงหน้า: NASA (โหลดไม่ได้ = โชว์ไอคอนดาวตกแทน) + ภาพประกอบทุกใบ */
    if (CONFIG.nasa && CONFIG.nasa.src) {
      els.nasaImg.onerror = () => els.nasaFrame.classList.add("nasa-fail");
      els.nasaImg.onload = () => els.nasaFrame.classList.remove("nasa-fail");
      els.nasaImg.src = CONFIG.nasa.src;
      els.nasaLabel.textContent = CONFIG.nasa.label || "NASA";
      els.nasaCap.textContent = CONFIG.nasa.caption || "";
    }
    story.steps.forEach((st) => { if (st.img) { const im = new Image(); im.src = st.img; } });

    /* เปิดระบบ story: แถบเวลา + ชั้นจับท่าแตะ */
    buildBars();
    els.storyBars.classList.remove("hidden");
    els.gestures.classList.remove("hidden");
    story.running = true;
    story.skipped = false;
    story.paused = false;
    story.held = false;
    cancelAnimationFrame(story.raf);
    goto(0);
    story.raf = requestAnimationFrame(tick);

    /* รอจนจบหน้าสุดท้าย (หรือใครกด finish) แล้วค่อยไปฉากเค้ก */
    await new Promise((res) => { story.finish = res; });
  }

  /* ---------------------------------- ฉาก 2: พลุ + เค้ก */
  async function runShow() {
    Fireworks.stop();
    Cake.stop();
    BigBanner.stop();

    // เคลียร์ของรอบก่อน
    els.cakeWindow.classList.add("hidden");
    els.cakeWindow.classList.remove("in");
    els.title.innerHTML = "";
    els.title.classList.remove("instant");
    els.actions.classList.add("hidden");
    els.skipBtn.classList.remove("hidden");
    show(2);

    // 1) ข้อความหวานทีละประโยค
    loveSkip = false;
    await loveSequence();

    // 2) พลุ + เค้ก + ชื่อใหญ่
    Fireworks.start();
    await Terminal.sleep(320);
    await revealCake();

    // 3) เมนูต่อ (ห้องภาพ / มินิเกม / เล่นอีกครั้ง)
    els.skipBtn.classList.add("hidden");
    els.actions.classList.remove("hidden");
  }

  async function revealCake() {
    els.cakeWindow.classList.remove("hidden");
    // force reflow เพื่อให้ transition ของ .in เล่นจริง
    void els.cakeWindow.offsetWidth;
    els.cakeWindow.classList.add("in");
    if (loveSkip) els.title.classList.add("instant");
    // หน้าต่างเต็มจอ: แบนเนอร์ชื่อบน + เค้กใหญ่กลาง
    BigBanner.start(els.title, ["HAPPY", "BIRTHDAY", CONFIG.name.toUpperCase()]);
    Cake.start(els.cake);
    await Terminal.sleep(1500);
  }

  /* ---------------------------------------- เชื่อมปุ่ม */
  // skip = ข้าม story ไปเค้กเลย (ระหว่างฉาก 2)
  els.skipBtn.addEventListener("click", () => {
    story.skipped = true;
    finish();
  });

  /* ท่าทางแบบ story IG: แตะขวา = ต่อไป, แตะซ้าย = ย้อน, กดค้าง = หยุดพัก */
  els.gestures.addEventListener("pointerdown", (e) => {
    if (!story.running) return;
    e.preventDefault();
    story.paused = true;
    story.held = false;
    els.storyPause.classList.remove("hidden");
    clearTimeout(story.holdTimer);
    story.holdTimer = setTimeout(() => { story.held = true; }, 300);
  });
  els.gestures.addEventListener("pointerup", (e) => {
    if (!story.running) return;
    clearTimeout(story.holdTimer);
    const wasHeld = story.held;
    story.held = false;
    story.paused = false;
    els.storyPause.classList.add("hidden");
    if (wasHeld) return; // กดค้างไว้ = แค่พักเฉย ๆ ไม่เลื่อนหน้า
    if (e.clientX / window.innerWidth > 0.42) next();
    else back();
  });
  els.gestures.addEventListener("pointercancel", () => {
    clearTimeout(story.holdTimer);
    story.held = false;
    story.paused = false;
    els.storyPause.classList.add("hidden");
  });

  els.replayBtn.addEventListener("click", () => {
    MiniGame.close();
    InstaxPrinter.close();
    show(1); // กลับหน้าแรก (เครื่องเล่นเทปจะอัปเดตสถานะเอง)
  });

  // คีย์บอร์ดระหว่างฉาก 2: →/← = เลื่อนหน้า, Enter/Esc = ข้ามไปเค้ก
  document.addEventListener("keydown", (e) => {
    if (document.body.dataset.scene !== "2") return;
    if (e.key === "ArrowRight" && story.running) { next(); return; }
    if (e.key === "ArrowLeft" && story.running) { back(); return; }
    if (e.key === "Enter" || e.key === "Escape") {
      story.skipped = true;
      finish();
    }
  });

  /* ---------------------------------------- เริ่มระบบ */
  Fireworks.init(els.canvas);
  initLanding();
  // ผูก "เข้าโชว์" ของเครื่องเล่นเทป เข้ากับโชว์เดิม
  if (typeof TapePlayer !== "undefined") TapePlayer.init(runShow);
  show(1); // หน้าแรก (เครื่องเล่นเทปอยู่ในนั้นแล้ว)
})();
