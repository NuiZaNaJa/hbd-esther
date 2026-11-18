/* ============================================================
   Cake — เครื่องเล่นชิ้น birthday-cake (80×36 cells @ 20fps)
   ชิ้นเค้กอยู่ที่ js/cake-piece.js ตัวนี้ทำหน้าที่:
   - ดึงเฟรม {text, color} จากชิ้น แล้วแปลงเป็น <span> สี HTML
   - คุมจังหวะ ~20fps ด้วย requestAnimationFrame
   - คำนวณขนาดฟอนต์ให้พอดีจอ (มือถือ/เดสก์ท็อป)
   - เคารพ prefers-reduced-motion (หยุดที่เฟรมเปิดไฟนิ่ง ๆ)
   ============================================================ */

const Cake = (() => {
  const COLS = 80;
  const ROWS = 36;
  const FPS = 20;
  const FRAME_MS = 1000 / FPS - 4; // กันเฟรมถี่เกิน

  const REDUCED =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let pre = null; // <pre> ปลายทาง
  let body = null; // กล่องครอบ (ใช้วัดพื้นที่ว่าง)
  let frameFn = null; // ฟังก์ชันสร้างเฟรมของชิ้น
  let rafId = 0;
  let t0 = 0;
  let last = 0;
  let running = false;

  /* กุญแจสี → โค้ด hex (สำรองไว้กัน undefined) */
  function hex(key) {
    return (window.BirthdayCake.meta.palette[key]) || "#9a8aa8";
  }

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  }

  /* เฟรมหนึ่ง → HTML แบบ run-length: ตัวอักษรสีเดียวกันรวบเป็น span เดียว */
  function renderFrame(frame) {
    const lines = frame.text.split("\n");
    const cols = (frame.color || "").split("\n");
    let html = "";

    for (let y = 0; y < lines.length; y++) {
      const t = lines[y];
      const c = cols[y] || "";
      let run = "";
      let key = null;
      let out = "";

      const flush = () => {
        if (!run) return;
        out += key === " "
          ? esc(run)
          : '<span style="color:' + hex(key) + '">' + esc(run) + "</span>";
        run = "";
      };

      for (let x = 0; x < t.length; x++) {
        const k = c[x] || " ";
        if (k !== key) {
          flush();
          key = k;
        }
        run += t[x];
      }
      flush();

      html += out + "\n";
    }

    pre.innerHTML = html;
  }

  /* หาขนาดฟอนต์: ยัดให้เต็มพื้นที่ที่มี (กว้าง 80 ตัวอักษร × สูง 36 แถว) */
  function fit() {
    if (!pre || !body) return;
    const availW = body.clientWidth - 20;
    const availH = Math.max(120, body.clientHeight - 20);
    const fs = Math.max(
      5,
      Math.min(24, availW / (COLS * 0.61), availH / ROWS)
    );
    pre.style.fontSize = fs.toFixed(2) + "px";
  }

  function draw(t) {
    renderFrame(frameFn(t));
  }

  function loop(now) {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    if (now - last < FRAME_MS) return; // หน่วง ~20fps
    last = now;
    draw((now - t0) / 1000);
  }

  function start(el) {
    pre = el;
    body = el.parentElement;
    if (!frameFn) frameFn = window.BirthdayCake.create();
    fit();
    running = true;
    t0 = performance.now();
    last = 0;
    window.addEventListener("resize", fit);

    if (REDUCED) {
      // ไม่ปั่นเฟรม — ค้างภาพเค้กไฟสว่างไว้เฉย ๆ
      draw(0.5);
      return;
    }
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
    window.removeEventListener("resize", fit);
  }

  return { start, stop };
})();
