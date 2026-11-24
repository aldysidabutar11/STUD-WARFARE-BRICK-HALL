// src/combat/Slots.ts — logika slot senjata murni (tanpa Three/Rapier → mudah diuji):
// 1 = senjata utama ('ar'), 2 = pisau, 3 = granat K-400; Q = senjata sebelumnya; scroll = siklus 1 → 2 → 3.
// Permintaan pengguna (bukan GDD; GDD §8 memakai G/4 untuk granat & Q untuk tukar bahu).

export type Slot = 'ar' | 'knife' | 'grenade';
/** Benda di tangan untuk animasi/tampilan ('none' = tangan kosong sesaat setelah granat dilempar). */
export type Held = Slot | 'none';
export interface SlotAvail { ar: boolean; knife: boolean; grenade: boolean }

export const SLOT_ORDER: readonly Slot[] = ['ar', 'knife', 'grenade'];

/** Ketersediaan slot: senjata utama hanya bila masih dipegang (belum dibuang), granat bila stok ≥ 1. */
export function slotAvail(hasPrimary: boolean, grenades: number): SlotAvail {
  return { ar: hasPrimary, knife: true, grenade: grenades >= 1 };
}

/**
 * Tujuan tombol "senjata sebelumnya" (Q): slot sebelumnya bila masih tersedia; bila tidak (mis. granat sudah habis atau
 * senjata utama dibuang) → tukar senapan ↔ pisau; dari granat → senapan (atau pisau). null = tidak ada tujuan.
 */
export function quickSwitchTarget(cur: Slot, prev: Slot | null, av: SlotAvail): Slot | null {
  if (prev && prev !== cur && av[prev]) return prev;
  if (cur === 'grenade') return av.ar ? 'ar' : av.knife ? 'knife' : null;
  const other: Slot = cur === 'ar' ? 'knife' : 'ar';
  if (av[other]) return other;
  return av.grenade ? 'grenade' : null;
}

/** Scroll: slot berikutnya/sebelumnya yang tersedia (melingkar). */
export function cycleTarget(cur: Slot, dir: 1 | -1, av: SlotAvail): Slot | null {
  let i = SLOT_ORDER.indexOf(cur);
  for (let k = 0; k < SLOT_ORDER.length - 1; k++) {
    i = (i + dir + SLOT_ORDER.length) % SLOT_ORDER.length;
    if (av[SLOT_ORDER[i]]) return SLOT_ORDER[i];
  }
  return null;
}

/** Setelah granat dilempar/meledak: kembali ke slot sebelum granat (pisau bila senjata utama sudah dibuang). */
export function returnSlot(prev: Slot | null, hasPrimary: boolean): 'ar' | 'knife' {
  return prev === 'knife' || !hasPrimary ? 'knife' : 'ar';
}

/** Senjata yang dibuang hanya bisa diambil/ditukar oleh tim sendiri. */
export const canPickUp = (team: string, dropTeam: string) => team === dropTeam;

/** Benda di tangan dari keadaan slot + state granat. */
export function heldOf(slot: Slot, hasPrimary: boolean, grenadeState: string): Held {
  if (slot === 'grenade') return grenadeState === 'THROWN' ? 'none' : 'grenade';
  if (slot === 'ar') return hasPrimary ? 'ar' : 'none';
  return 'knife';
}
