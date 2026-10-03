// The water surface seen from below: a shimmering ceiling with a bright Snell's window,
// a light net and the sun or moon wobbling through.

import * as THREE from 'three';
import { PRELUDE } from '../glsl/common.js';
import { withShared } from '../core/uniforms.js';

const VERT = /* glsl */ `
varying vec3 vWpos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWpos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${PRELUDE}
varying vec3 vWpos;
void main() {
  vec3 V = normalize(vWpos - cameraPosition);          // view ray, pointing up
  vec2 p = vWpos.xz;
  float n1 = snoise(p * 0.16 + vec2(uTime * 0.11, uTime * 0.05));
  float n2 = snoise(p * 0.41 - vec2(uTime * 0.07, -uTime * 0.1));
  vec3 N = normalize(vec3(n1 * 0.32 + n2 * 0.14, -1.0, (n1 - n2) * 0.24));

  float cosA = clamp(dot(V, vec3(0.0, 1.0, 0.0)) + n1 * 0.06, 0.0, 1.0);
  float window = smoothstep(0.58, 0.8, cosA);           // ~48° Snell's window
  vec3 reflected = mix(uWaterMid, uWaterTop, 0.35) * 0.95;
  vec3 sky = mix(uWaterTop, vec3(1.0), 0.45) * 1.25;
  vec3 col = mix(reflected, sky, window);

  float net = pow(1.0 - abs(snoise(p * 0.42 + vec2(uTime * 0.08, -uTime * 0.05))), 4.0);
  net += 0.5 * pow(1.0 - abs(snoise(p * 0.8 - vec2(uTime * 0.1, uTime * 0.07))), 5.0);
  col += uKeyColor * net * (0.35 + 0.65 * window) * 0.32;

  // sun / moon wobbling through the surface
  vec3 R = refract(V, N, 1.33);
  float s = max(dot(normalize(R + vec3(0.0001)), uSunDir), 0.0);
  col += uSunGlow * pow(s, 60.0) * 2.2 * window;

  float dist = length(vWpos - cameraPosition);
  col = mix(col, waterColor(V), min(fogFactor(dist) * 1.15, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createSurface(surfaceY) {
  const geo = new THREE.PlaneGeometry(220, 160, 1, 1);
  geo.rotateX(Math.PI / 2); // face down
  geo.translate(0, surfaceY, -50);
  const mat = new THREE.ShaderMaterial({
    name: 'Surface',
    uniforms: withShared(),
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  return { mesh };
}
