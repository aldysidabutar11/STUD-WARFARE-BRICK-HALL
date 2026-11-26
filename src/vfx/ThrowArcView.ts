// src/vfx/ThrowArcView.ts — garis lintasan benda lempar (permintaan pengguna 2026-11-26): titik-titik sepanjang lintasan prediksi
// (combat/throwArc.traceThrow) + cincin di titik jatuh pertama (searah normal permukaan) atau penanda ledak di udara bila sumbu habis
// sebelum menyentuh apa pun. Hanya untuk pemain di layar ini, hanya selama memegang granat / flashbang (Pengaturan → HUD).
// Dua lapis: terang (uji kedalaman) + "tembus" tipis tanpa uji kedalaman — bagian yang tertutup badan sendiri (TPS), peti, atau
// tembok rendah (lemparan lambung) tetap terlihat samar. ±6 draw call; warna per jenis (K-400 kuning-jingga, flashbang putih kebiruan).
import * as THREE from 'three';
import type { ArcTrace } from '../combat/throwArc';
import type { NadeKind } from '../combat/Flash';
import type { V3 } from '../physics/Physics';
import { XCFG } from '../config/extraConfig';

const A = XCFG.throwArc;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _n = new THREE.Vector3(), _Z = new THREE.Vector3(0, 0, 1);
const _e: V3 = { x: 0, y: 0, z: 0 };

const mat = (opacity: number, ghost: boolean, side: THREE.Side = THREE.FrontSide) => new THREE.MeshBasicMaterial({
  color: 0xffffff, transparent: true, opacity: ghost ? opacity * A.ghost : opacity, depthWrite: false, depthTest: !ghost,
  fog: false, toneMapped: false, side,
});

export class ThrowArcView {
  readonly group = new THREE.Group();
  private readonly mats: THREE.MeshBasicMaterial[] = [];
  private readonly dots: THREE.InstancedMesh;
  private readonly ghostDots: THREE.InstancedMesh;
  private readonly marker = new THREE.Group();
  private readonly burst = new THREE.Group();
  private kind: NadeKind | null = null;

  constructor() {
    this.group.name = 'throwArc';
    const m = (o: number, ghost: boolean, side?: THREE.Side) => { const x = mat(o, ghost, side); this.mats.push(x); return x; };
    const mesh = (g: THREE.BufferGeometry, o: number, ghost: boolean, side?: THREE.Side) => {
      const x = new THREE.Mesh(g, m(o, ghost, side)); x.renderOrder = ghost ? 4 : 5; return x;
    };
    const dotGeo = new THREE.IcosahedronGeometry(1, 1);
    this.dots = new THREE.InstancedMesh(dotGeo, m(A.dotOpacity, false), A.maxDots);
    this.ghostDots = new THREE.InstancedMesh(dotGeo, m(A.dotOpacity, true), A.maxDots);
    this.ghostDots.instanceMatrix = this.dots.instanceMatrix;          // lapis tembus menggambar titik yang sama
    for (const d of [this.dots, this.ghostDots]) { d.frustumCulled = false; d.count = 0; }
    this.dots.renderOrder = 5; this.ghostDots.renderOrder = 4;
    const ring = new THREE.RingGeometry(A.ringInner, A.ringOuter, 40), disc = new THREE.CircleGeometry(A.ringInner, 40);
    this.marker.add(mesh(disc, A.discOpacity, false, THREE.DoubleSide), mesh(ring, A.ringOpacity, false, THREE.DoubleSide),
      mesh(ring, A.ringOpacity, true, THREE.DoubleSide));
    const oct = new THREE.OctahedronGeometry(A.burstSize);
    this.burst.add(mesh(oct, A.ringOpacity, false), mesh(oct, A.ringOpacity, true));
    this.group.add(this.ghostDots, this.dots, this.marker, this.burst);
    this.hide();
  }

  /** Material untuk pra-kompilasi shader. */
  get materials(): THREE.Material[] { return this.mats; }

