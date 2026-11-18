/* ============================================================
   TapePlayer v4 — เครื่องเล่นเทปสไตล์เด็คยุค 70s (หน้าแรก)
   - ลากเทปด้วยเมาส์/นิ้วแบบ drag & drop อิสระ 2 แกน (ตามเมาส์)
   - ปล่อยบนช่อง (bay หลังกระจกควันบุหงี่) → เทป "ย้ายเข้าไปอยู่ในเครื่อง"
     (reparent เข้า .bay จริง ๆ → มองเห็นหมุนหลังกระจก)
   - ฮับบนเทปหมุนตอนเพลงเล่น / เข็ม VU เอี้ยว / counter เดิน
   - ปุ่มเดินเทป: ▶ เล่นต่อ · PAUSE หยุด · STOP⏏ ดีดเทปออก (FLIP กลับที่วาง)
   - ไม่แสดงชื่อเพลง (แค่ ▶ NOW PLAYING บน terminal)
   - ใส่เสร็จรอแป๊บแล้วเด้งจอ boot สไตล์ terminal พาเข้าโชว์เอง
   ============================================================ */

var TapePlayer = (() => {
  const $ = (id) => document.getElementById(id);

  const scene1 = $("scene-1");
  const deck = $("deck-widget");
  const bay = $("deck-bay");
  const lines = $("deck-lines");
  const slot = $("deck-slot");
  const tapeFloat = $("tape-float");
  const skipBtn = $("tape-skip");
  const toggleBtn = $("tape-toggle");
  const powerBtn = $("deck-power");
  const counterEl = $("deck-counter");
  const cassette = $("cassette");
  const reelL = $("reel-l");
  const reelR = $("reel-r");

  const T = (typeof CONFIG !== "undefined" && CONFIG.tape) || {};
  const SONG_SRC = T.src || "MUSIC/song.mp3";

  let audio = null;      // ตัวเพลง (สร้างตอนใส่เทปครั้งแรก)
  let inserted = false;  // เทปอยู่ในเครื่องหรือยัง
  let busy = false;      // กำลังบินเข้า/ดีดออก/พิมพ์จออยู่
  let spinning = false;  // กำลังเปลี่ยนฉาก (จอ boot)
  let onProceed = null;  // ฟังก์ชัน "เข้าโชว์" ที่ scenes.js ให้มา
  let autoTimer = null;

  /* สเกลเทปตอนอยู่ใน bay — ต้องตรงกับ --in-scale ใน CSS เป๊ะ */
  function inScale() {
    return (window.matchMedia && window.matchMedia("(max-width: 640px)").matches) ? 0.6 : 0.8;
  }

  /* ลากเทป (2 แกน ตามเมาส์/นิ้ว) */
  let dragging = false;
  let sx = 0, sy = 0;    // จุดจับเริ่มลาก
  let tx = 0, ty = 0;    // ระยะที่ลากไปแล้ว

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
      g.gain.setValueAtTime(vol || 0.08, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(actx.destination);
      osc.start(t0);
      osc.stop(t0 + dur);
    } catch (e) {}
  }

  function clunk() { // เสียง "จ๊าบ" ตอนเทปเข้าช่อง
    tone(180, 0.09, "square", 0.09, 90);
    setTimeout(() => tone(90, 0.12, "square", 0.1, 55), 90);
  }

  /* ---------------- TAPE COUNTER (นับ 1 ครั้ง/วินาที ตอนเทปวิ่ง) ---------------- */
  let counterVal = 0;
  let counterTimer = null;
  function startCounter() {
    stopCounter();
    counterTimer = setInterval(() => {
      counterVal = (counterVal + 1) % 1000;
      counterEl.textContent = String(counterVal).padStart(3, "0");
    }, 1000);
  }
  function stopCounter() {
    clearInterval(counterTimer);
    counterTimer = null;
  }
  function resetCounter() {
    stopCounter();
    counterVal = 0;
    counterEl.textContent = "000";
  }

  /* ---------------- พิมพ์ลง terminal (จอเครื่องคือ terminal ตัวบน) ---------------- */
  function line(cls) {
    const div = document.createElement("div");
    div.className = cls;
    lines.appendChild(div);
    return div;
  }

  async function typeLine(cls, text, speed) {
    const div = line(cls);
    const span = document.createElement("span");
    div.appendChild(span);
    await Terminal.typeInto(span, text, speed);
    return div;
  }

  async function introLines() {
    lines.innerHTML = ""; // ไม่มีข้อความสอน — เทปที่วางอยู่บนชั้นคือคำใบ้เอง
  }

  async function nowPlayingLines() {
    lines.innerHTML = "";
    await typeLine("t-line ok", "▶ NOW PLAYING", 24);
    line("d-bar").innerHTML = '<span class="d-bar-fill"></span>';
    await typeLine("t-line dim", "loop ∞ — เพลงจะเล่นต่อตลอดทั้งเว็บนะ ♥", 18);
  }

  function nowPlayingInstant() { // ใช้ตอนกลับมาหน้าแรก (ไม่ต้องพิมพ์ใหม่)
    lines.innerHTML = "";
    line("t-line ok").textContent = "▶ NOW PLAYING";
    line("d-bar").innerHTML = '<span class="d-bar-fill"></span>';
    line("t-line dim").textContent = "loop ∞ — เพลงเล่นต่อตลอดทั้งเว็บนะ ♥";
  }

  async function ejectLines() {
    lines.innerHTML = "";
    await typeLine("t-line", "esther@love:~$ eject", CONFIG.typing.speed);
    await Terminal.sleep(150);
    await typeLine("t-line dim", "[TAPE OUT]", 18);
  }

  /* ---------------- เตรียมหน้าแรก (scenes.show(1) เรียกทุกครั้ง) ---------------- */
  function syncLanding() {
    busy = false;
    clearTimeout(autoTimer);
    cassette.classList.remove("commit", "dragging");
    tapeFloat.classList.remove("held");
    slot.classList.remove("near");

    if (inserted) {
      // เทปยังอยู่ใน bay (จากรอบก่อน) — ไม่ต้องยุ่งกับมัน
      cassette.classList.add("in-deck");
      nowPlayingInstant();
      skipBtn.textContent = "เข้าโชว์เลย ›";
      skipBtn.classList.remove("hidden");
    } else {
      // กันเหนียว: ถ้าเทปค้างอยู่ใน bay (เช่น reload กลางคัน) ดีดกลับที่วาง
      if (cassette.parentElement === bay) {
        cassette.classList.remove("in-deck");
        tapeFloat.appendChild(cassette);
        cassette.style.transform = "";
        cassette.style.transition = "";
      }
      skipBtn.textContent = "ข้ามเพลง เข้าโชว์เลย ›";
      skipBtn.classList.remove("hidden");
      introLines();
      tone(420, 0.1, "sine", 0.06, 620);
    }
    updateToggle();
  }

  /* ---------------- เพลง ---------------- */
  let pausedByUser = false; // ผู้ใช้กดหยุดเองหรือเปล่า (กัน tap-retry ทับการ pause ตั้งใจ)

  function setupAudio() {
    if (audio) return;
    try {
      audio = new Audio(SONG_SRC);
      audio.loop = true;
      audio.volume = typeof T.volume === "number" ? T.volume : 0.35;
      audio.preload = "auto";
      // เหตุการณ์เพลง → ขับทุกอย่าง: ฮับหมุน / เข็ม VU / counter (ของจริงเท่านั้น)
      audio.addEventListener("play", () => {
        reelL.classList.add("spin");
        reelR.classList.add("spin");
        startCounter();
        updateToggle();
      });
      audio.addEventListener("pause", () => {
        reelL.classList.remove("spin");
        reelR.classList.remove("spin");
        stopCounter();
        updateToggle();
      });
      audio.addEventListener("error", () => {
        console.warn("[tape] โหลดเพลงไม่ได้:", SONG_SRC);
      });
      audio.load();
    } catch (e) {}
  }

  function tryPlay() {
    if (!audio || !audio.paused) return;
    const p = audio.play();
    if (p && p.catch) p.catch(() => {});
  }

  function startAudio() {
    setupAudio();
    tryPlay();
  }

  /* iOS บางเครื่องบล็อก autoplay เงียบ ๆ (หรือปุ่มปิดเสียงทำให้งัด)
     — ถ้าเพลงยังไม่ขึ้นหลังใส่เทป ให้ "แตะครั้งถัดไปที่ไหนก็ได้" เริ่มเพลงให้เอง
     (เป็น gesture ตรง ๆ iOS จึงอนุญาต / ไม่ทับตอนผู้ใช้กด PAUSE หรือดีดเทปเอง) */
  document.addEventListener("pointerdown", () => {
    if (inserted && audio && audio.paused && !pausedByUser) tryPlay();
  }, true);

  function updateToggle() {
    toggleBtn.classList.toggle("hidden", !audio);
    const playing = !!(audio && !audio.paused);
    toggleBtn.dataset.state = playing ? "playing" : "paused";
    toggleBtn.setAttribute("aria-label", playing ? "หยุดเพลง" : "เล่นเพลง");
    // ไฟเครื่อง: เข็ม VU จะเริ่มเอี้ยวเมื่อเพลงเล่นอยู่
    deck.classList.toggle("playing", playing);
  }

  function toggleMusic() {
    if (!audio) return;
    if (audio.paused) {
      pausedByUser = false;
      tryPlay(); // จุด fallback มือ: ปุ่ม ▶ เพลง / ปุ่มเดินเทปเป็น gesture ตรง ๆ iOS เปิดได้
    } else {
      pausedByUser = true;
      audio.pause();
    }
    updateToggle();
  }

  /* ---------------- ลากเทป (เมาส์ + นิ้ว, ตามเมาส์ 2 แกน) ---------------- */
  function dragStart(e) {
    if (inserted || busy || spinning || dragging) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    setupAudio(); // เตรียมเพลงไว้ก่อนตั้งแต่จับเทป (โหลดล่วงหน้า ยังไม่มีเสียง)
    dragging = true;
    sx = e.clientX;
    sy = e.clientY;
    tx = 0;
    ty = 0;
    cassette.classList.add("dragging");
    tapeFloat.classList.add("held");
    try { cassette.setPointerCapture(e.pointerId); } catch (err) {}
  }

  function dragMove(e) {
    if (!dragging) return;
    tx = e.clientX - sx;
    ty = e.clientY - sy;
    cassette.style.transform = "translate(" + Math.round(tx) + "px, " + Math.round(ty) + "px)";
    slot.classList.toggle("near", isOverSlot());
  }

  function isOverSlot() {
    const c = cassette.getBoundingClientRect();
    const s = slot.getBoundingClientRect();
    const m = 34; // ขยายเป้าหมายให้วางง่ายขึ้นนิดหน่อย
    const cx = c.left + c.width / 2;
    const cy = c.top + c.height / 2;
    return cx > s.left - m && cx < s.right + m && cy > s.top - m && cy < s.bottom + m;
  }

  function dragEnd() {
    if (!dragging) return;
    dragging = false;
    cassette.classList.remove("dragging");
    slot.classList.remove("near");
    if (isOverSlot()) {
      commit();
    } else {
      cassette.style.transform = ""; // ไม่ได้วางบนช่อง → เด้งกลับที่เดิม
      tapeFloat.classList.remove("held");
    }
  }

  cassette.addEventListener("pointerdown", dragStart);
  cassette.addEventListener("pointermove", dragMove);
  cassette.addEventListener("pointerup", dragEnd);
  cassette.addEventListener("pointercancel", dragEnd);

  // คีย์บอร์ด: Enter/Space บนเทป = ใส่เทปเลย
  cassette.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!inserted && !busy) commit();
    }
  });

  /* ---------------- วางเทปลง bay → บินเข้าช่อง → ย้ายเข้า "ใน" เครื่อง ---------------- */
  function commit() {
    if (inserted || busy) return;
    inserted = true;
    busy = true;
    pausedByUser = false; // ใส่เทป = เจตนาจะเล่น ล้างสถานะ pause ของรอบก่อน

    // บินเข้าหา bay: จัดให้กึ่งกลางช่องพอดี + ย่อสเกลตามที่จะอยู่ใน bay
    const c = cassette.getBoundingClientRect();
    const b = bay.getBoundingClientRect();
    const s = inScale();
    const dx = (b.left + b.width / 2 - c.width / 2) - c.left;
    const dy = (b.top + b.height / 2 - c.height / 2) - c.top;
    cassette.classList.add("commit");
    cassette.style.transform =
      "translate(" + Math.round(tx + dx) + "px, " + Math.round(ty + dy) + "px) scale(" + s + ")";

    clunk();
    startAudio();     // เพลงเริ่มทันทีที่ปล่อยเทป (gesture ยัง active)
                      // จานหมุน/VU/counter จะเดิน "เมื่อเพลงเล่นจริง" ผ่านเหตุการณ์ play เท่านั้น

    skipBtn.classList.add("hidden");

    // เทปถึง bay แล้ว → ย้ายเข้าไป "อยู่ในเครื่อง" (อยู่หลังกระจกควันบุหงี่)
    setTimeout(() => {
      cassette.classList.remove("commit");
      bay.appendChild(cassette);
      cassette.classList.add("in-deck");
      cassette.style.transform = "";
      cassette.style.transition = "";
      tapeFloat.classList.remove("held");
      busy = false; // ล็อกพอ — หลังจากนี้ปุ่ม STOP⏏ ดีดออกได้เลย
      updateToggle();
    }, 600);

    setTimeout(async () => {
      if (!inserted) return; // เผื่อโดนดีดออกระหว่างรอ
      await nowPlayingLines();
      await Terminal.sleep(520);
      if (inserted) proceed();
    }, 700);
  }

  /* ---------------- STOP⏏ : ดีดเทปออกจากเครื่อง (บินกลับที่วางแบบ FLIP) ---------------- */
  function eject() {
    if (!inserted || busy || spinning) return;
    inserted = false;
    busy = true;

    tone(140, 0.14, "square", 0.09, 320); // เสียง "แชะ" ดีดออก
    if (audio && !audio.paused) audio.pause();
    pausedByUser = true; // ดีดออก = หยุดโดยตั้งใจ
    resetCounter();

    // FLIP: วัดตำแหน่งเดิม (ใน bay) → ย้ายกลับที่วาง → เลื่อนกลับอย่างนุ่มนวล
    const first = cassette.getBoundingClientRect();
    cassette.classList.remove("in-deck");
    tapeFloat.appendChild(cassette);
    const last = cassette.getBoundingClientRect();
    const dx = first.left + first.width / 2 - (last.left + last.width / 2);
    const dy = first.top + first.height / 2 - (last.top + last.height / 2);
    cassette.style.transition = "none";
    cassette.style.transform =
      "translate(" + Math.round(dx) + "px, " + Math.round(dy) + "px) scale(" + inScale() + ")";
    void cassette.offsetWidth; // force reflow
    cassette.style.transition = "transform 0.4s cubic-bezier(0.2, 0.7, 0.3, 1)";
    cassette.style.transform = "";
    setTimeout(() => {
      cassette.style.transition = "";
      busy = false;
    }, 420);

    updateToggle();
    skipBtn.textContent = "ข้ามเพลง เข้าโชว์เลย ›";
    skipBtn.classList.remove("hidden");
    ejectLines();
  }

  /* ---------------- เข้าโชว์: จอ boot สไตล์ terminal (พิมพ์ทีละบรรทัด + แถบโหลด)
     — แทนท่าหมุนหน้าแรกรอบเดิม กดแตะ/Enter ระหว่างพิมพ์ = ข้ามได้ */
  const bootScreen = $("boot-screen");
  const bootLines = $("boot-lines");

  async function typeBoot(text, speed) {
    const div = document.createElement("div");
    div.className = "b-line";
    bootLines.appendChild(div);
    await Terminal.typeInto(div, text, speed);
  }

  async function bootSequence() {
    Terminal.resetSkip();
    bootLines.innerHTML = "";
    bootScreen.classList.remove("hidden");
    void bootScreen.offsetWidth;
    bootScreen.classList.add("show");

    await typeBoot("esther@love:~$ ./birthday --for esther", 20);
    const barEl = document.createElement("div");
    barEl.className = "b-line b-dim";
    bootLines.appendChild(barEl);
    await Terminal.progressInto(barEl, "loading memories", 1150);
    await typeBoot("mounting tape · side A ........ OK", 11);
    await typeBoot("▶ NOW PLAYING — loop ∞ ♥", 16);
    await Terminal.sleep(520);
    Terminal.resetSkip(); // กัน skip ค้างไปตัดการพิมพ์อื่น
  }

  // แตะ/กด Enter ตอนจอ boot = พิมพ์จบทันทีแล้วเข้าโชว์เลย
  bootScreen.addEventListener("pointerdown", () => {
    if (spinning) Terminal.skipAll();
  });
  document.addEventListener("keydown", (e) => {
    if (spinning && (e.key === "Enter" || e.key === " ")) Terminal.skipAll();
  });

  function proceed() {
    if (spinning) return;
    spinning = true;
    clearTimeout(autoTimer);
    skipBtn.classList.add("hidden");
    bootSequence().then(async () => {
      bootScreen.classList.remove("show"); // จอ boot จางออก
      await Terminal.sleep(420);
      bootScreen.classList.add("hidden");
      spinning = false;
      if (onProceed) onProceed(); // runShow → สลับไปฉาก story/เค้ก
    });
  }

  /* ---------------- ปุ่มเดินเทปบนหน้าเครื่อง ---------------- */
  deck.querySelectorAll(".tp-key").forEach((btn) => {
    btn.addEventListener("click", () => {
      const k = btn.dataset.key;
      tone(620, 0.04, "square", 0.05); // เสียงกดปุ่มเงิน ๆ
      if (k === "play" && inserted && audio && audio.paused) {
        toggleMusic();               // ▶ เล่นต่อ
      } else if (k === "pause" && inserted && audio && !audio.paused) {
        toggleMusic();               // PAUSE หยุดชั่วคราว
      } else if (k === "stop" && inserted && !busy && !spinning) {
        eject();                     // STOP⏏ ดีดเทปออก
      }
      // REC / ◀◀ / ▶▶ = กดได้ เสียงได้ แต่ไม่ทำอะไร (ของแต่งตามเครื่องจริง)
    });
  });

  // ปุ่ม POWER = กดมีเสียง ของแต่ง
  if (powerBtn) powerBtn.addEventListener("click", () => tone(300, 0.07, "sine", 0.06, 180));

  /* ---------------- เชื่อมปุ่มอื่น ---------------- */
  skipBtn.addEventListener("click", () => {
    if (busy || spinning) return;
    proceed();
  });
  toggleBtn.addEventListener("click", toggleMusic);

  return {
    init(cb) { onProceed = cb; },
    syncLanding,
    toggleMusic,
  };
})();
