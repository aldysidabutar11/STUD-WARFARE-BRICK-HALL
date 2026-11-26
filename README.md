# Stud Warfare: Brick Hall

Shooter hybrid FPS/TPS bergaya blocky klasik — TypeScript + Vite + Three.js + Rapier3D + Web Audio (100% prosedural, tanpa file aset).
Spesifikasi: GDD v2.0 (dokumen privat, tidak disertakan di repo ini). Catatan implementasi & keputusan: `CLAUDE.md`.

## Menjalankan

```bash
npm install
npm run dev        # buka http://localhost:5173
```

Klik **Main** → pilih map & mode → **Mulai**, lalu klik layar untuk mengunci mouse. Untuk performa terbaik di laptop Iris Xe: colok charger,
Power mode = Best performance, Chrome/Edge terbaru dengan hardware acceleration (cek `chrome://gpu` → WebGL2 *Hardware accelerated*).
Bila masih berat: Pengaturan → Grafik → preset LOW atau Skala resolusi 70–85%. Di layar 90/120/144 Hz, F3 menampilkan % frame
tepat waktu; bila preset berat tidak stabil di refresh penuh, pilih **Batas FPS ½ layar** (frame rata) — resolusi otomatis menyesuaikan.

| Perintah | Fungsi |
| :--- | :--- |
| `npm run test` | Test vector GDD §16.1 + validator map/nav + logika fitur (rebind, settings, Eliminasi, medali, slot senjata & pisau, room & jaringan, perilaku bot) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` / `npm run preview` | Build produksi & pratinjau |

## Mode

- **Team Deathmatch** — 5v5 vs bot, respawn 4 s; target kill 25/50/75/100 & batas waktu 5–20 menit (default GDD: 50 kill / 10:00).
  Tiga map: **Brick Hall** (perpustakaan dalam ruang), **Steel Yard** (halaman kontainer di gurun) & **Boston** (kantor 2 lantai)
  — lihat **Memilih map** di bawah.
- **Eliminasi** — tanpa respawn dalam ronde 2:00; yang mati menonton rekan (klik kiri/Spasi ganti rekan); menang 3/4/5/7 ronde.
- **Main Bareng (Room)** — main online dengan teman: buat room (kode + link), 2 tim × 5 slot, slot kosong diisi bot, pindah tim,
  siap, setelan host (map, TDM / Eliminasi). Lihat **Main Bareng online** di bawah.
- **Latihan Menembak** — di map pilihanmu: 12 dummy termasuk 2 target bergerak (Brick Hall: jembatan 10/40/70 u, lantai dasar,
  mezanin; Steel Yard: tersebar 15–70 u dari gerbang Biru; Boston: kedua lantai — Veranda, Ruang Kaca, Pantry, Garden Lounge,
  Jalur Sofa), amunisi & granat tak terbatas, angka damage.

## Bot

Bot memakai aturan yang sama dengan pemain (gerak, spread, recoil) dan hanya tahu posisimu lewat penglihatan & pendengaran
(tidak tembus dinding). Perilakunya dibuat mirip pemain manusia:

- **Bidikan** — menoleh cepat lalu melambat di dekat target (kadang sedikit kelewatan lalu dikoreksi), bukan berputar kaku seperti
  turret; tembakan awal bisa meleset lalu makin akurat; bidikannya tertinggal saat kamu strafe/lompat; goyah sesaat saat kena
  tembak atau saat peluru lewat dekat kepalanya.
- **Bertempur** — geser–berhenti–tembak (Normal/Sulit), baku tembak dari balik cover (sembunyi ↔ intip), reload di balik cover,
  lari menjauh dari granat, dan bila ditembak dari arah yang tidak terlihat hanya tahu arahnya kira-kira → menoleh / cari cover.
- **Patroli & tim** — melirik sudut & pintu yang baru terbuka, jalan (tidak sprint) di wilayah lawan, sesekali berhenti di
  persimpangan, dan saling memberi info posisi musuh dengan jeda (maks. 2 rekan terdekat datang membantu, tidak menumpuk).
- **Tingkat kesulitan** (Atur Match → Mudah / Normal / Sulit) mengatur reaksi, akurasi, kecepatan menoleh, dll.

## Memilih map

- **Main sendiri / Latihan** — **Main → Atur Match → bagian MAP**: kartu **Brick Hall**, **Steel Yard**, **Boston**, atau **Acak** (diundi tiap
  match dimulai). Setiap kartu menampilkan denah mini (Biru kiri, Merah kanan), jenis & ukuran map. Klik kartu = langsung tersimpan dan
  map dimuat di belakang menu (layar "Memuat map…" sebentar), jadi latar menu sekaligus pratinjau map. Tombol **Latihan Menembak** di
  menu utama memakai map yang sama (namanya tertulis di tombol). **Main Lagi** / **Ulangi** = map yang sama dengan match tadi.
- **Main Bareng** — hanya **host** yang memilih map (kartu kecil di *Setelan host*); teman melihat pilihan host dan map ikut dimuat di
  perangkat mereka. "Acak" diundi oleh host saat **Mulai** — semua pemain selalu main di map yang sama.
- Ganti map tidak perlu memuat ulang halaman (penting untuk room online). Uji cepat: `?map=steelyard` (atau `brickhall`, `boston`) di URL.

## Map: Brick Hall (v2)

Perpustakaan dua lantai 60 × 100 u: jembatan kembar di lantai 2, rotunda bertiang dengan menara jam di tengah, tangga 35° di keempat sudut.

- **Spawn di dua lantai** — tiap tim punya ruang spawn atas (lantai 2) dan ruang spawn bawah (lantai 1). Setiap respawn memilih
  lantai secara acak, lalu slot yang paling jauh dari musuh yang bisa melihatnya (pindah ke lantai lain bila semua slot terisi).
- **Kantong & jalur** — arsip di bawah balkon (lemari zig-zag, pintu ke aula), rak tinggi 2 lantai di tengah & tiap kuadran, lemari katalog
  di rotunda yang memotong garis tembak sepanjang jembatan, dinding depan markas dengan dua pintu + jendela intip.
- **Identitas & orientasi** — sisi Selatan biru / Utara merah (panel, karpet, spanduk, lentera), ikon di puncak rak tinggi
  (Bola Dunia, Teleskop, Ksatria, Jam Pasir), dan nama area di bawah radar (mis. *Jembatan Barat · Biru*, *Arsip Timur · Merah*, *Aula Ksatria*).

## Map: Steel Yard

Halaman kontainer terbengkalai di gurun, satu lantai, luar ruang, 84 × 112 u (±30 × 40 m) di dalam pagar tiang kayu bertutup terpal
(tinggi 9 u, tidak bisa keluar). Denah orisinal & simetris 4 kuadran — Biru di dua sudut Selatan, Merah di dua sudut Utara.

- **Spawn** — 5 slot di tiap sudut, terlindung kontainer gerbang yang sedikit miring; tiap sudut punya 2 jalan keluar dan tidak ada
  garis pandang langsung ke spawn musuh.
- **Empat jalur** — *Sayap* (Lorong Kontainer terbuka dua ujung di sepanjang pagar, pelataran terbuka di sampingnya → Tumpukan Palet →
  Pos Jaga), *Dalam* (Bangkai Mobil → Tengah → gang Pos Jaga), *Tengah* (Lorong Tengah ber-pintu terbuka → Gudang Spool → Menara Kontainer
  2 × 2 tumpuk dua di pusat), *Apit* (sisi timur Bangkai Mobil → samping Lorong Tengah). Garis tengah hanya bisa diseberangi di 4 titik;
  pelindung tinggi (kontainer) & rendah (palet, barrier beton, spool, drum, peti) tersebar cukup lega untuk berlari — dari mana pun
  pelindung terdekat ≤ ±9 u. Jarak pandang khas ±25 u (setara Brick Hall), tanpa koridor sniper panjang.
- **Detail** — 22 kontainer 10/20/40 kaki (bergelombang, pintu dengan batang pengunci, berkarat & berdebu; sebagian terbuka, miring,
  bertumpuk), 4 bangkai sedan berdebu (ban kempes, kaca pecah), palet, spool kabel, peti, drum, ban, tumpukan terpal, genangan air
  yang memantulkan langit, pagar terpal kendur yang sobek di beberapa tempat + dua bentang panel seng. Di luar pagar: tumpukan
  kontainer, gantry crane, gudang seng, tiang lampu sorot, bukit pasir, mesa bertingkat & pegunungan di cakrawala, langit berawan
  dengan matahari sore dari Barat (adil untuk kedua tim).
- **Suara & efek** — langkah di pasir/beton, logam (dalam/atas kontainer, mobil), kayu (palet, peti), kain (terpal); percikan peluru
  & pantulan granat mengikuti permukaannya. Nama area di bawah radar, mis. *Lorong Kontainer Barat · Biru*, *Bangkai Mobil Timur · Merah*,
  *Menara Kontainer*, *Pos Jaga Barat*.

## Map: Boston

Kantor dua lantai 52 × 76 u (±19 × 27 m), dalam ruang, **asimetris vertikal**: Biru spawn di **Lantai 4** (atas), Merah di
**Lantai 3** (bawah). Adaptasi dokumen desain "Blueprint Map Boston" (layout orisinal dari kantor sendiri, bukan replika map game lain).

- **Lantai 4** — *Spawn Biru* (ruang kerja ber-AC di balik kaca lipat frosted tahan peluru, 4 pintu), *The Veranda* (teras
  semi-terbuka 76 u: tegel motif vintage, plafon kayu, pilar H-beam, krey bambu yang bisa ditembus peluru, kota sore di luar pagar),
  *Ruang Kaca* (kantor terbuka: meja kerja, kubikel), *Lorong Barat* (puncak Tangga Cokelat), *Pantry* (konter, kulkas, meja makan,
  dinding tanaman).
- **Lantai 3** — *Garden Lounge* (aula tempur: pilar putih, 4 cincin tanaman rambat gantung, Standing TV, meja marmer, dinding loker
  motif wajik, konter kafe, resepsionis "BOSTON"), *Jalur Sofa* (jendela tinggi berkrey, 3 sofa booth oranye/kuning/hijau),
  *Spawn Merah* (ruang rapat di balik kaca geser frosted, 3 pintu), *Koridor Barat* (pintu samping Merah → kaki Tangga Cokelat).
- **Tiga konektor** — *Tangga Cokelat* berbentuk L (bordes di tengah, Barat), *Tangga Servis* lurus berdinding beton (dari pintu
  "STAIRS" Spawn Biru turun ke Lounge Utara), dan *Void* satu arah: lompati pagar Veranda → mendarat di kabinet setinggi 4 →
  lantai Lounge, **tanpa fall damage** (lompat langsung ke lantai = kena damage jatuh). Bot Sulit juga memakai jalur ini.
- **Kaca yang bisa dipecahkan** — 3 panel kaca bening di antara Ruang Kaca & Veranda (60 HP: ±2 peluru senapan, atau 1 granat
  K-400 di dekatnya) → serpihan + bunyi pecah, membuka jalan & garis tembak baru (bot ikut memakainya setelah pecah). Kaca frosted
  spawn & jendela luar **tahan peluru**. Panel kembali utuh tiap ronde Eliminasi / match baru; online: host yang menentukan.
- **Seimbang** — jarak jalur ke titik kontak utama hampir sama untuk kedua tim (puncak Tangga Cokelat & Lounge Utara ±1–3%),
  tidak ada garis pandang dari luar ke slot spawn mana pun, radar menampilkan **lantai tempatmu berdiri** saja.
- **Benda kantor** — 64 benda fisika (16 laptop, 24 tumbler, 24 kursi) yang terpental kena peluru/ledakan (tidak menghalangi gerak).
  Langkah & pantulan mengikuti permukaan: tegel, karpet (Ruang Kaca), kayu (Tangga Cokelat), beton, kaca, logam, kain sofa.

## Grafik

Gaya blocky tetap, tapi pencahayaan & material dibuat realistis (semua prosedural, tanpa file gambar):
tone mapping ala film, cahaya skylight & jendela yang "dipanggang" (sudut & kolong rak gelap alami, cahaya pantul hangat),
kabut tipis, material PBR dengan stud/nat/serat timbul (normal map prosedural), pantulan lantai & logam, berkas cahaya + debu melayang,
kepulan debu saat peluru kena permukaan. Preset: **LOW** · **MEDIUM** (laptop Iris Xe, 60 fps) · **HIGH** (+ bloom, grading, kilat
moncong) · **ULTRA** (+ SSAO, MSAA, bayangan 4096 — untuk GPU kuat). Tiap efek bisa dimatikan di Pengaturan → Grafik.
Steel Yard di laptop Iris Xe (MEDIUM, 10 karakter): ±90 FPS (terkunci ke layar 90 Hz), GPU ±6.4 ms, maks ±116 draw call / 135 ribu segitiga.
Boston (MEDIUM, TDM): ±90 FPS (11.1 ms, p95 12.1), maks ±130 draw call / 109 ribu segitiga; HIGH ±90 FPS dengan resolusi dinamis 0.9.

## Kontrol utama (bisa diubah di menu Kontrol)

WASD gerak · Shift sprint · C jongkok · Space lompat · Klik kiri tembak / tebas pisau / masak granat → lempar jauh ·
Klik kanan ADS / serangan berat jarak dekat / masak granat → gelinding · **1 senjata utama · 2 pistol · 3 pisau · 4 granat K-400 · 5 flashbang ·
Q senjata sebelumnya** · scroll ganti senjata ·
G buang senjata utama · E ambil/tukar senjata tim · R reload · F pukul (melee) · B mode tembak · V FPS/TPS · X tukar bahu · Tab skor · L loadout ·
**Y chat semua · U chat tim · H pesan cepat (lalu 1–6) · tahan T voice tim · tahan Z voice semua** · Esc pause · F3 statistik · ` debug.

