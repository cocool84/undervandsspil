// God rays: soft additive light shafts from the surface (moonbeams at night). One
// InstancedMesh; each shaft turns around its own axis to face the camera.

import * as THREE from 'three';
import { PRELUDE } from '../glsl/common.js';
import { withShared } from '../core/uniforms.js';

const MAX_RAYS = 9;

const VERT = /* glsl */ `
${PRELUDE}
attribute vec4 aRay; // width, length, phase, keepAtNight
varying vec2 vUv;
varying float vPhase;
varying float vKeep;
varying vec3 vWpos;
void main() {
  vec3 top = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 axis = normalize(vec3(-uSunDir.x * 0.42, -1.0, -uSunDir.z * 0.42));
  vec3 toCam = normalize(cameraPosition - top);
  vec3 side = normalize(cross(axis, toCam));
  float along = -position.y;            // 0 at the surface … 1 at the far end
  float w = aRay.x * mix(0.75, 1.45, along);
  vec3 wp = top + axis * along * aRay.y + side * position.x * w;
  vUv = vec2(position.x + 0.5, along);
  vPhase = aRay.z;
  vKeep = aRay.w;
  vWpos = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAG = /* glsl */ `
${PRELUDE}
uniform float uStrength;
varying vec2 vUv;
varying float vPhase;
varying float vKeep;
varying vec3 vWpos;
void main() {
  float edge = 1.0 - abs(vUv.x * 2.0 - 1.0);
  edge = edge * edge * (3.0 - 2.0 * edge);
  edge = pow(edge, 1.8);
  float fadeTop = smoothstep(0.0, 0.22, vUv.y);
  // fade by height so the shafts read in both orientations and never wash out the floor
  float fadeBottom = smoothstep(1.5, 8.0, vWpos.y);
  float flick = 0.62 + 0.38 * sin(uTime * 0.33 + vPhase * 6.28) * sin(uTime * 0.19 + vPhase * 3.1);
  float streak = 0.72 + 0.28 * snoise(vec2(vUv.x * 3.2 + vPhase * 10.0, vUv.y * 1.6 - uTime * 0.06));
  float a = edge * fadeTop * fadeBottom * flick * streak * uStrength;
  float dist = length(vWpos - cameraPosition);
  a *= exp(-dist * 0.006);
  a *= mix(1.0, vKeep * 0.75, uNight);
  vec3 tint = mix(vec3(1.0, 0.96, 0.82), vec3(0.62, 0.78, 1.0), uNight);
  gl_FragColor = vec4(tint * a, 1.0);
}
`;

export function createGodRays(surfaceY) {
  const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
  geo.translate(0, -0.5, 0); // top edge at y = 0
  const mat = new THREE.ShaderMaterial({
    name: 'GodRays',
    uniforms: withShared({ uStrength: { value: 0.5 } }),
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX_RAYS);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;

  // [x, z, width, keepAtNight] — spread so both orientations get a few shafts.
  const rays = [
    [-4.2, -7, 2.0, 1],
    [1.8, -10.5, 2.8, 0],
    [-9.5, -12, 2.4, 1],
    [6.2, -6, 1.6, 0],
    [-1.2, -17, 3.4, 1],
    [10.5, -14, 2.6, 0],
    [3.8, -4.5, 1.2, 1],
    [-13.5, -6, 2.0, 0],
    [14, -8, 2.2, 1],
  ];
  const attr = new Float32Array(MAX_RAYS * 4);
  const m = new THREE.Matrix4();
  rays.forEach(([x, z, w, keep], i) => {
    m.makeTranslation(x, surfaceY + 0.5, z);
    mesh.setMatrixAt(i, m);
    attr.set([w, 20 + (i % 3) * 2, (i * 0.37) % 1, keep], i * 4);
  });
  geo.setAttribute('aRay', new THREE.InstancedBufferAttribute(attr, 4));
  mesh.instanceMatrix.needsUpdate = true;

  return {
    mesh,
    setCount(n) {
      mesh.count = Math.min(n, MAX_RAYS);
    },
  };
}
