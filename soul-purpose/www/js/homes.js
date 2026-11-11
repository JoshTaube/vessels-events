/* SOUL PURPOSE — the 16 homes (8 archetypes x Light/Dark), drawn in code as SVG. No image files.
 *   SP.homes.draw(archetypeKey, 'light'|'dark')  ->  an <svg> string, viewBox 0 0 360 240
 */
(function (root) {
  'use strict';
  const INK = '#2a2140';
  const FONT = 'font-family="Lilita One, Arial Rounded MT Bold, sans-serif"';
  let uid = 0;

  // ---- tiny drawing helpers ----
  const st = (w = 4) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
  const R = (x, y, w, h, f, rx = 0, sw = 4) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${f}" ${st(sw)}/>`;
  const C = (x, y, r, f, sw = 4) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${f}" ${st(sw)}/>`;
  const E = (x, y, rx, ry, f, sw = 4) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${f}" ${st(sw)}/>`;
  const P = (d, f, sw = 4) => `<path d="${d}" fill="${f}" ${st(sw)}/>`;
  const L = (d, c = INK, w = 4) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const T = (x, y, s, txt, f = INK, extra = '') => `<text x="${x}" y="${y}" font-size="${s}" text-anchor="middle" ${FONT} fill="${f}" ${extra}>${txt}</text>`;
  const neonT = (x, y, s, txt, c) => `<text x="${x}" y="${y}" font-size="${s}" text-anchor="middle" ${FONT} fill="none" stroke="${c}" stroke-width="5" opacity=".35">${txt}</text>${T(x, y, s, txt, '#fff8f0', `stroke="${c}" stroke-width="1.2"`)}`;
  const win = (x, y, w, h, f = '#bfe6ff') => `${R(x, y, w, h, f, 2, 3)}${L(`M${x + w / 2} ${y} v${h} M${x} ${y + h / 2} h${w}`, INK, 2.5)}`;
  const prop = (key, x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})">${root.SP.art.PROPS[key]}</g>`;
  const spark = (x, y, s, c) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -10 Q1 -1 10 0 Q1 1 0 10 Q-1 1 -10 0 Q-1 -1 0 -10Z" fill="${c}"/>`;
  function puff(x, y, s, fill) {
    const p = [[30, 40, 18], [55, 30, 24], [82, 36, 20], [102, 44, 13], [16, 47, 11], [64, 48, 16]];
    return `<g transform="translate(${x} ${y}) scale(${s})">${p.map(([a, b, r]) => `<circle cx="${a}" cy="${b}" r="${r + 3.5}" fill="${INK}"/>`).join('')}${p.map(([a, b, r]) => `<circle cx="${a}" cy="${b}" r="${r}" fill="${fill}"/>`).join('')}</g>`;
  }

  // ---- backgrounds ----
  function bgLight(id) {
    let bumps = '';
    for (let x = -10; x < 370; x += 40) bumps += ' q20 -16 40 0';
    return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#bfe6ff"/><stop offset=".68" stop-color="#ffd6ea"/><stop offset="1" stop-color="#ffe9b0"/></linearGradient></defs>
      <rect width="360" height="240" fill="url(#${id})"/>
      <circle cx="304" cy="40" r="58" fill="#fff6c0" opacity=".75"/>${C(304, 40, 20, '#ffe27a', 3.5)}
      ${puff(10, 22, 0.6, '#fff')}${puff(196, 8, 0.48, '#ffe3f0')}
      ${spark(150, 30, 0.9, '#fff')}${spark(250, 74, 0.7, '#fff6a8')}
      <path d="M-10 250 V212${bumps} V250Z" fill="#fff" ${st(4)}/>`;
  }
  function bgDark(id) {
    return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2b0f4f"/><stop offset=".6" stop-color="#511c86"/><stop offset="1" stop-color="#7a2a8f"/></linearGradient></defs>
      <rect width="360" height="240" fill="url(#${id})"/>
      <circle cx="30" cy="70" r="40" fill="#ff8a3d" opacity=".75"/>
      <ellipse cx="330" cy="108" rx="30" ry="36" fill="#ff4fa3" opacity=".7"/>
      <ellipse cx="214" cy="12" rx="48" ry="30" fill="#c04dff" opacity=".6"/>
      ${spark(110, 24, 0.8, '#ffb37a')}${spark(290, 30, 0.6, '#7af0ff')}${spark(60, 140, 0.55, '#ff7ad9')}
      <rect x="-6" y="206" width="372" height="40" fill="#3a1460" ${st(4)}/>
      <path d="M-6 208 H366" stroke="#ff8a3d" stroke-width="2.5"/>`;
  }

  // ---- little characters and things ----
  function dog(x, y, s, fur, ear) {
    return `<g transform="translate(${x} ${y}) scale(${s})">
      ${E(0, 16, 15, 10, fur, 3.5)}
      ${C(0, 0, 13, fur, 3.5)}
      ${E(-12, 2, 5, 9, ear, 3)}${E(12, 2, 5, 9, ear, 3)}
      <circle cx="-5" cy="-2" r="2.3" fill="${INK}"/><circle cx="5" cy="-2" r="2.3" fill="${INK}"/>
      ${E(0, 4, 3.5, 2.5, INK, 0)}
      <path d="M-2 8 q2 6 4 0" fill="#ff7a9a" ${st(2)}/>
      ${L('M14 14 q10 -6 8 -14', INK, 3.5)}
    </g>`;
  }
  function car(x, y, s, body) {
    return `<g transform="translate(${x} ${y}) scale(${s})">
      ${P('M4 30 L4 20 Q6 12 16 12 L24 2 L56 2 L66 12 Q78 12 80 22 L80 30Z', body)}
      ${P('M28 6 L52 6 L58 13 L22 13Z', '#bfe6ff', 3)}
      ${C(20, 31, 8, '#3b3355')}${C(64, 31, 8, '#3b3355')}
    </g>`;
  }
  function pin(x, y, s = 1) {
    return `<g transform="translate(${x} ${y}) scale(${s})">${P('M0 -14 q5 0 4 7 q-2 4 1 9 q2 6 -1 12 h-8 q-3 -6 -1 -12 q3 -5 1 -9 q-1 -7 4 -7z', '#fff', 2.5)}<path d="M-3.5 -4 h7" stroke="#e2475a" stroke-width="2"/></g>`;
  }
  function note(x, y, r, c, text = '') {
    return `<g transform="translate(${x} ${y}) rotate(${r})">${R(-9, -9, 18, 18, c, 1, 2.5)}${text ? T(0, 3, 6, text) : L('M-5 -2 h10 M-5 3 h7', INK, 1.6)}</g>`;
  }

  // ---- the 16 homes ----
  const HOMES = {
    // Hall Monitor
    'hallMonitor-light': () => `
      ${E(180, 228, 176, 20, '#c9c6d6')}
      ${R(56, 196, 248, 14, '#7ccf5a', 0, 3.5)}
      <g>${R(70, 206, 120, 9, '#ffd66b', 2, 3)}${L('M80 206 v4 M90 206 v3 M100 206 v4 M110 206 v3 M120 206 v4 M130 206 v3 M140 206 v4 M150 206 v3 M160 206 v4 M170 206 v3 M180 206 v4', INK, 1.8)}</g>
      ${R(222, 52, 16, 34, '#c2462e', 1)}
      ${R(100, 96, 160, 104, '#fff4e6', 2)}
      ${P('M88 100 L180 50 L272 100Z', '#e2475a')}
      ${C(180, 80, 9, '#bfe6ff', 3)}
      ${[118, 214].map((x) => [112, 150].map((y) => `${R(x - 7, y, 6, 30, '#3b82c4', 1, 3)}${win(x, y, 28, 30)}${R(x + 29, y, 6, 30, '#3b82c4', 1, 3)}`).join('')).join('')}
      ${P('M160 150 L180 136 L200 150Z', '#fff', 3)}
      ${R(166, 150, 28, 50, '#3b82c4', 2)}<circle cx="188" cy="176" r="2.5" fill="#ffd66b"/>
      ${R(156, 150, 6, 50, '#fff', 1, 3)}${R(198, 150, 6, 50, '#fff', 1, 3)}
      ${R(168, 158, 24, 9, '#fff', 1, 2)}${T(180, 165, 7, 'DOOR')}
      ${R(64, 168, 26, 28, '#4fae5a', 2, 3.5)}${R(270, 168, 26, 28, '#4fae5a', 2, 3.5)}
      ${L('M40 196 v-30', INK, 4)}${R(28, 152, 26, 16, '#e2475a', 6, 3.5)}${R(30, 170, 22, 8, '#fff', 1, 2)}${T(41, 176.5, 6, 'MAIL')}`,

    'hallMonitor-dark': () => `
      ${L('M30 170 L132 170', '#e2475a', 7)}${L('M30 170 L132 170', '#fff', 7).replace('stroke-width="7"', 'stroke-width="7" stroke-dasharray="10 10"')}
      ${C(132, 170, 6, '#3b3355', 3)}
      ${car(22, 160, 0.9, '#7af0ff')}${R(52, 157, 12, 7, '#fff', 1, 2)}
      ${R(146, 58, 76, 26, '#241c33', 4)}${neonT(184, 77, 14, 'PARKING', '#ff8a3d')}
      ${R(132, 84, 104, 16, '#e2475a', 3)}
      ${R(140, 98, 88, 108, '#fff', 3)}
      ${R(140, 176, 88, 10, '#e2475a', 0, 3)}
      ${R(152, 110, 64, 44, '#7af0ff', 3, 3.5)}
      ${R(162, 136, 13, 14, '#fff', 2, 2.5)}${L('M166 132 q-3 -4 0 -8 M171 132 q-3 -4 0 -8', '#fff', 2)}
      ${R(184, 186, 30, 14, '#fff', 1, 2.5)}${T(199, 196, 7, 'OPEN 24/7')}
      ${P('M216 150 C246 150 238 176 262 182 C284 188 286 200 300 204 L294 210 C276 204 272 194 254 190 C228 184 236 160 214 158Z', '#fff', 3)}
      ${[[262, 198, -12], [282, 196, 10], [300, 200, -4], [316, 198, 18], [276, 188, 30], [304, 186, -20]].map(([x, y, r]) => `<g transform="translate(${x} ${y}) rotate(${r})">${R(-8, -5, 16, 10, '#fff', 1, 2)}${L('M-4 -1 h8 M-4 2 h5', '#9aa0b4', 1.4)}</g>`).join('')}`,

    // Hot Take Machine
    'hotTake-light': () => `
      ${puff(110, 168, 0.7, '#fff')}${puff(176, 170, 0.62, '#ffe3f0')}
      ${R(152, 92, 56, 118, '#c9a7ff', 2)}
      ${[104, 128, 152, 176].map((y) => `${R(162, y, 12, 14, '#fff6c0', 1, 2.5)}${R(186, y, 12, 14, '#fff6c0', 1, 2.5)}`).join('')}
      ${E(180, 90, 60, 13, '#fff')}
      ${R(130, 54, 100, 36, '#bfe6ff', 6)}
      ${L('M150 56 v32 M170 56 v32 M190 56 v32 M210 56 v32', INK, 2.5)}
      ${E(180, 54, 56, 11, '#ffd66b')}
      ${L('M108 92 Q90 52 132 34', '#e2475a', 5)}${P('M126 27 L140 33 L128 42Z', '#e2475a', 2.5)}
      ${L('M252 46 Q272 84 234 104', '#e2475a', 5)}${P('M240 110 L226 104 L238 96Z', '#e2475a', 2.5)}
      <g transform="translate(286 150) rotate(-8)">${R(-26, -12, 52, 22, '#fff', 3, 3)}${T(0, 4, 11, 'VIEW?')}</g>${L('M286 160 v42', INK, 4)}`,

    'hotTake-dark': () => `
      ${neonT(180, 30, 18, 'THE ARGUMENT BAR', '#ff4fa3')}
      ${R(40, 40, 280, 124, '#241c33', 6)}
      ${[['#7af0ff', 'VS'], ['#ff4fa3', '!!'], ['#ffd66b', 'NO'], ['#7ccf5a', '?!'], ['#ff8a3d', 'YES'], ['#c9a7ff', 'WRONG']].map(([c, t], i) => {
        const x = 56 + (i % 3) * 86, y = 52 + Math.floor(i / 3) * 54;
        return `${R(x, y, 76, 44, c, 4, 3.5)}${T(x + 38, y + 29, 17, t)}`;
      }).join('')}
      ${R(26, 168, 308, 14, '#c08552', 3)}${R(34, 180, 292, 26, '#8a5a3c', 0, 4)}
      ${[90, 260].map((x) => `${R(x, 148, 18, 22, '#ffd66b', 3, 3)}${E(x + 9, 148, 11, 5, '#fff', 3)}${L(`M${x + 18} 154 q8 0 8 6 q0 6 -8 6`, INK, 3)}`).join('')}`,

    // HOA President
    'hoaPresident-light': () => `
      ${R(36, 112, 84, 92, '#ffe3ef', 2)}${R(240, 112, 84, 92, '#ffe3ef', 2)}
      ${P('M28 116 L78 88 L128 116Z', '#c9a7ff')}${P('M232 116 L282 88 L332 116Z', '#c9a7ff')}
      ${R(108, 82, 144, 122, '#fff0f6', 2)}
      ${P('M150 84 Q150 36 180 36 Q210 36 210 84Z', '#ffd66b')}${L('M180 36 v-20', INK, 3)}${P('M180 16 l16 5 l-16 5z', '#e2475a', 2.5)}
      ${P('M100 88 L180 62 L260 88Z', '#c9a7ff')}
      ${[132, 156, 204, 228].map((x) => R(x - 4, 120, 8, 84, '#fff', 1, 3)).join('')}
      ${R(168, 156, 24, 48, '#6c2fa3', 10)}
      ${[52, 84, 256, 288].map((x) => win(x, 130, 20, 24)).join('')}${[52, 84, 256, 288].map((x) => win(x, 166, 20, 24)).join('')}
      ${[116, 220].map((x) => win(x, 96, 22, 18)).join('')}
      <g transform="translate(330 176) rotate(6)">${L('M0 4 v32', INK, 3.5)}${R(-18, -20, 36, 26, '#fff', 2, 3)}${R(-14, -16, 8, 10, '#ffa9cf', 0, 2)}${R(-4, -16, 8, 10, '#ffd66b', 0, 2)}${R(6, -16, 8, 10, '#bfe6ff', 0, 2)}${T(0, 2, 6, 'OK!', '#e2475a')}</g>`,

    'hoaPresident-dark': () => `
      ${R(156, 64, 150, 142, '#e8dcc4', 2)}${R(150, 58, 162, 10, '#d6c7aa', 2, 3.5)}
      ${[176, 216, 256].map((x) => [80, 116, 152].map((y) => win(x, y, 26, 24, '#f2e9d6')).join('')).join('')}
      ${R(220, 182, 22, 24, '#c9b896', 1, 3)}
      ${R(20, 196, 128, 10, '#7ccf5a', 0, 3)}
      ${car(28, 162, 0.9, '#ff4fa3')}
      <g transform="translate(118 182)">${L('M0 0 v22', INK, 3)}${R(-16, -16, 32, 18, '#fff', 2, 2.5)}${T(0, -9, 5.5, 'KEEP OFF')}${T(0, -2.5, 5.5, 'GRASS')}</g>
      <g transform="translate(130 74) rotate(-10)">${R(0, 0, 14, 128, '#fff', 1, 3)}${R(10, -2, 46, 132, '#e2475a', 4)}${T(33, 52, 13, 'RULES', '#fff')}${T(33, 68, 9, '400 PG', '#fff')}${L('M18 84 h30 M18 92 h30 M18 100 h24', '#fff', 2)}</g>`,

    // Passive-Aggressive Sticky Note
    'stickyNote-light': () => `
      ${R(186, 22, 16, 30, '#c2462e', 1)}${L('M194 18 q-8 -6 0 -12 q8 -6 0 -12', '#fff', 3)}
      ${R(64, 104, 150, 102, '#fff3d6', 4)}
      ${P('M50 112 Q56 56 139 52 Q222 56 228 112 Q139 124 50 112Z', '#e0a33a')}
      ${L('M80 92 q10 6 20 0 M120 86 q10 6 20 0 M160 90 q10 6 20 0 M100 106 q10 6 20 0 M150 108 q10 6 20 0', '#b0781e', 3)}
      ${P('M124 206 V160 Q139 140 154 160 V206Z', '#e2475a')}<circle cx="148" cy="184" r="2.5" fill="#ffd66b"/>
      ${win(78, 132, 30, 28, '#fff6c0')}${win(170, 132, 30, 28, '#fff6c0')}
      ${R(76, 160, 34, 8, '#8a5a3c', 1, 3)}${[82, 92, 102].map((x) => C(x, 157, 4, '#ff6fa8', 2)).join('')}
      ${R(242, 84, 74, 122, '#fff', 8)}${L('M242 130 h74', INK, 4)}${L('M306 96 v24 M306 140 v28', INK, 5)}
      ${note(260, 104, -8, '#ffe27a', 'MINE')}${note(282, 112, 6, '#ffa9cf')}${note(262, 152, 4, '#7fe3e8', 'BEV')}${note(286, 170, -6, '#ffe27a', 'NOPE')}${note(264, 186, 10, '#c6ef7e')}`,

    'stickyNote-dark': () => `
      ${R(18, 36, 324, 172, '#d9d2e6', 6)}
      ${R(120, 44, 120, 9, '#f4fff8', 4, 3)}<rect x="110" y="40" width="140" height="18" rx="9" fill="#f4fff8" opacity=".35"/>
      ${R(36, 150, 196, 56, '#c08552', 2)}${R(30, 144, 208, 10, '#e2b07a', 2, 3.5)}
      ${prop('microwave', 56, 70, 0.78)}${note(118, 92, -6, '#ffe27a', 'PLEASE.')}
      ${R(196, 112, 28, 34, '#fff', 3, 3)}${L('M224 118 q8 0 8 8 q0 8 -8 8', INK, 3)}${L('M204 108 q-3 -5 0 -10 M214 108 q-3 -5 0 -10', '#9aa0b4', 2.5)}
      ${R(252, 64, 70, 142, '#fff', 8)}${L('M252 112 h70', INK, 4)}${L('M312 76 v26 M312 124 v34', INK, 5)}
      ${note(270, 88, -6, '#ffe27a', 'WHO?')}${note(290, 140, 8, '#ffa9cf', 'FISH??')}${note(270, 172, -4, '#7fe3e8')}
      ${R(150, 72, 40, 34, '#fff', 3, 3)}${R(150, 72, 40, 10, '#e2475a', 3, 3)}${T(170, 98, 9, 'DAY')}${T(170, 106.5, 7, '9,999', '#e2475a')}`,

    // The Bouncer
    'bouncer-light': () => `
      ${puff(88, 150, 1.4, '#fff')}
      ${R(110, 72, 146, 96, '#fff', 4)}${R(104, 64, 158, 12, '#ffd66b', 3)}
      ${R(122, 86, 58, 66, '#bfe6ff', 2, 3)}${R(188, 86, 56, 66, '#bfe6ff', 2, 3)}${L('M151 86 v66 M216 86 v66', INK, 2.5)}
      ${R(196, 40, 52, 24, '#2a2140', 4, 3.5)}${T(222, 58, 16, 'VIP', '#ffd66b')}
      ${[70, 150].map((x) => `${R(x - 4, 178, 8, 30, '#ffd66b', 2, 3)}${C(x, 176, 6, '#ffd66b', 3)}${E(x, 208, 10, 4, '#ffd66b', 3)}`).join('')}
      ${L('M72 184 Q110 206 148 184', INK, 8)}${L('M72 184 Q110 206 148 184', '#e2475a', 4)}
      ${prop('clipboard', 22, 150, 0.46)}`,

    'bouncer-dark': () => `
      ${R(80, 64, 200, 62, '#241c33', 4)}
      ${neonT(180, 52, 20, 'STRIKE ZONE', '#ff4fa3')}
      ${[118, 140, 162, 184, 206, 228, 250].map((x, i) => pin(x - 6 + (i % 2) * 6, 108 - (i % 2) * 6, 0.9)).join('')}
      ${P('M120 126 L240 126 L330 206 L30 206Z', '#e8a85c')}
      ${L('M150 126 L120 206 M180 126 L180 206 M210 126 L240 206', '#b0781e', 3)}
      ${C(186, 186, 12, '#7af0ff', 3.5)}<circle cx="182" cy="182" r="1.8" fill="${INK}"/><circle cx="189" cy="181" r="1.8" fill="${INK}"/><circle cx="186" cy="188" r="1.8" fill="${INK}"/>
      ${R(18, 150, 110, 56, '#6c2fa3', 3)}${R(12, 144, 122, 12, '#9a6ad6', 3, 3.5)}
      ${P('M34 136 q0 -10 10 -10 h8 q6 0 8 8 l18 4 q6 2 4 8 h-48z', '#e2475a', 3)}${L('M40 140 h36', '#fff', 2)}
      <g transform="translate(96 128) rotate(8)">${R(-10, -8, 20, 14, '#fff', 2, 2.5)}${T(0, 3, 9, '10')}</g>
      ${T(73, 186, 11, 'SHOES', '#ffb37a')}`,

    // Golden Retriever
    'goldenRetriever-light': () => `
      ${P('M-10 196 Q90 176 180 190 T370 186 V214 H-10Z', '#7ccf5a')}
      ${R(118, 104, 124, 96, '#e2475a', 2)}
      ${P('M108 108 L130 70 L180 52 L230 70 L252 108Z', '#8a5a3c')}
      ${C(180, 82, 10, '#fff6c0', 3)}
      ${R(162, 146, 36, 54, '#fff', 2)}${L('M164 148 L196 198 M196 148 L164 198', INK, 3)}
      ${win(130, 124, 22, 22, '#fff6c0')}${win(208, 124, 22, 22, '#fff6c0')}
      ${L('M20 170 h88 M252 170 h96 M20 186 h88 M252 186 h96', '#fff', 4)}${[24, 54, 84, 260, 290, 320].map((x) => R(x, 162, 6, 34, '#fff', 1, 2.5)).join('')}
      ${dog(42, 196, 0.9, '#e0a33a', '#b0781e')}${dog(96, 210, 1, '#f4f1ea', '#c9b896')}${dog(140, 218, 0.8, '#8a5a3c', '#5a3a20')}
      ${dog(226, 216, 0.85, '#e0a33a', '#b0781e')}${dog(270, 200, 0.75, '#3b2a20', '#2a1a10')}${dog(318, 214, 0.95, '#f4f1ea', '#e0a33a')}${dog(186, 222, 0.6, '#e0a33a', '#b0781e')}`,

    'goldenRetriever-dark': () => `
      ${P('M30 30 q8 160 0 176 h44 q-10 -80 0 -176z', '#e2475a')}${P('M330 30 q-8 160 0 176 h-44 q10 -80 0 -176z', '#e2475a')}
      ${L('M30 30 Q90 52 150 34 Q210 52 270 34 Q300 46 330 30', INK, 3)}
      ${[50, 90, 130, 170, 210, 250, 290].map((x, i) => C(x + 10, 38 + (i % 2) * 6, 5, ['#ffd66b', '#7af0ff', '#ff7ad9', '#7ccf5a'][i % 4], 2.5)).join('')}
      ${R(118, 58, 124, 62, '#241c33', 4)}${T(180, 84, 12, 'LA LA LA', '#7af0ff')}${T(180, 104, 12, 'OH YEAH', '#fff')}
      <path d="M150 0 L210 0 L250 206 L110 206Z" fill="#fff6c0" opacity=".14"/>
      ${R(60, 166, 240, 40, '#8a5a3c', 2)}${R(54, 160, 252, 10, '#c08552', 2, 3.5)}
      ${L('M180 162 V128', INK, 4)}${E(180, 124, 7, 10, '#c9ccd8', 3)}${L('M168 162 h24', INK, 4)}
      ${neonT(84, 150, 14, 'KARAOKE', '#7af0ff')}
      ${C(300, 140, 12, '#c9ccd8', 3)}${L('M290 136 h20 M290 144 h20 M300 128 v24', INK, 1.5)}${L('M300 128 v-18', INK, 2)}`,

    // Supreme Court of One
    'supremeCourt-light': () => `
      ${R(70, 192, 220, 12, '#f4f1ea', 1, 3.5)}${R(82, 182, 196, 12, '#f4f1ea', 1, 3.5)}
      ${R(96, 96, 168, 88, '#5a3a20', 0, 4)}
      ${[104, 124, 144, 196, 216, 236].map((x, i) => [102, 132, 160].map((y, j) => `${R(x, y, 18, 22, ['#e2475a', '#3b82c4', '#2f9e6e', '#ffd66b'][(i + j) % 4], 1, 2)}`).join('')).join('')}
      ${L('M160 182 L182 98 M176 182 L198 98 M163 170 h16 M166 154 h16 M170 138 h16 M174 122 h16', '#c08552', 3)}
      ${[104, 136, 168, 200, 232, 256].map((x) => `${R(x - 7, 96, 14, 88, '#fff', 1, 3)}${L(`M${x - 2} 100 v80 M${x + 2} 100 v80`, '#d6d2e0', 1.5)}`).join('')}
      ${R(86, 84, 188, 14, '#f4f1ea', 1, 3.5)}${P('M82 86 L180 40 L278 86Z', '#fff')}${T(180, 76, 10, 'LIBRARY')}
      ${E(312, 200, 30, 8, '#fff', 3)}${R(296, 186, 30, 14, '#e0a33a', 2, 3)}${L('M301 186 v14 M311 186 v14 M321 186 v14 M296 193 h30', '#b0781e', 1.5)}
      ${prop('gavel', 300, 128, 0.42)}`,

    'supremeCourt-dark': () => `
      ${R(118, 96, 124, 110, '#8f7bb8', 2)}
      ${[[84, 120], [236, 120]].map(([x, w]) => `${R(x, 74, 40, 132, '#7a68a3', 2)}${P(`M${x - 6} 76 L${x + 20} 26 L${x + 46} 76Z`, '#c04dff')}`).join('')}
      ${R(158, 50, 44, 60, '#7a68a3', 2)}${P('M152 52 L180 8 L208 52Z', '#c04dff')}
      ${[[104, 104], [256, 104], [180, 72], [146, 128], [214, 128]].map(([x, y]) => P(`M${x - 8} ${y + 18} V${y + 6} Q${x} ${y - 6} ${x + 8} ${y + 6} V${y + 18}Z`, '#ffb347', 3)).join('')}
      ${P('M164 206 V172 Q180 152 196 172 V206Z', '#3b2b63')}
      ${L('M250 206 V188 H262 V150 H276', '#9aa0b4', 6)}${C(258, 196, 3, '#7af0ff', 0)}<path d="M258 199 q3 4 0 7 q-3 -3 0 -7z" fill="#7af0ff"/>${E(262, 208, 12, 3, '#7af0ff', 0)}
      <g transform="translate(206 176) rotate(14)">${L('M0 0 v26', '#c08552', 4)}${P('M-8 26 h16 l-2 8 h-12z', '#e2475a', 2.5)}</g>
      ${P('M104 26 l12 4 l-12 4z', '#ff4fa3', 2)}${L('M104 26 v-10', INK, 2)}${P('M256 26 l12 4 l-12 4z', '#ff4fa3', 2)}${L('M256 26 v-10', INK, 2)}`,

    // Overthinking Angel
    'overthinkingAngel-light': () => `
      ${[[110, 70, 44], [180, 50, 54], [250, 74, 44], [140, 120, 40], [224, 122, 40]].map(([x, y, r]) => C(x, y, r, '#8fcf6a', 4)).join('')}
      ${P('M164 210 Q170 150 162 110 L198 110 Q190 150 196 210Z', '#8a5a3c')}
      ${L('M170 120 L120 96 M190 120 L246 98 M176 150 L120 160 M186 146 L244 162', '#8a5a3c', 7)}
      ${[[92, 76, '#ffa9cf', 'BED?'], [150, 36, '#fff3d6', ''], [208, 40, '#bfe6ff', 'BED??'], [252, 82, '#ffe27a', ''], [96, 144, '#c9a7ff', ''], [236, 146, '#ffc39a', '?'], [168, 92, '#c6ef7e', '']].map(([x, y, c, t]) =>
        `${R(x, y, 40, 30, c, 2, 3.5)}${P(`M${x - 4} ${y + 2} L${x + 20} ${y - 14} L${x + 44} ${y + 2}Z`, '#e2475a', 3)}${R(x + 6, y + 8, 10, 10, '#fff', 1, 2)}${t ? T(x + 28, y + 22, 8, t) : ''}`).join('')}
      ${L('M120 176 v34 M132 176 v34 M120 184 h12 M120 194 h12 M120 204 h12', '#c08552', 3)}
      ${L('M140 112 l20 -40 M150 116 l20 -40', '#c08552', 2.5)}`,

    'overthinkingAngel-dark': () => `
      ${neonT(180, 40, 17, 'OPEN 24 HRS', '#7af0ff')}
      ${R(34, 70, 292, 136, '#e6e0f0', 2)}
      ${P('M28 52 H332 V72 q-19 14 -38 0 q-19 14 -38 0 q-19 14 -38 0 q-19 14 -38 0 q-19 14 -38 0 q-19 14 -38 0 q-19 14 -38 0 q-19 14 -38 0 Z', '#9a6ad6')}
      ${[48, 118, 188, 258].map((x, i) => `${R(x, 98, 56, 64, '#fff', 4)}${C(x + 28, 134, 19, '#bfe6ff', 4)}
        <g class="spin" style="transform-origin:${x + 28}px 134px">${C(x + 22, 128, 6, ['#ff6fa8', '#ffd66b', '#7ccf5a', '#ff8a3d'][i], 2)}${C(x + 34, 140, 6, ['#7af0ff', '#c9a7ff', '#ffa9cf', '#3b82c4'][i], 2)}</g>
        ${R(x + 8, 104, 18, 8, '#241c33', 1, 2)}${T(x + 17, 110.5, 6, i === 3 ? '0:01' : '0:4' + i, '#7af0ff')}`).join('')}
      ${P('M140 206 L146 176 H214 L220 206Z', '#c08552')}${C(158, 172, 8, '#ff6fa8', 2.5)}${C(176, 168, 9, '#7af0ff', 2.5)}${C(196, 172, 8, '#ffd66b', 2.5)}
      ${L('M146 186 H214 M150 196 H210', '#8a5a3c', 2.5)}`,
  };

  function draw(archetype, place, cls = '') {
    const key = archetype + '-' + place;
    const id = 'hm' + (++uid);
    const body = HOMES[key] ? HOMES[key]() : '';
    return `<svg class="home-svg ${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 240" aria-hidden="true">
      ${place === 'light' ? bgLight(id) : bgDark(id)}${body}
      <rect x="1" y="1" width="358" height="238" rx="0" fill="none" stroke="${INK}" stroke-width="0"/>
    </svg>`;
  }

  root.SP = root.SP || {};
  root.SP.homes = { draw, KEYS: Object.keys(HOMES) };
})(typeof self !== 'undefined' ? self : this);
