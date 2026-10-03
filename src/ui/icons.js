// Every icon is inline SVG (viewBox 0 0 100 100) — no text anywhere. `var(--fish)` is the
// colour of the fish being made, so the choices show the child's own colour.

const OUT = '#3b2a4a'; // friendly dark outline
const svg = (body, extra = '') => `<svg viewBox="0 0 100 100" aria-hidden="true" ${extra}>${body}</svg>`;
const eyeDot = (x, y, r = 6) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="${OUT}" stroke-width="2.5"/><circle cx="${x + r * 0.2}" cy="${y}" r="${r * 0.55}" fill="${OUT}"/><circle cx="${x + r * 0.4}" cy="${y - r * 0.35}" r="${r * 0.22}" fill="#fff"/>`;
const smile = (x, y) => `<path d="M${x - 5} ${y} q4 4 8 0" stroke="${OUT}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;

// ---------------------------------------------------------------- the four body shapes

const BODY = {
  round: 'M84 50c0 13-13 23-29 23-11 0-20-5-25-12L10 74l6-24-6-24 20 13c5-7 14-12 25-12 16 0 29 10 29 23z',
  long: 'M92 50c0 7-12 12-34 12-14 0-23-3-30-6L12 66l4-16-4-16 16 10c7-3 16-6 30-6 22 0 34 5 34 12z',
  triangle: 'M80 50C76 41 66 33 56 30L40 8l4 26c-6 4-10 9-12 16 2 7 6 12 12 16L40 92l16-22c10-3 20-11 24-20zM34 50 14 38l5 12-5 12z',
  puffer: 'M82 52c0 15-12 26-27 26S29 67 29 52s11-26 26-26 27 11 27 26zM30 52 13 40l4 12-4 12z',
};
const FIN = {
  round: 'M44 29c4-9 14-12 22-9-4 3-6 6-7 10',
  long: 'M30 41c10-6 30-8 46-5',
  triangle: '',
  puffer: '',
};
const EYE_AT = { round: [70, 45], long: [80, 47], triangle: [66, 45], puffer: [68, 46] };

export function shapeIcon(name) {
  const [ex, ey] = EYE_AT[name];
  const spikes =
    name === 'puffer'
      ? Array.from({ length: 11 }, (_, i) => {
          const a = -2.4 + i * 0.48;
          const x = 55 + Math.cos(a) * 26;
          const y = 52 + Math.sin(a) * 26;
          const x2 = 55 + Math.cos(a) * 34;
          const y2 = 52 + Math.sin(a) * 34;
          return `<path d="M${(x + Math.cos(a + 1.6) * 3).toFixed(1)} ${(y + Math.sin(a + 1.6) * 3).toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}L${(x - Math.cos(a + 1.6) * 3).toFixed(1)} ${(y - Math.sin(a + 1.6) * 3).toFixed(1)}z" fill="var(--fish)" stroke="${OUT}" stroke-width="2.5" stroke-linejoin="round"/>`;
        }).join('')
      : '';
  const fin = FIN[name] ? `<path d="${FIN[name]}" fill="none" stroke="${OUT}" stroke-width="3" stroke-linecap="round"/>` : '';
  return svg(`${spikes}<path d="${BODY[name]}" fill="var(--fish)" stroke="${OUT}" stroke-width="3.5" stroke-linejoin="round"/>${fin}${eyeDot(ex, ey)}${smile(ex + 4, ey + 12)}`);
}

// ---------------------------------------------------------------- the big animals of the open sea

const ANIMAL = {
  dolphin: 'M95 50C90 47 86 46 83 45C80 38 72 33 60 32L54 31C50 25 47 21 44 16C46 24 46 29 44 33C36 35 29 39 24 44C19 40 12 37 5 35C9 40 11 44 12 47C11 50 9 54 5 59C12 57 19 54 24 52C34 59 46 63 58 63C60 67 58 71 54 76C62 72 66 67 68 62C76 60 82 57 85 54C89 53 92 52 95 50Z',
  shark: 'M96 48C92 44 84 39 70 36L60 35C58 27 55 20 52 12C50 21 48 29 46 36C38 38 30 41 22 45C16 37 10 29 4 21C6 31 8 40 10 48C9 53 8 58 6 64C11 59 16 55 21 52C30 57 40 60 52 61C55 66 54 72 50 79C58 74 63 68 66 62C76 61 84 58 90 54C93 52 95 50 96 48Z',
  orca: 'M94 54C94 46 88 40 78 37C72 35 64 34 58 34C56 26 53 17 50 7C49 18 48 27 46 36C38 38 31 41 26 44C21 40 15 36 8 34C10 39 12 44 14 48C12 52 10 56 8 61C15 59 21 56 26 54C34 61 44 66 56 66C57 71 58 76 60 81C66 78 70 70 72 64C80 64 87 62 91 59C93 58 94 56 94 54Z',
  whale: 'M93 58C93 73 77 82 56 82C40 82 28 77 22 69C18 64 16 58 15 52L5 44C9 43 13 45 15 47C15 42 17 37 21 32C22 38 22 44 21 49C30 44 44 37 61 37C79 37 93 45 93 58Z',
};

