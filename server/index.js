/* ---------- Bilye Ligi sunucusu ----------
   Statik istemciyi servis eder ve Socket.IO (/canli) üzerinden çok oyunculu odaları yönetir.
   Maçlar sunucuda 60 Hz simüle edilir (sunucu otoriteli), istemcilere 30 Hz
   anlık görüntü ve olay listesi gönderilir. İstemciden yalnızca girdi kabul edilir.

   Çalıştırma:  npm start   (PORT ortam değişkeni, varsayılan 8080) */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { TICK, ARENAS, TEAM_NAME, QUICK_CHAT, cleanLook, kitById } from '../shared/constants.js';
import { randomSeed } from '../shared/rng.js';
import { createMatch, step, sanitizeInput } from '../shared/sim.js';
import { roster, snapshot, matchInfo } from '../shared/net.js';
import { statSummary } from '../shared/stats.js';
import { createLeague, recordLeague, leagueRows } from './league.js';
import { createTournament, nextMatch, recordResult, simulateMatch, roundName, TOUR_TEAMS , tourKit } from '../shared/tournament.js';

// IIS (ASP.NET Core Module ya da HttpPlatformHandler) portu kendi değişkeniyle verir
const PORT = +(process.env.PORT || process.env.ASPNETCORE_PORT || process.env.HTTP_PLATFORM_PORT) || 8080;
// alt adreste çalışırken önek (ör. IIS'te /bilye-ligi uygulaması); kökte boş
const BASE = (process.env.BASE_PATH ?? process.env.ASPNETCORE_APPL_PATH ?? '').replace(/\/+$/, '');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// lig tablosu dosyası (BILYE_DATA ile değiştirilebilir; IIS'te bu klasöre yazma izni gerekir)
const league = createLeague(process.env.BILYE_DATA || path.join(ROOT, 'data', 'lig.json'));
const SIO_PATH = '/canli';          // oyun bağlantısının adresi (önek temizlendikten sonra, bkz. stripBase)
const SIO_CLIENT = path.join(ROOT, 'node_modules', 'socket.io', 'client-dist', 'socket.io.min.js');
const SNAP_EVERY = 3;            // her 3 tick'te bir anlık görüntü (20 Hz; istemci arayı enterpole eder)
const RECONNECT_MS = 60_000;     // kopan oyuncunun geri dönmesi için süre
const BETWEEN_MS = 7_000;        // turnuvada maçlar arası bekleme
const MAX_ROOMS = 100;
const MSG_PER_SEC = 120;         // bunun üstündeki mesajlar yok sayılır
const KICK_PER_SEC = 600;        // bunun üstünde bağlantı kapatılır

/* ---------- statik dosyalar ---------- */
const TEXT = { 'content-type': 'text/plain; charset=utf-8' };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
/* Alt adreste çalışırken gelen adresin başındaki uygulama önekini kaldırır (ör. /bilye-ligi/canli -> /canli).
   IIS adresleri büyük/küçük harfe duyarsızdır ve önek sunucuya farklı yazılışla gelebilir; bu yüzden
   harf farkı gözetilmez. Önek hiç gelmezse adres olduğu gibi kalır. Hem dosyalar hem Socket.IO
   temizlenmiş adresle çalışır. */
function stripBase(req){
  if (req.original !== undefined) return;
  req.original = req.url;
  if (!BASE) return;
  const q = req.url.indexOf('?');
  const pth = q < 0 ? req.url : req.url.slice(0, q), rest = q < 0 ? '' : req.url.slice(q);
  const low = pth.toLowerCase(), base = BASE.toLowerCase();
  if (low === base){ req.bare = true; return; }   // sondaki / eksik
  if (low.startsWith(base + '/')) req.url = pth.slice(BASE.length) + rest;
}

