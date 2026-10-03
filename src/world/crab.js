// A little crab that scuttles sideways along the sand, waves its claws and blinks.
// All parts live in one geometry; a mini rigid skeleton (bone matrices in a uniform
// array) animates it — one draw call for the whole crab.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PRELUDE } from '../glsl/common.js';
import { withShared } from '../core/uniforms.js';
import { clamp, damp, Spring } from '../util/math.js';
import { sandHeight } from './sand.js';

const BONES = 19;

const VERT = /* glsl */ `
attribute float aBone;
attribute float aMat;
attribute vec3 aEye;
uniform mat4 uBones[${BONES}];
varying vec3 vLocal;
varying vec3 vWpos;
varying vec3 vNormal;
varying vec3 vColor;
varying float vMat;
varying vec3 vEye;
void main() {
  mat4 b = uBones[int(aBone + 0.5)];
  vec4 wp = b * vec4(position, 1.0);
  vLocal = position;
  vWpos = wp.xyz;
  vNormal = normalize(mat3(b) * normal);
  vColor = color;
  vMat = aMat;
  vEye = aEye;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${PRELUDE}
uniform float uBlink;
uniform vec3 uLook;
uniform float uHappy;
varying vec3 vLocal;
varying vec3 vWpos;
varying vec3 vNormal;
varying vec3 vColor;
varying float vMat;
varying vec3 vEye;
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWpos);
  vec3 col;
  if (vMat > 0.5 && vMat < 1.5) {
    // googly eye: white, big pupil that looks at uLook, two highlights, eyelid for blinks
    vec3 toLook = normalize(uLook - vWpos);
    float facing = dot(N, toLook);
    vec3 eyeCol = vec3(1.0);
    eyeCol = mix(eyeCol, vec3(0.05, 0.06, 0.12), smoothstep(0.62, 0.66, facing));
    float hl = smoothstep(0.93, 0.96, dot(N, normalize(V + vec3(-0.35, 0.45, 0.0))));
    float hl2 = smoothstep(0.975, 0.985, dot(N, normalize(V + vec3(0.3, -0.25, 0.0))));
    eyeCol = mix(eyeCol, vec3(1.3), max(hl, hl2));
    float lid = step(mix(1.2, -1.2, uBlink), vEye.y);
    eyeCol = mix(eyeCol, vec3(0.95, 0.38, 0.26), lid);
    col = eyeCol * (uSkyAmb * 0.5 + uKeyColor * 0.75) + vec3(0.04);
  } else {
    vec3 alb = vColor;
    if (vMat < 0.5) {
      float spots = smoothstep(0.55, 0.75, snoise(vLocal * 7.0) * 0.5 + 0.5);
      alb = mix(alb, alb * vec3(1.15, 1.2, 1.1) + 0.05, spots * 0.6);
      // underside lighter
      alb = mix(alb, vec3(1.0, 0.72, 0.55), smoothstep(-0.05, -0.25, vLocal.y) * 0.6);
      // face: smile and blush (body bone space, front is +z)
      float front = smoothstep(0.22, 0.32, vLocal.z);
      float smile = abs(vLocal.y - (-0.07 + 3.2 * vLocal.x * vLocal.x));
      float mouth = smoothstep(0.02, 0.009, smile) * step(abs(vLocal.x), 0.12) * front;
      alb = mix(alb, vec3(0.35, 0.06, 0.05), mouth);
      vec2 cheek = vec2(abs(vLocal.x) - 0.24, vLocal.y + 0.01);
      float blush = smoothstep(0.08, 0.02, length(cheek)) * front;
      alb = mix(alb, vec3(1.0, 0.45, 0.55), blush * (0.45 + 0.4 * uHappy));
    }
    col = softShade(alb, N, V, vWpos, 0.6, 0.35, 28.0, 0.35, 0.8);
  }
  col = applyFog(col, vWpos);
  gl_FragColor = vec4(col, 1.0);
}
`;

const SHELL = '#ff6a45';
const LEG = '#ff7d55';
const CLAW = '#ff5a3c';
const TIP = '#ffd2b8';

function tag(geo, bone, mat, color, eye = false) {
  geo.deleteAttribute('uv');
  const n = geo.attributes.position.count;
  const c = new THREE.Color(color);
  const colors = new Float32Array(n * 3);
  const eyeA = new Float32Array(n * 3);
  const pos = geo.attributes.position;
  geo.computeBoundingSphere();
  const center = geo.boundingSphere.center;
  const rad = geo.boundingSphere.radius;
  for (let i = 0; i < n; i++) {
    colors.set([c.r, c.g, c.b], i * 3);
    if (eye) eyeA.set([(pos.getX(i) - center.x) / rad, (pos.getY(i) - center.y) / rad, (pos.getZ(i) - center.z) / rad], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aBone', new THREE.BufferAttribute(new Float32Array(n).fill(bone), 1));
  geo.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(n).fill(mat), 1));
  geo.setAttribute('aEye', new THREE.BufferAttribute(eyeA, 3));
  return geo;
}

