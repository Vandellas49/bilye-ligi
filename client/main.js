/* ---------- istemci girişi ----------
   Üç oyun biçimi:
   - tek maç: simülasyon tarayıcıda çalışır (bota karşı ya da aynı klavyede iki kişi)
   - turnuva: tek kişilik eleme tablosu; senin maçların tarayıcıda, diğerleri ekransız simüle edilir
   - çevrimiçi: maç sunucuda çalışır; bu istemci girdisini gönderir, gelen anlık görüntüleri çizer */
import { TICK, W, H, KITS, kitById, QUICK_CHAT } from '../shared/constants.js';
import { randomSeed } from '../shared/rng.js';
import { createMatch, step, NEUTRAL_INPUT } from '../shared/sim.js';
import { createTournament, nextMatch, recordResult, simulateMatch, roundDiff, roundName, alive, tourKit } from '../shared/tournament.js';
import { ensureAudio, setSoundActive, toggleMute, sfx } from './audio.js';
import { initInput, readInput, clearKeys } from './input.js';
import { fx, resetFx, applyEvents, afterStep, buildAmbient } from './effects.js';
import { updateCrowd } from './crowd.js';
import { createTutorial } from './tutorial.js';
import { replay, recordFrame, replayEvents, updateReplay, withReplay } from './replay.js';
import { createPredictor, updatePrediction, applyPrediction } from './predict.js';
const pred = createPredictor();
const NO_PREDICT = new URLSearchParams(location.search).has('tahminyok');   // karşılaştırma ve test için tahmini kapatır
import { initRender, resize, renderBg, render, setView3D, viewInfo, setFallbackHandler, drawLookPreview, setCamera, cameraYaw } from './render.js';
import { net, connect, disconnect, send, setName, sendInput, createNetMatch, pushSnap, updateNetMatch, flushNetMatch } from './net.js';
import { $, esc, renderLeague, initMenu, initLookEditor, loadLook, cameraPick, readCfg, readCreate, saveCfg, loadCfg, showOverlay, currentOverlay, updateHud, setPlaying, showEnd,
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
  setTimeout(reportActivity, 0);
  setSoundActive(mode === 'match' || mode === 'end');
}

