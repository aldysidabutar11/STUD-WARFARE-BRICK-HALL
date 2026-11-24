// tests/sightline.test.ts — garis bidik ADS optik 1× (iron, red dot, holo) tidak boleh tertutup balok senjata opaque.
// GDD §6: red dot = "titik merah menyala di bingkai kaca tipis"; §9.1: pose ADS (0, −h_sight, −0.45) → pusat optik di sumbu kamera.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { OPTIC_GLASS_MATERIAL, VM_SCALE, createOpticMesh, opticModel, weaponModel } from '../src/combat/WeaponModels';
import { SCOPES, WEAPON_ORDER, type ScopeId, type WeaponId } from '../src/config/weaponsData';
import { XCFG } from '../src/config/extraConfig';

const EYE_Z = -XCFG.viewmodel.adsZ / VM_SCALE; // posisi mata di ruang model senjata saat ADS penuh
const ray = new THREE.Raycaster();
const FWD = new THREE.Vector3(0, 0, -1);

/** Balok opaque senjata + badan optik (tanpa kaca), di ruang model. */
function opaqueParts(w: WeaponId, s: ScopeId): THREE.Object3D {
  const m = weaponModel(w, s === 'iron');
  const root = new THREE.Mesh(m.geometry);
  const om = opticModel(s);
  if (om) { const body = new THREE.Mesh(om.body); body.position.z = m.opticMount.z; root.add(body); }
  root.updateMatrixWorld(true);
  return root;
}

/** Sinar dari mata lurus ke depan, digeser (dx, dy) dari sumbu bidik: true bila menabrak balok opaque. */
function blocked(root: THREE.Object3D, s: ScopeId, dx: number, dy: number): boolean {
  const y = SCOPES[s].sightHeight / VM_SCALE;
  ray.set(new THREE.Vector3(dx, y + dy, EYE_Z), FWD);
  return ray.intersectObject(root, true).length > 0;
}

describe('garis bidik ADS (semua AR)', () => {
  for (const w of WEAPON_ORDER) {
    it(`${w}: iron — tiang depan di tengah, sasaran di atasnya terlihat`, () => {
      const root = opaqueParts(w, 'iron');
      expect(blocked(root, 'iron', 0, -0.01)).toBe(true); // tiang depan memang ada tepat di bawah titik bidik
      for (const dx of [-0.015, 0, 0.015]) for (const dy of [0.008, 0.03, 0.06]) {
        expect(blocked(root, 'iron', dx, dy), `dx ${dx} dy ${dy}`).toBe(false);
      }
    });
    for (const s of ['reddot', 'holo'] as const) {
      it(`${w}: ${s} — jendela kaca bersih (tidak ada balok di depan/di belakang kaca)`, () => {
        const root = opaqueParts(w, s);
        for (const dx of [-0.03, 0, 0.03]) for (const dy of [-0.04, -0.015, 0, 0.03, 0.06]) {
          expect(blocked(root, s, dx, dy), `dx ${dx} dy ${dy}`).toBe(false);
        }
      });
    }
  }
});

describe('kaca optik', () => {
  it('red dot & holo punya kaca terpisah yang bening; iron tanpa optik', () => {
    for (const s of ['reddot', 'holo'] as const) {
      const mesh = createOpticMesh(s)!;
      const glass = mesh.getObjectByName('opticGlass') as THREE.Mesh;
      expect(glass).toBeTruthy();
      expect(glass.material).toBe(OPTIC_GLASS_MATERIAL);
      expect(glass.castShadow).toBe(false);
    }
    expect(OPTIC_GLASS_MATERIAL.transparent).toBe(true);
    expect(OPTIC_GLASS_MATERIAL.opacity).toBeLessThan(0.3);
    expect(OPTIC_GLASS_MATERIAL.depthWrite).toBe(false);
    expect(createOpticMesh('iron')).toBeNull();
  });
  it('kaca menutupi sumbu bidik (sinar dari mata menembus kaca tepat di tengah)', () => {
    for (const s of ['reddot', 'holo'] as const) {
      const glass = new THREE.Mesh(opticModel(s)!.glass!);
      glass.position.z = weaponModel('m416', false).opticMount.z;
      glass.updateMatrixWorld(true);
      ray.set(new THREE.Vector3(0, SCOPES[s].sightHeight / VM_SCALE, EYE_Z), FWD);
      expect(ray.intersectObject(glass).length).toBeGreaterThan(0);
    }
  });
});
