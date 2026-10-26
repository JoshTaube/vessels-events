# Vessels Events: the show launcher

Plan for the desktop show launcher for live Vessels nights. Written 2026-10-26 after reading the production game
(`F:\VESSELS\Vessels_6_12`, the Netlify-linked build at playvessels.com) and the earlier live-event work
(`F:\VESSELS\Vessels Live`). **Phases 1 and 2 are built** (see the end: what was built, and where it differs from
the proposal below); Phases 3 to 5 are proposals to review.

---

## 1. The show

- Lesser Evil, a 15 minute intermission, then core Vessels. 90 to 120 minutes.
- 12 cast players, fixed ahead of time, the same for both games. Each has a private personal code, held all night.
  Rejoining with the code returns them to their own seat.
- About 100 audience members join by public QR and only vote. The cast never votes; the audience decides outright.
- Crew: a host on mic and an operator running the launcher.

## 2. What the existing code means for the design

Findings from the survey that shape every phase:

| Finding | Consequence |
|---|---|
| There is **no narrator.html in prod** (narrated mode was removed; `tv.html` always runs autopilot). | We wrap **`tv.html`** and **`lesser-evil-tv.html`**, not a narrator page. |
| `tv.html` **is the game engine** (it owns game state, elected through the `engine_leases` table) and writes everything to Supabase. Phones follow by Postgres changes. | The launcher conducts the show; tv.html keeps running the rules. We never rewrite the games. |
| The engine already takes outside commands through **`games.captain_action`** (`start`, `next`, `openvote`, `continue`, `rematch`...) and Vessels Live added an **`event_control`** row (command + nonce, nominees, reveal time) that tv.html polls. | That is the control seam: cues write commands there. Same path Vessels Live's narrator uses. |
| Players rejoin today by localStorage or by **re-entering the same name** (the seat and role come back, even mid-game). | Personal codes map to names: entering your code is entering your exact name. Seat reclaim already works. |
| Vessels Live already decided: the audience is the jury, the host names 2 or 3 suspects, no nomination vote, no deliberation timer, player phones go dark during audience votes, the audience polls every 2 s and never joins Realtime. | Phase 3 builds on those decisions instead of re-deciding them. |
| `local-sb.js` swaps Supabase for an in-memory shim on any host that isn't playvessels.com or *.netlify.app (file://, localhost...). | Phase 2 must load the game pages from a real host (or pass `?local=0` and patch), never from file://. |
| No App Store or Google Play links exist anywhere yet (Vessels Live points them at playvessels.com). | The download screen uses placeholders until the store listings exist. |
| Sinking Ship is a mode inside tv.html; the standalone app is in progress (`Other Projects\Sinking Ship\SinkingShipApp`). | It's listed on the download screen as "also on the app". |

## 3. Architecture

```
 Operator laptop (Electron app "Vessels Events")                     Phones (playvessels.com)
 ┌────────────────────────────────────────────────┐
 │ main process                                   │   Realtime (about 16 connections in all)
 │  · show file (cast, codes, cues, prompts,      │◄────────────────────► 12 cast phones (player.html + personal code)
 │    music bank)                                 │◄────────────────────► host view (new page, host code)
 │  · cue engine: the night's true state, saved   │
 │    to disk on every change                     │   plain HTTPS, no Realtime
 │  · outbox: Supabase writes, retried            │◄──── tally poll 1/s ── (console + display only)
 │                                                │                       ~100 audience phones: /vote polls a cached
 │  console window (laptop)  display window (HDMI)│                       "current vote" every 2 to 3 s, one POST per vote
 └────────────────────────────────────────────────┘
```

- **Two windows.** The operator console on the laptop; the audience display full screen on the projector (found
  automatically, remembered by id or by name and size, preview window when there is none).
- **The main process owns the night**: show file, cue position, rounds, check-ins, safety cards, timers. Every change
  is saved (temp file + rename) so a crash or restart resumes on the same cue.
- **Offline**: the display and safety cues never wait on the network. Writes to Supabase go through an outbox that
  retries on reconnect. The cast phones need the internet anyway (they're on playvessels.com), so when the venue
  internet drops the game pauses, but the room never sees an error: the operator hits S2 or S1 and the show holds.

### Phase 2 decision: where the game engine runs

Two ways to wrap tv.html. **Decided 2026-10-26 (Josh): A.**

- **A. Engine online, launcher conducts (recommended).** The display window loads the event build of `tv.html` /
  `lesser-evil-tv.html` from the event site, layered under the launcher's own screens (title cards, check-in,
  safety). Cues send engine commands through `event_control` / `captain_action`. Proven (Vessels Live), small, and
  the games stay exactly as they are. If the internet drops, game progress waits for it, which it must anyway because
  the phones are online.