  /** Engine.warmup hanya mengompilasi objek yang terlihat → tampilkan sementara (1 titik, cincin, penanda) agar tidak ada frame
   *  macet saat garis pertama kali muncul di tengah match. */
  prepareWarm(on: boolean) {
    if (on) {
      this.group.visible = true; this.marker.visible = true; this.burst.visible = true;
      this.dots.setMatrixAt(0, _m.identity()); this.dots.instanceMatrix.needsUpdate = true;
      this.dots.count = this.ghostDots.count = 1;
    } else this.hide();
  }

  hide() {
    this.group.visible = false;
    this.dots.count = this.ghostDots.count = 0;
  }

  /** Gambar lintasan `tr` untuk jenis `kind`; `cam` = posisi kamera (ukuran titik/cincin ikut jarak agar tetap terbaca), `t` = waktu. */
  show(tr: ArcTrace, kind: NadeKind, cam: V3, t: number) {
    if (kind !== this.kind) {
      this.kind = kind;
      const c = kind === 'flash' ? A.colorFlash : A.colorFrag;
      for (const x of this.mats) x.color.setHex(c);
    }
    this.group.visible = true;
    // titik sepanjang polyline (lewati awal lintasan yang menempel di tangan / kamera); ukuran di layar ±tetap
    const P = tr.pts;
    let n = 0, next = A.skip, acc = 0;
    for (let i = 1; i < tr.n && n < A.maxDots; i++) {
      const ax = P[(i - 1) * 3], ay = P[(i - 1) * 3 + 1], az = P[(i - 1) * 3 + 2];
      const dx = P[i * 3] - ax, dy = P[i * 3 + 1] - ay, dz = P[i * 3 + 2] - az, len = Math.hypot(dx, dy, dz);
      while (len > 1e-6 && acc + len >= next && n < A.maxDots) {
        const f = (next - acc) / len, x = ax + dx * f, y = ay + dy * f, z = az + dz * f;
        const dc = Math.hypot(x - cam.x, y - cam.y, z - cam.z);
        const r = Math.min(A.dotMax, Math.max(A.dotMin, A.dotAng * dc));
        this.dots.setMatrixAt(n++, _m.makeScale(r, r, r).setPosition(x, y, z));
        next += A.spacing + A.spacingGrow * dc;
      }
      acc += len;
    }
    this.dots.count = this.ghostDots.count = n;
    this.dots.instanceMatrix.needsUpdate = true;
    // penanda akhir: cincin di permukaan (titik jatuh pertama) / bintang kecil di udara (sumbu habis sebelum menyentuh apa pun)
    const pulse = 1 + A.pulse * Math.sin(t * A.pulseHz * Math.PI * 2);
    if (tr.end === 'hit') {
      const c = tr.contact, nr = tr.normal, d = Math.hypot(c.x - cam.x, c.y - cam.y, c.z - cam.z);
      _n.set(nr.x, nr.y, nr.z);
      this.marker.quaternion.copy(_q.setFromUnitVectors(_Z, _n));
      this.marker.position.set(c.x + nr.x * A.lift, c.y + nr.y * A.lift, c.z + nr.z * A.lift);
      this.marker.scale.setScalar((1 + A.ringGrow * d) * pulse);
      this.marker.visible = true; this.burst.visible = false;
    } else if (tr.end === 'fuse' && tr.n > 1) {
      tr.endPoint(_e);
      const d = Math.hypot(_e.x - cam.x, _e.y - cam.y, _e.z - cam.z);
      this.burst.position.set(_e.x, _e.y, _e.z);
      this.burst.rotation.set(t * 1.7, t * 2.3, 0);
      this.burst.scale.setScalar((1 + A.ringGrow * d) * pulse);
      this.burst.visible = true; this.marker.visible = false;
    } else { this.marker.visible = false; this.burst.visible = false; }
  }
}
