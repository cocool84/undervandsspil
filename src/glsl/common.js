// Shared GLSL. Every scene material is a ShaderMaterial built from these chunks so the
// whole aquarium shares one look: the same water colour, fog, light and caustics.

export const GLSL_UNIFORMS = /* glsl */ `
uniform float uTime;
uniform float uNight;
uniform vec3 uSunDir;
uniform vec3 uKeyColor;
uniform vec3 uSkyAmb;
uniform vec3 uGroundAmb;
uniform vec3 uRimColor;
uniform vec3 uWaterTop;
uniform vec3 uWaterMid;
uniform vec3 uWaterDeep;
uniform vec3 uSunGlow;
uniform float uFogDensity;
uniform float uSurfaceY;
uniform sampler2D uCaustics;
uniform float uCausticsStrength;
uniform vec4 uTouches[4];
`;

export const GLSL_NOISE = /* glsl */ `
vec2 aq_mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 aq_mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 aq_mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 aq_permute(vec3 x) { return aq_mod289(((x * 34.0) + 10.0) * x); }
vec4 aq_permute(vec4 x) { return aq_mod289(((x * 34.0) + 10.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = aq_mod289(i);
  vec3 p = aq_permute(aq_permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = aq_mod289(i);
  vec4 p = aq_permute(aq_permute(aq_permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = 1.79284291400159 - 0.85373472095314 * vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
`;

// Water colour, fog, light and caustics. Needs GLSL_UNIFORMS.
export const GLSL_WATER = /* glsl */ `
vec3 waterColor(vec3 dir) {
  float y = dir.y;
  vec3 c = mix(uWaterMid, uWaterTop, smoothstep(0.02, 0.92, y));
  c = mix(c, uWaterDeep, smoothstep(-0.02, -0.75, y));
  float s = max(dot(dir, uSunDir), 0.0);
  c += uSunGlow * (pow(s, 5.0) * 0.22 + pow(s, 48.0) * 0.45);
  return c;
}

float fogFactor(float dist) {
  return 1.0 - exp(-uFogDensity * max(dist - 10.0, 0.0));
}

vec3 applyFog(vec3 col, vec3 wpos) {
  vec3 d = wpos - cameraPosition;
  float dist = length(d);
  vec3 dir = d / max(dist, 1e-4);
  // Water swallows red first: warm up close, blue far away.
  col *= exp(-max(dist - 8.0, 0.0) * vec3(0.0065, 0.0024, 0.0012));
  return mix(col, waterColor(dir), fogFactor(dist));
}

// Less light the deeper we go.
float depthLight(vec3 wpos) {
  return exp(-max(uSurfaceY - wpos.y, 0.0) * 0.012);
}

vec2 causticsUv1(vec3 wpos) {
  vec2 p = wpos.xz + uSunDir.xz * (uSurfaceY - wpos.y) * 0.35;
  return p * 0.07 + vec2(0.011, 0.006) * uTime;
}

vec2 causticsUv2(vec3 wpos) {
  vec2 p = wpos.xz + uSunDir.xz * (uSurfaceY - wpos.y) * 0.35;
  return vec2(p.x * 0.8 - p.y * 0.6, p.x * 0.6 + p.y * 0.8) * 0.093 + vec2(-0.008, 0.012) * uTime;
}

float causticsAt(vec3 wpos) {
  float a = texture2D(uCaustics, causticsUv1(wpos)).r;
  float b = texture2D(uCaustics, causticsUv2(wpos)).r;
  return min(a, b) * 1.5 + a * b;
}

// Slight RGB split gives the light net rainbow edges.
vec3 causticsRGB(vec3 wpos) {
  vec2 u1 = causticsUv1(wpos);
  vec2 u2 = causticsUv2(wpos);
  vec2 o = vec2(0.0032, 0.0019);
  vec3 a = vec3(texture2D(uCaustics, u1 - o).r, texture2D(uCaustics, u1).r, texture2D(uCaustics, u1 + o).r);
  vec3 b = vec3(texture2D(uCaustics, u2 - o).r, texture2D(uCaustics, u2).r, texture2D(uCaustics, u2 + o).r);
  return min(a, b) * 1.5 + a * b;
}

// Soft, friendly light: wrapped diffuse, sky/ground ambient, broad highlight, rim, caustics.
vec3 softShade(vec3 albedo, vec3 N, vec3 V, vec3 wpos, float wrap, float spec, float shininess, float rim, float caust) {
  float dl = depthLight(wpos);
  float ndl = dot(N, uSunDir);
  float diff = clamp((ndl + wrap) / (1.0 + wrap), 0.0, 1.0);
  vec3 amb = mix(uGroundAmb, uSkyAmb, N.y * 0.5 + 0.5);
  vec3 col = albedo * (amb + uKeyColor * diff * dl);
  vec3 H = normalize(uSunDir + V);
  col += uKeyColor * pow(max(dot(N, H), 0.0), shininess) * spec * dl;
  float fr = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  col += uRimColor * fr * rim;
  if (caust > 0.0) {
    float c = causticsAt(wpos) * clamp(N.y * 0.8 + 0.2, 0.0, 1.0) * caust * uCausticsStrength * dl;
    col += (albedo * 0.8 + 0.2) * uKeyColor * c;
  }
  return col;
}
`;

export const GLSL_BILLBOARD = /* glsl */ `
vec3 camRight() { return vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); }
vec3 camUp() { return vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]); }
`;

export const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Shorthand for a fragment/vertex prelude with everything above.
export const PRELUDE = GLSL_UNIFORMS + GLSL_NOISE + GLSL_WATER;
