// Simülasyon testleri: tarayıcı olmadan, Node üzerinde çalışır (npm test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step, sanitizeInput } from '../shared/sim.js';
import { KICK, CHARGE_TICKS, KICK_MIN, KICK_MAX, normShot } from '../shared/constants.js';

// bot maçı oynat, her tick'in olaylarını topla
function play(settings, ticks, inputsFor = () => ({})){
  const S = createMatch(settings);
  const events = [];
  for (let i = 0; i < ticks && S.phase !== 'over'; i++) events.push(...step(S, inputsFor(S, i)));
  return { S, events };
}

// karşılaştırma için durumun özeti (oyuncu referansları yerine id)
const digest = S => JSON.stringify({
  t: S.t, score: S.score, phase: S.phase, owner: S.owner && S.owner.id,
  ball: [S.ball.x, S.ball.y, S.ball.vx, S.ball.vy],
  players: S.players.map(p => [p.x, p.y, p.vx, p.vy, p.sta, p.face, p.name]),
});

test('aynı tohum aynı maçı üretir', () => {
  const cfg = { size: 3, diff: 2, minutes: 1, seed: 12345 };
  const a = play(cfg, 3600), b = play(cfg, 3600);
  assert.equal(digest(a.S), digest(b.S));
  assert.deepEqual(a.events.map(e => e.type), b.events.map(e => e.type));
});

test('farklı tohum farklı maç üretir', () => {
  const a = play({ size: 3, seed: 1 }, 1200), b = play({ size: 3, seed: 2 }, 1200);
  assert.notEqual(digest(a.S), digest(b.S));
});

test('süreli bot maçı biter, vuruş ve gol olayları üretir', () => {
  let goals = 0, kicks = 0, ends = 0;
  for (let seed = 1; seed <= 4; seed++){
    // 1 dakikalık maç; berabere biterse altın gol için ek süre
    const { S, events } = play({ size: 3, diff: 2, minutes: 1, seed }, 60*60*4);
    goals += events.filter(e => e.type === 'goal').length;
    kicks += events.filter(e => e.type === 'kick').length;
    ends += events.filter(e => e.type === 'end').length;
    if (S.phase === 'over') assert.notEqual(S.score[0], S.score[1], 'maç berabere bitmemeli (altın gol)');
    for (const p of S.players){ assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'oyuncu konumu sayı olmalı'); }
  }
  assert.ok(kicks > 20, `vuruş sayısı az: ${kicks}`);
  assert.ok(goals > 0, 'hiç gol olmadı');
  assert.ok(ends > 0, 'hiçbir maç bitmedi');
});

test('süresiz maç (demo) bitmez ve süre azalmaz', () => {
  const { S, events } = play({ size: 2, minutes: 0, seed: 7 }, 60*60*3);
  assert.notEqual(S.phase, 'over');
  assert.equal(events.filter(e => e.type === 'end').length, 0);
});

test('insan girdisi oyuncu id ile verilir', () => {
  const S = createMatch({ size: 1, humans: [{ team: 0, ctrl: 'h1', name: 'Sen' }], seed: 3 });
  const me = S.players.find(p => p.ctrl === 'h1');
  const y0 = me.y;
  for (let i = 0; i < 30; i++) step(S, { [me.id]: { x: 0, y: 1 } });
  assert.ok(me.y > y0 + 20, 'aşağı basılınca oyuncu aşağı gitmeli');
  const x0 = me.x;
  for (let i = 0; i < 30; i++) step(S, {});   // girdi yoksa boş girdi sayılır
  assert.ok(Math.abs(me.x - x0) < 5);
});

test('özel şutlar kapalıyken insan özel şut kullanamaz', () => {
  const S = createMatch({ size: 1, humans: [{ team: 0, ctrl: 'h1', name: 'Sen' }], specials: false, seed: 3 });
  const me = S.players.find(p => p.ctrl === 'h1');
  step(S, { [me.id]: { special: 'fuze' } });
  assert.equal(me.armed, null);
});

test('girdi sınırlanır', () => {
  const i = sanitizeInput({ x: 30, y: 40, kick: 1, special: 'hile', sprint: 'evet' });
  assert.ok(Math.abs(Math.hypot(i.x, i.y) - 1) < 1e-9);
  assert.equal(i.kick, true); assert.equal(i.special, null); assert.equal(i.sprint, true);
  const n = sanitizeInput({ x: NaN, y: Infinity });
  assert.equal(n.x, 0); assert.equal(n.y, 0);
  assert.equal(sanitizeInput(null).kick, false);
});

