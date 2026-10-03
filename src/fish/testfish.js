// ?fill=N — N painted test fish, as if the children had made them: every shape, pattern,
// eye type and painting style, each with its own 512×256 painting. The same fish every
// time (seeded), so measurements can be compared. Never saved. `sea`: big animals instead.

import { makeDNA, PAINT_COLORS } from './dna.js';
import { Painter } from '../factory/painter.js';
import { mulberry32 } from '../util/rng.js';

export function testFish(n, { sea = false } = {}) {
  const painter = new Painter();
  const list = [];
  for (let i = 0; i < n; i++) {
    const r = mulberry32(4000 + i);
    const color = PAINT_COLORS[i % 8];
    const others = PAINT_COLORS.filter((c) => c !== color && c !== '#ffffff');
    painter.setBase(color);
    painter.wandPaint(r, [others[Math.floor(r() * others.length)], others[Math.floor(r() * others.length)]]);
    list.push(
      makeDNA({
        id: `${sea ? 'fill-sea' : 'fill'}-${i}`,
        born: i + 1,
        kind: i % 3 ? 'design' : 'wand',
        shape: (i % 4) + (sea ? 4 : 0),
        color,
        pattern: Math.floor(i / 4) % 4,
        eyes: (i + Math.floor(i / 4)) % 4,
        glow: true,
        seed: 7000 + i,
        paint: painter.toJPEG(),
      }),
    );
  }
  painter.dispose();
  return list;
}
