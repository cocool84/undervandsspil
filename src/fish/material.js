// The fish shader (also worn by the big animals of the open sea). Vertex: body wave (side to
// side, or up and down for dolphins, orcas and whales), turning bend, fin flaps, squash &
// stretch, puffing. Fragment: painted texture + pattern, countershading, the animals'
// markings, glossy soft light, a smiling mouth, rosy cheeks, night glow — and eyes drawn
// analytically (iris, pupil that looks at things, highlights, eyelids for blinking and the
// four eye types).

import * as THREE from 'three';
import { PRELUDE } from '../glsl/common.js';
import { withShared } from '../core/uniforms.js';

const VERT = /* glsl */ `
${PRELUDE}
attribute float aPart;
attribute float aU;
attribute float aFin;
attribute vec4 aEye;
attribute vec3 aEyeC;
uniform float uSwimPhase;
uniform float uSwimAmp;
uniform float uWaveK;
uniform float uLen;
uniform float uBend;
uniform float uFinPhase;
uniform float uPuff;
uniform vec3 uSquash;
uniform vec2 uEyeScale;
uniform vec4 uAnimal; // species (0: a fish), flukes up and down, flipper flap, fin ripple
varying vec2 vUv;
varying vec3 vRest;
varying vec3 vN;
varying vec3 vWpos;
varying float vPart;
varying vec4 vEye;
varying float vFin;
varying float vU;
void main() {
  vec3 p = position;
  vec3 n = normal;
  float part = aPart;
  if (part > 3.5 && part < 4.5) {
    float s = aEye.w > 0.0 ? uEyeScale.x : uEyeScale.y;
    p = aEyeC + (p - aEyeC) * s;
  }
  if (part > 4.5) {
    p = aEyeC + (p - aEyeC) * (0.5 + uPuff * 1.1);
  }
  if (uPuff > 0.001 && (part < 0.5 || part > 3.5)) {
    vec3 c = vec3(0.05, 0.0, 0.0);
    p = c + (p - c) * (1.0 + uPuff * 0.32);
  }
  if (part > 2.5 && part < 3.5) {
    float flap = sin(uFinPhase) * aFin * uAnimal.z;
    p.z += flap * 0.13 * sign(p.z);
    p.y += flap * 0.05;
  }
  if (part > 0.5 && part < 3.5) {
    p.y += sin(uFinPhase * 1.7 + aU * 14.0) * 0.02 * aFin * uAnimal.w;
    p.z += sin(uFinPhase * 1.3 + aU * 11.0) * 0.035 * aFin * uAnimal.w;
  }
  float u = aU;
  float amp = uSwimAmp * (0.05 + u * u * 1.4);
  float ph = uSwimPhase - u * uWaveK;
  float wave = sin(ph) * amp;
  float waveD = -cos(ph) * uWaveK * amp + sin(ph) * uSwimAmp * 2.8 * u;
  float side = 1.0 - uAnimal.y;
  float f = wave * side + uBend * u * u;
  float fd = waveD * side + uBend * 2.0 * u;
  p.z += f;
  float a = atan(-fd / uLen);
  float ca = cos(a);
  float sa = sin(a);
  n = vec3(n.x * ca - n.z * sa, n.y, n.x * sa + n.z * ca);
  if (uAnimal.y > 0.5) {
    // flukes beating up and down
    p.y += wave;
    float b = atan(-waveD / uLen);
    float cb = cos(b);
    float sb = sin(b);
    n = vec3(n.x * cb - n.y * sb, n.x * sb + n.y * cb, n.z);
  }
  p *= uSquash;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWpos = wp.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  vRest = position;
  vUv = uv;
  vPart = part;
  vEye = aEye;
  vFin = aFin;
  vU = u;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${PRELUDE}
uniform sampler2D uPaint;
uniform vec3 uBaseColor;
uniform vec3 uPatternColor;
uniform vec3 uIrisColor;
uniform vec3 uGlowColor;
uniform float uPattern;
uniform float uEyeType;
uniform float uBlink;
uniform float uDrowsy;
uniform vec4 uLook;
uniform float uMouth;
uniform float uHappy;
uniform float uGlow;
uniform float uFlash;
uniform vec4 uFace;
uniform vec4 uBlush;
uniform float uGlint;
uniform vec4 uAnimal;
uniform vec2 uMouthK; // smile curve, line width
uniform vec4 uMarks;  // eye x, y; blowhole x, height of the back there
varying vec2 vUv;
varying vec3 vRest;
varying vec3 vN;
varying vec3 vWpos;
varying float vPart;
varying vec4 vEye;
varying float vFin;
varying float vU;

vec3 rainbow(float h) {
  return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

float patternMask(vec2 uv) {
  if (uPattern < 1.5) {                       // stripes: bold bands across the body
    float s = abs(fract(uv.x * 5.6 + 0.35) - 0.5);
    return smoothstep(0.2, 0.15, s) * smoothstep(0.06, 0.1, uv.x);
  }
  vec2 g = vec2(uv.x * 15.0, uv.y * 10.0);     // dots on a staggered grid
  g.x += step(1.0, mod(floor(g.y), 2.0)) * 0.5;
  vec2 f = fract(g) - 0.5;
  return smoothstep(0.3, 0.22, length(f));
}

// The big animals' markings: light bellies, the orca's white patches and grey saddle, the
// shark's gill slits, the whale's pleated throat and the blowholes. They stay under the
// child's own painting: bare is 1 where the fish still shows its plain base colour.
vec3 animalMarks(vec3 alb, float bare) {
  float v = vUv.y;              // 0 top … 1 belly (both sides)
  float u = vUv.x / 0.8;        // 0 nose … 1 tail root
  float flank = smoothstep(0.06, 0.18, abs(vRest.z));
  vec3 pale = mix(alb, vec3(1.0, 0.98, 0.95), 0.86);
  float m = 0.0;
  if (uAnimal.x < 1.5) {                                  // dolphin
    m = smoothstep(0.57, 0.65, v + 0.05 * sin(u * 7.0 + 0.5));
    alb *= 1.0 - 0.14 * smoothstep(0.32, 0.05, v) * bare; // a darker cape along the back
  } else if (uAnimal.x < 2.5) {                           // shark
    m = smoothstep(0.59, 0.62, v + 0.03 * sin(u * 18.0));
    float g = 0.0;
    for (int i = 0; i < 4; i++) {
      float gx = uMarks.x - 0.2 - float(i) * 0.075;
      float d = abs(vRest.x - gx + 0.12 * (vRest.y - uMarks.y));
      g = max(g, smoothstep(0.014, 0.006, d) * smoothstep(0.13, 0.09, abs(vRest.y - uMarks.y + 0.1)));
    }
    alb *= 1.0 - g * flank * 0.45 * bare;
  } else if (uAnimal.x < 3.5) {                           // orca
    float edge = 0.6 - 0.22 * exp(-pow((u - 0.58) / 0.09, 2.0));
    m = smoothstep(edge, edge + 0.025, v) * smoothstep(0.82, 0.74, u + (v - 0.6) * 0.3);
    vec2 e = (vRest.xy - uMarks.xy - vec2(-0.32, 0.15)) / vec2(0.3, 0.1);
    m = max(m, (1.0 - smoothstep(0.85, 1.0, length(e))) * flank);
    float saddle = smoothstep(0.16, 0.06, v) * exp(-pow((u - 0.6) / 0.07, 2.0));
    alb = mix(alb, mix(alb, pale, 0.45), saddle * bare);
  } else {                                                // whale
    float throat = smoothstep(0.6, 0.7, v) * smoothstep(0.52, 0.36, u);
    m = throat * (0.72 + 0.28 * smoothstep(-0.3, 0.6, sin(v * 90.0)));
  }
  vec2 hole = vec2((vRest.x - uMarks.z) / 0.035, vRest.z / 0.075);
  alb *= 1.0 - (1.0 - smoothstep(0.6, 1.0, length(hole))) * step(uMarks.w - 0.08, vRest.y) * 0.55 * bare;
  return mix(alb, pale, m * bare);
}

vec3 drawEye(vec3 N) {
  vec2 p = vEye.xy;                            // x forward, y up, on the eye dome
  float side = vEye.w;
  float r = length(p);
  float aa = max(fwidth(r) * 1.5, 0.006);
  vec2 look = side > 0.0 ? uLook.xy : uLook.zw;
  float irisR = uEyeType > 2.5 ? 0.5 : 0.6;               // googly eyes: smaller pupils that roll about
  if (uEyeType > 1.5 && uEyeType < 2.5) look.y += 0.12;
  vec2 ip = p - look * 0.34;
  float ir = length(ip);
  vec3 sclera = mix(vec3(1.0), vec3(0.8, 0.86, 0.96), smoothstep(0.45, 1.0, r));
  vec3 iris = mix(uIrisColor * 1.25 + 0.04, uIrisColor * 0.45, smoothstep(0.0, irisR, ir));
  vec3 col = mix(sclera, iris, 1.0 - smoothstep(irisR - aa, irisR + aa, ir));
  float pr = irisR * 0.62;
  col = mix(col, vec3(0.012, 0.012, 0.03), 1.0 - smoothstep(pr - aa, pr + aa, ir));
  float h1 = 1.0 - smoothstep(0.19 - aa, 0.19 + aa, length(p - vec2(0.24, 0.3)));
  float h2 = 1.0 - smoothstep(0.085 - aa, 0.085 + aa, length(p - vec2(-0.18, -0.24)));
  col = mix(col, vec3(uGlint), max(h1, h2 * 0.9));

  // eyelids
  float top = 1.12;
  float bottom = -1.12;
  float arch = 0.0;
  if (uEyeType > 0.5 && uEyeType < 1.5) { top = 0.42; bottom = -0.86; }  // sleepy: heavy lids, still open
  if (uEyeType > 1.5 && uEyeType < 2.5) { bottom = -0.66; arch = 0.5; }  // happy: smiling lower lid
  top -= uDrowsy * 0.3;
  bottom = mix(bottom, -0.05, uHappy);
  arch = mix(arch, 0.5, uHappy);
  top = mix(top, -0.12, uBlink);
  float topEdge = top - 0.14 * p.x * p.x;
  float botEdge = bottom + arch * (1.0 - p.x * p.x);
  float lt = smoothstep(topEdge - aa, topEdge + aa, p.y);
  float lb = 1.0 - smoothstep(botEdge - aa, botEdge + aa, p.y);
  float lid = max(lt, lb);
  vec3 lidCol = uBaseColor * 0.85;
  col = mix(col, lidCol, lid);
  float lash = (1.0 - lid) * max(smoothstep(0.07, 0.0, abs(p.y - topEdge)) * step(topEdge, 1.0), smoothstep(0.05, 0.0, abs(p.y - botEdge)) * step(-1.0, botEdge) * 0.6);
  col = mix(col, vec3(0.1, 0.05, 0.08), lash * 0.9);
  col = mix(col, vec3(0.09, 0.07, 0.13), smoothstep(0.9, 0.985, r) * (1.0 - lid * 0.6));
  float light = 0.82 + 0.18 * max(dot(N, uSunDir), 0.0);
  return col * light * (uSkyAmb * 0.35 + uKeyColor * 0.72 + 0.08) * mix(1.0, 0.8, uNight);
}

void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWpos);
  vec3 col;
  if (vPart > 3.5 && vPart < 4.5) {
    col = drawEye(N);
  } else {
    vec3 alb = texture2D(uPaint, vUv).rgb;
    float bare = 1.0 - smoothstep(0.04, 0.14, length(alb - uBaseColor));
    float pm = 0.0;
    vec3 rb = vec3(0.0);
    if (uPattern > 2.5) {
      rb = rainbow(fract(vUv.x * 1.15 + 0.94 + vUv.y * 0.08));
      alb = mix(alb, rb * 0.92 + 0.04, 0.68);
    } else if (uPattern > 0.5) {
      pm = patternMask(vUv);
      alb = mix(alb, uPatternColor, pm * 0.93);
    }
    bool body = vPart < 0.5 || vPart > 4.5;
    bool fin = vPart > 0.5 && vPart < 3.5;
    if (body && uAnimal.x > 0.5) alb = animalMarks(alb, bare);
    if (body) {
      float belly = smoothstep(0.55, 0.95, vUv.y);
      float back = smoothstep(0.35, 0.0, vUv.y);
      alb = mix(alb, alb * 0.5 + vec3(0.5), belly * 0.4);
      alb *= 1.0 - back * 0.12;
      // smiling mouth (object space, so it reads from the side and the front)
      float dx = uFace.x - vRest.x;
      float yLine = uFace.y + uMouthK.x * dx * dx;
      // a fish opens a little round mouth; a big animal opens its long smile wide (nom nom!)
      float animalMouth = step(0.5, uAnimal.x);
      float lw = uMouthK.y * (1.0 + animalMouth * uMouth * 3.5);
      float m = smoothstep(lw, lw * 0.45, abs(vRest.y - yLine)) * step(dx, uFace.z);
      float o = length(vec2(dx * 1.3, vRest.y - uFace.y));
      float os = uMouthK.y * 4.25;
      float om = (1.0 - smoothstep(os * uMouth, os * uMouth + 0.012, o)) * step(0.02, uMouth) * (1.0 - animalMouth);
      alb = mix(alb, vec3(0.3, 0.04, 0.07), max(m * (1.0 - uMouth * (1.0 - animalMouth)), om));
      // rosy cheeks
      vec2 bd = vec2(vRest.x - uBlush.x, vRest.y - uBlush.y);
      float bl = exp(-dot(bd, bd) / (uFace.w * uFace.w)) * smoothstep(uBlush.z * 0.5, uBlush.z, abs(vRest.z));
      alb = mix(alb, vec3(1.0, 0.4, 0.55), bl * (uBlush.w + uHappy * 0.4));
    }
    bool animal = uAnimal.x > 0.5;
    if (fin && !animal) {
      float rays = 0.86 + 0.14 * sin((vPart < 1.5 ? vUv.y : vU) * 90.0);
      alb = mix(alb, vec3(1.0), vPart > 2.5 ? 0.1 : 0.22) * rays;
    }
    // the humpback's flippers are pale underneath
    if (fin && uAnimal.x > 3.5 && vPart > 2.5) alb = mix(alb, vec3(0.92, 0.94, 0.96), 0.6 * bare * smoothstep(0.0, -0.5, N.y));
    col = softShade(alb, N, V, vWpos, 0.65, 0.55, 42.0, 0.5, 0.75);
    if (fin && !animal) col += alb * (uKeyColor * max(dot(-N, uSunDir), 0.0) * 0.35 + (vPart > 2.5 ? 0.28 : 0.12));
    float glowMask = uPattern > 0.5 && uPattern < 2.5 ? pm : (uPattern > 2.5 ? 0.3 : 0.0);
    if (fin) glowMask = max(glowMask, vFin * 0.8);
    float pulse = 0.65 + 0.35 * sin(uTime * 2.2 + vU * 6.0);
    vec3 glowCol = uPattern > 2.5 ? rb * 1.4 : uGlowColor;   // rainbow fish glow in all colours
    col += glowCol * glowMask * uGlow * uNight * pulse * 2.2;
    col += vec3(1.0, 0.92, 0.8) * uFlash * 0.4;
  }
  col = applyFog(col, vWpos);
  gl_FragColor = vec4(col, 1.0);
}
`;

