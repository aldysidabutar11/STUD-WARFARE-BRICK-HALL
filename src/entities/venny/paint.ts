// src/entities/venny/paint.ts — kuas & tekstur Venny realistis (kanvas, 100% prosedural). Acuan: Karakter/ROBLOX-VENNY-*-TIM (KHUSUS).png.
// Konvensi UV loft: u keliling (0 = belakang, 0.25 = kanan Venny, 0.5 = depan, 0.75 = kiri), v bawah → atas (baris atas kanvas = v 1).
import type { Rng } from '../../core/Rng';
import { COL, css, edge, fill, grain, rrect, shade, stitch, tone, type G, type Painter } from '../charKit';

const V = COL.venny;

// ───────────── proyeksi wajah (planar dari depan) — dipakai juga oleh geometri kepala (rig.ts)
export const HEAD_C: [number, number, number] = [0, 4.52, 0];
/** Tinggi relatif wajah: angka desain lama (pusat 4.56) → pusat kepala sekarang, sedikit dipadatkan (wajah lebih bulat & pendek). */
export const yy = (y: number) => HEAD_C[1] + (y - 4.56) * 0.93;
export const FACE = { x0: -0.31, x1: 0.31, y0: HEAD_C[1] - 0.37, y1: HEAD_C[1] + 0.43 };
/** Koordinat kepala (x, y) → piksel tekstur wajah. */
const fx = (x: number, w: number) => ((x - FACE.x0) / (FACE.x1 - FACE.x0)) * w;
const fy = (y: number, h: number) => (1 - (yy(y) - FACE.y0) / (FACE.y1 - FACE.y0)) * h;

export interface Look { red: boolean }