**Gamepad** (layout standar): stik kiri/kanan gerak/bidik · RT/LT tembak/ADS (pisau: tebas/tusuk) · A lompat · B jongkok · X reload (dekat senjata tim:
ambil/tukar) · Y senjata sebelumnya (utama ↔ pistol) · RB granat · LB mode tembak · L3 sprint · R3 pukul · D-pad ↑ FPS/TPS · → tukar bahu · ↓ pisau ·
← loadout ·
View skor · Menu pause. RB dua kali cepat = flashbang. Menu bisa dinavigasi dengan D-pad + A/B.

Setelan tombol lama dimigrasi otomatis (hanya tombol yang masih bawaan): Q "senjata sebelumnya", tukar bahu ke X, G buang senjata; sejak ada
pistol, angka bergeser satu: pisau 2 → 3, granat 3 → 4, flashbang 4 → 5, dan 2 jadi pistol.

## Granat & garis lintasan

- **Lempar jauh (klik kiri) 34 u/s**: bidik lurus → jatuh ±28 u, bidik ke lantai 20 u di depan → ±16.5 u, lambungan terjauh ±47 u.
  **Gelinding (klik kanan)** tetap pendek untuk menyelipkan granat ke balik sudut / menuruni tangga. Tahan tombol = memasak (sumbu jalan).
