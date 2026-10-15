// Simülasyon testleri: tarayıcı olmadan, Node üzerinde çalışır (npm test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step, sanitizeInput } from '../shared/sim.js';

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
