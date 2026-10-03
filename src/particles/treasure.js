// The chest's surprise: pearls, gems and gold coins that shoot up, rain down, bounce on the
// sand and then sink away in a twinkle. CPU physics, three instanced meshes.

import * as THREE from 'three';
import { PRELUDE } from '../glsl/common.js';
import { withShared } from '../core/uniforms.js';
import { sandHeight } from '../world/sand.js';

const MAX = 48;
const GEM_COLORS = ['#ff4f8b', '#4fd0ff', '#7dff6a', '#b07cff', '#ffd23f'];

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
uniform float uKind; // 0 pearl, 1 gem, 2 coin
varying vec3 vWpos;
varying vec3 vNormal;
varying vec3 vColor;
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWpos);
  float fr = pow(1.0 - max(dot(N, V), 0.0), 2.0);
  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(N, H), 0.0), 60.0);
  vec3 col;
  if (uKind < 0.5) {
    vec3 irid = 0.6 + 0.4 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + fr * 1.2 + vWpos.y * 0.3));
    col = mix(vColor, irid, fr * 0.6) * (uSkyAmb * 0.8 + uKeyColor * 0.7) + spec * 1.6;
  } else if (uKind < 1.5) {
    col = vColor * (0.5 + 0.8 * max(dot(N, uSunDir), 0.0)) + vColor * 0.9 + spec * 2.5;   // glows → bloom
  } else {
    vec3 R = reflect(-V, N);
    vec3 env = mix(vec3(0.35, 0.18, 0.04), vec3(1.4, 1.05, 0.5), smoothstep(-0.3, 0.7, R.y));
    col = vColor * env + spec * 2.0;
  }
  col = applyFog(col, vWpos);
  gl_FragColor = vec4(col, 1.0);
}
`;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _axis = new THREE.Vector3();

function makeMesh(geometry, kind) {
  const mat = new THREE.ShaderMaterial({
    name: 'Treasure',
    uniforms: withShared({ uKind: { value: kind } }),
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
  const mesh = new THREE.InstancedMesh(geometry, mat, MAX);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  mesh.count = 0;
  mesh.frustumCulled = false;
  return mesh;
}

export class Treasure {
  constructor(fx) {
    this.fx = fx;
    const coin = new THREE.CylinderGeometry(1, 1, 0.24, 20);
    coin.rotateX(Math.PI / 2);
    const gem = new THREE.IcosahedronGeometry(1, 0); // non-indexed with flat normals: faceted
    this.meshes = [makeMesh(new THREE.SphereGeometry(1, 16, 12), 0), makeMesh(gem, 1), makeMesh(coin, 2)];
    this.items = [];
    this.onBounce = null; // (item) => void
  }

  get objects() {
    return this.meshes;
  }

  burst(origin, count = 22) {
    for (let i = 0; i < count; i++) {
      const kind = i % 4 === 0 ? 1 : i % 3 === 0 ? 2 : 0;
      const a = Math.random() * Math.PI * 2;
      const s = 0.8 + Math.random() * 1.8;
      const color = kind === 0 ? new THREE.Color('#fff4f8') : kind === 1 ? new THREE.Color(GEM_COLORS[i % GEM_COLORS.length]) : new THREE.Color('#ffcf4a');
      this.items.push({
        kind,
        pos: origin.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.1, (Math.random() - 0.5) * 0.3)),
        vel: new THREE.Vector3(Math.cos(a) * s, 4.2 + Math.random() * 2.6, Math.sin(a) * s * 0.6 + 0.6),
        quat: new THREE.Quaternion().setFromAxisAngle(_axis.set(Math.random(), Math.random(), Math.random()).normalize(), Math.random() * 6),
        spinAxis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        spin: 4 + Math.random() * 6,
        size: kind === 2 ? 0.26 : kind === 1 ? 0.21 : 0.18 + Math.random() * 0.05,
        color,
        age: -i * 0.025,
        rest: 0,
        bounces: 0,
      });
    }
    if (this.items.length > MAX) this.items.splice(0, this.items.length - MAX);
  }

  update(dt) {
    const counts = [0, 0, 0];
    for (const it of this.items) {
      it.age += dt;
      if (it.age < 0) continue;
      const ground = sandHeight(it.pos.x, it.pos.z) + it.size * 0.8;
      if (it.rest < 0.6) {
        it.vel.y -= 4.2 * dt;
        it.vel.multiplyScalar(Math.exp(-dt * 0.6));
        it.pos.addScaledVector(it.vel, dt);
        if (it.pos.y < ground) {
          it.pos.y = ground;
          if (Math.abs(it.vel.y) > 0.6) {
            it.bounces++;
            if (it.bounces <= 2) this.onBounce?.(it);
          }
          it.vel.y = Math.abs(it.vel.y) * 0.36;
          it.vel.x *= 0.65;
          it.vel.z *= 0.65;
          it.spin *= 0.6;
          if (Math.abs(it.vel.y) < 0.35) it.rest += dt * 4;
        }
      } else {
        it.rest += dt;
      }
      _q.setFromAxisAngle(it.spinAxis, it.spin * dt);
      it.quat.premultiply(_q);
      // after a little rest the treasure sinks into the sand with a twinkle
      let scale = 1;
      if (it.rest > 3.2) {
        scale = Math.max(0, 1 - (it.rest - 3.2) / 1.1);
        if (!it.twinkled) {
          it.twinkled = true;
          this.fx?.sparkles(it.pos, 2, 0.3);
        }
      }
      if (scale <= 0) {
        it.dead = true;
        continue;
      }
      const mesh = this.meshes[it.kind];
      const n = counts[it.kind]++;
      _s.setScalar(it.size * scale);
      mesh.setMatrixAt(n, _m.compose(it.pos, it.quat, _s));
      mesh.instanceColor.setXYZ(n, it.color.r, it.color.g, it.color.b);
    }
    this.items = this.items.filter((it) => !it.dead);
    this.meshes.forEach((m, k) => {
      m.count = counts[k];
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    });
  }
}
