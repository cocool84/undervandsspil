// The sandy floor: soft dunes rising into hills at the back, ripples, glittering grains,
// rainbow-edged caustics and soft contact shadows around rocks, corals and the chest.

import * as THREE from 'three';
import { fbm2, noise2 } from '../util/noise.js';
import { smoothstep } from '../util/math.js';
import { PRELUDE } from '../glsl/common.js';
import { withShared } from '../core/uniforms.js';

export const MAX_OCCLUDERS = 16;

// Height of the floor at (x, z). Also used to place things on the sand.
export function sandHeight(x, z) {
  let h = 0.36 * fbm2(x * 0.055 + 11.3, z * 0.055 - 4.1, 3);
  h += 0.1 * noise2(x * 0.19 + 3.1, z * 0.16 - 1.3);
  const back = smoothstep(-9, -60, z);
  h += back * (3.0 + 3.6 * fbm2(x * 0.028 + 7.7, z * 0.028 + 2.2, 3));
  h += smoothstep(13, 45, Math.abs(x)) * (2.2 + 1.6 * noise2(z * 0.05, x * 0.02));
  h -= 0.22 * Math.exp(-((x * x) / 60 + ((z - 2) * (z - 2)) / 40));
  return h;
}

const VERT = /* glsl */ `
attribute vec3 aSand; // contact shadow, tone, ripple warp (baked on the CPU)
varying vec3 vWpos;
varying vec3 vNormal;
varying vec3 vSand;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWpos = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vSand = aSand;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${PRELUDE}
uniform vec3 uSandLight;
uniform vec3 uSandDark;
varying vec3 vWpos;
varying vec3 vNormal;
varying vec3 vSand;

float sparkle(vec2 p) {
  vec2 g = p * 7.0;
  vec2 cell = floor(g);
  vec2 f = fract(g);
  float h = hash12(cell);
  vec2 c = hash22(cell + 7.1) * 0.7 + 0.15;
  float d = length(f - c);
  float tw = pow(max(sin(uTime * (1.4 + h * 2.6) + h * 40.0), 0.0), 14.0);
  return step(0.84, h) * smoothstep(0.1, 0.0, d) * tw;
}

void main() {
  vec3 N = normalize(vNormal);
  vec2 p = vWpos.xz;
  float camDist = length(vWpos - cameraPosition);

  // wind-blown ripples
  float ph = dot(p, vec2(1.35, 0.55)) * 2.5 + vSand.z;
  float rip = sin(ph);
  float near = 1.0 - smoothstep(22.0, 44.0, camDist);
  N = normalize(N + vec3(cos(ph) * 0.09, 0.0, cos(ph) * 0.035) * near);

  float n2 = 0.5 + 0.5 * sin(p.x * 3.1 + sin(p.y * 2.3)) * sin(p.y * 2.7 + sin(p.x * 1.9));
  vec3 alb = mix(uSandDark, uSandLight, smoothstep(0.12, 0.88, vSand.y * 0.72 + n2 * 0.28));
  alb *= 0.93 + 0.07 * rip * near;
  float ao = vSand.x;
  alb *= ao;

  vec3 V = normalize(cameraPosition - vWpos);
  vec3 col = softShade(alb, N, V, vWpos, 0.5, 0.1, 18.0, 0.0, 0.0);
  float dl = depthLight(vWpos);
  vec3 cau = causticsRGB(vWpos);
  col += (alb * 0.9 + 0.15) * uKeyColor * cau * uCausticsStrength * 1.7 * dl * mix(ao, 1.0, 0.4);

  float sp = sparkle(p) * near;
  col += mix(vec3(1.5, 1.42, 1.25), vec3(0.35, 1.7, 1.9), uNight) * sp * (1.0 + uNight);

  col = applyFog(col, vWpos);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createSand() {
  const geo = new THREE.PlaneGeometry(150, 100, 150, 110);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -30); // z from -80 to +20
  geo.deleteAttribute('uv');
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, sandHeight(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const sandAttr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    sandAttr[i * 3] = 1;
    sandAttr[i * 3 + 1] = noise2(x * 0.17, z * 0.17) * 0.5 + 0.5;
    sandAttr[i * 3 + 2] = noise2(x * 0.21 + 40, z * 0.21 - 17) * 2.3;
  }
  const sandAttribute = new THREE.BufferAttribute(sandAttr, 3);
  geo.setAttribute('aSand', sandAttribute);

  const mat = new THREE.ShaderMaterial({
    name: 'Sand',
    uniforms: withShared({
      uSandLight: { value: new THREE.Color('#ffecc8') },
      uSandDark: { value: new THREE.Color('#e8c592') },
    }),
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
  const mesh = new THREE.Mesh(geo, mat);

  return {
    mesh,
    // Soft contact shadows around static things, baked into the vertices. list: [x, z, radius]
    setOccluders(list) {
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        let ao = 1;
        for (const [ox, oz, r] of list) {
          const dx = x - ox;
          const dz = z - oz;
          ao *= 1 - 0.4 * Math.exp(-(dx * dx + dz * dz) / (r * r));
        }
        sandAttr[i * 3] = ao;
      }
      sandAttribute.needsUpdate = true;
    },
  };
}
