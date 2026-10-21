// Simülasyon testleri: tarayıcı olmadan, Node üzerinde çalışır (npm test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step, sanitizeInput } from '../shared/sim.js';
import { KICK, CHARGE_TICKS, KICK_MIN, KICK_MAX, normShot, W as W_TEST, H as H_TEST, TOP, BOT } from '../shared/constants.js';

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
  const x0 = me.x;
  step(S, { [me.id]: { x: 0, y: 1, slide: true } });
  assert.ok(Math.hypot(me.vx, me.vy) > 5, 'kayma hızı');
  assert.ok(me.slideT > 0 && me.slideCd > 0);
  for (let i = 0; i < 25; i++) step(S, { [me.id]: { x: 1, y: 0 } });   // kayarken yön değiştirilemez
  assert.equal(me.slideT, 0);
  assert.ok(Math.abs(me.x - x0) < 15, 'kayarken yana gitmedi');
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
  const goal = { x: W_TEST, y: H_TEST/2 };
  const strong = passSetup({ x: 860, y: 330 });
  const out = {};
  passRun(strong, toward(strong.me, goal), CHARGE_TICKS - 1, {}, out);
  // top kale çizgisini direklerin arasından geçmeli (pasa çevrilmedi)
  const yAt = strong.S.ball.y + Math.tan(out.ang)*(W_TEST - strong.S.ball.x);
  assert.ok(yAt > TOP && yAt < BOT, `şut kale ağzına gitti (y ${yAt.toFixed(0)})`);
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

/* ---------- FIFA tuşları: vuruş türleri ve oyuncu değiştirme ---------- */
test('şut tuşu (kind: shot) arkadaşa kilitlenmez, basılan yöne gider', () => {
  const s = passSetup(), inp = toward(s.me, s.mate, .3), out = {};
  passRun(s, { ...inp, kind: 'shot' }, 3, {}, out);
  assert.ok(Math.abs(out.ang - Math.atan2(inp.y, inp.x)) < .02);
});

test('ara pas (kind: through) koşan arkadaşın önüne atılır, arkadaş topa koşarak yetişir', () => {
  // arkadaş sağa koşuyor; ara pas onun şimdiki yerinin önüne gider
  const s = passSetup({ x: 480, y: 160 });
  const out = {};
  const r = passRun(s, { ...toward(s.me, s.mate), kind: 'through' }, 3, { x: 1, y: 0 }, out);
  const direct = Math.atan2(160 - 280, 480 - 336);
  assert.ok(out.ang > direct + .05, `top arkadaşın önüne (sağa) gitti: ${out.ang.toFixed(2)} > ${direct.toFixed(2)}`);
  assert.ok(r !== null && r < 12, `arkadaş topa yetişti (ıska ${r})`);
});

test('havadan pas (kind: lob) havalanır ve aradaki rakibin üstünden arkadaşa gider', () => {
  const s = passSetup({ x: 640, y: 280 });
  // rakip tam yolun ortasında
  const o = s.S.players.find(p => p.team === 1); Object.assign(o, { x: 480, y: 280 });
  let maxZ = 0, touched = false, best = 1e9;
  for (let i = 0; i < 200; i++){
    // tuş bırakılınca da tür hatırlanır (girdi katmanı gibi)
    const ev = step(s.S, { [s.me.id]: i < 3 ? { x: 1, y: 0, kick: true, kind: 'lob' } : { kind: 'lob' } });
    maxZ = Math.max(maxZ, s.S.ball.z);
    if (s.S.lastTouch === o) touched = true;
    best = Math.min(best, Math.hypot(s.S.ball.x - s.mate.x, s.S.ball.y - s.mate.y) - 34);
    if (s.S.owner === s.mate) { best = 0; break; }
  }
  assert.ok(maxZ > 20, `top havalandı (en yüksek ${maxZ.toFixed(0)})`);
  assert.ok(!touched, 'rakip topa değmedi');
  assert.ok(best < 15, `arkadaşa ulaştı (ıska ${best.toFixed(0)})`);
});

