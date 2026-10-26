# Vessels Events

The desktop show launcher for live Vessels nights (Dojo Disco). The operator runs it on a laptop: the console on the
laptop screen, the audience display full screen on the projector. The plan for every phase is in
[docs/launcher-plan.md](docs/launcher-plan.md).

**Status: Phase 2 with the Director** (the games, played by the launcher; the cast phones; the audience vote), on top of Phase 1 (two windows, projector
detection, show files, the cue engine with GO, loops, locks and safety cues). Music, the Stream Deck, the host's
phone page and the load test come in Phases 3 to 5.

What Phase 2 does:
- **The games run in the projector window.** The launcher hosts Lesser Evil and Vessels (the event build of
  production's own TV pages) from a small web server on the laptop, so their video and music come off the disk. A
  `game` cue uncovers the game; titles, votes, safety cards and the corner QR draw on top.
- **Two rooms a night**, made by those TVs, kept across restarts (a room is never created twice).
- **Cast phones**: each cast member enters their private code at **vessels-events.netlify.app/cast**. Their seat
  lights on the console. When the show reaches a game, every cast phone moves into that room and takes its seat under
  the cast member's exact name, no typing. A reload or a new phone gets the same seat back.
- **The launcher plays the games (the Director).** Neither game changes screen by itself: not when a clock runs
  out, not when the players finish their part. In a game cue **Space** moves the game to its next screen (start
  the race, start Ava's clock, open the night, reveal the dawn...); the game panel shows what's on screen, whether
  it's ready, its clock, what Space does next and the screens so far. **A** switches Manual (everything waits for
  Space) and Auto (each screen moves on once it's ready and has been up for its time; Auto never starts a game,
  ends one, or picks suspects). **H** holds Auto on a screen. **Shift+Backspace** shows the previous screen on the
  projector again (Space or Esc returns to the live game). **Shift+Space** moves the cue list at any time; when a
  game is over, Space does too.
- **The audience votes** at **vessels-events.netlify.app/vote** (the QR on screen). The practice vote opens on its
  cue; Core Vessels' vote opens from the day's discussion (pick 2 or 3 suspects, then Space) and its vote screen
  covers the game until the verdict; Lesser Evil opens its own ballots, which reach every phone by themselves.
  During a Lesser Evil ballot the projector keeps the game's own ballot screen (each candidate's position and
  slogan, its clock, how many in the audience have voted) with a vote QR panel beside it; the vote closes when that
  clock runs out. The console sees live counts; the room sees only how many have voted. **V** closes a vote early
  (or it closes on its timer, or by leaving its cue). Everyone gets the result at the same moment, and the game
  takes the audience's count as its own.
- **The prize**: Lesser Evil's winner picks their Vessels role on their phone (Demon allowed, never the Final
  Girl). The first Vessels deal waits for the pick and seats it; a replay deals at random.
- **The MVP** (cue 610): the best Vessels skill points of the night, from the game's own scoring. A tie shows
  co-MVPs.
- **No Scholar** on event nights: their power is a second vote, and the cast doesn't vote. A full table of 12 is
  Demon, Priest, Nun, Anointed, Vanquisher and seven Townsfolk. (Production keeps its Scholar.)

## Run it

```
npm install              # once (Electron + the test drivers)
npm run start:sample     # opens the sample night
npm start                # opens the last show file you loaded (or asks for one)
```

On Josh's PowerShell `npm` is blocked by the execution policy: use `npm.cmd run start:sample`.

The launcher goes online when `config/event.local.json` is there (the event database's address and keys; it holds
the **operator key**, so it never leaves this laptop and is never committed). Without it, or with `--offline`, it's
the Phase 1 launcher: cues and safety only, no games.

Command line options: `--show=<file>` loads that show file, `--display=none` keeps the audience display a preview
window even with a second screen plugged in, `--fresh` ignores the saved position, `--user-data=<dir>` keeps settings
and the saved show somewhere else, `--offline` never touches the event database.

## Before a show

1. **Build and deploy the event site** for the night's show file (the phone pages, /cast, /vote, the roster and the
   cast photos). The launcher serves the game TVs from the same build (`web/_site`), so run this after every show
   file change and every production update:

   ```
   npm.cmd run deploy
   ```

   (or `powershell -ExecutionPolicy Bypass -File web\deploy.ps1 -Show shows\<night>\show.json`). It refuses to upload
   anything that still points at production.
2. Open the launcher on the night's show. The game panel turns **Online** and the Lesser Evil lobby appears.
3. Hand each cast member their code card. Seats light as they check in. Click a seat to mark a dead phone by hand.

## Try Phase 2 (about 20 minutes, with 3 or 4 phones)

