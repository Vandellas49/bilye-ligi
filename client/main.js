/* ---------- istemci girişi ----------
   Üç oyun biçimi:
   - tek maç: simülasyon tarayıcıda çalışır (bota karşı ya da aynı klavyede iki kişi)
   - turnuva: tek kişilik eleme tablosu; senin maçların tarayıcıda, diğerleri ekransız simüle edilir
   - çevrimiçi: maç sunucuda çalışır; bu istemci girdisini gönderir, gelen anlık görüntüleri çizer */
import { TICK } from '../shared/constants.js';
import { randomSeed } from '../shared/rng.js';
import { createMatch, step, NEUTRAL_INPUT } from '../shared/sim.js';
import { createTournament, nextMatch, recordResult, simulateMatch, roundDiff, roundName, alive } from '../shared/tournament.js';
import { ensureAudio, setSoundActive, toggleMute, sfx } from './audio.js';
import { initInput, readInput, clearKeys } from './input.js';
import { fx, resetFx, applyEvents, afterStep, buildAmbient } from './effects.js';
import { initRender, resize, renderBg, render } from './render.js';
import { net, connect, disconnect, send, setName, sendInput, createNetMatch, pushSnap, updateNetMatch, flushNetMatch } from './net.js';
import { $, initMenu, readCfg, readCreate, saveCfg, showOverlay, currentOverlay, updateHud, setPlaying, showEnd,
  updateTouchCooldowns, bracketHtml, renderRooms, renderLobby, passAssist } from './ui.js';

/* istemci durumu
   mode: 'menu' (arkada demo maç), 'match', 'end'
   state: çizilen maç durumu (yerel maçta shared/sim.js durumu, çevrimiçide sunucudan gelen görünüm)
   online: çizilen maç sunucudan geliyor; netM: o maçın anlık görüntü tamponu
   menuOpen: çevrimiçi maçta Esc menüsü açık (maç durmaz)
   tour: tek kişilik turnuva { T, me }; tourMatch: oynanan turnuva maçı
   room: içinde bulunulan çevrimiçi oda */
const G = { mode: 'menu', paused: false, cfg: null, state: null, online: false, netM: null, menuOpen: false, lastT: -1,
  tour: null, tourMatch: null, room: null };

const saved = initMenu();

function setMode(mode){
  G.mode = mode;
  setSoundActive(mode === 'match' || mode === 'end');
}

/* ---------- yerel maç ---------- */
// extra: { teamNames } turnuva maçı için
function startMatch(cfg, extra = {}){
  if (!extra.teamNames) G.cfg = cfg;
  const humans = cfg.opp === 'friend'
    ? [{team:0, ctrl:'h1', name:'1P'}, {team:1, ctrl:'h2', name:'2P'}]
    : [{team:0, ctrl:'h1', name:'Sen'}];
  const weather = cfg.weather || 'kar';
  G.state = createMatch({
    size: +cfg.size, humans, diff: +cfg.diff, arena: cfg.arena, weather,
    minutes: +cfg.time, specials: true, seed: randomSeed(), teamNames: extra.teamNames,
  });
  G.online = false; G.netM = null;
  resetFx(); buildAmbient(weather);
  document.body.classList.remove('nospecial');
  setMode('match'); G.paused = false; G.menuOpen = false;
  renderBg(G.state);
  showOverlay(null);
  setPlaying(true);
  updateHud(G.state);
  ensureAudio(); sfx.whistle();
}

function startDemo(){
  setMode('menu');
  G.online = false; G.netM = null; G.paused = false; G.menuOpen = false; G.tourMatch = null;
  const weather = (G.cfg && G.cfg.weather) || (saved && saved.weather) || 'kar';
  G.state = createMatch({ size: 2, humans: [], diff: 2, arena: 'r', weather, minutes: 0, specials: true, seed: randomSeed(), kickoffTeam: 0 });
  resetFx(); buildAmbient(weather);
  renderBg(G.state);
  setPlaying(false);
}

function endMatch(){
  setMode('end');
  if (G.tourMatch) return endTourMatch();
  showEnd(G.state, { friend: G.cfg.opp === 'friend', myTeam: 0 });
}

