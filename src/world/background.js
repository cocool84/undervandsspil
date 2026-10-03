// Open-water backdrop: a big sphere that follows the camera and paints the same
// gradient the fog fades to, so far things melt seamlessly into the water.

import * as THREE from 'three';
import { PRELUDE } from '../glsl/common.js';
import { withShared } from '../core/uniforms.js';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${PRELUDE}
varying vec3 vDir;
void main() {
  vec3 dir = normalize(vDir);
  vec3 col = waterColor(dir);
  // faint drifting light far up
  float up = smoothstep(0.15, 0.9, dir.y);
  float shimmer = snoise(vec2(dir.x * 6.0 + uTime * 0.05, dir.z * 6.0 - uTime * 0.04)) * 0.5 + 0.5;
  col += uSunGlow * up * shimmer * 0.06;
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createBackground() {
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const mat = new THREE.ShaderMaterial({
    name: 'Background',
    uniforms: withShared(),
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  return {
    mesh,
    update(camera) {
      mesh.position.copy(camera.position);
    },
  };
}
