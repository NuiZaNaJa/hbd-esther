/* ============================================================
   ascii-kit.js — ASCII grid toolbox (vendored from ascii-magic.com)
   Source: https://www.ascii-magic.com/ascii/lib/kit.js  (MIT License)
   ตัดมาเฉพาะส่วนที่ชิ้น birthday-cake ใช้ และแปลงเป็น classic script
   เพื่อให้เปิดไฟล์ผ่าน file:// ได้โดยไม่ติด CORS ของ ES module
   ============================================================ */

(function () {
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);

  /* Deterministic PRNG (mulberry32) — seed เดิม = ภาพเดิมทุกครั้ง */
  function rng(seed = 1) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ── noise ── */
  function hash2(x, y, s) {
    let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function noise2(x, y, seed = 0) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = smooth(x - xi), yf = smooth(y - yi);
    const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
    const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    return lerp(lerp(a, b, xf), lerp(c, d, xf), yf);
  }
  function fbm(x, y, octaves = 4, seed = 0) {
    let v = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      v += amp * noise2(x * f, y * f, seed + i * 17);
      norm += amp; amp *= 0.5; f *= 2;
    }
    return v / norm;
  }

  /* ── colour ── */
  /* กุญแจสี: ตัวอักษร 1 ตัวต่อ 1 สี เรียงตามลำดับที่ประกาศพาเลตต์ */
  const KEYS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  function palette(hexes) {
    const p = {};
    hexes.forEach((h, i) => (p[KEYS[i]] = h));
    return p;
  }
  /* ไล่เฉด n ขั้นระหว่างสี stops — ใช้แรเงาตามค่าความสว่าง */
  function gradient(stops, n = 10) {
    const toRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const rgb = stops.map(toRgb);
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * (rgb.length - 1);
      const j = Math.min(rgb.length - 2, Math.floor(t)), f = t - j;
      const c = rgb[j].map((v, k) => Math.round(lerp(v, rgb[j + 1][k], f)));
      out.push("#" + c.map((v) => v.toString(16).padStart(2, "0")).join(""));
    }
    return out;
  }

  /* ── the grid: 1 ช่อง = 1 ตัวอักษร + 1 กุญแจสี ── */
  class Grid {
    constructor(cols, rows) {
      this.cols = cols; this.rows = rows;
      this.ch = new Array(cols * rows).fill(" ");
      this.co = new Array(cols * rows).fill(" ");
      this.z = new Float32Array(cols * rows);
    }
    clear(ch = " ", co = " ") { this.ch.fill(ch); this.co.fill(co); this.z.fill(-Infinity); return this; }
    inside(x, y) { return x >= 0 && y >= 0 && x < this.cols && y < this.rows; }
    set(x, y, ch, co) {
      x = Math.floor(x); y = Math.floor(y);
      if (!this.inside(x, y)) return;
      const i = x + y * this.cols;
      this.ch[i] = ch; if (co !== undefined) this.co[i] = co;
    }
    get(x, y) { return this.inside(x, y) ? this.ch[Math.floor(x) + Math.floor(y) * this.cols] : " "; }
    text(x, y, s, co) { for (let i = 0; i < s.length; i++) this.set(x + i, y, s[i], co); }
    /* เฟรมที่ชิ้นคืนค่า: ข้อความล้วน หรือ {text, color} เมื่อมีการใช้สี */
    frame() {
      const lines = [], cl = [];
      let colored = false;
      for (let y = 0; y < this.rows; y++) {
        lines.push(this.ch.slice(y * this.cols, (y + 1) * this.cols).join(""));
        const c = this.co.slice(y * this.cols, (y + 1) * this.cols).join("");
        if (!colored && c.trim()) colored = true;
        cl.push(c);
      }
      return colored ? { text: lines.join("\n"), color: cl.join("\n") } : lines.join("\n");
    }
  }

  window.AsciiKit = { clamp, lerp, smooth, rng, noise2, fbm, KEYS, palette, gradient, Grid };
})();
