/* ============================================================
   ls /memories — ห้องภาพ instax (กล้องจำลอง Mini Evo)
   - กล้อง CSS จำลอง: จานเลนส์ 1-4 × จานฟิล์ม 1-4 (กดหมายเลขเลือก)
   - กด PRINT → รูปจริงจากโฟลเดอร์ img/ ไหลออกมาทีละใบ
     พร้อมเสียงจิ๊ก กกก + "ล้างผลึก" ภาพค่อย ๆ ชัด
   - ฟิล์มมีผลจริงกับรูป: CLASSIC ปกติ · NOIR ขาวดำ ·
     NOSTALGIA ซีเปีย · CYBER สีจัดจี๊ด (CSS filter)
   - เลนส์: NORMAL · CLOSE-UP ซูม · DOUBLE ภาพซ้อน · MIRROR กลับด้าน
   - ปริ้นเสร็จรูป "เด้งไปแขวน" บนราวเชือกด้วยกลิปไม้ จนครบทุกใบ
   - ยังไม่ใส่รูปก็เล่นได้ (ขึ้น "ยังไม่มีรูป" ให้ก่อน)
   - รีเฟรชหน้า = เริ่มเล่นใหม่ (ราวแขวนว่าง) เล่นได้หลายรอบ
   ============================================================ */

