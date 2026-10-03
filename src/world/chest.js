// The treasure chest: wooden planks, gold bands, a glowing keyhole. Now and then the lid
// peeks open and lets out a puff of bubbles. `open()` is the big surprise (wired in stage 3).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PRELUDE } from '../glsl/common.js';
import { withShared } from '../core/uniforms.js';
import { clamp, Spring } from '../util/math.js';
import { sandHeight } from './sand.js';

// aMat: 0 wood, 1 gold, 2 dark, 3 keyhole glow, 4 inner glow
const VERT = /* glsl */ `
attribute float aMat;
varying vec3 vLocal;
varying vec3 vWpos;
varying vec3 vNormal;
varying vec3 vColor;
varying float vMat;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vLocal = position;
  vWpos = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vColor = color;
  vMat = aMat;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${PRELUDE}
uniform float uOpen;
uniform float uFlash;
varying vec3 vLocal;
varying vec3 vWpos;
varying vec3 vNormal;
varying vec3 vColor;
varying float vMat;
void main() {
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWpos);
  vec3 col;
  if (vMat < 0.5) {
    float grain = snoise(vec2(vLocal.x * 1.3, (vLocal.y + vLocal.z) * 15.0)) * 0.5 + 0.5;
    float plank = smoothstep(0.035, 0.0, abs(fract(vLocal.y * 3.2 + 0.5) - 0.5) - 0.46);
    vec3 alb = vColor * (0.85 + 0.25 * grain) * (1.0 - 0.3 * plank);
    col = softShade(alb, N, V, vWpos, 0.5, 0.1, 18.0, 0.2, 0.7);
  } else if (vMat < 1.5) {
    vec3 R = reflect(-V, N);
    vec3 env = mix(vec3(0.32, 0.17, 0.04), vec3(1.3, 1.0, 0.5), smoothstep(-0.35, 0.75, R.y));
    float diff = clamp(dot(N, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
    col = vColor * env * (0.55 + 0.6 * diff) * depthLight(vWpos);
    vec3 H = normalize(uSunDir + V);
    col += uKeyColor * pow(max(dot(N, H), 0.0), 60.0) * 1.8;
    float glint = pow(max(sin(uTime * 2.3 + vWpos.x * 9.0 + vWpos.y * 7.0), 0.0), 40.0);
    col += vec3(1.6, 1.3, 0.7) * glint * 0.9;
  } else if (vMat < 2.5) {
    col = vColor * (uSkyAmb * 0.6 + 0.04);
  } else if (vMat < 3.5) {
    float pulse = 0.7 + 0.3 * sin(uTime * 2.0);
    col = vColor * 0.2 + vec3(2.4, 1.6, 0.5) * (uNight * pulse + uOpen * 1.5 + uFlash);
  } else {
    col = vColor * 0.3 + vec3(2.6, 1.9, 0.7) * (uOpen * 2.2 + uFlash * 0.8);
  }
  col += vec3(1.2, 0.9, 0.4) * uFlash * 0.25;
  col = applyFog(col, vWpos);
  gl_FragColor = vec4(col, 1.0);
}
`;

const WOOD = '#cf8448';
const WOOD_DARK = '#7d4626';
const GOLD = '#ffc94a';
const DARK = '#2a1408';

// RoundedBoxGeometry is non-indexed, so everything is made non-indexed before merging.
function tag(geo, color, mat) {
  if (geo.index) geo = geo.toNonIndexed();
  geo.deleteAttribute('uv');
  const n = geo.attributes.position.count;
  const c = new THREE.Color(color);
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(n).fill(mat), 1));
  return geo;
}

function box(w, h, d, r, x, y, z, color, mat) {
  const g = new RoundedBoxGeometry(w, h, d, 2, r);
  g.translate(x, y, z);
  return tag(g, color, mat);
}

function halfCylinder(radius, length, thetaSeg, openEnded) {
  const g = new THREE.CylinderGeometry(radius, radius, length, thetaSeg, 1, openEnded, 0, Math.PI);
  g.rotateZ(Math.PI / 2); // axis along x, the half with y >= 0
  return g;
}

