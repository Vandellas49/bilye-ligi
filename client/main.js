/* ---------- istemci girişi ----------
   Üç oyun biçimi:
   - tek maç: simülasyon tarayıcıda çalışır (bota karşı ya da aynı klavyede iki kişi)
   - turnuva: tek kişilik eleme tablosu; senin maçların tarayıcıda, diğerleri ekransız simüle edilir
   - çevrimiçi: maç sunucuda çalışır; bu istemci girdisini gönderir, gelen anlık görüntüleri çizer */
import { TICK, W, H } from '../shared/constants.js';
import { randomSeed } from '../shared/rng.js';
import { createMatch, step, NEUTRAL_INPUT } from '../shared/sim.js';
import { createTournament, nextMatch, recordResult, simulateMatch, roundDiff, roundName, alive } from '../shared/tournament.js';
import { ensureAudio, setSoundActive, toggleMute, sfx } from './audio.js';
import { initInput, readInput, clearKeys } from './input.js';
import { fx, resetFx, applyEvents, afterStep, buildAmbient } from './effects.js';
import { initRender, resize, renderBg, render, setView3D, viewInfo, setFallbackHandler, drawLookPreview } from './render.js';
import { net, connect, disconnect, send, setName, sendInput, createNetMatch, pushSnap, updateNetMatch, flushNetMatch } from './net.js';
import { $, initMenu, initLookEditor, loadLook, readCfg, readCreate, saveCfg, loadCfg, showOverlay, currentOverlay, updateHud, setPlaying, showEnd,
  updateTouchCooldowns, bracketHtml, renderRooms, renderLobby, passAssist, want3D, keyLayout } from './ui.js';

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
// "Oyuncum": önizleme, çevrimiçi sunucuya bildirim (sonraki maçta geçerli)
initLookEditor(look => {
  drawLookPreview($('lookPrev'), look);
  net.look = look;
  if (net.status === 'on') send('setLook', { look });
});

function setMode(mode){
  G.mode = mode;
  setSoundActive(mode === 'match' || mode === 'end');
}

/* ---------- yerel maç ---------- */
// extra: { teamNames } turnuva maçı için
function startMatch(cfg, extra = {}){
  if (!extra.teamNames) G.cfg = cfg;
  const humans = [{team:0, ctrl:'h1', name:'Sen', look: loadLook()}];
  const weather = cfg.weather || 'kar';
  G.state = createMatch({
    size: +cfg.size, humans, diff: +cfg.diff, arena: cfg.arena, weather,
    minutes: +cfg.time, specials: true, seed: randomSeed(), teamNames: extra.teamNames,
    allowSwitch: true,   // yerel maçta Q/Tab ile bot takım arkadaşına geçilebilir
  });
  G.online = false; G.netM = null; prevPos.clear();
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
  G.online = false; G.netM = null; G.paused = false; G.menuOpen = false; G.tourMatch = null; prevPos.clear();
  const weather = (G.cfg && G.cfg.weather) || (saved && saved.weather) || 'kar';
  G.state = createMatch({ size: 2, humans: [], diff: 2, arena: 'r', weather, minutes: 0, specials: true, seed: randomSeed(), kickoffTeam: 0 });
  resetFx(); buildAmbient(weather);
  renderBg(G.state);
  setPlaying(false);
}