const InstaxPrinter = (() => {
  const $ = (id) => document.getElementById(id);

  const win = $("instax-window");
  const btnOpen = $("btn-instax");
  const btnClose = $("instax-close");
  const lensDial = $("ix-lens-dial");
  const filmDial = $("ix-film-dial");
  const lcdStatus = $("ix-lcd-status");
  const btnPrint = $("ix-print");
  const placeholder = $("ix-placeholder");
  const polaroid = $("ix-polaroid");
  const wall = $("ix-wall");
  const wallRow = $("ix-wall-row");
  const status = $("ix-status");
  const lightbox = $("ix-lightbox");
  const lightboxCard = $("ix-lightbox-card");

  const DATA = (typeof CONFIG !== "undefined" && CONFIG.instax) || {};
  const PHOTOS = DATA.photos || [];
  const SLIDE_MS = 2800; // เวลาที่รูปไหลออกจากช่อง (มิลลิวินาที)

  /* ---------------- เลนส์ × ฟิล์ม ---------------- */
  const LENSES = [
    { id: "normal", label: "NORMAL" },
    { id: "close", label: "CLOSE-UP" },
    { id: "double", label: "DOUBLE" },
    { id: "mirror", label: "MIRROR" },
  ];

  const FILMS = [
    { id: "classic", label: "CLASSIC" },
    { id: "noir", label: "NOIR" },
    { id: "nostalgia", label: "NOSTALGIA" },
    { id: "cyber", label: "CYBER" },
  ];

  /* ---------------- สถานะ ---------------- */
  let open = false;
  let printing = false;
  let timers = [];
  let typeTimer = 0;
  let lensIdx = 0;
  let filmIdx = 0;
  let hung = {};       // { ดัชนีรูป: { lens, film } } — รีเฟรชแล้วรีเซ็ต
  let lastPrinted = -1;
  let flyAnim = null;  // อนิเมชัน "เด้งไปแขวน"
  let flyEl = null;
  let flyTarget = null;

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
    if (typeTimer) { clearInterval(typeTimer); typeTimer = 0; }
    stopTicks();
    cancelFlight();
  }

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
    } catch (e) { /* เงียบ ๆ ก็ยังปริ้นได้ */ }
  }

  let tickTimer = 0;
  function startTicks() {
    stopTicks();
    tickTimer = setInterval(() => {
      tone(105 + Math.random() * 18, 0.05, "square", 0.05);
    }, 110);
  }
  function stopTicks() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = 0; }
  }

  /* ---------------- ตัวช่วย ---------------- */
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escAttr(s) {
    return esc(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function pad2(n) {
    return (n + 1 < 10 ? "0" : "") + (n + 1);
  }

  function hungCount() {
    return Object.keys(hung).length;
  }

  function isComplete() {
    return PHOTOS.length > 0 && hungCount() >= PHOTOS.length;
  }

  /* ---------------- จานเลือกเลนส์/ฟิล์ม ---------------- */
  function buildDials() {
    lensDial.innerHTML = '<span class="ix-lcd-tag">LENS</span>' +
      LENSES.map((l, i) =>
        '<button class="ix-chip" data-kind="lens" data-idx="' + i + '" title="' +
        esc(l.label) + '" type="button">' + (i + 1) + "</button>"
      ).join("");
    filmDial.innerHTML = '<span class="ix-lcd-tag">FILM</span>' +
      FILMS.map((f, i) =>
        '<button class="ix-chip" data-kind="film" data-idx="' + i + '" title="' +
        esc(f.label) + '" type="button">' + (i + 1) + "</button>"
      ).join("");
  }

  function updateDials() {
    lensDial.querySelectorAll(".ix-chip").forEach((c, i) => c.classList.toggle("on", i === lensIdx));
    filmDial.querySelectorAll(".ix-chip").forEach((c, i) => c.classList.toggle("on", i === filmIdx));
  }

  /* ---------------- จอ LCD บนกล้อง ---------------- */
  function updateLcd() {
    let main, small;
    if (printing) {
      main = "PRINTING...";
      small = "จิ๊ก กกก — โปรดรอสักครู่";
    } else if (isComplete()) {
      main = "COMPLETE ♥";
      small = "อัลบั้มบนราวแขวนครบแล้ว";
    } else if (!PHOTOS.length) {
      main = "NO FILM";
      small = "ใส่รูปในโฟลเดอร์ img/ ก่อนนะ";
    } else {
      const next = PHOTOS.findIndex((_, i) => !hung[i]);
      main = "READY · P." + pad2(next);
      small = "HUNG " + hungCount() + "/" + PHOTOS.length + " · กด MENU OK เพื่อปริ้น";
    }
    lcdStatus.innerHTML = "<span>" + esc(main) + "</span><small>" + esc(small) + "</small>";
  }

  /* ---------------- HTML ของรูปในกรอบ ---------------- */
  function imgsHTML(photo, lensId) {
    const onErr = ' onerror="this.closest(\'.ix-photo\').classList.add(\'no-img\')"';
    let html = '<img class="ix-img" src="' + escAttr(photo.src) + '" alt="' +
      escAttr(photo.title) + '"' + onErr + ' draggable="false">';
    // เลนส์ DOUBLE = ภาพซ้อนแบบ double exposure
    if (lensId === "double") {
      html += '<img class="ix-img ghost" src="' + escAttr(photo.src) +
        '" alt="" aria-hidden="true"' + onErr + ' draggable="false">';
    }
    return html;
  }

  function stackClass(lensI, filmI) {
    const l = LENSES[lensI];
    return "ix-stack film-" + FILMS[filmI].id +
      (l.id === "close" ? " lens-close" : "") +
      (l.id === "mirror" ? " lens-mirror" : "");
  }

  /* การ์ดโพลารอยด์ (ขนาดใหญ่: ตอนปริ้น/ซูม) */
  function cardHTML(photoIdx, lensI, filmI) {
    const p = PHOTOS[photoIdx];
    const l = LENSES[lensI];
    const f = FILMS[filmI];
    return (
      '<div class="ix-photo"><div class="' + stackClass(lensI, filmI) + '">' +
      imgsHTML(p, l.id) + "</div></div>" +
      '<div class="ix-caption"></div>' +
      '<div class="ix-no">P.' + pad2(photoIdx) + " · " + esc(l.label) + "/" + esc(f.label) + "</div>"
    );
  }

  /* การ์ดที่แขวนบนราว (เล็ก + กลิปไม้ + เอียงนิด ๆ) */
  function hungCardHTML(idx) {
    const c = hung[idx];
    const p = PHOTOS[idx];
    const l = LENSES[c.lens];
    const f = FILMS[c.film];
    // เอียงสุ่มแบบคงที่ (ไม่กระตุกตอนวาดใหม่)
    const rot = ((idx * 37) % 9) - 4; // -4..4 องศา
    return (
      '<button class="ix-hung" data-idx="' + idx + '" type="button"' +
      ' style="--rot:' + rot + 'deg;transform:rotate(var(--rot))" aria-label="ดู P.' + pad2(idx) + '">' +
      '<span class="ix-clip" aria-hidden="true"></span>' +
      '<span class="ix-hung-photo"><span class="' + stackClass(c.lens, c.film) + '">' +
      imgsHTML(p, l.id) + "</span></span>" +
      '<span class="ix-hung-cap">' + esc(p.caption) + "</span>" +
      "</button>"
    );
  }

  /* ---------------- ราวแขวน ---------------- */
  function renderWall(popIdx) {
    let html = "";
    PHOTOS.forEach((_, i) => {
      if (hung[i]) html += hungCardHTML(i);
      else {
        html +=
          '<div class="ix-hung pending" aria-hidden="true">' +
          '<span class="ix-clip"></span>' +
          '<span class="ix-hung-label">?</span>' +
          "</div>";
      }
    });
    wallRow.innerHTML = html;
    wall.classList.toggle("complete", isComplete());
    if (popIdx !== undefined) {
      const el = wallRow.querySelector('[data-idx="' + popIdx + '"]');
      if (el) el.classList.add("pop");
    }
  }

  function updateStatus() {
    const n = hungCount();
    const total = PHOTOS.length;
    if (isComplete()) {
      status.innerHTML =
        "แขวนครบ <b>" + n + "/" + total + "</b> — อัลบั้มของเราเสร็จแล้ว " +
        '<button id="ix-reset" class="ix-reset" type="button">↺ ล้างราวแขวน</button>';
      status.classList.add("done");
    } else {
      status.innerHTML = "แขวนแล้ว <b>" + n + "/" + total + "</b>";
      status.classList.remove("done");
    }
  }

  /* ---------------- อนิเมชัน "เด้งไปแขวน" ---------------- */
  function completeChime() {
    timers.push(setTimeout(() => tone(523, 0.14, "square", 0.09), 120));
    timers.push(setTimeout(() => tone(659, 0.14, "square", 0.09), 260));
    timers.push(setTimeout(() => tone(784, 0.3, "square", 0.1), 400));
  }

  function cancelFlight() {
    if (flyAnim) { try { flyAnim.cancel(); } catch (e) {} flyAnim = null; }
    if (flyEl && flyEl.remove) flyEl.remove();
    flyEl = null;
    if (flyTarget) flyTarget.style.visibility = "";
    flyTarget = null;
  }

  function flightDone(idx) {
    flyAnim = null;
    if (flyEl && flyEl.remove) flyEl.remove();
    flyEl = null;
    if (flyTarget) {
      flyTarget.style.visibility = "";
      flyTarget.classList.add("sway");
      flyTarget = null;
    }
    btnPrint.classList.toggle("off", isComplete());
    // เสียง "ติดกลิป" + ฉลองตอนครบ
    tone(880, 0.07, "triangle", 0.08);
    if (isComplete()) completeChime();
  }

  function flyToWall(idx) {
    const target = wallRow.querySelector('[data-idx="' + idx + '"]');
    const reduced = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // วัดตำแหน่งรูปที่พิมพ์เสร็จ ก่อนซ่อนมัน
    const from = polaroid.getBoundingClientRect();

    // รูปบินออกไปแล้ว — คืนช่องว่างใต้กล้อง
    showPlaceholder();

    if (!target || !target.animate || reduced) {
      // เบราว์เซอร์เก่า / โหมดลดการเคลื่อนไหว → แขวนเลย
      if (target) target.classList.add("pop");
      tone(880, 0.07, "triangle", 0.08);
      btnPrint.classList.toggle("off", isComplete());
      if (isComplete()) completeChime();
      return;
    }

    // เลื่อนราวให้เห็นช่องปลายทางก่อน (จอเล็ก)
    if (target.scrollIntoView) {
      try { target.scrollIntoView({ block: "nearest", inline: "center" }); } catch (e) {}
    }

    const to = target.getBoundingClientRect();

    // ตัวการ์ดที่บิน (โคลนหน้าตาเหมือนการ์ดบนราว)
    flyEl = document.createElement("div");
    flyEl.className = "ix-fly";
    flyEl.innerHTML = target.outerHTML;
    flyEl.style.left = to.left + "px";
    flyEl.style.top = to.top + "px";
    flyEl.style.width = to.width + "px";
    document.body.appendChild(flyEl);

    // ซ่อนการ์ดจริงไว้ระหว่างบิน
    flyTarget = target;
    target.style.visibility = "hidden";

    const dx = (from.left + from.width / 2) - (to.left + to.width / 2);
    const dy = (from.top + from.height / 2) - (to.top + to.height / 2);
    const s = Math.max(1, from.width / to.width);

    flyAnim = flyEl.animate(
      [
        { transform: "translate(" + dx + "px," + dy + "px) scale(" + s + ")", opacity: 1 },
        { transform: "translate(" + dx * 0.12 + "px," + (dy * 0.94 - 14) + "px) scale(" + s * 0.94 + ")", opacity: 1, offset: 0.62 },
        { transform: "translate(0px," + (dy * 0.02 + 6) + "px) scale(1.04)", opacity: 1, offset: 0.8 },
        { transform: "translate(0px,0px) scale(1)", opacity: 1 },
      ],
      { duration: 820, easing: "cubic-bezier(.3,.75,.4,1)" }
    );
    flyAnim.onfinish = () => flightDone(idx);
    // กันเบราว์เซอร์ที่ไม่ยิง onfinish
    timers.push(setTimeout(() => { if (flyAnim) flightDone(idx); }, 950));
  }

  /* ---------------- ปริ้นรูปใหม่ ---------------- */
  function nextPhotoIdx() {
    return PHOTOS.findIndex((_, i) => !hung[i]);
  }

  function doPrint() {
    const idx = nextPhotoIdx();
    if (idx < 0) return;
    const lensI = lensIdx;
    const filmI = filmIdx;
    printing = true;

    btnPrint.classList.add("busy");
    updateLcd();

    // เตรียมการ์ดใหม่
    polaroid.innerHTML = cardHTML(idx, lensI, filmI);
    const capEl = polaroid.querySelector(".ix-caption");
    placeholder.classList.add("hidden");
    polaroid.classList.remove("hidden", "printing", "developing");

    // เริ่มไหลออกจากช่อง (reflow ก่อน ไม่งั้น transition ไม่เล่น)
    startTicks();
    void polaroid.offsetWidth;
    polaroid.classList.add("printing");
    timers.push(setTimeout(() => {
      stopTicks();
      btnPrint.classList.remove("busy");
      polaroid.classList.add("developing"); // ล้างผลึก
      tone(520, 0.12, "sine", 0.09, 660);
      timers.push(setTimeout(() => tone(660, 0.18, "sine", 0.09, 880), 130));
    }, SLIDE_MS));

    // แคปชันพิมพ์ทีละตัว
    const capText = PHOTOS[idx].caption;
    timers.push(setTimeout(() => {
      let i = 0;
      typeTimer = setInterval(() => {
        i++;
        capEl.textContent = capText.slice(0, i);
        if (i >= capText.length) { clearInterval(typeTimer); typeTimer = 0; }
      }, 34);
    }, SLIDE_MS + 500));

    // จบคิว: เด้งไปแขวนบนราว
    timers.push(setTimeout(() => {
      printing = false;
      lastPrinted = idx;
      hung[idx] = { lens: lensI, film: filmI };
      renderWall();
      updateLcd();
      updateStatus();
      flyToWall(idx);
    }, SLIDE_MS + 500 + capText.length * 34 + 400));
  }

  function resetWall() {
    if (printing) return;
    cancelFlight();
    hung = {};
    lastPrinted = -1;
    renderWall();
    updateStatus();
    updateLcd();
    btnPrint.classList.remove("off");
    showPlaceholder();
    tone(300, 0.12, "triangle", 0.07, 180);
  }

  function showPlaceholder() {
    polaroid.classList.add("hidden");
    placeholder.classList.remove("hidden");
  }

  /* ---------------- ซูมดูรูป (lightbox) ---------------- */
  function openLightbox(idx) {
    const c = hung[idx];
    if (!c) return;
    lightboxCard.innerHTML = cardHTML(idx, c.lens, c.film);
    // รูปใน lightbox เห็นทันที (ล้างผลึกเสร็จแล้ว)
    const cap = lightboxCard.querySelector(".ix-caption");
    cap.textContent = PHOTOS[idx].caption;
    lightbox.classList.remove("hidden");
    tone(600, 0.06, "sine", 0.05);
  }

  function closeLightbox() {
    lightbox.classList.add("hidden");
  }

  /* ---------------- เปิด/ปิดหน้าต่าง ---------------- */
  function openWin() {
    if (open) return;
    open = true;
    win.classList.remove("hidden");
    void win.offsetWidth;
    win.classList.add("in");
    updateDials();
    updateLcd();
    updateStatus();
    renderWall();
    if (!hungCount()) showPlaceholder();
    btnPrint.classList.toggle("off", isComplete());
    tone(420, 0.1, "sine", 0.06, 640);
  }

  function closeWin() {
    if (!open) return;
    open = false;
    printing = false;
    clearTimers();
    btnPrint.classList.remove("busy");
    closeLightbox();
    win.classList.remove("in");
    win.classList.add("hidden");
  }

  /* ---------------- เชื่อมปุ่ม ---------------- */
  lensDial.addEventListener("click", (e) => {
    const chip = e.target.closest(".ix-chip");
    if (!chip || chip.dataset.kind !== "lens") return;
    lensIdx = parseInt(chip.dataset.idx, 10) || 0;
    updateDials();
    updateLcd();
    tone(380, 0.05, "square", 0.05);
  });

  filmDial.addEventListener("click", (e) => {
    const chip = e.target.closest(".ix-chip");
    if (!chip || chip.dataset.kind !== "film") return;
    filmIdx = parseInt(chip.dataset.idx, 10) || 0;
    updateDials();
    updateLcd();
    tone(460, 0.05, "square", 0.05);
  });

  btnPrint.addEventListener("click", () => {
    if (printing || isComplete()) return;
    doPrint();
  });

  wallRow.addEventListener("click", (e) => {
    const t = e.target.closest(".ix-hung");
    if (t) openLightbox(parseInt(t.getAttribute("data-idx"), 10));
  });

  status.addEventListener("click", (e) => {
    if (e.target.closest("#ix-reset")) resetWall();
  });

  lightbox.addEventListener("click", closeLightbox);

  if (btnOpen) btnOpen.addEventListener("click", openWin);
  if (btnClose) btnClose.addEventListener("click", closeWin);
  document.addEventListener("keydown", (e) => {
    if (!open) return;
    if (e.key === "Escape") closeWin();
  });

  buildDials();

  return { open: openWin, close: closeWin };
})();
