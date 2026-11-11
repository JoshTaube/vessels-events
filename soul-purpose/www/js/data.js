/* SOUL PURPOSE — game data.
 * Everything a writer might want to edit lives here: souls, archetypes, homes, Gary's lines.
 * To add a soul, add an entry to SOULS with a unique id. Each run draws 10 type "P" + 10 type "H".
 *   type:    "P" petty / annoying,  "H" actually selfish or hurtful (still silly)
 *   badness: 1-5, how bad "the universe" thinks it is (hidden from the player)
 *   prop:    key of the SVG prop the soul holds (drawn in the art pass)
 */
(function (root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else { root.SP = root.SP || {}; root.SP.data = data; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SOULS = [
    // ---- Petty (P) ----
    { id: 'brenda',   name: 'Brenda',   type: 'P', badness: 1, prop: 'airplane',     propLabel: 'a toy airplane',
      confession: 'I clapped when the plane landed. Every time. Even on layovers.', excuse: 'The pilot deserved it!' },
    { id: 'dale',     name: 'Dale',     type: 'P', badness: 2, prop: 'phone',        propLabel: 'a phone',
      confession: "I reply 'k' to long, heartfelt texts.", excuse: "It's efficient." },
    { id: 'marcy',    name: 'Marcy',    type: 'P', badness: 2, prop: 'milkJug',      propLabel: 'an empty milk jug',
      confession: 'I put the empty milk jug back in the fridge.', excuse: 'There was a drop left. Technically.' },
    { id: 'tony',     name: 'Tony',     type: 'P', badness: 2, prop: 'airplaneSeat', propLabel: 'an airplane seat',
      confession: 'I recline my airplane seat all the way. Immediately.', excuse: 'The button is there for a reason.' },
    { id: 'priya',    name: 'Priya',    type: 'P', badness: 1, prop: 'clipboard',    propLabel: 'a clipboard',
      confession: "I say 'let's circle back' in meetings. I have never circled back.", excuse: "We'll circle back on this." },
    { id: 'gus',      name: 'Gus',      type: 'P', badness: 2, prop: 'shoppingCart', propLabel: 'a shopping cart',
      confession: 'I never returned a shopping cart. Forty years. Not once.', excuse: 'Somebody gets paid for that, right?' },
    { id: 'lorraine', name: 'Lorraine', type: 'P', badness: 3, prop: 'popcorn',      propLabel: 'a tub of popcorn',
      confession: 'I spoil movie endings on purpose.', excuse: 'Spoilers build character.' },
    { id: 'chad',     name: 'Chad',     type: 'P', badness: 1, prop: 'cupOfIce',     propLabel: 'a cup of ice',
      confession: 'I chew ice. Loudly. In libraries.', excuse: "It's crunchy. I'm only human." },
    { id: 'deb',      name: 'Deb',      type: 'P', badness: 2, prop: 'escalator',    propLabel: 'a tiny escalator',
      confession: 'I stop at the end of escalators to check my phone.', excuse: 'I had a notification!' },
    { id: 'rusty',    name: 'Rusty',    type: 'P', badness: 3, prop: 'microwave',    propLabel: 'a microwave',
      confession: 'I microwave fish in the office break room.', excuse: 'Fish is brain food.' },
    { id: 'tiffany',  name: 'Tiffany',  type: 'P', badness: 2, prop: 'envelope',     propLabel: 'an envelope',
      confession: "I start every email with 'Per my last email.'", excuse: "They should've read my last email." },
    { id: 'hank',     name: 'Hank',     type: 'P', badness: 2, prop: 'toiletPaper',  propLabel: 'a toilet paper roll',
      confession: "I leave one square on the toilet paper roll so it's not my job to change it.", excuse: 'One square is a roll. Look it up.' },
    { id: 'gloria',   name: 'Gloria',   type: 'P', badness: 1, prop: 'coinPurse',    propLabel: 'a coin purse',
      confession: 'I pay with exact change. In pennies. At the busiest register.', excuse: 'Money is money, sweetie.' },
    { id: 'skip',     name: 'Skip',     type: 'P', badness: 1, prop: 'chatBubble',   propLabel: 'a group chat bubble',
      confession: 'I accidentally removed my whole family from the group chat. Twice.', excuse: 'Was it an accident? Yes. Mostly.' },
    { id: 'bev',      name: 'Bev',      type: 'P', badness: 2, prop: 'dinnerPlate',  propLabel: 'a dinner plate',
      confession: "I tell waiters 'surprise me,' then I send it back.", excuse: "I wasn't surprised enough." },

    // ---- Harmful-ish (H) ----
    { id: 'doug',     name: 'Doug',     type: 'H', badness: 4, prop: 'cakeSlice',    propLabel: 'a slice of cake',
      confession: "I ate my roommate's labeled birthday cake and blamed the dog. We don't have a dog.", excuse: 'It was a VERY convincing story.' },
    { id: 'sheila',   name: 'Sheila',   type: 'H', badness: 4, prop: 'comicBook',    propLabel: 'a comic book',
      confession: "I sold my ex's entire comic collection online. For twelve dollars.", excuse: 'He loved those comics more than me.' },
    { id: 'earl',     name: 'Earl',     type: 'H', badness: 3, prop: 'gavel',        propLabel: 'a gavel',
      confession: 'I faked being sick for six years straight to get out of jury duty.', excuse: "I'm a terrible judge of character. Ask anyone." },
    { id: 'vanessa',  name: 'Vanessa',  type: 'H', badness: 5, prop: 'lightBulb',    propLabel: 'a light bulb',
      confession: "I took credit for my coworker's idea. In the meeting. While she was presenting it.", excuse: 'I said it LOUDER. That counts.' },
    { id: 'wade',     name: 'Wade',     type: 'H', badness: 4, prop: 'carKeys',      propLabel: 'car keys',
      confession: 'I parked in the fire lane at the grocery store every Sunday for 20 years.', excuse: 'I was only running in for chips.' },
    { id: 'connie',   name: 'Connie',   type: 'H', badness: 2, prop: 'iceCreamCone', propLabel: 'an ice cream cone',
      confession: "I told my kids the ice cream truck only plays music when it's sold out.", excuse: "They're adults now. They still believe me." },
    { id: 'rex',      name: 'Rex',      type: 'H', badness: 5, prop: 'bowtie',       propLabel: 'a bowtie',
      confession: "I skipped my best friend's wedding. I was the best man.", excuse: 'There was a really good game on.' },
    { id: 'linda',    name: 'Linda',    type: 'H', badness: 2, prop: 'giftBox',      propLabel: 'a gift box',
      confession: 'I regifted a present back to the person who gave it to me.', excuse: 'They clearly had good taste.' },
    { id: 'moe',      name: 'Moe',      type: 'H', badness: 3, prop: 'wifiRouter',   propLabel: 'a Wi-Fi router',
      confession: "I stole my neighbor's Wi-Fi for eleven years. I named my network after him.", excuse: 'It was a tribute.' },
    { id: 'fern',     name: 'Fern',     type: 'H', badness: 4, prop: 'ticket',       propLabel: 'a theme park ticket',
      confession: 'I faked a limp for three days to skip the lines at a theme park.', excuse: 'The limp was very method.' },
    { id: 'barry',    name: 'Barry',    type: 'H', badness: 4, prop: 'emptyWallet',  propLabel: 'an empty wallet',
      confession: "I never tipped. Ever. I called it a 'personal philosophy.'", excuse: 'Tipping is a construct.' },
    { id: 'joy',      name: 'Joy',      type: 'H', badness: 5, prop: 'diary',        propLabel: 'a diary',
      confession: "I read my sister's diary and quoted it in my wedding toast.", excuse: 'Everyone laughed! Except her.' },
    { id: 'ned',      name: 'Ned',      type: 'H', badness: 3, prop: 'baseball',     propLabel: 'a baseball',
      confession: 'I let my best friend take the blame for the broken window in 1987.', excuse: "He's still grounded, technically. Not my problem." },
    { id: 'pam',      name: 'Pam',      type: 'H', badness: 4, prop: 'partyHat',     propLabel: 'a party hat',
      confession: 'I threw myself a fake retirement party for the gifts. Then I came back to work Monday.', excuse: 'I retired for the weekend.' },
    { id: 'ozzie',    name: 'Ozzie',    type: 'H', badness: 4, prop: 'calendar',     propLabel: 'a calendar',
      confession: "I convinced my whole office it was a holiday. It wasn't. We all got written up.", excuse: 'It FELT like a holiday.' },
  ];

  // The 8 archetypes. petty/snap/firm say where each sits on the three axes (scoring.js maps to them).
  const ARCHETYPES = {
    hallMonitor: {
      name: 'The Hall Monitor', petty: true, snap: true, firm: true,
      title: 'Has a whistle. Will use it.',
      description: 'You saw a crime and wrote it up before it finished happening. Rules are rules, and the milk jug guy knew the rules.',
    },
    hotTake: {
      name: 'The Hot Take Machine', petty: true, snap: true, firm: false,
      title: 'Opinions served piping hot. Refills free.',
      description: "Fast opinions, loud opinions, and opinions you'd change the second someone looked at you funny. You're the reason group chats have 400 unread messages.",
    },
    hoaPresident: {
      name: 'The HOA President', petty: true, snap: false, firm: true,
      title: 'Your mailbox is two inches too tall.',
      description: 'You thought long and hard, and then you damned a man for his lawn-adjacent behavior. Measured. Thorough. Terrifying.',
    },
    stickyNote: {
      name: 'The Passive-Aggressive Sticky Note', petty: true, snap: false, firm: false,
      title: 'Per my last note...',
      description: "You took your time, second-guessed everything, and still sent someone to the Dark Place for reclining their seat. You'd never say it to their face. You'd write it down.",
    },
    bouncer: {
      name: 'The Bouncer', petty: false, snap: true, firm: true,
      title: "If you're not on the list, you're not on the list.",
      description: "Quick, calm, and focused on what actually matters. You didn't care about the plane clapper. You cared about the cake thief.",
    },
    goldenRetriever: {
      name: 'The Golden Retriever', petty: false, snap: true, firm: false,
      title: "Who's a good clerk? You are. Probably.",
      description: 'You want everyone to be okay, you decide fast, and then you feel bad about it. Big heart, wagging tail, zero poker face.',
    },
    supremeCourt: {
      name: 'The Supreme Court of One', petty: false, snap: false, firm: true,
      title: 'The court will now take a 40-minute recess.',
      description: 'Slow, steady, and fair. You weighed every soul like it was a landmark case. Your rulings will be studied.',
    },
    overthinkingAngel: {
      name: 'The Overthinking Angel', petty: false, snap: false, firm: false,
      title: 'Halo slightly crooked from all the head-scratching.',
      description: "You care so much it hurts. Every choice took a while, half of them you changed, and you'd still like to change three more. That's love, honestly.",
    },
  };

  // Homes: archetype x place (16). Illustrations are keyed the same way (art pass).
  const HOMES = {
    hallMonitor: {
      light: { name: 'A Colonial on a Perfect Cul-de-sac', description: "Lawn edged with a ruler. A label maker in every room. The neighbors are quiet because they're scared of you." },
      dark:  { name: 'A Parking Enforcement Booth That Never Closes', description: "Infinite tickets to write and nobody ever pays them. The coffee's surprisingly good." },
    },
    hotTake: {
      light: { name: 'A Rotating Penthouse', description: 'It never faces the same direction twice, just like your opinions. Great views, in theory.' },
      dark:  { name: 'A Sports Bar Where Every TV Plays a Different Argument', description: "You're winning all of them. Nobody can hear you." },
    },
    hoaPresident: {
      light: { name: 'The Biggest Mansion on the Block', description: 'You approved the paint color yourself, after a 3-hour meeting.' },
      dark:  { name: 'A Beige Condo with a 400-Page Rulebook', description: 'You have to enforce it on demons who do not care. They park on the grass.' },
    },
    stickyNote: {
      light: { name: 'A Cozy Cottage with a Shared Fridge', description: 'Everyone labels their food. Everyone. Bliss.' },
      dark:  { name: 'An Office Break Room, Forever', description: "Someone keeps microwaving fish. You'll leave a note." },
    },
    bouncer: {
      light: { name: 'A VIP Loft Above the Clouds', description: "Velvet rope, a guest list, and you decide who's on it." },
      dark:  { name: 'A Neon Bowling Alley', description: 'You run the shoe counter. Nobody gets size 10s without a good reason.' },
    },
    goldenRetriever: {
      light: { name: 'A Sunny Farmhouse with Infinite Dogs', description: 'Every one of them is a good boy. You checked.' },
      dark:  { name: 'A Karaoke Dive Bar', description: "Sticky floors, warm lights, and by midnight everyone's your best friend." },
    },
    supremeCourt: {
      light: { name: 'A Marble Library Mansion', description: 'Rolling ladders, a reading nook, and a gavel you use on your breakfast.' },
      dark:  { name: 'A Gothic Castle', description: 'Terrible plumbing, incredible acoustics for dramatic pauses.' },
    },
    overthinkingAngel: {
      light: { name: 'A 40-Room Treehouse Mansion', description: "You're still deciding which room is the bedroom." },
      dark:  { name: 'A 24-Hour Laundromat', description: 'Warm, humming, peaceful. Your dryer finishes right before you make up your mind.' },
    },
  };

  const PLACES = {
    light: { name: 'The Light Place', shout: 'THE LIGHT PLACE' },
    dark:  { name: 'The Dark Place',  shout: 'THE DARK PLACE' },
  };

  const GARY = {
    intro: [
      'Welcome to your first shift.',
      'Twenty souls. Ten Light, ten Dark. No exceptions, no middle.',
      "Oh, and we're watching how you do it.",
    ],
    // Random pool, shown every 4 or 5 souls. `when` limits a quip to fast or slow decisions (omit = any).
    quips: [
      { text: 'Bold.' },
      { text: "You didn't even blink. Noted.", when: 'fast' },
      { text: "I'm writing that down." },
      { text: 'Interesting. Very interesting.' },
      { text: 'You hesitated there. We saw it.', when: 'slow' },
      { text: "That's a choice. That's definitely a choice." },
      { text: "My coffee's cold and you're still deciding.", when: 'slow' },
      { text: 'Wow. Okay. Wow.' },
    ],
    // Used instead of a random quip when the last soul took a long time. {name} is the soul's name.
    hesitated: 'You hesitated on {name}. Interesting.',
    wobble: 'Changed your mind mid-swipe? Classic.',
    doorFull: "That side's full. Plan accordingly.",
    bounce: "That door's shut. Other way.",
    reorganize: "Last chance. We're timing this too.",
    resultsOpen: "Alright. Let's see how you did.",
    verdictLead: 'And you, my friend, are going to...',
    perfectFairness: 'Suspiciously perfect. Have you done this before?',
    lowFairness: "You did the exact opposite of what we'd do. Impressive, in a way.",
  };

  return { SOULS, ARCHETYPES, HOMES, PLACES, GARY };
});