// ───────────── kuas umum
const noise1 = (seed: number) => {   // derau nilai 1D halus (periodik 256)
  const t = new Float32Array(256);
  let s = seed >>> 0;
  for (let i = 0; i < 256; i++) { s = (s * 1664525 + 1013904223) >>> 0; t[i] = s / 4294967296; }
  return (x: number) => {
    const i = Math.floor(x), f = x - i, a = t[i & 255], b = t[(i + 1) & 255];
    return a + (b - a) * f * f * (3 - 2 * f);
  };
};
export const dirt = (g: G, w: number, h: number, rng: Rng, k = 1) => {
  const n = Math.max(2, Math.round(((w * h) / 1100) * k));
  for (let i = 0; i < n; i++) {
    const x = rng() * w, y = rng() * h, r = 3 + rng() * Math.min(w, h) * 0.22, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(128,98,66,${(0.13 + rng() * 0.15).toFixed(3)})`); gr.addColorStop(1, 'rgba(128,98,66,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < Math.round(((w * h) / 700) * k); i++) { g.fillStyle = `rgba(150,122,90,${(0.06 + rng() * 0.12).toFixed(3)})`; g.fillRect(rng() * w, rng() * h, 1.2, 1.2); }
};
const cut = (g: G, path: () => void) => { g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.beginPath(); path(); g.fill(); g.restore(); };
const ragged = (g: G, w: number, h: number, rng: Rng, depth: number, notches: number[], thread: string, top = false) => {
  // tepi bawah (atau atas bila top) sobek: gerigi acak + takik V + benang terurai
  const d = h * depth, Y = (y: number) => (top ? h - y : y);
  cut(g, () => {
    g.moveTo(-1, Y(h + 1)); let x = -1;
    while (x < w) { x = Math.min(w + 1, x + 2 + rng() * 5); g.lineTo(x, Y(h - d * (0.1 + rng() * 0.9))); }
    g.lineTo(w + 1, Y(h + 1)); g.closePath();
  });
  for (const n of notches) {
    const cx = n * w, dd = d * (2.4 + rng() * 1.8), hw = Math.max(2, w * (0.02 + rng() * 0.02)), tip = cx + (rng() - 0.5) * hw * 0.8;
    cut(g, () => { g.moveTo(cx - hw, Y(h + 1)); g.lineTo(tip, Y(h - dd)); g.lineTo(cx + hw, Y(h + 1)); g.closePath(); });
  }
  g.strokeStyle = thread; g.lineWidth = Math.max(1, w / 120);
  for (let i = 0; i < Math.round(w / 9); i++) {
    const x = rng() * w, y0 = h - d * (0.85 + rng() * 0.3);
    g.beginPath(); g.moveTo(x, Y(y0)); g.lineTo(x + (rng() - 0.5) * 3, Y(y0 + d * (0.35 + rng() * 0.6))); g.stroke();
  }
};
const tear = (g: G, x: number, y: number, rw: number, rh: number, rng: Rng) => {
  const ks = Array.from({ length: 13 }, () => 0.65 + rng() * 0.5);
  const jag = (k: number) => () => {
    for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI * 2, r = k * ks[i % 12]; const px = x + Math.cos(a) * rw * r, py = y + Math.sin(a) * rh * r; if (i) g.lineTo(px, py); else g.moveTo(px, py); }
    g.closePath();
  };
  g.fillStyle = 'rgba(80,72,64,0.85)'; g.beginPath(); jag(1.3)(); g.fill();
  cut(g, jag(0.85));
};
const cordura = (g: G, w: number, h: number, rng: Rng, c: number) => {
  fill(g, w, h, css(c));
  g.fillStyle = 'rgba(255,255,255,0.025)'; for (let y = 0; y < h; y += 2) g.fillRect(0, y, w, 1);
  g.fillStyle = 'rgba(0,0,0,0.06)'; for (let x = 0; x < w; x += 2) g.fillRect(x, 0, 1, h);
  grain(g, w, h, rng, 0.05, 1.5);
};
const molle = (g: G, x0: number, x1: number, y: number, rowH: number, rows: number, step: number) => {
  for (let r = 0; r < rows; r++) {
    const yy = y + r * rowH * 1.7;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x0, yy + rowH, x1 - x0, Math.max(1, rowH * 0.28));
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x0, yy, x1 - x0, rowH);
    g.fillStyle = 'rgba(0,0,0,0.42)'; for (let x = x0 + step * 0.5; x < x1; x += step) g.fillRect(x, yy, Math.max(1, step * 0.12), rowH);
  }
};
const skinBase = (g: G, w: number, h: number, rng: Rng) => { fill(g, w, h, css(V.skin)); grain(g, w, h, rng, 0.015, 1.5); };
/** Gradasi volume horizontal pada loft (tepi u 0/1 = belakang → tengah depan lebih terang). */
const roundShade = (g: G, w: number, h: number, a = 0.14, c = '80,40,25') => {
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, `rgba(${c},${a})`); gr.addColorStop(0.3, `rgba(${c},${a * 0.4})`); gr.addColorStop(0.5, c === '0,0,0' ? 'rgba(255,255,255,0.03)' : 'rgba(255,240,228,0.06)');
  gr.addColorStop(0.7, `rgba(${c},${a * 0.4})`); gr.addColorStop(1, `rgba(${c},${a})`);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
};

// ───────────── WAJAH (planar, acuan foto): wajah bulat bervolume (bayang tepi & rahang, kilau dahi/tulang pipi/dagu), bayang garis
// rambut + anak rambut, alis cokelat tua melengkung lembut menipis ke ujung, mata almond besar (iris cokelat tua lebar, kilau, garis
// bulu mata lembut bersayap pendek, lipatan kelopak), hidung kecil membulat (bayang samping, kilau ujung), bibir merah muda penuh
// tersenyum, pipi merona. Sisi kanan kanvas = kanan Venny (tampak di kiri penonton).
export const faceP = (look: Look): Painter => (g, w, h, rng) => {
  const X = (x: number) => fx(x, w), Y = (y: number) => fy(y, h), S = w / 0.62;
  const L = (u: number) => Math.max(1, u * S);
  const glow = (x: number, y: number, rx: number, ry: number, rgb: string, a: number) => {
    const R = rx * S;
    g.save(); g.translate(X(x), Y(y)); g.scale(1, (ry * 0.93) / rx);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
    gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(-R, -R, 2 * R, 2 * R); g.restore();
  };
  const soft = (px: number, fn: () => void) => { g.save(); g.filter = `blur(${px}px)`; fn(); g.restore(); };
  skinBase(g, w, h, rng);
  // volume wajah: tepi & rahang lebih gelap (elips), kilau dahi, tulang pipi, batang hidung, dagu
  {
    const R = 0.3 * S;
    g.save(); g.translate(X(0), Y(4.53)); g.scale(1, 1.38);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
    gr.addColorStop(0, 'rgba(110,58,38,0)'); gr.addColorStop(0.6, 'rgba(110,58,38,0)'); gr.addColorStop(1, 'rgba(105,55,36,0.26)');
    g.fillStyle = gr; g.fillRect(-R * 1.5, -R * 1.5, R * 3, R * 3); g.restore();
  }
  glow(0, 4.73, 0.13, 0.07, '255,240,228', 0.13);
  for (const s of [-1, 1]) {
    glow(s * 0.13, 4.535, 0.075, 0.04, '255,240,228', 0.1);
    glow(s * 0.2, 4.6, 0.06, 0.09, '120,65,45', 0.09);          // pelipis
    glow(s * 0.25, 4.27, 0.08, 0.1, '105,55,36', 0.1);          // rahang (sisi luar)
    glow(s * 0.15, 4.472, 0.088, 0.062, '232,108,104', 0.22);   // pipi merona
    glow(s * 0.11, 4.49, 0.05, 0.03, '255,240,228', 0.12);      // tulang pipi (apel pipi saat tersenyum)
  }
  glow(0, 4.54, 0.017, 0.085, '255,242,232', 0.16);   // batang hidung
  glow(0, 4.255, 0.06, 0.04, '255,240,228', 0.2);   // dagu terang
  glow(0, 4.318, 0.05, 0.012, '120,60,45', 0.18);
  // tepi rambut di dahi dilukis di tekstur wajah (resolusi tinggi → garis rambut mulus): helai memancar dari belahan, tepi lembut
  // 1–2 px, bayang tipis di bawahnya. Cangkang rambut berhenti sedikit di atas (HAIR_INSET) dan memberi volume.
  {
    const t = g.getTransform(), ox = Math.round(t.e), oy = Math.round(t.f);
    const img = g.getImageData(ox, oy, w, h), D = img.data, hc = HEAD_C[1], nA = noise1(53), nB = noise1(59);
    const base = [((V.hair >> 16) & 255), ((V.hair >> 8) & 255), V.hair & 255];
    const pxp = 0.075, pyp = yy(4.86);   // titik belahan (dunia)
    for (let py = 0; py < h; py++) {
      const y = FACE.y0 + (1 - (py + 0.5) / h) * (FACE.y1 - FACE.y0), dy0 = y - hc;
      for (let px = 0; px < w; px++) {
        const x = FACE.x0 + ((px + 0.5) / w) * (FACE.x1 - FACE.x0);
        const zz = 0.29 * Math.sqrt(Math.max(0.0004, 1 - (x / 0.286) ** 2 - (dy0 / 0.34) ** 2));
        const dphi = Math.acos(dy0 / Math.hypot(x, dy0, zz)) - hairLimit(Math.atan2(x, zz));
        if (dphi > 0.045) continue;
        const i = (py * w + px) * 4;
        if (dphi > 0) { const f = 1 - 0.3 * (1 - dphi / 0.045) ** 2; D[i] *= f; D[i + 1] *= f * 0.97; D[i + 2] *= f * 0.96; continue; }
        const ang = Math.atan2(y - pyp, x - pxp), sN = 0.62 * nA(ang * 34) + 0.38 * nB(ang * 90);
        const k = Math.min(1, -dphi / 0.007), sheen = Math.max(0, 1 - Math.abs(y - (pyp - 0.06)) / 0.08) * 26 * sN;
        for (let c = 0; c < 3; c++) {
          const hv = base[c] * (0.72 + 0.56 * sN) + sheen * (c === 2 ? 1.15 : 0.8);
          D[i + c] = D[i + c] + (hv - D[i + c]) * k;
        }
      }
    }
    g.putImageData(img, ox, oy);
  }  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const s of [-1, 1]) {   // s = −1 → kanan Venny (kanan kanvas, x > 0); +1 → kiri Venny
    const xs = (x: number) => X(-s * x);
    // alis: garis tengah kuadratik pangkal → puncak → ujung, tebal 0.018 → 0.005; cokelat tua lembut + helai
    const P0 = [0.038, 4.664], C = [0.1, 4.702], P2 = [0.174, 4.673];
    const bz = (t: number) => [(1 - t) ** 2 * P0[0] + 2 * (1 - t) * t * C[0] + t * t * P2[0], (1 - t) ** 2 * P0[1] + 2 * (1 - t) * t * C[1] + t * t * P2[1]];
    const th = (t: number) => 0.024 + (0.006 - 0.024) * t ** 1.4;
    soft(0.6, () => {
      g.fillStyle = 'rgba(38,25,18,0.95)'; g.beginPath();
      for (let k = 0; k <= 16; k++) { const t = k / 16, [x, y] = bz(t); const yy2 = y + th(t) * 0.55; if (k) g.lineTo(xs(x), Y(yy2)); else g.moveTo(xs(x), Y(yy2)); }
      for (let k = 16; k >= 0; k--) { const t = k / 16, [x, y] = bz(t); g.lineTo(xs(x), Y(y - th(t) * 0.45)); }
      g.closePath(); g.fill();
    });
    g.strokeStyle = 'rgba(32,21,15,0.55)'; g.lineWidth = Math.max(0.8, S * 0.0016);
    for (let k = 0; k < 22; k++) {
      const t = k / 21, [x, y] = bz(t), ang = t < 0.25 ? 1.2 : t < 0.6 ? 0.55 : 0.2, len = 0.012 * (1 - t * 0.5);
      g.beginPath(); g.moveTo(xs(x - 0.004), Y(y - th(t) * 0.35)); g.lineTo(xs(x - 0.004 + Math.cos(ang) * len), Y(y - th(t) * 0.35 + Math.sin(ang) * len)); g.stroke();
    }
    // mata almond besar
    const ex = 0.107, ey = 4.6, ew = 0.062, eh = 0.029;
    const I = [ex - ew, ey - 0.003], O = [ex + ew, ey + 0.006];
    const upper = () => { g.moveTo(xs(I[0]), Y(I[1])); g.bezierCurveTo(xs(ex - 0.03), Y(ey + eh * 1.55), xs(ex + 0.035), Y(ey + eh * 1.5), xs(O[0]), Y(O[1])); };
    const lower = () => g.bezierCurveTo(xs(ex + 0.03), Y(ey - eh * 0.95), xs(ex - 0.03), Y(ey - eh * 1.0), xs(I[0]), Y(I[1]));
    glow(-s * (ex + 0.005), ey + 0.035, 0.07, 0.03, '130,78,62', 0.14);   // bayang kelopak / rongga mata
    glow(-s * (ex + 0.01), ey - 0.042, 0.055, 0.018, '140,80,65', 0.1);  // bayang bawah mata
    g.save(); g.beginPath(); upper(); lower(); g.closePath(); g.clip();
    g.fillStyle = '#f0e7e1'; g.fillRect(xs(ex) - S * 0.08, Y(ey + 0.05), S * 0.16, Y(ey - 0.05) - Y(ey + 0.05));
    let gr = g.createLinearGradient(0, Y(ey + 0.035), 0, Y(ey - 0.005));
    gr.addColorStop(0, 'rgba(70,35,25,0.45)'); gr.addColorStop(1, 'rgba(70,35,25,0)');
    g.fillStyle = gr; g.fillRect(xs(ex) - S * 0.08, Y(ey + 0.05), S * 0.16, Y(ey - 0.005) - Y(ey + 0.05));
    const ix = xs(ex + 0.001), iy = Y(ey + 0.003), ir = S * 0.0305;
    gr = g.createRadialGradient(ix, iy + ir * 0.35, ir * 0.08, ix, iy, ir);
    gr.addColorStop(0, '#7e4f2e'); gr.addColorStop(0.5, css(V.iris)); gr.addColorStop(0.88, '#24130b'); gr.addColorStop(1, '#140a06');
    g.fillStyle = gr; g.beginPath(); g.arc(ix, iy, ir, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0a0504'; g.beginPath(); g.arc(ix, iy, ir * 0.42, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.arc(ix - ir * 0.33, iy - ir * 0.36, Math.max(1, ir * 0.2), 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(ix + ir * 0.3, iy + ir * 0.32, Math.max(0.7, ir * 0.09), 0, Math.PI * 2); g.fill();
    g.restore();
    g.fillStyle = 'rgba(214,140,135,0.5)'; g.beginPath(); g.arc(xs(I[0] + 0.004), Y(I[1]), S * 0.004, 0, Math.PI * 2); g.fill();   // sudut dalam
    // garis bulu mata atas (lembut, menebal ke luar) + sayap pendek + lipatan kelopak; garis bawah tipis
    g.strokeStyle = '#140c09'; g.lineWidth = L(0.0062); g.beginPath(); upper(); g.stroke();
    g.strokeStyle = 'rgba(20,12,9,0.55)'; g.lineWidth = L(0.004);
    g.beginPath(); g.moveTo(xs(ex - 0.01), Y(ey + eh * 1.2)); g.bezierCurveTo(xs(ex + 0.02), Y(ey + eh * 1.3), xs(ex + 0.045), Y(ey + eh * 1.05), xs(O[0] + 0.004), Y(O[1] + 0.004)); g.stroke();
    g.fillStyle = '#140c09'; g.beginPath();
    g.moveTo(xs(O[0] - 0.012), Y(O[1] + 0.007)); g.lineTo(xs(O[0] + 0.014), Y(O[1] + 0.011)); g.lineTo(xs(O[0] - 0.004), Y(O[1] - 0.002)); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(125,72,58,0.38)'; g.lineWidth = L(0.0026);
    g.beginPath(); g.moveTo(xs(ex - 0.028), Y(ey + eh * 1.55)); g.quadraticCurveTo(xs(ex + 0.022), Y(ey + eh * 2.2), xs(O[0] - 0.002), Y(O[1] + eh * 0.95)); g.stroke();
    g.strokeStyle = 'rgba(80,45,32,0.45)'; g.lineWidth = L(0.0026);
    g.beginPath(); g.moveTo(xs(O[0]), Y(O[1] - 0.001)); g.bezierCurveTo(xs(ex + 0.03), Y(ey - eh * 0.95), xs(ex - 0.012), Y(ey - eh * 0.98), xs(ex - 0.03), Y(ey - eh * 0.75)); g.stroke();
  }
  // hidung kecil membulat
  for (const s of [-1, 1]) { glow(s * 0.03, 4.53, 0.013, 0.075, '125,68,50', 0.24); glow(s * 0.036, 4.468, 0.016, 0.016, '125,68,50', 0.2); }
  glow(0, 4.48, 0.026, 0.022, '255,242,232', 0.34);
  glow(0, 4.453, 0.04, 0.01, '110,55,40', 0.32);
  soft(0.5, () => {
    g.strokeStyle = 'rgba(140,75,55,0.42)'; g.lineWidth = L(0.003);
    for (const s of [-1, 1]) { g.beginPath(); g.arc(X(s * 0.031), Y(4.465), S * 0.014, s < 0 ? Math.PI * 0.45 : -Math.PI * 0.3, s < 0 ? Math.PI * 1.3 : Math.PI * 0.55); g.stroke(); }
    g.fillStyle = 'rgba(85,36,30,0.75)';
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(X(s * 0.017), Y(4.452), S * 0.0115, S * 0.0062, s * 0.35, 0, Math.PI * 2); g.fill(); }
  });
  glow(0, 4.392, 0.012, 0.02, '170,100,80', 0.12);
  // bibir merah muda penuh, sudut sedikit naik (senyum lembut)
  const lc = -0.068, rc = 0.068, ly = 4.359;
  soft(0.5, () => {
    g.fillStyle = '#b4505a';
    g.beginPath(); g.moveTo(X(lc), Y(ly));
    g.bezierCurveTo(X(-0.05), Y(4.369), X(-0.035), Y(4.379), X(-0.019), Y(4.378));
    g.quadraticCurveTo(X(-0.008), Y(4.377), X(0), Y(4.372));
    g.quadraticCurveTo(X(0.008), Y(4.377), X(0.019), Y(4.378));
    g.bezierCurveTo(X(0.035), Y(4.379), X(0.05), Y(4.369), X(rc), Y(ly));
    g.bezierCurveTo(X(0.03), Y(4.352), X(-0.03), Y(4.352), X(lc), Y(ly)); g.closePath(); g.fill();
    g.fillStyle = '#cf6a6e';
    g.beginPath(); g.moveTo(X(lc), Y(ly));
    g.bezierCurveTo(X(-0.03), Y(4.352), X(0.03), Y(4.352), X(rc), Y(ly));
    g.bezierCurveTo(X(0.052), Y(4.334), X(0.026), Y(4.319), X(0), Y(4.319));
    g.bezierCurveTo(X(-0.026), Y(4.319), X(-0.052), Y(4.334), X(lc), Y(ly)); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.28)'; g.beginPath(); g.ellipse(X(0.012), Y(4.333), S * 0.022, S * 0.0048, 0, 0, Math.PI * 2); g.fill();
  });
  g.strokeStyle = '#7b3237'; g.lineWidth = L(0.0032);
  g.beginPath(); g.moveTo(X(lc - 0.006), Y(ly + 0.008)); g.bezierCurveTo(X(-0.03), Y(4.351), X(0.03), Y(4.351), X(rc + 0.006), Y(ly + 0.008)); g.stroke();
  g.strokeStyle = 'rgba(150,85,65,0.3)'; g.lineWidth = L(0.0024);
  for (const s of [-1, 1]) { g.beginPath(); g.arc(X(s * 0.077), Y(4.364), S * 0.009, s < 0 ? Math.PI * 0.55 : Math.PI * 0.05, s < 0 ? Math.PI * 0.95 : Math.PI * 0.45); g.stroke(); }
  if (look.red) {   // plester silang di pipi kanan Venny (kanan kanvas)
    const pl = (x: number, y: number, lw: number, lh: number, a: number) => {
      g.save(); g.translate(X(x), Y(y)); g.rotate(a);
      const pw = lw * S, ph = lh * S;
      g.fillStyle = 'rgba(90,50,35,0.22)'; rrect(g, -pw / 2 + 1, -ph / 2 + 1.5, pw, ph, ph * 0.45); g.fill();
      g.fillStyle = css(V.plaster); rrect(g, -pw / 2, -ph / 2, pw, ph, ph * 0.45); g.fill();
      g.fillStyle = 'rgba(255,240,226,0.5)'; rrect(g, -pw * 0.16, -ph * 0.34, pw * 0.32, ph * 0.68, ph * 0.15); g.fill();
      g.fillStyle = 'rgba(120,80,55,0.35)';
      for (let i = -3; i <= 3; i++) if (Math.abs(i) > 1) { g.beginPath(); g.arc(i * pw * 0.11, 0, Math.max(0.6, ph * 0.07), 0, Math.PI * 2); g.fill(); }
      g.restore();
    };
    pl(0.155, 4.5, 0.11, 0.03, -0.35);
    pl(0.158, 4.502, 0.075, 0.026, 0.62);
  }
};

/** Kulit kepala bagian samping/belakang/bawah (proyeksi bola; sebagian besar di bawah rambut). */
export const headRestP: Painter = (g, w, h, rng) => {
  skinBase(g, w, h, rng);
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(23,17,14,0.9)'); gr.addColorStop(0.42, 'rgba(23,17,14,0.35)');
  gr.addColorStop(0.55, 'rgba(110,58,38,0.2)'); gr.addColorStop(1, 'rgba(110,58,38,0.32)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
};

// ───────────── RAMBUT (per piksel): helai halus "tertarik" ke ikat kuncir di tengkuk, kilau kebiruan seperti rambut hitam berkilau,
// belahan di kanan; alpha = garis rambut (tepi mulus; anak rambut dilukis di tekstur wajah)
/** Batas rambut (polar φ dari puncak) pada azimut a (0 depan, + kanan Venny, ±π belakang): rambut membingkai dahi (sudut dahi tertutup),
 *  turun ke pelipis, diselipkan di atas telinga, turun di belakang telinga ke tengkuk; poni belahan menyapu ke kiri Venny. */
export const hairLimit = (a: number) => {
  const A = Math.abs(a);
  // dahi: lengkung berpuncak di belahan (a0) — rambut turun seperti tirai menutupi sudut dahi, lebih rendah di sisi kiri Venny
  const arch = (x: number) => 0.78 + 0.56 * Math.min(1, Math.abs(x - 0.25) / 1.3) ** 1.6;
  if (A < 1.3) return arch(a);
  if (A < 1.45) return arch(Math.sign(a) * 1.3) + (1.25 - arch(Math.sign(a) * 1.3)) * ((A - 1.3) / 0.15);   // ke atas telinga
  if (A < 1.9) return 1.25;                                             // di atas telinga (diselipkan)
  if (A < 2.1) return 1.25 + ((A - 1.9) / 0.2) * 0.67;                  // turun di belakang telinga
  return 1.92 + 0.12 * ((A - 2.1) / (Math.PI - 2.1));                  // tengkuk
};export const PART_A = 0.28;   // azimut belahan (kanan Venny)
/** Di dahi, tepi cangkang rambut berhenti sekian rad di atas garis rambut — pita rambut di bawahnya dilukis di tekstur wajah. */
export const HAIR_INSET = 0.04;
const sstep01 = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };
export const hairP: Painter = (g, w, h) => {
  const t = g.getTransform(), ox = Math.round(t.e), oy = Math.round(t.f);
  const img = g.getImageData(ox, oy, w, h), D = img.data;
  const n1 = noise1(7), n2 = noise1(19), n3 = noise1(31);
  const base = [((V.hair >> 16) & 255), ((V.hair >> 8) & 255), V.hair & 255];
  // titik ikat kuncir (arah dari pusat kepala) & basis di sekitarnya → helai = "meridian" yang menyatu di ikat
  // helai = meridian antara belahan (depan) dan ikat kuncir (tengkuk) → memancar dari belahan, menyatu di belakang bawah
  const T = [-0.09, -0.535, 0.84], E1 = [1 - T[0] * T[0], -T[0] * T[1], -T[0] * T[2]], e1l = Math.hypot(E1[0], E1[1], E1[2]);
  E1[0] /= e1l; E1[1] /= e1l; E1[2] /= e1l;
  const E2 = [T[1] * E1[2] - T[2] * E1[1], T[2] * E1[0] - T[0] * E1[2], T[0] * E1[1] - T[1] * E1[0]];
  const Lx = 0.25, Ly = 0.88, Lz = -0.4, Ll = Math.hypot(Lx, Ly, Lz);   // arah cahaya kilau (atas-depan)
  for (let py = 0; py < h; py++) {
    const v = 1 - (py + 0.5) / h, ph = Math.PI * (1 - v);
    for (let px = 0; px < w; px++) {
      const u = (px + 0.5) / w, a = Math.PI - u * Math.PI * 2;   // u 0.5 → a 0 (depan); a > 0 → kanan Venny
      const i = (py * w + px) * 4;
      if (ph > hairLimit(a) - HAIR_INSET * (1 - sstep01((Math.abs(a) - 1.05) / 0.2))) { D[i + 3] = 0; continue; }
      const d = [Math.sin(ph) * Math.sin(a), Math.cos(ph), -Math.sin(ph) * Math.cos(a)];
      const psi = Math.atan2(d[0] * E2[0] + d[1] * E2[1] + d[2] * E2[2], d[0] * E1[0] + d[1] * E1[1] + d[2] * E1[2]);
      const rho = Math.acos(Math.max(-1, Math.min(1, d[0] * T[0] + d[1] * T[1] + d[2] * T[2])));
      // helai panjang lembut (frekuensi rendah dominan) + sedikit helai halus
      const s = 0.58 * n1(psi * 20) + 0.3 * n2(psi * 46 + rho * 0.7) + 0.12 * n3(psi * 110);
      let r = base[0] * (0.78 + 0.44 * s), gg = base[1] * (0.78 + 0.44 * s), b = base[2] * (0.82 + 0.5 * s);
      // kilau: bagian yang menghadap cahaya, dipecah helai (tampak seperti pantulan rambut berminyak/berkilau)
      const nd = Math.max(0, (d[0] * Lx + d[1] * Ly + d[2] * Lz) / Ll), sh = nd ** 5 * (0.45 + 0.9 * (s - 0.3));
      r += 62 * sh * 0.75; gg += 62 * sh * 0.85; b += 62 * sh * 1.1;
      // belahan: lekuk tipis lebih gelap
      const dpart = Math.abs(a - PART_A) * Math.sin(ph);
      if (ph < 0.85 && ph > 0.12 && dpart < 0.03) { const k = 1 - 0.35 * (1 - dpart / 0.03); r *= k; gg *= k; b *= k; }
      D[i] = Math.min(255, r); D[i + 1] = Math.min(255, gg); D[i + 2] = Math.min(255, b); D[i + 3] = 255;
    }
  }
  g.putImageData(img, ox, oy);
};
/** Kuncir: helai memanjang (u keliling, v pangkal 1 → ujung 0), kilau di satu sisi, ujung bergerigi (alpha). */
export const tailP: Painter = (g, w, h) => {
  const t = g.getTransform(), ox = Math.round(t.e), oy = Math.round(t.f);
  const img = g.getImageData(ox, oy, w, h), D = img.data, n1 = noise1(41), n2 = noise1(43);
  const base = [((V.hair >> 16) & 255), ((V.hair >> 8) & 255), V.hair & 255];
  for (let py = 0; py < h; py++) {
    const v = 1 - (py + 0.5) / h;
    for (let px = 0; px < w; px++) {
      const u = (px + 0.5) / w, s = 0.6 * n1(u * 40 + v * 2) + 0.4 * n2(u * 90);
      const sheen = Math.exp(-(((u - 0.62) / 0.13) ** 2)) * (0.55 + 0.45 * Math.sin(v * 7)) * 55 * (0.5 + s);
      const i = (py * w + px) * 4;
      D[i] = Math.min(255, base[0] * (0.68 + 0.64 * s) + sheen * 0.75); D[i + 1] = Math.min(255, base[1] * (0.68 + 0.64 * s) + sheen * 0.85);
      D[i + 2] = Math.min(255, base[2] * (0.72 + 0.68 * s) + sheen * 1.1);
      D[i + 3] = v < 0.1 && n1(u * 90 + 5) > v * 9 ? 0 : 255;
    }
  }
  g.putImageData(img, ox, oy);
};
export const wispP: Painter = (g, w, h, rng) => {   // helai lepas: garis-garis rambut, tepi transparan
  g.clearRect(0, 0, w, h);
  for (let i = 0; i < w * 1.5; i++) {
    const x = w * (0.15 + rng() * 0.7);
    g.strokeStyle = rng() < 0.6 ? css(V.hair) : 'rgba(70,72,88,1)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (rng() - 0.5) * 2, h * (0.75 + rng() * 0.25)); g.stroke();
  }
};
export const earP: Painter = (g, w, h, rng) => {
  skinBase(g, w, h, rng);
  g.fillStyle = 'rgba(150,80,58,0.3)'; g.beginPath(); g.ellipse(w * 0.5, h * 0.5, w * 0.25, h * 0.3, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(232,120,105,0.2)'; g.fillRect(0, 0, w, h * 0.35);
};
export const neckP: Painter = (g, w, h, rng) => {
  skinBase(g, w, h, rng); roundShade(g, w, h, 0.18);
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(100,50,32,0.35)'); gr.addColorStop(0.5, 'rgba(100,50,32,0.05)'); gr.addColorStop(1, 'rgba(100,50,32,0.1)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
};

// ───────────── PAKAIAN
export const cotton = (g: G, w: number, h: number, rng: Rng, look: Look) => {
  fill(g, w, h, css(look.red ? V.shirtRed : V.shirt)); grain(g, w, h, rng, 0.045, 1.5);
  if (look.red) dirt(g, w, h, rng, 0.5);
};
/** Kaus (badan): u keliling, v pinggang → leher; kerah rajut bulat di atas, jahitan samping, kerut. */
export const torsoP = (look: Look): Painter => (g, w, h, rng) => {
  cotton(g, w, h, rng, look);
  g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.2;
  for (const u of [0.25, 0.75]) { g.beginPath(); g.moveTo(w * u, 0); g.lineTo(w * u, h); g.stroke(); }
  for (let i = 0; i < 8; i++) { const x = rng() * w, y = h * (0.15 + rng() * 0.6); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w * 0.03, y + h * 0.04, x + w * 0.07, y + h * 0.01); g.stroke(); }
  const c = tone(look.red ? V.shirtRed : V.shirt, 0.6);
  g.fillStyle = c; g.fillRect(0, 0, w, h * 0.035);                                                  // kerah rajut
  g.fillStyle = 'rgba(255,255,255,0.04)'; for (let x = 0; x < w; x += 3) g.fillRect(x, 0, 1, h * 0.035);
  roundShade(g, w, h, 0.22, '0,0,0'); shade(g, w, h, 0.05, 0.22);
};
export const sleeveP = (look: Look, notches: number[]): Painter => (g, w, h, rng) => {
  cotton(g, w, h, rng, look);
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) { const y = h * (0.35 + rng() * 0.4); g.beginPath(); g.moveTo(0, y); g.quadraticCurveTo(w * 0.5, y + h * 0.06, w, y - h * 0.02); g.stroke(); }
  if (!look.red) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h * 0.86, w, h * 0.14); stitch(g, 0, h * 0.87, w, h * 0.87, 'rgba(255,255,255,0.1)'); }
  roundShade(g, w, h, 0.24, '0,0,0'); shade(g, w, h, 0.06, 0.2);
  if (look.red) { tear(g, w * 0.3, h * 0.55, w * 0.04, h * 0.07, rng); ragged(g, w, h, rng, 0.16, notches, tone(V.shirtRed, 1.7)); }
};
/** Lengan (kulit): v pergelangan → bahu; bagian atas di bawah lengan kaus. */
export const armP = (look: Look, scr: boolean): Painter => (g, w, h, rng) => {
  skinBase(g, w, h, rng); roundShade(g, w, h, 0.16);
  g.strokeStyle = 'rgba(150,85,60,0.22)'; g.lineWidth = 1.2;                                     // lipatan siku (depan) & siku (belakang)
  g.beginPath(); g.moveTo(w * 0.42, h * 0.53); g.quadraticCurveTo(w * 0.5, h * 0.545, w * 0.58, h * 0.53); g.stroke();
  g.beginPath(); g.arc(w * 0.02, h * 0.52, w * 0.04, -0.6, 0.6); g.stroke();
  g.fillStyle = css(look.red ? V.shirtRed : V.shirt); g.fillRect(0, 0, w, h * 0.3);                // di bawah lengan kaus
  if (scr) {
    g.strokeStyle = 'rgba(170,70,55,0.42)'; g.lineWidth = 1;
    for (let i = 0; i < 4; i++) { const x = w * (0.3 + rng() * 0.4), y = h * (0.45 + rng() * 0.3); g.beginPath(); g.moveTo(x, y); g.lineTo(x + w * 0.08, y - h * 0.01); g.stroke(); }
    dirt(g, w, h, rng, 0.4);
  }
};
/** Kepalan (sarung tangan tanpa jari): punggung + pelindung buku jari, telapak + ujung jari kulit, sisi, bawah. */
export const gloveP = (kind: 'back' | 'palm' | 'side' | 'bottom', look: Look): Painter => (g, w, h, rng) => {
  fill(g, w, h, css(V.glove)); grain(g, w, h, rng, 0.08);
  g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(0, 0, w, h * 0.18); stitch(g, 0, h * 0.19, w, h * 0.19, 'rgba(255,255,255,0.14)');   // tali pergelangan
  if (kind === 'back') {
    g.fillStyle = '#3a3c40'; rrect(g, w * 0.12, h * 0.48, w * 0.76, h * 0.34, 5); g.fill();
    for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(255,255,255,0.14)'; g.beginPath(); g.ellipse(w * (0.21 + i * 0.193), h * 0.66, w * 0.07, h * 0.08, 0, 0, Math.PI * 2); g.fill(); }
  }
  if (kind === 'palm' || kind === 'bottom') {   // ruas jari terbuka (kulit) dengan sela
    const y0 = kind === 'palm' ? h * 0.55 : h * 0.35;
    g.fillStyle = css(V.finger); g.fillRect(0, y0, w, h - y0);
    g.fillStyle = 'rgba(110,55,38,0.35)'; for (let i = 1; i < 4; i++) g.fillRect((w * i) / 4 - 1, y0, 2, h - y0);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, y0, w, 2);
  }
  if (look.red) dirt(g, w, h, rng, 0.6);
  shade(g, w, h, 0.08, 0.25);
};
export const skinSw: Painter = (g, w, h, rng) => { skinBase(g, w, h, rng); roundShade(g, w, h, 0.15); };

/** Kain rok (gabardin); Merah: pudar + debu. */
const skirtFab = (g: G, w: number, h: number, rng: Rng, look: Look) => {
  fill(g, w, h, css(look.red ? V.skirtRed : V.skirt));
  g.strokeStyle = 'rgba(255,255,255,0.03)'; g.lineWidth = 1;
  for (let x = -h; x < w; x += 3) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + h, 0); g.stroke(); }
  grain(g, w, h, rng, 0.03, 1.5);
  if (look.red) {
    for (let i = 0; i < 6; i++) {
      const x = rng() * w, y = rng() * h, r = Math.min(w, h) * (0.15 + rng() * 0.25), gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,245,230,0.035)'); gr.addColorStop(1, 'rgba(255,245,230,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    dirt(g, w, h, rng, 0.55);
  }
};
/** Rok span: u keliling (depan 0.5), v kelim 0 → pinggang 1. Kup depan, jahitan samping, ritsleting belakang, belahan depan kanan
 *  (potongan alpha → kaki terlihat), kelim; Merah: tepi sobek, lubang, takik, belahan dijahit silang, goresan. */
export const skirtP = (look: Look): Painter => (g, w, h, rng) => {
  skirtFab(g, w, h, rng, look);
  const lw = Math.max(1, w / 300);
  const seam = (u: number, a = 0.42, top = 0) => {
    g.lineWidth = lw; g.strokeStyle = `rgba(0,0,0,${a})`; g.beginPath(); g.moveTo(w * u, h * top); g.lineTo(w * u, h); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.05)'; g.beginPath(); g.moveTo(w * u + lw * 1.5, h * top); g.lineTo(w * u + lw * 1.5, h); g.stroke();
  };
  seam(0.43); seam(0.57); seam(0.25, 0.3); seam(0.75, 0.3);
  g.lineWidth = lw; g.strokeStyle = 'rgba(160,160,165,0.3)'; g.setLineDash([1.5, 1.5]);           // ritsleting belakang
  g.beginPath(); g.moveTo(2, 0); g.lineTo(2, h * 0.35); g.moveTo(w - 2, 0); g.lineTo(w - 2, h * 0.35); g.stroke(); g.setLineDash([]);
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, 0, w, h * 0.06);                                // ban pinggang (di bawah sabuk)
  roundShade(g, w, h, 0.26, '0,0,0');
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.03)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  if (!look.red) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, h * 0.93, w, h * 0.07); stitch(g, 0, h * 0.93, w, h * 0.93, 'rgba(255,255,255,0.09)'); }
  // belahan depan kanan (kanan Venny = u < 0.5)
  const sx = w * 0.43, sw = w * 0.012, sh = h * 0.2;
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = lw * 1.5; g.beginPath(); g.moveTo(sx, h - sh - h * 0.03); g.lineTo(sx, h - sh); g.stroke();
  if (look.red) {
    g.strokeStyle = 'rgba(190,175,150,0.7)'; g.lineWidth = lw;
    for (let i = 0; i < 2; i++) { const y = h - sh - h * (0.015 + i * 0.035); g.beginPath(); g.moveTo(sx - w * 0.008, y - h * 0.012); g.lineTo(sx + w * 0.008, y + h * 0.012); g.moveTo(sx + w * 0.008, y - h * 0.012); g.lineTo(sx - w * 0.008, y + h * 0.012); g.stroke(); }
    g.strokeStyle = 'rgba(150,135,120,0.45)'; g.lineWidth = lw;                                       // goresan
    g.beginPath(); g.moveTo(w * 0.62, h * 0.12); g.lineTo(w * 0.65, h * 0.17); g.moveTo(w * 0.625, h * 0.1); g.lineTo(w * 0.648, h * 0.14); g.stroke();
    tear(g, w * 0.69, h * 0.3, w * 0.014, h * 0.035, rng);                                          // lubang sisi kiri
  }
  cut(g, () => { g.moveTo(sx - sw, h + 1); g.lineTo(sx, h - sh); g.lineTo(sx + sw, h + 1); g.closePath(); });
  if (look.red) ragged(g, w, h, rng, 0.05, [0.73, 0.2, 0.9], tone(V.skirtRed, 1.5));
};
/** Kaki (kulit): v pergelangan kaki → pinggul; lutut di v ≈ 0.49; Merah: lecet di lutut & tulang kering. */
export const legP = (look: Look, scr: boolean): Painter => (g, w, h, rng) => {
  skinBase(g, w, h, rng); roundShade(g, w, h, 0.15);
  const ky = h * 0.51;
  let gr = g.createRadialGradient(w * 0.5, ky, 0, w * 0.5, ky, w * 0.1);
  gr.addColorStop(0, 'rgba(255,236,222,0.2)'); gr.addColorStop(1, 'rgba(255,236,222,0)'); g.fillStyle = gr; g.fillRect(w * 0.35, ky - h * 0.06, w * 0.3, h * 0.12);
  g.strokeStyle = 'rgba(150,85,60,0.22)'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(w * 0.44, ky + h * 0.025); g.quadraticCurveTo(w * 0.5, ky + h * 0.04, w * 0.56, ky + h * 0.025); g.stroke();
  gr = g.createLinearGradient(0, h * 0.62, 0, h * 0.42); gr.addColorStop(0, 'rgba(255,236,222,0)'); gr.addColorStop(0.5, 'rgba(255,236,222,0.06)'); gr.addColorStop(1, 'rgba(255,236,222,0)');
  g.fillStyle = gr; g.fillRect(w * 0.46, h * 0.42, w * 0.08, h * 0.2);                             // kilau tulang kering
  if (scr) {
    g.fillStyle = 'rgba(176,72,60,0.32)'; g.beginPath(); g.ellipse(w * 0.48, ky - h * 0.005, w * 0.03, h * 0.012, 0.3, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(160,60,48,0.45)'; g.lineWidth = 1;
    for (let i = 0; i < 4; i++) { const x = w * (0.4 + rng() * 0.2), y = h * (0.3 + rng() * 0.15); g.beginPath(); g.moveTo(x, y); g.lineTo(x + w * 0.03, y + h * 0.008); g.stroke(); }
    dirt(g, w, h, rng, 0.5);
  }
  void look;
};
const leather = (g: G, w: number, h: number, rng: Rng) => {
  fill(g, w, h, css(V.boot)); grain(g, w, h, rng, 0.06, 1.5);
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 0.8;
  for (let i = 0; i < (w * h) / 300; i++) { const x = rng() * w, y = rng() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rng() - 0.5) * 6, y + (rng() - 0.5) * 3); g.stroke(); }
};
const bootDust = (g: G, w: number, h: number, rng: Rng, look: Look, fromTop = false) => {
  if (!look.red) return;
  const gr = fromTop ? g.createLinearGradient(0, h * 0.5, 0, 0) : g.createLinearGradient(0, h * 0.5, 0, h);
  gr.addColorStop(0, 'rgba(160,140,115,0)'); gr.addColorStop(1, 'rgba(160,140,115,0.3)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let i = 0; i < (w * h) / 260; i++) { g.fillStyle = `rgba(170,155,130,${(0.08 + rng() * 0.16).toFixed(3)})`; g.fillRect(rng() * w, rng() * h, 1.3, 1.3); }
};
const laces = (g: G, x0: number, x1: number, y0: number, y1: number, rows: number) => {
  const step = (y1 - y0) / rows;
  for (let i = 0; i < rows; i++) {
    const y = y0 + i * step;
    g.strokeStyle = '#111112'; g.lineWidth = Math.max(1.5, (x1 - x0) / 9);
    g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y + step * 0.85); g.moveTo(x1, y); g.lineTo(x0, y + step * 0.85); g.stroke();
    g.fillStyle = '#55585d'; for (const x of [x0, x1]) { g.beginPath(); g.arc(x, y, Math.max(0.8, (x1 - x0) / 14), 0, Math.PI * 2); g.fill(); }
  }
};
/** Batang bot: u keliling (depan 0.5), v bawah → atas; lidah & tali silang di depan, bantalan atas. */
export const bootShaftP = (look: Look): Painter => (g, w, h, rng) => {
  leather(g, w, h, rng);
  g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(w * 0.44, 0, w * 0.12, h);                     // lidah
  laces(g, w * 0.45, w * 0.55, h * 0.06, h * 0.95, 6);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 0, w, h * 0.06);                                   // bantalan atas
  stitch(g, 0, h * 0.08, w, h * 0.08, 'rgba(255,255,255,0.1)');
  g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(w * 0.02, h); g.quadraticCurveTo(w * 0.2, h * 0.55, w * 0.4, h * 0.6); g.stroke();
  bootDust(g, w, h, rng, look); roundShade(g, w, h, 0.3, '0,0,0');
};
/** Kaki bot: u keliling (0 = sol, 0.5 = punggung kaki), v tumit 0 → ujung 1; tali di punggung kaki, jahitan toe cap, sol. */
export const footP = (look: Look): Painter => (g, w, h, rng) => {
  leather(g, w, h, rng);
  laces(g, w * 0.45, w * 0.55, h * 0.36, h * 0.66, 3);
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.2;                                            // jahitan toe cap
  g.beginPath(); g.moveTo(w * 0.2, h * 0.35); g.quadraticCurveTo(w * 0.5, h * 0.25, w * 0.8, h * 0.35); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(w * 0.3, h * 0.05, w * 0.4, h * 0.18);          // kilap ujung
  g.fillStyle = '#121213'; g.fillRect(0, 0, w * 0.1, h); g.fillRect(w * 0.9, 0, w * 0.1, h);       // sol di tepi (u≈0/1)
  bootDust(g, w, h, rng, look, true);
};
export const soleP: Painter = (g, w, h) => {
  fill(g, w, h, '#121213'); g.fillStyle = 'rgba(255,255,255,0.08)';
  for (let x = 2; x < w; x += 6) g.fillRect(x, h * 0.3, 3, h * 0.7);
  g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, 0, w, h * 0.2);
};
export const bootStrapP: Painter = (g, w, h, rng) => {
  leather(g, w, h, rng); stitch(g, 0, 2, w, 2, 'rgba(255,255,255,0.12)'); stitch(g, 0, h - 2, w, h - 2, 'rgba(255,255,255,0.12)'); edge(g, w, h, 0.5);
};

// ───────────── ROMPI & PERLENGKAPAN
export const vestSw = (look: Look): Painter => (g, w, h, rng) => { cordura(g, w, h, rng, V.vest); if (look.red) dirt(g, w, h, rng, 0.6); shade(g, w, h, 0.1, 0.25); };
export const trimSw = (look: Look): Painter => (g, w, h) => { fill(g, w, h, css(look.red ? V.trimRed : V.trimBlue)); g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, h * 0.55, w, h * 0.45); };
/** Pelat depan: lekuk leher (potongan alpha), binding warna tim, panel velcro papan nama, MOLLE. */
export const plateFrontP = (look: Look): Painter => (g, w, h, rng) => {
  const trim = css(look.red ? V.trimRed : V.trimBlue);
  cordura(g, w, h, rng, V.vest);
  molle(g, w * 0.08, w * 0.92, h * 0.47, h * 0.05, 2, w * 0.07);
  g.fillStyle = 'rgba(255,255,255,0.06)'; rrect(g, w * 0.3, h * 0.24, w * 0.4, h * 0.15, 3); g.fill();
  if (look.red) dirt(g, w, h, rng, 0.8);
  shade(g, w, h, 0.1, 0.24);
  const bw = Math.max(3, h * 0.035), sx0 = w * 0.3, sx1 = w * 0.7, sd = h * 0.17;
  g.strokeStyle = trim; g.lineWidth = bw * 2;
  g.beginPath(); g.moveTo(0, h); g.lineTo(0, 0); g.lineTo(sx0, 0); g.quadraticCurveTo(w * 0.5, sd * 2, sx1, 0); g.lineTo(w, 0); g.lineTo(w, h); g.stroke();
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, h - bw, w, bw);
  cut(g, () => { g.moveTo(sx0 + bw, -1); g.quadraticCurveTo(w * 0.5, sd * 2 - bw * 2, sx1 - bw, -1); g.closePath(); });
};
export const plateBackP = (look: Look): Painter => (g, w, h, rng) => {
  const trim = css(look.red ? V.trimRed : V.trimBlue);
  cordura(g, w, h, rng, V.vest);
  molle(g, w * 0.1, w * 0.9, h * 0.36, h * 0.06, 4, w * 0.075);
  g.fillStyle = 'rgba(0,0,0,0.4)'; rrect(g, w * 0.38, h * 0.06, w * 0.24, h * 0.1, 3); g.fill();      // pegangan seret
  if (look.red) dirt(g, w, h, rng, 0.8);
  shade(g, w, h, 0.1, 0.24);
  const bw = Math.max(2, h * 0.035);
  g.strokeStyle = trim; g.lineWidth = bw * 2; g.beginPath(); g.moveTo(0, h); g.lineTo(0, 0); g.lineTo(w, 0); g.lineTo(w, h); g.stroke();
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, h - bw, w, bw);
};
export const cummerP = (look: Look): Painter => (g, w, h, rng) => {
  cordura(g, w, h, rng, V.vest); molle(g, 0, w, h * 0.16, h * 0.14, 3, w * 0.025);
  if (look.red) dirt(g, w, h, rng, 0.6);
  shade(g, w, h, 0.08, 0.25);
};
/** Tali bahu rompi (pita): u melintang (0..0.8 sisi luar), tepi warna tim di kedua sisi. */
export const strapP = (look: Look): Painter => (g, w, h, rng) => {
  fill(g, w, h, '#26282a'); grain(g, w, h, rng, 0.06, 1.5);
  const t = Math.max(2, w * 0.09), trim = css(look.red ? V.trimRed : V.trimBlue);
  g.fillStyle = trim; g.fillRect(0, 0, t, h); g.fillRect(w * 0.8 - t, 0, t, h); g.fillRect(w * 0.8, 0, w * 0.2, h);
  stitch(g, w * 0.28, 0, w * 0.28, h, 'rgba(255,255,255,0.12)'); stitch(g, w * 0.52, 0, w * 0.52, h, 'rgba(255,255,255,0.12)');
  if (look.red) dirt(g, w, h, rng, 0.5);
};
export const buckleP: Painter = (g, w, h) => {
  fill(g, w, h, '#1b1c1e');
  g.fillStyle = '#35383c'; rrect(g, w * 0.08, h * 0.15, w * 0.84, h * 0.7, 3); g.fill();
  g.fillStyle = '#1b1c1e'; g.fillRect(w * 0.22, h * 0.35, w * 0.56, h * 0.3);
  g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(w * 0.1, h * 0.17, w * 0.8, 1.5);
};
export const tapeP: Painter = (g, w, h) => {
  fill(g, w, h, '#141516');
  g.strokeStyle = '#e8eaec'; g.lineWidth = Math.max(1.5, h * 0.06); rrect(g, h * 0.12, h * 0.12, w - h * 0.24, h * 0.76, h * 0.1); g.stroke();
  g.fillStyle = '#f4f5f6'; g.font = `bold ${Math.round(h * 0.52)}px "Arial Black", Arial, Helvetica, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  (g as unknown as { letterSpacing: string }).letterSpacing = `${Math.round(h * 0.05)}px`;
  g.fillText('VENNY', w / 2, h * 0.54);
};
export const blackSw = (c: string): Painter => (g, w, h, rng) => { fill(g, w, h, c); grain(g, w, h, rng, 0.06); shade(g, w, h, 0.1, 0.25); };
export const magPouchP = (look: Look): Painter => (g, w, h, rng) => {
  cordura(g, w, h, rng, V.vest);
  g.fillStyle = 'rgba(0,0,0,0.38)'; rrect(g, 1, 1, w - 2, h * 0.3, 3); g.fill();
  g.fillStyle = '#1d1e20'; rrect(g, w * 0.38, h * 0.22, w * 0.24, h * 0.14, 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(2, h * 0.62, w - 4, h * 0.1);
  if (look.red) dirt(g, w, h, rng, 0.8);
  shade(g, w, h, 0.1, 0.28);
};
export const grenadeP: Painter = (g, w, h) => {
  fill(g, w, h, '#56612f');
  g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1.5;
  for (let x = w / 8; x < w; x += w / 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = h / 5; y < h; y += h / 5) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
};
export const metalP: Painter = (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#c4c8cd'); gr.addColorStop(1, '#5d6268'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
};
export const beltP = (look: Look): Painter => (g, w, h, rng) => {
  fill(g, w, h, '#141516'); grain(g, w, h, rng, 0.07);
  g.fillStyle = 'rgba(255,255,255,0.03)'; for (let x = 0; x < w; x += 3) g.fillRect(x, 0, 1, h);
  stitch(g, 0, h * 0.2, w, h * 0.2, 'rgba(255,255,255,0.12)'); stitch(g, 0, h * 0.62, w, h * 0.62, 'rgba(255,255,255,0.12)');
  if (look.red) { const t = Math.max(2, h * 0.12); g.fillStyle = css(V.trimRed); g.fillRect(0, 0, w, t); g.fillRect(0, h * 0.8 - t, w, t); }
};
export const beltBuckleP: Painter = (g, w, h) => {
  fill(g, w, h, '#1e2023');
  g.fillStyle = '#393c41'; rrect(g, w * 0.06, h * 0.1, w * 0.88, h * 0.8, 3); g.fill();
  g.fillStyle = '#1e2023'; rrect(g, w * 0.2, h * 0.3, w * 0.6, h * 0.4, 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(w * 0.08, h * 0.12, w * 0.84, 1.5);
};
export const pouchP = (c: string, button: boolean, look: Look): Painter => (g, w, h, rng) => {
  fill(g, w, h, c); grain(g, w, h, rng, 0.07);
  g.fillStyle = 'rgba(0,0,0,0.32)'; rrect(g, 1, 1, w - 2, h * 0.4, 4); g.fill();
  if (button) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(w / 2, h * 0.3, Math.max(1.5, w * 0.07), 0, Math.PI * 2); g.fill(); }
  else { g.fillStyle = '#45484d'; g.fillRect(w * 0.4, h * 0.28, w * 0.2, h * 0.1); }
  stitch(g, 3, h * 0.42, w - 3, h * 0.42, 'rgba(255,255,255,0.12)');
  if (look.red) dirt(g, w, h, rng, 0.8);
  shade(g, w, h, 0.1, 0.25);
};
export const holsterP = (look: Look): Painter => (g, w, h, rng) => {
  fill(g, w, h, '#1b1c1f'); grain(g, w, h, rng, 0.06);
  g.fillStyle = 'rgba(255,255,255,0.09)'; rrect(g, w * 0.08, h * 0.04, w * 0.84, h * 0.3, 4); g.fill();
  g.fillStyle = '#3c3f44'; rrect(g, w * 0.3, h * 0.12, w * 0.4, h * 0.1, 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1; g.beginPath(); g.moveTo(w * 0.15, h * 0.45); g.lineTo(w * 0.15, h * 0.92); g.lineTo(w * 0.8, h * 0.92); g.stroke();
  if (look.red) { g.strokeStyle = css(V.trimRed); g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3); }
  shade(g, w, h, 0.1, 0.28);
};
export const platformP = (look: Look): Painter => (g, w, h, rng) => {
  fill(g, w, h, '#1a1b1e'); grain(g, w, h, rng, 0.08);
  for (let y = 6; y < h - 4; y += 9) { g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(3, y, w - 6, 4); }
  if (look.red) { g.strokeStyle = css(V.trimRed); g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3); }
};
export const gripP: Painter = (g, w, h, rng) => {
  fill(g, w, h, '#232428');
  for (let i = 0; i < (w * h) / 6; i++) { g.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.06)'; g.fillRect(Math.floor(rng() * w), Math.floor(rng() * h), 1, 1); }
};
export const webStrapP = (look: Look): Painter => (g, w, h, rng) => {   // tali paha / gantungan: u melintang, v memanjang
  fill(g, w, h, '#18191b'); grain(g, w, h, rng, 0.07);
  if (look.red) { g.fillStyle = css(V.trimRed); g.fillRect(0, 0, Math.max(2, w * 0.08), h); g.fillRect(w * 0.8 - Math.max(2, w * 0.08), 0, Math.max(2, w * 0.08), h); }
  else { stitch(g, w * 0.1, 0, w * 0.1, h, 'rgba(255,255,255,0.12)'); stitch(g, w * 0.7, 0, w * 0.7, h, 'rgba(255,255,255,0.12)'); }
};
export const headsetP: Painter = (g, w, h, rng) => {
  fill(g, w, h, '#16171a'); grain(g, w, h, rng, 0.06);
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.arc(w / 2, h * 0.5, w * 0.3, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#25272b'; g.beginPath(); g.arc(w / 2, h * 0.5, w * 0.2, 0, Math.PI * 2); g.fill();
};
export const bandanaP: Painter = (g, w, h, rng) => {
  fill(g, w, h, css(V.bandana)); grain(g, w, h, rng, 0.05, 1.5);
  const n = Math.max(4, Math.round((w * h) / 170));
  for (let i = 0; i < n; i++) {
    const x = rng() * w, y = rng() * h, r = 2 + rng() * 3.2, a = rng() * Math.PI * 2;
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = 'rgba(70,12,16,0.55)'; g.beginPath(); g.ellipse(0, 0, r, r * 0.62, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(226,150,145,0.4)'; g.lineWidth = 1; g.beginPath(); g.arc(r * 0.2, 0, r * 0.75, 0.4, Math.PI * 1.7); g.stroke();
    g.fillStyle = 'rgba(230,160,150,0.4)'; g.fillRect(r * 1.1, -0.6, 1.2, 1.2);
    g.restore();
  }
  g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 2;
  for (let i = 0; i < 4; i++) { const y = rng() * h; g.beginPath(); g.moveTo(0, y); g.quadraticCurveTo(w / 2, y + 5, w, y - 2); g.stroke(); }
  shade(g, w, h, 0.06, 0.2);
};
export const bandolierP: Painter = (g, w, h, rng) => {   // sabuk peluru (pita): webbing zaitun gelap
  fill(g, w, h, '#2c2e24'); grain(g, w, h, rng, 0.06);
  stitch(g, w * 0.08, 0, w * 0.08, h, 'rgba(255,255,255,0.15)'); stitch(g, w * 0.72, 0, w * 0.72, h, 'rgba(255,255,255,0.15)');
  g.fillStyle = 'rgba(0,0,0,0.35)'; for (let y = 0; y < h; y += 6) g.fillRect(0, y, w * 0.8, 2);   // lingkar pengikat peluru
};
export const brassP: Painter = (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#8f6a2a'); gr.addColorStop(0.45, css(COL.red.brass)); gr.addColorStop(1, '#7d5c22');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = '#6b4a1e'; g.fillRect(0, 0, w, h * 0.28);   // ujung proyektil (v atas = ujung tabung)
};
export const gauzeP: Painter = (g, w, h, rng) => {
  fill(g, w, h, css(V.bandage)); grain(g, w, h, rng, 0.06, 1.5);
  g.fillStyle = 'rgba(255,255,255,0.12)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  const step = Math.max(6, h * 0.55);
  for (let x = -h; x < w + h; x += step) {
    g.strokeStyle = 'rgba(92,72,52,0.42)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, h); g.lineTo(x + h * 0.7, 0); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.beginPath(); g.moveTo(x + 2, h); g.lineTo(x + h * 0.7 + 2, 0); g.lineTo(x + h * 0.7 + 5, 0); g.lineTo(x + 5, h); g.closePath(); g.fill();
  }
  dirt(g, w, h, rng, 1.1);
  shade(g, w, h, 0.08, 0.22);
};
export const sheathP: Painter = (g, w, h, rng) => {
  fill(g, w, h, '#2a2d25'); grain(g, w, h, rng, 0.08);
  g.fillStyle = 'rgba(255,255,255,0.1)'; for (const y of [0.15, 0.5, 0.8]) { g.beginPath(); g.arc(w * 0.5, h * y, 1.6, 0, Math.PI * 2); g.fill(); }
  dirt(g, w, h, rng, 0.6);
};
export const canisterP: Painter = (g, w, h, rng) => {
  fill(g, w, h, '#3c4632'); grain(g, w, h, rng, 0.07);
  g.fillStyle = '#9aa08a'; g.fillRect(0, h * 0.42, w, h * 0.1); g.fillStyle = '#22261e'; g.fillRect(0, h * 0.86, w, h * 0.14);
};
