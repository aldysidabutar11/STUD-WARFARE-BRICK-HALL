// src/combat/Slots.ts — logika slot senjata murni (tanpa Three/Rapier → mudah diuji):
// 1 = senjata utama ('ar'), 2 = pistol, 3 = pisau, 4 = granat K-400, 5 = flashbang; Q = senjata sebelumnya; scroll = siklus 1 → 5.
// Permintaan pengguna (bukan GDD; GDD §8 memakai G/4 untuk granat & Q untuk tukar bahu). Slot pistol: ekspansi senjata 2026-11-25.

export type Slot = 'ar' | 'pistol' | 'knife' | 'grenade' | 'flash';
/** Benda di tangan untuk animasi/tampilan ('none' = tangan kosong sesaat setelah granat dilempar). */
export type Held = Slot | 'none';
export interface SlotAvail { ar: boolean; pistol: boolean; knife: boolean; grenade: boolean; flash: boolean }

export const SLOT_ORDER: readonly Slot[] = ['ar', 'pistol', 'knife', 'grenade', 'flash'];

/** Slot benda lempar (state machine granat: K-400 / flashbang). */
export const isThrowable = (s: Slot | Held): s is 'grenade' | 'flash' => s === 'grenade' || s === 'flash';
/** Slot senjata api (senjata utama / pistol): menembak, ADS, reload, mode tembak. */
export const isGunSlot = (s: Slot | Held): s is 'ar' | 'pistol' => s === 'ar' || s === 'pistol';

/** Ketersediaan slot: senjata utama hanya bila masih dipegang (belum dibuang), granat / flashbang bila stok ≥ 1. */
export function slotAvail(hasPrimary: boolean, grenades: number, flashes = 0): SlotAvail {
  return { ar: hasPrimary, pistol: true, knife: true, grenade: grenades >= 1, flash: flashes >= 1 };
}

/**
 * Tujuan tombol "senjata sebelumnya" (Q): slot sebelumnya bila masih tersedia; bila tidak → senjata api lain (utama ↔ pistol),
 * lalu pisau; dari granat → senjata utama / pistol / pisau. null = tidak ada tujuan.
 */
export function quickSwitchTarget(cur: Slot, prev: Slot | null, av: SlotAvail): Slot | null {
  if (prev && prev !== cur && av[prev]) return prev;
  const order: readonly Slot[] = isThrowable(cur) ? ['ar', 'pistol', 'knife']
    : cur === 'ar' ? ['pistol', 'knife'] : cur === 'pistol' ? ['ar', 'knife'] : ['ar', 'pistol'];
  for (const s of order) if (av[s]) return s;
  return av.grenade && cur !== 'grenade' ? 'grenade' : av.flash && cur !== 'flash' ? 'flash' : null;
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

/** Setelah granat dilempar/meledak: kembali ke slot sebelum granat (pistol bila senjata utama sudah dibuang). */
export function returnSlot(prev: Slot | null, hasPrimary: boolean): 'ar' | 'pistol' | 'knife' {
  if (prev === 'knife' || prev === 'pistol') return prev;
  return hasPrimary ? 'ar' : 'pistol';
}

/** Senjata yang dibuang hanya bisa diambil/ditukar oleh tim sendiri. */
export const canPickUp = (team: string, dropTeam: string) => team === dropTeam;

/** Benda di tangan dari keadaan slot + state granat. */
export function heldOf(slot: Slot, hasPrimary: boolean, grenadeState: string): Held {
  if (isThrowable(slot)) return grenadeState === 'THROWN' ? 'none' : slot;
  if (slot === 'ar') return hasPrimary ? 'ar' : 'none';
  return slot;
}
