// Scalar helpers, easings and springs. Nothing here allocates per call.

export const TAU = Math.PI * 2;

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => clamp((x - a) / (b - a), 0, 1);

export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

export function easeOutBack(t, s = 1.70158) {
  const u = t - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
}

export function easeOutElastic(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return Math.pow(2, -10 * t) * Math.sin(((t * 10 - 0.75) * TAU) / 3) + 1;
}

// Frame-rate independent exponential smoothing.
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

// Underdamped spring for squash & stretch and bouncy UI.
export class Spring {
  constructor(value = 0, stiffness = 180, damping = 14) {
    this.value = value;
    this.velocity = 0;
    this.target = value;
    this.k = stiffness;
    this.d = damping;
  }

  kick(v) {
    this.velocity += v;
  }

  update(dt) {
    const a = (this.target - this.value) * this.k - this.velocity * this.d;
    this.velocity += a * dt;
    this.value += this.velocity * dt;
    return this.value;
  }
}