- **B. Engine local, mirrored.** Run tv.html against `local-sb.js` inside the launcher and sync rows to Supabase for
  the phones. The launcher would hold the game state itself, but it's a two-way sync between a shim and the real
  database: a lot of new surface for no gain while the phones are online-only.

### Budgets (Supabase free plan: 200 concurrent connections, 100 messages/s)

| Who | Live connection | Traffic |
|---|---|---|
| 12 cast phones | 1 each (player.html's `game-<code>` channel) | Postgres changes on `games` / `players` / `night_actions` |
| Host view | 1 | one broadcast per cue change and timer state |
| Launcher (+ the tv.html it hosts) | 1 or 2 | engine writes, host broadcasts |
| ~100 audience phones | **none** | GET the cached current vote every 2 to 3 s (Netlify CDN, ~2 s cache, so Supabase sees about one read per 2 s); one POST per vote |
| Console + display | none for votes | tally poll once per second |

That's about 16 connections. Message peaks are an engine write fanned out to ~15 subscribers.

## 4. The show file

One JSON file per night, loaded at startup (the last one is remembered). Paths are relative to the file.
Format `vessels-show/1`; the sample is `shows/sample-show/show.json`.

```jsonc
{
  "format": "vessels-show/1",
  "name": "Vessels Live · The Cork Bar", "date": "2026-11-14", "venue": "The Cork Bar",
  "hostCode": "HOST-9KX",
  "cast": [ { "id": "ava", "name": "Ava", "code": "ASH-7Q2", "photo": "photos/ava.webp" } ],   // 12 of these
  "lesserEvil": { "prompts": [ { "id": "le1", "bank": "harmless", "text": "Pineapple should be a standard pizza topping" } ] },
  "media": { "menuLoop": "media/menu-loop.mp4" },
  "music": { "tracks": [ { "button": 1, "name": "Menu", "file": "music/menu.mp3" } ],             // buttons 1-8
             "stingers": [ { "name": "Gavel", "file": "sfx/gavel.mp3" } ] },
  "cues": [ /* see below */ ]
}
```

Checks on load, like a stage manager would: anything that would break the show is an **error** and the file doesn't
load (a running show keeps its last good file): a cast code used twice, the host code matching a cast code, codes that
aren't 4 to 12 letters/numbers/dashes, a cue id outside 100 to 699, a cue that loops forward. Anything merely missing
is a **warning** (a photo, a music file, fewer than 12 cast, no cue waiting on the check-in).

The projector window never receives the codes.

## 5. The cue system

- **Numbered cues by segment**: 100s preshow, 200s welcome, 300s Lesser Evil, 400s intermission, 500s Vessels,
  600s finale. Each cue: `title`, `say` (the host's line, shown big on the console and the host view), `screen`
  (what the projector shows), optional `timer` (seconds), `lock` (`"cast"`: waits for all 12 to check in).
- **Space = GO.** A second GO within 0.6 s is ignored (a bounced spacebar). GO is refused, with the reason on screen,
  while a full-screen safety card is up or the next cue is locked.
- **Rounds repeat with loop cues** (like QLab GOTO cues): a cue with `loopTo` sends GO back to an earlier cue.
  `loopTimes: "prompts"` = once per Lesser Evil prompt, a number = that many times, none = until the operator moves
  on. At a looping cue the console shows both ways out (R = another round, E = move on). Round numbers fill `{round}`
  in titles.
- **Replay core Vessels with the same cast**: the Game over cue loops back to Roles dealt (`replay: true`), off by
  default; arm it with R. Rounds inside start again at night 1 and the game count goes up.
- **Safety cues**, always available, never move the show:

| Key | Cue | Does |
|---|---|---|
| 1 | S1 Hold | Branded hold loop (the menu loop video, or smoke + wordmark) over everything |
| 2 | S2 Technical difficulties | Full-screen card |
| 3 | S3 Be right back | Full-screen card |
| 4 | S4 Reconnecting [name] | Lower-third banner; pick one or more cast names; stays while the show runs |
| 5 | S5 Extend vote | +30 s on the running vote or timer |
| 6 | S6 Redo name entry | Asks one or all cast phones to enter their code again (Phase 2 wires it) |
| Esc | Clear | Takes down the card and the banner |

  The same key again clears S1 to S3. The Stream Deck's Panic button fires S1 (Phase 4).
- **Check-in board**: 12 seats light up as cast phones connect. The welcome cue stays locked until all 12 are in.
  The operator can mark a seat by hand (for a dead phone), and can force-jump past a lock with a second confirmation.
- **Practice vote** in the welcome, flagged `practice`: it runs the whole vote pipe (a free load test) and never counts.
- **Core Vessels**: no nomination vote, no deliberation timer. The host ends deliberation and names 2 or 3 people;
  the operator taps their faces on the console (or the host taps them on the host view), then the audience votes.
- **Lesser Evil's winner picks their Vessels role** (Josh, 2026-10-26): the prize for winning game one. See Phase 2.
- **Audience QR, all night** (built 2026-10-26): bottom-left of the projector, small and themed to the game on
  screen, so anyone can (re)join the vote at any time. Up over the safety cards too; steps aside before the show, on
  black cues, on vote screens (they show it big beside the candidates) and on the download screen. **Q** toggles it.
  Made on the laptop (works offline) from the show file's `audience.url`.
- **Finale**: the MVP (whoever performed best in Vessels), then the download screen (tonight's two games, Sinking
  Ship underneath, a QR to get the app).

## 6. Phases

### Phase 1: scaffold (built, ready to test)
Electron app, two windows, projector detection, show file loading and checks, the cue engine with GO, loops, locks
and safety cues, placeholder screens for every cue type, a manual check-in board, the host view mirror, crash-safe
resume. Details at the end.

### Phase 2: the games in the cue flow, check-in, codes, and the vote
The cast never vote, so neither game can finish a round or a day without the audience: the vote pipe (Phase 3
items 1 to 3) is built here alongside the engine (Josh, 2026-10-26). Phase 3 keeps the host view and the MVP.
1. **Event build of the game pages.** Reuse Vessels Live's `build-event.js` approach (copy prod surfaces, repoint at
   the event Supabase project, inject event code, refuse to build if a prod ref survives) so prod is never modified.
   Target: Supabase project **Vessels Events** (`dvrarldwfemirjeodjnq`, empty, set up through the connector with the
   game schema recovered in `Vessels Live\event-schema.sql` plus this show's tables) and Netlify site
   **vessels-events.netlify.app** (site `315e2a91…`, the old Vessels Live site renamed; its 2026-09-06 build gets
   replaced by the first deploy). Patches for this show:
   - `player:code` — the name screen asks for the personal code. The code is checked against the show's cast (a
     `ev_cast` table, codes stored hashed) and joins with that cast member's exact name, so the existing same-name
     reclaim gives the seat back on any rejoin, in either game. Wrong code: a friendly retry. **The player screens are
     otherwise untouched.**
   - `player:dark-hold` (from Vessels Live) during audience votes.
   - `tv:launcher` — tv.html listens for launcher commands and reports phase changes back.
2. **The launcher creates the night's rooms** (one Lesser Evil, one Vessels, same cast) and seats the 12 by name.
3. **Display layering.** The display window hosts tv.html in a `<webview>` / `WebContentsView` beneath the launcher's
   own layer: cues of `screen.type: "game"` show the engine, everything else (titles, check-in, votes, safety) draws
   on top. Loaded from the event site over https (never file://, see `local-sb.js`).
4. **Cues drive the engine**: `game` cues carry an `engine` command (`start`, `next`, `openvote`...). The cue engine
   learns the game's phase back from tv.html, so "game over" can arm the exit of the night loop automatically.
5. **Check-in**: a cast phone that has entered its code (and has a live connection) lights its seat. Lost connection
   for more than ~10 s greys it and offers S4 for that name in one click.
6. **S6**: sends "enter your code again" to one or all phones.
7. **Lesser Evil prompts** from the show file feed `lesser-evil-host.js` in order, one per round.
8. **The Lesser Evil winner picks their Vessels role** (Josh, 2026-10-26). At the Vessels deal, the winner's phone
   shows every role in that night's deal (the deal follows the player count, as it does today: with 12, Demon,
   Priest, Nun, Anointed, Vanquisher and Townsfolk; no Scholar at events, see Phase 2's notes) and they lock one in.
   **Demon is allowed. Final Girl is
   not on the list**: she isn't dealt, the game designates her later from the townsfolk, as it does today.
   Everyone else is dealt at random around the pick. A patch to the deal (`classicSpecials`, tv.html ~4083) seats
   the pick first. The console and the host view see it; the room doesn't. A replay of Vessels deals at random (the
   prize is for the first game; decided 2026-10-26).

### Phase 2b: the Director (Josh, 2026-10-26: "we need more control")
Josh: "the launcher should actually be playing the game and the person running the controls can move from screen
to screen or let it automatically do so." Decided: the **Director** approach (production's rules and screens stay;
every screen change moves to the launcher), with all four controls below. Not a rebuild of the engines (that would
fork the games from production).

