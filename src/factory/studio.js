// The fish factory's stage: a bright, warm "workshop" in the water — a glowing backdrop with
// soft light beams, sand with a dancing light net, bubbles drifting up and its own sparkles.
// Always lit like a sunny day (see inStudio), whatever time it is in the aquarium.

import * as THREE from 'three';
import { PRELUDE } from '../glsl/common.js';
import { withShared, inStudio } from '../core/uniforms.js';
import { Bubbles } from '../particles/bubbles.js';
import { Fx } from '../particles/fx.js';

export const STAGE = new THREE.Vector3(0, 11.5, 0); // where the fish floats

const BACK_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// The studio's water colour in a view direction — the backdrop paints it and the sand
// melts into it far away, so there is no horizon line.
const STUDIO_WATER = /* glsl */ `
uniform vec3 uGlowDir;
vec3 studioWater(vec3 d) {
  vec3 top = vec3(0.3, 0.74, 0.86);
  vec3 mid = vec3(0.035, 0.33, 0.52);
  vec3 low = vec3(0.006, 0.07, 0.22);
  vec3 c = mix(mid, top, smoothstep(-0.05, 0.5, d.y));
  c = mix(c, low, smoothstep(-0.02, -0.45, d.y));
  // a soft warm glow behind the fish (kept under the bloom threshold)
  float g = max(dot(d, uGlowDir), 0.0);
  c += vec3(0.55, 0.6, 0.5) * (pow(g, 14.0) * 0.4 + pow(g, 4.0) * 0.12);
  // slow, soft light beams falling from above
  float x = d.x / max(d.y + 1.25, 0.2);
  float beams = 0.0;
  beams += pow(0.5 + 0.5 * sin(x * 9.0 + uTime * 0.21), 6.0);
  beams += pow(0.5 + 0.5 * sin(x * 15.0 - uTime * 0.17 + 1.7), 8.0) * 0.7;
  beams += pow(0.5 + 0.5 * sin(x * 5.0 + uTime * 0.11 + 4.0), 5.0) * 0.6;
  c += vec3(0.75, 0.97, 1.0) * beams * smoothstep(-0.25, 0.45, d.y) * 0.1;
  // shimmering light net high up
  float k = causticsAt(vec3(d.x * 40.0, 16.0, d.z * 40.0 + d.y * 25.0));
  c += vec3(0.7, 0.95, 1.0) * k * smoothstep(0.15, 0.55, d.y) * 0.12;
  return c;
}
`;

const BACK_FRAG = /* glsl */ `
${PRELUDE}
${STUDIO_WATER}
varying vec3 vDir;
void main() {
  gl_FragColor = vec4(studioWater(normalize(vDir)), 1.0);
}
`;

