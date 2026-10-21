// Sunucu entegrasyon testi: gerçek sunucuyu başlatır, Socket.IO istemcileriyle oda kurar ve oynar
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 18000 + Math.floor(Math.random()*1000);
let proc;

before(async () => {
  proc = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res, rej) => {
    proc.stdout.on('data', d => { if (String(d).includes('localhost')) res(); });
    proc.on('exit', c => rej(new Error('sunucu kapandı: ' + c)));
  });
});
after(() => proc.kill());

// mesajları sırayla bekleyebilen küçük istemci
// transports: ['polling'] WebSocket'i engelleyen bir kurum proxy'sini taklit eder
function client(name, sessionKey, transports){
  const ws = io(`http://localhost:${PORT}`, { path: '/canli', reconnection: false, forceNew: true, ...(transports ? { transports } : {}) });
  const c = { ws, msgs: [], waiters: [], last: {} };
  ws.on('m', m => {
    c.last[m.type] = m; c.msgs.push(m);
    c.waiters = c.waiters.filter(w => { if (w.pred(m)){ w.res(m); return false; } return true; });
  });
  c.send = (type, data = {}) => ws.emit('m', { type, ...data });
  c.close = () => ws.disconnect();
  c.wait = (pred, ms = 5000) => new Promise((res, rej) => {
    const found = c.msgs.find(pred); if (found) return res(found);
    const t = setTimeout(() => rej(new Error('beklenen mesaj gelmedi')), ms);
    c.waiters.push({ pred, res: m => { clearTimeout(t); res(m); } });
  });
  c.ready = new Promise(res => ws.on('connect', () => { c.send('hello', { name, sessionKey }); res(); }));
  c.clear = () => { c.msgs = []; };
  return c;
}
const type = t => m => m.type === t;

test('statik dosyalar servis edilir, diğerleri gizli', async () => {
  const ok = await fetch(`http://localhost:${PORT}/client/main.js`);
  assert.equal(ok.status, 200);
  assert.equal((await fetch(`http://localhost:${PORT}/server/index.js`)).status, 404);
  assert.equal((await fetch(`http://localhost:${PORT}/package.json`)).status, 404);
  assert.equal((await fetch(`http://localhost:${PORT}/shared/../server/index.js`)).status, 404);
  // tarayıcının yüklediği Socket.IO istemcisi
  assert.equal((await fetch(`http://localhost:${PORT}/lib/sio.min.js`)).status, 200);
});

test('WebSocket engelliyken (yalnızca HTTP sorgulama) oda kurulur ve maç oynanır', async () => {
  const a = client('Proxy', undefined, ['polling']);
  await a.ready;
  await a.wait(type('welcome'));
  assert.equal(a.ws.io.engine.transport.name, 'polling');
  a.send('createRoom', { settings: { type: 'match', size: 1, minutes: 2 } });
  await a.wait(type('roomState'));
  a.send('start');
  const ms = await a.wait(type('matchStart'));
  const me = ms.roster.find(p => p.uid === a.last.welcome.id);
  await a.wait(type('snap'));
  const y0 = a.last.snap.s.players[me.id][1];
  const iv = setInterval(() => a.send('input', { x: 0, y: 1 }), 50);
  await new Promise(r => setTimeout(r, 900));
  clearInterval(iv);
  assert.ok(a.last.snap.s.players[me.id][1] > y0 + 30, 'polling ile de hareket etmeli');
  // polling'de de anlık görüntüler akmalı (sunucu bekleyenleri toplu gönderir)
  assert.ok(a.msgs.filter(type('snap')).length > 15);
  a.close();
});

