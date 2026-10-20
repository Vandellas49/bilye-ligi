/* ---------- çevrimiçi bağlantı ----------
   Sunucuyla Socket.IO bağlantısı (önce HTTP uzun sorgulama, ağ izin verirse WebSocket),
   oturum anahtarıyla yeniden bağlanma ve sunucudan gelen maçın enterpolasyonla oynatılması.
   Socket.IO istemcisi index.html'de sunucunun verdiği lib/sio.min.js ile yüklenir (global io). */
import { TICK } from '../shared/constants.js';
import { createView, applySnapshot, lerpView } from '../shared/net.js';

const STORE = 'bilye-online';
const INTERP_TICKS = 6;   // ~100 ms geriden çiz: iki anlık görüntü arasında yumuşak hareket

function loadStore(){ try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch(e){ return {}; } }
function saveStore(o){ try { localStorage.setItem(STORE, JSON.stringify(o)); } catch(e){} }

export const net = {
  socket: null, status: 'off',   // 'off' | 'connecting' | 'on' | 'reconnecting' | 'failed'
  slow: false,                   // WebSocket'e geçilemedi, HTTP uzun sorgulamayla devam ediliyor
  ping: 0,                       // ölçülen gidiş-dönüş süresi (ms, yumuşatılmış)
  me: null,                      // { id, name }
  name: loadStore().name || '',
  look: null,                    // menüde seçilen oyuncu görünümü (main.js verir)
  handlers: {},                  // type -> fn(msg); ayrıca 'status' -> fn(status)
  wanted: false, everConnected: false, fails: 0,
};

function setStatus(s){ net.status = s; net.handlers.status && net.handlers.status(s); }

export function connect(name){
  if (name) net.name = name;
  net.wanted = true;
  if (net.socket){ if (!net.socket.connected) net.socket.connect(); return; }
  // istemci betiği yüklenemediyse oyun Bilye Ligi sunucusundan açılmamıştır
  if (typeof io !== 'function'){ setStatus('failed'); return; }
  setStatus('connecting');
  // sayfa bir alt adreste olabilir (ör. IIS'te /bilye-ligi/): bağlantı adresi sayfanın klasörüne göre
  const base = location.pathname.replace(/[^/]*$/, '');
  const s = io({ path: base + 'canli', reconnectionDelay: 600, reconnectionDelayMax: 4000, timeout: 15000 });
  net.socket = s;
  s.on('connect', () => {
    net.fails = 0;
    const engine = s.io.engine;
    net.slow = false;
    // birkaç saniyede WebSocket'e geçilemezse ağ engelliyor demektir
    const check = setTimeout(() => { if (s.connected && engine.transport.name === 'polling'){ net.slow = true; if (net.me) setStatus('on'); } }, 3000);
    engine.once('upgrade', () => { clearTimeout(check); net.slow = false; if (net.me) setStatus('on'); });
    s.emit('m', { type: 'hello', name: net.name || 'Oyuncu', sessionKey: loadStore().key, look: net.look });
  });
  s.on('m', m => {
    if (!m || typeof m.type !== 'string') return;
    if (m.type === 'pong'){
      const rtt = performance.now() - m.t;
      if (rtt >= 0 && rtt < 10000) net.ping = net.ping ? net.ping + (rtt - net.ping)*.3 : rtt;
      return;
    }
    if (m.type === 'welcome'){
      net.me = { id: m.id, name: m.name }; net.everConnected = true;
      saveStore({ name: m.name, key: m.sessionKey });
      setStatus('on');
    }
    const h = net.handlers[m.type];
    if (h) h(m);
  });
  s.on('disconnect', reason => {
    if (!net.wanted) return setStatus('off');
    // sunucu bağlantıyı kendisi kestiyse (aynı oturum başka sekmede açıldı) tekrar deneme
    if (reason === 'io server disconnect') return setStatus('failed');
    setStatus('reconnecting');   // Socket.IO kendisi yeniden bağlanır, hello aynı oturum anahtarıyla gider
  });
  s.on('connect_error', () => {
    // hiç bağlanamadıysak (sunucu yok ya da ağ tamamen engelliyor) çabuk vazgeç
    if (!net.everConnected && ++net.fails >= 3){ s.disconnect(); net.socket = null; setStatus('failed'); return; }
    setStatus(net.everConnected ? 'reconnecting' : 'connecting');
  });
}

// gidiş-dönüş süresi (ping) ölçümü
setInterval(() => { if (net.me) send('ping', { t: performance.now() }); }, 2000);