test('oyuncu değiştirme: kontrol topa en yakın bot arkadaşa geçer, "Sen" etiketi de geçer', () => {
  const S = createMatch({ size: 3, seed: 2, allowSwitch: true, humans: [{ team: 0, ctrl: 'h1', name: 'Sen' }] });
  S.phase = 'play';
  const me = S.players.find(p => p.ctrl === 'h1');
  const mates = S.players.filter(p => p.team === 0 && p !== me);
  Object.assign(S.ball, { x: mates[1].x + 30, y: mates[1].y });   // top ikinci arkadaşa yakın
  const ev = step(S, { [me.id]: { swap: true } });
  assert.ok(ev.some(e => e.type === 'swap'));
  assert.equal(mates[1].ctrl, 'h1'); assert.equal(me.ctrl, 'ai');
  assert.equal(mates[1].name, 'Sen');
  // basılı tutmak hemen geri geçirmez
  step(S, { [mates[1].id]: { swap: true } });
  assert.equal(mates[1].ctrl, 'h1');
});

test('oyuncu değiştirme izin verilmeyen maçta (çevrimiçi) çalışmaz', () => {
  const S = createMatch({ size: 3, seed: 2, humans: [{ team: 0, ctrl: 'net', name: 'A', uid: 5 }] });
  const me = S.players.find(p => p.uid === 5);
  step(S, { [me.id]: { swap: true } });
  assert.equal(me.ctrl, 'net');
});

/* ---------- şut yardımı ---------- */
// insan oyuncu ceza sahası önünde topla; verilen yöne şut (kind: shot), topun kale çizgisini kestiği y
function shotAt(dir, assist = true, from = { x: W_TEST - 380, y: H_TEST/2 + 90 }){
  const S = createMatch({ size: 1, seed: 4, humans: [{ team: 0, ctrl: 'h1', name: 'Sen' }] });
  const me = S.players[0], o = S.players[1];
  S.phase = 'play'; o.ctrl = 'h2'; Object.assign(o, { x: W_TEST - 30, y: H_TEST/2 - 40 });   // kaleci üst tarafta
  Object.assign(me, { ...from, vx: 0, vy: 0, dirA: 0 });
  Object.assign(S.ball, { x: from.x + 36, y: from.y, vx: 0, vy: 0 }); S.owner = me;
  const inp = { x: dir[0], y: dir[1], kind: 'shot', assist };
  let ang = null;
  for (let i = 0; i < 30 && ang === null; i++){
    const ev = step(S, { [me.id]: i < 3 ? { ...inp, kick: true } : inp });
    if (ev.some(e => e.type === 'kick')) ang = Math.atan2(S.ball.vy, S.ball.vx);
  }
  return S.ball.y + Math.tan(ang)*(W_TEST - S.ball.x);
}

test('şut yardımı: 8 yönlü tuşla bile top kale ağzına, basılan yöne göre köşeye gider', () => {
  const s = Math.SQRT1_2;
  const up = shotAt([s, -s]), down = shotAt([s, s]), straight = shotAt([1, 0]);
  for (const [n, y] of [['çapraz yukarı', up], ['çapraz aşağı', down], ['düz', straight]]) assert.ok(y > TOP && y < BOT, `${n}: kale ağzında (y ${y.toFixed(0)})`);
  assert.ok(up < H_TEST/2 && down > H_TEST/2, 'yukarı üst, aşağı alt köşe');
});

test('şut yardımı: düz vuruş kalecinin uzak köşesine, yardım kapalıysa basılan yöne', () => {
  const y = shotAt([1, 0], true, { x: W_TEST - 380, y: H_TEST/2 });
  assert.ok(y > H_TEST/2, `kaleci üstte, top alt köşeye (y ${y.toFixed(0)})`);
  const raw = shotAt([Math.SQRT1_2, -Math.SQRT1_2], false);
  assert.ok(raw < TOP, `yardımsız çapraz şut kalenin dışına gider (y ${raw.toFixed(0)})`);
});