const FISH = new THREE.Vector4(0, 0, 1, 1);
const FISH_MOUTH = new THREE.Vector2(2.6, 0.02);
const NO_MARKS = new THREE.Vector4(0, 0, -100, 0);

export function createFishMaterial({ texture, meta, dna, persona, patternColor }) {
  const base = new THREE.Color(dna.color);
  return new THREE.ShaderMaterial({
    name: 'Fish',
    uniforms: withShared({
      uPaint: { value: texture },
      uBaseColor: { value: base },
      uPatternColor: { value: patternColor },
      uIrisColor: { value: persona.iris },
      uGlowColor: { value: persona.glow },
      uPattern: { value: dna.pattern },
      uEyeType: { value: dna.eyes },
      uBlink: { value: 0 },
      uDrowsy: { value: 0 },
      uLook: { value: new THREE.Vector4() },
      uMouth: { value: 0 },
      uHappy: { value: 0 },
      uGlow: { value: dna.glow ? 1 : 0 },
      uFlash: { value: 0 },
      uFace: { value: meta.face },
      uGlint: { value: 1.7 },
      uBlush: { value: meta.blush },
      uAnimal: { value: meta.animal ?? FISH },
      uMouthK: { value: meta.mouthK ?? FISH_MOUTH },
      uMarks: { value: meta.marks ?? NO_MARKS },
      uSwimPhase: { value: 0 },
      uSwimAmp: { value: meta.def.swimAmp },
      uWaveK: { value: meta.def.waveK },
      uLen: { value: meta.total },
      uBend: { value: 0 },
      uFinPhase: { value: 0 },
      uPuff: { value: 0 },
      uSquash: { value: new THREE.Vector3(1, 1, 1) },
      uEyeScale: { value: new THREE.Vector2(1, 1) },
    }),
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.DoubleSide,
  });
}