test('simülasyon Math.random kullanmaz', () => {
  const orig = Math.random;
  Math.random = () => { throw new Error('Math.random çağrıldı'); };
  try { play({ size: 3, diff: 1, minutes: 1, seed: 99, humans: [{ team: 0, ctrl: 'h1', name: 'Sen' }] }, 3000); }
  finally { Math.random = orig; }
});

/* ---------- şut güç barı ---------- */

// insan oyuncunun önüne topu koy, tuşu n tick basılı tutup bırak, topun hızını ölç
function chargedKick(holdTicks){
  const S = createMatch({ size: 1, humans: [{ team: 0, ctrl: 'h1', name: 'Sen' }], seed: 5, kickoffTeam: 0 });
  const me = S.players.find(p => p.ctrl === 'h1'), op = S.players.find(p => p !== me);
  op.x = 900; op.y = 80;
  // top uzakta beklerken bar dolar
  S.ball.x = 100; S.ball.y = 500;
  let fired = null;
  for (let i = 0; i < holdTicks; i++){
    step(S, { [me.id]: { kick: true } });
    if (me.shot && fired === null) fired = i + 1;
  }
  const charge = me.charge;
  step(S, { [me.id]: { kick: false } });   // bırak: vuruş bekler
  // topu oyuncunun hemen önüne getir, bekleyen vuruş gerçekleşsin
  Object.assign(S.ball, { x: me.x + me.r + S.ball.r + 2, y: me.y, vx: 0, vy: 0, z: 0 });
  me.vx = me.vy = 0;
  step(S, {});
  return { speed: Math.hypot(S.ball.vx, S.ball.vy), charge, fired, me };
}

test('güç barı: kısa dokunuş yumuşak, uzun basış sert vurur', () => {
  const tap = chargedKick(2), half = chargedKick(Math.floor(CHARGE_TICKS/2)), full = chargedKick(CHARGE_TICKS - 1);
  assert.ok(tap.speed > KICK*KICK_MIN*.9 && tap.speed < KICK*.9, `dokunuş: ${tap.speed}`);
  assert.ok(half.speed > tap.speed && full.speed > half.speed, `${tap.speed} < ${half.speed} < ${full.speed}`);
  assert.ok(full.speed > KICK*1.2 && full.speed <= KICK*KICK_MAX*1.05, `tam: ${full.speed}`);
  assert.ok(Math.abs(half.charge - .5) < .05);
});

test('güç barı: dolunca kendiliğinden vurur ve tuş bırakılana kadar yeniden dolmaz', () => {
  const r = chargedKick(CHARGE_TICKS + 30);
  assert.equal(r.fired, CHARGE_TICKS);          // tam dolduğu tick'te vuruş hazırlanır
  assert.equal(r.charge, 0);                    // kilitli: tutmaya devam etse de dolmuyor
});

test('güç barı: rakip toptayken dolmaz (tuş müdahale yapar)', () => {
  const S = createMatch({ size: 1, humans: [{ team: 0, ctrl: 'h1', name: 'Sen' }], seed: 5, kickoffTeam: 1 });
  const me = S.players.find(p => p.ctrl === 'h1'), op = S.players.find(p => p !== me);
  S.phase = 'play'; S.owner = op;
  step(S, { [me.id]: { kick: true } });
  assert.equal(me.charge, 0);
});

test('botların vuruş gücü değişmedi', () => {
  // botlar sabit güçle vurur (KICK); birkaç maçtaki tüm bot vuruşlarına bak
  let max = 0, kicks = 0;
  for (let seed = 1; seed <= 3; seed++){
    const S = createMatch({ size: 3, seed, kickoffTeam: 0 });
    for (let i = 0; i < 1500; i++){
      const before = Math.hypot(S.ball.vx, S.ball.vy);
      const ev = step(S, {});
      if (ev.some(e => e.type === 'kick')){ kicks++; max = Math.max(max, Math.hypot(S.ball.vx, S.ball.vy) - before); }
    }
  }
  assert.ok(kicks > 10, `bot vuruş sayısı: ${kicks}`);
  assert.ok(max < KICK*1.3, `bot vuruşu: ${max}`);
});

/* ---------- kombolar ---------- */

