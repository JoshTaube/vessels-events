# SOUL PURPOSE
### Game spec for Claude Code

## 1. The pitch

You're the newest clerk at the Afterlife Front Desk. Twenty souls line up, and each one confesses one ridiculous sin. You swipe each soul to **The Light Place** or **The Dark Place**. The catch: exactly 10 go to each side. No middle ground.

When all 20 are sorted, you get one chance to reorganize. Then the game turns the tables. Based on **what you chose, how fast you chose, and how sure you were**, it tells you what kind of person you are, whether YOU go to the Light Place or the Dark Place, and what your home there looks like.

Tone: funny, light, silly. Nothing scary or preachy. The Dark Place is a neon bowling alley, not a fire pit. Think "afterlife DMV run by tired cartoon characters."

## 2. Platform and tech

- Single-page web game, plain HTML/CSS/JS, no framework, no build step. Must run by opening `index.html` in a mobile browser.
- Portrait only, designed for 9:16 phone screens, scales cleanly to tablets.
- Keep everything in a self-contained `www/` folder so it can be wrapped in Capacitor later for iOS/Android (bundle id to be decided, under com.dojodisco).
- All art drawn in code (SVG and CSS). No image files, so no art credits are needed. Fonts bundled locally (no CDN), so it works offline.
- Sound: tiny WebAudio blips and whooshes generated in code, no audio files for v1. Mute button on every screen.
- No accounts, no network calls. Optional `localStorage` (wrapped in try/catch) to remember the last result.
- Keep game data (souls, archetypes, homes) in a separate `data.js` so it's easy to edit and expand.

## 3. Art style: "Saturday morning cartoon meets afterlife DMV"

- **Look:** 1930s rubber-hose cartoon energy with a modern flat palette. Thick dark outlines (3 to 4px), bouncy squash and stretch, everything slightly wobbly like it's breathing.
- **Souls:** bean-shaped ghost bodies drawn procedurally in SVG. Each soul gets a randomized body color, eye style (dots, pie-cut eyes, sleepy lids), mouth, and one hat or hairdo. Each soul also holds ONE prop tied to their sin (a milk jug, a shopping cart, a slice of cake, a microwave), drawn as a simple SVG. They bob gently while they talk.
- **Setting:** a front desk with a "NOW SERVING 07" ticket counter, a little bell, and a wilting office plant.
- **Light side (swipe right):** pastel cotton-candy clouds, soft gold glow, harp twinkle sound.
- **Dark side (swipe left):** purple and tangerine lava-lamp blobs, neon glow, a cheerful bass "bwomp." Fun, not scary.
- **Boss / narrator:** GARY, a tired grey cloud in a tiny necktie, holding a coffee mug. He shows up in the intro, makes snarky comments between souls, and delivers your results.
- **Fonts:** a chunky rounded display font for headings (something like Lilita One or Bowlby One, bundled locally) and a clean rounded sans for body text.
- **Juice:** cards tilt while dragged, the side you're dragging toward glows brighter, a stamp ("LIGHT!" / "DARK!") slams onto the card on release, and the soul flies up into the clouds or slides down a twisty slide into the neon. A small screen shake when a door fills up.

## 4. Game flow

1. **Title screen:** logo, bobbing ghosts, PLAY button.
2. **Intro (skippable, 3 short beats from Gary):** "Welcome to your first shift." "Twenty souls. Ten Light, ten Dark. No exceptions, no middle." "Oh, and we're watching how you do it."
3. **Sorting round (20 souls):**
   - One soul at a time. Show their name, the confession in a big speech bubble, and a smaller one-line excuse underneath.
   - Swipe right for Light, left for Dark (buttons also work, for accessibility).
   - Two counters at the top: LIGHT 0/10 and DARK 0/10.
   - When a side hits 10, its door slams shut with a "FULL" sign. Any later soul swiped that way bounces back with a buzz, and every remaining soul must go to the other side. (This creates tension, so the player has to plan ahead.)
   - Gary drops a quick quip every 4 or 5 souls ("Bold.", "You hesitated on the milk guy. Interesting.").
4. **Reorganize round (one pass):**
   - Two columns of 10 mini-cards, Light and Dark.
   - Tap one card in each column to swap them (swaps keep the 10/10 balance). Unlimited swaps, then tap LOCK IT IN.
   - Gary: "Last chance. We're timing this too."