/* ---------- yerel maç ---------- */
// takım adları ve formalar: benim takımım menüden; rakip menüdeki rakip formadan (ya da rastgele), turnuvada takımın kendi formasından
function localTeams(cfg, extra){
  const mine = kitById(cfg.kit) || KITS[0];
  let opp = extra.oppKit ? kitById(extra.oppKit) : cfg.okit && cfg.okit !== 'r' ? kitById(cfg.okit) : null;
  if (!opp || opp.id === mine.id){ const free = KITS.filter(k => k.id !== mine.id); opp = free[Math.random()*free.length|0]; }
  const names = extra.teamNames || [cfg.teamName || mine.name, opp.name];
  return { teamNames: names, kits: [mine.id, opp.id] };
}
// extra: { teamNames } turnuva maçı için
function startMatch(cfg, extra = {}){
  if (!extra.teamNames) G.cfg = cfg;
  const humans = [{team:0, ctrl:'h1', name:'Sen', look: loadLook()}];
  const weather = cfg.weather || 'kar';
  G.state = createMatch({
    size: +cfg.size, humans, diff: +cfg.diff, arena: cfg.arena, weather,
    minutes: +cfg.time, specials: true, seed: randomSeed(), ...localTeams(cfg, extra),
    allowSwitch: true,   // yerel maçta Q/Tab ile bot takım arkadaşına geçilebilir
    replay: cfg.mode !== 'learn',   // gol tekrarı (öğrenmede yok)
    keepers: cfg.mode !== 'learn' && cfg.keeper !== '0',
    tiebreak: cfg.tie === 'altin' ? 'altin' : 'penalti',
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

/* ---------- öğrenme modu ---------- */
function startTutorial(cfg){
  startMatch({ ...cfg, size: 2, diff: 0, time: 0 });
  G.tut = createTutorial(keyLayout());
  G.tut.ok = title => toast('✓ ' + title + ' tamam!');
  G.tut.retry = () => toast('Gol yedin, tekrar dene');
  G.tut.begin(G.state);
}
function endTutorial(){ G.tut = null; $('tutBox').hidden = true; if (G.state) G.state.tutTarget = null; }
$('tutBox').addEventListener('click', e => {
  const b = e.target.closest('button[data-tut]');
  if (!b || !G.tut) return;
  if (b.dataset.tut === 'skip') G.tut.skip(G.state);
  else { endTutorial(); startDemo(); showOverlay('menu'); }
  b.blur();
});

function startDemo(){
  endTutorial();
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
  T.teams[0].name = cfg.teamName || (kitById(cfg.kit) || KITS[0]).name;   // benim takımım menüdeki ad
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
  startMatch({ ...cfg, diff: roundDiff(T, nm.round) }, { teamNames: [T.teams[me].name, T.teams[opp].name], oppKit: tourKit(T.teams[opp].name, opp) });
}

function endTourMatch(){
  const nm = G.tourMatch, { T, me } = G.tour;
  G.tourMatch = null;
  const [mine, theirs] = G.state.score, meA = nm.a === me;
  const ps = G.state.penScore;
  recordResult(T, nm.round, nm.index, meA ? mine : theirs, meA ? theirs : mine, ps ? (meA ? ps : [ps[1], ps[0]]) : null);
  $('pauseBtn').hidden = true; $('touch').classList.remove('on');
  updateHud(G.state);
  const names = G.state.teamNames, score = `${names[0]} ${mine} – ${theirs} ${names[1]}.`;
  if (T.champion === me) showTour('Şampiyon oldun!', `${score} Kupa senin!`);
  else if (T.champion !== null) showTour('Finalde kaybettin', `${score} İkinci oldun. Şampiyon: ${T.teams[T.champion].name}.`);
  else if (mine > theirs || (ps && ps[0] > ps[1])) showTour('Kazandın!', `${score} Sıradaki tur: ${roundName(T, nm.round + 1)}.`);
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
  renderWho();
  $('netStatus').textContent = s === 'on'
    ? `Bağlandın: ${net.me.name}${net.slow ? ' · Ağın WebSocket’e izin vermiyor, yedek bağlantı kullanılıyor (gecikme olabilir).' : ''}`
    : STATUS[s];
  if (s === 'reconnecting' && G.room) $('lobbyStatus').textContent = STATUS.reconnecting;
};
net.handlers.welcome = () => { $('netName').value = net.name; lastAct = ''; reportActivity(); };
/* Çevrimiçi oyuncular paneli (sağda): isim, IP, nerede. Bağlıyken görünür, başlığa tıklayınca kapanır/açılır (hatırlanır). */
let whoUsers = [], whoRecent = [];
net.handlers.online = m => { whoUsers = Array.isArray(m.users) ? m.users : []; whoRecent = Array.isArray(m.recent) ? m.recent : []; renderWho(); };
function renderWho(){
  const box = $('who'), on = net.status === 'on' && whoUsers.length > 0;
  box.hidden = !on;
  if (!on) return;
  $('whoN').textContent = whoUsers.length;
  const where = u => u.room ? `${u.room} · ${u.state}` : u.state;
  const ago = s => s < 60 ? 'az önce' : s < 3600 ? Math.round(s/60) + ' dk önce' : Math.round(s/3600) + ' sa önce';
  $('whoList').innerHTML = whoUsers.map(u => `<li class="${u.state === 'maçta' ? 'mac' : ''}${net.me && u.id === net.me.id ? ' me' : ''}"><span class="st"></span><span class="nm">${esc(u.name)}${net.me && u.id === net.me.id ? ' (sen)' : ''}</span><span class="in">${esc(u.ip)} · ${esc(where(u))}</span></li>`).join('')
    + (whoRecent.length ? '<li class="sep">Daha önce gelenler</li>' + whoRecent.slice(0, 8).map(u => `<li class="old"><span class="st"></span><span class="nm">${esc(u.name)}</span><span class="in">${esc(u.ip)} · ${ago(u.ago)}</span></li>`).join('') : '');
}
{
  // menüde açık/kapalı tercihi hatırlanır; maçta sahayı kapatmasın diye kapalı başlar (tıklayınca o maç için açılır)
  let closed = false, inMatch = false, openInMatch = false; try { closed = localStorage.getItem('bilye-who') === '0'; } catch(e){}
  const apply = () => { const c = inMatch ? !openInMatch : closed; $('who').classList.toggle('closed', c); $('whoHead').setAttribute('aria-expanded', String(!c)); };
  $('whoHead').onclick = () => {
    if (inMatch) openInMatch = !openInMatch;
    else { closed = !closed; try { localStorage.setItem('bilye-who', closed ? '0' : '1'); } catch(e){} }
    apply();
  };
  setInterval(() => { const m = G.mode === 'match'; if (m !== inMatch){ inMatch = m; openInMatch = false; apply(); } }, 300);
  apply();
}
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
net.handlers.matchEnd = m => {
  if (!G.netM) return;
  // çizim ~100 ms geriden geliyor: son görüntü ekrana gelince bitir
  setTimeout(() => {
    if (!G.netM) return;
    handleEvents(flushNetMatch(G.netM));
    setMode('end');
    const mine = G.state.players.find(p => p.mine);
    showEnd(G.state, { myTeam: mine ? mine.team : null, buttons: { again: '', menu: 'Lobiye dön' }, stats: m && m.stats, pen: m && m.pen });
  }, 150);
};

function drawLobby(){
  if (!G.room || !net.me) return;
  const room = { ...G.room, nextIn: G.room.nextIn - (performance.now() - G.room.at) };
  renderLobby(room, net.me.id, {
    onTeam: team => send('setTeam', { team }),
    onStart: () => send('start'),
    onDiff: diff => send('setSettings', { settings: { diff } }),
    onTeamCfg: c => send('setTeamCfg', c),
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
  showOverlay('onlineOv'); reportActivity();
  $('netName').value = net.name;
  if (net.status === 'on') send('listRooms');
  else connect($('netName').value.trim() || 'Misafir');
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
  if (cfg.mode === 'tour') startTournament(cfg); else if (cfg.mode === 'learn') startTutorial(cfg); else startMatch(cfg);
};
$('onlineBtn').onclick = openOnline;
// lig tablosu: sunucudan istenir; geri dönünce açıldığı ekrana
let leagueFrom = 'menu';
function openLeague(){
  leagueFrom = currentOverlay() || 'menu';
  showOverlay('leagueOv');
  if (net.status === 'on') send('league');
  else $('leagueTable').innerHTML = '<p class="note">Lig tablosu için sunucuya bağlı olmak gerekir.</p>';
}
/* Hazır mesajlar: 1–6. Çevrimiçinde sunucuya (odaya ve balona), yerel maçta kendi oyuncunun balonu. */
const chatLog = [];
net.handlers.chat = m => {
  chatLog.push({ from: String(m.from || ''), text: String(m.text || '') }); if (chatLog.length > 6) chatLog.shift();
  $('lobbyChat').innerHTML = chatLog.map(l => `<div><b>${esc(l.from)}</b>${esc(l.text)}</div>`).join('');
};
addEventListener('keydown', e => {
  const i = /^Digit([1-6])$/.exec(e.code);
  if (!i || e.repeat || (document.activeElement && document.activeElement.tagName === 'INPUT')) return;
  const n = +i[1] - 1;
  if (net.status === 'on' && G.room) send('chat', { i: n });
  else if (G.mode === 'match' && !G.online && G.state){ const me = G.state.players.find(p => p.ctrl === 'h1'); if (me) me.bubble = { text: QUICK_CHAT[n], t: 110 }; }
});
net.handlers.league = m => renderLeague(m.rows, net.name || (net.me && net.me.name));
$('leagueBtn').onclick = openLeague; $('leagueBtn2').onclick = openLeague;
$('leagueBack').onclick = () => showOverlay(leagueFrom === 'leagueOv' ? 'menu' : leagueFrom);
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
  replayEvents(G.state, events);
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

/* Kamera döndüğünde yön tuşları ekrana göre çalışsın: girdi, ekranın "yukarı"sı sahada hangi yöndeyse o kadar döndürülür */
// ekranın üstünde kısa bildirim
let toastT = 0;
function toast(text){ const el = $('toast'); el.textContent = text; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 1300); }

function camInput(inp){
  const th = cameraYaw() + Math.PI/2;
  if (Math.abs(th) < 1e-6 || (!inp.x && !inp.y)) return inp;
  const c = Math.cos(th), s = Math.sin(th);
  return { ...inp, x: inp.x*c - inp.y*s, y: inp.x*s + inp.y*c };
}
// K: kamera değiştir (maçta), menüdeki seçim de güncellenir ve kaydedilir
const CAM_NAMES = { genis: 'Geniş', tv: 'TV', dinamik: 'Dinamik', oyuncu: 'Oyuncu', ust: 'Kuşbakışı' };
function applyCamera(m){
  setCamera(m);
  const el = document.querySelector(`input[name="cam"][value="${m}"]`); if (el) el.checked = true;
  saveCfg({ ...(loadCfg() || {}), cam: m });
}
document.querySelectorAll('input[name="cam"]').forEach(el => el.addEventListener('change', () => applyCamera(el.value)));
setCamera(cameraPick());
addEventListener('keydown', e => {
  if (e.code !== 'KeyK' || e.repeat || G.mode !== 'match' || document.activeElement && document.activeElement.tagName === 'INPUT') return;
  const list = Object.keys(CAM_NAMES), next = list[(list.indexOf(cameraPick()) + 1) % list.length];
  applyCamera(next);
  toast('Kamera: ' + CAM_NAMES[next] + (document.body.classList.contains('three') ? '' : ' (yalnızca 3B görünümde)'));
});

// tekrar etiketi: golü atan takımdaysan geçme ipucu
function replayTag(){
  const el = $('replayTag'), on = replay.on && G.mode === 'match';
  el.hidden = !on;
  if (!on) return;
  const me = G.state.players.find(p => p.ctrl === 'h1'), mine = me && me.team === replay.team;
  el.querySelector('.hint').textContent = mine ? 'Geçmek için vuruş tuşuna bas' : '';
}

function tick(){
  const S = G.state, inputs = {};
  savePrev(S);
  const assist = passAssist(), layout = keyLayout();
  for (const p of S.players) if (p.ctrl === 'h1') inputs[p.id] = camInput({ ...readInput(layout, { defending: !!S.owner && S.owner.team !== p.team }), assist });
  const events = step(S, inputs);
  handleEvents(events);
  afterStep(S); updateCrowd(S); recordFrame(S);
  if (G.tut) G.tut.update(S, events);
}

function netFrame(now, dt){
  const due = updateNetMatch(G.netM, now);
  if (due.length) handleEvents(due);
  if (G.state.t !== G.lastT){ G.lastT = G.state.t; afterStep(G.state); updateCrowd(G.state); recordFrame(G.state); }
  const me = G.state.players.find(p => p.mine);
  if (me){
    const inp = G.menuOpen ? NEUTRAL_INPUT : camInput({ ...readInput(keyLayout(), { defending: !!G.state.owner && G.state.owner.team !== me.team }), assist: passAssist() });
    sendInput(inp, now);
    // kendi oyuncum: tuşlara anında tepki (sunucu konumuna yumuşak düzeltmeyle)
    if (!NO_PREDICT) updatePrediction(pred, G.netM, G.state, me, inp, dt, now, net.ping);
    applyPrediction(pred, G.state, me);
  }
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
    if (G.mode === 'match' && G.netM) netFrame(now, dt); else pred.on = false;
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
  if (G.state && G.mode !== 'menu') updateReplay(G.state, dt/TICK, G.paused);
  replayTag();
  if (!withReplay(G.state, () => render(G.state, G))) withLerp(G.state, alpha, () => render(G.state, G));
  if (perf.on) perfReport(now, rawDt, t1 - t0, performance.now() - t1);
  requestAnimationFrame(frame);
}

// test için: index.html?debug ile açılırsa durum pencereden okunabilir (window.__S, window.__G)
if (new URLSearchParams(location.search).has('debug')){
  window.__G = G; window.__fx = fx; window.__net = net; window.__pred = pred;
  Object.defineProperty(window, '__S', { get: () => G.state, configurable: true });
}

/* Sayfayı açan herkes sunucuya bağlanır (oynamasa da "Çevrimiçi" panelinde görünsün). Sunucu yoksa (statik
   yayın) sessizce bağlanılmaz. Ne yaptığı (menü, tek maç, turnuva, ders, oda listesi) değişince bildirilir. */
let lastAct = '';
function reportActivity(){
  if (net.status !== 'on') return;
  const act = G.room ? 'online' : currentOverlay() === 'onlineOv' ? 'online' : G.mode === 'match' ? (G.tut ? 'learn' : G.tour ? 'tour' : G.online ? 'online' : 'match') : 'menu';
  if (act === lastAct) return;
  lastAct = act; send('setActivity', { act });
}
setInterval(reportActivity, 2000);
if (typeof io === 'function') connect(net.name || '');

new ResizeObserver(resize).observe($('stage'));
addEventListener('resize', resize);
startDemo();
resize();
applyView();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => render(G.state, G));
requestAnimationFrame(frame);
