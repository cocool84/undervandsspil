// Peek-a-boo starfish: tap the sand and now and then a little starfish pops up out of it,
// waves its arms at the child, blinks — and wriggles back down into the sand.

import * as THREE from 'three';
import { PRELUDE } from '../glsl/common.js';
import { withShared } from '../core/uniforms.js';
import { sandHeight } from './sand.js';
import { clamp, easeOutBack } from '../util/math.js';

const VERT = /* glsl */ `
uniform float uWave;
varying vec3 vN;
varying vec3 vWpos;
varying vec2 vP;
void main() {
  vec3 p = position;
  // the arms wave: the further out, the more they bend
  float r = length(p.xy);
  float a = atan(p.y, p.x);
  p.z += sin(a * 2.0 + uWave * 9.0) * 0.12 * r * r;
  p.xy *= 1.0 + 0.06 * sin(uWave * 9.0 + a * 5.0) * r;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWpos = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vP = position.xy;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${PRELUDE}
uniform vec3 uColor;
uniform float uBlink;
varying vec3 vN;
varying vec3 vWpos;
varying vec2 vP;
float disc(vec2 p, vec2 c, float r) {
  float d = length(p - c) - r;
  return 1.0 - smoothstep(-0.008, 0.008, d);
}
void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWpos);
  vec2 p = vP;
  // bumpy dots on the arms
  vec2 g = fract(p * 9.0) - 0.5;
  float dots = smoothstep(0.22, 0.14, length(g)) * smoothstep(0.18, 0.3, length(p));
  vec3 alb = mix(uColor, uColor * 1.25 + 0.12, dots * 0.7);
  vec3 col = softShade(alb, N, V, vWpos, 0.6, 0.4, 24.0, 0.4, 0.5);
  // a happy face in the middle (only on the front)
  if (dot(N, V) > 0.0) {
    for (int i = 0; i < 2; i++) {
      vec2 c = vec2(i == 0 ? -0.1 : 0.1, 0.06);
      if (uBlink < 0.5) {
        col = mix(col, vec3(1.0), disc(p, c, 0.075));
        col = mix(col, vec3(0.05, 0.03, 0.08), disc(p, c + vec2(0.0, -0.012), 0.042));
        col = mix(col, vec3(1.0), disc(p, c + vec2(0.015, 0.008), 0.014));
      } else {
        // closed: a happy little arc
        float x = (p.x - c.x) / 0.07;
        float closed = smoothstep(0.014, 0.0, abs(p.y - c.y + 0.025 * (1.0 - x * x))) * step(abs(x), 1.0);
        col = mix(col, vec3(0.1, 0.05, 0.08), closed);
      }
    }
    float smile = smoothstep(0.012, 0.0, abs(length(p - vec2(0.0, 0.0)) - 0.09)) * step(p.y, -0.035);
    col = mix(col, vec3(0.35, 0.05, 0.1), smile);
    float cheek = disc(p, vec2(-0.17, -0.04), 0.04) + disc(p, vec2(0.17, -0.04), 0.04);
    col = mix(col, vec3(1.0, 0.45, 0.55), cheek * 0.6);
  }
  col = applyFog(col, vWpos);
  gl_FragColor = vec4(col, 1.0);
}
`;

// A soft, puffy five-armed star in the xy plane (its face looks along +z).
function starGeometry(R = 0.5) {
  const N = 90;
  const RINGS = 7;
  const pos = [0, 0, 0.13];
  const idx = [];
  for (let j = 1; j <= RINGS; j++) {
    const k = j / RINGS;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + Math.PI / 2;
      const arm = Math.pow(Math.abs(Math.cos((a - Math.PI / 2) * 2.5)), 2.2);
      const r = R * k * (0.42 + 0.58 * arm);
      const z = 0.13 * Math.sqrt(Math.max(1 - k * k, 0)) * (0.7 + 0.3 * arm) + 0.02;
      pos.push(Math.cos(a) * r, Math.sin(a) * r, z);
    }
  }
  for (let i = 0; i < N; i++) idx.push(0, 1 + i, 1 + ((i + 1) % N));
  for (let j = 1; j < RINGS; j++) {
    const a0 = 1 + (j - 1) * N;
    const b0 = 1 + j * N;
    for (let i = 0; i < N; i++) {
      const i1 = (i + 1) % N;
      idx.push(a0 + i, b0 + i, b0 + i1, a0 + i, b0 + i1, a0 + i1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const COLORS = ['#ff8a5c', '#ff6fa8', '#ffb13d', '#b07cff'];

export class Starfish {
  constructor() {
    this.material = new THREE.ShaderMaterial({
      name: 'Starfish',
      uniforms: withShared({ uColor: { value: new THREE.Color(COLORS[0]) }, uWave: { value: 0 }, uBlink: { value: 0 } }),
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(starGeometry(), this.material);
    this.mesh.visible = false;
    this.t = -1;
    this.base = new THREE.Vector3();
    this.colorIndex = 0;
  }

  get busy() {
    return this.t >= 0;
  }

  // Pop up out of the sand at (x, z), facing the camera.
  peek(x, z, camera) {
    if (this.busy) return false;
    this.base.set(x, sandHeight(x, z), z);
    this.colorIndex = (this.colorIndex + 1) % COLORS.length;
    this.material.uniforms.uColor.value.set(COLORS[this.colorIndex]);
    this.yaw = Math.atan2(camera.position.x - x, camera.position.z - z);
    this.t = 0;
    this.mesh.visible = true;
    return true;
  }

  update(dt) {
    if (this.t < 0) return;
    this.t += dt;
    const t = this.t;
    const up = t < 0.45 ? easeOutBack(t / 0.45) : t < 2.6 ? 1 : 1 - clamp((t - 2.6) / 0.45, 0, 1);
    const m = this.mesh;
    m.position.copy(this.base);
    m.position.y += -0.7 + up * 1.35;
    m.rotation.set(-0.15, this.yaw, Math.sin(t * 7) * 0.22 * Math.min(t / 0.5, 1) * (t < 2.6 ? 1 : 0));
    m.scale.setScalar((0.8 + 0.2 * up) * 1.5);
    this.material.uniforms.uWave.value = t;
    this.material.uniforms.uBlink.value = (t > 1.2 && t < 1.35) || (t > 1.5 && t < 1.62) ? 1 : 0;
    if (t > 3.1) {
      this.t = -1;
      m.visible = false;
    }
  }
}