test('oda kur, katıl, takım seç, maç oyna, kopup geri dön', async () => {
  const a = client('Ayşe'), b = client('Bora');
  await a.ready; await b.ready;
  const wa = await a.wait(type('welcome')), wb = await b.wait(type('welcome'));

  a.send('createRoom', { name: 'Test <odası>', password: 'gizli', settings: { type: 'match', size: 2, minutes: 2, diff: 0 } });
  const rs = await a.wait(m => m.type === 'roomState');
  assert.equal(rs.room.name, 'Test odası');      // < > temizlenir
  assert.equal(rs.room.hostId, wa.id);
  const list = await b.wait(m => m.type === 'rooms' && m.rooms.some(r => r.name === 'Test odası'));
  const listed = list.rooms.find(r => r.name === 'Test odası');
  const roomId = listed.id;
  assert.equal(listed.locked, true);

  b.send('joinRoom', { roomId, password: 'yanlış' });
  assert.equal((await b.wait(type('error'))).message, 'Şifre yanlış.');
  b.send('joinRoom', { roomId, password: 'gizli' });
  await b.wait(m => m.type === 'roomState' && m.room.members.length === 2);
  b.send('setTeam', { team: 1 });
  const st = await a.wait(m => m.type === 'roomState' && m.room.members.find(x => x.id === wb.id)?.team === 1);
  assert.equal(st.room.members.find(x => x.id === wa.id).team, 0);

  b.send('setLook', { look: { hair: 'topuz', skin: '#4e2f1c', face: 'hack' } });   // seçilen görünüm maça geçer
  // takım adı ve forma: yalnızca o takımın kaptanı (ilk giren); diğer takımın formasını alamaz
  a.send('setTeamCfg', { team: 1, name: 'Başka' });
  b.send('setTeamCfg', { name: 'Kartallar <b>', kit: 'limon' });
  assert.equal((await b.wait(m => m.type === 'error' && /diğer takımda/.test(m.message))).message, 'Bu forma diğer takımda.');
  b.send('setTeamCfg', { kit: 'siyahbeyaz' });
  a.send('setTeamCfg', { name: 'Aslanlar', kit: 'sarikirmizi' });
  const tc = await a.wait(m => m.type === 'roomState' && m.room.teamCfg[0].kit === 'sarikirmizi' && m.room.teamCfg[1].kit === 'siyahbeyaz' && m.room.teamCfg[1].name !== 'Buz');
  assert.equal(tc.room.teamCfg[1].name, 'Kartallar b');
  assert.equal(tc.room.teamCfg[0].name, 'Aslanlar');
  assert.deepEqual(tc.room.captains, [wa.id, wb.id]);
  // yalnızca oda sahibi başlatabilir
  b.send('start');
  a.send('start');
  const ms = await b.wait(type('matchStart'));
  assert.equal(ms.roster.length, 4);
  const pb = ms.roster.find(p => p.uid === wb.id);
  assert.equal(pb.team, 1);
  assert.deepEqual(ms.info.kits, ['sarikirmizi', 'siyahbeyaz']); assert.deepEqual(ms.info.teamNames, ['Aslanlar', 'Kartallar b']);
  assert.equal(pb.hair, 'topuz'); assert.equal(pb.skin, '#4e2f1c'); assert.notEqual(pb.face, 'hack');

  // B aşağı basar: sunucudaki oyuncusu aşağı gitmeli
  const snapOf = () => b.last.snap.s.players[pb.id];
  await b.wait(type('snap'));
  const y0 = snapOf()[1];
  const iv = setInterval(() => b.send('input', { x: 0, y: 1 }), 50);
  await new Promise(r => setTimeout(r, 800));
  clearInterval(iv);
  b.send('input', { x: 0, y: 0 });
  assert.ok(snapOf()[1] > y0 + 30, `B hareket etmeli: ${y0} -> ${snapOf()[1]}`);
  // anlık görüntüler ~30 Hz
  const count = b.msgs.filter(type('snap')).length;
  assert.ok(count > 15, `anlık görüntü sayısı az: ${count}`);

  // B kopar: yerine bot geçer (8. bit = bot)
  const key = b.last.welcome.sessionKey;
  b.close();
  await a.wait(m => m.type === 'roomState' && m.room.members.find(x => x.id === wb.id)?.connected === false);
  await new Promise(r => setTimeout(r, 100)); a.clear();
  const s1 = await a.wait(type('snap'));
  assert.ok(s1.s.players[pb.id][6] & 8, 'kopan oyuncunun yerine bot geçmeli');

  // aynı oturum anahtarıyla geri döner: aynı kimlik, maç yeniden gönderilir
  const b2 = client('Bora', key);
  await b2.ready;
  assert.equal((await b2.wait(type('welcome'))).id, wb.id);
  const ms2 = await b2.wait(type('matchStart'));
  assert.equal(ms2.roster.find(p => p.uid === wb.id).id, pb.id);
  await new Promise(r => setTimeout(r, 100)); a.clear();
  const s2 = await a.wait(type('snap'));
  assert.equal(s2.s.players[pb.id][6] & 8, 0, 'dönen oyuncu kontrolü geri almalı');

  // oda sahibi ayrılınca sahiplik devredilir
  a.send('leave');
  const after = await b2.wait(m => m.type === 'roomState' && m.room.members.length === 1);
  assert.equal(after.room.hostId, wb.id);
  a.close(); b2.close();
});