const _up = new THREE.Vector3(0, 1, 0);
// tapered tube from a to b (in bone space)
function tube(a, b, r0, r1, radial = 8) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, 2, false);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(_up, b.clone().sub(a).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a, q, new THREE.Vector3(1, 1, 1)));
  return g;
}

function sphere(r, x, y, z, sx = 1, sy = 1, sz = 1, ws = 14, hs = 10) {
  const g = new THREE.SphereGeometry(r, ws, hs);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return g;
}

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export class Crab {
  constructor(z = 4.2) {
    this.z = z;
    this.x = -1.5;
    this.targetX = 2.5;
    this.state = 'walk';
    this.stateTime = 0;
    this.walkPhase = 0;
    this.speed = 0;
    this.blink = 0;
    this.nextBlink = 2;
    this.clawOpen = [0, 0];
    this.snapTimer = 1.5;
    this.wave = 0;
    this.happy = new Spring(0, 120, 10);
    this.hop = new Spring(0, 160, 9);
    this.look = new THREE.Vector3();
    this.legHeight = 0.5;

    // ---- skeleton
    this.root = new THREE.Group();
    this.root.scale.setScalar(0.92);
    this.bodyJ = new THREE.Object3D();
    this.root.add(this.bodyJ);
    this.hips = [];
    this.knees = [];
    const legZ = [-0.2, 0.0, 0.18];
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const hip = new THREE.Object3D();
        hip.position.set(s * 0.44, -0.06, legZ[k]);
        hip.userData.side = s;
        hip.userData.k = k;
        const knee = new THREE.Object3D();
        knee.position.set(s * 0.38, 0, 0);
        hip.add(knee);
        this.bodyJ.add(hip);
        this.hips.push(hip);
        this.knees.push(knee);
      }
    }
    this.shoulders = [];
    this.wrists = [];
    this.jaws = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Object3D();
      sh.position.set(s * 0.34, -0.02, 0.28);
      const wr = new THREE.Object3D();
      wr.position.set(0, 0, 0.3);
      const jaw = new THREE.Object3D();
      jaw.position.set(0, 0.06, 0.3);
      wr.add(jaw);
      sh.add(wr);
      this.bodyJ.add(sh);
      this.shoulders.push(sh);
      this.wrists.push(wr);
      this.jaws.push(jaw);
    }
    // bone order: 0 body, 1..6 hips, 7..12 knees, 13..14 shoulders, 15..16 wrists, 17..18 jaws
    this.boneObjects = [this.bodyJ, ...this.hips, ...this.knees, ...this.shoulders, ...this.wrists, ...this.jaws];

    // ---- geometry (each part in its bone's space)
    const parts = [];
    parts.push(tag(sphere(1, 0, 0, 0, 0.52, 0.3, 0.4, 28, 18), 0, 0, SHELL));
    for (const s of [-1, 1]) {
      parts.push(tag(tube(V3(s * 0.12, 0.2, 0.22), V3(s * 0.17, 0.46, 0.26), 0.04, 0.03), 0, 0, LEG));
      parts.push(tag(sphere(0.115, s * 0.17, 0.54, 0.27, 1, 1, 1, 18, 14), 0, 1, '#ffffff', true));
    }
    this.hips.forEach((hip, i) => {
      const s = hip.userData.side;
      parts.push(tag(tube(V3(0, 0, 0), V3(s * 0.38, 0, 0), 0.055, 0.045), 1 + i, 0, LEG));
      parts.push(tag(sphere(0.05, s * 0.38, 0, 0), 1 + i, 0, LEG));
      parts.push(tag(tube(V3(0, 0, 0), V3(s * 0.44, 0, 0), 0.045, 0.012), 7 + i, 2, LEG));
    });
    for (let i = 0; i < 2; i++) {
      parts.push(tag(tube(V3(0, 0, 0), V3(0, 0, 0.3), 0.065, 0.055), 13 + i, 0, LEG));
      parts.push(tag(sphere(1, 0, 0, 0.17, 0.17, 0.14, 0.2), 15 + i, 0, CLAW));
      parts.push(tag(tube(V3(0, -0.04, 0.3), V3(0, -0.01, 0.55), 0.075, 0.012), 15 + i, 2, CLAW));
      parts.push(tag(tube(V3(0, 0, 0), V3(0, -0.04, 0.24), 0.06, 0.01), 17 + i, 2, CLAW));
    }
    const geo = mergeGeometries(parts, false);
    parts.forEach((g) => g.dispose());

    this.bones = Array.from({ length: BONES }, () => new THREE.Matrix4());
    this.material = new THREE.ShaderMaterial({
      name: 'Crab',
      uniforms: withShared({
        uBones: { value: this.bones },
        uBlink: { value: 0 },
        uLook: { value: this.look },
        uHappy: { value: 0 },
      }),
      vertexShader: VERT,
      fragmentShader: FRAG,
      vertexColors: true,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.place();
  }

  place() {
    this.root.position.set(this.x, sandHeight(this.x, this.z), this.z);
  }

  get worldCenter() {
    return this.root.position;
  }

  pickNewTarget() {
    let nx = this.x;
    for (let i = 0; i < 8 && Math.abs(nx - this.x) < 1.6; i++) nx = -4.5 + Math.random() * 9;
    this.targetX = nx;
  }

  // Happy jump + claw clap (used by interactions later).
  celebrate() {
    this.hop.kick(5);
    this.happy.kick(6);
    this.state = 'dance';
    this.stateTime = 0;
  }

  update(t, dt, camera) {
    this.stateTime += dt;
    let walking = 0;
    if (this.state === 'walk') {
      const d = this.targetX - this.x;
      const dir = Math.sign(d);
      this.speed = damp(this.speed, 0.85, 4, dt);
      this.x += dir * this.speed * dt;
      walking = 1;
      if (Math.abs(d) < 0.05) {
        this.state = 'idle';
        this.stateTime = 0;
        this.idleFor = 2 + Math.random() * 3.5;
        this.wave = Math.random() < 0.4 ? 1 : 0;
      }
    } else if (this.state === 'idle') {
      this.speed = damp(this.speed, 0, 6, dt);
      if (this.stateTime > this.idleFor) {
        this.pickNewTarget();
        this.state = 'walk';
        this.stateTime = 0;
      }
    } else if (this.state === 'dance') {
      walking = 0.6;
      if (this.stateTime > 2.2) {
        this.state = 'idle';
        this.stateTime = 0;
        this.idleFor = 1;
      }
    }
    this.walkPhase += dt * (walking ? 9.5 * Math.max(this.speed, 0.6) : 0);
    this.place();

    // blinking
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blinkT = 0;
      this.nextBlink = 2 + Math.random() * 4;
    }
    if (this.blinkT !== undefined && this.blinkT >= 0) {
      this.blinkT += dt;
      this.blink = Math.sin(clamp(this.blinkT / 0.18, 0, 1) * Math.PI);
      if (this.blinkT > 0.18) this.blinkT = -1;
    }

    // claws: occasional snapping
    this.snapTimer -= dt;
    if (this.snapTimer <= 0) {
      this.snapTimer = 1 + Math.random() * 2.5;
      this.snapT = 0;
    }
    let snap = 0;
    if (this.snapT !== undefined && this.snapT >= 0) {
      this.snapT += dt;
      snap = Math.max(0, Math.sin(this.snapT * 18)) * (this.snapT < 0.7 ? 1 : 0);
      if (this.snapT > 0.7) this.snapT = -1;
    }

    const hop = this.hop.update(dt);
    const happy = this.happy.update(dt);
    this.material.uniforms.uHappy.value = clamp(happy, 0, 1);

    // body
    const bob = Math.abs(Math.sin(this.walkPhase)) * 0.035 * walking;
    this.bodyJ.position.y = this.legHeight + bob + Math.sin(t * 2.1) * 0.01 + Math.max(hop, 0) * 0.08;
    this.bodyJ.rotation.z = Math.sin(this.walkPhase) * 0.06 * walking + (this.state === 'dance' ? Math.sin(t * 12) * 0.12 : 0);
    this.bodyJ.rotation.x = -0.08;

    // legs: alternating tripods, lifting and swinging
    for (let i = 0; i < 6; i++) {
      const hip = this.hips[i];
      const s = hip.userData.side;
      const k = hip.userData.k;
      const phase = this.walkPhase + ((k + (s > 0 ? 1 : 0)) % 2) * Math.PI;
      const lift = Math.max(0, Math.sin(phase)) * walking;
      hip.rotation.set(0, Math.cos(phase) * 0.22 * walking + (k - 1) * -0.25 * s, -s * (0.5 - 0.38 * lift));
      this.knees[i].rotation.set(0, 0, -s * (1.05 + 0.25 * lift));
    }
    // arms: claws held up in front, idle sway, waving and snapping
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1;
      const sh = this.shoulders[i];
      const waving = this.wave && this.state === 'idle' && i === 1 ? Math.sin(this.stateTime * 9) : 0;
      const dance = this.state === 'dance' ? Math.sin(t * 14 + i * Math.PI) : 0;
      sh.rotation.set(-0.45 - Math.sin(t * 1.4 + i) * 0.06 - Math.abs(waving) * 0.7 - dance * 0.4, s * 0.5, 0);
      this.wrists[i].rotation.set(0.2 + waving * 0.4, -s * 0.75, 0);
      const open = Math.max(snap, Math.abs(dance)) * 0.65 + 0.08;
      this.jaws[i].rotation.set(-open, 0, 0);
    }

    // eyes follow the camera, or the crab's own target when walking
    this.look.copy(camera.position);
    if (walking) this.look.x += (this.targetX - this.x) * 6;
    this.material.uniforms.uBlink.value = this.blink;

    this.root.updateMatrixWorld(true);
    for (let i = 0; i < BONES; i++) this.bones[i].copy(this.boneObjects[i].matrixWorld);
  }
}