const server = http.createServer((req, res) => {
  stripBase(req);
  // göreli adresler için sondaki / şart
  if (req.bare){ res.writeHead(301, { location: req.original.split('?')[0] + '/' }); res.end(); return; }
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch(e){ res.writeHead(400, TEXT); res.end('Geçersiz adres'); return; }
  if (p === '/') p = '/index.html';
  if (p === '/favicon.ico'){ res.writeHead(204); res.end(); return; }
  // kurulum sorunlarında sunucunun ne gördüğünü göstermek için
  if (p === '/tani'){
    res.writeHead(200, { ...TEXT, 'cache-control': 'no-store' });
    res.end([`Bilye Ligi sunucusu çalışıyor`, `alınan adres: ${req.original}`, `temizlenmiş adres: ${req.url}`,
      `önek: ${BASE || '(yok)'}`, `bağlantı yolu: ${SIO_PATH}`, `node: ${process.version}`, '',
      // WebSocket teşhisi: istek Node'a hiç gelmiyorsa engel Node'dan önce (IIS WebSocket Protocol özelliği ya da proxy)
      `WebSocket isteği (Node'a ulaşan): ${wsStats.upgradeReq}`,
      `WebSocket'e geçen bağlantı: ${wsStats.upgraded} / toplam bağlantı: ${wsStats.conns}`,
      `şu an bağlı: ${wsNow('websocket')} WebSocket, ${wsNow('polling')} HTTP (polling)`,
      `son WebSocket isteği: ${wsStats.last || '(hiç gelmedi)'}`,
      `WebSocket sıkıştırması: ${WS_DEFLATE ? 'açık' : 'kapalı'}`,
      `istekteki uzantı: ${wsStats.ext || '-'}`,
      `Node'un yanıtı: ${wsStats.reply || '-'}`,
      `bağlantı: ${wsStats.close || 'açık ya da bilgi yok'}${wsStats.err ? ' | hata: ' + wsStats.err : ''}`,
      `motor hatası: ${wsStats.engineErr || '-'}`].join('\n'));
    return;
  }
  // Socket.IO tarayıcı istemcisi kendi adımızla verilir (adreste "socket.io" geçmesin, bkz. SIO_PATH)
  const lib = p === '/lib/sio.min.js';
  // yalnızca istemcinin ihtiyaç duyduğu dosyalar
  const ok = lib || p === '/index.html' || /^\/(client|shared)\/[\w.-]+\.js$/.test(p);
  const file = lib ? SIO_CLIENT : path.join(ROOT, p);
  if (!ok || !file.startsWith(ROOT)){ res.writeHead(404, TEXT); res.end('Bulunamadı'); return; }
  fs.readFile(file, (err, data) => {
    if (err){ res.writeHead(404, TEXT); res.end('Bulunamadı'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

/* ---------- bağlantılar ---------- */
const clients = new Map();    // id -> istemci
const sessions = new Map();   // oturum anahtarı -> istemci
const rooms = new Map();      // oda id -> oda
let nextClientId = 1;

const cleanText = (s, max, def) => {
  const t = String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
  return t || def;
};

// her mesaj tek bir 'm' olayıyla gider: { type, ...veri }
function send(c, type, data = {}){
  if (c && c.connected && c.socket.connected) c.socket.emit('m', { type, ...data });
}

/* Socket.IO önce HTTP uzun sorgulamayla (long polling) bağlanır, ağ izin verirse
   WebSocket'e geçer. WebSocket'i engelleyen kurum proxy'lerinde polling ile devam eder.
   Yol bilerek varsayılan "/socket.io" değil: bazı IIS sunucularında "socket.io" geçen adresleri
   başka uygulamaya yönlendiren genel kurallar var. İstemci aynı yolu client/net.js'te kullanır. */
const WS_DEFLATE = process.env.BILYE_WS_DEFLATE ? process.env.BILYE_WS_DEFLATE === '1' : !process.env.ASPNETCORE_PORT;
const io = new Server(server, {
  path: SIO_PATH,
  maxHttpBufferSize: 4096,        // tek mesaj sınırı
  pingInterval: 15_000, pingTimeout: 20_000,
  serveClient: false,             // istemci dosyası /lib/sio.min.js olarak yukarıda verilir
  cors: { origin: false },
  // WebSocket mesajları sıkıştırılır (256 bayttan büyükler; hızlı seviye). Polling'de httpCompression zaten açık.
  // IIS (ASP.NET Core Module) arkasında varsayılan kapalı: IIS'in WebSocket katmanı uzantıyı geçirmeyebilir, bağlantı
  // WebSocket'e geçemez. BILYE_WS_DEFLATE=1 ile açılır, =0 ile her yerde kapanır.
  perMessageDeflate: WS_DEFLATE ? { threshold: 256, zlibDeflateOptions: { level: 3 } } : false,
});
// Socket.IO kendi dinleyicisini sunucuya ekledi; önek temizliği ondan önce çalışsın
server.prependListener('request', stripBase);
server.prependListener('upgrade', stripBase);
// WebSocket teşhis sayaçları (/tani)
const wsStats = { upgradeReq: 0, upgraded: 0, conns: 0, last: '', reply: '', close: '', err: '' };
server.prependListener('upgrade', (req, socket) => {
  wsStats.upgradeReq++;
  // Node'un yanıtı (101 = WebSocket'e geçildi) ve bağlantının ne zaman, nasıl kapandığı
  const t0 = Date.now(), write = socket.write.bind(socket);
  let first = true;
  socket.write = (chunk, ...rest) => {
    if (first){ first = false; wsStats.reply = String(chunk).split('\r\n')[0] + ' | ' + (String(chunk).match(/sec-websocket-extensions:[^\r]*/i) || ['uzantı yok'])[0]; }
    return write(chunk, ...rest);
  };
  let got = 0;
  socket.on('data', d => { got += d.length; });
  socket.once('close', hadErr => { wsStats.close = `${Date.now() - t0} ms sonra kapandı, gelen veri ${got} bayt${hadErr ? ', hata ile' : ''}`; });
  socket.once('error', e => { wsStats.err = e.message; });
  wsStats.ext = req.headers['sec-websocket-extensions'] || '-';
  wsStats.last = new Date().toISOString() + ' ' + ['upgrade', 'connection', 'x-forwarded-for'].map(h => h + '=' + (req.headers[h] || '-')).join(', ');
});
const wsNow = kind => [...io.of('/').sockets.values()].filter(x => (x.conn.transport.name === 'websocket') === (kind === 'websocket')).length;
io.engine.on('connection_error', e => { wsStats.engineErr = (e.code ?? '') + ' ' + (e.message || '') + (e.context ? ' ' + JSON.stringify(e.context) : ''); });
io.engine.on('connection', conn => { wsStats.conns++; conn.once('upgrade', () => wsStats.upgraded++); });
io.on('connection', socket => {
  let client = null;
  socket.conn.once('upgrade', () => presenceSoon());   // polling -> WebSocket geçişi panelde görünsün
  const rate = { n: 0, t: Date.now() };
  socket.on('m', msg => {
    const now = Date.now();
    if (now - rate.t > 1000){ rate.t = now; rate.n = 0; }
    if (++rate.n > KICK_PER_SEC){ socket.disconnect(true); return; }
    if (rate.n > MSG_PER_SEC) return;
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
    if (msg.type === 'hello'){ client = hello(socket, msg, client); return; }
    if (client && client.socket === socket) handle(client, msg);
  });
  socket.on('disconnect', () => { if (client && client.socket === socket) disconnected(client); });
});

/* İstemci IP'si: IIS (ASP.NET Core Module) ya da ters vekil arkasında X-Forwarded-For'un ilk adresi, yoksa bağlantı adresi */
function clientIp(socket){
  const h = socket.handshake, xf = h.headers['x-forwarded-for'];
  let ip = (typeof xf === 'string' && xf.split(',')[0].trim()) || h.address || '';
  ip = ip.replace(/^::ffff:/, '');
  if (/^\[?[0-9a-f:.]+\]?:\d+$/i.test(ip) && ip.includes('.')) ip = ip.replace(/:\d+$/, '');   // IPv4:port
  return ip === '::1' ? '127.0.0.1' : ip.slice(0, 64);
}

/* Çevrimiçi oyuncular: bağlı herkese isim, IP ve nerede olduğu yayınlanır (değişiklikte, en fazla 0,5 sn'de bir) */
let presenceTimer = null;
// sayfayı açanların geçmişi (tarayıcı oturumuna göre, bellekte; sunucu yeniden başlayınca sıfırlanır)
const visitors = new Map();   // oturum anahtarı -> { name, ip, first, last }
const MAX_VISITORS = 60;
function noteVisitor(c){
  const v = visitors.get(c.key) || { first: Date.now() };
  Object.assign(v, { name: c.name, ip: c.ip || '', last: Date.now() });
  visitors.delete(c.key); visitors.set(c.key, v);   // en son görülen sona
  while (visitors.size > MAX_VISITORS) visitors.delete(visitors.keys().next().value);
}
const ACTS = { menu: 'menüde', match: 'tek maçta', tour: 'turnuvada', learn: 'derste', online: 'oda listesinde' };
function presenceSoon(){
  if (presenceTimer) return;
  presenceTimer = setTimeout(() => {
    presenceTimer = null;
    const users = [...clients.values()].filter(c => c.connected).map(c => {
      const r = c.room && rooms.get(c.room);
      const inMatch = r && r.match && r.match.S.players.some(p => p.uid === c.id);
      const tr = c.socket && c.socket.conn && c.socket.conn.transport ? c.socket.conn.transport.name : '';   // 'websocket' | 'polling'
      return { id: c.id, name: c.name, ip: c.ip || '', tr, room: r ? r.name : null, state: !r ? (ACTS[c.act] || ACTS.menu) : inMatch ? 'maçta' : r.match ? 'izliyor' : 'lobide' };
    });
    const live = new Set([...clients.values()].filter(c => c.connected).map(c => c.key)), now = Date.now();
    const recent = [...visitors].filter(([k]) => !live.has(k)).reverse().slice(0, 30)
      .map(([, v]) => ({ name: v.name, ip: v.ip, ago: Math.round((now - v.last)/1000) }));
    for (const c of clients.values()) if (c.connected) send(c, 'online', { users, recent });
  }, 500);
}

function hello(socket, msg, current){
  const name = cleanText(msg.name, 16, 'Misafir');
  let c = typeof msg.sessionKey === 'string' ? sessions.get(msg.sessionKey) : null;
  if (c){
    // aynı oturumla geri dönüş: eski bağlantıyı bırak
    if (c.socket !== socket && c.socket.connected) c.socket.disconnect(true);
    c.socket = socket; c.connected = true; c.goneAt = 0; c.name = name;
    if (msg.look) c.look = cleanLook(msg.look);
  } else {
    if (current) return current;
    c = { id: nextClientId++, key: crypto.randomBytes(16).toString('hex'), name, socket, connected: true, goneAt: 0, room: null, input: null, look: cleanLook(msg.look) };
    clients.set(c.id, c); sessions.set(c.key, c);
  }
  c.ip = clientIp(socket); noteVisitor(c);
  send(c, 'welcome', { id: c.id, sessionKey: c.key, name: c.name });
  presenceSoon();
  const room = c.room && rooms.get(c.room);
  if (room){
    setControl(room, c, true);
    send(c, 'roomState', { room: roomPublic(room) });
    if (room.match) send(c, 'matchStart', matchStartMsg(room));
    broadcastRoom(room);
  } else send(c, 'rooms', { rooms: roomList() });
  return c;
}

function disconnected(c){
  c.connected = false; c.goneAt = Date.now(); c.input = null;
  noteVisitor(c); presenceSoon();
  const room = c.room && rooms.get(c.room);
  if (room){ setControl(room, c, false); broadcastRoom(room); }
}
// geri dönmeyen oyuncuları sil
setInterval(() => {
  const now = Date.now();
  for (const c of clients.values()){
    if (c.connected || now - c.goneAt < RECONNECT_MS) continue;
    leaveRoom(c);
    clients.delete(c.id); sessions.delete(c.key);
  }
}, 5_000);

/* ---------- mesajlar ---------- */
function handle(c, m){
  const room = c.room && rooms.get(c.room);
  switch (m.type){
    case 'setName': c.name = cleanText(m.name, 16, c.name); if (room) broadcastRoom(room); noteVisitor(c); presenceSoon(); break;
    case 'chat': {
      // hazır mesaj: odadakilere; maçtaysa oyuncunun üstünde balon (en fazla 1,2 sn'de bir)
      const i = Math.floor(+m.i), now = Date.now();
      if (!room || !(i >= 0 && i < QUICK_CHAT.length) || now - (c.chatAt || 0) < 1200) return;
      c.chatAt = now;
      const p = room.match && room.match.S.players.find(q => q.uid === c.id);
      if (p) p.bubble = { text: QUICK_CHAT[i], t: 110 };
      broadcastRoom(room, 'chat', { from: c.name, text: QUICK_CHAT[i] });
      break;
    }
    case 'league': send(c, 'league', { rows: leagueRows(league) }); break;
    case 'setActivity': c.act = Object.hasOwn(ACTS, m.act) ? m.act : 'menu'; presenceSoon(); break;
    case 'setLook': c.look = cleanLook(m.look); break;   // sonraki maçta geçerli
    case 'listRooms': send(c, 'rooms', { rooms: roomList() }); break;
    case 'ping': if (typeof m.t === 'number' && Number.isFinite(m.t)) send(c, 'pong', { t: m.t }); break;
    case 'createRoom': {
      if (room) leaveRoom(c);
      if (rooms.size >= MAX_ROOMS) return send(c, 'error', { message: 'Sunucuda yer yok, biraz sonra dene.' });
      const r = {
        id: crypto.randomBytes(3).toString('hex'),
        name: cleanText(m.name, 24, `${c.name} odası`),
        password: cleanText(m.password, 24, ''),
        settings: cleanSettings(m.settings), hostId: c.id,
        members: [], teams: new Map(), phase: 'lobby',
        // maç odası: takım adı ve forma (her takımın kaptanı, yani takıma ilk giren değiştirir)
        teamCfg: [{ name: TEAM_NAME[0], kit: 'limon' }, { name: TEAM_NAME[1], kit: 'buz' }], teamSeq: new Map(), seqN: 0,
        match: null, tour: null, lastResult: null, nextAt: 0, timer: null,
      };
      rooms.set(r.id, r);
      joinRoom(c, r);
      broadcastRoomList();
      break;
    }
    case 'joinRoom': {
      const r = rooms.get(m.roomId);
      if (!r) return send(c, 'error', { message: 'Oda bulunamadı.' });
      if (r.password && m.password !== r.password) return send(c, 'error', { message: 'Şifre yanlış.' });
      if (room && room !== r) leaveRoom(c);
      joinRoom(c, r);
      broadcastRoomList();
      break;
    }
    case 'setSettings': {
      // oda sahibi lobide ayar değiştirebilir (şimdilik yalnızca bot seviyesi); sonraki maçtan geçerli
      if (!room || room.hostId !== c.id) return;
      if (room.phase !== 'lobby' && room.phase !== 'done') return send(c, 'error', { message: 'Ayarlar maç sürerken değiştirilemez.' });
      const s = m.settings && typeof m.settings === 'object' ? m.settings : {};
      room.settings = cleanSettings({ ...room.settings, diff: s.diff ?? room.settings.diff });
      broadcastRoom(room);
      break;
    }
    case 'setTeam': {
      if (!room) return;
      if (room.phase === 'playing' || room.phase === 'between') return send(c, 'error', { message: 'Maç sürerken takım değiştirilemez.' });
      const t = m.team === null ? null : Math.floor(+m.team);
      if (t !== null){
        if (!(t >= 0 && t < teamCount(room))) return;
        const n = room.members.filter(id => room.teams.get(id) === t).length;
        if (room.teams.get(c.id) !== t && n >= room.settings.size) return send(c, 'error', { message: 'Bu takım dolu.' });
      }
      if (room.teams.get(c.id) !== t) room.teamSeq.set(c.id, ++room.seqN);
      room.teams.set(c.id, t);
      broadcastRoom(room);
      break;
    }
    case 'setTeamCfg': {
      // takım adı / forma: yalnızca maç odasında, lobide, o takımın kaptanı
      if (!room || room.settings.type !== 'match') return;
      if (room.phase !== 'lobby' && room.phase !== 'done') return send(c, 'error', { message: 'Maç sürerken değiştirilemez.' });
      const t = room.teams.get(c.id);
      if (t == null || captainOf(room, t) !== c.id) return send(c, 'error', { message: 'Takım adını ve formayı takıma ilk giren değiştirebilir.' });
      const cfg = room.teamCfg[t];
      if (m.name !== undefined) cfg.name = cleanText(m.name, 16, cfg.name);
      if (m.kit !== undefined){
        if (!kitById(m.kit)) return;
        if (room.teamCfg[1 - t].kit === m.kit) return send(c, 'error', { message: 'Bu forma diğer takımda.' });
        cfg.kit = m.kit;
      }
      broadcastRoom(room);
      break;
    }
    case 'start': {
      if (!room || room.hostId !== c.id) return;
      if (room.phase !== 'lobby' && room.phase !== 'done') return;
      room.lastResult = null;
      if (room.settings.type === 'tournament'){
        room.tour = createTournament({ size: room.settings.tSize, names: TOUR_TEAMS });
        advanceTournament(room);
      } else {
        room.tour = null;
        startLiveMatch(room, { sides: [0, 1], names: room.teamCfg.map(t => t.name), kits: room.teamCfg.map(t => t.kit), diff: room.settings.diff });
      }
      broadcastRoomList();
      break;
    }
    case 'input': c.input = sanitizeInput(m); break;
    case 'leave': leaveRoom(c); send(c, 'left'); send(c, 'rooms', { rooms: roomList() }); break;
  }
}

function cleanSettings(s){
  s = s && typeof s === 'object' ? s : {};
  const pick = (v, list, def) => list.includes(v) ? v : def;
  const arena = s.arena === 'r' ? 'r' : Number.isInteger(+s.arena) && +s.arena >= 0 && +s.arena < ARENAS.length ? +s.arena : 'r';
  return {
    type: pick(s.type, ['match', 'tournament'], 'match'),
    tSize: pick(+s.tSize, [4, 8], 4),
    size: pick(+s.size, [1, 2, 3, 4, 5], 3),
    minutes: pick(+s.minutes, [2, 3, 5], 2),
    diff: pick(+s.diff, [0, 1, 2], 1),
    specials: s.specials !== false,
    weather: pick(s.weather, ['kar', 'parilti', 'sade'], 'kar'),
    arena,
  };
}
const teamCount = room => room.settings.type === 'tournament' ? room.settings.tSize : 2;
// takımın kaptanı: o takıma en önce giren üye
function captainOf(r, t){
  let best = null, seq = Infinity;
  for (const id of r.members) if (r.teams.get(id) === t){ const s = r.teamSeq.get(id) ?? 0; if (s < seq){ seq = s; best = id; } }
  return best;
}

/* ---------- odalar ---------- */
function roomList(){
  return [...rooms.values()].map(r => ({
    id: r.id, name: r.name, locked: !!r.password, type: r.settings.type, tSize: r.settings.tSize, size: r.settings.size,
    players: r.members.length, phase: r.phase,
  }));
}
function broadcastRoomList(){
  const list = roomList();
  for (const c of clients.values()) if (!c.room) send(c, 'rooms', { rooms: list });
}

function roomPublic(r){
  const m = r.match;
  return {
    id: r.id, name: r.name, locked: !!r.password, hostId: r.hostId, settings: r.settings, phase: r.phase,
    members: r.members.map(id => { const c = clients.get(id); return { id, name: c.name, team: r.teams.get(id) ?? null, connected: c.connected }; }),
    tour: r.tour, lastResult: r.lastResult,
    teamCfg: r.teamCfg, captains: [0, 1].map(t => captainOf(r, t)),
    current: m ? { names: m.S.teamNames, label: m.label, round: m.round, index: m.index } : null,
    nextIn: r.phase === 'between' ? Math.max(0, r.nextAt - Date.now()) : 0,
  };
}
function broadcastRoom(r, type = 'roomState', data){
  presenceSoon();   // oda/maç değişimi: kim nerede
  const payload = data || { room: roomPublic(r) };
  for (const id of r.members) send(clients.get(id), type, payload);
}

function joinRoom(c, r){
  if (!r.members.includes(c.id)) r.members.push(c.id);
  if (!r.teams.has(c.id)){
    // ilk boş takıma yerleştir, yer yoksa izleyici
    let team = null;
    if (r.phase === 'lobby' || r.phase === 'done'){
      for (let t = 0; t < teamCount(r) && team === null; t++){
        if (r.members.filter(id => r.teams.get(id) === t).length < r.settings.size) team = t;
      }
    }
    r.teamSeq.set(c.id, ++r.seqN); r.teams.set(c.id, team);
  }
  c.room = r.id;
  broadcastRoom(r);
  if (r.match) send(c, 'matchStart', matchStartMsg(r));
}

function leaveRoom(c){
  const r = c.room && rooms.get(c.room);
  c.room = null;
  presenceSoon();
  if (!r) return;
  r.members = r.members.filter(id => id !== c.id);
  r.teams.delete(c.id);
  if (r.match){
    const p = r.match.S.players.find(p => p.uid === c.id);
    if (p){ p.ctrl = 'ai'; p.uid = null; }
  }
  if (!r.members.length){
    clearTimeout(r.timer);
    rooms.delete(r.id);
  } else {
    if (r.hostId === c.id){
      const next = r.members.find(id => clients.get(id).connected) ?? r.members[0];
      r.hostId = next;
    }
    broadcastRoom(r);
  }
  broadcastRoomList();
}

// kopan oyuncunun yerine bot geçer, dönünce geri verilir
function setControl(r, c, connected){
  if (!r.match) return;
  const p = r.match.S.players.find(p => p.uid === c.id);
  if (p) p.ctrl = connected ? 'net' : 'ai';
}

/* ---------- maç ---------- */
function startLiveMatch(r, { sides, names, kits, diff, round = null, index = null, label = '' }){
  const s = r.settings, humans = [];
  sides.forEach((teamIdx, side) => {
    for (const id of r.members){
      if (r.teams.get(id) === teamIdx) humans.push({ team: side, ctrl: 'net', name: clients.get(id).name, uid: id, look: clients.get(id).look });
    }
  });
  const S = createMatch({
    size: s.size, humans, diff, arena: s.arena, weather: s.weather, minutes: s.minutes,
    specials: s.specials, seed: randomSeed(), teamNames: names, kits, replay: true, keepers: true, tiebreak: 'penalti',
  });
  for (const p of S.players) if (p.uid != null && !clients.get(p.uid).connected) p.ctrl = 'ai';
  r.match = { S, round, index, label, n: 0, pending: [] };
  r.phase = 'playing';
  broadcastRoom(r, 'matchStart', matchStartMsg(r));
  broadcastRoom(r);
}

function matchStartMsg(r){
  const m = r.match;
  return { roster: roster(m.S), info: matchInfo(m.S), label: m.label, snap: snapshot(m.S) };
}

function tickRoom(r){
  const m = r.match, S = m.S, inputs = {};
  for (const p of S.players){
    if (p.uid == null || p.ctrl === 'ai') continue;
    const c = clients.get(p.uid);
    if (c && c.input) inputs[p.id] = c.input;
  }
  const ev = step(S, inputs);
  if (ev.length) m.pending.push(...ev);
  const ended = ev.some(e => e.type === 'end');
  if (++m.n % SNAP_EVERY === 0 || ended){
    broadcastRoom(r, 'snap', { s: snapshot(S), ev: m.pending });
    m.pending = [];
  }
  if (ended) finishMatch(r);
}

function finishMatch(r){
  const m = r.match, S = m.S;
  r.match = null;
  r.lastResult = { names: S.teamNames, score: S.score.slice(), label: m.label };
  const summary = statSummary(S);
  recordLeague(league, S, summary, uid => (clients.get(uid) || {}).ip);
  broadcastRoom(r, 'matchEnd', { names: S.teamNames, score: S.score.slice(), label: m.label, tournament: !!r.tour, stats: summary, pen: S.penScore || null });
  if (r.tour && m.round !== null){
    recordResult(r.tour, m.round, m.index, S.score[0], S.score[1], S.penScore || null);
    if (r.tour.champion !== null) r.phase = 'done';
    else {
      r.phase = 'between'; r.nextAt = Date.now() + BETWEEN_MS;
      r.timer = setTimeout(() => { if (rooms.get(r.id) === r && r.phase === 'between') advanceTournament(r); }, BETWEEN_MS);
    }
  } else r.phase = 'lobby';
  broadcastRoom(r);
  broadcastRoomList();
}

/* ---------- çevrimiçi turnuva ----------
   Oyuncusu olmayan eşleşmeler ekransız simüle edilir; oyuncusu olanlar canlı oynanır,
   diğer oda üyeleri izler. */
function advanceTournament(r){
  const T = r.tour, s = r.settings;
  for (;;){
    const nm = nextMatch(T);
    if (!nm){ r.phase = 'done'; break; }
    const hasHumans = r.members.some(id => { const t = r.teams.get(id); return (t === nm.a || t === nm.b) && clients.get(id).connected; });
    const names = [T.teams[nm.a].name, T.teams[nm.b].name];
    if (!hasHumans){
      const res = simulateMatch({ size: s.size, diff: s.diff, minutes: s.minutes, specials: s.specials, seed: randomSeed() });
      recordResult(T, nm.round, nm.index, res.sa, res.sb, res.pen);
      continue;
    }
    startLiveMatch(r, { sides: [nm.a, nm.b], names, kits: [tourKit(names[0], nm.a), tourKit(names[1], nm.b)], diff: s.diff, round: nm.round, index: nm.index, label: roundName(T, nm.round) });
    return;
  }
  broadcastRoom(r);
  broadcastRoomList();
}

/* ---------- sabit adımlı döngü ---------- */
let last = performance.now(), acc = 0;
setInterval(() => {
  const now = performance.now();
  acc = Math.min(acc + now - last, 250); last = now;
  while (acc >= TICK){
    acc -= TICK;
    for (const r of rooms.values()) if (r.match) tickRoom(r);
  }
}, 8);

server.listen(PORT, () => console.log(`Bilye Ligi: http://localhost:${PORT}${BASE}/`));