- **Garis lintasan**: selama memegang granat / flashbang tampil titik-titik lintasan + **cincin di titik jatuh pertama** (oranye = K-400,
  putih kebiruan = flashbang); saat dimasak terlalu lama untuk sampai, ujungnya berubah jadi penanda **meledak di udara**. Garis dihitung
  dengan fisika yang sama persis dengan granat sungguhan (pantulan sesudahnya tidak ditampilkan; badan karakter yang lewat diabaikan).
  Bagian yang tertutup peti/badan sendiri tetap terlihat samar. Bisa dimatikan: Pengaturan → HUD → *Garis lintasan & titik jatuh*.
- Granat bisa memantul balik dari tembok/meja yang dekat — untuk jarak dekat pakai gelinding, atau lempar lewat atas penghalang.

## Flashbang

Tekan **5** (gamepad: RB dua kali cepat), lempar seperti granat (klik kiri jauh, klik kanan menggelinding, bisa dimasak agar meledak
di udara). Tidak memberi damage, tapi **membutakan semua yang melihatnya — termasuk teman setim dan dirimu sendiri** (pelempar kena
setengahnya karena tahu kapan meledak; meledak di tangan karena dimasak kelamaan tetap penuh). Menatap dari
dekat = layar putih ±3 detik lalu pulih bertahap (total ±5 detik); melirik / agak jauh = silau sebentar; terhalang dinding = tidak
kena. Telinga ikut berdenging. Bot juga bisa kena, sebagian sempat memalingkan muka (makin sulit makin sering), dan bot juga
melempar flashbang sebelum maju. Musuh yang kamu butakan lalu dibunuh timmu = **Assist flash** (+50). 1 flashbang per nyawa.