**The rule: a game never changes screen by itself.** Every place either game moved itself in event mode is held
behind the launcher (event patches):
- Core Vessels: the introductions' floor passing on (after a role claim, or the 10 s auto-advance), introductions
  rolling into night, the night's action window opening, the window resolving when its countdown ends, the
  testimony floor passing on, the tie coin's backstop, the Final Girl's verdict. (Already held since Phase 2: the
  story, the role reveal, dawn, the day's opening, the discussion clock, the vote result.)
- Lesser Evil: the clock running out on a position pick, a speech, a rock-paper-scissors throw or the kingmaker's
  choice; the last candidate locking a position (it no longer jumps to the speeches); both sudden-death teams
  choosing sides. A speaker's phone no longer starts their own clock: the launcher does.
- Players still play: they pick, throw, act at night, name suspects. What they can no longer do is move the room
  on. When their part of a screen is done, the screen is **ready**, and the launcher moves on.

**The game track.** During a game cue the console shows the game as screens: what's on the projector now, whether
it's ready (and why not: "2 positions still to pick", "Bram is speaking, 0:42"), its clock, what GO does next
("Start Ava's speech", "Reveal the dawn", "Open the audience vote"), and the screens played so far.

**One GO.** In a game cue Space moves the game to its next screen. When the game is over (Lesser Evil's results,
Vessels' game over), Space moves on to the next cue. Shift+Space moves the cue list at any time (the way out). N
is gone. The sample show's per-beat cues (Vessels 510 to 580) collapse into one game cue, like Lesser Evil's 310.

**Manual and Auto** (A toggles, per night, saved). Manual: nothing moves until Space. Auto: each screen moves on
by itself once it's ready and has been up for its time:
- a screen with the game's own clock (a speech, a pick, a ballot, the night window) moves when the clock runs out
  (or earlier once everyone has done their part, for picks);
- a screen waiting on players (a speaker claiming a role, naming suspects) moves a few seconds after they're done,
  with a ceiling so a silent phone can't stall the room;
- a screen to be read (a reveal, the dawn, the vote result) holds for its time;
- the show file's `director.times` sets every one of those (seconds), `director.mode` the starting mode.
- Auto stops where only a person can decide: Core Vessels' suspects (the console asks for 2 or 3), the end of a
  game. **H** holds Auto on the current screen; H again resumes.

**Back** (Shift+Backspace in a game cue): the projector shows the previous screen again, as it looked, without
touching the game (the launcher keeps a picture of each screen as it plays). Back again goes further back; Space or
Esc returns to the live game. The console marks the projector REPLAY while it's up.

**Votes in the flow.** Core Vessels' audience vote becomes a screen in the game (from the discussion, GO opens it
with the suspects picked on the console; the launcher's vote screen covers the game while it's open, since the
game's own vote screen is the room's checklist). Lesser Evil's stay as they are (the game's ballot board and the
vote panel).

