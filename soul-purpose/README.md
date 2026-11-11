# Soul Purpose

You're the newest clerk at the Afterlife Front Desk. Sort 20 souls, exactly 10 Light and 10 Dark, and then the game
tells you who *you* are. The full design is in [SOUL-PURPOSE-SPEC.md](SOUL-PURPOSE-SPEC.md).

**To play:** open `www/index.html` in a browser (on a phone, or in desktop dev tools at a phone size). There's no build
step, no network and no dependencies. On a desktop you can use the arrow keys instead of swiping.

## Status: build steps 1-3 of 7 (playable, placeholder art)

| Step | What | State |
|---|---|---|
| 1 | Swipe card engine, 10/10 rule, data capture | done |
| 2 | Reorganize round | done |
| 3 | Scoring and results screens (text only) | done |
| 4 | Art pass: procedural ghosts, props, front desk, both sides, Gary | next |
| 5 | Home illustrations and share card | |
| 6 | Sound and juice (stamps, flies, screen shake) | |
| 7 | Playtest pass: tune thresholds | |

Art is placeholder for now: CSS beans for souls, a grey blob with a tie for Gary, system fonts and simple blips for
sound.

## Files

```
www/                  self-contained, ready to wrap in Capacitor later
  index.html
  css/style.css
  js/data.js          souls, archetypes, homes, Gary's lines. Edit text here.
  js/scoring.js       run setup + every scoring rule. Tuning constants at the top.
  js/sfx.js           WebAudio blips + the mute setting
  js/game.js          screens, swipe engine, reorganize, results, debug panel. Feel constants at the top.
tests/scoring.test.mjs   the scoring rules from spec section 5
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