## Senjata

- **Slot 1 — senjata utama**, **slot 2 — pistol**, **slot 3 — senjata jarak dekat**, **slot 4 — granat K-400**, **slot 5 — flashbang**
  (granat & flashbang 1 per nyawa). **Q** kembali ke senjata sebelumnya (setelah spawn: utama ↔ pistol). Semua dipilih di **Loadout**.
- **35 senjata api** dalam 6 kelas + pistol (tab per kelas di Loadout, kartu berisi damage/RPM/kontrol/gerak/jarak):
  - **Assault Rifle** (15): 10 AR GDD + FAMAS, AS VAL, Honey Badger (keduanya berperedam), FN FAL (battle rifle), Galil ACE.
  - **SMG** (6): MP5, Kriss Vector, P90, UMP45, MP7, Micro UZI — unggul ≤ 20 u, lari lebih cepat, sprint-ke-tembak 0.08 s.
  - **Shotgun** (5): Remington 870 & SPAS-12 (pompa), Benelli M4 (semi), Saiga-12 (magazen kotak), Double Barrel — 8–9 pellet,
    reload per selongsong yang bisa dibatalkan dengan menembak.
  - **Sniper** (4): AWM, CheyTac M200, Kar98k (bolt — dikokang tiap tembakan), Barrett M82 (semi .50); **DMR** (2): Dragunov SVD, Mini-14.
    Akurasi penuh hanya setelah scope terbuka penuh (tanpa scope sangat meleset).
  - **LMG** (3): M249, DP-28, RPK — magazen besar, recoil jongkok ×0.6, gerak lebih lambat.
  - **Pistol** (5): Desert Eagle, Glock 18C (otomatis), USP-S (peredam), M1911, Beretta M9 — cabut 0.23–0.30 s, iron / red dot.
- **Peredam** (USP-S, AS VAL, Honey Badger): tembakan lebih pelan & tidak memunculkanmu di radar musuh; bot hanya mendengar dari dekat.
- **Jarak dekat** (klik kiri ringan, klik kanan berat; dari belakang lebih mematikan): **Pisau Komando** (tebas 45/90, tusuk 70/100,
  lari +10%), **Karambit** (38/65, belakang 130, lari +12%, cabut 0.20 s), **Kukri** (55/90, jangkauan terpanjang), **Tomahawk**
  (60/105 — ayunan berat langsung mematikan dari depan, tapi lambat).
- Bot memakai AR, SMG & LMG; shotgun dan sniper hanya untuk pemain.
- **Buang & ambil**: **G** membuang senjata utama ke lantai (isi magazine & optik ikut). Hanya **tim sendiri** yang bisa mengambil atau
  menukarnya (**E**); musuh tidak bisa. Senjata yang dibuang hilang setelah 60 s; respawn selalu kembali ke senjata pilihan Loadout.

