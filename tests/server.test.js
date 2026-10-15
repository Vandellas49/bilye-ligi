// Sunucu entegrasyon testi: gerçek sunucuyu başlatır, WebSocket istemcileriyle oda kurar ve oynar
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

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
function client(name, sessionKey){
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  const c = { ws, msgs: [], waiters: [], last: {} };
  ws.on('message', d => {
    const m = JSON.parse(d); c.last[m.type] = m; c.msgs.push(m);
    c.waiters = c.waiters.filter(w => { if (w.pred(m)){ w.res(m); return false; } return true; });
  });
  c.send = (type, data = {}) => ws.send(JSON.stringify({ type, ...data }));
  c.wait = (pred, ms = 5000) => new Promise((res, rej) => {
    const found = c.msgs.find(pred); if (found) return res(found);
    const t = setTimeout(() => rej(new Error('beklenen mesaj gelmedi')), ms);
    c.waiters.push({ pred, res: m => { clearTimeout(t); res(m); } });
  });
  c.ready = new Promise(res => ws.on('open', () => { c.send('hello', { name, sessionKey }); res(); }));
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
});

test('oda kur, katıl, takım seç, maç oyna, kopup geri dön', async () => {
  const a = client('Ayşe'), b = client('Bora');
  await a.ready; await b.ready;
  const wa = await a.wait(type('welcome')), wb = await b.wait(type('welcome'));

  a.send('createRoom', { name: 'Test <odası>', password: 'gizli', settings: { type: 'match', size: 2, minutes: 2, diff: 0 } });
  const rs = await a.wait(m => m.type === 'roomState');
  assert.equal(rs.room.name, 'Test odası');      // < > temizlenir
  assert.equal(rs.room.hostId, wa.id);
  const list = await b.wait(m => m.type === 'rooms' && m.rooms.length > 0);
  const roomId = list.rooms[0].id;
  assert.equal(list.rooms[0].locked, true);

  b.send('joinRoom', { roomId, password: 'yanlış' });
  assert.equal((await b.wait(type('error'))).message, 'Şifre yanlış.');
  b.send('joinRoom', { roomId, password: 'gizli' });
  await b.wait(m => m.type === 'roomState' && m.room.members.length === 2);
  b.send('setTeam', { team: 1 });
  const st = await a.wait(m => m.type === 'roomState' && m.room.members.find(x => x.id === wb.id)?.team === 1);
  assert.equal(st.room.members.find(x => x.id === wa.id).team, 0);

  // yalnızca oda sahibi başlatabilir
  b.send('start');
  a.send('start');
  const ms = await b.wait(type('matchStart'));
  assert.equal(ms.roster.length, 4);
  const pb = ms.roster.find(p => p.uid === wb.id);
  assert.equal(pb.team, 1);

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
  b.ws.close();
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
  a.ws.close(); b2.ws.close();
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
  a.ws.close();
});

test('geçersiz girdiler sunucuyu bozmaz', async () => {
  const c = client('Hile');
  await c.ready; await c.wait(type('welcome'));
  c.ws.send('bozuk json');
  c.send('input', { x: 1e9, y: 'a', special: 'hile' });
  c.send('setTeam', { team: 99 });
  c.send('joinRoom', { roomId: 'yok' });
  assert.equal((await c.wait(type('error'))).message, 'Oda bulunamadı.');
  c.send('listRooms');
  await c.wait(m => m.type === 'rooms' && c.msgs.filter(type('rooms')).length >= 2);
  c.ws.close();
});