function togglePause(){
  if (G.mode !== 'match') return;
  if (G.online){
    // çevrimiçi maç durdurulamaz: yalnızca menü açılır
    G.menuOpen = !G.menuOpen;
    $('pauseTitle').textContent = 'Menü'; $('pauseText').textContent = 'Maç arkada devam ediyor.';
    $('quitBtn').textContent = 'Odadan çık';
    showOverlay(G.menuOpen ? 'pauseOv' : null);
    $('touch').classList.toggle('on', !G.menuOpen && G.state.players.some(p => p.mine));
  } else {
    G.paused = !G.paused;
    $('pauseTitle').textContent = 'Mola'; $('pauseText').textContent = 'Maç durduruldu.';
    $('quitBtn').textContent = G.tourMatch ? 'Turnuvadan çekil' : 'Menüye dön';
    showOverlay(G.paused ? 'pauseOv' : null);
    $('touch').classList.toggle('on', !G.paused);
  }
  clearKeys();
}

/* ---------- tek kişilik turnuva ---------- */
function startTournament(cfg){
  G.cfg = cfg;
  const T = createTournament({ size: +cfg.tsize, seed: randomSeed() });
  G.tour = { T, me: 0 };
  showTour('Turnuva', `${T.size} takım, eleme usulü. Takımın: ${T.teams[0].name}. Rakipler her turda zorlaşır.`);
}

function showTour(title, text){
  const { T, me } = G.tour, nm = nextMatch(T), stillIn = alive(T, me);
  $('tourTitle').textContent = title; $('tourText').textContent = text;
  const myNext = nm && (nm.a === me || nm.b === me);
  $('tourBracket').innerHTML = bracketHtml(T, { me, current: myNext ? nm : null });
  const btn = $('tourNext');
  btn.disabled = false;
  btn.hidden = T.champion !== null;
  btn.textContent = stillIn ? `${roundName(T, myNextRound(T, me))} maçına çık` : 'Kalan maçları oynat';
  $('tourQuit').textContent = T.champion !== null ? 'Menüye dön' : 'Turnuvadan çık';
  showOverlay('tourOv');
}
// oyuncunun oynayacağı ilk tur (henüz rakibi belli olmasa da)
function myNextRound(T, me){
  for (let r = 0; r < T.rounds.length; r++) if (T.rounds[r].some(m => m.winner === null && (m.a === me || m.b === me || m.a === null || m.b === null))) return r;
  return T.rounds.length - 1;
}

const frameWait = () => new Promise(r => setTimeout(r, 0));
async function tourNext(){
  const { T, me } = G.tour, cfg = G.cfg;
  const btn = $('tourNext');
  btn.disabled = true; $('tourText').textContent = 'Diğer maçlar oynanıyor…';
  let nm;
  // senin maçına kadar (elendiysen sonuna kadar) bot maçlarını ekransız oyna
  while ((nm = nextMatch(T)) && nm.a !== me && nm.b !== me){
    await frameWait();
    if (!G.tour) return;
    const r = simulateMatch({ size: +cfg.size, diff: roundDiff(T, nm.round), minutes: +cfg.time, seed: randomSeed() });
    recordResult(T, nm.round, nm.index, r.sa, r.sb, r.pen);
    $('tourBracket').innerHTML = bracketHtml(T, { me });
  }
  if (!nm){
    const champ = T.teams[T.champion].name;
    showTour(T.champion === me ? 'Şampiyon oldun!' : 'Turnuva bitti', `Şampiyon: ${champ}.`);
    return;
  }
  const opp = nm.a === me ? nm.b : nm.a;
  G.tourMatch = nm;
  startMatch({ ...cfg, opp: 'cpu', diff: roundDiff(T, nm.round) }, { teamNames: [T.teams[me].name, T.teams[opp].name] });
}

function endTourMatch(){
  const nm = G.tourMatch, { T, me } = G.tour;
  G.tourMatch = null;
  const [mine, theirs] = G.state.score, meA = nm.a === me;
  recordResult(T, nm.round, nm.index, meA ? mine : theirs, meA ? theirs : mine);
  $('pauseBtn').hidden = true; $('touch').classList.remove('on');
  updateHud(G.state);
  const names = G.state.teamNames, score = `${names[0]} ${mine} – ${theirs} ${names[1]}.`;
  if (T.champion === me) showTour('Şampiyon oldun!', `${score} Kupa senin!`);
  else if (T.champion !== null) showTour('Finalde kaybettin', `${score} İkinci oldun. Şampiyon: ${T.teams[T.champion].name}.`);
  else if (mine > theirs) showTour('Kazandın!', `${score} Sıradaki tur: ${roundName(T, nm.round + 1)}.`);
  else showTour('Elendin', `${score} İstersen kalan maçları oynatıp şampiyonu görebilirsin.`);
}

