/* ============================================================
   Terminal — ชุดเครื่องมือพิมพ์ทีละตัวอักษร (typewriter)
   - รองรับภาษาไทยด้วย Intl.Segmenter (ตัดตามกลุ่มอักษร
   ไม่ให้สระ/วรรณยุกต์ลอยแยกจากพยัญชนะระหว่างพิมพ์)
   - skipAll() จะทำให้ทุกการพิมพ์และทุก delay จบทันที
   ============================================================ */

const Terminal = (() => {
  let skipping = false;

  function resetSkip() { skipping = false; }
  function skipAll() { skipping = true; }
  function isSkipping() { return skipping; }

  function sleep(ms) {
    return new Promise((resolve) => {
      if (skipping) resolve();
      else setTimeout(resolve, ms);
    });
  }

  /* ตัดข้อความเป็นหน่วยอักษรที่ถูกต้อง (ไทย/อิโมจิไม่แตกกลาง) */
  function graphemes(text) {
    try {
      const seg = new Intl.Segmenter("th", { granularity: "grapheme" });
      return Array.from(seg.segment(text), (s) => s.segment);
    } catch (e) {
      return Array.from(text);
    }
  }

  /* พิมพ์ข้อความลง element ทีละหน่วยอักษร */
  async function typeInto(el, text, speed) {
    el.classList.add("typing");
    const chars = graphemes(text);
    for (const ch of chars) {
      if (skipping) break;
      el.textContent += ch;
      await sleep(speed);
    }
    el.textContent = text; // เคลียร์ให้ครบทุกกรณี
    el.classList.remove("typing");
  }

  /* แถบ progress แบบ terminal: label....... [██████░░░░]  60% */
  function bar(label, width, pct) {
    const filled = Math.round((width * pct) / 100);
    return (
      label.padEnd(20, ".") +
      " [" +
      "█".repeat(filled) +
      "░".repeat(width - filled) +
      "] " +
      String(pct).padStart(3) +
      "%"
    );
  }

  async function progressInto(el, label, ms) {
    const width = window.innerWidth < 480 ? 10 : 16;
    if (skipping) {
      el.textContent = bar(label, width, 100);
      return;
    }
    for (let p = 0; p <= 100; p += 10) {
      el.textContent = bar(label, width, p);
      await sleep(ms / 10);
    }
    el.textContent = bar(label, width, 100);
  }

  return { resetSkip, skipAll, isSkipping, sleep, typeInto, progressInto };
})();