### Phase 3: host view, MVP (the vote items below land in Phase 2)
1. **Tables** (event project), RLS on, anon can only do what each page needs:
   - `ev_vote` — one row per vote round: `id`, `game`, `candidates` (player ids only), `opens_at`, `closes_at`,
     `practice`, `state` (`waiting` / `open` / `closed` / `revealed`).
   - `ev_ballot` — `vote_id`, `device_id`, `choice`, unique (`vote_id`, `device_id`). Insert through an RPC
     `ev_cast(vote_id, device_id, choice)` that checks the window and the candidate list. No select for anon.
   - `ev_tally(vote_id)` — RPC, counts by choice. Only the launcher calls it.
   - `ev_cast_codes` — hashed codes for the night's cast; `ev_check_code(code)` returns the name.
   - No Postgres change events on ballots, no Presence for the audience.
2. **The vote page** (`/vote`, copying the pattern of the HFR WordPress ballot; read it first):
   - A random device id in localStorage. One vote per phone per round, enforced by the unique constraint.
   - Polls a "current vote" JSON every 2 to 3 s, served by a Netlify function with a ~2 s CDN cache. Shows the ballot
     when a vote is open, a waiting screen when not, the final screen with store links at the end.
   - The ballot record holds only player ids; faces and names come from 12 static 300 px WebP photos on Netlify,
     preloaded when the phone first loads the page.
   - Built in the current Vessels look, Direction 2B (the Classic Player 9.21 screens: #04040A, purple glow,
     lavender, Cinzel, the purple slab buttons), and in Lesser Evil's red, white and blue while a Lesser Evil vote is
     open. There's no prod design for this page itself yet.
