// Fish food: colourful flakes sprinkled from the surface. Simulated on the CPU (fish and the
// crab need to find and eat them), drawn as one instanced mesh.

import * as THREE from 'three';
import { PRELUDE } from '../glsl/common.js';
import { withShared } from '../core/uniforms.js';
import { sandHeight } from '../world/sand.js';

const MAX = 72;
const COLORS = ['#ff8a3d', '#ffd23f', '#ff5d5d', '#7ddc5a', '#ff9ecf', '#ffb35c'];

const VERT = /* glsl */ `
varying vec3 vWpos;
varying vec3 vNormal;
varying vec3 vColor;
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWpos = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vColor = instanceColor;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${PRELUDE}
varying vec3 vWpos;
varying vec3 vNormal;
varying vec3 vColor;
void main() {
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWpos);
  vec3 col = softShade(vColor, N, V, vWpos, 0.8, 0.3, 20.0, 0.3, 0.5);
  col += vColor * 0.25;
  col = applyFog(col, vWpos);
  gl_FragColor = vec4(col, 1.0);
}
`;

function flakeGeometry() {
  const g = new THREE.CircleGeometry(1, 7);
  const pos = g.attributes.position;
  for (let i = 1; i < pos.count; i++) {
    const k = 0.7 + Math.random() * 0.45;
    pos.setXY(i, pos.getX(i) * k, pos.getY(i) * k * 0.8);
  }
  g.computeVertexNormals();
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

export class Food {
  constructor() {
    const mat = new THREE.ShaderMaterial({
      name: 'FoodFlakes',
      uniforms: withShared(),
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(flakeGeometry(), mat, MAX);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.flakes = [];
    this.eaten = 0;
    this.onLanded = null; // (flake) => void
  }

  // Sprinkle a handful of flakes just above the visible top of the water.
  sprinkle(cx, y, count = 20) {
    for (let i = 0; i < count; i++) {
      if (this.flakes.length >= MAX) this.flakes.shift();
      const x = cx + (Math.random() - 0.5) * 5.5;
      const z = -3.5 + Math.random() * 6;
      this.flakes.push({
        pos: new THREE.Vector3(x, y + Math.random() * 0.8, z),
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.4, -0.3 - Math.random() * 0.3, 0),
        rot: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        spin: new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3),
        phase: Math.random() * 6.28,
        size: 0.16 + Math.random() * 0.07,
        color: new THREE.Color(COLORS[Math.floor(Math.random() * COLORS.length)]),
        landed: false,
        age: 0,
        dead: false,
      });
    }
  }

  // Falling flakes the fish can see.
  get falling() {
    return this.flakes.filter((f) => !f.landed && !f.dead);
  }

  eat(flake) {
    if (flake.dead) return false;
    flake.dead = true;
    this.eaten++;
    return true;
  }

  update(t, dt) {
    let n = 0;
    for (const f of this.flakes) {
      if (f.dead) continue;
      f.age += dt;
      if (!f.landed) {
        f.vel.y += (-0.5 - f.vel.y) * dt * 1.5;
        f.vel.x += Math.sin(t * 1.8 + f.phase) * 0.35 * dt;
        f.pos.addScaledVector(f.vel, dt);
        f.rot.addScaledVector(f.spin, dt);
        const ground = sandHeight(f.pos.x, f.pos.z) + 0.04;
        if (f.pos.y <= ground) {
          f.pos.y = ground;
          f.landed = true;
          f.landedAt = f.age;
          f.rot.x = Math.PI / 2;
          this.onLanded?.(f);
        }
      } else if (f.age - f.landedAt > 12) {
        f.dead = true;
        continue;
      }
      const fade = f.landed ? Math.max(0, 1 - Math.max(0, f.age - f.landedAt - 10) / 2) : 1;
      _q.setFromEuler(_e.set(f.rot.x, f.rot.y, f.rot.z));
      _s.setScalar(f.size * fade);
      this.mesh.setMatrixAt(n, _m.compose(f.pos, _q, _s));
      this.mesh.instanceColor.setXYZ(n, f.color.r, f.color.g, f.color.b);
      n++;
    }
    this.flakes = this.flakes.filter((f) => !f.dead);
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}