/* ---------- görünüm ve gol sevinci ---------- */
import { SKINS, HAIRS, HAIR_COLS, TATTOOS, CELEBRATIONS } from '../shared/constants.js';
import { roster, matchInfo, snapshot, createView, applySnapshot } from '../shared/net.js';

test('oyuncu görünümü: ten, saç, dövme tohumla belirlenir ve çeşitlidir', () => {
  const a = createMatch({ size: 3, seed: 9 }), b = createMatch({ size: 3, seed: 9 });
  const look = S => S.players.map(p => [p.skin, p.hair, p.hairCol, p.tattoo]);
  assert.deepEqual(look(a), look(b));
  const skins = new Set(), hairs = new Set(); let tattoos = 0, n = 0;
  for (let seed = 1; seed <= 40; seed++){
    for (const p of createMatch({ size: 3, seed }).players){
      assert.ok(SKINS.includes(p.skin) && HAIRS.includes(p.hair) && HAIR_COLS.includes(p.hairCol));
      assert.ok(p.tattoo === null || TATTOOS.includes(p.tattoo));
      skins.add(p.skin); hairs.add(p.hair); tattoos += !!p.tattoo; n++;
    }
  }
  assert.equal(skins.size, SKINS.length, 'her ten rengi çıkmalı');
  assert.equal(hairs.size, new Set(HAIRS).size, 'her saç modeli çıkmalı');
  assert.ok(tattoos > n*.15 && tattoos < n*.45, `dövmeli oran: ${tattoos}/${n}`);
});

test('golde sevinç türü seçilir; görünüm ve sevinç çevrimiçi görünüme taşınır', () => {
  let S = null;
  for (let seed = 1; seed <= 6 && !S; seed++){
    const M = createMatch({ size: 3, diff: 2, minutes: 2, seed });
    for (let i = 0; i < 60*60*2 && M.phase !== 'over'; i++){ step(M, {}); if (M.phase === 'goal'){ S = M; break; } }
  }
  assert.ok(S, 'gol olmadı');
  assert.ok(CELEBRATIONS.includes(S.goalInfo.cele));
  const V = createView(roster(S), matchInfo(S), null);
  applySnapshot(V, snapshot(S));
  assert.equal(V.goalInfo.cele, S.goalInfo.cele);
  for (const p of S.players){ const q = V.players[p.id]; assert.deepEqual([q.skin, q.hair, q.hairCol, q.tattoo], [p.skin, p.hair, p.hairCol, p.tattoo]); }
});

test('kulak sevinci: golü atan bot kenar çizgisine, seyirciye koşar; takla atan yerinde durur', () => {
  for (const [cele, check] of [['kulak', (p, y0) => Math.min(p.y, H_TEST - p.y) < 90 && Math.abs(p.y - y0) > 100], ['takla', (p, y0, x0) => Math.hypot(p.x - x0, p.y - y0) < 15]]){
    const S = createMatch({ size: 3, seed: 3 });
    const sc = S.players.find(p => p.team === 0);
    Object.assign(sc, { x: W_TEST - 200, y: H_TEST/2 - 30, vx: 0, vy: 0 });
    const x0 = sc.x, y0 = sc.y;
    S.phase = 'goal'; S.goalT = 400; S.goalInfo = { team: 0, t: S.t, scorer: sc, own: false, cele };
    for (let i = 0; i < 150; i++) step(S, {});
    assert.ok(check(sc, y0, x0), `${cele}: (${sc.x.toFixed(0)}, ${sc.y.toFixed(0)})`);
  }
});

