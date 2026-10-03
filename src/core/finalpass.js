// The last post-processing pass, written straight to the screen. In one full-screen pass it
// does: touch ripples (screen-space refraction), depth of field, grading, vignette,
// tone mapping, sRGB conversion and dithering.

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { FULLSCREEN_VERT, GLSL_SANITIZE } from '../glsl/common.js';

export const MAX_RIPPLES = 6;

const FRAG = /* glsl */ `
#include <packing>
${GLSL_SANITIZE}
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform float uNear;
uniform float uFar;
uniform vec2 uResolution;
uniform float uTime;
uniform float uFocusDist;
uniform float uFocusRange;
uniform float uMaxBlur;
uniform float uDof;
uniform float uGlobalBlur;
uniform float uTaps;
uniform vec4 uRipples[${MAX_RIPPLES}];
uniform float uVignette;
uniform float uExposure;
uniform float uSaturation;
uniform float uDebugDepth;
varying vec2 vUv;

float viewDist(float depth) {
  return -perspectiveDepthToViewZ(depth, uNear, uFar);
}

float cocAt(vec2 uv) {
  float d = texture2D(tDepth, uv).r;
  if (d >= 0.99999) return uGlobalBlur;            // open water background: already soft
  float z = viewDist(d);
  float c = (abs(z - uFocusDist) - uFocusRange) / uFocusDist;
  if (z < uFocusDist) c *= 2.2;                    // the foreground blurs faster
  return clamp(max(c, 0.0) * uDof + uGlobalBlur, 0.0, 1.0);
}

// Khronos PBR Neutral: keeps hues and saturation, only rolls off the highlights.
vec3 neutralTonemap(vec3 color) {
  const float startCompression = 0.76;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  const float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}

vec3 toSRGB(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / uResolution.y;

  // Touch ripples: expanding rings that bend the picture like a water surface.
  vec2 disp = vec2(0.0);
  float crest = 0.0;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 r = uRipples[i];
    float age = uTime - r.z;
    if (age < 0.0 || age > 1.8) continue;
    vec2 d = (uv - r.xy) * vec2(aspect, 1.0);
    float dist = length(d);
    float radius = 0.012 + age * 0.38;
    float x = dist - radius;
    float life = 1.0 - age / 1.8;
    float env = exp(-x * x * 700.0) * life * life * r.w;
    float wave = sin(x * 120.0) * env;
    disp += (d / max(dist, 1e-4)) * wave * 0.011 * vec2(1.0 / aspect, 1.0);
    crest += max(wave, 0.0);
  }
  uv += disp;

  if (uDebugDepth > 0.5) {
    float dd = texture2D(tDepth, uv).r;
    float z = dd >= 0.99999 ? 1.0 : clamp(viewDist(dd) / 70.0, 0.0, 1.0);
    gl_FragColor = vec4(vec3(1.0 - z), 1.0);
    return;
  }

  vec3 col;
  float coc = (uDof + uGlobalBlur) > 0.001 ? cocAt(uv) : 0.0;
  if (coc > 0.02) {
    vec2 px = 1.0 / uResolution;
    float radius = coc * uMaxBlur;
    vec3 acc = aqSafe(texture2D(tDiffuse, uv).rgb);
    float wsum = 1.0;
    for (int i = 0; i < 12; i++) {
      if (float(i) >= uTaps) break;
      float fi = float(i) + 0.5;
      float r = sqrt(fi / uTaps) * radius;
      float a = fi * 2.39996323;
      vec2 suv = uv + vec2(cos(a), sin(a)) * r * px;
      float sc = cocAt(suv) * uMaxBlur;
      // A neighbour only counts if its own blur reaches us, so sharp things don't smear.
      float w = clamp(sc - r + 1.0, 0.0, 1.0);
      acc += aqSafe(texture2D(tDiffuse, suv).rgb) * w;
      wsum += w;
    }
    col = acc / wsum;
  } else {
    col = aqSafe(texture2D(tDiffuse, uv).rgb);
  }

  col += vec3(0.5, 0.85, 1.0) * crest * 0.16;
  col *= uExposure;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(l), col, uSaturation), vec3(0.0));
  col = neutralTonemap(col);

  vec2 q = vUv - 0.5;
  q.x *= mix(1.0, aspect, 0.6);
  col *= 1.0 - uVignette * smoothstep(0.32, 0.95, length(q) * 1.25);

  col = toSRGB(col);
  float n = hash12(gl_FragCoord.xy + fract(uTime * 7.31) * 113.0) + hash12(gl_FragCoord.yx * 1.37 + 17.0) - 1.0;
  col += n / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

export class FinalPass extends Pass {
  constructor() {
    super();
    this.uniforms = {
      tDiffuse: { value: null },
      tDepth: { value: null },
      uNear: { value: 0.5 },
      uFar: { value: 500 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uFocusDist: { value: 24 },
      uFocusRange: { value: 7 },
      uMaxBlur: { value: 9 },
      uDof: { value: 1 },
      uGlobalBlur: { value: 0 },
      uTaps: { value: 12 },
      uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0)) },
      uVignette: { value: 0.34 },
      uExposure: { value: 1.04 },
      uSaturation: { value: 1.22 },
      uDebugDepth: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      name: 'FinalPass',
      uniforms: this.uniforms,
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
    this._rippleCursor = 0;
  }

  // Ripple centre in screen uv (0..1, origin bottom-left).
  addRipple(u, v, time, strength = 1) {
    const r = this.uniforms.uRipples.value[this._rippleCursor];
    r.set(u, v, time, strength);
    this._rippleCursor = (this._rippleCursor + 1) % MAX_RIPPLES;
  }

  setSize(width, height) {
    this.uniforms.uResolution.value.set(width, height);
    // Keep the blur radius visually constant across resolutions (tuned at 1180 px wide).
    this.uniforms.uMaxBlur.value = 7.5 * (Math.max(width, height) / 1770);
  }

  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.tDepth.value = readBuffer.depthTexture;
    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    this.fsQuad.render(renderer);
  }

  dispose() {
    this.material.dispose();
    this.fsQuad.dispose();
  }
}