3. **Tally**: the console and the display poll `ev_tally` once a second while a vote is open. The host view gets the
   result a few seconds before the reveal.
4. **Host view** (new page, host code, the host's phone): huge glanceable text: the current cue, the next GO line,
   timers, vote results before the reveal, the role list. Keeps the screen awake (Wake Lock). The console mirror
   already shows it.
5. **MVP: the existing points system** (Josh, 2026-10-26). tv.html already scores every player at game end
   (`computeGameScores`, tv.html ~4418, saved to `games.score_log`) and already picks an MVP: the highest **skill**
   subtotal, either team, leaving out the flat Played and Team won points. Prod switched the MVP flag off ("MVP of the
   night removed"); the event build switches it back on and the finale cue shows the winner with their point lines.
   Notes for the event:
   - The cast doesn't vote tonight, so the two vote-based awards ("Voted out an evil player", the Scholar's double
     vote) never score. Everything else does: Priest reads, Nun shields, Anointed, Final Girl, possessions, evading
     the vote, the Demon's bluff.
   - Ties: today the first player in seat order wins a tie. At the event a tie means co-MVPs (decided 2026-10-26).
   - If Vessels is replayed, the MVP is the best skill total across the night's Vessels games.

### Phase 4: music and the Stream Deck
1. **Music engine** on its own track, independent of cues: Web Audio in the main window, two decks for ~2 s
   crossfades, a duck (about -12 dB) for the host mic, volume steps, one-shot stingers over the music. Output device
   picker in settings (`setSinkId`), remembered.
2. **Stream Deck** with the stock Elgato Hotkey action (no plugin). The launcher registers system-wide shortcuts
   (`globalShortcut`) so they work when the console isn't focused. F13 to F24 are unused by Windows and every app,
   and the Hotkey action can send them:

| Button | Key |
|---|---|
| Track 1 to 8 | F13 to F20 |
| Fade out | F21 |
| Duck (toggle) | F22 |
| Volume down / up | F23 / F24 |
| Stingers 1 to 4 | Ctrl+F13 to Ctrl+F16 |
| Panic (S1) | Ctrl+F24 |

3. A settings sheet: audio output, the shortcut table, a "test each button" mode.

### Phase 5: load test
A Node script that plays 100 voters against the real stack: each phone polls the current vote with jitter, the vote
opens, all 100 vote within a few seconds, some vote twice (must be refused), some arrive after close (refused). It
reports request latency, errors, CDN hit rate, and checks the tally equals the accepted ballots. Plus a connection
count check with 12 simulated cast phones and the host view attached.

## 7. Setup on the night (target)

1. Open Vessels Events. It loads the last show file (or Show → Open show file…).
2. Plug in the projector. The audience display jumps to it full screen. If it picks the wrong screen, pick the right
   one under Projector; it's remembered.
3. Plug in the Stream Deck. Pick the audio output (Phase 4).
4. Cast check in with their codes; seats light; GO.

## 8. Decisions and open questions

Decided 2026-10-26 (Josh):
- **Engine: option A.** tv.html stays the engine; the launcher conducts it.
- **Site and database:** vessels-events.netlify.app and the new Supabase project Vessels Events
  (`dvrarldwfemirjeodjnq`). Cast phones, the host view and `/vote` all live there; prod playvessels.com is untouched.
- **Lesser Evil's winner picks their Vessels role**: shown every role in the night's deal, locks one in. Demon
  allowed, Final Girl not. The deal follows the player count.
- **MVP: the existing Vessels points system** (highest skill subtotal at the end of Vessels). See Phase 3.
- **Store links:** the app is in both stores by show night. The show file gets `storeLinks: { ios, android }`; the
  download screen shows one QR to `vessels-events.netlify.app/app`, which sends iPhones to the App Store, Android to
  Google Play, and anything else to playvessels.com. The vote page's final screen shows both store buttons.
- **Cast photos:** Josh provides them (any square-ish headshot, 600 px or bigger, face centred; the launcher makes the
  300 px WebP copies for phones).
- **MVP ties:** co-MVPs on stage.
- **A replay of Vessels:** random deal; the role pick is the first game's prize.

Open:
1. **The two store URLs** (App Store and Google Play): Josh sends them once the listings are live, which won't be for
   a while. Until then `/app` sends everyone to playvessels.com, so nothing waits on them.

---

## Phase 1: what's built

`F:\VESSELS\Vessels Events\`

| Path | What |
|---|---|
| `main/main.js` | Electron main process: windows, projector placement, show loading, commands, saving |
| `main/displays.js` | Picks the projector (remembered, or the biggest non-laptop screen) |
| `main/store.js` | Crash-safe JSON files in the app's data folder |
| `main/preload.js` | The one bridge to the windows |
| `src/cue-engine.js` | The cue engine: pure, tested |
| `src/show-file.js` | Show file loading and checks |
| `renderer/console/` | The operator console |
| `renderer/display/` | The audience display |
| `renderer/shared/` | The Vessels look (tokens from prod), the projector screens (shared by the display and the console's preview) |
| `renderer/fonts/`, `renderer/assets/` | Bundled fonts (offline) and the prod wordmark and logos |
| `shows/sample-show/` | A full sample night: 12 cast with placeholder photos, 4 prompts, 8 tracks, 35 cues |
| `tests/` | Unit tests (cue engine, show file, projector pick) |
| `tools/smoke.mjs` | Launches the real app, drives it, screenshots both windows, restarts it |

Not in Phase 1: the real game screens, phones, votes, the host phone page, music, Stream Deck shortcuts.

---

## Phase 2: what's built (2026-10-26)

The games, the cast phones, the audience vote, the Lesser Evil prize and the MVP. Tested end to end against the event
database and the live site (`npm run check:night`).

### The event site (vessels-events.netlify.app)
- `web/build-event.js` generates it from production (`Vessels_6_12`): the two TVs, the two player pages and Lesser
  Evil's scripts, repointed at the Vessels Events database, patched (`web/event-patches.js`, 40 anchored patches; a
  missing anchor fails the build), with **every script the pages load** (player-2b.js is the 2B player design:
  Vessels Live's build never shipped it, so its phones had the old look) and every asset the phone pages use.
- `/cast` (the cast hub: private code, check-in, then it follows the show), `/vote` (the audience), `/api/now` (a
  Netlify function, cached 2 s at the edge, that every audience phone polls), `shows/<night>/roster.json` and 300 px
  cast photos.
- `web/deploy.ps1` builds, refuses anything that still mentions production, and deploys.
- The database: `web/sql/01..05` (migrations ve_01 to ve_07 in the Vessels Events project). Cast codes are stored as
  salted hashes; every write goes through security-definer functions, and the operator's ones need the operator key,
  which only the launcher holds.

### The launcher
- `main/server.js`: a web server on 127.0.0.1:47821 for the TVs: the event build first, production for media only
  (never production's pages or scripts, which point at the production database).
- The projector window hosts the TVs in iframes under its own screens (instead of a webview). One TV at a time: Lesser
  Evil until the intermission, Vessels after. The first load creates the room (`?code=` / `?create=1&code=`), every
  load after joins it (`?game=`): creating a room twice wipes its players, so the rooms are looked up before any TV
  loads. Sound is muted while a game isn't on screen. The console's preview shows a picture of the projector while a
  game is up (a second copy of a game would be a second engine).
- `main/night.js`: the online side. Registers the night and both rooms (in event mode before their TVs boot), polls
  check-ins, the active game and Lesser Evil's ballots, moves the cast phones into a room only once it exists, and
  retries anything that fails on the next tick (the show never waits on the network).
- **The engine step (N).** Core Vessels: Vessels Live's `VLE.hostStep` maps the game row to the one step that makes
  sense, sent as `captain_action`. Lesser Evil: the TV's own host buttons (`LE_HOST.hostActions`), run inside its
  page. A cue's `engine` field takes a step on entry, only if it's the step the game is waiting for (the sample:
  `start` on 310 and 505). Different from the proposal: the game's progress isn't modelled as cues. The games have
  more beats than any cue list (a speaker each, a Lesser Evil race's ballots), so cues set the screen and N moved
  the game. **Superseded by the Director (Phase 2b, below): N is gone, Space plays the game in its game cue.**
- **Lesser Evil in the cue list** is one game cue (310): its engine runs the rounds, and its ballots come to the
  audience by themselves. The sample's old per-round cues (320 to 380) are gone. The night's prompts replace the
  game's topic banks of the same name (they're drawn three per candidate, so "in order" didn't fit the game).
- **Votes.** `ev_vote` / `ev_ballot` and the launcher-only tally. The practice vote (all 12) and Core Vessels' votes
  open on their cues; Core Vessels needs 2 or 3 suspects picked on the console and the game at its vote (GO is held
  with the reason otherwise). Lesser Evil's ballots are mirrored as they open, including its multi-pick room votes
  (each phone picks one) and sudden death (FOR / AGAINST, shown as words). A vote closes on its timer, on V, or by
  leaving its cue; the counts go to the game as Vessels Live's hand-count override, keyed by the game's own ids.
  Every phone and the projector reveal together a few seconds later.
- **The projector shows the games' own screens** (Josh: "the projector should show the game like the TV display").
  During a Lesser Evil ballot the game's ballot board stays up (each candidate's position and slogan, its clock)
  and the corner QR grows into a vote panel in the left margin, clear of the board. The vote closes on the game's
  own ballot clock (the TV runs on the laptop, so it's the same clock); S5 moves that clock too, and V (closing
  early) stops it. A game's vote reveals about 6 s after the close on the phones, the panel and the game together
  (the game sees the close on its 1.5 s poll, then holds 4.4 s); the practice vote reveals after 4 s. Event patches make
  the board true at an event: its "from the audience" count is the /vote total (the launcher pushes it in), the
  "Voters 0/3 · Still to vote" line goes, the room vote lists who's in it instead of live bars from cast votes that
  never come, and the reveal counts the audience and names the winner. Core Vessels' vote is the one place the
  launcher's own screen stays: the game's vote screen is the room's checklist ("9 of 12 have passed judgment"),
  which can't show an audience choosing between 2 or 3 suspects. The verdict after it is the game's own.
- **The prize** (Josh: the Lesser Evil winner picks their Vessels role). When the race crowns its winner the
  launcher offers their phone (only theirs) the night's deal for the table size; they lock one in (or the operator
  picks for them on the console). The first Vessels deal is held until the pick is in the game's hands
  (`event_control.role_pick`); the deal patch (`tv:role-pick`) seats it and gives whoever drew that role the winner's
  instead, so the rest of the deal stays random. The pick is taken back after that deal: a replay is random.
- **The MVP** is worked out by the launcher, not the TV: production's rule (best skill subtotal, everything but
  Played and Team won) over each finished game's `score_log`, added up across replays (a replay wipes `score_log`),
  co-MVPs on a tie. Cue 610 shows the face, the points and the lines they came from.
- Found on the way: Vessels Live's Lesser Evil result write never ran (a Supabase query that was built but never
  sent), so `le_ballot` never got its result. Fixed in our copy of the patch.

### Tests
`npm test` (104 unit tests), `npm run smoke` (the app offline, 34 checks), `npm run check:phones` (the live site),
`npm run check:night` (the whole night online).

### No Scholar at events (Josh, 2026-10-26)
The Scholar's power is a second vote, and at an event the cast doesn't vote, so the event build never deals one. Three
patches (`tv:no-scholar-deal`, `tv:no-scholar-legend`, `player:no-scholar`) take it out of the deal, the TV's lobby
legend and the phone's list of roles in play; the prize menu matches (`dealFor` in `main/night.js`). A 12-seat table
is now Demon, Priest, Nun, Anointed, Vanquisher and seven Townsfolk (checked with a real deal on the live site).
It's a build-time switch, since the event site only runs event nights. Production keeps its Scholar.

### Notes for Josh
- Lesser Evil starts only when every candidate has typed a campaign slogan on their phone (production's rule). The
  game panel says who it's waiting for.
- The cast captain's phone can still press Next in Lesser Evil, as in production. The operator's N does the same.
- Not yet: the host's phone page (the console's mirror shows what it will say), music and the Stream Deck, the load
  test.