/* ---------- çevrimiçi ---------- */
const STATUS = {
  connecting: 'Sunucuya bağlanılıyor…',
  reconnecting: 'Bağlantı koptu, yeniden bağlanılıyor…',
  failed: 'Sunucuya bağlanılamadı. Oyunu “npm start” ile başlatılan sunucudan açtığından emin ol.',
  off: '',
};
net.handlers.status = s => {
  $('netStatus').textContent = s === 'on'
    ? `Bağlandın: ${net.me.name}${net.slow ? ' · Ağın WebSocket’e izin vermiyor, yedek bağlantı kullanılıyor (gecikme olabilir).' : ''}`
    : STATUS[s];
  if (s === 'reconnecting' && G.room) $('lobbyStatus').textContent = STATUS.reconnecting;
};
net.handlers.welcome = () => { $('netName').value = net.me.name; };
net.handlers.rooms = m => renderRooms(m.rooms, (roomId, password) => send('joinRoom', { roomId, password }));
net.handlers.error = m => {
  const el = currentOverlay() === 'lobbyOv' ? $('lobbyStatus') : $('netStatus');
  el.textContent = m.message;
};
net.handlers.roomState = m => {
  G.room = m.room; G.room.at = performance.now();
  drawLobby();
  const ov = currentOverlay();
  // maç ya da maç sonu ekranı açıkken lobiye atlama
  if (ov === 'onlineOv' || (ov === null && G.mode !== 'match')) showOverlay('lobbyOv');
};
net.handlers.left = () => { G.room = null; showOverlay('onlineOv'); send('listRooms'); };
net.handlers.matchStart = m => {
  G.netM = createNetMatch(m, net.me.id);
  G.state = G.netM.view; G.online = true; G.menuOpen = false; G.paused = false; G.lastT = -1;
  resetFx(); buildAmbient(m.info.weather);
  document.body.classList.toggle('nospecial', !m.info.specials);
  setMode('match');
  updateNetMatch(G.netM, performance.now());
  renderBg(G.state);
  showOverlay(null);
  setPlaying(true, G.state.players.some(p => p.mine));
  updateHud(G.state);
  ensureAudio(); sfx.whistle();
};
net.handlers.snap = m => { if (G.netM) pushSnap(G.netM, m.s, m.ev, performance.now()); };
net.handlers.matchEnd = () => {
  if (!G.netM) return;
  // çizim ~100 ms geriden geliyor: son görüntü ekrana gelince bitir
  setTimeout(() => {
    if (!G.netM) return;
    handleEvents(flushNetMatch(G.netM));
    setMode('end');
    const mine = G.state.players.find(p => p.mine);
    showEnd(G.state, { myTeam: mine ? mine.team : null, buttons: { again: '', menu: 'Lobiye dön' } });
  }, 150);
};

function drawLobby(){
  if (!G.room || !net.me) return;
  const room = { ...G.room, nextIn: G.room.nextIn - (performance.now() - G.room.at) };
  renderLobby(room, net.me.id, {
    onTeam: team => send('setTeam', { team }),
    onStart: () => send('start'),
    onDiff: diff => send('setSettings', { settings: { diff } }),
  });
}
// turnuvada maçlar arası geri sayım
setInterval(() => { if (G.room && G.room.phase === 'between' && currentOverlay() === 'lobbyOv') drawLobby(); }, 1000);

function backToLobby(){
  startDemo();
  if (G.room){ drawLobby(); showOverlay('lobbyOv'); }
  else showOverlay('onlineOv');
}

function openOnline(){
  showOverlay('onlineOv');
  $('netName').value = net.name;
  if (net.status === 'on') send('listRooms');
  else connect($('netName').value.trim() || 'Oyuncu');
}

/* ---------- girdi ve arayüz bağlantıları ---------- */
initInput({ onPause: togglePause, isPlaying: () => G.mode === 'match' && !G.paused && !G.menuOpen });
initRender($('cv'), $('stage'));