5. **Results:** a sequence of reveals, one tap each:
   - Your stats: average decision time, wobbles, swaps.
   - Your personality archetype, with name, a funny title card, and a 2 to 3 sentence description.
   - Gary's verdict: "And you, my friend, are going to... THE LIGHT PLACE / THE DARK PLACE."
   - Your home: an SVG illustration of the home plus its description.
   - Share card: one tall image (made on a canvas) with archetype, verdict, and home, plus a SHARE / SAVE button and a PLAY AGAIN button.

## 5. Scoring

Three things decide everything: **choices, speed, and certainty.**

### Data captured per soul
- `decisionMs`: time from when the confession finishes appearing to when the swipe is released.
- `wobbles`: how many times the drag crossed the center line during one swipe (dragging toward Light, then switching to Dark, counts as a wobble).
- `bounced`: true if they tried a full side first.
- Final placement after reorganizing, plus total `swaps` made in the reorganize round.

### Choices: the Petty vs Big Picture axis
Every soul has a hidden `type`:
- `P` = petty / annoying (milk jug, clapping on planes)
- `H` = actually selfish or hurtful, still silly (ate the roommate's birthday cake)

Each run draws **10 P and 10 H souls** at random from the pool, shuffled together.

`pettyScore = (P souls sent Dark / 10) - (H souls sent Dark / 10)`
- Above 0 means **Petty**: you punish annoying behavior more than real harm.
- 0 or below means **Big Picture**: you punish real harm.

### Speed
Average `decisionMs` across all 20.
- Under 3.0 seconds = **Snap**
- 3.0 seconds or more = **Ponder**
(Make thresholds constants at the top of the file so they can be tuned after playtesting.)

### Certainty
`doubt = totalWobbles + (swaps x 2) + bounces`
- `doubt` 4 or under = **Firm**
- over 4 = **Wobbly**

### Archetype = Choices x Speed x Certainty (8 total)

| Choices | Speed | Certainty | Archetype |
|---|---|---|---|
| Petty | Snap | Firm | **The Hall Monitor** |
| Petty | Snap | Wobbly | **The Hot Take Machine** |
| Petty | Ponder | Firm | **The HOA President** |
| Petty | Ponder | Wobbly | **The Passive-Aggressive Sticky Note** |
| Big Picture | Snap | Firm | **The Bouncer** |
| Big Picture | Snap | Wobbly | **The Golden Retriever** |
| Big Picture | Ponder | Firm | **The Supreme Court of One** |
| Big Picture | Ponder | Wobbly | **The Overthinking Angel** |

Archetype descriptions (Gary reads these):
- **The Hall Monitor:** You saw a crime and wrote it up before it finished happening. Rules are rules, and the milk jug guy knew the rules.
- **The Hot Take Machine:** Fast opinions, loud opinions, and opinions you'd change the second someone looked at you funny. You're the reason group chats have 400 unread messages.
- **The HOA President:** You thought long and hard, and then you damned a man for his lawn-adjacent behavior. Measured. Thorough. Terrifying.
- **The Passive-Aggressive Sticky Note:** You took your time, second-guessed everything, and still sent someone to the Dark Place for reclining their seat. You'd never say it to their face. You'd write it down.
- **The Bouncer:** Quick, calm, and focused on what actually matters. You didn't care about the plane clapper. You cared about the cake thief.
- **The Golden Retriever:** You want everyone to be okay, you decide fast, and then you feel bad about it. Big heart, wagging tail, zero poker face.
- **The Supreme Court of One:** Slow, steady, and fair. You weighed every soul like it was a landmark case. Your rulings will be studied.
- **The Overthinking Angel:** You care so much it hurts. Every choice took a while, half of them you changed, and you'd still like to change three more. That's love, honestly.

### Your own verdict: Light Place or Dark Place
Every soul has a hidden `badness` from 1 to 5 (how bad "the universe" thinks it is). After reorganizing, the "universe's Dark 10" is the 10 souls with the highest badness (break ties randomly at the start of the run and store the result).

- `fairness` = how many of your Dark 10 match the universe's Dark 10 (0 to 10).
- `verdictScore = fairness x 8` (max 80)
  - `+10` if Snap, `+0` if Ponder (decisive clerks get a little credit)
  - `+10` if Firm, `+0` if Wobbly
- `verdictScore` of 60 or more = **THE LIGHT PLACE**, under 60 = **THE DARK PLACE**.
- Special lines from Gary:
  - Perfect fairness (10/10): "Suspiciously perfect. Have you done this before?"
  - Fairness 2 or lower: "You did the exact opposite of what we'd do. Impressive, in a way."

## 6. Homes (archetype x place = 16)

Each home needs an SVG illustration in the same cartoon style plus this description.

| Archetype | Light Place home | Dark Place home |
|---|---|---|
| Hall Monitor | **A Colonial on a Perfect Cul-de-sac.** Lawn edged with a ruler. A label maker in every room. The neighbors are quiet because they're scared of you. | **A Parking Enforcement Booth That Never Closes.** Infinite tickets to write and nobody ever pays them. The coffee's surprisingly good. |
| Hot Take Machine | **A Rotating Penthouse.** It never faces the same direction twice, just like your opinions. Great views, in theory. | **A Sports Bar Where Every TV Plays a Different Argument.** You're winning all of them. Nobody can hear you. |
| HOA President | **The Biggest Mansion on the Block.** You approved the paint color yourself, after a 3-hour meeting. | **A Beige Condo with a 400-Page Rulebook.** You have to enforce it on demons who do not care. They park on the grass. |
| Sticky Note | **A Cozy Cottage with a Shared Fridge.** Everyone labels their food. Everyone. Bliss. | **An Office Break Room, Forever.** Someone keeps microwaving fish. You'll leave a note. |
| Bouncer | **A VIP Loft Above the Clouds.** Velvet rope, a guest list, and you decide who's on it. | **A Neon Bowling Alley.** You run the shoe counter. Nobody gets size 10s without a good reason. |
| Golden Retriever | **A Sunny Farmhouse with Infinite Dogs.** Every one of them is a good boy. You checked. | **A Karaoke Dive Bar.** Sticky floors, warm lights, and by midnight everyone's your best friend. |
| Supreme Court of One | **A Marble Library Mansion.** Rolling ladders, a reading nook, and a gavel you use on your breakfast. | **A Gothic Castle.** Terrible plumbing, incredible acoustics for dramatic pauses. |
| Overthinking Angel | **A 40-Room Treehouse Mansion.** You're still deciding which room is the bedroom. | **A 24-Hour Laundromat.** Warm, humming, peaceful. Your dryer finishes right before you make up your mind. |

## 7. Soul pool (30 souls, each run uses 10 P + 10 H)

Each soul: `name`, `type` (P/H), `badness` (1 to 5), `confession`, `excuse`, `prop` (for the SVG).

### Petty (P)
1. **Brenda** (badness 1, prop: airplane): "I clapped when the plane landed. Every time. Even on layovers." / *"The pilot deserved it!"*
2. **Dale** (2, phone): "I reply 'k' to long, heartfelt texts." / *"It's efficient."*
3. **Marcy** (2, milk jug): "I put the empty milk jug back in the fridge." / *"There was a drop left. Technically."*
4. **Tony** (2, airplane seat): "I recline my airplane seat all the way. Immediately." / *"The button is there for a reason."*
5. **Priya** (1, clipboard): "I say 'let's circle back' in meetings. I have never circled back." / *"We'll circle back on this."*
6. **Gus** (2, shopping cart): "I never returned a shopping cart. Forty years. Not once." / *"Somebody gets paid for that, right?"*
7. **Lorraine** (3, popcorn): "I spoil movie endings on purpose." / *"Spoilers build character."*
8. **Chad** (1, cup of ice): "I chew ice. Loudly. In libraries." / *"It's crunchy. I'm only human."*
9. **Deb** (2, escalator): "I stop at the end of escalators to check my phone." / *"I had a notification!"*
10. **Rusty** (3, microwave): "I microwave fish in the office break room." / *"Fish is brain food."*
11. **Tiffany** (2, envelope): "I start every email with 'Per my last email.'" / *"They should've read my last email."*
12. **Hank** (2, toilet paper): "I leave one square on the toilet paper roll so it's not my job to change it." / *"One square is a roll. Look it up."*
13. **Gloria** (1, coin purse): "I pay with exact change. In pennies. At the busiest register." / *"Money is money, sweetie."*
14. **Skip** (1, group chat bubble): "I accidentally removed my whole family from the group chat. Twice." / *"Was it an accident? Yes. Mostly."*
15. **Bev** (2, dinner plate): "I tell waiters 'surprise me,' then I send it back." / *"I wasn't surprised enough."*

### Harmful-ish (H)
1. **Doug** (4, cake slice): "I ate my roommate's labeled birthday cake and blamed the dog. We don't have a dog." / *"It was a VERY convincing story."*
2. **Sheila** (4, comic book): "I sold my ex's entire comic collection online. For twelve dollars." / *"He loved those comics more than me."*
3. **Earl** (3, gavel): "I faked being sick for six years straight to get out of jury duty." / *"I'm a terrible judge of character. Ask anyone."*
4. **Vanessa** (5, light bulb): "I took credit for my coworker's idea. In the meeting. While she was presenting it." / *"I said it LOUDER. That counts."*
5. **Wade** (4, car keys): "I parked in the fire lane at the grocery store every Sunday for 20 years." / *"I was only running in for chips."*
6. **Connie** (2, ice cream cone): "I told my kids the ice cream truck only plays music when it's sold out." / *"They're adults now. They still believe me."*
7. **Rex** (5, bowtie): "I skipped my best friend's wedding. I was the best man." / *"There was a really good game on."*
8. **Linda** (2, gift box): "I regifted a present back to the person who gave it to me." / *"They clearly had good taste."*
9. **Moe** (3, wifi router): "I stole my neighbor's Wi-Fi for eleven years. I named my network after him." / *"It was a tribute."*
10. **Fern** (4, theme park ticket): "I faked a limp for three days to skip the lines at a theme park." / *"The limp was very method."*
11. **Barry** (4, empty wallet): "I never tipped. Ever. I called it a 'personal philosophy.'" / *"Tipping is a construct."*
12. **Joy** (5, diary): "I read my sister's diary and quoted it in my wedding toast." / *"Everyone laughed! Except her."*
13. **Ned** (3, baseball): "I let my best friend take the blame for the broken window in 1987." / *"He's still grounded, technically. Not my problem."*
14. **Pam** (4, party hat): "I threw myself a fake retirement party for the gifts. Then I came back to work Monday." / *"I retired for the weekend."*
15. **Ozzie** (4, calendar): "I convinced my whole office it was a holiday. It wasn't. We all got written up." / *"It FELT like a holiday."*

## 8. Gary's quips (random pool, shown every 4 to 5 souls)
- "Bold."
- "You didn't even blink. Noted."
- "I'm writing that down."
- "Interesting. Very interesting."
- "You hesitated there. We saw it."
- "That's a choice. That's definitely a choice."
- "My coffee's cold and you're still deciding."
- "Wow. Okay. Wow."

Also: one special quip if the player wobbles on a soul ("Changed your mind mid-swipe? Classic."), and one when a door fills ("That side's full. Plan accordingly.").

## 9. Acceptance checklist
- [ ] Full run (title, intro, 20 souls, reorganize, results, share) works on a phone browser in portrait, one-handed.
- [ ] Exactly 10/10 is enforced. A full side bounces souls back, and swaps keep it 10/10.
- [ ] Each run draws 10 P + 10 H at random, so replays feel different.
- [ ] Timing, wobbles, bounces, and swaps are tracked correctly. Add a hidden debug panel (tap Gary 5 times on the results screen) that shows the raw numbers and every score.
- [ ] All 8 archetypes and all 16 homes can be reached (add a debug option to force each one).
- [ ] Share card exports as a PNG and looks good posted on Instagram stories (1080x1920).
- [ ] No external requests. Works offline.
- [ ] Silly, never mean. No real-world religion, no scary imagery.

## 10. Build order
1. Swipe card engine with the 10/10 rule and data capture (placeholder art).
2. Reorganize round.
3. Scoring plus results screens (text only).
4. Art pass: procedural ghosts, props, front desk, both sides, Gary.
5. Home illustrations and share card.
6. Sound and juice (stamps, flies, screen shake).
7. Playtest pass: tune speed and doubt thresholds so all 8 archetypes come up reasonably often.
