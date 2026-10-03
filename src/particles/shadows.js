// Soft blob shadows on the sand under fish and the crab: cheap instanced quads instead of
// shadow maps. Higher up = bigger and fainter.

import * as THREE from 'three';
import { sandHeight } from '../world/sand.js';

const MAX = 32;

const VERT = /* glsl */ `
attribute float aStrength;
varying vec2 vUv;
varying float vStrength;
void main() {
  vUv = uv;
  vStrength = aStrength;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform float uNight;
varying vec2 vUv;
varying float vStrength;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float d = dot(p, p);
  float a = exp(-d * 3.2) * (1.0 - smoothstep(0.7, 1.0, d)) * vStrength * mix(1.0, 0.5, uNight);
  gl_FragColor = vec4(vec3(0.02, 0.08, 0.16) * a, a);
}
`;

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

export class Shadows {
  constructor(uNight) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.strength = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
    geo.setAttribute('aStrength', this.strength);
    const mat = new THREE.ShaderMaterial({
      name: 'BlobShadows',
      uniforms: { uNight },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 0;
    this.count = 0;
  }

  begin() {
    this.count = 0;
  }

  // length/width of the caster, its height above the sand and yaw
  add(x, y, z, length, width, yaw, base = 0.38) {
    if (this.count >= MAX) return;
    const ground = sandHeight(x, z);
    const h = Math.max(y - ground, 0);
    const spread = 1 + h * 0.07;
    _p.set(x, ground + 0.04, z);
    _q.setFromEuler(_e.set(0, yaw, 0));
    _s.set(length * spread, 1, width * spread);
    this.mesh.setMatrixAt(this.count, _m.compose(_p, _q, _s));
    this.strength.setX(this.count, base * Math.exp(-h * 0.13));
    this.count++;
  }

  end() {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.strength.needsUpdate = true;
  }
}