const ANIMAL_FACE = {
  dolphin: `${eyeDot(76, 44, 4.6)}<path d="M94 51q-6 3-12 1" stroke="${OUT}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
  shark: `<path d="M68 45q-2 5 0 10M73 45q-2 5 0 10M78 45q-2 5 0 10" stroke="${OUT}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="0.7"/>${eyeDot(84, 43, 4.8)}<path d="M93 52q-6 4-13 1" stroke="${OUT}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
  orca: `<ellipse cx="72" cy="42" rx="8.5" ry="3.6" transform="rotate(-12 72 42)" fill="#fff"/><path d="M91 59C83 63 70 65 58 64C66 70 82 68 91 59Z" fill="#fff"/>${eyeDot(84, 49, 4.6)}<path d="M93 56q-5 3-10 2" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
  whale: `<path d="M90 65C86 75 72 80 56 80C45 80 36 77 30 72C46 76 72 75 90 65Z" fill="#fff" opacity="0.85"/>${eyeDot(78, 56, 5)}<path d="M91 62q-8 6-16 3" stroke="${OUT}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
};

export function animalIcon(name) {
  return svg(`<path d="${ANIMAL[name]}" fill="var(--fish)" stroke="${OUT}" stroke-width="3.2" stroke-linejoin="round"/>${ANIMAL_FACE[name]}`);
}

// The world button shows where it takes you: out to the open sea (a whale blowing a
// fountain) or home to the reef (a striped fish by a coral).
const TO_SEA = svg(
  `<path d="M64 36c-1-7-5-12-11-15M64 36c1-7 5-12 11-15M64 36V18" stroke="#e8fbff" stroke-width="4.5" fill="none" stroke-linecap="round"/>
   <circle cx="51" cy="19" r="3.6" fill="#e8fbff"/><circle cx="77" cy="19" r="3.6" fill="#e8fbff"/><circle cx="64" cy="14" r="3.6" fill="#e8fbff"/>
   <path d="${ANIMAL.whale}" fill="#3f6fce" stroke="#1b2f66" stroke-width="3.2" stroke-linejoin="round"/>${ANIMAL_FACE.whale}`,
);
const TO_REEF = svg(
  `<path d="M26 94V70M26 80 15 67M26 75l10-14M15 67v-9M36 61v-9M15 67l-6-4" stroke="#ff6f9f" stroke-width="7" fill="none" stroke-linecap="round"/>
   <circle cx="15" cy="57" r="5" fill="#ffc2dc"/><circle cx="36" cy="51" r="5" fill="#ffc2dc"/><circle cx="8" cy="62" r="4.5" fill="#ffc2dc"/>
   <defs><clipPath id="toreef"><path d="${BODY.round}" transform="translate(22 4) scale(0.78)"/></clipPath></defs>
   <path d="${BODY.round}" transform="translate(22 4) scale(0.78)" fill="#ff8a3d"/>
   <g clip-path="url(#toreef)"><rect x="56" y="0" width="7" height="100" fill="#fff"/><rect x="72" y="0" width="6" height="100" fill="#fff"/></g>
   <path d="${BODY.round}" transform="translate(22 4) scale(0.78)" fill="none" stroke="${OUT}" stroke-width="4" stroke-linejoin="round"/>
   ${eyeDot(77, 39, 5)}`,
);

// ---------------------------------------------------------------- patterns on a round fish

let clipId = 0;
export function patternIcon(name) {
  const id = `pc${clipId++}`;
  const body = BODY.round;
  let fill = '';
  if (name === 'stripes') {
    fill = [38, 52, 66].map((x) => `<rect x="${x}" y="10" width="7" height="80" fill="#fff6e8"/>`).join('');
  } else if (name === 'dots') {
    const dots = [[40, 40], [54, 34], [66, 42], [46, 56], [60, 58], [34, 54], [72, 56], [52, 70]];
    fill = dots.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.6" fill="#fff6e8"/>`).join('');
  } else if (name === 'rainbow') {
    const cols = ['#ff5d5d', '#ff9f3d', '#ffe14d', '#59d96a', '#43b4ff', '#9b6bff'];
    fill = cols.map((c, i) => `<rect x="${10 + i * 13}" y="10" width="14" height="80" fill="${c}"/>`).join('');
  }
  return svg(
    `<defs><clipPath id="${id}"><path d="${body}"/></clipPath></defs>
     <path d="${body}" fill="var(--fish)"/>
     <g clip-path="url(#${id})">${fill}</g>
     <path d="${body}" fill="none" stroke="${OUT}" stroke-width="3.5" stroke-linejoin="round"/>
     ${eyeDot(70, 45)}`,
  );
}