test('çevrimiçi turnuva: oyuncusuz maçlar simüle edilir, oyuncunun maçı canlı oynanır', async () => {
  const a = client('Cem');
  await a.ready;
  const w = await a.wait(type('welcome'));
  a.send('createRoom', { settings: { type: 'tournament', tSize: 4, size: 1, minutes: 2 } });
  const rs = await a.wait(type('roomState'));
  assert.equal(rs.room.members[0].team, 0);
  a.send('setTeam', { team: 2 });          // 3. takım (Nar)
  await a.wait(m => m.type === 'roomState' && m.room.members[0].team === 2);
  a.send('start');
  const ms = await a.wait(type('matchStart'), 15000);
  assert.equal(ms.label, 'Yarı final');
  assert.equal(ms.roster.find(p => p.uid === w.id).team, 0);   // oyuncunun takımı sol tarafta
  const playing = await a.wait(m => m.type === 'roomState' && m.room.phase === 'playing');
  // ilk yarı final (Limon–Buz) oyuncusuz olduğu için çoktan oynanmış olmalı
  const T = playing.room.tour;
  assert.notEqual(T.rounds[0][0].winner, null);
  assert.equal(T.rounds[0][1].winner, null);
  assert.deepEqual(playing.room.current.names, ['Nar', 'Erik']);
  a.close();
});

test('geçersiz girdiler sunucuyu bozmaz', async () => {
  const c = client('Hile');
  await c.ready; await c.wait(type('welcome'));
  c.ws.emit('m', 'bozuk'); c.ws.emit('m', null); c.ws.emit('baska-olay', {});
  c.send('input', { x: 1e9, y: 'a', special: 'hile' });
  c.send('setTeam', { team: 99 });
  c.send('joinRoom', { roomId: 'yok' });
  assert.equal((await c.wait(type('error'))).message, 'Oda bulunamadı.');
  c.send('listRooms');
  await c.wait(m => m.type === 'rooms' && c.msgs.filter(type('rooms')).length >= 2);
  c.close();
});

