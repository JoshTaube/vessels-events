// The anchored patches that turn the prod surfaces into event mode.
//
// Every `find` here is a literal slice of a file this repo does not own. When
// prod changes shape an anchor stops matching and the BUILD FAILS - which is the
// point. A silently skipped patch means the event build behaves like normal
// Vessels, and the first place anyone would notice is on stage.
//
// Keep the anchors long enough to be unique and short enough to survive
// unrelated edits nearby. patch-engine.js rejects any anchor that matches twice.
(function (root) {
  'use strict';

  // ===========================================================================
  // tv.html - the event runtime.
  //
  // Injected next to the engine heartbeat so it shares scope with gameId, sb,
  // currentGame, allPlayers and the whole cvAud* family that already exists for
  // audience voting. tv.html stays the engine holder; this only listens for the
  // narrator's commands and drives the ballot.
  // ===========================================================================
  const TV_RUNTIME = `
// ===== VESSELS LIVE - event runtime ========================================
// The narrator's phone writes commands into event_control; this polls them and
// acts. Each command carries an ascending nonce so a poll that sees the same row
// repeatedly runs it once, and the gate is seeded from whatever is already in the
// row at boot so a TV restarting mid-show cannot replay the last command and
// reopen a window the narrator had closed.
const VL_EV_POLL_MS = 1500;
const VL_REVEAL_LEAD_MS = 4000;   // how far ahead reveal_at is stamped
window.__VL_EVENT = { on:false, game:'cv', nominees:[], lastResult:null, ctl:null };
let _vlGate = null, _vlBusy = false, _vlSeeded = false;

function vlEventLive(){ return !!sb && !!gameId && !window.__VESSELS_LOCAL && !(typeof SIM!=='undefined'&&SIM); }

async function vlEventPoll(){
  // Published so a harness (and a narrator debugging at a venue) can see WHY the
  // runtime is standing down. gameId and sb are script-scoped in tv.html and
  // invisible from outside without this.
  window.__VL_EVENT.diag = { sb: !!sb, gameId: gameId||null, local: !!window.__VESSELS_LOCAL, live: vlEventLive() };
  if(!vlEventLive() || _vlBusy) return;
  _vlBusy = true;
  try{
    const r = await sb.from('event_control').select('*').eq('game_id',gameId).limit(1);
    if(r && r.error){ window.__VL_EVENT.diag.err = String(r.error.message||r.error); return; }
    const ctl = (r.data && r.data[0]) || null;
    window.__VL_EVENT.diag.rows = (r.data && r.data.length) || 0;
    if(!ctl) return;
    window.__VL_EVENT.ctl = ctl;
    window.__VL_EVENT.on = !!ctl.event_mode;
    window.__VL_EVENT.game = ctl.game || 'cv';
    window.__VL_EVENT.nominees = Array.isArray(ctl.nominees) ? ctl.nominees : [];
    // Seed the gate on the FIRST poll so a restart does not replay a stale command.
    if(!_vlSeeded){ _vlSeeded = true; _vlGate = VLB.commandGate(ctl.nonce); return; }
    if(!_vlGate) _vlGate = VLB.commandGate(ctl.nonce);
    if(!_vlGate.shouldRun(ctl)) return;
    await vlRunCommand(ctl);
  }catch(e){ try{ window.__VL_EVENT.diag.thrown = String(e && (e.message||e)); }catch(_){} }
  finally{ _vlBusy = false; }
}

async function vlRunCommand(ctl){
  const cmd = ctl.cmd;
  if(cmd === 'open_vote')  return vlOpenAudienceVote(ctl);
  if(cmd === 'close_vote') return vlCloseAudienceVote(ctl);
  if(cmd === 'reveal')     return vlForceReveal(ctl);
  if(cmd === 'end_show')   return vlEndShow(ctl);
  // event_mode / mark_round carry no action beyond the state already ingested.
}

// The crowd votes on the narrator's shortlist, not the whole room. Core Vessels
// in event mode is crowd-as-jury: the narrator names 2-3 suspects after
// deliberation, they defend themselves, and the audience eliminates one.
function vlOpenAudienceVote(ctl){
  const alive = (allPlayers||[]).filter(p=>!p.is_eliminated);
  const nom = (ctl.nominees||[]).map(String);
  const pool = nom.length ? alive.filter(p=>nom.indexOf(String(p.id))>=0) : alive;
  if(!pool.length) return;
  window.__VL_EVENT.lastResult = null;
  cvAudOpen('vlvote:'+gameId+':'+cvAudSeq(0)+':'+ctl.nonce, {
    seq: cvAudSeq(0), kind:'vote', pick:1, reveal_at:null, result:null,
    prompt: 'Who do you eliminate?',
    options: pool.map(p=>({id:String(p.id), label:cvClamp(p.name,24)}))
  });
}

// Close, resolve, and stamp reveal_at a few seconds out so every phone and the
// screen flip together. A hand count from the narrator REPLACES the harvest - it
// never adds - and enters through the same VLB.resolve() the network path uses,
// so nothing downstream can tell the difference.
async function vlCloseAudienceVote(ctl){
  const alive = (allPlayers||[]).filter(p=>!p.is_eliminated);
  const nom = (ctl.nominees||[]).map(String);
  const keys = (nom.length ? nom : alive.map(p=>String(p.id)));
  let rows = [];
  if(!ctl.override){
    const h = await cvAudHarvest(0);
    rows = Object.keys(h.counts||{}).reduce((acc,k)=>{
      for(let i=0;i<h.counts[k];i++) acc.push({voter_uid:k+':'+i, choice:[k]});
      return acc;
    },[]);
  } else {
    try{ await sb.from('cv_ballot').update({open:false,updated_at:new Date().toISOString()}).eq('game_id',gameId); }catch(e){}
  }
  const res = VLB.resolve({ rows: rows, keys: keys, override: ctl.override || null });
  window.__VL_EVENT.lastResult = res;

  const revealAt = new Date(Date.now() + VL_REVEAL_LEAD_MS).toISOString();
  try{
    await sb.from('cv_ballot').update({
      open:false, reveal_at:revealAt, result:res, updated_at:new Date().toISOString()
    }).eq('game_id',gameId);
  }catch(e){}

  // Let the room read the result, then resolve the elimination on the same
  // clock the phones are holding to.
  setTimeout(async function(){
    // CLAIM THE ENGINE LEASE FIRST.
    //
    // apTallyAndResolve refuses to resolve unless this TV owns the lease, and in
    // event mode it never will on its own: _engineBeat bails on its first line
    // unless currentGame.autopilot is true, and event mode is the Narrate posture
    // (a human drives, the TV displays) where autopilot is false. So the ballot
    // closed, the result was written, the room saw the reveal - and nobody was
    // ever eliminated. Silent, and only visible as "the game didn't advance".
    //
    // Claiming here rather than weakening the ownership check keeps the property
    // the lease exists for: if a second TV genuinely holds a fresh lease, the CAS
    // fails, this one stands down, and nobody gets eliminated twice.
    try{
      if(typeof _iOwnEngine==='function' && !_iOwnEngine() && typeof _claimEngine==='function'){
        await _claimEngine();
      }
    }catch(e){}
    try{
      window.__VL_RESOLVE = {
        fired: true,
        owns: (typeof _iOwnEngine==='function') ? !!_iOwnEngine() : 'n/a',
        engineSupported: (typeof _engineSupported!=='undefined') ? !!_engineSupported : 'n/a',
        phase: currentGame && currentGame.phase,
        votingOpen: currentGame && currentGame.voting_open,
        tallying: (typeof _tallying!=='undefined') ? !!_tallying : 'n/a'
      };
      apTallyAndResolve();
    }catch(e){ try{ window.__VL_RESOLVE = { err: String(e && (e.message||e)) }; }catch(_){} }
  }, VL_REVEAL_LEAD_MS + 400);
}

// Belt and braces for the narrator: if a reveal did not land, push it now.
async function vlForceReveal(){
  const res = window.__VL_EVENT.lastResult;
  if(!res) return;
  try{
    await sb.from('cv_ballot').update({
      open:false, reveal_at:new Date().toISOString(), result:res, updated_at:new Date().toISOString()
    }).eq('game_id',gameId);
  }catch(e){}
  try{ apTallyAndResolve(); }catch(e){}
}

// Flip every audience phone to the download screen.
async function vlEndShow(){
  try{
    await sb.from('cv_ballot').upsert({
      game_id:gameId, seq:cvAudSeq(0)+900, kind:'download', open:false,
      prompt:'', options:[], reveal_at:null, result:null,
      updated_at:new Date().toISOString()
    },{onConflict:'game_id'});
  }catch(e){}
}

setInterval(vlEventPoll, VL_EV_POLL_MS);
// ===== end event runtime ===================================================
`;

  const TV = [
    {
      name: 'tv:event-runtime',
      find: 'setInterval(_engineBeat, ENGINE_BEAT_MS);',
      replace: 'setInterval(_engineBeat, ENGINE_BEAT_MS);\n' + TV_RUNTIME,
      applied: '===== VESSELS LIVE - event runtime'
    },
    {
      // The narrator is the only clock. Stock apMaybeTally closes on a 30s timer
      // or when every living player has voted - and in event mode NOBODY votes,
      // so the "everyone is in" branch is vacuously true the instant the window
      // opens. Left alone it would resolve the day vote before the crowd saw it.
      name: 'tv:no-auto-tally',
      find: 'function apMaybeTally(){\n  if(_tallying)return;',
      replace: 'function apMaybeTally(){\n  if(_tallying)return;\n'
        + '  // EVENT MODE: the narrator is the only clock. Stock behaviour closes the\n'
        + '  // vote when every living player is in, and in event mode nobody votes at\n'
        + '  // all - so that condition is vacuously TRUE and would resolve the day vote\n'
        + '  // the instant the window opened. vlCloseAudienceVote drives it instead.\n'
        + '  if(window.__VL_EVENT&&window.__VL_EVENT.on)return;',
      applied: 'EVENT MODE: the narrator is the only clock'
    },
    {
      // Sole judge, not a swing vote. Stock folds ONE audience vote on top of the
      // players' tally; in event mode the players cast none, so the crowd's counts
      // ARE the tally.
      name: 'tv:audience-is-the-tally',
      find: '      const ar=_cvReveal.data;\n'
          + '      if(ar&&ar.key===hkeyNow&&tally[ar.targetId]!==undefined)tally[ar.targetId]++;',
      replace: '      if(window.__VL_EVENT&&window.__VL_EVENT.on){\n'
        + '        // EVENT MODE: the audience is the sole judging body. Stock adds ONE\n'
        + '        // crowd vote on top of the room; here the room cast nothing, so the\n'
        + '        // harvested counts REPLACE the tally outright.\n'
        + '        const _evr=window.__VL_EVENT.lastResult;\n'
        + '        Object.keys(tally).forEach(k=>{tally[k]=0;});\n'
        + '        if(_evr&&_evr.counts)Object.keys(_evr.counts).forEach(k=>{ if(tally[k]!==undefined)tally[k]=_evr.counts[k]; });\n'
        + '      } else {\n'
        + '      const ar=_cvReveal.data;\n'
        + '      if(ar&&ar.key===hkeyNow&&tally[ar.targetId]!==undefined)tally[ar.targetId]++;\n'
        + '      }',
      applied: 'EVENT MODE: the audience is the sole judging body'
    },
    {
      // The stock read-the-result hold re-harvests and plays its own reveal beat.
      // In event mode reveal_at already synchronises the room, so the hold would
      // just delay an elimination the audience has already watched land.
      // Vessels Events: prod (2026-09-21) added the coin-flip guard (&&!_cfDone) to this line.
      name: 'tv:skip-stock-reveal-hold',
      find: '      if(_hkServed!==hkey&&!_cfDone){\n        apArmResultHold(hkey,alive);',
      replace: '      if(!(window.__VL_EVENT&&window.__VL_EVENT.on) && _hkServed!==hkey&&!_cfDone){\n        apArmResultHold(hkey,alive);',
      applied: '!(window.__VL_EVENT&&window.__VL_EVENT.on) && _hkServed!==hkey&&!_cfDone'
    }
  ];

  // ===========================================================================
  // VESSELS EVENTS (2026-10-26): the lobby QR is for the cast, and the cast
  // come in through /cast (their private code) on the event site. The TV runs
  // on the operator's laptop (http://127.0.0.1), so location.origin would put
  // the laptop's address in the QR: always use the event site instead.
  // (Vessels Live pointed this at its join.html door.)
  // ===========================================================================
  TV.push({
    name: 'tv:qr-join',
    find: "function getJoinUrl(){return (location.origin&&location.origin.indexOf('http')===0?location.origin:'https://playvessels.com')+'/player.html?game='+gameId;}",
    replace: "function getJoinUrl(){return ((window.VL_CONFIG&&window.VL_CONFIG.site)||'https://vessels-events.netlify.app')+'/cast?room='+encodeURIComponent(gameId);} // VESSELS EVENTS: the cast join through /cast on the event site",
    applied: 'VESSELS EVENTS: the cast join through /cast on the event site'
  });

  // ===========================================================================
  // HOST CONTROLS (owner 2026-09-02): "someone on the back end moving this
  // along since there won't be a narrator on the screen", timers "fully off".
  //
  // The captain's phone has always driven autopilotTick through
  // games.captain_action; the narrator page now writes the same column. What
  // has to go is every hold that would move the show on WITHOUT a signal:
  // the story prologue's VO ceiling, the ten-second reveal->intros beat, the
  // dawn / day-chronicle / vote-result holds and the discussion deadline. Each
  // one returns early in event mode, right where its timer key would otherwise
  // be consumed, so the captain_action branch just above it still fires.
  //
  // Deliberately NOT gated: the night action window (players need its
  // countdown), night resolution once the window closes, intro floors ending
  // when a player claims a role, and the Final Girl verdict beat.
  // ===========================================================================
  const TV_HOLD = 'if(window.__VL_EVENT&&window.__VL_EVENT.on)return; // EVENT MODE: the host moves the show on\n';
  const TV_HOST = [
    {
      name: 'tv:host-story',
      find: "    const key='apstory:'+gameId+':'+(currentGame.round_number||1);\n",
      replace: '    ' + TV_HOLD + "    const key='apstory:'+gameId+':'+(currentGame.round_number||1); // VESSELS LIVE: host-gated above\n",
      applied: "the host moves the show on\n    const key='apstory:'"
    },
    {
      name: 'tv:host-reveal',
      find: "    if(allRevealed){\n      const key='apreveal:'+gameId;",
      replace: "    if(allRevealed && !(window.__VL_EVENT&&window.__VL_EVENT.on)){ // EVENT MODE: the host's Begin starts intros\n      const key='apreveal:'+gameId;",
      applied: "allRevealed && !(window.__VL_EVENT&&window.__VL_EVENT.on)"
    },
    {
      name: 'tv:host-dawn',
      find: "      const dk='apdawn:'+gameId+':'+(currentGame.round_number||1)+':'+currentGame.night_number;\n",
      replace: '      ' + TV_HOLD + "      const dk='apdawn:'+gameId+':'+(currentGame.round_number||1)+':'+currentGame.night_number; // VESSELS LIVE: host-gated above\n",
      applied: "the host moves the show on\n      const dk='apdawn:'"
    },
    {
      name: 'tv:host-daychron',
      find: "    const dk='apdaychron:'+gameId+':'+(currentGame.round_number||1)+':'+currentGame.night_number;\n",
      replace: '    ' + TV_HOLD + "    const dk='apdaychron:'+gameId+':'+(currentGame.round_number||1)+':'+currentGame.night_number; // VESSELS LIVE: host-gated above\n",
      applied: "the host moves the show on\n    const dk='apdaychron:'"
    },
    {
      name: 'tv:host-discussion',
      find: "    const _df=currentGame.floor;\n    const _dl=new Date(_df.ts).getTime()+(_df.discussMs||90000);\n",
      replace: '    ' + TV_HOLD + "    const _df=currentGame.floor;\n    const _dl=new Date(_df.ts).getTime()+(_df.discussMs||90000); // VESSELS LIVE: host-gated above\n",
      applied: "the host moves the show on\n    const _df=currentGame.floor;\n    const _dl="
    },
    {
      name: 'tv:host-voteres',
      find: "    const vk='apvoteres:'+gameId+':'+(currentGame.round_number||1)+':'+currentGame.night_number+':'",
      replace: '    ' + TV_HOLD + "    const vk='apvoteres:'+gameId+':'+(currentGame.round_number||1)+':'+currentGame.night_number+/* VESSELS LIVE: host-gated above */':'",
      applied: "the host moves the show on\n    const vk='apvoteres:'"
    },
    {
      // The host's press must land within seconds in EVERY phase, realtime or
      // not. Found 2026-09-04: a channel that binds one unpublished table
      // (night_actions) joins fine and then delivers nothing, and the stock
      // probe stands down outside the lobby, so a mid-game press waited on the
      // 45s quiet-resync. One ~80-byte read every 3s is nothing for one TV.
      name: 'tv:host-probe-all-phases',
      find: "  const ph=g.phase; if(!(ph==='lobby'||ph==='lobby_closed'||ph==='ended'||ph==='ss'))return;",
      replace: "  const ph=g.phase; if(!(ph==='lobby'||ph==='lobby_closed'||ph==='ended'||ph==='ss'||(window.__VL_EVENT&&window.__VL_EVENT.on)))return; // EVENT MODE: every phase, the host presses mid-game",
      applied: "||(window.__VL_EVENT&&window.__VL_EVENT.on)))return; // EVENT MODE: every phase"
    },
    {
      // The engine's own writes (night 'window' -> 'night_done') only come back through realtime;
      // when that is deaf the next tick waits for the 45s resync. Watch pending_action_type too.
      name: 'tv:host-probe-pending-action',
      find: "  const{data}=await sb.from('games').select('captain_action,phase').eq('id',gameId).single();",
      replace: "  const{data}=await sb.from('games').select('captain_action,phase,pending_action_type').eq('id',gameId).single(); // EVENT MODE: + pending_action_type",
      applied: "select('captain_action,phase,pending_action_type')"
    },
    {
      name: 'tv:host-probe-pending-action-compare',
      find: "  if(data&&(data.captain_action||data.captain_action!==g.captain_action||data.phase!==g.phase))_tvResync();",
      replace: "  if(data&&(data.captain_action||data.captain_action!==g.captain_action||data.phase!==g.phase||data.pending_action_type!==g.pending_action_type))_tvResync(); // EVENT MODE",
      applied: "data.pending_action_type!==g.pending_action_type"
    }
  ];
  TV.push(...TV_HOST);


  // ===========================================================================
  // player.html - the stage phone.
  //
  // In event mode a player never votes. During an audience window their phone
  // goes dark rather than idle: twelve people looking down at screens is the
  // last thing you want at the moment the room's attention peaks.
  // ===========================================================================
  const PLAYER_RUNTIME = `
// ===== VESSELS LIVE - stage phone ==========================================
// One small poll so the phone knows whether event mode is on and whether the
// crowd is currently voting. Twelve phones, one indexed row each: negligible
// next to the heartbeat this sits beside.
const VL_P_POLL_MS = 2000;
window.__VL_EVENT = { on:false, windowOpen:false };
let _vlPBusy = false;
async function vlPlayerPoll(){
  if(!sb || !gameId || _vlPBusy || window.__VESSELS_LOCAL) return;
  _vlPBusy = true;
  try{
    const r = await sb.from('event_control').select('event_mode,game').eq('game_id',gameId).limit(1);
    const ctl = (r && r.data && r.data[0]) || null;
    window.__VL_EVENT.on = !!(ctl && ctl.event_mode);
    if(window.__VL_EVENT.on){
      const t = VLB.tables((ctl && ctl.game) || 'cv');
      if(t){
        const b = await sb.from(t.ballot).select('open').eq('game_id',gameId).limit(1);
        window.__VL_EVENT.windowOpen = !!(b && b.data && b.data[0] && b.data[0].open);
      }
    } else { window.__VL_EVENT.windowOpen = false; }
  }catch(e){ /* leave the last known state up; never blank a phone mid-show */ }
  finally{ _vlPBusy = false; }
}
setInterval(vlPlayerPoll, VL_P_POLL_MS);
vlPlayerPoll();

// The hold screen. No tally (a visible count is a bandwagon), no timer (a
// visible clock pressures the players), no input (they are not voting). Their
// role stays reachable, but behind a deliberate tap - it should not be sitting
// on screen while they ought to be looking up at the room.
function vlRenderHold(){
  try{ setRoom('Day '+toRoman(currentGame.night_number)+' · '+gameId+' · '+(currentPlayer?.name||'')); }catch(e){}
  try{ setHeaderContext('The Audience Decides'); }catch(e){}
  menuWrap.innerHTML='';
  menuWrap.appendChild(mkLabel('The Audience Is Deciding'));
  menuWrap.appendChild(mkItem('Look up. The room is voting.'));
  const btn = mkItem('Show my role');
  btn.addEventListener('click', function(){
    btn.textContent = (currentPlayer && currentPlayer.role) ? String(currentPlayer.role) : 'Unknown';
  });
  menuWrap.appendChild(mkDivider());
  menuWrap.appendChild(btn);
}
// ===== end stage phone =====================================================
`;

  const PLAYER = [
    {
      name: 'player:event-runtime',
      find: 'setInterval(_heartbeat,HEARTBEAT_MS);',
      replace: 'setInterval(_heartbeat,HEARTBEAT_MS);\n' + PLAYER_RUNTIME,
      applied: '===== VESSELS LIVE - stage phone'
    },
    {
      name: 'player:dark-hold',
      find: 'function renderVote(){\n  // Declared HERE, not two hundred lines down.',
      replace: 'function renderVote(){\n'
        + '  // EVENT MODE: stage players do not vote - the audience is the judging body.\n'
        + '  // While the crowd has a window open this phone goes dark rather than idle.\n'
        + '  if(window.__VL_EVENT&&window.__VL_EVENT.on&&window.__VL_EVENT.windowOpen){ vlRenderHold(); return; }\n'
        + '  // Declared HERE, not two hundred lines down.',
      applied: 'EVENT MODE: stage players do not vote'
    }
  ];

  // The stage phones: in event mode no player is the captain. Prod already
  // routes every captain-gated control through iAmCaptain() (its own hosted-room
  // pad relies on that), so one guard here takes Start / Begin / Next / Open the
  // Vote off every phone at once and leaves them with the narrator page.
  PLAYER.push({
    name: 'player:no-phone-captain',
    find: '  if(cvEventRoom()&&cvHostId())return false;\n  return !!(currentPlayer&&autopilotCaptainId()===currentPlayer.id);',
    replace: '  if(cvEventRoom()&&cvHostId())return false;\n'
      + '  if(window.__VL_EVENT&&window.__VL_EVENT.on)return false; // EVENT MODE: the narrator page is the captain\n'
      + '  return !!(currentPlayer&&autopilotCaptainId()===currentPlayer.id);',
    applied: 'EVENT MODE: the narrator page is the captain'
  });

  // ===========================================================================
  // VESSELS EVENTS (2026-10-26): the cast come in through /cast with their
  // private code, which leaves their exact name on the phone (EV, from ev.js).
  //   - the gate: no cast identity, back to /cast (replaces Vessels Live's
  //     passcode door). The throw halts this script block (init() lives in it)
  //     so nothing below reads or writes the room before the browser leaves.
  //   - auto-join: the name screen fills itself in and joins. Prod's handleJoin
  //     reclaims a seat by EXACT name, role intact, even mid-game, so a cast
  //     member on a new phone (or a cleared tab) lands back in their own seat.
  //   - follow: every 5 s the phone checks in and asks where the show is; when
  //     the launcher moves the night on, it goes back through /cast.
  // ===========================================================================
  PLAYER.push({
    name: 'player:cast-gate',
    find: "let gameId=urlParams.get('game');   // 'let' so the Sinking Ship mobile-experience host can set it after generating a room code",
    replace: "let gameId=urlParams.get('game');   // 'let' so the Sinking Ship mobile-experience host can set it after generating a room code\n"
      + "if(window.EV){ EV.gate(gameId); EV.follow(gameId, 'cv'); } // VESSELS EVENTS: cast only, and follow the show",
    applied: 'VESSELS EVENTS: cast only, and follow the show'
  });
  PLAYER.push({
    name: 'player:auto-join',
    find: 'function renderJoin(){\n  if(!currentGame&&gameId&&!_cvPre)cvPreloadRoom();',
    replace: 'function renderJoin(){\n'
      + '  // VESSELS EVENTS: join as this cast member, by exact name (prod reclaims the seat by name).\n'
      + '  if(window.EV&&EV.joinName()){\n'
      + '    if(window.__evJoining)return; window.__evJoining=true;\n'
      + '    document.body.classList.remove(\'join-screen\');document.body.classList.add(\'vd-fixed\',\'role-screen\');\n'
      + '    try{setRoom(\'\');setHeaderContext(null);}catch(e){}\n'
      + '    menuWrap.innerHTML=\'<div style="min-height:60vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:12px;padding:24px;">\'\n'
      + '      +\'<div style="font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:rgba(255,255,255,0.45);">Taking your seat</div>\'\n'
      + '      +\'<div id="evJoinName" style="font-family:Cinzel,serif;font-size:30px;letter-spacing:0.06em;"></div>\'\n'
      + '      +\'<input id="ni" type="hidden"><div id="em" style="color:#e0524f;font-size:15px;"></div><button id="jb" style="display:none"></button></div>\';\n'
      + '    document.getElementById(\'evJoinName\').textContent=EV.joinName();\n'
      + '    document.getElementById(\'ni\').value=EV.joinName();\n'
      + '    Promise.resolve(handleJoin()).then(function(){\n'
      + '      var em=document.getElementById(\'em\');\n'
      + '      if(em&&em.textContent){ window.__evJoining=false; em.insertAdjacentHTML(\'afterend\',\'<a href="\'+EV.hub()+\'" style="color:#d4a8f5;margin-top:8px;">Back to the cast page</a>\'); }\n'
      + '    },function(){ window.__evJoining=false; });\n'
      + '    return;\n'
      + '  }\n'
      + '  if(!currentGame&&gameId&&!_cvPre)cvPreloadRoom();',
    applied: 'VESSELS EVENTS: join as this cast member, by exact name'
  });

  // The stage phone's footer (name badge, crest that opens Stats | Ledger |
  // Log) goes entirely (owner 2026-09-05: "remove the ledger ... clear out the
  // footer entirely"). Prod already hides it per mode with the same rule
  // (body.ls-noir), so this is CSS, unconditional in the event build.
  PLAYER.push({
    name: 'player:no-footer',
    find: '  body.vote-screen #vd-footer{display:none;}',
    replace: '  body.vote-screen #vd-footer{display:none;}\n'
      + '  #vd-footer{display:none!important;} /* EVENT MODE: no footer on the stage phone (owner 2026-09-05) */',
    applied: 'EVENT MODE: no footer on the stage phone'
  });

  // ===========================================================================
  // index.html
  //
  // The show is the Vessels game only (owner 2026-09-02). The other games are
  // wrapped in an inert <template> rather than deleted: the menu's keyboard /
  // gamepad walk collects .menu-item.menu-game from the live DOM, and a template's
  // contents are not in it. Two anchors, one either side of the block; the
  // Gridlock line carries an em-dash that latin1 decoding would mangle, so the
  // anchors avoid it.
  // ===========================================================================
  const INDEX = [
    {
      name: 'index:hide-other-games-open',
      find: '    <button class="menu-item menu-game mode-ss" data-desc="The ship is going down',
      replace: '    <template data-vl-removed="Vessels Live is the Vessels game only">\n'
        + '    <button class="menu-item menu-game mode-ss vl-removed" data-desc="The ship is going down',
      applied: '<template data-vl-removed="Vessels Live is the Vessels game only">'
    },
    {
      name: 'index:hide-other-games-close',
      find: 'campaign to be the Ultimate Lesser Evil.</span></button>\n',
      replace: 'campaign to be the Ultimate Lesser Evil.</span></button><!-- /vl-removed -->\n    </template>\n',
      applied: '</span></button><!-- /vl-removed -->\n    </template>\n'
    }
  ];


  // ===========================================================================
  // lesser-evil-host.js - the shared driver (TV and headless phone both install it).
  //
  // Lesser Evil already routes the crowd through ONE audienceTally action into
  // the same tally sites the players use, so making the audience the sole judge
  // is subtraction: stop the players voting and the crowd's counts are the whole
  // tally. What DOES need changing is the pacing - stock LE closes a ballot on a
  // 30s deadline or when every eligible player is in, and in event mode nobody
  // is in, so that condition fires the instant the ballot opens.
  // ===========================================================================
  const LE_HOST = [
    {
      name: 'le:event-poll',
      find: '  function tick(){\n    if (!isHolder()) return;',
      replace: '  function tick(){\n'
        + '    if (!isHolder()) return;\n'
        + '    try{ vlLeEventPoll(); }catch(e){}\n',
      applied: 'try{ vlLeEventPoll(); }catch(e){}'
    },
    {
      // The narrator is the only clock. Stock LE closes on the 30s cap or when
      // every eligible player has voted; in event mode NOBODY votes, so `roomIn`
      // is vacuously true and the ballot would slam shut before the crowd saw it.
      // The narrator's close_vote is the only close.
      name: 'le:narrator-closes',
      find: '  function ballotShouldClose(now, deadline, roomIn, eligCount, aud){\n'
          + '    if (deadline && now >= deadline) return true;             // the 30s cap always closes it',
      replace: '  function ballotShouldClose(now, deadline, roomIn, eligCount, aud){\n'
        + '    // EVENT MODE: the narrator is the only clock (owner rule for the whole\n'
        + '    // show). Both stock conditions are wrong here - the 30s cap because there\n'
        + '    // is no deliberation timer, and "every eligible player is in" because in\n'
        + '    // event mode nobody votes at all, making it vacuously TRUE the instant the\n'
        + '    // ballot opens.\n'
        + '    if (typeof window !== "undefined" && window.__VL_EVENT && window.__VL_EVENT.on) {\n'
        + '      return !!(window.__VL_EVENT.leCloseKey && window.__VL_EVENT.leCloseKey === window.__VL_EVENT.leOpenKey);\n'
        + '    }\n'
        + '    if (deadline && now >= deadline) return true;             // the 30s cap always closes it',
      applied: 'EVENT MODE: the narrator is the only clock (owner rule'
    },
    {
      // Stamp reveal_at and the resolved result so every phone and the screen
      // flip together, and let a narrator hand count REPLACE the harvest.
      name: 'le:reveal-and-override',
      find: '      if (res && res.voters > 0) {\n'
          + '        leWrite(\'audienceTally\', s => LE_ENGINE.applyAction(s, {\n'
          + '          type: \'audienceTally\', counts: res.counts, voters: res.voters\n'
          + '        }, undefined, leOpts()));\n'
          + '      }\n'
          + '      return run();',
      replace: '      const _vlEv = (typeof window !== "undefined" && window.__VL_EVENT && window.__VL_EVENT.on) ? window.__VL_EVENT : null;\n'
        + '      if (_vlEv) {\n'
        + '        // EVENT MODE. A narrator hand count REPLACES the harvest - never adds,\n'
        + '        // or a partial harvest plus a hand count double-counts everyone who got\n'
        + '        // their vote in before the network died. Both routes go through the same\n'
        + '        // VLB.resolve(), so nothing downstream can tell them apart.\n'
        + '        const _keys = (((audBallotRow(le) || {}).options) || []).map(function(o){ return o.id; });\n'
        + '        const _rows = [];\n'
        + '        if (res && res.counts) Object.keys(res.counts).forEach(function(k){\n'
        + '          for (var i = 0; i < res.counts[k]; i++) _rows.push({ voter_uid: k + \':\' + i, choice: [k] });\n'
        + '        });\n'
        + '        const _r = window.VLB.resolve({ rows: _rows, keys: _keys, override: _vlEv.override || null });\n'
        + '        _vlEv.lastResult = _r;\n'
        + '        try {\n'
        // Vessels Events (2026-10-26): Vessels Live's patch built this query and never sent it (a supabase-js
        // query runs only when awaited or then'd), so le_ballot never got its result or reveal time.
        + '          sb.from(\'le_ballot\').update({\n'
        + '            open: false, reveal_at: new Date(Date.now() + 4000).toISOString(),\n'
        + '            result: _r, updated_at: new Date().toISOString()\n'
        + '          }).eq(\'game_id\', gameId).then(function(){}, function(){});\n'
        + '        } catch (e) {}\n'
        + '        const _tot = Object.keys(_r.counts).reduce(function(n,k){ return n + _r.counts[k]; }, 0);\n'
        + '        if (_tot > 0) {\n'
        + '          leWrite(\'audienceTally\', s => LE_ENGINE.applyAction(s, {\n'
        + '            type: \'audienceTally\', counts: _r.counts, voters: _r.voters\n'
        + '          }, undefined, leOpts()));\n'
        + '        }\n'
        + '        return new Promise(function(rs){ setTimeout(function(){ rs(run()); }, 4400); });\n'
        + '      }\n'
        + '      if (res && res.voters > 0) {\n'
        + '        leWrite(\'audienceTally\', s => LE_ENGINE.applyAction(s, {\n'
        + '          type: \'audienceTally\', counts: res.counts, voters: res.voters\n'
        + '        }, undefined, leOpts()));\n'
        + '      }\n'
        + '      return run();',
      applied: 'EVENT MODE. A narrator hand count REPLACES the harvest'
    },
    {
      // The poll itself. Lives beside the audience constants so it shares scope
      // with sb and gameId, which the module captures at install().
      name: 'le:event-runtime',
      find: '  const AUD_MAX_ROWS = 20000;',
      replace: '  // ===== VESSELS LIVE - event runtime =====================================\n'
        + '  // Reads the narrator\'s commands off event_control. Rate-limited to 1.5s and\n'
        + '  // driven from tick() (900ms pump) rather than its own interval, because the\n'
        + '  // module captures sb and gameId at install() and an interval started at\n'
        + '  // module scope would close over the wrong ones.\n'
        + '  let _vlLeAt = 0, _vlLeBusy = false;\n'
        + '  function vlLeEventPoll(){\n'
        + '    if (typeof window === "undefined" || !sb || !gameId || _vlLeBusy) return;\n'
        + '    const now = Date.now(); if (now - _vlLeAt < 1500) return;\n'
        + '    _vlLeAt = now; _vlLeBusy = true;\n'
        + '    window.__VL_EVENT = window.__VL_EVENT || { on:false };\n'
        + '    sb.from(\'event_control\').select(\'*\').eq(\'game_id\', gameId).limit(1).then(function(r){\n'
        + '      _vlLeBusy = false;\n'
        + '      const ctl = (r && r.data && r.data[0]) || null;\n'
        + '      const E = window.__VL_EVENT;\n'
        + '      if (!ctl) { E.on = false; return; }\n'
        + '      E.on = !!ctl.event_mode; E.override = ctl.override || null; E.ctl = ctl;\n'
        + '      // The close is keyed to the ballot that is currently OPEN, so a close\n'
        + '      // from an earlier round can never shut the next one the moment it opens.\n'
        + '      try { E.leOpenKey = stageKeyOf(G.le); } catch (e) { E.leOpenKey = null; }\n'
        + '      if (ctl.cmd === \'close_vote\') E.leCloseKey = E.leOpenKey;\n'
        + '    }, function(){ _vlLeBusy = false; });\n'
        + '  }\n'
        + '  // ===== end event runtime ================================================\n'
        + '  const AUD_MAX_ROWS = 20000;',
      applied: 'VESSELS LIVE - event runtime ====='
    }
  ];

  // ===========================================================================
  // lesser-evil-player.html - the stage phone during Lesser Evil.
  // ===========================================================================
  // The runtime and the hold screen are defined immediately above renderBallot
  // rather than at some other anchor: function declarations hoist within the
  // scope, so one patch keeps the whole change in one readable place.
  const LE_PLAYER = [
    {
      name: 'le-player:dark-hold',
      find: 'function renderBallot(le, myId, ctx){',
      replace: '// ===== VESSELS LIVE - stage phone (Lesser Evil) ==========================\n'
        + 'var _vlLeP = { at:0, busy:false };\n'
        + 'function vlLePlayerPoll(){\n'
        + '  if(!window.sb || !window.gameId || _vlLeP.busy) return;\n'
        + '  var now = Date.now(); if(now - _vlLeP.at < 2000) return;\n'
        + '  _vlLeP.at = now; _vlLeP.busy = true;\n'
        + '  window.__VL_EVENT = window.__VL_EVENT || { on:false };\n'
        + '  window.sb.from(\'event_control\').select(\'event_mode\').eq(\'game_id\', window.gameId).limit(1)\n'
        + '    .then(function(r){ _vlLeP.busy=false;\n'
        + '      var c=(r&&r.data&&r.data[0])||null; window.__VL_EVENT.on = !!(c&&c.event_mode); },\n'
        + '      function(){ _vlLeP.busy=false; });\n'
        + '}\n'
        + 'setInterval(vlLePlayerPoll, 2000);\n'
        + '// The hold. No tally (bandwagon), no timer (pressure), no input (they are\n'
        + '// not voting). Rendered through the page\'s own ballot-wait screen so it\n'
        + '// inherits the existing layout rather than inventing a second one.\n'
        + 'function vlLeRenderHold(le, myId, ctx){\n'
        + '  try{\n'
        + '    var host = document.getElementById(\'app\') || document.body;\n'
        + '    host.innerHTML = \'<div style="min-height:70vh;display:flex;flex-direction:column;\'\n'
        + '      + \'align-items:center;justify-content:center;text-align:center;padding:24px;\'\n'
        + '      + \'font:600 20px system-ui,-apple-system,sans-serif;color:#f2f2f7">\'\n'
        + '      + \'<div style="font-size:26px;font-weight:800">THE AUDIENCE IS DECIDING</div>\'\n'
        + '      + \'<div style="margin-top:10px;color:#8a8a9a;font-size:16px">Look up.</div></div>\';\n'
        + '  }catch(e){}\n'
        + '}\n'
        + '// ===== end stage phone ==================================================\n'
        + 'function renderBallot(le, myId, ctx){\n'
        + '  // EVENT MODE: the audience is the sole judging body. Stage players argue\n'
        + '  // and are judged; they do not cast ballots.\n'
        + '  if(window.__VL_EVENT && window.__VL_EVENT.on) return vlLeRenderHold(le, myId, ctx);',
      applied: 'VESSELS LIVE - stage phone (Lesser Evil)'
    }
  ];


  // ===========================================================================
  // lesser-evil-engine.js
  //
  // Found by le-audience-only.test.mjs, not by reading the code: the ENGINE
  // refuses to close a ballot until every eligible player has voted or the
  // shared clock has expired. In event mode nine of twelve are eligible, none of
  // them vote, and there is no clock because the narrator is the clock - so
  // endDebate returns null forever and the Lesser Evil ballot can NEVER close.
  //
  // Suppressing the host-side close condition was not enough; this guard sits
  // underneath it. Without this patch the show would deadlock on the first
  // Lesser Evil ballot, in front of the audience, with no error anywhere.
  // ===========================================================================
  const LE_ENGINE_P = [
    {
      name: 'le-engine:event-close',
      find: '      if (_elig.length > 0 && !_allIn && !_expired) return null;',
      replace: '      // EVENT MODE: stage players cast no ballots, so _allIn can never become\n'
        + '      // true, and there is no deadline because the narrator is the clock. The\n'
        + '      // narrator\'s close IS the legitimate close here - the host only calls\n'
        + '      // endDebate once VLE.ballotShouldClose has agreed.\n'
        + '      const _vlEvent = (typeof window !== \'undefined\' && window.__VL_EVENT && window.__VL_EVENT.on);\n'
        + '      if (!_vlEvent && _elig.length > 0 && !_allIn && !_expired) return null;',
      applied: 'EVENT MODE: stage players cast no ballots, so _allIn can never become'
    }
  ];

  // ===========================================================================
  // VESSELS EVENTS (2026-10-26): Lesser Evil, the same cast rules as Vessels.
  // ===========================================================================
  const LE_TV_EV = [
    {
      // The TV runs on the operator's laptop: the join QR names the event site's /cast, never 127.0.0.1.
      name: 'le-tv:qr-join',
      find: "function joinUrl(){\n  const o = (location.origin && location.origin.indexOf('http') === 0) ? location.origin : 'https://playvessels.com';\n  return o + '/lesser-evil-player.html?join=' + encodeURIComponent(gameId || '');\n}",
      replace: "function joinUrl(){\n  // VESSELS EVENTS: the cast join through /cast on the event site\n  return ((window.VL_CONFIG && window.VL_CONFIG.site) || 'https://vessels-events.netlify.app') + '/cast?room=' + encodeURIComponent(gameId || '');\n}",
      applied: 'VESSELS EVENTS: the cast join through /cast on the event site'
    }
  ];
  LE_PLAYER.push(
    {
      name: 'le-player:cast-gate',
      find: "let code = qp.get('join') || qp.get('game') || '';",
      replace: "let code = qp.get('join') || qp.get('game') || '';\n"
        + "if (window.EV) { EV.gate(code); EV.follow(code, 'le'); } // VESSELS EVENTS: cast only, and follow the show",
      applied: 'VESSELS EVENTS: cast only, and follow the show'
    },
    {
      // Join as this cast member, as a racer (the cast are the candidates; the audience judges).
      name: 'le-player:auto-join',
      find: 'function renderJoinScreen(err){\n',
      replace: 'function renderJoinScreen(err){\n'
        + '  // VESSELS EVENTS: join as this cast member, a racer, by exact name (no typing, no role choice).\n'
        + '  if (window.EV && EV.joinName() && !err && !window.__evJoining) { window.__evJoining = true; _joinRole = \'run\'; doJoin(EV.joinName()); return; }\n',
      applied: 'VESSELS EVENTS: join as this cast member, a racer'
    },
    {
      // Prod Lesser Evil gives a seat back only to the phone that took it (its saved id). At a show a cast member
      // may be on a new phone mid-race: their exact name reclaims the seat, as it already does in Vessels.
      name: 'le-player:reclaim-by-name',
      find: '    const le = game.le;\n',
      replace: '    const le = game.le;\n'
        + '    // VESSELS EVENTS: the cast member\'s exact name reclaims their seat, mid-race too.\n'
        + '    if (window.EV && EV.joinName() === name) {\n'
        + '      const { data: _evMine } = await sb.from(\'players\').select(\'id\').eq(\'game_id\', code).eq(\'name\', name);\n'
        + '      if (_evMine && _evMine[0]) {\n'
        + '        try { localStorage.setItem(leUidKey(code), _evMine[0].id); } catch (e) {}\n'
        + '        myId = _evMine[0].id;\n'
        + '        try { history.replaceState(null, \'\', location.pathname + \'?game=\' + encodeURIComponent(code)); } catch (e) {}\n'
        + '        await startLive(); return;\n'
        + '      }\n'
        + '    }\n',
      applied: 'VESSELS EVENTS: the cast member\'s exact name reclaims their seat, mid-race too.'
    }
  );

  // ===========================================================================
  // VESSELS EVENTS (2026-10-26, Josh): the Lesser Evil winner picks their Vessels role. Their phone showed them
  // this deal's roles (Demon allowed, never the Final Girl, who isn't dealt) and they locked one in; the launcher
  // hands it to this room as event_control.role_pick. At the deal, the pick is seated and whoever drew that role
  // takes the winner's instead, so the rest of the deal is exactly as random as before. The launcher clears the
  // pick once this deal is done: a replay deals at random (the prize is for the first game).
  // ===========================================================================
  TV.push({
    name: 'tv:role-pick',
    find: '  const _dealWrite=async()=>{',
    replace: '  // VESSELS EVENTS: the Lesser Evil winner\'s prize, their own pick of role (see event-patches.js tv:role-pick)\n'
      + '  try{\n'
      + '    const _ev=window.__VL_EVENT, _pk=_ev&&_ev.on&&_ev.ctl&&_ev.ctl.role_pick;\n'
      + '    if(_pk&&_pk.name&&_pk.role){\n'
      + '      const _me=players.find(p=>!p.is_bot&&String(p.name||\'\').trim().toLowerCase()===String(_pk.name).trim().toLowerCase());\n'
      + '      const _had=Object.keys(roles).find(pid=>roles[pid]===_pk.role);\n'
      + '      if(_me&&_had&&_had!==String(_me.id)){ const _mine=roles[_me.id]; roles[_me.id]=_pk.role; roles[_had]=_mine; }\n'
      + '      if(_me&&roles[_me.id]===\'host-demon\')_lastDemonId=String(_me.id);\n'
      + '      _ev.rolePickDealt={name:_pk.name,role:_pk.role,ok:!!(_me&&roles[_me.id]===_pk.role)};\n'
      + '    }\n'
      + '  }catch(e){}\n'
      + '  const _dealWrite=async()=>{',
    applied: 'VESSELS EVENTS: the Lesser Evil winner\'s prize, their own pick of role'
  });

  // ===========================================================================
  // VESSELS EVENTS (2026-10-26, Josh): no Scholar on event nights. The Scholar's power is a second vote, and at an
  // event the cast doesn't vote (the audience does), so a Scholar would hold a role with nothing to do. Off in the
  // deal (from 10 players), in the TV's lobby legend, and in the phone's own list of the roles in play. The event
  // site only ever runs event nights, so this is a build-time switch, not a runtime one (the lobby paints before
  // the first event_control poll lands).
  // ===========================================================================
  const NO_SCHOLAR = 'VESSELS EVENTS: no Scholar at events (their power is a second vote; the cast doesn\'t vote)';
  TV.push({
    name: 'tv:no-scholar-deal',
    find: "  if(n>=10 && optBool('role_sage',true))    out.push('sage');",
    replace: '  // ' + NO_SCHOLAR,
    applied: '  // ' + NO_SCHOLAR
  }, {
    name: 'tv:no-scholar-legend',
    find: "  if(count>=10&&optBool('role_sage',true))legend.push([T('sage_name'),T('sage_color')]);",
    replace: '  // ' + NO_SCHOLAR + ' (lobby legend)',
    applied: NO_SCHOLAR + ' (lobby legend)'
  });
  PLAYER.push({
    name: 'player:no-scholar',
    find: "    if(n>=10 && optBool('role_sage',true))out.push('sage');",
    replace: '    // ' + NO_SCHOLAR,
    applied: '    // ' + NO_SCHOLAR
  });

  // Vessels Events builds no index.html (the launcher opens the TVs directly), so INDEX is not exported.
  void INDEX;
  root.VL_PATCHES = { 'tv.html': TV, 'player.html': PLAYER,
                      'lesser-evil-tv.html': LE_TV_EV,
                      'lesser-evil-engine.js': LE_ENGINE_P,
                      'lesser-evil-host.js': LE_HOST,
                      'lesser-evil-player.html': LE_PLAYER };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.VL_PATCHES;
})(typeof globalThis !== 'undefined' ? globalThis : this);
