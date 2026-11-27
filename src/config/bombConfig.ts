// src/config/bombConfig.ts — SUMBER KEBENARAN mode Bomb Mission (dokumen pengguna "Blueprint Map Meridian Vault & Mode Bomb
// Mission" §8.1; bukan GDD). Zona bom per map ada di MapDef.bombSites (Meridian Vault: layout.ts MV_SITES).
export const BOMB_CFG = {
  match: {
    winRounds: 5,               // first to 5 ronde
    halfTimeRound: 4,           // tukar sisi setelah ronde ke-4 (maks 9 ronde)
    freezeTime: 5.0,            // detik persiapan awal ronde (gerak terkunci; L = loadout)
    roundTime: 120.0,           // durasi ronde sebelum C4 ditanam
    roundEndDelay: 5.0,         // jeda pasca-ronde sebelum ronde berikutnya
    halftimeDelay: 4.0,         // tambahan jeda banner "TUKAR SISI" setelah ronde ke-4
  },
  c4: {
    plantTime: 4.0,             // detik menahan E di zona A/B
    defuseTime: 5.0,            // detik menahan E pada C4 tertanam
    fuseTime: 40.0,             // detik hingga meledak setelah tertanam
    pickupRadius: 2.2,          // penyerang yang lewat memungut C4 jatuh otomatis
    defuseRadius: 3.0,          // jarak maks penjinak ke C4
    defuseMaxAngleDeg: 60,      // sudut hadap maks ke C4 saat menjinakkan
    plantAudibleRange: 25.0,    // bunyi keypad (bot & audio)
    defuseAudibleRange: 20.0,   // bunyi mulai menjinakkan
    beepMaxDist: 55.0,          // jarak panner beep C4
    keypadEvery: 0.5,           // interval bunyi keypad saat menanam
    blastMaxDamage: 250,        // damage puncak ledakan
    blastRadius: 32.0,          // radius total (mematikan ≤ 24.8 u)
    beepIntervals: [
      { aboveSec: 20, interval: 1.0 },
      { aboveSec: 10, interval: 0.5 },
      { aboveSec: 3, interval: 0.25 },
      { aboveSec: 0, interval: 0.12 },
    ],
    /** C4 jatuh di luar pijakan terjangkau (mis. di atas pagar / jatuh ke celah) → dipindah ke node nav terdekat setelah diam ini. */
    unreachableAfter: 1.5,
  },
  score: { plant: 200, defuse: 200 },
  /** Penyerang babak pertama (dokumen: Merah/Rebels dari Barat Laut). */
  firstAttackers: 'red' as 'red' | 'blue',
} as const;