## Fitur HUD & umpan balik

Radar berputar (musuh muncul saat menembak/terlihat), nama rekan di atas kepala + nama musuh saat dibidik, killcam (replay ±3 s dari mata
pembunuh, bisa dilewati) + kartu "Dibunuh oleh", medali multi-kill/streak/first blood, popup skor & assist, indikator granat di dekatmu,
kilat merah saat terkena, detak jantung saat HP < 30, prompt reload, kecerahan, skala resolusi, guncangan kamera.

**Crosshair kustom** (Pengaturan → Crosshair, dengan pratinjau langsung): 5 bentuk (Klasik +, Klasik + titik, Titik, Lingkaran, T),
3 perilaku (Statis, Dinamis — melebar saat bergerak/lompat/menembak, Hybrid — garis dalam tetap, garis luar mengembang),
warna bebas + transparansi, outline (tebal & kepekatan), ukuran garis/celah/titik/lingkaran, pengali dinamis, dan 6 preset.

## Karakter

Tim **Biru** = pasukan taktis (helm, goggles oranye, rompi, pelindung), tim **Merah** = gerilyawan (topi loreng, kacamata hitam,
bandana, sabuk peluru, jins sobek); masing-masing pria & wanita — semuanya prosedural (acuan desain di folder `Karakter/`).
Pilih karakter kamu di **Loadout → Karakter: Pria / Wanita / Venny ★** — di samping pilihan senjata ada pratinjau 3D karakter yang
memegang senjata & optik pilihanmu (berputar pelan, seret untuk memutar, gulir / klik dua kali untuk melihat wajah dari dekat;
"Lihat pakaian" Biru / Merah untuk melihat pakaian tim lain).

**Venny ★** adalah karakter khusus — satu-satunya yang **tidak kotak-kotak**: model 3D realistis berproporsi manusia (wajah, rambut
dikuncir, siku & lutut yang menekuk, kedua tangan memegang senapan, berlutut saat jongkok, rebah utuh saat tumbang), tetap 100%
prosedural. Dua kostum mengikuti tim: Biru versi taktis (rompi pelat bertepi biru dengan papan nama "VENNY", headset bermikrofon, rok
span hitam, holster paha, bot bertali), Merah versi gerilya (rompi bertepi merah, bandana merah, sabuk peluru, lengan kaus sobek,
perban, plester di pipi, rok kotor bertepi sobek, pisau di paha). Hitbox-nya sama dengan karakter lain (adil). Hanya pemain yang bisa
memilihnya — bot tetap memakai karakter pria/wanita.

## Rasa gerak

