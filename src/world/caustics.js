// Animated, tileable caustics rendered into a small texture each frame. Every other
// shader projects it from above, so sand, rocks, chest, crab and fish share one light net.

import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { FULLSCREEN_VERT } from '../glsl/common.js';

// Based on the well-known tileable water caustic by Dave Hoskins (after joltz0r).
const FRAG = /* glsl */ `
#define TAU 6.28318530718
uniform float uTime;
varying vec2 vUv;
void main() {
  float time = uTime * 0.42 + 23.0;
  vec2 p = mod(vUv * TAU, TAU) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 5; n++) {
    float t = time * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
  }
  c /= 5.0;
  c = 1.17 - pow(c, 1.4);
  float v = pow(abs(c), 7.0);
  gl_FragColor = vec4(vec3(clamp(v, 0.0, 1.0)), 1.0);
}
`;

export class Caustics {
  constructor(size = 256) {
    this.target = new THREE.WebGLRenderTarget(size, size, {
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
    });
    this.material = new THREE.ShaderMaterial({
      name: 'CausticsGen',
      uniforms: { uTime: { value: 0 } },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  get texture() {
    return this.target.texture;
  }

  setSize(size) {
    if (this.target.width !== size) this.target.setSize(size, size);
  }

  render(renderer, t) {
    this.material.uniforms.uTime.value = t;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    this.quad.render(renderer);
    renderer.setRenderTarget(prev);
  }
}