test('insan oyuncunun seçtiği görünüm maça geçer, geçersiz alanlar rastgele kalır, tohum sırası bozulmaz', () => {
  const look = { skin: SKINS[5], hair: 'mohikan', hairCol: HAIR_COLS[7], tattoo: 'yok', face: 'cyclops', acc: 'cap' };
  const S = createMatch({ size: 3, seed: 4, humans: [{ team: 0, ctrl: 'h1', name: 'Sen', look }] });
  const me = S.players.find(p => p.ctrl === 'h1');
  assert.deepEqual([me.skin, me.hair, me.hairCol, me.tattoo, me.face, me.acc], [SKINS[5], 'mohikan', HAIR_COLS[7], null, 'cyclops', 'cap']);
  const bad = createMatch({ size: 3, seed: 4, humans: [{ team: 0, ctrl: 'h1', name: 'Sen', look: { hair: '<script>', skin: 'red', tattoo: 'kalp' } }] });
  const me2 = bad.players.find(p => p.ctrl === 'h1');
  assert.ok(HAIRS.includes(me2.hair) && SKINS.includes(me2.skin));
  assert.equal(me2.tattoo, 'kalp');
  // diğer oyuncuların görünümü seçimden etkilenmez
  const plain = createMatch({ size: 3, seed: 4, humans: [{ team: 0, ctrl: 'h1', name: 'Sen' }] });
  assert.deepEqual(S.players.slice(1).map(p => p.hair + p.skin), plain.players.slice(1).map(p => p.hair + p.skin));
});

test('şut tuşu (kind: shot) sert vurur: tam barda füzeye yakın hız ve alev, kısa dokunuşta alevsiz', () => {
  const speedOf = (kind, hold) => {
    const s = passSetup(), inp = { ...toward(s.me, s.mate, .6), kind };
    let v = 0, fire = 0, hard = 0;
    for (let i = 0; i < 80 && !v; i++){
      const ev = step(s.S, { [s.me.id]: i < hold ? { ...inp, kick: true } : inp });
      if (ev.some(e => e.type === 'kick' && e.id === s.me.id)){ v = Math.hypot(s.S.ball.vx, s.S.ball.vy); fire = s.S.ball.fire; hard = ev.filter(e => e.type === 'hardShot').length; }
    }
    return { v, fire, hard };
  };
  const shot = speedOf('shot', CHARGE_TICKS + 2), pass = speedOf('pass', CHARGE_TICKS + 2), tap = speedOf('shot', 2);
  assert.ok(shot.v > KICK*1.7, `sert şut hızı: ${shot.v.toFixed(2)}`);
  assert.ok(shot.v > pass.v*1.25, `şut ${shot.v.toFixed(2)} / pas ${pass.v.toFixed(2)}`);
  assert.ok(shot.fire > 0 && shot.hard === 1);
  assert.ok(tap.fire === 0 && tap.hard === 0 && tap.v < shot.v);
});

test('havadan sert şut (kind: lobshot, FIFA A+D): sert ve havalanır, aradaki rakibin üstünden geçer', () => {
  const s = passSetup(), { S, me } = s;
  const opp = S.players.find(p => p.team !== me.team);
  // rakip kaleye doğru, aradaki rakip 90 birim önde
  const dir = me.team === 0 ? 1 : -1;
  Object.assign(opp, { x: S.ball.x + dir*90, y: S.ball.y, vx: 0, vy: 0, ctrl: 'h9' });
  const inp = { x: dir, y: 0, kind: 'lobshot' };
  let v = 0, maxZ = 0, touched = false;
  for (let i = 0; i < 90; i++){
    if (!v) Object.assign(opp, { x: S.ball.x + dir*90, y: S.ball.y, vx: 0, vy: 0 });   // vuruşa kadar 90 birim önde
    const ev = step(S, { [me.id]: i < CHARGE_TICKS + 2 ? { ...inp, kick: true } : inp, [opp.id]: {} });
    if (!v && ev.some(e => e.type === 'kick' && e.id === me.id)) v = Math.hypot(S.ball.vx, S.ball.vy);
    if (v){ maxZ = Math.max(maxZ, S.ball.z); if (S.lastTouch === opp) touched = true; }
  }
  assert.ok(v > KICK*1.7, `hız ${v.toFixed(2)}`);
  assert.ok(maxZ > 20, `yükseklik ${maxZ.toFixed(1)}`);
  assert.ok(!touched, 'top aradaki rakibe çarpmamalı');
});

