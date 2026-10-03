// Fish DNA: what a fish looks like (shape, colour, pattern, eyes) and — derived from its
// seed — how it behaves (speed, curiosity, sociability, playfulness, favourite depth, size).

import * as THREE from 'three';
import { mulberry32, rand, pick } from '../util/rng.js';

export const SHAPES = ['round', 'long', 'triangle', 'puffer'];
export const ANIMALS = ['dolphin', 'shark', 'orca', 'whale']; // shapes 4–7: the open sea
export const PATTERNS = ['none', 'stripes', 'dots', 'rainbow'];
export const EYES = ['big', 'sleepy', 'happy', 'wonky'];

// The paint pots in the fish factory (sRGB).
export const PAINT_COLORS = ['#ff8a3d', '#ffd23f', '#ff5d8f', '#9b6bff', '#3fa9ff', '#35d07f', '#ff4b4b', '#33e0d0', '#ffffff', '#ff9ecf'];

const IRIS = ['#5a3418', '#1f6fd1', '#1f9a5a', '#7a3fd1', '#2a2a40'];
const GLOW = ['#5ff8ff', '#ff6be8', '#9dff7a', '#ffd86b'];

let idCounter = 0;
export function newId() {
  idCounter = (idCounter + 1) % 1e6;
  return `f${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export function makeDNA(o = {}) {
  return {
    id: o.id ?? newId(),
    born: o.born ?? Date.now(),
    kind: o.kind ?? 'design', // 'design' | 'wand' | 'starter'
    shape: o.shape ?? 0,
    color: o.color ?? '#ff8a3d',
    pattern: o.pattern ?? 0,
    eyes: o.eyes ?? 0,
    glow: o.glow ?? false,
    seed: o.seed ?? Math.floor(Math.random() * 1e9),
    paint: o.paint ?? null, // JPEG data URL of a finger painting, or null
    color2: o.color2 ?? null, // optional second colour for two-tone starters
  };
}

// The eight fish that always live in the aquarium (unless pushed out by many own fish).
export const STARTERS = [
  makeDNA({ id: 'starter-1', kind: 'starter', born: 1, shape: 0, color: '#ff8a3d', pattern: 1, eyes: 0, glow: false, seed: 101 }),
  makeDNA({ id: 'starter-2', kind: 'starter', born: 2, shape: 1, color: '#3fa9ff', pattern: 2, eyes: 2, glow: true, seed: 202 }),
  makeDNA({ id: 'starter-3', kind: 'starter', born: 3, shape: 2, color: '#ffd23f', pattern: 1, eyes: 0, glow: false, seed: 303 }),
  makeDNA({ id: 'starter-4', kind: 'starter', born: 4, shape: 3, color: '#ff5d8f', pattern: 2, eyes: 3, glow: true, seed: 404 }),
  makeDNA({ id: 'starter-5', kind: 'starter', born: 5, shape: 0, color: '#9b6bff', pattern: 3, eyes: 1, glow: true, seed: 505 }),
  makeDNA({ id: 'starter-6', kind: 'starter', born: 6, shape: 1, color: '#35d07f', pattern: 0, eyes: 0, glow: false, seed: 606, color2: '#ffd23f' }),
  makeDNA({ id: 'starter-7', kind: 'starter', born: 7, shape: 2, color: '#ff4b4b', pattern: 2, eyes: 2, glow: true, seed: 707 }),
  makeDNA({ id: 'starter-8', kind: 'starter', born: 8, shape: 0, color: '#33e0d0', pattern: 1, eyes: 3, glow: false, seed: 808, color2: '#3fa9ff' }),
];

// The four big animals that live in the open sea: one of each.
export const SEA_STARTERS = [
  makeDNA({ id: 'sea-1', kind: 'starter', born: 1, shape: 4, color: '#7cb6ee', pattern: 0, eyes: 2, glow: true, seed: 111 }),
  makeDNA({ id: 'sea-2', kind: 'starter', born: 2, shape: 5, color: '#8396b4', pattern: 0, eyes: 0, glow: true, seed: 222 }),
  makeDNA({ id: 'sea-3', kind: 'starter', born: 3, shape: 6, color: '#222b3f', pattern: 0, eyes: 0, glow: true, seed: 333 }),
  makeDNA({ id: 'sea-4', kind: 'starter', born: 4, shape: 7, color: '#3f6fce', pattern: 0, eyes: 2, glow: true, seed: 444 }),
];

// Behaviour and small looks derived deterministically from the seed.
export function personality(dna) {
  const r = mulberry32(dna.seed);
  const shapeSpeed = [1.0, 1.25, 0.85, 0.7, 1.45, 1.1, 1.2, 0.8][dna.shape];
  const animal = dna.shape >= 4;
  return {
    speed: rand(r, 0.8, 1.2) * shapeSpeed,
    curiosity: rand(r, 0.4, 1),
    social: rand(r, 0.3, 1),
    playful: rand(r, 0.3, 1),
    depth: rand(r, 0.15, 0.85), // 0 low … 1 high in the water
    size: animal ? rand(r, 0.95, 1.08) : rand(r, 1.0, 1.22),
    wiggle: rand(r, 0.85, 1.2),
    iris: new THREE.Color(pick(r, IRIS)),
    glow: new THREE.Color(pick(r, GLOW)),
    blinkRate: rand(r, 0.7, 1.3),
    home: r(), // favourite stretch of the aquarium (0 left … 1 right)
    homeZ: rand(r, -4.5, 2.5),
  };
}

const _c = new THREE.Color();
const _hsl = { h: 0, s: 0, l: 0 };

// Colour used for stripes and dots: a light cream on dark fish, a deeper shade on light ones.
export function patternColor(hex) {
  _c.set(hex);
  const lum = 0.2126 * _c.r + 0.7152 * _c.g + 0.0722 * _c.b; // linear luminance
  if (lum > 0.45) {
    _c.getHSL(_hsl);
    return new THREE.Color().setHSL((_hsl.h + 0.97) % 1, Math.min(1, _hsl.s * 1.05), _hsl.l * 0.45);
  }
  return new THREE.Color('#fff6e8');
}

export function randomDNA(kind = 'wand', sea = false) {
  const r = Math.random;
  return makeDNA({
    kind,
    shape: Math.floor(r() * SHAPES.length) + (sea ? SHAPES.length : 0),
    color: pick(r, PAINT_COLORS.slice(0, 8)),
    pattern: Math.floor(r() * PATTERNS.length),
    eyes: Math.floor(r() * EYES.length),
    glow: r() < 0.5,
  });
}