// ---------------------------------------------------------------- eye types

export function eyeIcon(name) {
  const white = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${OUT}" stroke-width="3.5"/>`;
  const pupil = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#2a2140"/><circle cx="${cx + r * 0.35}" cy="${cy - r * 0.4}" r="${r * 0.32}" fill="#fff"/><circle cx="${cx - r * 0.35}" cy="${cy + r * 0.4}" r="${r * 0.14}" fill="#fff"/>`;
  if (name === 'big') return svg(`${white(50, 50, 36)}<circle cx="54" cy="52" r="22" fill="#2f7fd1"/>${pupil(54, 52, 14)}`);
  if (name === 'sleepy') {
    return svg(
      `<defs><clipPath id="sl${clipId}"><circle cx="50" cy="52" r="34"/></clipPath></defs>
       ${white(50, 52, 34)}<circle cx="52" cy="60" r="18" fill="#2f7fd1"/>${pupil(52, 60, 11)}
       <g clip-path="url(#sl${clipId++})"><rect x="10" y="10" width="80" height="40" fill="var(--fish)"/></g>
       <path d="M17 50h66" stroke="${OUT}" stroke-width="4" stroke-linecap="round"/>
       <path d="M30 51l-5 9M50 52v10M70 51l5 9" stroke="${OUT}" stroke-width="3.5" stroke-linecap="round"/>
       <circle cx="50" cy="52" r="34" fill="none" stroke="${OUT}" stroke-width="3.5"/>`,
    );
  }
  if (name === 'happy') {
    return svg(
      `<defs><clipPath id="hp${clipId}"><circle cx="50" cy="48" r="34"/></clipPath></defs>
       ${white(50, 48, 34)}<circle cx="52" cy="42" r="18" fill="#2f7fd1"/>${pupil(52, 42, 11)}
       <g clip-path="url(#hp${clipId++})"><path d="M10 90V66q40-30 80 0v24z" fill="var(--fish)"/></g>
       <path d="M18 67q32-26 64 0" stroke="${OUT}" stroke-width="4" fill="none" stroke-linecap="round"/>
       <circle cx="50" cy="48" r="34" fill="none" stroke="${OUT}" stroke-width="3.5"/>`,
    );
  }
  // wonky / googly: two eyes, pupils off in different directions
  return svg(`${white(30, 50, 22)}${pupil(22, 40, 10)}${white(72, 52, 22)}${pupil(80, 62, 10)}`);
}

// ---------------------------------------------------------------- paint blob

export function blobIcon(color) {
  return svg(
    `<path d="M50 10c10 0 14 9 21 11s16 1 18 11-6 13-5 21 9 13 3 21-15 3-22 8-9 13-19 12-10-10-17-14-17 0-19-10 6-12 5-19-8-13-1-21 15-2 21-7 6-13 15-13z" fill="${color}" stroke="rgba(40,30,60,0.55)" stroke-width="3"/>
     <ellipse cx="38" cy="34" rx="10" ry="6" fill="#fff" opacity="0.55" transform="rotate(-30 38 34)"/>`,
  );
}

// ---------------------------------------------------------------- steps, arrows, buttons

