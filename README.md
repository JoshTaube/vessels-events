# Vessels Events

The desktop show launcher for live Vessels nights (Dojo Disco). The operator runs it on a laptop: the console on the
laptop screen, the audience display full screen on the projector. The plan for every phase is in
[docs/launcher-plan.md](docs/launcher-plan.md).

**Status: Phase 2** (the games, the cast phones and the audience vote), on top of Phase 1 (two windows, projector
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
- **The game panel** (top right) says what the game is waiting for; **N** takes that step. Core Vessels steps
  through `captain_action`; Lesser Evil through its own host buttons.
- **The audience votes** at **vessels-events.netlify.app/vote** (the QR on screen). The practice vote and Core
  Vessels' votes open on their cues; Lesser Evil opens its own ballots, which reach every phone by themselves.
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
   *ready*. GO to **310 The race**: the race starts (after its intro) and is on the projector.
5. Press **N** to move the race on. When a ballot opens, the projector shows the game's ballot (the positions) with
   the vote QR beside it, and every audience phone gets the ballot. Vote, then **V** (or let the game's clock run
   out; **5** adds 30 s to it). The race carries on with the audience's count.
6. When the race crowns its winner, the console's game panel shows *Prize: X won Lesser Evil*; their phone offers
   the roles. Lock one in (or pick for them on the console). **390** shows the winner.
7. Double-click **401 Intermission**: the Vessels TV opens its room and the cast phones follow into its lobby. GO to
   **505 Roles dealt**: the game starts and the winner gets the role they picked. **N** steps the game (next speaker,
   dawn, discussion...). In the day's discussion pick 2 or 3 suspects on the console, then GO to **560**: the
   audience votes them; **V** closes it and the game eliminates the audience's pick.
8. **610** shows the MVP once a game of Vessels has ended.

## Tests

```
npm test                 # unit tests (cue engine, show file, night, web server, event build, vote rules)
npm run smoke            # the real app, offline: drives the console, checks the projector, restarts it
npm run check:phones     # the live site: /cast check-in, follow into a room, /vote
npm run check:night      # the whole night online: the real launcher, the event database, phones on the live site
```

`check:night` plays the practice vote, a full Lesser Evil race (with a ballot each round), the prize pick, and
Vessels up to its first audience vote. It takes several minutes. Screenshots land in `screenshots/night-*.png`.
The smoke test always uses a throwaway data folder and `--display=none`, so it never takes over a second monitor.

## Show files

One JSON per night (format `vessels-show/1`): the cast (names, photos, private codes), the host code, the Lesser
Evil prompts, the music bank, the media, the cue list. Paths are relative to the file. See
`shows/sample-show/show.json` and section 4 of the plan. Phase 2 adds, per cue: `engine` (a game step taken on
entry, e.g. `"start"` on each game's first cue) and `cast` (`"le"`, `"cv"` or `"none"`: where the cast phones go,
otherwise decided by the segment). `lesserEvil.prompts` replace the game's own topics bank by bank;
`lesserEvil.voteSecs` is how long each Lesser Evil ballot stays open (30). A `title` screen with `"winner": "le"`
shows Lesser Evil's champion.

## Where things are

- `main/`: Electron main process (windows, projector, saving, commands), `night.js` (the online side: rooms,
  check-in, the engines, votes, the prize, the MVP), `server.js` (the TVs' web server), `ev.js` (the event database)
- `src/`: the cue engine and the show file loader (no Electron, unit-tested)
- `renderer/`: the console, the audience display, the shared Vessels look and screens, bundled fonts and logos
- `web/`: the event site build (`build-event.js` generates it from production, `event-patches.js` are the anchored
  patches, `site/` the event-only pages /cast and /vote, `functions/` the cached current-vote function, `sql/` the
  event database, in order)
- `shows/`: show files
- `tools/`: the smoke test, the live checks, `ev-cli.mjs` (the event database from the command line)
- `docs/`: the plan