// insan oyuncu topu ayağında tutarken verilen özel şut girdileriyle vurur; topun durumunu döndürür
function comboKick(presses){
  const S = createMatch({ size: 1, humans: [{ team: 0, ctrl: 'h1', name: 'Sen' }], seed: 5, kickoffTeam: 0 });
  const me = S.players.find(p => p.ctrl === 'h1'), op = S.players.find(p => p !== me);
  Object.assign(op, { x: 900, y: 60 });
  S.phase = 'play';
  Object.assign(me, { x: 300, y: 280, vx: 0, vy: 0, dirA: 0 });
  Object.assign(S.ball, { x: 336, y: 280, vx: 0, vy: 0, z: 0 });
  let shot = null;
  for (let i = 0; i < 30 && !shot; i++){
    const ev = step(S, { [me.id]: { special: presses[i] ?? null } });
    shot = ev.find(e => e.type === 'special');
  }
  return { shot: shot && shot.shot, ball: { ...S.ball, speed: Math.hypot(S.ball.vx, S.ball.vy) }, cd: { ...me.cd } };
}

test('kombo anahtarı tek biçime çevrilir', () => {
  assert.equal(normShot('fuze+falso'), 'falso+fuze');
  assert.equal(normShot(['asirtma', 'fuze', 'falso']), 'falso+fuze+asirtma');
  assert.equal(normShot('falso'), 'falso');
  assert.equal(normShot('falso+hile'), null);
  assert.equal(normShot(''), null);
});

test('aynı anda basılan tuşlar kombo olur: Q+E falsolu füze', () => {
  const r = comboKick(['falso+fuze']);
  assert.equal(r.shot, 'falso+fuze');
  assert.ok(r.ball.curve !== 0 && r.ball.fire > 0 && r.ball.z === 0);
  assert.ok(r.cd.falso > 0 && r.cd.fuze > 0 && r.cd.asirtma === 0, 'kullanılan şutlar beklemeye girer');
});

test('kısa arayla basılan tuşlar da kombo olur: önce E, 3 tick sonra R (havadan füze)', () => {
  const r = comboKick(['fuze', null, null, 'asirtma']);
  assert.equal(r.shot, 'fuze+asirtma');
  assert.ok(r.ball.z > 0 && r.ball.fire > 0 && r.ball.curve === 0);
});

test('üçlü kombo: havadan, hızlı, falsolu', () => {
  const r = comboKick(['falso+fuze+asirtma']);
  assert.equal(r.shot, 'falso+fuze+asirtma');
  assert.ok(r.ball.z > 0 && r.ball.fire > 0 && r.ball.curve !== 0 && r.ball.speed > 8);
});

test('tek tuş eskisi gibi çalışır, beklemedeki şut komboya katılmaz', () => {
  assert.equal(comboKick(['asirtma']).shot, 'asirtma');
  // füze beklemedeyken Q+E: yalnızca falso atılır
  const S = createMatch({ size: 1, humans: [{ team: 0, ctrl: 'h1', name: 'Sen' }], seed: 5, kickoffTeam: 0 });
  const me = S.players.find(p => p.ctrl === 'h1');
  S.players.find(p => p !== me).x = 900; S.phase = 'play';
  Object.assign(me, { x: 300, y: 280, vx: 0, vy: 0, dirA: 0 }); Object.assign(S.ball, { x: 336, y: 280, vx: 0, vy: 0 });
  me.cd.fuze = 999;
  let shot;
  for (let i = 0; i < 30 && !shot; i++) shot = step(S, { [me.id]: { special: 'falso+fuze' } }).find(e => e.type === 'special');
  assert.equal(shot.shot, 'falso');
});

test('depar süresi: topsuz ~4 sn, sonra yorulur', async () => {
  const { SPRINT_DRAIN } = await import('../shared/constants.js');
  const S = createMatch({ size: 1, humans: [{ team: 0, ctrl: 'h1', name: 'Sen' }], seed: 3, kickoffTeam: 1 });
  const me = S.players.find(p => p.ctrl === 'h1');
  // rakip girdisiz insan: hareket etmez, gol atıp ölçümü bozmaz
  S.players.find(p => p !== me).ctrl = 'h2';
  S.phase = 'play';
  let ticks = 0;
  while (!me.tired && ticks < 1000){ step(S, { [me.id]: { y: ticks % 120 < 60 ? 1 : -1, sprint: true } }); ticks++; }
  assert.ok(Math.abs(ticks - 1/SPRINT_DRAIN) < 5, `depar ${ticks} tick sürdü`);
  assert.ok(ticks/60 > 3.5, `depar ${(ticks/60).toFixed(1)} sn`);
});