Tempo gerak 1.35× (jalan 8.1, sprint 11.5 u/s; lompat tetap setinggi 1.38 u tapi tidak melayang), ayunan kepala sinkron langkah,
kamera miring saat strafe, FOV melebar saat sprint, hentakan saat mendarat, senjata berinersia, dan animasi karakter yang halus
(kaki mengikuti arah gerak). Kurangi/matikan lewat Pengaturan → *Gerak kamera & senjata*. Untuk menyetel langsung saat main:
panel debug `` ` `` → **RASA GERAK** (slider uji coba, tidak disimpan).

## Akun & papan peringkat

- **Papan peringkat** di menu utama: *Minggu ini* (reset Senin 00:00 WIB) atau *Sepanjang masa*, 13 papan — Poin, Kill, K/D (min.
  5 / 10 match), Menang, MVP, **Ahli Pisau**, **Raja Granat**, **Si Penyilau** (assist flashbang), Streak Terpanjang, Sniper Terjauh,
  Raja Brick Hall / Steel Yard / Boston. Peringkatmu sendiri ikut tampil walau di luar 10 besar.
- **Akun opsional** — tanpa akun tetap bisa main seperti biasa. Menu utama → tombol akun di panel Peringkat → **Masuk dengan Google**
  atau email + password (daftar, lupa password). Lalu pilih **username** (3–16 huruf/angka/_, unik; ganti maks. sekali per 30 hari) —
  username jadi namamu di papan & di room.
- **Yang dihitung:** match **online** (TDM / Eliminasi) dengan ≥ 2 pemain manusia dan ≥ 30 detik bermain. Tiap pemain mengirim
  hasilnya sendiri di layar hasil; hasil baru masuk papan setelah **≥ 1 akun lain di match yang sama** juga mengirim (satu orang
  tidak bisa mengarang match sendirian). Main lawan bot saja / Latihan tidak dihitung.
- **Privasi:** game hanya menyimpan username & statistik match online. Email & password diurus Supabase Auth (password di-hash —
  tidak bisa dilihat siapa pun); email tidak pernah ditampilkan ke pemain lain (di layar Akun milikmu sendiri pun disamarkan).
  **Hapus akun** (layar Akun → Hapus akun) menghapus username & semua hasil match secara permanen.

## Main Bareng online

**Cara kerjanya (100% gratis, tanpa server game sewaan):** browser pembuat room (**host**) menjalankan match — simulasi, bot, damage, skor.
Teman tersambung langsung ke host lewat **WebRTC** (P2P, kanal *unreliable* seperti UDP). Server pihak ketiga hanya dipakai untuk
"perkenalan" (tukar kode room & alamat koneksi, ±puluhan pesan per pemain): **Supabase Realtime** (paket gratis, tanpa kartu kredit).
File game di-host gratis di **Vercel** (atau hosting statis lain).

- Gerak & tembakanmu **diprediksi** di perangkatmu (respons instan), lalu dicocokkan dengan host. Pemain lain digambar sedikit di
  belakang agar mulus: jedanya **adaptif** (±50–75 ms di jaringan bagus, naik otomatis bila koneksi goyang/paket hilang); host
  mengirim posisi 30×/detik. Host me-**rewind hitbox** ke apa yang kamu lihat saat menembak (lag compensation, maks 250 ms).
- **Hitmarker & suara kena instan** dari tembakan/pisau sendiri; damage & kill tetap ditentukan host (tanpa tampil dobel).
- **Ping** tiap teman tampil di room & papan skor (Tab): hijau < 80 ms, kuning < 150 ms, merah ≥ 150 ms + peringatan di layar.
  Upload host tersumbat → teman itu otomatis menerima 15×/detik sampai lancar lagi. F3 menampilkan ping, jeda interpolasi & koreksi.
- Host sebaiknya pemain dengan koneksi & laptop paling kuat (upload ±1.2–2.5 Mbps untuk 9 teman). Pindah tab/aplikasi tetap aman
  (simulasi tetap jalan di latar belakang). Selama main online layar & laptop **tidak tidur** sendiri (Screen Wake Lock).
- **Pindah host otomatis:** host tiba-tiba hilang (tab tertutup/ter-refresh, laptop mati/tidur, internet host putus) → match **tidak
  bubar**. Host terus mengirim cadangan pertandingan (posisi, HP, amunisi, granat, skor, ronde, sisa waktu) tiap detik + daftar
  pengganti (ping terbaik dulu); teman dengan ping terbaik melanjutkan sebagai host baru dari cadangan itu dan yang lain otomatis
  menyambung ke dia (±3 s bila halaman host tertutup, ±9 s bila internet host putus). Karakter host lama dimainkan bot sampai dia kembali.
  Pemain yang internetnya sendiri putus **tidak** mengambil alih — dia menunggu lalu menyambung ulang ke host yang masih jalan.
- **Serahkan host:** host yang harus pergi (misal ada telepon) → Esc → *Serahkan host ke …* (klik dua kali) → teman itu jadi host,
  match lanjut tanpa jeda berarti (±0.6 s). Mau ikut lagi: *Gabung* dengan kode baru yang ditampilkan — slot lamamu dikembalikan.
- **Kembali ke match:** halaman ter-refresh / tertutup tanpa sengaja → menu utama menampilkan **Kembali ke match** → satu klik, masuk
  lagi ke slot lamamu (skor & statistik tetap). Teman yang koneksinya putus sebentar menyambung ulang sendiri.
- **AFK:** pause / pindah aplikasi / tab tersembunyi ≥ 10 detik di match online → karaktermu dimainkan bot; kembali → kendali langsung
  balik ke kamu. Teman keluar dengan sengaja di tengah match → slotnya dimainkan bot sampai match selesai.
- Host memilih *Akhiri Match* di menu pause → match berakhir untuk semua, semua kembali ke room.
- **Chat:** di room, di tengah match & di layar hasil. Saat match: **Y** = ke semua, **U** = ke tim (Enter kirim, Tab ganti tim/semua,
  Esc batal — karakter berhenti selama mengetik). **H** lalu **1–6** = pesan cepat ke tim dengan nama area posisimu ("Butuh bantuan di
  Rotunda!"). Laporan musuh dari bot ikut tampil di chat tim (bisa dimatikan: Pengaturan → HUD & Gameplay). Di room / menu pause ada
  panel chat; tombol 🔈 di samping nama teman = bisukan. Host bisa mematikan chat & voice ke semua selama match (setelan room) — chat
  tim tetap jalan. Anti-spam: maks 4 pesan beruntun lalu 1 tiap 1.5 detik.
- **Voice (push-to-talk):** tahan **T** = bicara ke tim, tahan **Z** = ke semua (di room, match & layar hasil). Saat match suara
  **berdasarkan jarak karakter**: dekat terdengar jelas, makin jauh makin kecil & teredam, terhalang dinding lebih teredam, dan baru hilang
  di ujung ke ujung map — **Z juga terdengar musuh yang dekat** (bocor ya salah sendiri). Pemain yang sudah mati tetap bisa bicara ke tim
  (terdengar jelas). Klik **🎙 Aktifkan mic** di room sekali agar izin mikrofon tidak muncul di tengah match. Suara lewat koneksi game yang
  sama (host meneruskan) — kalau bisa main bareng, pasti bisa saling dengar. Pakai headset agar tidak bergema. Volume & on/off:
  Pengaturan → Audio; 🔈 di samping nama teman membisukan chat & suaranya. Butuh Chrome / Edge.
- **Pengaman refresh:** selama bermain, **F5 / Ctrl+R** (dan pintasan browser lain seperti Ctrl+S, Alt+←) tidak berfungsi. Kalau halaman
  akan di-refresh / ditutup di tengah match atau saat room online, browser bertanya **"Yakin keluar?"** dulu — pilih *Batal* untuk lanjut.
- **Grafis tiba-tiba hilang** (driver/GPU bermasalah sesaat): game tetap berjalan dan muncul "Memulihkan grafis…" — biasanya pulih dalam
  beberapa detik tanpa memutus siapa pun. Bila > 10 detik, muncul tombol *Muat ulang halaman*.
- **Kotak hitam:** game mencatat kejadian teknis (koneksi, grafis, error). Kalau sesi berakhir tidak normal, menu utama menampilkan
  sebabnya + tombol **Salin laporan** — tempelkan teksnya ke pengembang. Tombol kecil *Salin laporan teknis* selalu ada di menu utama.
- Belum tersedia saat online: buang/ambil senjata (G/E), mode Latihan.

### Coba tanpa akun apa pun (uji lokal)

`npm run dev` → buka dua tab/jendela `http://localhost:5173` → tab 1: **Main Bareng → Buat Room** → tab 2: **Gabung** dengan kodenya.
Tanpa Supabase, room hanya terlihat dari tab lain di browser yang sama. Uji jaringan buruk: tambahkan `?netlag=60&netjitter=15&netloss=2`
di URL kedua tab (ping ±120 ms, 2% paket hilang).

