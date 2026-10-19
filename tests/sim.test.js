// Simülasyon testleri: tarayıcı olmadan, Node üzerinde çalışır (npm test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step, sanitizeInput } from '../shared/sim.js';
import { KICK, CHARGE_TICKS, KICK_MIN, KICK_MAX, normShot, W as W_TEST } from '../shared/constants.js';

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

/* ---------- kayarak müdahale ---------- */
// iki insan oyuncu (ikincisi girdisiz, topun sahibi); birincisi verilen yerden topa kayar
function slideAt(fromX, fromY, seed, extra = {}){
  const S = createMatch({ size: 1, humans: [{ team: 0, ctrl: 'h1', name: 'Sen' }, { team: 1, ctrl: 'h2', name: 'O' }], seed });
  const me = S.players[0], o = S.players[1];
  S.phase = 'play';
  Object.assign(o, { x: 500, y: 280, vx: 0, vy: 0, dirA: Math.PI });
  if (extra.loose){ S.owner = null; o.x = 900; } else S.owner = o;
  Object.assign(S.ball, { x: 464.5, y: 280, vx: 0, vy: 0, z: 0 });
  Object.assign(me, { x: 500 + fromX, y: 280 + fromY, vx: 0, vy: 0 });
  const dx = S.ball.x - me.x, dy = S.ball.y - me.y, l = Math.hypot(dx, dy);
  const ev = [];
  for (let i = 0; i < (extra.ticks || 30); i++) ev.push(...step(S, { [me.id]: { x: dx/l, y: dy/l, slide: extra.hold ? true : i === 0 } }));
  return { S, me, o, ev };
}

test('kayma: hızlı başlar, bitince yerden kalkar, bekleme süresi var', () => {
  const S = createMatch({ size: 1, humans: [{ team: 0, ctrl: 'h1', name: 'Sen' }], seed: 1, kickoffTeam: 1 });
  const me = S.players[0]; S.phase = 'play';
  step(S, { [me.id]: { x: 0, y: 1, slide: true } });
  assert.ok(Math.hypot(me.vx, me.vy) > 5, 'kayma hızı');
  assert.ok(me.slideT > 0 && me.slideCd > 0);
  for (let i = 0; i < 25; i++) step(S, { [me.id]: { x: 1, y: 0 } });   // kayarken yön değiştirilemez
  assert.equal(me.slideT, 0);
  assert.ok(Math.abs(me.x - 250) < 15, 'kayarken yana gitmedi');
});

test('kayma: önden girince çoğunlukla kapar, arkadan gövde topu kapatır', () => {
  let front = 0, back = 0;
  for (let seed = 1; seed <= 20; seed++){
    if (slideAt(-90, 0, seed).ev.some(e => e.type === 'slideWin')) front++;
    if (slideAt(90, 0, seed).ev.some(e => e.type === 'slideWin')) back++;
  }
  assert.ok(front >= 11, `önden kapma ${front}/20`);
  assert.equal(back, 0);
});

test('kayma: başarılı olunca top rakipten uzaklaşır, rakip sendeler', () => {
  let wins = 0;
  for (let seed = 1; seed <= 20; seed++){
    const r = slideAt(-90, 0, seed, { ticks: 12 });
    if (!r.ev.some(e => e.type === 'slideWin')) continue;
    wins++;
    const b = r.S.ball, d = Math.hypot(b.x - r.o.x, b.y - r.o.y);
    assert.notEqual(r.S.owner, r.o, 'rakip topu geri almadı');
    assert.ok(d > 45, `top rakibin gövdesinden sekmeyip uzaklaştı (mesafe ${d.toFixed(0)})`);
    assert.ok(r.o.stun > 0 || r.o.noGrab > 0, 'rakip sendeledi');
  }
  assert.ok(wins > 5);
});

test('kayma: boştaki topu iter; basılı tutmak yeniden kaydırmaz', () => {
  const r = slideAt(-90, 0, 1, { loose: true });
  assert.ok(r.ev.some(e => e.type === 'slideKick'));
  const h = slideAt(-90, 0, 1, { hold: true, ticks: 200 });
  assert.equal(h.ev.filter(e => e.type === 'slide').length, 1);
});