test('IIS alt uygulaması gibi önekle çalışır (ASPNETCORE_APPL_PATH, ASPNETCORE_PORT)', async () => {
  const port = PORT + 1;
  const env = { ...process.env, ASPNETCORE_PORT: String(port), ASPNETCORE_APPL_PATH: '/Bilye-Ligi' };
  delete env.PORT;
  const p2 = spawn(process.execPath, ['server/index.js'], { env, stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    await new Promise((res, rej) => {
      p2.stdout.on('data', d => { if (String(d).includes('localhost')) res(); });
      p2.on('exit', c => rej(new Error('sunucu kapandı: ' + c)));
    });
    const u = path => `http://localhost:${port}${path}`;
    // sondaki / olmadan gelirse yönlendir (göreli adresler için)
    const r = await fetch(u('/Bilye-Ligi'), { redirect: 'manual' });
    assert.equal(r.status, 301); assert.equal(r.headers.get('location'), '/Bilye-Ligi/');
    // IIS büyük/küçük harfe duyarsız: küçük harfle de açılır
    assert.equal((await fetch(u('/bilye-ligi/'))).status, 200);
    assert.equal((await fetch(u('/Bilye-Ligi/client/main.js'))).status, 200);
    assert.equal((await fetch(u('/Bilye-Ligi/lib/sio.min.js'))).status, 200);
    // tanı sayfası sunucunun gördüğünü gösterir
    const tani = await (await fetch(u('/bilye-ligi/tani'))).text();
    assert.ok(tani.includes('önek: /Bilye-Ligi'), tani); assert.ok(tani.includes('temizlenmiş adres: /tani'), tani);
    assert.equal((await fetch(u('/Bilye-Ligi/%E0%A4%A'))).status, 400);     // bozuk adres sunucuyu düşürmez
    // oyun bağlantısı önekli adresle
    // IIS öneki '/Bilye-Ligi' bildirirken tarayıcı küçük harfle bağlanır: yine çalışmalı (harf farkı)
    const s = io(u(''), { path: '/bilye-ligi/canli', reconnection: false, forceNew: true });
    const w = await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('bağlanamadı')), 5000);
      s.on('m', m => { if (m.type === 'welcome'){ clearTimeout(t); res(m); } });
      s.on('connect', () => s.emit('m', { type: 'hello', name: 'IIS' }));
    });
    assert.equal(w.name, 'IIS');
    s.disconnect();
  } finally { p2.kill(); }
});

test('kombo girdisi sunucuda tanınır (anlık görüntüde hazırlık görünür)', async () => {
  const a = client('Kombo');
  await a.ready;
  const w = await a.wait(type('welcome'));
  a.send('createRoom', { settings: { type: 'match', size: 1, minutes: 2 } });
  await a.wait(type('roomState'));
  a.send('start');
  const ms = await a.wait(type('matchStart'));
  const me = ms.roster.find(p => p.uid === w.id);
  // sıra karışık gönderilir, sunucu tek biçime çevirir
  const iv = setInterval(() => a.send('input', { special: 'fuze+falso' }), 40);
  const s = await a.wait(m => m.type === 'snap' && m.s.players[me.id][8] === 'falso+fuze');
  clearInterval(iv);
  assert.equal(s.s.players[me.id][8], 'falso+fuze');
  // geçersiz kombo yok sayılır
  a.send('input', { special: 'falso+hile' });
  a.close();
});

test('oda sahibi lobide bot seviyesini değiştirir, diğerleri değiştiremez', async () => {
  const a = client('Sahip'), b = client('Misafir');
  await a.ready; await b.ready;
  await a.wait(type('welcome')); await b.wait(type('welcome'));
  a.send('createRoom', { name: 'Seviye', settings: { type: 'match', size: 1, diff: 1 } });
  const rs = await a.wait(type('roomState'));
  b.send('joinRoom', { roomId: rs.room.id });
  await b.wait(m => m.type === 'roomState' && m.room.members.length === 2);
  b.send('setSettings', { settings: { diff: 0 } });          // misafir: yok sayılır
  a.send('setSettings', { settings: { diff: 2 } });          // sahip: geçerli
  const st = await b.wait(m => m.type === 'roomState' && m.room.settings.diff === 2);
  assert.equal(st.room.settings.size, 1, 'diğer ayarlar korunur');
  a.send('setSettings', { settings: { diff: 9 } });          // geçersiz değer: varsayılana döner, bozulmaz
  await b.wait(m => m.type === 'roomState' && [0, 1, 2].includes(m.room.settings.diff) && m.room.settings.diff !== 2);
  a.close(); b.close();
});