### Pasang online (sekali saja, ±10 menit)

1. **Supabase** — daftar di supabase.com (gratis) → *New project* (region terdekat, mis. Singapore) → tombol **Connect** (atau
   *Settings → API Keys*): salin **Project URL** dan **publishable key** (`sb_publishable_…`; kunci *anon* lama juga bisa). Tabel
   dibuat lewat file SQL di langkah 5–6; pastikan *Realtime → Settings → Allow public access* menyala (kanal room memakai kanal publik).
2. **Lokal (opsional)** — salin `.env.example` jadi `.env.local`, isi `VITE_SUPABASE_URL` & `VITE_SUPABASE_ANON_KEY`, jalankan ulang `npm run dev`.
3. **Vercel** — daftar di vercel.com dengan akun GitHub (paket Hobby, gratis) → *Add New → Project* → pilih repo ini (framework: Vite,
   otomatis) → *Environment Variables*: isi dua variabel di atas → **Deploy**. Bagikan link `https://<nama>.vercel.app`; tombol
   **Salin Link** di room membuat link langsung ke room (`…/?room=KODE`).
4. **TURN (opsional)** — bila ada teman yang selalu gagal tersambung ("koneksi tidak tersambung"), biasanya karena NAT ketat
   (jaringan kampus/kantor/sebagian operator seluler). Isi `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` dari layanan
   TURN yang punya kuota gratis, lalu deploy ulang.

5. **Jaga Supabase tetap aktif (sekali saja)** — paket gratis menjeda project yang ±7 hari tanpa aktivitas *database* (signaling room
   tidak dihitung). Buka Supabase → *SQL Editor* → *New query* → tempel isi `supabase/keepalive.sql` → *Run* (tabel mini 1 baris,
   hanya bisa dibaca). Setelah itu **Vercel Cron** (`vercel.json`) memanggil `/api/keepalive` tiap hari ±10:00 WIB dan membaca baris
   itu, jadi project tidak dijeda. Cek di Vercel → *Settings → Cron Jobs* (bisa *Run* manual). Opsional: tambah env `CRON_SECRET`
   (teks acak) di Vercel lalu redeploy → hanya Vercel Cron yang boleh memanggil endpoint itu.