const FLOOR_VERT = /* glsl */ `
varying vec3 vWpos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWpos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// Soft sand with the dancing light net, the fish's shadow, melting into the water far away.
const FLOOR_FRAG = /* glsl */ `
${PRELUDE}
${STUDIO_WATER}
uniform vec4 uShadow; // x, z, radius, strength
varying vec3 vWpos;
void main() {
  vec3 sand = vec3(0.93, 0.78, 0.55);
  float grain = hash12(floor(vWpos.xz * 40.0)) * 0.08;
  float ripple = 0.5 + 0.5 * sin(vWpos.x * 2.1 + sin(vWpos.z * 1.3) * 1.5);
  vec3 alb = sand * (0.92 + grain + ripple * 0.06);
  vec3 col = alb * (uSkyAmb * 0.8 + uKeyColor * 0.55);
  col += alb * uKeyColor * causticsRGB(vWpos) * 0.9;
  vec2 d = (vWpos.xz - uShadow.xy) / vec2(uShadow.z, uShadow.z * 0.55);
  col *= 1.0 - uShadow.w * exp(-dot(d, d) * 2.2);
  vec3 toP = vWpos - cameraPosition;
  float dist = length(toP);
  col = mix(col, studioWater(toP / dist), smoothstep(8.0, 30.0, dist));
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Studio {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 300);
    this.glowDir = new THREE.Vector3(0, 0, -1);

    const back = new THREE.Mesh(
      new THREE.SphereGeometry(150, 32, 16),
      inStudio(new THREE.ShaderMaterial({ name: 'StudioBackdrop', uniforms: withShared({ uGlowDir: { value: this.glowDir } }), vertexShader: BACK_VERT, fragmentShader: BACK_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false })),
    );
    back.renderOrder = -1000;
    back.frustumCulled = false;
    this.backdrop = back;

    this.shadow = new THREE.Vector4(0, 0, 1.5, 0.35);
    const floorGeo = new THREE.PlaneGeometry(90, 90, 1, 1);
    floorGeo.rotateX(-Math.PI / 2);
    this.floor = new THREE.Mesh(
      floorGeo,
      inStudio(new THREE.ShaderMaterial({ name: 'StudioFloor', uniforms: withShared({ uShadow: { value: this.shadow }, uGlowDir: { value: this.glowDir } }), vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG })),
    );

    this.bubbles = new Bubbles();
    inStudio(this.bubbles.material);
    inStudio(this.bubbles.depthMaterial);
    this.fx = new Fx();
    for (const o of this.fx.objects) inStudio(o.material);

    this.scene.add(back, this.floor, ...this.bubbles.objects, ...this.fx.objects);
    this.bubbleT = 0;
  }

  // Fit the fish into the free area between the buttons. `size` is the fish's extent
  // {w, h} in world units; `area` the free screen rectangle in CSS px.
  frame(size, area) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const cam = this.camera;
    cam.aspect = W / H;
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const freeW = Math.max(area.right - area.left, 200);
    const freeH = Math.max(area.bottom - area.top, 200);
    const dW = (size.w * H) / (2 * tan * freeW * 0.78);
    const dH = (size.h * H) / (2 * tan * freeH * 0.8);
    const D = THREE.MathUtils.clamp(Math.max(dW, dH), 5, 30);
    const cx = (area.left + area.right) / 2;
    const cy = (area.top + area.bottom) / 2;
    const ndcX = (cx / W) * 2 - 1;
    const ndcY = 1 - (cy / H) * 2;
    cam.position.set(STAGE.x - ndcX * D * tan * cam.aspect, STAGE.y - ndcY * D * tan, STAGE.z + D);
    cam.lookAt(cam.position.x, cam.position.y, STAGE.z);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.glowDir.copy(STAGE).sub(cam.position).normalize();
    // the sand a little way under the fish
    this.floor.position.y = STAGE.y - Math.max(size.h * 0.5 + 1.2, 2.2);
    this.shadow.z = size.w * 0.42;
    this.distance = D;
  }

  // The fish's soft shadow on the sand (it shrinks and fades as the fish hops up).
  setShadow(x, z, lift) {
    this.shadow.x = x;
    this.shadow.y = z;
    this.shadow.w = 0.38 / (1 + Math.max(lift, 0) * 0.5);
  }

  update(t, dt) {
    this.backdrop.position.copy(this.camera.position);
    // two lazy bubble streams beside the fish and the odd stray one
    this.bubbleT -= dt;
    if (this.bubbleT <= 0) {
      this.bubbleT = 0.16 + Math.random() * 0.3;
      const side = Math.random() < 0.5 ? -1 : 1;
      const spread = this.distance * 0.42;
      this.bubbles.spawn(STAGE.x + side * (spread * (0.7 + Math.random() * 0.5)), STAGE.y - this.distance * 0.35, STAGE.z - 1.5 - Math.random() * 3, 0.06 + Math.random() * 0.12, 1.0 + Math.random() * 0.6, 0.06);
    }
    this.bubbles.update();
    this.fx.update();
  }
}
