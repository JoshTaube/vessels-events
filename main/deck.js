// Vessels Events: the Stream Deck (Phase 4). A 15-key Stream Deck (MK.2) with the stock Hotkey action, no plugin:
// each key sends a key nothing else uses (F13 to F23, with Shift or Ctrl for the music), and the launcher listens for
// them system-wide (globalShortcut), so they work whichever window has the focus. The show's controls come first
// (Josh, 2026-10-26); the music sits in a Stream Deck folder, with GO in it too so it's never out of reach.
//
//   Main page                                         Music folder
//   GO        Next cue  Back       Live      Panic    (folder back)  Track 1  Track 2  Track 3  Track 4
//   Auto      Hold      Close vote +30 s     Duck     Track 5        Track 6  Track 7  Track 8  Fade
//   Fade      Sting 1   Sting 2    Sting 3   (Music)  Volume -       Volume + Duck     Sting 4  GO
'use strict';

// what each button does, in words (the setup sheet and the console say these)
const ACTIONS = {
  go: 'GO: the next screen of the game in a game cue, else the next cue',
  next: 'The next cue (Shift+Space)',
  back: 'In a game: show an earlier screen again. Else: back one cue (Shift+Backspace)',
  live: 'Back to the live game, or take down a safety card (Esc)',
  panic: 'S1: the hold card on the projector, on or off',
  auto: 'The Director: Manual or Auto (A)',
  hold: 'Hold Auto on this screen, or let it go (H)',
  'close-vote': 'Close the audience vote now (V)',
  extend: '+30 s on the vote or the timer (5)',
  duck: 'Duck: music and games 12 dB down for the mic, or back up',
  fade: 'Fade the music out',
  'vol-down': 'Volume down 3 dB (music and games)',
  'vol-up': 'Volume up 3 dB',
};
for (let n = 1; n <= 8; n++) ACTIONS['track' + n] = `Play track ${n} (crossfades over what's playing)`;
for (let n = 1; n <= 4; n++) ACTIONS['sting' + n] = `Stinger ${n}, over the music`;

const k = (slot, page, key, id, label) => ({ slot, page, key, id, label });
const KEYS = [
  k(1, 'main', 'F13', 'go', 'GO'),
  k(2, 'main', 'F14', 'next', 'Next cue'),
  k(3, 'main', 'F15', 'back', 'Back'),
  k(4, 'main', 'F16', 'live', 'Live'),
  k(5, 'main', 'F17', 'panic', 'Panic'),
  k(6, 'main', 'F18', 'auto', 'Auto'),
  k(7, 'main', 'F19', 'hold', 'Hold'),
  k(8, 'main', 'F20', 'close-vote', 'Close vote'),
  k(9, 'main', 'F21', 'extend', '+30 s'),
  k(10, 'main', 'F22', 'duck', 'Duck'),
  k(11, 'main', 'F23', 'fade', 'Fade'),
  k(12, 'main', 'Shift+F13', 'sting1', 'Sting 1'),
  k(13, 'main', 'Shift+F14', 'sting2', 'Sting 2'),
  k(14, 'main', 'Shift+F15', 'sting3', 'Sting 3'),
  { slot: 15, page: 'main', folder: true, label: 'Music' },
  { slot: 1, page: 'music', back: true, label: 'Back' },
  k(2, 'music', 'Ctrl+F13', 'track1', 'Track 1'),
  k(3, 'music', 'Ctrl+F14', 'track2', 'Track 2'),
  k(4, 'music', 'Ctrl+F15', 'track3', 'Track 3'),
  k(5, 'music', 'Ctrl+F16', 'track4', 'Track 4'),
  k(6, 'music', 'Ctrl+F17', 'track5', 'Track 5'),
  k(7, 'music', 'Ctrl+F18', 'track6', 'Track 6'),
  k(8, 'music', 'Ctrl+F19', 'track7', 'Track 7'),
  k(9, 'music', 'Ctrl+F20', 'track8', 'Track 8'),
  k(10, 'music', 'F23', 'fade', 'Fade'),
  k(11, 'music', 'Ctrl+F21', 'vol-down', 'Volume −'),
  k(12, 'music', 'Ctrl+F22', 'vol-up', 'Volume +'),
  k(13, 'music', 'F22', 'duck', 'Duck'),
  k(14, 'music', 'Shift+F16', 'sting4', 'Sting 4'),
  k(15, 'music', 'F13', 'go', 'GO'),
];

// Electron's name for a key ("Ctrl+F13" -> "Control+F13")
const accelerator = (key) => key.replace(/^Ctrl\+/, 'Control+');
// each key once (GO, Fade and Duck are on both pages: one shortcut each)
const SHORTCUTS = [...new Map(KEYS.filter((x) => x.key).map((x) => [x.key, x])).values()].map((x) => ({ key: x.key, accelerator: accelerator(x.key), id: x.id }));

// The tile's words for the night: a track or a stinger takes its name from the show file.
function labelFor(x, music) {
  if (!x.id) return x.label;
  const m = /^track(\d)$/.exec(x.id), s = /^sting(\d)$/.exec(x.id);
  const t = m && music && (music.tracks || []).find((y) => y.button === +m[1]);
  const g = s && music && (music.stingers || [])[+s[1] - 1];
  return (t && t.name) || (g && g.name) || x.label;
}

module.exports = { KEYS, SHORTCUTS, ACTIONS, accelerator, labelFor };