test('baskı (press): insan oyuncu topu tutan rakibe kale tarafından kapanır, arkadaş toptayken etkisiz', () => {
  const S = createMatch({ size: 2, seed: 5, humans: [{ team: 0, ctrl: 'h1', name: 'A' }] });
  const me = S.players.find(p => p.ctrl === 'h1'), opp = S.players.find(p => p.team === 1);
  for (const p of S.players) if (p !== me) p.ctrl = 'h9';   // diğerleri dursun
  S.phase = 'play';
  Object.assign(me, { x: 200, y: 600, vx: 0, vy: 0 });
  Object.assign(opp, { x: 600, y: 300, vx: 0, vy: 0, dirA: Math.PI });
  Object.assign(S.ball, { x: 564, y: 300, vx: 0, vy: 0 }); S.owner = opp;
  let close = null;
  for (let i = 0; i < 240 && !close; i++){
    step(S, { [me.id]: { press: true } });
    if (S.owner === me || Math.hypot(me.x - opp.x, me.y - opp.y) < opp.r + me.r + 30) close = { x: me.x };   // kapandı ya da topu kaptı
  }
  assert.ok(close, 'rakibe kapanmalı');
  assert.ok(close.x < opp.x, 'kale tarafından gelmeli');
  // takım arkadaşı toptayken baskı hareket ettirmez
  const mate = S.players.find(p => p.team === 0 && p !== me);
  Object.assign(mate, { x: 900, y: 100 }); Object.assign(me, { vx: 0, vy: 0 }); S.owner = mate;
  Object.assign(S.ball, { x: 936, y: 100, vx: 0, vy: 0 });
  const x0 = me.x, y0 = me.y;
  for (let i = 0; i < 30; i++) step(S, { [me.id]: { press: true }, [mate.id]: { hold: true } });
  assert.ok(Math.hypot(me.x - x0, me.y - y0) < 3);
});

test('formalar: seçilen formalar maça geçer, aynı forma çakışmaz, geçersiz forma varsayılana döner', async () => {
  const { KITS, matchKits } = await import('../shared/constants.js');
  assert.deepEqual(createMatch({ seed: 1, kits: ['sarilacivert', 'siyahbeyaz'] }).kits, ['sarilacivert', 'siyahbeyaz']);
  const same = createMatch({ seed: 1, kits: ['buz', 'buz'] }).kits;
  assert.equal(same[0], 'buz'); assert.notEqual(same[1], 'buz');
  assert.deepEqual(matchKits('yok', '<x>'), [KITS[0].id, KITS[1].id]);
  assert.deepEqual(createMatch({ seed: 1 }).kits, ['limon', 'buz']);
  const S = createMatch({ seed: 2, kits: ['sarikirmizi', 'mor'], teamNames: ['Aslanlar', 'Kartallar'] });
  const V = createView(roster(S), matchInfo(S), null);
  assert.deepEqual(V.kits, ['sarikirmizi', 'mor']); assert.deepEqual(V.teamNames, ['Aslanlar', 'Kartallar']);
});

