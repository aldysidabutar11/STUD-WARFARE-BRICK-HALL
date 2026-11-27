// src/entities/specCam.ts — kamera menonton rekan (mode ronde; bukan GDD, disetujui pengguna 2026-11-27): memilih sudut lengan TPS
// yang bebas di sekeliling rekan. Laporan pengguna: setelah mati, layar "menonton" menampilkan pilar/pojok tanpa badan rekan —
// rekan membelakangi dinding/pilar/peti membuat spring arm §9.2 memendek ke 0.6 u (di DALAM kapsul berjari-jari 0.8).
// Murni & tanpa alokasi: panjang lengan bebas per sudut dari fungsi `free` (CameraRig.armFree → sphere cast spring arm).

export interface SpecCamCfg {
  want: number; keep: number; eye: number; offsetsDeg: readonly number[]; backAfter: number; stayBonus: number;
}
/** off = sudut lengan relatif arah hadap rekan (rad; 0 = di belakang bahu seperti biasa); eye = tampilan dari mata rekan. */
export interface SpecCamState { off: number; eye: boolean; backT: number }

export const newSpecCam = (): SpecCamState => ({ off: 0, eye: false, backT: 0 });

export function resetSpecCam(s: SpecCamState) { s.off = 0; s.eye = false; s.backT = 0; }

const D2R = Math.PI / 180;

/**
 * Satu keputusan per frame. free(off) = panjang lengan kamera (u) bila kamera diputar `off` rad dari arah hadap rekan.
 *  - sudut sekarang dipertahankan selama lengan ≥ keep (histeresis terhadap want);
 *  - terhalang → sudut pertama menurut urutan offsetsDeg (selisih terkecil dulu) dengan lengan ≥ want;
 *  - tak ada → sudut terpanjang (sudut sekarang mendapat bonus stayBonus agar tidak berkedip di antara dua sudut setara);
 *    bila itu pun < eye → tampilan mata, bertahan sampai ada arah ≥ want;
 *  - sudut ≠ 0 kembali ke belakang rekan setelah arah 0 bebas (≥ want) terus-menerus selama backAfter detik.
 */
export function stepSpecCam(s: SpecCamState, free: (off: number) => number, dt: number, c: SpecCamCfg): void {
  if (!s.eye && s.off !== 0) {
    if (free(0) >= c.want) {
      s.backT += dt;
      if (s.backT >= c.backAfter) { s.off = 0; s.backT = 0; return; }
    } else s.backT = 0;
  }
  const cur = s.eye ? -1 : free(s.off);
  if (cur >= c.keep) return;
  let best = s.off, bestD = cur, score = cur + c.stayBonus;
  for (let i = 0; i < c.offsetsDeg.length; i++) {
    const off = c.offsetsDeg[i] * D2R;
    if (!s.eye && off === s.off) continue;                 // sudah diukur
    const d = free(off);
    if (d >= c.want) { s.off = off; s.eye = false; s.backT = 0; return; }
    if (d > score) { best = off; bestD = d; score = d; }
  }
  if (s.eye) return;                                       // tampilan mata bertahan sampai ada arah ≥ want
  if (bestD >= c.eye) {
    if (best !== s.off) s.backT = 0;
    s.off = best;
  } else { s.off = 0; s.eye = true; s.backT = 0; }
}