$('muteBtn').onclick = () => {
  const muted = toggleMute();
  $('muteBtn').textContent = muted ? '🔇' : '🔊'; $('muteBtn').setAttribute('aria-label', muted ? 'Sesi aç' : 'Sesi kapat');
};
$('startBtn').onclick = () => {
  const cfg = readCfg(); saveCfg(cfg);
  if (cfg.mode === 'tour') startTournament(cfg); else startMatch(cfg);
};
$('onlineBtn').onclick = openOnline;
$('pauseBtn').onclick = togglePause;
$('resumeBtn').onclick = togglePause;
$('quitBtn').onclick = () => {
  if (G.online){ send('leave'); G.room = null; startDemo(); showOverlay('onlineOv'); return; }
  G.tour = null; startDemo(); showOverlay('menu');
};
$('againBtn').onclick = () => startMatch(G.cfg);
$('menuBtn').onclick = () => {
  if (G.online || G.room) return backToLobby();
  startDemo(); showOverlay('menu');
};
$('tourNext').onclick = tourNext;
$('tourQuit').onclick = () => { G.tour = null; startDemo(); showOverlay('menu'); };

$('netName').addEventListener('change', () => {
  const n = $('netName').value.trim();
  if (!n) return;
  setName(n);
  if (net.me){ net.me.name = n; $('netStatus').textContent = `Bağlandın: ${n}`; }
});
$('refreshRooms').onclick = () => { if (net.status === 'on') send('listRooms'); else connect(); };
$('createBtn').onclick = () => { send('createRoom', readCreate()); $('createBox').open = false; };
$('netBack').onclick = () => { if (G.room) send('leave'); disconnect(); G.room = null; showOverlay('menu'); };
$('lobbyLeave').onclick = () => send('leave');
document.addEventListener('visibilitychange', () => { if (document.hidden && G.mode === 'match' && !G.paused && !G.online) togglePause(); });

/* ---------- döngü ---------- */
function handleEvents(events){
  applyEvents(events);
  for (const e of events){
    if (e.type === 'goal') updateHud(G.state);
    else if (e.type === 'end' && !G.online) endMatch();
  }
}

function tick(){
  const S = G.state, inputs = {};
  const friend = !!(G.cfg && G.cfg.opp === 'friend');
  const assist = passAssist();
  for (const p of S.players) if (p.ctrl !== 'ai') inputs[p.id] = { ...readInput(p.ctrl, friend), assist };
  const events = step(S, inputs);
  handleEvents(events);
  afterStep(S);
}

function netFrame(now){
  const due = updateNetMatch(G.netM, now);
  if (due.length) handleEvents(due);
  if (G.state.t !== G.lastT){ G.lastT = G.state.t; afterStep(G.state); }
  if (G.state.players.some(p => p.mine)) sendInput(G.menuOpen ? NEUTRAL_INPUT : { ...readInput('h1', false), assist: passAssist() }, now);
  G.netInfo = `ping ${net.ping ? Math.round(net.ping) + ' ms' : '…'} · ${net.slow ? 'yedek bağlantı' : 'WebSocket'} · gecikme ${Math.round(G.netM.delay*TICK)} ms`;
}

let last = performance.now(), acc = 0, hudTick = 0;
function frame(now){
  let dt = now - last; last = now;
  if (dt > 250) dt = 250;
  if (G.online){
    if (G.mode === 'match' && G.netM) netFrame(now);
  } else if (!G.paused && G.mode !== 'end'){
    acc += dt;
    while (acc >= TICK){ tick(); acc -= TICK; if (G.mode === 'end') { acc = 0; break; } }
  } else acc = 0;
  if (G.mode === 'match'){
    if (++hudTick % 10 === 0) updateHud(G.state);
    updateTouchCooldowns(G.state);
  }
  render(G.state, G);
  requestAnimationFrame(frame);
}

// test için: index.html?debug ile açılırsa durum pencereden okunabilir (window.__S, window.__G)
if (new URLSearchParams(location.search).has('debug')){
  window.__G = G; window.__fx = fx; window.__net = net;
  Object.defineProperty(window, '__S', { get: () => G.state, configurable: true });
}

new ResizeObserver(resize).observe($('stage'));
addEventListener('resize', resize);
startDemo();
resize();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => render(G.state, G));
requestAnimationFrame(frame);
