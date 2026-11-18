/* ============================================================
   big-text.js — ชิ้น "big text" ตัวอักษรบล็อกใหญ่แบบแบนเนอร์
   Vendored from https://ascii.rest/big-text/ (MIT License)
   - ฟอนต์บล็อกทำมือ 5 แถว + เงาเส้นดับเบิลรอบตัวอักษร
   - มีลำแสง glint กวาดผ่านทุก ~3.2 วินาที

   ปรับจากต้นฉบับ:
   - แปลง TS → JS classic script (ใช้กับ file:// ได้)
   - ความกว้างคำนวณจากความยาวข้อความจริง (ต้นฉบับล็อก 66 ช่อง
     ข้อความยาวจะถูกตัด — ของเรายืนพื้นได้)
   - เพิ่มตัวเล่น BigBanner ของเราเองด้านล่าง (แต่งสี neon)
   ============================================================ */

(function () {
  const meta = {
    name: "big text",
    note: "a block-letter banner with a line shadow and a passing glint",
    cols: 66,
    rows: 8,
    fps: 24,
    options: { text: "hello" },
  };

  /* Five rows each, # is ink. Widths vary, so I is one pixel and M is five. */
  const FONT = {
    A: ".##.|#..#|####|#..#|#..#", B: "###.|#..#|###.|#..#|###.", C: ".###|#...|#...|#...|.###",
    D: "###.|#..#|#..#|#..#|###.", E: "####|#...|###.|#...|####", F: "####|#...|###.|#...|#...",
    G: ".###|#...|#.##|#..#|.###", H: "#..#|#..#|####|#..#|#..#", I: "#|#|#|#|#",
    J: "...#|...#|...#|#..#|.##.", K: "#..#|#.#.|##..|#.#.|#..#", L: "#...|#...|#...|#...|####",
    M: "#...#|##.##|#.#.#|#...#|#...#", N: "#...#|##..#|#.#.#|#..##|#...#", O: ".##.|#..#|#..#|#..#|.##.",
    P: "###.|#..#|###.|#...|#...", Q: ".##.|#..#|#..#|#.#.|.#.#", R: "###.|#..#|###.|#.#.|#..#",
    S: ".###|#...|.##.|...#|###.", T: "#####|..#..|..#..|..#..|..#..", U: "#..#|#..#|#..#|#..#|.##.",
    V: "#...#|#...#|#...#|.#.#.|..#..", W: "#...#|#...#|#.#.#|##.##|#...#", X: "#...#|.#.#.|..#..|.#.#.|#...#",
    Y: "#...#|.#.#.|..#..|..#..|..#..", Z: "####|...#|..#.|.#..|####",
    0: "###|#.#|#.#|#.#|###", 1: ".#.|##.|.#.|.#.|###", 2: "###|..#|###|#..|###", 3: "###|..#|.##|..#|###",
    4: "#.#|#.#|###|..#|..#", 5: "###|#..|###|..#|###", 6: "###|#..|###|#.#|###", 7: "###|..#|..#|..#|..#",
    8: "###|#.#|###|#.#|###", 9: "###|#.#|###|..#|###",
    ".": ".|.|.|.|#", ",": ".|.|.|#|#", "!": "#|#|#|.|#", "?": "###|..#|.##|...|.#.", "'": "#|#|.|.|.",
    ":": ".|#|.|#|.", "-": "...|...|###|...|...", "+": "...|.#.|###|.#.|...", "=": "...|###|...|###|...",
    "/": "..#|..#|.#.|#..|#..", _: "...|...|...|...|###", " ": "..",
  };

  /* Shadow cells by which neighbours they join: up 1, down 2, left 4, right 8. */
  const JOIN = " ║║║═╝╗╣═╚╔╠═╩╦╬";
  const U = 1, D = 2, L = 4, R = 8;

  function create(opts) {
    const text = (opts && opts.text) || meta.options.text;
    const glyphs = [...String(text).toUpperCase()].map((ch) => FONT[ch]).filter(Boolean).map((g) => g.split("|"));
    // Each pixel is two columns by one row, so it is square; one column narrower if it would not fit.
    const span = (s) => glyphs.reduce((w, g) => w + g[0].length * s + 2, -1);
    const s = (opts && opts.s) ? opts.s : (span(2) <= meta.cols - 2 ? 2 : 1);
    const cols = Math.max(meta.cols, span(s) + 2);
    const rows = meta.rows;
    const x0 = Math.max(0, Math.floor((cols - span(s)) / 2));
    const y0 = Math.floor((rows - 6) / 2);

    const ink = new Uint8Array(cols * rows);
    let x = x0;
    for (const g of glyphs) {
      g.forEach((line, y) => {
        for (let i = 0; i < line.length; i++)
          if (line[i] === "#") for (let k = 0; k < s; k++) if (x + i * s + k < cols) ink[(y0 + y) * cols + x + i * s + k] = 1;
      });
      x += g[0].length * s + 2;
    }
    const at = (c, r) => (c >= 0 && c < cols && r >= 0 && r < rows ? ink[r * cols + c] : 0);

    // The shadow is the letters' outline moved half a cell right and down, so
    // each empty cell draws the outline edges that meet at its top left corner.
    const grid = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (at(c, r)) {
          grid.push(null);
          continue;
        }
        const a = at(c - 1, r - 1), b = at(c, r - 1), d = at(c - 1, r);
        const edges = (a !== b ? U : 0) | (d ? D : 0) | (a !== d ? L : 0) | (b ? R : 0);
        // Where two letters touch only at that corner, the shadow turns down and right.
        grid.push(JOIN[edges === 15 ? D | R : edges]);
      }
    }

    const SWEEP = 2.4, PERIOD = 3.2;
    const left = x0 - 2, right = x0 + span(s) + 9;
    return (t) => {
      // The glint crosses at an even pace, then rests out of sight. Frame 0 is at rest.
      const u = (((t - 0.5) % PERIOD) + PERIOD) % PERIOD / SWEEP;
      const p = u < 1 ? left + (right - left) * u : -99;
      const lines = [];
      for (let r = 0; r < rows; r++) {
        let line = "";
        for (let c = 0; c < cols; c++) {
          const g = grid[r * cols + c];
          if (g !== null) {
            line += g;
            continue;
          }
          const d = Math.abs(c + 1.2 * r - p);
          // ธีมเราเป็นพื้นเข้ม — หมึก ▓ ลำแสงเป็น █ ตามต้นฉบับ
          line += d < 2.4 ? "█" : "▓";
        }
        lines.push(line);
      }
      return lines.join("\n");
    };
  }

  /* ============================================================
     ส่วนของโปรเจกต์: BigBanner — ตัวเล่นแบนเนอร์แต่งสี neon
     - รับหลายบรรทัดข้อความ วางซ้อนกัน (คั่นบรรทัดว่าง)
     - แยกสีตามชนิดเซลล์: █ ลำแสง (ขาววาบ) / ▓ หมึก (ชมพู neon)
       / ║╔═ เงา (น้ำเงินหม่น)
     - จัดขนาดฟอนต์ให้พอดีจอ + เคารพ prefers-reduced-motion
     ============================================================ */
  const BigBanner = (() => {
    const FPS = 24;
    const REDUCED =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let pre = null;
    let frames = null;
    let rafId = 0;
    let t0 = 0;
    let last = 0;
    let running = false;
    let cols = 0;
    let rows = 0;
    let hRatio = 0.26; // สัดส่วนความสูงจอที่ให้แบนเนอร์ใช้
    let maxFont = 12;  // เพดานขนาดฟอนต์ (px)

    function esc(s) {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    }

    /* จำแนกเซลล์ → คลาสสี */
    function cellClass(ch) {
      if (ch === "█") return "hot";
      if (ch === " " || ch === "▓") return "base";
      return "dim"; // ║ ╔ ╗ ╚ ╝ ═ ╣ ╠ ╩ ╦ ╬
    }

    function render(t) {
      const grids = frames.map((fn) => fn(t).split("\n"));
      // ตัดแถวว่างริมบน/ล่างของแต่ละแบนเนอร์ออก (กริชักเต็มจอไม่จำเป็น)
      const arts = grids.map((g) => g.filter((l) => l.trim().length > 0));
      if (!cols) {
        cols = Math.max(...arts.map((a) => Math.max(...a.map((l) => l.length))));
        rows = arts.reduce((n, a) => n + a.length, 0) + (arts.length - 1);
      }

      // รวมทุกแบนเนอร์เป็นบรรทัดเดียว (pad ขวาให้กว้างเท่ากัน, คั่น 1 บรรทัดว่าง)
      const combined = [];
      arts.forEach((a, ai) => {
        if (ai) combined.push("");
        for (const line of a) combined.push(line + " ".repeat(cols - line.length));
      });

      // รวบเซลล์สีเดียวกันเป็น span เดียว
      let html = "";
      for (const line of combined) {
        let run = "";
        let cls = null;
        let out = "";
        const flush = () => {
          if (!run) return;
          out += cls === "base"
            ? esc(run)
            : '<span class="' + (cls === "hot" ? "cell-hot" : "cell-dim") + '">' + esc(run) + "</span>";
          run = "";
        };
        for (const ch of line) {
          const c = cellClass(ch);
          if (c !== cls) {
            flush();
            cls = c;
          }
          run += ch;
        }
        flush();
        html += out + "\n";
      }
      pre.innerHTML = html;
    }

    /* ขนาดฟอนต์ให้พอดีคอนเทนเนอร์ที่อยู่ */
    function fit() {
      if (!pre || !cols) return;
      const parent = pre.parentElement;
      let availW = (parent && parent.clientWidth ? parent.clientWidth : Math.min(window.innerWidth * 0.94, 700)) - 8;
      if (parent) {
        const cs = getComputedStyle(parent);
        availW -= (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      }
      availW = Math.max(120, availW);
      const availH = Math.max(110, window.innerHeight * hRatio);
      const fs = Math.max(5, Math.min(maxFont, availW / (cols * 0.61), availH / rows));
      pre.style.fontSize = fs.toFixed(2) + "px";
    }

    function loop(now) {
      if (!running) return;
      rafId = requestAnimationFrame(loop);
      if (now - last < 1000 / FPS - 4) return;
      last = now;
      render((now - t0) / 1000);
    }

    function start(el, texts, opts) {
      const o = opts || {};
      hRatio = typeof o.hRatio === "number" ? o.hRatio : 0.26;
      maxFont = typeof o.maxFont === "number" ? o.maxFont : 12;

      // เรียกซ้ำได้ปลอดภัย — หยุดลูป/ฟัง resize เก่าก่อน
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", fit);

      // สร้าง <pre class="banner-art"> ข้างในคอนเทนเนอร์
      el.innerHTML = "";
      const p = document.createElement("pre");
      p.className = "banner-art";
      el.appendChild(p);
      pre = p;
      // s=2 เสมอ — ต้นฉบับออกแบบให้พิกเซล = 2 ช่อง (เงาจึงรอบตัวอักษรพอดี)
      frames = (texts || ["HAPPY BIRTHDAY"]).map((tx) =>
        window.AsciiBigText.create({ text: tx, s: 2 })
      );
      cols = 0;
      rows = 0;
      running = true;
      t0 = performance.now();
      last = 0;
      window.addEventListener("resize", fit);

      render(0);
      fit();
      if (REDUCED) {
        // ค้างภาพตอนลำแสงกำลังกวาดอยู่กลางแบนเนอร์
        render(2.0);
        fit();
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

  window.AsciiBigText = { meta, create };
  window.BigBanner = BigBanner;
})();
