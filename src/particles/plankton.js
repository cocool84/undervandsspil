// Floating plankton/dust. All motion happens in the vertex shader (no CPU work).
// Points blur themselves: the further from focus, the bigger and fainter (bokeh).
// At night some glow cyan and sparkle up around fingers.

import * as THREE from 'three';
import { PRELUDE } from '../glsl/common.js';
import { withShared } from '../core/uniforms.js';
import { mulberry32 } from '../util/rng.js';

const VERT = /* glsl */ `
${PRELUDE}
attribute vec4 aSeed;
uniform float uPixelRatio;
uniform float uViewH;
uniform float uFocus;
uniform vec3 uBox;
uniform vec3 uBoxCenter;
varying float vAlpha;
varying float vGlow;
varying float vSoft;
void main() {
  vec3 drift = vec3(0.12, 0.03, 0.06) * uTime * (0.6 + aSeed.w * 0.8);
  vec3 p = aSeed.xyz * uBox + drift;
  p.x += sin(uTime * 0.3 + aSeed.w * 30.0) * 0.4;
  p.y += sin(uTime * 0.23 + aSeed.x * 20.0) * 0.3;
  p = mod(p, uBox) - uBox * 0.5 + uBoxCenter;

  // sparkle near recent touches (night)
  float touchGlow = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 tp = uTouches[i];
    float age = uTime - tp.w;
    if (age < 0.0 || age > 2.5) continue;
    vec3 d = p - tp.xyz;
    touchGlow += exp(-dot(d, d) * 0.35) * exp(-age * 1.4);
  }

  vec4 mv = viewMatrix * vec4(p, 1.0);
  float dist = max(-mv.z, 0.1);
  float coc = clamp(abs(dist - uFocus) / (uFocus * 0.55) - 0.22, 0.0, 1.6);
  float size = 0.03 + 0.05 * fract(aSeed.w * 7.13);
  float grow = 1.0 + min(coc, 0.8) * 4.0;
  gl_PointSize = min(max(size * uViewH / dist * grow, 1.0) * (1.0 + touchGlow * uNight), 48.0 * uPixelRatio);
  float glowy = step(0.68, fract(aSeed.w * 3.7));
  vAlpha = (0.45 + 0.6 * fract(aSeed.z * 13.1)) / pow(grow, 1.25);
  vAlpha *= 0.65 + 0.35 * sin(uTime * (1.0 + aSeed.y * 2.0) + aSeed.x * 50.0);
  vAlpha *= 1.0 - fogFactor(dist) * 0.85;
  vAlpha *= smoothstep(4.0, 9.0, dist);
  vGlow = glowy * uNight * (1.0 + touchGlow * 3.0);
  vSoft = clamp(coc, 0.0, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform float uNight;
varying float vAlpha;
varying float vGlow;
varying float vSoft;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  float disc = 1.0 - smoothstep(mix(0.15, 0.7, vSoft), 1.0, r);
  vec3 day = vec3(0.85, 0.95, 1.0) * 0.6 * (1.0 - uNight * 0.65);
  vec3 col = day + vec3(0.3, 1.5, 1.7) * vGlow;
  float a = disc * vAlpha;
  gl_FragColor = vec4(col * a, a);
}
`;

export class Plankton {
  constructor(count = 900) {
    this.max = count;
    const r = mulberry32(77);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count * 4; i++) seeds[i] = r();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    this.material = new THREE.ShaderMaterial({
      name: 'Plankton',
      uniforms: withShared({
        uPixelRatio: { value: 1 },
        uViewH: { value: 800 },
        uFocus: { value: 24 },
        uBox: { value: new THREE.Vector3(38, 19, 32) },
        uBoxCenter: { value: new THREE.Vector3(0, 7.5, 1) },
      }),
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
  }

  setFraction(f) {
    this.points.geometry.setDrawRange(0, Math.floor(this.max * f));
  }

  // drawing-buffer height and camera fov → pixels per world unit at distance 1
  update(camera, bufferHeight, pixelRatio) {
    const fov = THREE.MathUtils.degToRad(camera.fov);
    this.material.uniforms.uViewH.value = bufferHeight / (2 * Math.tan(fov / 2));
    this.material.uniforms.uPixelRatio.value = pixelRatio;
  }
}