function endMatch(){
  setMode('end');
  if (G.tourMatch) return endTourMatch();
  showEnd(G.state, { myTeam: 0 });
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
  startMatch({ ...cfg, diff: roundDiff(T, nm.round) }, { teamNames: [T.teams[me].name, T.teams[opp].name] });
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
initRender($('cv'), $('stage'), $('cv3'));

// görünüm: 3B istenirse yüklenir, açılamazsa 2B'de kalınır ve menüde not gösterilir
const VIEW_NOTES = {
  software: 'Tarayıcın bu bilgisayarda ekran kartını kullanamıyor (3B işlemciyle çizilip çok yavaş kalıyor), bu yüzden 2B kullanılıyor.',
  slow: '3B bu bilgisayarda akıcı çalışmadı, 2B\'ye geçildi.',
  failed: '3B görünüm bu cihazda açılamadı, 2B kullanılıyor.',
};
// 3B kullanılamıyorsa menüde 2B'yi seç, kaydet ve nedenini yaz (3B'yi yeniden seçmek her zaman mümkün)
function viewFallback(reason){
  $('viewNote').textContent = VIEW_NOTES[reason]; $('viewNote').hidden = false;
  $('v2').checked = true;
  saveCfg({ ...(loadCfg() || {}), view: '2' });
  if (reason === 'slow' && G.state) fx.pops.push({ x: W/2, y: H/2 + 60, text: '3B yavaş, 2B\'ye geçildi', color: '#ffffff', life: 150, max: 150 });
}
setFallbackHandler(viewFallback);
async function applyView(){
  const st = await setView3D(want3D());
  if (VIEW_NOTES[st]) viewFallback(st); else $('viewNote').hidden = true;
  if (G.state) renderBg(G.state);
}
document.querySelectorAll('input[name="view"]').forEach(el => el.addEventListener('change', applyView));

$('muteBtn').onclick = () => {
  const muted = toggleMute();
  $('muteBtn').textContent = muted ? '🔇' : '🔊'; $('muteBtn').setAttribute('aria-label', muted ? 'Sesi aç' : 'Sesi kapat');
};
$('startBtn').onclick = () => {
  const cfg = readCfg(); saveCfg({ ...(loadCfg() || {}), ...cfg });   // menüde ayrıca kaydedilenler (görünüm) silinmesin
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

/* Çizim enterpolasyonu (yerel maç): fizik 60 Hz'te adım atar, ekran kareleri her zaman denk düşmez
   (bazı karede 2 adım, bazısında hiç). Her adımdan önce konumlar saklanır; çizimde iki adım arasındaki
   ara konum kullanılır, çizimden hemen sonra gerçek konumlar geri konur (simülasyon etkilenmez). */
const prevPos = new Map();   // nesne -> [x, y, z]
function savePrev(S){
  for (const p of S.players) prevPos.set(p, [p.x, p.y, 0]);
  prevPos.set(S.ball, [S.ball.x, S.ball.y, S.ball.z]);
}
function withLerp(S, alpha, fn){
  if (alpha >= 1 || !prevPos.size) return fn();
  const real = [];
  for (const o of [...S.players, S.ball]){
    const pv = prevPos.get(o);
    if (!pv) continue;
    // ışınlanmada (başlama vuruşu, gol sonrası) ara değer yok
    if (Math.abs(o.x - pv[0]) + Math.abs(o.y - pv[1]) > 60) continue;
    real.push([o, o.x, o.y, o.z]);
    o.x = pv[0] + (o.x - pv[0])*alpha; o.y = pv[1] + (o.y - pv[1])*alpha;
    if (o === S.ball) o.z = pv[2] + (o.z - pv[2])*alpha;
  }
  try { fn(); } finally { for (const [o, x, y, z] of real){ o.x = x; o.y = y; if (o === S.ball) o.z = z; } }
}

function tick(){
  const S = G.state, inputs = {};
  savePrev(S);
  const assist = passAssist(), layout = keyLayout();
  for (const p of S.players) if (p.ctrl !== 'ai') inputs[p.id] = { ...readInput(layout, { defending: !!S.owner && S.owner.team !== p.team }), assist };
  const events = step(S, inputs);
  handleEvents(events);
  afterStep(S);
}

function netFrame(now){
  const due = updateNetMatch(G.netM, now);
  if (due.length) handleEvents(due);
  if (G.state.t !== G.lastT){ G.lastT = G.state.t; afterStep(G.state); }
  const me = G.state.players.find(p => p.mine);
  if (me) sendInput(G.menuOpen ? NEUTRAL_INPUT : { ...readInput(keyLayout(), { defending: !!G.state.owner && G.state.owner.team !== me.team }), assist: passAssist() }, now);
  G.netInfo = `ping ${net.ping ? Math.round(net.ping) + ' ms' : '…'} · ${net.slow ? 'yedek bağlantı' : 'WebSocket'} · gecikme ${Math.round(G.netM.delay*TICK)} ms`;
}

let last = performance.now(), acc = 0, hudTick = 0;
/* Performans göstergesi (F2): kare hızı, en uzun kare, simülasyon ve çizim süresi (yarım saniyelik ortalama) */
const perf = { on: false, frames: 0, sim: 0, draw: 0, worst: 0, since: 0 };
addEventListener('keydown', e => { if (e.code === 'F2'){ e.preventDefault(); perf.on = !perf.on; $('perf').hidden = !perf.on; } });
function perfReport(now, dt, simMs, drawMs){
  perf.frames++; perf.sim += simMs; perf.draw += drawMs; perf.worst = Math.max(perf.worst, dt);
  if (now - perf.since < 500) return;
  const n = perf.frames, secs = (now - perf.since)/1000;
  $('perf').textContent = `${Math.round(n/secs)} kare/sn · en uzun kare ${perf.worst.toFixed(0)} ms · sim ${(perf.sim/n).toFixed(1)} ms · çizim ${(perf.draw/n).toFixed(1)} ms · ${viewInfo()}`;
  Object.assign(perf, { frames: 0, sim: 0, draw: 0, worst: 0, since: now });
}

function frame(now){
  let dt = now - last; last = now;
  const rawDt = dt, t0 = perf.on ? performance.now() : 0;
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
  const t1 = perf.on ? performance.now() : 0;
  // yerel maç sürerken iki fizik adımı arasındaki ara konumla çiz (duraklatınca/bitince son konum)
  const alpha = !G.online && !G.paused && G.mode !== 'end' && G.state ? acc/TICK : 1;
  withLerp(G.state, alpha, () => render(G.state, G));
  if (perf.on) perfReport(now, rawDt, t1 - t0, performance.now() - t1);
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
applyView();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => render(G.state, G));
requestAnimationFrame(frame);
