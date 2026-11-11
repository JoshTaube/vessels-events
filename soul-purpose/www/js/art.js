/* SOUL PURPOSE — all the art, drawn in code as SVG strings. No image files.
 * Style: rubber-hose cartoon, flat modern palette, thick ink outlines.
 *   SP.art.makeLooks(n)            random looks for n souls (body color, eyes, mouth, hat or hairdo)
 *   SP.art.soul(look, { prop })    a bean ghost; holds the prop (a key of PROPS) in rubber-hose arms
 *   SP.art.prop(key)               one prop on its own
 *   SP.art.gary()                  the boss: a tired grey cloud in a tiny necktie, with coffee
 *   SP.art.bell(), plant(), cloud(), scene('light'|'dark')
 */
(function (root) {
  'use strict';

  const INK = '#2a2140';
  const O = `stroke="${INK}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"`;
  const O4 = `stroke="${INK}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"`;
  const O3 = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
  const FONT = `font-family="Lilita One, Arial Rounded MT Bold, sans-serif"`;
  const C = {
    white: '#ffffff', cream: '#fff3d6', blue: '#5fb2e8', sky: '#bfe6ff', red: '#e2475a', yellow: '#ffd66b',
    orange: '#f59e4c', brown: '#c08552', dkbrown: '#8a5a3c', grey: '#c9ccd8', dark: '#3b3355', pink: '#ffa9cf',
    green: '#7ccf5a', purple: '#9a6ad6', mouth: '#6b2140', tongue: '#ff7a9a',
  };

  let uid = 0;
  const rnd = Math.random;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const r1 = (n) => Math.round(n * 10) / 10;

  // ---------------- looks ----------------
  const BODIES = [
    ['#8ee6c4', '#5cc8a3'], ['#8fd3ff', '#5fb2e8'], ['#c9a7ff', '#a07fe6'], ['#ffa9cf', '#ef7fb0'],
    ['#ffc39a', '#f59e6c'], ['#ffe27a', '#f2c443'], ['#c6ef7e', '#9fd450'], ['#ff9a8b', '#ec7262'],
    ['#7fe3e8', '#4fc4cb'], ['#a9b8ff', '#7f90f0'], ['#f6b8ff', '#d98ae8'], ['#b8f0e0', '#86d6bf'],
  ];
  const HAIR = ['#3b2a20', '#e0a33a', '#c2462e', '#2a2140', '#f4f1ea', '#8a5a3c'];
  const HATS = ['#e2475a', '#3b82c4', '#2f9e6e', '#f08a24', '#6c2fa3', '#ff6fa8'];
  const EYES = ['dots', 'pie', 'sleepy', 'wide'];
  const MOUTHS = ['smile', 'grin', 'o', 'wavy', 'smirk'];
  const TOPS = ['tophat', 'beanie', 'cap', 'bow', 'curl', 'bun', 'tuft', 'flower', 'bowler', 'beret', 'sprout', 'pigtails'];

  /** n looks. Colors and hats are dealt from shuffled decks so neighbors rarely match. */
  function makeLooks(n) {
    const bodies = shuffle(BODIES);
    const tops = shuffle(TOPS);
    return Array.from({ length: n }, (_, i) => ({
      body: bodies[i % bodies.length][0],
      shade: bodies[i % bodies.length][1],
      eyes: pick(EYES),
      mouth: pick(MOUTHS),
      top: tops[i % tops.length],
      hair: pick(HAIR),
      hat: pick(HATS),
      lean: r1(rnd() * 2 - 1),
      squat: r1(0.92 + rnd() * 0.16),
      blush: rnd() < 0.6,
    }));
  }

  // ---------------- the ghost ----------------
  const TOP = 46, BOT = 206;

  function bodyPath(cx, hx, w) {
    const L = cx - w, R = cx + w;
    let d = `M${r1(hx)} ${TOP} C${r1(hx + w * 0.92)} ${TOP} ${r1(R)} ${TOP + 42} ${r1(R)} ${TOP + 82} L${r1(R + 3)} ${BOT - 10}`;
    const n = 4, x0 = R + 3, W = 2 * w + 6;
    for (let i = 0; i < n; i++) {
      const a = x0 - (W * i) / n, b = x0 - (W * (i + 1)) / n;
      d += ` Q${r1((a + b) / 2)} ${BOT + 14} ${r1(b)} ${BOT - 10}`;
    }
    d += ` L${r1(L)} ${TOP + 82} C${r1(L)} ${TOP + 42} ${r1(hx - w * 0.92)} ${TOP} ${r1(hx)} ${TOP} Z`;
    return d;
  }

  function eye(kind, x, y, look) {
    switch (kind) {
      case 'pie':
        return `<ellipse cx="${x}" cy="${y}" rx="11" ry="14" fill="#fff" ${O4}/>
          <ellipse cx="${x}" cy="${y + 3}" rx="6.5" ry="9" fill="${INK}"/>
          <path d="M${x} ${y + 3} L${x + 1.5} ${y - 7} L${x + 7} ${y - 2} Z" fill="#fff"/>`;
      case 'sleepy':
        return `<ellipse cx="${x}" cy="${y}" rx="11" ry="12" fill="#fff" ${O4}/>
          <circle cx="${x}" cy="${y + 5}" r="5" fill="${INK}"/>
          <path d="M${x - 12} ${y + 3} A12 13 0 0 1 ${x + 12} ${y + 3} Z" fill="${look.body}" ${O4}/>
          <path d="M${x - 9} ${y - 9} l-3 -5 M${x} ${y - 11} v-6 M${x + 9} ${y - 9} l3 -5" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`;
      case 'wide':
        return `<ellipse cx="${x}" cy="${y}" rx="12" ry="15" fill="#fff" ${O4}/>
          <circle cx="${x + 3}" cy="${y + 3}" r="5.5" fill="${INK}"/><circle cx="${x + 5}" cy="${y}" r="1.8" fill="#fff"/>`;
      default:
        return `<ellipse cx="${x}" cy="${y}" rx="6.5" ry="9.5" fill="${INK}"/><circle cx="${x + 2}" cy="${y - 3.5}" r="2.4" fill="#fff"/>`;
    }
  }

  function mouth(kind, x, y) {
    switch (kind) {
      case 'grin':
        return `<path d="M${x - 15} ${y - 6} Q${x} ${y + 20} ${x + 15} ${y - 6} Z" fill="${C.mouth}" ${O4}/>
          <path d="M${x - 7} ${y + 6} Q${x} ${y + 1} ${x + 7} ${y + 6} Q${x} ${y + 10} ${x - 7} ${y + 6} Z" fill="${C.tongue}"/>`;
      case 'o':
        return `<ellipse cx="${x}" cy="${y}" rx="6" ry="8" fill="${C.mouth}" ${O4}/>`;
      case 'wavy':
        return `<path d="M${x - 15} ${y} q5 -6 10 0 t10 0 t10 0" fill="none" ${O}/>`;
      case 'smirk':
        return `<path d="M${x - 12} ${y} Q${x + 2} ${y + 8} ${x + 14} ${y - 7}" fill="none" ${O}/>`;
      default:
        return `<path d="M${x - 13} ${y - 4} Q${x} ${y + 10} ${x + 13} ${y - 4}" fill="none" ${O}/>`;
    }
  }

  /** Hats and hairdos. Returns [behind the body, in front of the body]. */
  function topper(kind, hx, cx, w, look) {
    const t = TOP;
    switch (kind) {
      case 'tophat':
        return ['', `<g transform="rotate(-8 ${hx} ${t})">
          <rect x="${hx - 21}" y="${t - 40}" width="42" height="40" rx="4" fill="${C.dark}" ${O}/>
          <rect x="${hx - 21}" y="${t - 14}" width="42" height="8" fill="${look.hat}" ${O3}/>
          <ellipse cx="${hx}" cy="${t + 1}" rx="35" ry="8" fill="${C.dark}" ${O}/></g>`];
      case 'beanie':
        return ['', `<path d="M${hx - 38} ${t + 18} Q${hx - 36} ${t - 30} ${hx} ${t - 31} Q${hx + 36} ${t - 30} ${hx + 38} ${t + 18} Z" fill="${look.hat}" ${O}/>
          <path d="M${hx - 20} ${t - 22} v34 M${hx} ${t - 30} v42 M${hx + 20} ${t - 22} v34" stroke="#0002" stroke-width="5"/>
          <rect x="${hx - 42}" y="${t + 6}" width="84" height="15" rx="7.5" fill="#fff" ${O}/>
          <circle cx="${hx}" cy="${t - 36}" r="10" fill="#fff" ${O}/>`];
      case 'cap':
        return ['', `<path d="M${hx - 36} ${t + 14} Q${hx - 34} ${t - 26} ${hx} ${t - 27} Q${hx + 34} ${t - 26} ${hx + 36} ${t + 14} Z" fill="${look.hat}" ${O}/>
          <path d="M${hx + 18} ${t + 10} Q${hx + 56} ${t + 2} ${hx + 64} ${t + 16} Q${hx + 40} ${t + 22} ${hx + 16} ${t + 18} Z" fill="${look.hat}" ${O}/>
          <circle cx="${hx}" cy="${t - 27}" r="4" fill="${INK}"/>`];
      case 'bow': {
        const x = hx + 26, y = t + 10;
        return ['', `<g transform="rotate(18 ${x} ${y})">
          <path d="M${x} ${y} L${x - 24} ${y - 15} Q${x - 28} ${y} ${x - 24} ${y + 15} Z" fill="${look.hat}" ${O4}/>
          <path d="M${x} ${y} L${x + 24} ${y - 15} Q${x + 28} ${y} ${x + 24} ${y + 15} Z" fill="${look.hat}" ${O4}/>
          <circle cx="${x}" cy="${y}" r="7" fill="${look.hat}" ${O4}/></g>`];
      }
      case 'curl':
        return ['', `<path d="M${hx} ${t + 3} C${hx - 3} ${t - 20} ${hx + 24} ${t - 26} ${hx + 20} ${t - 8} C${hx + 17} ${t + 3} ${hx + 4} ${t - 2} ${hx + 8} ${t - 11}" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`];
      case 'bun':
        return ['', `<circle cx="${hx}" cy="${t - 12}" r="17" fill="${look.hair}" ${O}/>
          <path d="M${hx - 9} ${t - 18} q9 -6 18 0" fill="none" stroke="#fff6" stroke-width="3" stroke-linecap="round"/>
          <rect x="${hx - 13}" y="${t - 1}" width="26" height="8" rx="4" fill="${look.hat}" ${O3}/>`];
      case 'tuft':
        return ['', `<path d="M${hx - 17} ${t + 9} L${hx - 13} ${t - 22} L${hx - 4} ${t - 3} L${hx + 2} ${t - 30} L${hx + 8} ${t - 3} L${hx + 17} ${t - 21} L${hx + 19} ${t + 9} Z" fill="${look.hair}" ${O}/>`];
      case 'flower': {
        const x = hx + 30, y = t + 16;
        const petals = [0, 72, 144, 216, 288].map((a) => {
          const rad = (a * Math.PI) / 180;
          return `<circle cx="${r1(x + Math.cos(rad) * 10)}" cy="${r1(y + Math.sin(rad) * 10)}" r="8" fill="#fff" ${O3}/>`;
        }).join('');
        return ['', `${petals}<circle cx="${x}" cy="${y}" r="6.5" fill="${C.yellow}" ${O3}/>`];
      }
      case 'bowler':
        return ['', `<path d="M${hx - 28} ${t + 6} Q${hx - 28} ${t - 30} ${hx} ${t - 30} Q${hx + 28} ${t - 30} ${hx + 28} ${t + 6} Z" fill="${C.dark}" ${O}/>
          <path d="M${hx - 27} ${t - 2} h54" stroke="${look.hat}" stroke-width="6"/>
          <ellipse cx="${hx}" cy="${t + 6}" rx="40" ry="7" fill="${C.dark}" ${O}/>`];
      case 'beret':
        return ['', `<ellipse cx="${hx - 4}" cy="${t - 2}" rx="40" ry="14" fill="${look.hat}" ${O} transform="rotate(-12 ${hx} ${t})"/>
          <path d="M${hx - 2} ${t - 15} l2 -9" ${O}/>`];
      case 'sprout':
        return ['', `<path d="M${hx} ${t + 2} Q${hx - 3} ${t - 14} ${hx + 2} ${t - 24}" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
          <ellipse cx="${hx - 12}" cy="${t - 24}" rx="12" ry="6" fill="${C.green}" ${O4} transform="rotate(25 ${hx - 12} ${t - 24})"/>
          <ellipse cx="${hx + 14}" cy="${t - 28}" rx="12" ry="6" fill="${C.green}" ${O4} transform="rotate(-25 ${hx + 14} ${t - 28})"/>`];
      case 'pigtails': {
        const y = t + 38, L = cx - w - 2, R = cx + w + 2;
        return [`<circle cx="${L}" cy="${y}" r="16" fill="${look.hair}" ${O}/><circle cx="${R}" cy="${y}" r="16" fill="${look.hair}" ${O}/>`,
          `<circle cx="${L + 12}" cy="${y - 6}" r="5" fill="${look.hat}" ${O3}/><circle cx="${R - 12}" cy="${y - 6}" r="5" fill="${look.hat}" ${O3}/>`];
      }
      default:
        return ['', ''];
    }
  }

  function tube(d, color) {
    return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="12" stroke-linecap="round"/>
      <path d="${d}" fill="none" stroke="${color}" stroke-width="5.5" stroke-linecap="round"/>`;
  }
  const glove = (x, y) => `<circle cx="${x}" cy="${y}" r="9.5" fill="#fff" ${O4}/><path d="M${x - 4} ${y - 2} h6" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;

  /** A soul. look from makeLooks(); opts.prop = a PROPS key (or nothing for empty waving hands). */
  function soul(look, opts = {}) {
    const id = 'sp' + (++uid);
    const cx = 100;
    const w = 58 * look.squat;
    const hx = cx + look.lean * 7;
    const body = bodyPath(cx, hx, w);
    const fx = r1(cx + look.lean * 4);
    const ey = TOP + 62;
    const [back, front] = topper(look.top, r1(hx), cx, w, look);
    const blush = look.blush
      ? `<ellipse cx="${fx - 33}" cy="${ey + 18}" rx="9" ry="5" fill="#ff6f9f" opacity=".45"/><ellipse cx="${fx + 33}" cy="${ey + 18}" rx="9" ry="5" fill="#ff6f9f" opacity=".45"/>`
      : '';

    let hands;
    if (opts.prop && PROPS[opts.prop]) {
      const la = `M${r1(cx - w + 9)} 136 C${r1(cx - w - 16)} 150 ${cx - 64} 186 ${cx - 46} 180`;
      const ra = `M${r1(cx + w - 9)} 136 C${r1(cx + w + 16)} 150 ${cx + 64} 186 ${cx + 46} 180`;
      hands = `<g class="arms">${tube(la, look.body)}${tube(ra, look.body)}</g>
        <g class="held" transform="translate(58 134) scale(.84)">${PROPS[opts.prop]}</g>
        ${glove(cx - 46, 180)}${glove(cx + 46, 180)}`;
    } else {
      const la = `M${r1(cx - w + 9)} 140 C${r1(cx - w - 10)} 148 ${r1(cx - w - 22)} 132 ${r1(cx - w - 20)} 118`;
      const ra = `M${r1(cx + w - 9)} 140 C${r1(cx + w + 10)} 148 ${r1(cx + w + 22)} 132 ${r1(cx + w + 20)} 118`;
      hands = `<g class="arms">${tube(la, look.body)}${tube(ra, look.body)}</g>
        ${glove(r1(cx - w - 20), 116)}${glove(r1(cx + w + 20), 116)}`;
    }

    return `<svg class="soul ${opts.cls || ''}" viewBox="0 0 200 240" aria-hidden="true">
      <defs><clipPath id="${id}"><path d="${body}"/></clipPath></defs>
      <ellipse class="soul-shadow" cx="100" cy="230" rx="44" ry="7" fill="${INK}" opacity=".16"/>
      <g class="soul-body">
        ${back}
        <path d="${body}" fill="${look.body}"/>
        <g clip-path="url(#${id})"><ellipse cx="${r1(cx + w * 0.95)}" cy="160" rx="${r1(w * 0.72)}" ry="120" fill="${look.shade}"/></g>
        <path d="${body}" fill="none" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
        <ellipse cx="${r1(hx - w * 0.46)}" cy="${TOP + 30}" rx="8" ry="15" fill="#fff" opacity=".6" transform="rotate(28 ${r1(hx - w * 0.46)} ${TOP + 30})"/>
        ${blush}
        <g class="eyes">${eye(look.eyes, fx - 21, ey, look)}${eye(look.eyes, fx + 21, ey, look)}</g>
        ${mouth(look.mouth, fx, ey + 30)}
        ${front}
        ${hands}
      </g>
    </svg>`;
  }

  // ---------------- props (each drawn in a 100 x 100 box) ----------------
  const PROPS = {
    airplane: `
      <path d="M58 50 L70 16 L80 16 L75 50Z" fill="${C.blue}" ${O}/>
      <path d="M18 48 L12 26 L22 26 L32 46Z" fill="${C.blue}" ${O}/>
      <path d="M10 56 Q10 46 22 46 L80 46 Q94 48 94 56 Q94 65 80 66 L22 66 Q10 66 10 56Z" fill="#fff" ${O}/>
      <circle cx="38" cy="55" r="3.5" fill="${C.blue}"/><circle cx="50" cy="55" r="3.5" fill="${C.blue}"/><circle cx="62" cy="55" r="3.5" fill="${C.blue}"/>
      <path d="M82 50 Q89 51 90 56" fill="none" ${O3}/>
      <path d="M58 62 L72 90 L82 90 L75 62Z" fill="${C.blue}" ${O}/>`,
    phone: `
      <rect x="28" y="6" width="44" height="88" rx="9" fill="${C.dark}" ${O}/>
      <rect x="34" y="16" width="32" height="64" rx="3" fill="${C.sky}"/>
      <rect x="37" y="22" width="25" height="22" rx="4" fill="#fff" ${O3}/>
      <path d="M41 28h17 M41 33h17 M41 38h11" stroke="#9aa0b4" stroke-width="2.5" stroke-linecap="round"/>
      <rect x="47" y="54" width="15" height="14" rx="4" fill="${C.green}" ${O3}/>
      <text x="54.5" y="65" font-size="12" text-anchor="middle" ${FONT} fill="${INK}">k</text>
      <circle cx="50" cy="87" r="2.5" fill="${C.grey}"/>`,
    milkJug: `
      <rect x="36" y="6" width="20" height="12" rx="3" fill="${C.blue}" ${O}/>
      <path d="M62 36 q16 2 15 17 q-1 11 -11 12" fill="none" ${O}/>
      <path d="M34 18 h24 l4 12 q14 6 14 22 v38 q0 6 -6 6 h-38 q-6 0 -6 -6 v-50 q0 -10 8 -16z" fill="#fff" ${O}/>
      <rect x="30" y="52" width="34" height="22" rx="3" fill="${C.blue}" ${O3}/>
      <text x="47" y="68" font-size="11" text-anchor="middle" ${FONT} fill="#fff">MILK</text>`,
    airplaneSeat: `
      <path d="M14 14 Q12 7 20 7 L40 7 Q46 7 48 14 L66 66 L34 70Z" fill="${C.blue}" ${O}/>
      <path d="M19 10 L40 10 L44 24 L23 26Z" fill="#fff" ${O3}/>
      <path d="M40 84 L36 96 M72 84 L76 96" ${O}/>
      <rect x="28" y="62" width="56" height="18" rx="8" fill="${C.blue}" ${O}/>
      <path d="M48 54 h32" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
      <circle cx="74" cy="44" r="5" fill="${C.red}" ${O3}/>`,
    clipboard: `
      <rect x="18" y="12" width="64" height="84" rx="6" fill="${C.brown}" ${O}/>
      <rect x="26" y="22" width="48" height="66" rx="2" fill="#fff" ${O3}/>
      <rect x="36" y="6" width="28" height="14" rx="4" fill="${C.grey}" ${O}/>
      <path d="M32 34h36M32 44h36M32 54h26" stroke="#9aa0b4" stroke-width="3" stroke-linecap="round"/>
      <path d="M58 76 a9 9 0 1 1 -2 -12" fill="none" stroke="${C.red}" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M57 59 l0 6 l-6 0" fill="none" stroke="${C.red}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    shoppingCart: `
      <path d="M6 22 h14 l8 46 h54" fill="none" ${O}/>
      <path d="M23 30 h68 l-9 32 h-51z" fill="#fff" ${O}/>
      <path d="M39 30 l2 32 M55 30 v32 M71 30 l-2 32 M26 46 h61" stroke="${INK}" stroke-width="3"/>
      <circle cx="38" cy="82" r="8" fill="${C.dark}" ${O}/><circle cx="74" cy="82" r="8" fill="${C.dark}" ${O}/>`,
    popcorn: `
      <circle cx="32" cy="30" r="10" fill="${C.cream}" ${O4}/><circle cx="46" cy="21" r="11" fill="${C.cream}" ${O4}/>
      <circle cx="61" cy="23" r="11" fill="${C.cream}" ${O4}/><circle cx="72" cy="32" r="10" fill="${C.cream}" ${O4}/>
      <circle cx="52" cy="33" r="9" fill="${C.cream}" ${O4}/>
      <path d="M22 36 h56 l-8 58 h-40z" fill="#fff"/>
      <path d="M33 36 h10 l-1 58 h-8 z M58 36 h10 l-3 58 h-8 z" fill="${C.red}"/>
      <path d="M22 36 h56 l-8 58 h-40z" fill="none" ${O}/>`,
    cupOfIce: `
      <path d="M60 2 l-7 36" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
      <path d="M60 2 l-7 36" stroke="${C.red}" stroke-width="5" stroke-linecap="round"/>
      <rect x="28" y="22" width="18" height="18" rx="4" fill="#e9f7ff" ${O4} transform="rotate(-14 37 31)"/>
      <rect x="48" y="24" width="17" height="17" rx="4" fill="#e9f7ff" ${O4} transform="rotate(12 56 32)"/>
      <path d="M24 34 h52 l-6 60 h-40z" fill="${C.sky}" fill-opacity=".9" ${O}/>
      <path d="M34 44 l3 40" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`,
    escalator: `
      <path d="M8 84 L30 84 L70 30 L92 30 L92 46 L76 46 L37 96 L8 96Z" fill="${C.grey}" ${O}/>
      <path d="M28 84 h6 v-9 h7 v-9 h7 v-9 h7 v-9 h7 v-9 h7 v-9 h8" fill="none" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M6 68 L26 68 L66 14 L94 14" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M6 68 L26 68 L66 14 L94 14" fill="none" stroke="${C.dark}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
    microwave: `
      <path d="M28 16 q-5 -5 0 -10 M44 16 q-5 -5 0 -10 M60 16 q-5 -5 0 -10" fill="none" stroke="${C.green}" stroke-width="3.5" stroke-linecap="round"/>
      <rect x="6" y="22" width="88" height="60" rx="6" fill="#fff" ${O}/>
      <rect x="14" y="30" width="54" height="44" rx="4" fill="${C.yellow}" ${O3}/>
      <path d="M24 52 q12 -11 26 0 q-14 11 -26 0z M50 52 l9 -7 v14z" fill="${C.orange}" ${O3}/>
      <circle cx="30" cy="50" r="1.8" fill="${INK}"/>
      <rect x="74" y="31" width="14" height="8" rx="2" fill="${C.green}" ${O3}/>
      <circle cx="77" cy="50" r="2.5" fill="${INK}"/><circle cx="85" cy="50" r="2.5" fill="${INK}"/>
      <circle cx="77" cy="59" r="2.5" fill="${INK}"/><circle cx="85" cy="59" r="2.5" fill="${INK}"/>
      <path d="M14 82 v8 M86 82 v8" ${O}/>`,
    envelope: `
      <rect x="8" y="22" width="84" height="58" rx="5" fill="#fff" ${O}/>
      <path d="M10 25 L50 56 L90 25" fill="none" ${O}/>
      <rect x="70" y="58" width="14" height="15" fill="${C.red}" ${O3}/>
      <text x="30" y="74" font-size="11" text-anchor="middle" ${FONT} fill="${C.red}">RE:</text>`,
    toiletPaper: `
      <rect x="30" y="24" width="40" height="46" rx="3" fill="${C.brown}" ${O}/>
      <ellipse cx="50" cy="24" rx="20" ry="7" fill="${C.brown}" ${O}/>
      <ellipse cx="50" cy="24" rx="9" ry="3.5" fill="${C.dkbrown}" ${O3}/>
      <path d="M40 46 h20 v24 h-20z" fill="#fff" ${O3}/>
      <path d="M40 58 h20" stroke="${INK}" stroke-width="2" stroke-dasharray="3 3"/>`,
    coinPurse: `
      <path d="M26 38 Q26 26 50 26 Q74 26 74 38" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>
      <path d="M26 38 Q26 26 50 26 Q74 26 74 38" fill="none" stroke="${C.yellow}" stroke-width="5" stroke-linecap="round"/>
      <circle cx="44" cy="22" r="6" fill="${C.yellow}" ${O4}/><circle cx="56" cy="22" r="6" fill="${C.yellow}" ${O4}/>
      <path d="M22 38 h56 q9 30 -6 46 q-22 12 -44 0 q-15 -16 -6 -46z" fill="${C.pink}" ${O}/>
      <circle cx="86" cy="82" r="7" fill="#d9894a" ${O4}/><circle cx="12" cy="88" r="6" fill="#d9894a" ${O4}/>`,
    chatBubble: `
      <path d="M14 18 h66 a10 10 0 0 1 10 10 v30 a10 10 0 0 1 -10 10 h-40 l-14 14 v-14 h-12 a10 10 0 0 1 -10 -10 v-30 a10 10 0 0 1 10 -10z" fill="${C.green}" ${O}/>
      <circle cx="32" cy="43" r="5" fill="#fff"/><circle cx="47" cy="43" r="5" fill="#fff"/><circle cx="62" cy="43" r="5" fill="#fff"/>
      <circle cx="84" cy="18" r="11" fill="${C.red}" ${O4}/>
      <text x="84" y="23" font-size="14" text-anchor="middle" ${FONT} fill="#fff">!</text>`,
    dinnerPlate: `
      <text x="50" y="30" font-size="26" text-anchor="middle" ${FONT} fill="${C.purple}" stroke="${INK}" stroke-width="2">?</text>
      <ellipse cx="50" cy="62" rx="44" ry="22" fill="#fff" ${O}/>
      <ellipse cx="50" cy="60" rx="30" ry="13" fill="#f3f0ff" ${O3}/>
      <circle cx="42" cy="58" r="5" fill="${C.green}" ${O3}/>
      <path d="M50 55 q11 -5 14 3 q-7 7 -14 -3z" fill="${C.orange}" ${O3}/>`,
    cakeSlice: `
      <path d="M12 46 L80 30 L92 40 L24 58Z" fill="${C.pink}" ${O}/>
      <path d="M24 58 L92 40 L92 74 L24 92Z" fill="${C.cream}" ${O}/>
      <path d="M12 46 L24 58 L24 92 L12 80Z" fill="#f2d39a" ${O}/>
      <path d="M26 76 L90 58" stroke="${C.pink}" stroke-width="5"/>
      <rect x="52" y="20" width="7" height="24" fill="${C.blue}" ${O3}/>
      <path d="M55.5 6 q7 7 0 13 q-7 -6 0 -13z" fill="${C.yellow}" ${O3}/>`,
    comicBook: `
      <rect x="18" y="8" width="64" height="86" rx="3" fill="${C.yellow}" ${O}/>
      <path d="M26 8 v86" stroke="${INK}" stroke-width="3"/>
      <path d="M55 20 L61 35 L77 31 L67 45 L79 58 L63 58 L59 74 L51 61 L37 67 L43 52 L31 42 L47 39Z" fill="${C.red}" ${O3}/>
      <text x="55" y="53" font-size="13" text-anchor="middle" ${FONT} fill="#fff">POW</text>
      <rect x="58" y="78" width="20" height="11" fill="#fff" stroke="${INK}" stroke-width="2"/>
      <text x="68" y="87" font-size="8.5" text-anchor="middle" ${FONT} fill="${INK}">$12</text>`,
    gavel: `
      <ellipse cx="36" cy="86" rx="27" ry="8" fill="${C.dkbrown}" ${O}/>
      <path d="M48 46 L86 80" stroke="${INK}" stroke-width="13" stroke-linecap="round"/>
      <path d="M48 46 L86 80" stroke="${C.brown}" stroke-width="6" stroke-linecap="round"/>
      <g transform="rotate(42 42 40)">
        <rect x="18" y="28" width="48" height="24" rx="6" fill="${C.brown}" ${O}/>
        <rect x="25" y="25" width="7" height="30" rx="2" fill="${C.dkbrown}" ${O3}/>
        <rect x="52" y="25" width="7" height="30" rx="2" fill="${C.dkbrown}" ${O3}/>
      </g>`,
    lightBulb: `
      <path d="M50 2 v8 M18 16 l6 6 M82 16 l-6 6 M6 44 h9 M85 44 h9" stroke="${C.orange}" stroke-width="5" stroke-linecap="round"/>
      <path d="M50 14 a28 28 0 0 1 16 51 v9 h-32 v-9 a28 28 0 0 1 16 -51z" fill="${C.yellow}" ${O}/>
      <path d="M42 63 l4 -14 l4 8 l4 -8 l4 14" fill="none" stroke="${C.orange}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M38 30 q-6 8 -4 18" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
      <rect x="35" y="74" width="30" height="8" rx="2" fill="${C.grey}" ${O4}/>
      <rect x="37" y="82" width="26" height="8" rx="2" fill="${C.grey}" ${O4}/>
      <path d="M44 90 h12 l-3 6 h-6z" fill="${INK}"/>`,
    carKeys: `
      <circle cx="30" cy="28" r="15" fill="none" stroke="${INK}" stroke-width="10"/>
      <circle cx="30" cy="28" r="15" fill="none" stroke="${C.grey}" stroke-width="4"/>
      <path d="M44 42 L78 76" stroke="${INK}" stroke-width="13" stroke-linecap="round"/>
      <path d="M44 42 L78 76" stroke="${C.yellow}" stroke-width="6" stroke-linecap="round"/>
      <path d="M64 70 l7 -7 M71 77 l7 -7" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
      <circle cx="46" cy="44" r="12" fill="${C.yellow}" ${O}/><circle cx="46" cy="44" r="3" fill="${INK}"/>
      <rect x="6" y="48" width="26" height="38" rx="11" fill="${C.dark}" ${O}/>
      <circle cx="19" cy="61" r="4" fill="${C.red}"/><circle cx="19" cy="74" r="4" fill="${C.green}"/>`,
    iceCreamCone: `
      <path d="M30 50 L70 50 L50 97Z" fill="#e8a85c" ${O}/>
      <path d="M40 58 L57 82 M52 52 L64 66 M62 54 L45 80 M46 52 L36 62" stroke="${C.dkbrown}" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="50" cy="42" r="21" fill="${C.pink}" ${O}/>
      <path d="M34 52 q0 10 5 10 q4 0 4 -7" fill="${C.pink}" ${O3}/>
      <circle cx="50" cy="20" r="15" fill="#c9a7ff" ${O}/>
      <circle cx="55" cy="6" r="5" fill="${C.red}" ${O3}/>`,
    bowtie: `
      <path d="M50 50 L14 28 Q7 50 14 72Z" fill="${C.red}" ${O}/>
      <path d="M50 50 L86 28 Q93 50 86 72Z" fill="${C.red}" ${O}/>
      <circle cx="26" cy="42" r="3.5" fill="#fff"/><circle cx="24" cy="58" r="3.5" fill="#fff"/>
      <circle cx="74" cy="42" r="3.5" fill="#fff"/><circle cx="76" cy="58" r="3.5" fill="#fff"/>
      <rect x="41" y="39" width="18" height="22" rx="6" fill="${C.red}" ${O}/>`,
    giftBox: `
      <path d="M50 32 Q28 8 24 26 Q27 35 50 32Z M50 32 Q72 8 76 26 Q73 35 50 32Z" fill="${C.yellow}" ${O4}/>
      <rect x="16" y="44" width="68" height="50" rx="4" fill="${C.blue}" ${O}/>
      <rect x="10" y="32" width="80" height="16" rx="4" fill="${C.blue}" ${O}/>
      <rect x="44" y="32" width="12" height="62" fill="${C.yellow}" ${O3}/>`,
    wifiRouter: `
      <path d="M38 24 q12 -10 24 0 M31 16 q19 -16 38 0" fill="none" stroke="${C.blue}" stroke-width="4.5" stroke-linecap="round"/>
      <circle cx="50" cy="31" r="3.5" fill="${C.blue}"/>
      <path d="M26 52 L18 16 M74 52 L82 16" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
      <rect x="10" y="50" width="80" height="30" rx="8" fill="${C.dark}" ${O}/>
      <circle cx="26" cy="65" r="3.5" fill="${C.green}"/><circle cx="37" cy="65" r="3.5" fill="${C.green}"/><circle cx="48" cy="65" r="3.5" fill="${C.yellow}"/>`,
    ticket: `
      <path d="M8 28 h84 v12 a8 8 0 0 0 0 18 v12 h-84 v-12 a8 8 0 0 0 0 -18z" fill="${C.yellow}" ${O}/>
      <path d="M31 31 v36" stroke="${INK}" stroke-width="3" stroke-dasharray="4 4"/>
      <path d="M19 41 l2.6 5.2 5.8 .8 -4.2 4 1 5.8 -5.2 -2.7 -5.2 2.7 1 -5.8 -4.2 -4 5.8 -.8z" fill="${C.red}"/>
      <text x="61" y="47" font-size="12" text-anchor="middle" ${FONT} fill="${INK}">ADMIT</text>
      <text x="61" y="60" font-size="12" text-anchor="middle" ${FONT} fill="${INK}">ONE</text>`,
    emptyWallet: `
      <path d="M48 32 q8 -10 13 -18" fill="none" stroke="${INK}" stroke-width="2" stroke-dasharray="3 3"/>
      <path d="M10 30 h74 a6 6 0 0 1 6 6 v44 a6 6 0 0 1 -6 6 h-74z" fill="${C.brown}" ${O}/>
      <path d="M10 30 h60 a10 10 0 0 1 10 10 v10 h-70" fill="${C.dkbrown}" ${O4}/>
      <circle cx="70" cy="44" r="3" fill="${C.yellow}"/>
      <g transform="translate(66 12)">
        <ellipse cx="-7" cy="-1" rx="7" ry="5" fill="${C.grey}" stroke="${INK}" stroke-width="2.5"/>
        <ellipse cx="7" cy="-1" rx="7" ry="5" fill="${C.grey}" stroke="${INK}" stroke-width="2.5"/>
        <ellipse cx="0" cy="0" rx="3" ry="6" fill="${INK}"/>
      </g>`,
    diary: `
      <rect x="70" y="14" width="14" height="76" rx="2" fill="#fff" ${O3}/>
      <rect x="16" y="10" width="62" height="84" rx="6" fill="${C.purple}" ${O}/>
      <path d="M47 34 c-6 -8 -18 -2 -12 8 l12 12 l12 -12 c6 -10 -6 -16 -12 -8z" fill="${C.pink}" ${O3}/>
      <rect x="68" y="44" width="20" height="15" rx="3" fill="${C.yellow}" ${O4}/>
      <circle cx="78" cy="51" r="2.2" fill="${INK}"/>
      <text x="47" y="77" font-size="10" text-anchor="middle" ${FONT} fill="#fff">KEEP OUT</text>`,
    baseball: `
      <circle cx="50" cy="50" r="35" fill="#fff" ${O}/>
      <path d="M28 25 q15 25 0 50 M72 25 q-15 25 0 50" fill="none" stroke="${C.red}" stroke-width="3"/>
      <path d="M28 25 q15 25 0 50 M72 25 q-15 25 0 50" fill="none" stroke="${C.red}" stroke-width="9" stroke-dasharray="1.5 6"/>`,
    partyHat: `
      <path d="M50 10 L80 88 Q50 98 20 88Z" fill="${C.blue}" ${O}/>
      <circle cx="47" cy="40" r="4.5" fill="${C.yellow}"/><circle cx="58" cy="60" r="4.5" fill="${C.pink}"/>
      <circle cx="38" cy="70" r="4.5" fill="${C.yellow}"/><circle cx="63" cy="81" r="4.5" fill="${C.yellow}"/>
      <circle cx="50" cy="9" r="8" fill="${C.pink}" ${O4}/>`,
    calendar: `
      <rect x="12" y="16" width="76" height="76" rx="6" fill="#fff" ${O}/>
      <path d="M12 22 a6 6 0 0 1 6 -6 h64 a6 6 0 0 1 6 6 v14 h-76z" fill="${C.red}" ${O}/>
      <path d="M32 8 v14 M68 8 v14" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
      <text x="50" y="75" font-size="26" text-anchor="middle" ${FONT} fill="${INK}">13</text>
      <circle cx="50" cy="66" r="17" fill="none" stroke="${C.red}" stroke-width="3.5"/>`,
  };

  function prop(key, cls = '') {
    return `<svg class="prop ${cls}" viewBox="-4 -4 108 108" aria-hidden="true">${PROPS[key] || ''}</svg>`;
  }

  // ---------------- Gary ----------------
  const GARY_PUFFS = [[64, 104, 40], [110, 78, 52], [160, 94, 44], [194, 122, 28], [92, 132, 36], [142, 134, 38], [38, 128, 26]];

  function gary(cls = '') {
    const id = 'gy' + (++uid);
    const inks = GARY_PUFFS.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r + 5}" fill="${INK}"/>`).join('');
    const fills = GARY_PUFFS.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('');
    const eyeL = 96, eyeR = 132, ey = 104;
    const garyEye = (x) => `<ellipse cx="${x}" cy="${ey}" rx="11" ry="12" fill="#fff" ${O4}/>
      <circle cx="${x + 1}" cy="${ey + 5}" r="4.5" fill="${INK}"/>
      <path d="M${x - 12.5} ${ey + 3} A12.5 13 0 0 1 ${x + 12.5} ${ey + 3} Z" fill="#c4c8d8" ${O4}/>
      <path d="M${x - 9} ${ey + 16} Q${x} ${ey + 20} ${x + 9} ${ey + 16}" fill="none" stroke="#8b8fa6" stroke-width="3" stroke-linecap="round"/>`;
    const arm = 'M170 140 C184 166 192 170 200 160';
    return `<svg class="gary ${cls}" viewBox="0 0 256 225" role="img" aria-label="Gary, a tired grey cloud in a tiny necktie">
      <defs><clipPath id="${id}">${fills}</clipPath></defs>
      <g class="gary-cloud">
        ${inks}
        <g fill="#c4c8d8">${fills}</g>
        <g clip-path="url(#${id})">
          <ellipse cx="128" cy="186" rx="120" ry="40" fill="#aeb2c6"/>
          <ellipse cx="96" cy="50" rx="26" ry="10" fill="#fff" opacity=".55" transform="rotate(-18 96 50)"/>
        </g>
        <g class="gary-eyes">${garyEye(eyeL)}${garyEye(eyeR)}</g>
        <path class="mouth-closed" d="M102 136 Q114 131 126 136" fill="none" ${O}/>
        <ellipse class="mouth-open" cx="114" cy="136" rx="8" ry="6.5" fill="${C.mouth}" ${O4}/>
      </g>
      <g class="gary-tie">
        <path d="M107 166 L121 166 L118 177 L110 177Z" fill="${C.red}" ${O4}/>
        <path d="M110 176 L118 176 L126 206 L114 218 L102 206 Z" fill="${C.red}" ${O4}/>
        <path d="M108 190 l12 -5 M106 202 l16 -7" stroke="${C.yellow}" stroke-width="3" stroke-linecap="round"/>
      </g>
      <g class="gary-coffee">
        <path class="steam" d="M210 128 q-6 -7 0 -14 t0 -14 M222 126 q-6 -7 0 -14 t0 -14" fill="none" stroke="#9aa0b4" stroke-width="3.5" stroke-linecap="round"/>
        ${tube(arm, '#c4c8d8')}
        <path d="M238 146 q13 0 13 10 q0 10 -13 10" fill="none" ${O4}/>
        <rect x="200" y="136" width="38" height="34" rx="5" fill="#fff" ${O4}/>
        <text x="224" y="158" font-size="11" text-anchor="middle" ${FONT} fill="${C.red}">MEH</text>
        ${glove(200, 158)}
      </g>
    </svg>`;
  }

  // ---------------- the front desk ----------------
  function bell() {
    return `<svg class="bell-art" viewBox="0 0 80 64" aria-hidden="true">
      <rect x="34" y="4" width="12" height="11" rx="3" fill="${C.dark}" ${O4}/>
      <path d="M12 46 Q12 15 40 15 Q68 15 68 46 Z" fill="${C.yellow}" ${O4}/>
      <path d="M22 38 Q22 24 34 21" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/>
      <rect x="6" y="45" width="68" height="11" rx="4" fill="${C.dark}" ${O4}/>
    </svg>`;
  }

  function plant() {
    const leaf = (d, fill) => `<path d="${d}" fill="${fill}" ${O4}/>`;
    return `<svg class="plant-art" viewBox="0 0 100 120" aria-hidden="true">
      <g class="plant-leaves">
        ${leaf('M50 72 C46 46 24 36 8 54 C20 50 36 54 50 72 Z', '#9cba5a')}
        ${leaf('M50 72 C56 44 80 36 94 58 C82 50 64 56 50 72 Z', '#8fb04f')}
        ${leaf('M50 72 C48 50 54 32 66 26 C66 36 58 50 50 72 Z', '#a9c463')}
        <path d="M8 54 l4 6 M94 58 l-5 5" stroke="#b08a4a" stroke-width="5" stroke-linecap="round"/>
      </g>
      <path d="M78 112 q8 -6 14 0 q-7 5 -14 0z" fill="#b08a4a" ${O3}/>
      <path d="M26 74 L74 74 L67 112 L33 112 Z" fill="#e07a4f" ${O4}/>
      <rect x="22" y="68" width="56" height="12" rx="3" fill="#ef8d5f" ${O4}/>
    </svg>`;
  }

  // ---------------- afterlife scenery ----------------
  function cloud(fill = '#fff', cls = '') {
    const p = [[30, 40, 18], [55, 30, 24], [82, 36, 20], [102, 44, 13], [16, 47, 11], [64, 48, 16]];
    return `<svg class="cloud ${cls}" viewBox="0 0 120 66" aria-hidden="true">
      ${p.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r + 3.5}" fill="${INK}"/>`).join('')}
      <g fill="${fill}">${p.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>
      <ellipse cx="48" cy="24" rx="10" ry="4" fill="#fff" opacity=".8"/>
    </svg>`;
  }

  function sparkle(color, cls = '') {
    return `<svg class="sparkle ${cls}" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 0 Q11 9 20 10 Q11 11 10 20 Q9 11 0 10 Q9 9 10 0Z" fill="${color}"/></svg>`;
  }

  /** A background layer: 'light' = cotton-candy clouds and gold glow, 'dark' = neon lava-lamp blobs. */
  function scene(kind, cls = '') {
    if (kind === 'light') {
      return `<div class="scene scene-light ${cls}" aria-hidden="true">
        <i class="glow"></i>
        ${cloud('#fff', 'c1')}${cloud('#ffd9ea', 'c2')}${cloud('#fff4c9', 'c3')}${cloud('#e6f4ff', 'c4')}
        ${sparkle('#fff', 'k1')}${sparkle('#ffe58a', 'k2')}${sparkle('#fff', 'k3')}
      </div>`;
    }
    return `<div class="scene scene-dark ${cls}" aria-hidden="true">
      <i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i><i class="blob b4"></i><i class="blob b5"></i>
      ${sparkle('#ffb37a', 'k1')}${sparkle('#ff7ad9', 'k2')}${sparkle('#7af0ff', 'k3')}
    </div>`;
  }

  root.SP = root.SP || {};
  root.SP.art = { INK, PROPS, makeLooks, soul, prop, gary, bell, plant, cloud, sparkle, scene };
})(typeof self !== 'undefined' ? self : this);