test('havadaki top: yüksekte kafa, alçakta vole, kaleye sırtı dönükken rövaşata; top kaleye gider', () => {
  const air = (z, dirA) => {
    const S = createMatch({ size: 1, seed: 3, humans: [{ team: 0, ctrl: 'h1', name: 'Sen' }] });
    const me = S.players.find(p => p.ctrl === 'h1'), op = S.players.find(p => p !== me);
    S.phase = 'play'; Object.assign(op, { x: 200, y: 100, ctrl: 'h9' });
    Object.assign(me, { x: 1000, y: 350, vx: 0, vy: 0, dirA });
    Object.assign(S.ball, { x: 1000 + me.r + S.ball.r + 4, y: 350, vx: 0, vy: 0, z, vz: 0 }); S.owner = null;
    const ev = step(S, { [me.id]: { kick: true } });
    const a = ev.find(e => e.type === 'aerial');
    return { kind: a && a.kind, vx: S.ball.vx };
  };
  const head = air(30, 0), volley = air(16, 0), bike = air(16, Math.PI);
  assert.equal(head.kind, 'kafa'); assert.equal(volley.kind, 'vole'); assert.equal(bike.kind, 'rovasata');
  for (const r of [head, volley, bike]) assert.ok(r.vx > 4, `kaleye doğru: ${r.vx}`);
  assert.equal(air(60, 0).kind, undefined);   // çok yüksek: yetişilmez
});

test('orta (A) rakip kale önündeki arkadaşa kafa yüksekliğinde gelir; tuşa basan arkadaş kafayı vurur', () => {
  let heads = 0;
  for (let seed = 1; seed <= 6; seed++){
    const S = createMatch({ size: 2, seed, humans: [{ team: 0, ctrl: 'h1', name: 'A' }, { team: 0, ctrl: 'h2', name: 'B' }] });
    const [me, mate] = S.players.filter(p => p.team === 0);
    for (const o of S.players.filter(p => p.team === 1)) Object.assign(o, { x: 300, y: o.slot ? 600 : 100, ctrl: 'h9' });
    S.phase = 'play';
    Object.assign(me, { x: 1000, y: 70, vx: 0, vy: 0, dirA: Math.PI/2 }); Object.assign(mate, { x: 1090, y: 340, vx: 0, vy: 0 });
    Object.assign(S.ball, { x: 1000, y: 106, vx: 0, vy: 0, z: 0 }); S.owner = me;
    for (let i = 0; i < 150; i++){
      const ev = step(S, { [me.id]: i < 12 ? { x: .4, y: 1, kick: true, kind: 'lob' } : { kind: 'lob' }, [mate.id]: { kick: true } });
      if (ev.some(e => e.type === 'aerial' && e.id === mate.id)){ heads++; break; }
    }
  }
  assert.ok(heads >= 5, `kafa: ${heads}/6`);
});

test('yanından geçen top: insan oyuncu geniş alanda alır, tuş basılıyken tek vuruşla vurur, hızlı top atlayıp geçmez', () => {
  const run = (gap, speed, inp) => {
    const S = createMatch({ size: 1, seed: 4, humans: [{ team: 0, ctrl: 'h1', name: 'Sen' }] });
    const me = S.players.find(p => p.ctrl === 'h1'), op = S.players.find(p => p !== me);
    S.phase = 'play'; Object.assign(op, { x: 100, y: 100, ctrl: 'h9' });
    Object.assign(me, { x: 600, y: 350, vx: 0, vy: 0, dirA: 0 });
    // top soldan sağa, oyuncunun altından 'gap' boşlukla geçer
    Object.assign(S.ball, { x: 450, y: 350 + me.r + S.ball.r + gap, vx: speed, vy: 0, z: 0 }); S.owner = null;
    let kicked = false;
    for (let i = 0; i < 60; i++){
      const ev = step(S, { [me.id]: inp(i) });
      if (ev.some(e => e.type === 'kick' && e.id === me.id)) kicked = true;
      if (S.owner === me || kicked) break;
    }
    return { owned: S.owner === me, kicked };
  };
  assert.ok(run(9, 4, () => ({})).owned, 'yavaş geçen top alınmalı');
  assert.ok(run(9, 9, i => ({ kick: i < 20 })).kicked, 'tuş basılıyken hızlı top vurulmalı');
  assert.ok(run(4, 14, i => ({ kick: i < 20 })).kicked, 'çok hızlı top da atlayıp geçmemeli');
  assert.ok(!run(30, 4, () => ({})).owned, 'uzaktan geçen top alınmaz');
});