export class Chest {
  constructor(x, z, rotY) {
    const W = 1.7;
    const H = 0.95;
    const D = 1.1;
    this.size = { W, H, D };
    this.group = new THREE.Group();
    this.group.position.set(x, sandHeight(x, z) - 0.1, z);
    this.group.rotation.set(0, rotY, 0.035);
    this.baseRotY = rotY;
    this.group.scale.setScalar(1.3);

    const bodyParts = [
      box(W, H, D, 0.06, 0, H / 2, 0, WOOD, 0),
      box(0.15, H + 0.04, D + 0.05, 0.03, -0.6, H / 2, 0, GOLD, 1),
      box(0.15, H + 0.04, D + 0.05, 0.03, 0.6, H / 2, 0, GOLD, 1),
      box(W + 0.05, 0.13, D + 0.05, 0.03, 0, 0.07, 0, GOLD, 1),
      box(0.36, 0.38, 0.09, 0.04, 0, H - 0.2, D / 2 + 0.03, GOLD, 1),
    ];
    const keyhole = new THREE.CylinderGeometry(0.05, 0.05, 0.05, 12);
    keyhole.rotateX(Math.PI / 2);
    keyhole.translate(0, H - 0.17, D / 2 + 0.075);
    bodyParts.push(tag(keyhole, DARK, 3));
    const slot = new THREE.BoxGeometry(0.035, 0.1, 0.05);
    slot.translate(0, H - 0.25, D / 2 + 0.075);
    bodyParts.push(tag(slot, DARK, 3));
    // the inside: a glowing heap of coins just under the lid
    const glow = new THREE.PlaneGeometry(W - 0.14, D - 0.14);
    glow.rotateX(-Math.PI / 2);
    glow.translate(0, H + 0.005, 0);
    bodyParts.push(tag(glow, '#ffcf6a', 4));
    const heap = new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    heap.scale(0.7, 0.16, 0.42);
    heap.translate(0, H - 0.02, 0);
    bodyParts.push(tag(heap, GOLD, 1));
    const bodyGeo = mergeGeometries(bodyParts, false);
    this.material = new THREE.ShaderMaterial({
      name: 'Chest',
      uniforms: withShared({ uOpen: { value: 0 }, uFlash: { value: 0 } }),
      vertexShader: VERT,
      fragmentShader: FRAG,
      vertexColors: true,
    });
    this.body = new THREE.Mesh(bodyGeo, this.material);
    this.group.add(this.body);

    // lid, hinged at the back top edge
    const lidParts = [];
    const shell = halfCylinder(D / 2, W, 22, false);
    lidParts.push(tag(shell, WOOD, 0));
    for (const bx of [-0.6, 0.6]) {
      const band = halfCylinder(D / 2 + 0.025, 0.15, 22, true);
      band.translate(bx, 0, 0);
      lidParts.push(tag(band, GOLD, 1));
    }
    const under = new THREE.PlaneGeometry(W - 0.02, D - 0.02);
    under.rotateX(Math.PI / 2);
    under.translate(0, 0.002, 0);
    lidParts.push(tag(under, WOOD_DARK, 0));
    const hasp = new RoundedBoxGeometry(0.22, 0.2, 0.06, 2, 0.025);
    hasp.translate(0, 0.02, D / 2 + 0.02);
    lidParts.push(tag(hasp, GOLD, 1));
    const lidGeo = mergeGeometries(lidParts, false);
    lidGeo.translate(0, 0, D / 2); // hinge at the back edge
    this.lid = new THREE.Mesh(lidGeo, this.material);
    this.pivot = new THREE.Group();
    this.pivot.position.set(0, H, -D / 2);
    this.pivot.add(this.lid);
    this.group.add(this.pivot);

    this.lidAngle = 0;
    this.lidTarget = 0;
    this.lidSpring = new Spring(0, 160, 13);
    this.squash = new Spring(1, 220, 12);
    this.nextPeek = 4 + Math.random() * 5;
    this.peekTimer = -1;
    this.openTimer = -1;
    this.bubbleTimer = 0;
    this.onBubbles = null; // (worldPos, count, spread) => void
  }

  // Front-centre of the lid gap in world space.
  gapWorld(out) {
    const { H, D } = this.size;
    out.set((Math.random() - 0.5) * 1.3, H + 0.05, D / 2 + 0.02);
    return this.group.localToWorld(out);
  }

  peek() {
    this.peekTimer = 0;
  }

  // Tap! Opens wide and throws out treasure (via onTreasure). Returns false if busy.
  open() {
    if (this.openTimer >= 0) {
      this.wiggle();
      return false;
    }
    this.openTimer = 0;
    this.peekTimer = -1;
    this.treasureDone = false;
    this.material.uniforms.uFlash.value = 1;
    this.squash.kick(-2.6);
    return true;
  }

  wiggle() {
    this.squash.kick(-1.8);
    this.shake = 1;
  }

  // Centre of the opening, in world space.
  mouthWorld(out) {
    out.set(0, this.size.H + 0.15, 0.05);
    return this.group.localToWorld(out);
  }

  update(t, dt) {
    this.shake = Math.max(0, (this.shake || 0) - dt * 1.6);
    this.group.rotation.y = this.baseRotY + Math.sin(t * 32) * 0.07 * this.shake;
    if (this.openTimer >= 0) {
      this.openTimer += dt;
      if (this.openTimer > 0.2 && !this.treasureDone) {
        this.treasureDone = true;
        this.onTreasure?.(this.mouthWorld(new THREE.Vector3()));
      }
      if (this.openTimer < 2.4 && this.onBubbles && Math.random() < dt * 14) this.onBubbles(this.gapWorld(new THREE.Vector3()), 1);
      this.lidSpring.target = this.openTimer < 2.6 ? -1.85 : 0;
      this.material.uniforms.uOpen.value = clamp(-this.lidSpring.value / 1.4, 0, 1);
      if (this.openTimer > 3.6) this.openTimer = -1;
    } else if (this.peekTimer >= 0) {
      this.peekTimer += dt;
      this.lidSpring.target = this.peekTimer < 0.9 ? -0.32 : 0;
      if (this.peekTimer > 0.15 && this.peekTimer < 0.95) {
        this.bubbleTimer -= dt;
        if (this.bubbleTimer <= 0 && this.onBubbles) {
          this.bubbleTimer = 0.06;
          this.onBubbles(this.gapWorld(new THREE.Vector3()), 1);
        }
      }
      if (this.peekTimer > 1.4) {
        this.peekTimer = -1;
        this.squash.kick(-1.6);
      }
      this.material.uniforms.uOpen.value = clamp(-this.lidSpring.value / 1.4, 0, 1) * 0.6;
    } else {
      this.nextPeek -= dt;
      if (this.nextPeek <= 0) {
        this.nextPeek = 7 + Math.random() * 7;
        this.peek();
      }
      this.lidSpring.target = 0;
      this.material.uniforms.uOpen.value *= Math.exp(-dt * 4);
    }
    this.lidSpring.update(dt);
    this.squash.update(dt);
    this.pivot.rotation.x = Math.min(this.lidSpring.value, 0.04);
    const s = this.squash.value;
    this.body.scale.set(1 + (1 - s) * 0.5, s, 1 + (1 - s) * 0.5);
    this.pivot.position.y = this.size.H * s;
    this.material.uniforms.uFlash.value *= Math.exp(-dt * 3);
  }
}