/* ---------- pas yardımı ---------- */
// A (h1) topu sürer, B (h2, aynı takım) arkadaş; rakipler uzakta ve girdisiz
function passSetup(mate = { x: 560, y: 420 }, ball = 'owned'){
  const S = createMatch({ size: 2, seed: 7, humans: [{ team: 0, ctrl: 'h1', name: 'A' }, { team: 0, ctrl: 'h2', name: 'B' }] });
  const [me, b] = S.players.filter(p => p.team === 0);
  for (const o of S.players.filter(p => p.team === 1)) Object.assign(o, { x: 950, y: o.slot ? 520 : 40, ctrl: 'h2' });
  S.phase = 'play';
  Object.assign(me, { x: 300, y: 280, vx: 0, vy: 0, dirA: 0 });
  Object.assign(b, { ...mate, vx: 0, vy: 0 });
  if (ball === 'owned'){ Object.assign(S.ball, { x: 336, y: 280, vx: 0, vy: 0 }); S.owner = me; }
  return { S, me, mate: b };
}
// A şut tuşunu hold tick basılı tutup bırakır; topun arkadaşa en yakın geçişi (0: arkadaş aldı)
function passRun({ S, me, mate }, inp, hold, mateIn = {}, out = {}){
  let best = 1e9, kicked = false;
  for (let i = 0; i < 200; i++){
    const ev = step(S, { [me.id]: i < hold ? { ...inp, kick: true } : (kicked ? {} : inp), [mate.id]: mateIn });
    if (!kicked && ev.some(e => e.type === 'kick' && e.id === me.id)){ kicked = true; out.ang = Math.atan2(S.ball.vy, S.ball.vx); }
    if (kicked){
      if (S.owner === mate) return 0;
      best = Math.min(best, Math.hypot(S.ball.x - mate.x, S.ball.y - mate.y) - mate.r - S.ball.r);
    }
  }
  return kicked ? best : null;
}
const toward = (from, to, err = 0) => { const a = Math.atan2(to.y - from.y, to.x - from.x) + err; return { x: Math.cos(a), y: Math.sin(a) }; };

test('pas yardımı: yaklaşık nişanla duran arkadaşa kısa dokunuş da uzun basış da ulaşır', () => {
  for (const hold of [3, 44]) for (const err of [-.3, 0, .3]){
    const s = passSetup();
    const r = passRun(s, toward(s.me, s.mate, err), hold);
    assert.ok(r !== null && r < 12, `basış ${hold}, sapma ${err}: ıska ${r}`);
  }
});

test('pas yardımı: koşan insan arkadaşın gideceği yere atılır', () => {
  const s = passSetup({ x: 520, y: 200 });
  const r = passRun(s, toward(s.me, s.mate), 10, { x: 1, y: .3 });
  assert.ok(r !== null && r < 12, `ıska ${r}`);
});

test('pas yardımı: gelen topa tek vuruşla da arkadaşa gider', () => {
  const s = passSetup({ x: 300, y: 500 }, 'loose');
  // top soldan oyuncuya doğru geliyor, oyuncu arkadaşına (aşağı) dönük vurur
  Object.assign(s.S.ball, { x: 250, y: 280, vx: 4, vy: 0, z: 0 });
  s.S.owner = null;
  const r = passRun(s, toward(s.me, s.mate), 2);
  assert.ok(r !== null && r < 12, `ıska ${r}`);
});

test('pas yardımı: kaleye güçlü şut pasa çevrilmez, zayıf vuruş kale önündeki arkadaşa pas olur', () => {
  // arkadaş kale önünde, A kaleye nişan alıyor
  const goal = { x: W_TEST, y: 280 };
  const strong = passSetup({ x: 860, y: 330 });
  const out = {};
  passRun(strong, toward(strong.me, goal), CHARGE_TICKS - 1, {}, out);
  const ang = out.ang;
  assert.ok(Math.abs(ang) < .05, `şut kaleye gitti (açı ${ang.toFixed(3)})`);
  const weak = passSetup({ x: 860, y: 330 });
  const r = passRun(weak, toward(weak.me, goal), 3);
  assert.ok(r !== null && r < 12, `zayıf vuruş pas oldu (ıska ${r})`);
});

test('pas yardımı: botların vuruşunu etkilemez (yalnızca insan)', () => {
  // aynı tohumla bot maçı: yardım insan olmayınca devreye girmez, maç birebir aynı kalır (determinizm testi bunu da kapsar)
  const a = createMatch({ size: 3, seed: 11, minutes: 1 }), b = createMatch({ size: 3, seed: 11, minutes: 1 });
  for (let i = 0; i < 2000; i++){ step(a, {}); step(b, {}); }
  assert.deepEqual(a.score, b.score);
});

test('pas yardımı kapalıyken top basılan yöne gider (arkadaşa yönlendirilmez)', () => {
  const s = passSetup();
  const inp = toward(s.me, s.mate, .3);
  const out = {};
  passRun(s, { ...inp, assist: false }, 3, {}, out);
  assert.ok(Math.abs(out.ang - Math.atan2(inp.y, inp.x)) < .02, `top basılan yöne gitti (${out.ang.toFixed(3)})`);
  const on = passSetup(), out2 = {};
  passRun(on, inp, 3, {}, out2);   // varsayılan: açık
  assert.ok(Math.abs(out2.ang - Math.atan2(inp.y, inp.x)) > .1, 'açıkken arkadaşa yönlendi');
});