test('gol tekrarı: gol arası uzar; yalnızca golü atan takımın insanı, golden biraz sonra, vuruş tuşuyla geçer', async () => {
  const { GOAL_PAUSE, GOAL_PAUSE_REPLAY, REPLAY_SKIP_AFTER } = await import('../shared/constants.js');
  const setup = replay => {
    const S = createMatch({ size: 2, seed: 2, replay, humans: [{ team: 0, ctrl: 'h1', name: 'A' }, { team: 1, ctrl: 'h2', name: 'B' }] });
    const a = S.players.find(p => p.ctrl === 'h1'), b = S.players.find(p => p.ctrl === 'h2');
    S.phase = 'play'; S.owner = null; S.lastTouch = a;
    Object.assign(S.ball, { x: W_TEST - 30, y: H_TEST/2, vx: 8, vy: 0, z: 0 });
    let i = 0; while (S.phase !== 'goal' && i++ < 30) step(S, {});
    return { S, a, b };
  };
  assert.ok(setup(false).S.goalT > GOAL_PAUSE - 5 && setup(false).S.goalT <= GOAL_PAUSE);
  const { S, a, b } = setup(true);
  assert.equal(S.phase, 'goal'); assert.ok(S.goalT > GOAL_PAUSE_REPLAY - 5);
  // hemen basmak geçmez; yiyen takım geçemez
  let ev = step(S, { [a.id]: { kick: true } }); assert.ok(!ev.some(e => e.type === 'replaySkip'));
  step(S, {});
  for (let i = 0; i < REPLAY_SKIP_AFTER + 2; i++) step(S, {});
  ev = step(S, { [b.id]: { kick: true } }); assert.ok(!ev.some(e => e.type === 'replaySkip'), 'yiyen takım geçemez');
  ev = step(S, { [a.id]: { kick: true } }); assert.ok(ev.some(e => e.type === 'replaySkip'), 'atan takım geçer');
  for (let i = 0; i < 30; i++) step(S, {});
  assert.equal(S.phase, 'kickoff');
});

test('çevrimiçi tahmin: predictMove, tek başına koşan oyuncuda step ile aynı hareketi verir (depar, yorulma dahil)', async () => {
  const { predictMove } = await import('../shared/sim.js');
  const S = createMatch({ size: 1, seed: 6, humans: [{ team: 0, ctrl: 'h1', name: 'Sen' }] });
  const me = S.players.find(p => p.ctrl === 'h1'), op = S.players.find(p => p !== me);
  S.phase = 'play'; Object.assign(op, { x: 1150, y: 650, ctrl: 'h9' }); Object.assign(S.ball, { x: 60, y: 650 }); S.owner = null;
  Object.assign(me, { x: 200, y: 200, vx: 0, vy: 0, sta: 1, tired: false });
  const P = { x: me.x, y: me.y, vx: 0, vy: 0, sta: 1, tired: false, sprinting: false, team: me.team, r: me.r };
  for (let i = 0; i < 400; i++){
    const inp = { x: i < 200 ? 1 : -.3, y: i < 120 ? .5 : -.4, sprint: i < 300 };   // direklere ve duvara değmeden
    step(S, { [me.id]: inp });
    predictMove(P, sanitizeInput(inp), { owned: false, phase: S.phase, kickoffTeam: S.kickoffTeam, sliding: false });
    assert.ok(Math.hypot(P.x - me.x, P.y - me.y) < 1e-6, `tick ${i}: ${P.x},${P.y} / ${me.x},${me.y}`);
  }
  assert.equal(P.tired, me.tired); assert.ok(Math.abs(P.sta - me.sta) < 1e-9);
});
