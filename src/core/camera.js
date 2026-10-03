// Camera framing for landscape and portrait, the start "dive" and gentle idle drift.

import * as THREE from 'three';
import { WORLD } from '../config.js';
import { lerp, smoothstep, easeInOutCubic, clamp } from '../util/math.js';

const _v = new THREE.Vector3();
const _ndc = new THREE.Vector3();
const _dir = new THREE.Vector3();

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.basePos = new THREE.Vector3();
    this.baseTarget = new THREE.Vector3();
    this.baseFov = 35;
    this.startPos = new THREE.Vector3();
    this.startTarget = new THREE.Vector3();
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.mode = 'start'; // 'start' | 'dive' | 'live'
    this.diveT = 0;
    this.diveDuration = 2.9;
    this.kick = new THREE.Vector3(); // small camera nudges (big events)
    this.frame(camera.aspect);
  }

  // Visible height at the focal plane grows in portrait so the floor stays at the bottom
  // and the shimmering surface appears at the top.
  frame(aspect) {
    const D = WORLD.camDist;
    const k = smoothstep(1.35, 0.75, aspect); // 0 landscape … 1 portrait
    const H = lerp(13.6, 20.5, k);
    const yBottom = lerp(-2.3, -2.5, k);
    const pitch = THREE.MathUtils.degToRad(lerp(7.5, 6.0, k));
    const camY = yBottom + H / 2 + D * Math.tan(pitch);
    this.baseFov = THREE.MathUtils.radToDeg(2 * Math.atan(H / 2 / D));
    this.basePos.set(0, camY, D);
    this.baseTarget.set(0, camY - D * Math.tan(pitch), 0);
    // The dive starts just under the surface, looking out over the reef.
    this.startPos.set(0, WORLD.surfaceY - 2.2, D - 9);
    this.startTarget.set(0, WORLD.surfaceY - 5.5, -12);
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
  }

  startDive() {
    if (this.mode !== 'start') return;
    this.mode = 'dive';
    this.diveT = 0;
  }

  get diveProgress() {
    if (this.mode === 'start') return 0;
    if (this.mode === 'live') return 1;
    return clamp(this.diveT / this.diveDuration, 0, 1);
  }

  update(t, dt) {
    const driftX = Math.sin(t * 0.13) * 0.35 + Math.sin(t * 0.051 + 2.0) * 0.25;
    const driftY = Math.sin(t * 0.17 + 1.3) * 0.16;
    this.pos.set(this.basePos.x + driftX, this.basePos.y + driftY, this.basePos.z);
    this.target.set(this.baseTarget.x + driftX * 0.45, this.baseTarget.y + driftY * 0.4, this.baseTarget.z);

    if (this.mode !== 'live') {
      let k = 0;
      if (this.mode === 'dive') {
        this.diveT += dt;
        k = easeInOutCubic(clamp(this.diveT / this.diveDuration, 0, 1));
        if (this.diveT >= this.diveDuration) this.mode = 'live';
      }
      const sway = Math.sin(t * 0.4) * 0.3 * (1 - k);
      this.pos.lerpVectors(_v.set(this.startPos.x + sway, this.startPos.y, this.startPos.z), this.pos, k);
      this.target.lerpVectors(_v.set(this.startTarget.x, this.startTarget.y, this.startTarget.z), this.target, k);
    }

    // Decaying kick for big moments.
    this.kick.multiplyScalar(Math.exp(-dt * 4));
    this.camera.position.copy(this.pos).add(this.kick);
    this.camera.lookAt(this.target);
  }

  // Where does a screen point (ndc -1..1) hit the plane z = zPlane?
  screenToPlaneZ(ndcX, ndcY, zPlane, out) {
    _ndc.set(ndcX, ndcY, 0.5).unproject(this.camera);
    _dir.copy(_ndc).sub(this.camera.position).normalize();
    const t = (zPlane - this.camera.position.z) / _dir.z;
    return out.copy(this.camera.position).addScaledVector(_dir, t);
  }

  // Ray from a screen point (ndc).
  screenRay(ndcX, ndcY, outOrigin, outDir) {
    outOrigin.copy(this.camera.position);
    _ndc.set(ndcX, ndcY, 0.5).unproject(this.camera);
    outDir.copy(_ndc).sub(this.camera.position).normalize();
  }
}