1. `npm.cmd run start:sample`. Check the game panel says Online and *Lobby: 0 seated*.
2. On three or four phones open vessels-events.netlify.app/cast and enter sample codes (in
   `shows/sample-show/show.json`, e.g. `ASH-7Q2`, `BONE-4T8`). Their seats light. Mark the rest by hand.
3. GO through the welcome to **230 Practice vote**. On another phone scan the QR (or open /vote): vote. The console
   counts it. GO on closes it and shows the result.
4. GO to **301 Lesser Evil**. The cast phones jump into the race. Each types a campaign slogan; the game panel says
   *Ready*. GO to **310 The race**: the race's lobby is on the projector. Short of phones? **Add a bot** on the game
   panel seats a test racer ("Bot Basil"...) with a slogan; three bots make a race on their own. A bot never has to
   do anything (GO picks its position, runs its clocks), and if a bot wins there's no prize.
5. Keep pressing **Space**: it plays the intro (Space again skips it), shows the line-ups, starts each debate, each
   speaker's clock, ends each speech. Nothing moves until you press it (a speech whose clock runs out waits, Ready).
   When a ballot opens, the projector shows the game's ballot (the positions) with the vote QR beside it, and every
   audience phone gets the ballot. Vote, then Space or **V** (or let the game's clock run out; **5** adds 30 s).
6. When the race crowns its winner, the game panel shows *Prize: X won Lesser Evil*; their phone offers the roles.
   Lock one in (or pick for them on the console). Space at the results moves on to **390**, which shows the winner.
7. Double-click **401 Intermission**: the Vessels TV opens its room and the cast phones follow into its lobby. GO to
   **505 The game**, press **A** for Auto and Space to deal. Auto plays the game screen by screen (the story, the
   reveal, each introduction, the night, the dawn, the testimony) and stops at the discussion: pick 2 or 3 suspects
   on the console and press Space. The audience votes; the vote closes on its clock and the game eliminates their
   pick. **H** holds Auto on a screen; **Shift+Backspace** shows the previous screen again; **A** back to Manual.
8. **610** shows the MVP once a game of Vessels has ended.

## Tests

```
npm test                 # unit tests (cue engine, show file, night, web server, event build, vote rules)
npm run smoke            # the real app, offline: drives the console, checks the projector, restarts it
npm run check:phones     # the live site: /cast check-in, follow into a room, /vote
npm run check:night      # the whole night online: the real launcher, the event database, phones on the live site
```

`check:night` plays the night the way the operator does: the practice vote, a full Lesser Evil race with Space
alone on Manual (checking nothing moves on its own), the prize pick, then Core Vessels on Auto up to and through its
first audience vote, with Hold and Back. It takes several minutes. Screenshots land in `screenshots/night-*.png`.
The smoke test always uses a throwaway data folder and `--display=none`, so it never takes over a second monitor.

## Show files

One JSON per night (format `vessels-show/1`): the cast (names, photos, private codes), the host code, the Lesser
Evil prompts, the music bank, the media, the cue list. Paths are relative to the file. See
`shows/sample-show/show.json` and section 4 of the plan. Phase 2 adds, per cue: `engine` (a game step taken on
entry, e.g. `"start"` on each game's first cue) and `cast` (`"le"`, `"cv"` or `"none"`: where the cast phones go,
otherwise decided by the segment). `lesserEvil.prompts` replace the game's own topics bank by bank;
`lesserEvil.voteSecs` is how long each Lesser Evil ballot stays open (30). A `title` screen with `"winner": "le"`
shows Lesser Evil's champion. `director` sets how the games are played: `"mode": "manual"` or `"auto"` to start
the night in, and `"times"`: the seconds Auto gives each kind of screen (`read`, `podium`, `pickHold`, `grace`,
`story`, `rolesHold`, `rolesMax`, `introHold`, `introMax`, `nightfall`, `windowMax`, `nightDone`, `dawn`,
`testimonyHold`, `testimonyMax`, `coin`, `verdict`, and `vote`, how long Core Vessels' audience vote stays open).
Defaults are in `main/director.js`.

## Where things are

- `main/`: Electron main process (windows, projector, saving, commands, the replay pictures), `night.js` (the
  online side: rooms, check-in, the engines, votes, the prize, the MVP, Manual / Auto), `director.js` (each game's
  screens: what's on, whether it's ready, what GO does, when Auto moves on), `server.js` (the TVs' web server),
  `ev.js` (the event database)
- `src/`: the cue engine and the show file loader (no Electron, unit-tested)
- `renderer/`: the console, the audience display, the shared Vessels look and screens, bundled fonts and logos
- `web/`: the event site build (`build-event.js` generates it from production, `event-patches.js` are the anchored
  patches, `site/` the event-only pages /cast and /vote, `functions/` the cached current-vote function, `sql/` the
  event database, in order)
- `shows/`: show files
- `tools/`: the smoke test, the live checks, `ev-cli.mjs` (the event database from the command line)
- `docs/`: the plan