// A blue folder (like the Files app) with a fish on it, and a round badge with an arrow:
// down into the folder = save a copy, up out of it = load a copy.
function folderIcon(save) {
  const badge = save ? '#2fb85a' : '#ff9f3d';
  const arrow = save ? 'M78 9v22M70 23l8 9 8-9' : 'M78 32V10M70 18l8-9 8 9';
  return svg(
    `<path d="M8 32c0-4 3-7 7-7h20l7 8h41c4 0 7 3 7 7v40c0 4-3 7-7 7H15c-4 0-7-3-7-7z" fill="#7cc6ff"/>
     <path d="M8 44h82v35c0 4-3 7-7 7H15c-4 0-7-3-7-7z" fill="#4aa3f0"/>
     <path d="M60 64c0 6-6 10-13 10-5 0-9-2-11-5l-8 5 2-10-2-10 8 5c2-3 6-5 11-5 7 0 13 4 13 10z" fill="#ffd23f" stroke="${OUT}" stroke-width="2.5" stroke-linejoin="round"/>
     <circle cx="51" cy="61" r="2.6" fill="${OUT}"/>
     <circle cx="78" cy="21" r="17" fill="${badge}" stroke="#fff" stroke-width="3.5"/>
     <path d="${arrow}" fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
}

export const ICONS = {
  stepShape: svg(`<path d="${BODY.round}" fill="#fff" stroke="${OUT}" stroke-width="4" stroke-linejoin="round"/>${eyeDot(70, 45)}`),
  stepShapeSea: svg(`<path d="${ANIMAL.whale}" fill="#fff" stroke="${OUT}" stroke-width="4" stroke-linejoin="round"/>${eyeDot(78, 56, 5)}`),
  toSea: TO_SEA,
  toReef: TO_REEF,
  stepPaint: svg(
    `<path d="M50 14C26 14 10 30 10 50c0 18 14 30 28 30 8 0 10-6 8-12-2-7 3-11 9-10 12 2 33 0 33-20 0-14-16-24-38-24z" fill="#fff4dc" stroke="${OUT}" stroke-width="4"/>
     <circle cx="30" cy="40" r="7" fill="#ff5d5d"/><circle cx="46" cy="28" r="7" fill="#ffd23f"/><circle cx="64" cy="30" r="7" fill="#35d07f"/><circle cx="74" cy="46" r="7" fill="#3fa9ff"/>
     <path d="M88 56 64 82" stroke="#a0643a" stroke-width="7" stroke-linecap="round"/><path d="M64 82c-4 4-10 6-14 4 0-5 3-10 8-12z" fill="#ff5d8f" stroke="${OUT}" stroke-width="3"/>`,
  ),
  stepPattern: svg(
    `<defs><clipPath id="sp"><circle cx="50" cy="50" r="36"/></clipPath></defs>
     <circle cx="50" cy="50" r="36" fill="#ff8a3d"/>
     <g clip-path="url(#sp)"><rect x="24" y="10" width="9" height="80" fill="#fff6e8"/><rect x="46" y="10" width="9" height="80" fill="#fff6e8"/><circle cx="72" cy="38" r="5" fill="#fff6e8"/><circle cx="74" cy="62" r="5" fill="#fff6e8"/></g>
     <circle cx="50" cy="50" r="36" fill="none" stroke="${OUT}" stroke-width="4"/>`,
  ),
  stepEyes: svg(`<circle cx="50" cy="50" r="34" fill="#fff" stroke="${OUT}" stroke-width="4"/><circle cx="54" cy="52" r="20" fill="#2f7fd1"/><circle cx="54" cy="52" r="12" fill="#2a2140"/><circle cx="59" cy="46" r="5" fill="#fff"/>`),
  stepRelease: svg(
    `<path d="M8 72q10-8 21 0t21 0 21 0 21 0v20H8z" fill="#3fa9ff" stroke="${OUT}" stroke-width="3.5" stroke-linejoin="round"/>
     <path d="M66 22c0 9-9 15-19 15-7 0-13-3-16-8l-13 8 4-15-4-15 13 8c3-5 9-8 16-8 10 0 19 6 19 15z" transform="rotate(35 48 30)" fill="#ffd23f" stroke="${OUT}" stroke-width="3.5" stroke-linejoin="round"/>
     <path d="M70 60c2-6 6-10 10-12M30 60c-2-6-6-10-10-12" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`,
  ),
  prev: svg(`<path d="M62 18 30 50l32 32" fill="none" stroke="#fff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>`),
  next: svg(`<path d="M38 18l32 32-32 32" fill="none" stroke="#fff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>`),
  home: svg(
    `<path d="M14 50 50 18l36 32" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
     <path d="M24 46v38h52V46" fill="#fff" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>
     <path d="M58 66c0 6-6 9-11 9-4 0-7-2-9-4l-7 4 2-9-2-9 7 4c2-2 5-4 9-4 5 0 11 3 11 9z" fill="#3fa9ff"/>`,
  ),
  wand: svg(
    `<path d="M22 86 62 38" stroke="#5b3a8c" stroke-width="10" stroke-linecap="round"/>
     <path d="M22 86 32 74" stroke="#fff" stroke-width="10" stroke-linecap="round"/>
     <path d="M70 12l5 11 12 2-9 8 2 12-10-6-11 6 2-12-8-8 12-2z" fill="#ffd23f" stroke="#c77a12" stroke-width="3" stroke-linejoin="round"/>
     <path class="tw" d="M30 30l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fff"/><path class="tw tw2" d="M86 56l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="#fff"/><path class="tw tw3" d="M46 18l1.5 3.5 3.5 1.5-3.5 1.5L46 28l-1.5-3.5L41 23l3.5-1.5z" fill="#fff"/>`,
  ),
  release: svg(
    `<path d="M12 70q10-9 19.5 0t19 0 19 0 19 0" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/>
     <path d="M76 34c0 10-10 17-22 17-8 0-15-3-19-9l-15 9 5-17-5-17 15 9c4-6 11-9 19-9 12 0 22 7 22 17z" transform="rotate(30 50 34)" fill="#fff"/>
     <circle cx="62" cy="36" r="4" fill="#1d8a42" transform="rotate(30 50 34)"/>
     <path d="M26 84h48" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity="0.7"/>`,
  ),
  factory: svg(
    `<defs><linearGradient id="fb" x1="0" x2="1"><stop offset="0" stop-color="#ff5d8f"/><stop offset="0.35" stop-color="#ffd23f"/><stop offset="0.7" stop-color="#35d07f"/><stop offset="1" stop-color="#3fa9ff"/></linearGradient></defs>
     <path d="M80 22 50 62" stroke="#a0643a" stroke-width="7" stroke-linecap="round"/><path d="M50 62c-5 3-9 9-7 14 6 1 12-3 14-8z" fill="#9b6bff" stroke="${OUT}" stroke-width="3"/>
     <path d="M74 56c0 12-11 20-25 20-9 0-17-4-21-10l-17 10 5-20-5-20 17 10c4-6 12-10 21-10 14 0 25 8 25 20z" fill="url(#fb)" stroke="${OUT}" stroke-width="3.5" stroke-linejoin="round"/>
     ${eyeDot(61, 51, 6.5)}${smile(64, 63)}
     <path class="tw" d="M22 16l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" fill="#fff"/><path class="tw tw2" d="M88 74l2 4.5 4.5 2-4.5 2-2 4.5-2-4.5-4.5-2 4.5-2z" fill="#fff"/>`,
  ),
  gear: svg(
    `<path d="M43 8h14l2 11 8 4 9-7 10 10-7 9 4 8 11 2v14l-11 2-4 8 7 9-10 10-9-7-8 4-2 11H43l-2-11-8-4-9 7-10-10 7-9-4-8-11-2V43l11-2 4-8-7-9 10-10 9 7 8-4z" fill="#fff"/><circle cx="50" cy="50" r="14" fill="#2a4f78"/>`,
  ),
  close: svg(`<path d="M26 26l48 48M74 26 26 74" stroke="#fff" stroke-width="11" stroke-linecap="round"/>`),
  check: svg(`<path d="M20 52l20 20 40-44" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>`),
  cross: svg(`<path d="M28 28l44 44M72 28 28 72" stroke="#fff" stroke-width="12" stroke-linecap="round"/>`),
  speakerLow: svg(`<path d="M16 40h14l18-14v48L30 60H16z" fill="#fff"/><path d="M60 40q7 10 0 20" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>`),
  speakerHigh: svg(`<path d="M10 40h14l18-14v48L24 60H10z" fill="#fff"/><path d="M54 40q7 10 0 20M64 30q14 20 0 40M74 20q21 30 0 60" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>`),
  seaLow: svg(`<path d="M14 56q9-8 18 0t18 0 18 0 18 0" fill="none" stroke="#bff6ff" stroke-width="6" stroke-linecap="round"/>`),
  seaHigh: svg(`<path d="M10 36q10-9 20 0t20 0 20 0 20 0M10 54q10-9 20 0t20 0 20 0 20 0M10 72q10-9 20 0t20 0 20 0 20 0" fill="none" stroke="#bff6ff" stroke-width="6" stroke-linecap="round"/>`),
  saveCopy: folderIcon(true),
  loadCopy: folderIcon(false),
  deleteFish: svg(
    `<path d="M70 40c0 9-9 15-20 15-7 0-13-3-16-8l-14 8 4-15-4-15 14 8c3-5 9-8 16-8 11 0 20 6 20 15z" fill="#ffd23f" stroke="${OUT}" stroke-width="3"/>
     <path d="M30 62h40l-4 30H34z" fill="#fff" stroke="${OUT}" stroke-width="3"/><path d="M26 62h48" stroke="${OUT}" stroke-width="4" stroke-linecap="round"/><path d="M42 68v18M50 68v18M58 68v18" stroke="${OUT}" stroke-width="3" stroke-linecap="round"/>`,
  ),
};
