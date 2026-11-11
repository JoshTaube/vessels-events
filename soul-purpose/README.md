# Soul Purpose

You're the newest clerk at the Afterlife Front Desk. Sort 20 souls, exactly 10 Light and 10 Dark, and then the game
tells you who *you* are. The full design is in [SOUL-PURPOSE-SPEC.md](SOUL-PURPOSE-SPEC.md).

**To play:** open `www/index.html` in a browser (on a phone, or in desktop dev tools at a phone size). There's no build
step, no network and no dependencies. On a desktop you can use the arrow keys instead of swiping.

## Status: build steps 1-4 of 7 (playable, art pass done)

| Step | What | State |
|---|---|---|
| 1 | Swipe card engine, 10/10 rule, data capture | done |
| 2 | Reorganize round | done |
| 3 | Scoring and results screens (text only) | done |
| 4 | Art pass: procedural ghosts, props, front desk, both sides, Gary | done |
| 5 | Home illustrations and share card | next |
| 6 | Sound and juice (stamps, flies, screen shake) | |
| 7 | Playtest pass: tune thresholds | |

All art is drawn in code as SVG and CSS (`js/art.js`); there are no image files. Each soul is a procedural bean ghost
with a random body color, eye style, mouth and hat or hairdo, holding the prop for its sin in rubber-hose arms. Still
placeholder: the home illustrations (step 5) and the sounds (simple blips until step 6).

Fonts: Lilita One (display) and Nunito (body), both SIL Open Font License 1.1, are in `www/fonts/` with their
licenses. Browsers refuse font files on pages opened straight from disk, so `css/fonts.css` embeds them; rebuild it
with `node soul-purpose/tools/embed-fonts.mjs` if the fonts change.

## Files

```
www/                  self-contained, ready to wrap in Capacitor later
  index.html
  css/fonts.css       the two fonts, embedded (generated)
  css/style.css
  fonts/              Lilita One + Nunito woff2, with OFL licenses
  js/data.js          souls, archetypes, homes, Gary's lines. Edit text here.
  js/scoring.js       run setup + every scoring rule. Tuning constants at the top.
  js/sfx.js           WebAudio blips + the mute setting
  js/art.js           every drawing: ghosts, 30 props, Gary, the desk, both afterlife scenes
  js/game.js          screens, swipe engine, reorganize, results, debug panel. Feel constants at the top.
tests/scoring.test.mjs   the scoring rules from spec section 5
tools/embed-fonts.mjs    rebuilds css/fonts.css from www/fonts/
tools/playtest.mjs       plays a full run in a phone-sized browser with real drags, checks the rules, saves screenshots
```

```
node --test soul-purpose/tests/scoring.test.mjs
node soul-purpose/tools/playtest.mjs          # screenshots go to soul-purpose/screenshots/ (git-ignored)
```

## How the numbers are captured

- **decisionMs**: the confession types out. The clock starts when the last letter lands and stops when the swipe is
  released (or a button or arrow key is pressed). Tapping the card finishes the typing early. Swiping before the
  confession finishes counts as 0 ms.
- **wobbles**: a drag "points" at a side once it's past 8% of the arena width from center. Each switch from pointing
  at one side to pointing at the other is a wobble. This carries across drags of the same soul, so dragging toward
  Light, letting go and then sending the soul Dark counts too. The forced switch after bouncing off a full door does not.
- **bounced**: the soul was swiped (or button-pressed) at a full door first. Counted once per soul.
- **swaps**: each completed swap in the reorganize round. Picking a card and un-picking it is free.
- The reorganize round is timed too (shown in the debug panel; it isn't scored).

## Debug

- **Results screen:** tap Gary 5 times. The panel shows the raw per-soul numbers, every score, and the universe's
  Dark 10. It can also force any of the 8 archetypes x 2 places, so all 16 homes can be checked.
- **`index.html?debug`:** the title screen gets an "auto-sort 20 souls" button that skips straight to the reorganize
  round with random choices and timings.