export function disconnect(){
  net.wanted = false;
  if (net.socket){ net.socket.disconnect(); net.socket = null; }
  setStatus('off');
}

export function send(type, data = {}){
  if (net.socket && net.socket.connected) net.socket.emit('m', { type, ...data });
}

export function setName(name){
  net.name = name;
  const st = loadStore(); st.name = name; saveStore(st);
  send('setName', { name });
}

/* ---------- girdi gönderimi ---------- */
let lastSent = '', lastSendT = 0, seq = 0;
const q = v => Math.round(v*100)/100;
export function sendInput(inp, now){
  const msg = { x: q(Math.max(-1, Math.min(1, inp.x))), y: q(Math.max(-1, Math.min(1, inp.y))), kick: inp.kick, special: inp.special,
    call: inp.call, hold: inp.hold, sprint: inp.sprint, slide: inp.slide, press: !!inp.press, assist: inp.assist !== false, kind: inp.kind || 'pass' };
  const key = JSON.stringify(msg);
  // değişince hemen (en fazla ~60/sn), değişmese de 250 ms'de bir
  if ((key !== lastSent && now - lastSendT >= 15) || now - lastSendT >= 250){
    lastSent = key; lastSendT = now;
    send('input', { seq: ++seq, ...msg });
  }
}

/* ---------- sunucu maçının oynatılması ---------- */
/* Uyarlanabilir tampon: anlık görüntüler düzensiz geliyorsa (ör. HTTP uzun sorgulamada
   paketler topluca gelir) çizim biraz daha geriden yapılır ki saha donup sıçramasın.
   M.delay: şu anki gecikme (tick); geç kalmalar arttıkça hızla büyür, düzelince yavaşça küçülür. */
const MAX_DELAY_TICKS = 36;      // en fazla ~600 ms
const LATE_WINDOW_MS = 4000;     // son 4 sn'deki en büyük gecikmeye göre ayarla

export function createNetMatch(msg, myUid){
  const view = createView(msg.roster, msg.info, myUid);
  const M = { view, snaps: [], pend: [], est: null, label: msg.label, late: [], delay: INTERP_TICKS };
  if (msg.snap) pushSnap(M, msg.snap, [], performance.now());
  return M;
}

export function pushSnap(M, s, ev, now){
  M.snaps.push(s);
  if (M.snaps.length > 80) M.snaps.shift();
  if (ev && ev.length) M.pend.push({ t: s.t, ev });
  // sunucu saatini tahmin et: en erken gelişlere hızlı, geç gelişlere yavaş uyum
  const sample = now - s.t*TICK;
  if (M.est === null || Math.abs(sample - M.est) > 1500) M.est = sample;
  else M.est += (sample - M.est)*(sample < M.est ? .2 : .01);
  // bu görüntü beklenenden ne kadar geç geldi
  M.late.push({ at: now, ms: Math.max(0, sample - M.est) });
  while (M.late.length && now - M.late[0].at > LATE_WINDOW_MS) M.late.shift();
}

// görünümü şimdiki çizim anına göre güncelle; zamanı gelen olayları döndür
export function updateNetMatch(M, now){
  const S = M.snaps;
  if (!S.length) return [];
  const worst = M.late.reduce((m, l) => Math.max(m, l.ms), 0);
  const target = Math.min(MAX_DELAY_TICKS, INTERP_TICKS + worst/TICK + 1);
  M.delay += target > M.delay ? Math.min(target - M.delay, 1) : -Math.min(M.delay - target, .02);
  const rt = (now - M.est)/TICK - M.delay;
  let i = S.findIndex(s => s.t >= rt);
  if (i === -1){ i = S.length - 1; M.starved = (M.starved || 0) + 1; }   // elde yeni görüntü yok: saha donar
  const b = S[i], a = i > 0 ? S[i - 1] : b;
  applySnapshot(M.view, b);
  if (a !== b && b.t > a.t) lerpView(M.view, a, b, Math.max(0, Math.min(1, (rt - a.t)/(b.t - a.t))));
  if (i > 2) S.splice(0, i - 2);
  const due = [];
  while (M.pend.length && M.pend[0].t <= rt) due.push(...M.pend.shift().ev);
  return due;
}

// maç bitince bekleyen olayları hemen ver
export function flushNetMatch(M){
  const due = [];
  while (M.pend.length) due.push(...M.pend.shift().ev);
  if (M.snaps.length) applySnapshot(M.view, M.snaps[M.snaps.length - 1]);
  return due;
}
