// Turnuva ve ağ serileştirme testleri
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTournament, nextMatch, recordResult, alive, roundDiff, roundName, simulateMatch } from '../shared/tournament.js';
import { createMatch, step } from '../shared/sim.js';
import { roster, matchInfo, snapshot, createView, applySnapshot } from '../shared/net.js';

test('8 takımlı tablo sırayla oynanır ve şampiyon çıkar', () => {
  const T = createTournament({ size: 8, seed: 4 });
  assert.equal(T.rounds.length, 3);
  assert.deepEqual(T.rounds.map(r => r.length), [4, 2, 1]);
  assert.equal(roundName(T, 0), 'Çeyrek final'); assert.equal(roundName(T, 2), 'Final');
  assert.deepEqual([0, 1, 2].map(r => roundDiff(T, r)), [0, 1, 2]);
  let m, n = 0;
  while ((m = nextMatch(T))){
    recordResult(T, m.round, m.index, m.a % 3, (m.b + 1) % 3, [5, 4]);   // eşitlikte penaltı
    n++;
  }
  assert.equal(n, 7);
  assert.notEqual(T.champion, null);
  assert.ok(alive(T, T.champion));
  assert.equal(T.teams.filter((_, i) => alive(T, i)).length, 1);
});

test('4 takımlı turnuvada zorluk yarı finalde orta, finalde zor', () => {
  const T = createTournament({ size: 4 });
  assert.deepEqual([0, 1].map(r => roundDiff(T, r)), [1, 2]);
  assert.equal(roundName(T, 0), 'Yarı final');
});

test('ekransız bot maçı her zaman bir kazanan üretir', () => {
  for (let seed = 1; seed <= 3; seed++){
    const r = simulateMatch({ size: 2, minutes: 2, seed });
    assert.ok(r.sa !== r.sb || (r.pen && r.pen[0] !== r.pen[1]));
  }
});

test('birden çok insan oyuncu aynı takımda yer alabilir', () => {
  const S = createMatch({ size: 3, seed: 2, humans: [
    { team: 0, ctrl: 'net', name: 'A', uid: 1 }, { team: 0, ctrl: 'net', name: 'B', uid: 2 }, { team: 1, ctrl: 'net', name: 'C', uid: 3 }] });
  assert.deepEqual(S.players.filter(p => p.team === 0).map(p => p.uid), [1, 2, null]);
  assert.deepEqual(S.players.filter(p => p.team === 1).map(p => p.uid), [3, null, null]);
});

test('anlık görüntü görünüme doğru aktarılır (referanslar id ile kurulur)', () => {
  const S = createMatch({ size: 2, seed: 9, minutes: 1, humans: [{ team: 1, ctrl: 'net', name: 'Uzak', uid: 42 }] });
  for (let i = 0; i < 900; i++) step(S, {});
  const snap = JSON.parse(JSON.stringify(snapshot(S)));     // ağdan geçmiş gibi
  const V = createView(JSON.parse(JSON.stringify(roster(S))), matchInfo(S), 42);
  applySnapshot(V, snap);
  S.players.forEach((p, i) => {
    assert.ok(Math.abs(V.players[i].x - p.x) < .01 && Math.abs(V.players[i].y - p.y) < .01);
    assert.equal(V.players[i].team, p.team);
  });
  assert.equal(V.owner ? V.owner.id : null, S.owner ? S.owner.id : null);
  if (S.owner) assert.equal(V.owner, V.players[S.owner.id]);
  const mine = V.players.find(p => p.mine);
  assert.equal(mine.name, 'Uzak'); assert.equal(mine.ctrl, 'h1');
  assert.deepEqual(V.score, S.score);
});
