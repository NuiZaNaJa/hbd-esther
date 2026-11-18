/* ============================================================
   gif.js — เขียนไฟล์ GIF89a ด้วย vanilla JS ล้วน ๆ (ไม่พึ่ง lib ภายนอก)
   ------------------------------------------------------------
   - พาเลตตี 256 สี: histogram ถังสี RGB555 จากทุกเฟรม
     เลือกสีที่พบบ่อยสุด 255 สี + จับคู่สีที่เหลือด้วย "สีใกล้สุด"
     แล้วปรับค่า RGB เป็นค่าเฉลี่ยจริงของถังนั้น (สีตรงขึ้น)
   - LZW min code size 8 + Netscape looping extension (ลูปไม่รู้จบ)
   - encode เป็น async พักพืนระหว่างเฟรม → UI ไม่ค้าง + รายงาน % ได้

   ใช้:
     const blob = await GifMaker.encode({
       width, height, count, delayMs,
       getFrame: (i) => ImageData,   // วาดเฟรมที่ i แล้ว getImageData
       onProgress: (p) => ...        // 0..1
     });
   ============================================================ */

const GifMaker = (() => {
  "use strict";

  /* ---------------- growable byte buffer ---------------- */
  function ByteBuf() {
    this.a = new Uint8Array(1 << 16);
    this.n = 0;
  }
  ByteBuf.prototype.need = function (k) {
    if (this.n + k <= this.a.length) return;
    let cap = this.a.length;
    while (cap < this.n + k) cap <<= 1;
    const b = new Uint8Array(cap);
    b.set(this.a.subarray(0, this.n));
    this.a = b;
  };
  ByteBuf.prototype.u8 = function (v) {
    this.need(1);
    this.a[this.n++] = v & 255;
  };
  ByteBuf.prototype.u16 = function (v) {
    this.need(2);
    this.a[this.n++] = v & 255;
    this.a[this.n++] = (v >> 8) & 255;
  };
  ByteBuf.prototype.str = function (s) {
    this.need(s.length);
    for (let i = 0; i < s.length; i++) this.a[this.n++] = s.charCodeAt(i);
  };
  ByteBuf.prototype.bytes = function (arr) {
    this.need(arr.length);
    this.a.set(arr, this.n);
    this.n += arr.length;
  };
  ByteBuf.prototype.view = function () {
    return this.a.subarray(0, this.n);
  };

  /* ---------------- พาเลตตีจาก histogram RGB555 ---------------- */
  const BUCKETS = 32768; // 5-5-5 บิต

  /* วาดเฟรมทุกใบ 1 รอบ → นับถังสี + เก็บผลรวม RGB ต่อถัง */
  function scanFrames(getFrame, count) {
    const hist = new Uint32Array(BUCKETS);
    const sum = new Float64Array(BUCKETS * 3);
    for (let i = 0; i < count; i++) {
      const f = getFrame(i);
      const d = f.data;
      for (let p = 0; p < d.length; p += 4) {
        const b = ((d[p] >> 3) << 10) | ((d[p + 1] >> 3) << 5) | (d[p + 2] >> 3);
        hist[b]++;
        const s = b * 3;
        sum[s] += d[p];
        sum[s + 1] += d[p + 1];
        sum[s + 2] += d[p + 2];
      }
    }
    return { hist, sum };
  }

  function buildPalette(scan) {
    const { hist, sum } = scan;
    const used = [];
    for (let b = 0; b < BUCKETS; b++) if (hist[b]) used.push(b);
    used.sort((x, y) => hist[y] - hist[x]);

    const chosen = used.slice(0, 255); // เหลือ index 255 สำรอง (ไม่ใช้)
    const pal = new Uint8Array(768);
    const map = new Int16Array(BUCKETS).fill(-1); // ถัง → ดัชนีพาเลตตี
    const center = (b) => [((b >> 10) & 31) * 8 + 4, ((b >> 5) & 31) * 8 + 4, (b & 31) * 8 + 4];

    for (let i = 0; i < chosen.length; i++) {
      const b = chosen[i];
      const c = center(b);
      const n = hist[b];
      let r = c[0], g = c[1], bl = c[2];
      if (n) { // ใช้ค่าเฉลี่ยสีจริงในถัง (แม่นกว่าจุดกึ่งกลาง)
        r = Math.round(sum[b * 3] / n);
        g = Math.round(sum[b * 3 + 1] / n);
        bl = Math.round(sum[b * 3 + 2] / n);
      }
      pal[i * 3] = r; pal[i * 3 + 1] = g; pal[i * 3 + 2] = bl;
      map[b] = i;
    }
    // ถังที่ไม่ได้อยู่ในพาเลตตี → หาสีใกล้สุด
    for (let u = 0; u < used.length; u++) {
      const b = used[u];
      if (map[b] >= 0) continue;
      const c = center(b);
      let best = 0, bestD = Infinity;
      for (let i = 0; i < chosen.length; i++) {
        const dr = pal[i * 3] - c[0], dg = pal[i * 3 + 1] - c[1], db = pal[i * 3 + 2] - c[2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) { bestD = d; best = i; if (!d) break; }
      }
      map[b] = best;
    }
    return { pal, map };
  }

  /* ---------------- แผนที่พิกเซล → ดัชนีสี ---------------- */
  function mapFrame(data, map, indexed) {
    const n = data.length >> 2;
    for (let p = 0; p < n; p++) {
      const j = p << 2;
      indexed[p] = map[((data[j] >> 3) << 10) | ((data[j + 1] >> 3) << 5) | (data[j + 2] >> 3)];
    }
  }

  /* ---------------- LZW (ตามสเปก GIF89a, LSB-first) ---------------- */
  function lzw(indexed, n) {
    const MIN = 8, CLEAR = 256, EOI = 257;
    const table = new Int32Array(1 << 20).fill(-1); // key = k + (prefix << 8)
    const out = new ByteBuf();
    let codeSize = MIN + 1;
    let next = EOI + 1;
    let cur = 0, bits = 0;

    const emit = (code) => {
      cur |= code << bits;
      bits += codeSize;
      while (bits >= 8) {
        out.u8(cur & 255);
        cur >>>= 8;
        bits -= 8;
      }
    };

    emit(CLEAR);
    let prefix = indexed[0] & 255;
    for (let i = 1; i < n; i++) {
      const k = indexed[i] & 255;
      const key = k + (prefix << MIN);
      const c = table[key];
      if (c >= 0) {
        prefix = c;
      } else {
        emit(prefix);
        if (next === 4096) { // ตารางเต็ม → ล้างแล้วเริ่มใหม่
          emit(CLEAR);
          table.fill(-1);
          next = EOI + 1;
          codeSize = MIN + 1;
        } else {
          if (next >= (1 << codeSize)) codeSize++;
          table[key] = next++;
        }
        prefix = k;
      }
    }
    emit(prefix);
    emit(EOI);
    if (bits > 0) out.u8(cur & 255);
    return out;
  }

  /* ห่อข้อมูล LZW เป็น sub-block (ยาวไม่เกิน 255 ไบต์ต่อก้อน) */
  function subBlocks(buf, out) {
    const v = buf.view();
    let i = 0;
    while (i < v.length) {
      const len = Math.min(255, v.length - i);
      out.u8(len);
      out.bytes(v.subarray(i, i + len));
      i += len;
    }
    out.u8(0);
  }

  /* ---------------- ตัวเขียนหลัก ---------------- */
  async function encode(opts) {
    const width = opts.width | 0;
    const height = opts.height | 0;
    const count = opts.count | 0;
    const delayMs = opts.delayMs || 130;
    const loop = opts.loop === undefined ? 0 : opts.loop; // 0 = ลูปไม่รู้จบ
    const getFrame = opts.getFrame;
    const onProgress = opts.onProgress;
    if (!width || !height || !count || !getFrame) throw new Error("GifMaker.encode: ข้อมูลไม่ครบ");

    const total = count * 2;
    const breathe = () => new Promise((r) => setTimeout(r, 0));
    let done = 0;
    const tick = () => {
      done++;
      if (onProgress) onProgress(Math.min(1, done / total));
    };

    /* pass 1: นับสีทั้งหมด */
    const scan = scanFrames(getFrame, count);
    tick();
    await breathe();

    const { pal, map } = buildPalette(scan);
    const indexed = new Uint8Array(width * height);

    /* pass 2: map สี + LZW ทีละเฟรม */
    const out = new ByteBuf();
    out.str("GIF89a");
    out.u16(width); out.u16(height);
    out.u8(0xf7); // มี global color table 256 สี
    out.u8(0); out.u8(0); // bg index, aspect
    out.bytes(pal);

    // Netscape loop extension
    out.u8(0x21); out.u8(0xff); out.u8(0x0b);
    out.str("NETSCAPE2.0");
    out.u8(3); out.u8(1);
    out.u16(loop);
    out.u8(0);

    const delayCs = Math.max(2, Math.round(delayMs / 10));
    for (let i = 0; i < count; i++) {
      const f = getFrame(i);
      mapFrame(f.data, map, indexed);
      const lzwBuf = lzw(indexed, width * height);

      // graphic control extension: disposal = 1 (ค้างภาพเดิม)
      out.u8(0x21); out.u8(0xf9); out.u8(4); out.u8(0x04);
      out.u16(delayCs);
      out.u8(0); // transparent color index
      out.u8(0); // block terminator

      // image descriptor
      out.u8(0x2c);
      out.u16(0); out.u16(0); out.u16(width); out.u16(height);
      out.u8(0);
      out.u8(8); // LZW min code size
      subBlocks(lzwBuf, out);

      tick();
      if (i < count - 1) await breathe(); // พักให้ UI หายใจ
    }

    out.u8(0x3b); // trailer
    return new Blob([out.view()], { type: "image/gif" });
  }

  return { encode };
})();