test('çevrimiçi oyuncular: bağlı herkes isim, IP ve nerede olduğuyla yayınlanır', async () => {
  const a = client('Kerem'), b = client('Leyla');
  await a.ready; await b.ready;
  const m = await a.wait(x => x.type === 'online' && ['Kerem', 'Leyla'].every(n => x.users.some(u => u.name === n)));
  const k = m.users.find(u => u.name === 'Kerem');
  assert.equal(k.ip, '127.0.0.1'); assert.equal(k.state, 'menüde'); assert.equal(k.room, null);
  b.send('setActivity', { act: 'match' });
  await a.wait(x => x.type === 'online' && x.users.some(u => u.name === 'Leyla' && u.state === 'tek maçta'));
  a.send('createRoom', { name: 'Görünürlük', settings: { type: 'match', size: 1 } });
  const m2 = await b.wait(x => x.type === 'online' && x.users.some(u => u.name === 'Kerem' && u.room === 'Görünürlük'));
  assert.equal(m2.users.find(u => u.name === 'Kerem').state, 'lobide');
  b.close();
  // çıkan, daha önce gelenler listesinde
  const m3 = await a.wait(x => x.type === 'online' && !x.users.some(u => u.name === 'Leyla'));
  assert.ok(m3.recent.some(u => u.name === 'Leyla' && u.ip === '127.0.0.1'));
  a.close();
});

test('lig tablosu: maç sonucu oyuncu adına göre birikir, sıralanır ve dosyaya yazılır', async () => {
  const os = await import('node:os'), fsm = await import('node:fs'), pathm = await import('node:path');
  const { createLeague, recordLeague, leagueRows } = await import('../server/league.js');
  const { createMatch } = await import('../shared/sim.js');
  const { statSummary } = await import('../shared/stats.js');
  const file = pathm.join(os.tmpdir(), 'bilye-lig-' + process.pid + '.json');
  try { fsm.unlinkSync(file); } catch(e){}
  const L = createLeague(file);
  const S = createMatch({ size: 2, seed: 1, humans: [{ team: 0, ctrl: 'net', name: 'Ayşe', uid: 1 }, { team: 1, ctrl: 'net', name: 'Bora', uid: 2 }] });
  S.score = [3, 1];
  const sum = statSummary(S); sum.players[S.players.find(p => p.uid === 1).id].g = 2; sum.mvp = { id: S.players.find(p => p.uid === 1).id };
  recordLeague(L, S, sum, uid => '10.0.0.' + uid);
  S.score = [2, 2]; S.penScore = [3, 4];   // Bora penaltıyla kazanır
  const sum2 = statSummary(S); sum2.mvp = { id: S.players.find(p => p.uid === 2).id };
  recordLeague(L, S, sum2);
  const rows = leagueRows(createLeague(file));   // dosyadan yeniden okunur
  const ay = rows.find(r => r.name === 'Ayşe'), bo = rows.find(r => r.name === 'Bora');
  assert.deepEqual([ay.o, ay.g, ay.b, ay.m, ay.ag, ay.yg, ay.gol, ay.mvp, ay.puan], [2, 1, 0, 1, 5, 3, 2, 1, 3]);
  assert.deepEqual([bo.o, bo.g, bo.m, bo.puan], [2, 1, 1, 3]);
  assert.equal(rows[0].name, 'Ayşe');   // eşit puanda averaj
  assert.equal(ay.ip, '10.0.0.1');
  fsm.unlinkSync(file);
});

test('hazır mesaj: odadakilere gider, sık gönderim yok sayılır, geçersiz numara yok sayılır', async () => {
  const a = client('Cem'), b = client('Deniz');
  await a.ready; await b.ready;
  await a.wait(type('welcome')); await b.wait(type('welcome'));
  a.send('createRoom', { name: 'Sohbet', settings: { type: 'match', size: 1 } });
  const rs = await a.wait(m => m.type === 'roomState');
  b.send('joinRoom', { roomId: rs.room.id });
  await b.wait(m => m.type === 'roomState' && m.room.members.length === 2);
  a.send('chat', { i: 0 }); a.send('chat', { i: 1 }); a.send('chat', { i: 99 });
  const m = await b.wait(x => x.type === 'chat');
  assert.deepEqual([m.from, m.text], ['Cem', 'Pas ver!']);
  await new Promise(r => setTimeout(r, 300));
  assert.equal(b.msgs.filter(x => x.type === 'chat').length, 1);   // ikincisi çok sık, üçüncüsü geçersiz
  a.close(); b.close();
});
