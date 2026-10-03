// The paint canvas behind every fish: a texture the factory (stage 4) can finger-paint on.
// Unpainted fish use a small canvas; painted ones a 512×256 canvas.

import * as THREE from 'three';

export const PAINT_W = 512;
export const PAINT_H = 256;

export function createPaint(dna) {
  const big = !!dna.paint;
  const w = big ? PAINT_W : 128;
  const h = w / 2;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  fillBase(g, w, h, dna);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (dna.paint) {
    const img = new Image();
    img.onload = () => {
      g.drawImage(img, 0, 0, w, h);
      texture.needsUpdate = true;
    };
    img.src = dna.paint;
  }
  return { canvas, ctx: g, texture };
}

function fillBase(g, w, h, dna) {
  if (dna.color2) {
    // two-tone: head colour melting into the tail colour
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, dna.color);
    grad.addColorStop(0.42, dna.color);
    grad.addColorStop(0.78, dna.color2);
    grad.addColorStop(1, dna.color2);
    g.fillStyle = grad;
  } else {
    g.fillStyle = dna.color;
  }
  g.fillRect(0, 0, w, h);
}