6. **Akun & papan peringkat (sekali saja)** — semua aturan keamanan ada di database, jadi langkah ini wajib sebelum fitur akun dipakai:
   1. *SQL Editor → New query* → tempel isi `supabase/accounts.sql` → *Run* (aman dijalankan ulang). Tabel dikunci total untuk
      publik; pemain hanya bisa memakai fungsi tervalidasi (username sendiri, kirim hasil sendiri, baca peringkat, hapus akun sendiri).
   2. *Authentication → URL Configuration*: **Site URL** = `https://<nama>.vercel.app`; **Redirect URLs** tambahkan
      `https://<nama>.vercel.app/**` dan `http://localhost:5173/**` (hanya alamat milikmu — jangan pola bebas seperti `**`).
   3. *Authentication → Sign In / Providers → Email*: aktif, **Confirm email** ON, **Secure email change** ON. Di pengaturan
      password: panjang minimum **8**, syarat karakter **huruf dan angka** (sama dengan aturan di game). Biarkan *Anonymous
      sign-ins* MATI.
   4. **Google** — Google Cloud Console (project baru) → *Google Auth Platform* (dulu *APIs & Services → OAuth consent screen*) →
      *Get started* (nama app, email dukungan, Audience **External**) → *Clients → Create client* (Web application): *Authorized
      JavaScript origins* = `https://<nama>.vercel.app` (+ `http://localhost:5173` untuk uji lokal), *Authorized redirect URIs* =
      **Callback URL** yang tertera di Supabase → *Authentication → Sign In / Providers → Google* (bentuknya
      `https://<project>.supabase.co/auth/v1/callback`). Salin *Client ID* & *Client secret* SAAT ITU JUGA (Google bisa tidak
      menampilkan secret lagi) ke halaman Google di Supabase → *Enable* → Save. Lalu *Audience → Publish app* (status *In
      production*): selama *Testing* hanya akun yang didaftarkan sebagai *test user* yang bisa masuk; scope dasar (email, profil)
      tidak perlu verifikasi. Layar Google menulis "lanjutkan ke `<project>.supabase.co`" — normal. Client secret hanya disimpan di
      Supabase — jangan pernah ditaruh di repo / env Vercel / chat.
   5. **Email (WAJIB agar pemain lain bisa daftar pakai email)** — pengirim email bawaan Supabase HANYA mengirim ke anggota tim
      organisasi Supabase-mu (alamat lain ditolak "Email address not authorized") dan dibatasi beberapa email per jam. Pasang SMTP
      sendiri di *Authentication → Emails → SMTP Settings*: tanpa domain sendiri → akun Gmail KHUSUS game + *App Password* (wajib
      verifikasi 2 langkah; host `smtp.gmail.com`, port 465, user & pengirim = alamat Gmail itu, ratusan email/hari); punya domain →
      mis. Resend (gratis, domain wajib diverifikasi — tanpa domain Resend hanya mengirim ke email pemilik akun Resend). Setelah
      SMTP terpasang, nyalakan *Emails → Security → Password changed* & *Email address changed* (pemain diberi tahu bila akunnya
      diubah). Sebelum itu pemain lain masuk dengan
      **Google** (game menyarankannya bila email ditolak). Jangan mematikan *Confirm email* sebagai jalan pintas — orang jadi bisa
      mendaftar memakai email milik orang lain. Jangan menyalakan CAPTCHA (*Attack Protection*): game belum mengirim token CAPTCHA,
      semua daftar/masuk email akan gagal.
   6. **Moderasi** (SQL Editor): blokir akun curang dari peringkat —
      `update public.profiles set banned = true where lower(username) = lower('NAMA');` — atau ganti nama yang tidak pantas —
      `update public.profiles set username = 'Pemain_123' where lower(username) = lower('NAMA');`.

Bila project Supabase tetap terjeda (mis. cron belum dipasang): buka dashboard Supabase dan klik *Restore* (bisa dalam 90 hari);
lewat dari itu, buat project baru, jalankan lagi kedua file SQL, dan ganti 2 env di Vercel — akun & papan peringkat lama
ikut hilang (tersimpan di project lama).

### Keamanan

- **Kunci publik saja di game.** `VITE_SUPABASE_ANON_KEY` memang publik (ada di bundle). Kunci rahasia *service role*, password
  database, dan *client secret* Google tidak pernah dipakai game / tidak boleh masuk repo maupun env Vercel.
- **Database = penjaga.** Tabel `profiles` & `match_results` tidak bisa dibaca/diubah langsung oleh siapa pun dari browser (hak
  dicabut + RLS tanpa policy). Semua lewat fungsi `SECURITY DEFINER` (search_path kosong) yang hanya bekerja untuk pemilik sesi dan
  memvalidasi isian (format username, rentang & konsistensi statistik, batas laju 30 s / 60 per hari, durasi match). Papan peringkat
  hanya mengeluarkan username + angka. Diuji otomatis di Postgres asli (`tests/accountsSql.test.ts`).
- **Login:** alur PKCE (token tidak lewat URL; parameter login dibersihkan dari URL & tidak tercatat di laporan teknis). Sesi
  disimpan di `localStorage` kunci `studwarfare.auth.v1` (agar tetap masuk saat game dibuka lagi).
- **Header situs** (`vercel.json`): Content-Security-Policy (skrip hanya dari situs sendiri, koneksi hanya ke Supabase), anti
  framing, `nosniff`, Referrer-Policy, Permissions-Policy (mikrofon hanya untuk voice chat), HSTS.
- **Batas yang jujur:** game ini P2P tanpa server game, jadi statistik dihitung di browser pemain. Konfirmasi ≥ 2 akun + batas
  angka membuat kecurangan jauh lebih sulit, tapi orang yang paham teknis dengan 2 akun tetap bisa memalsukan hasil — blokir lewat
  moderasi di atas.
