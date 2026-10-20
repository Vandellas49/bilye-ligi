/* ---------- ağ: maç durumunun gönderilmesi ----------
   Sunucu maçı simüle eder, istemciler yalnızca çizer.
   roster(S)        maç başında bir kez gönderilen değişmez oyuncu bilgisi
   snapshot(S)      her yayında gönderilen değişen durum (oyuncu referansları -> id)
   createView(...)  istemcide çizilebilir durum nesnesi (render.js'in beklediği biçim)
   applySnapshot    anlık görüntüyü görünüme yazar (referansları geri kurar)
   lerpView         iki anlık görüntü arasında konumları enterpole eder */

import { W, H } from './constants.js';

const r2 = v => Math.round(v*100)/100;

export function roster(S){
  return S.players.map(p => ({
    id: p.id, team: p.team, slot: p.slot, uid: p.uid, name: p.name, num: p.num,
    face: p.face, acc: p.acc, accCol: p.accCol, r: p.r, skin: p.skin, hair: p.hair, hairCol: p.hairCol, tattoo: p.tattoo,
  }));
}

// maçın değişmeyen bilgileri (saha, hava, takım adları ...)
export function matchInfo(S){
  return { arena: S.arena, weather: S.weather, specials: S.specials, teamNames: S.teamNames, timed: S.timed, diff: S.diff };
}

export function snapshot(S){
  const b = S.ball;
  return {
    t: S.t, phase: S.phase, score: S.score.slice(), timeLeft: S.timeLeft, overtime: S.overtime, kickoffTeam: S.kickoffTeam,
    owner: S.owner ? S.owner.id : null,
    pass: S.pass ? { to: S.pass.to.id, x: r2(S.pass.x), y: r2(S.pass.y) } : null,
    req: S.req.map(q => q ? q.p.id : null),
    goal: S.goalInfo ? { team: S.goalInfo.team, t: S.goalInfo.t, scorer: S.goalInfo.scorer ? S.goalInfo.scorer.id : null, own: !!S.goalInfo.own, cele: S.goalInfo.cele } : null,
    ball: [r2(b.x), r2(b.y), r2(b.vx), r2(b.vy), r2(b.z), b.fire, b.curve ? Math.sign(b.curve) : 0, r2(b.spin)],
    players: S.players.map(p => [
      r2(p.x), r2(p.y), r2(p.vx), r2(p.vy), r2(p.dirA), r2(p.sta),
      (p.tired ? 1 : 0) | (p.sprinting ? 2 : 0) | (p.input.kick ? 4 : 0) | (p.ctrl === 'ai' ? 8 : 0) | (p.slideT > 0 ? 16 : 0),
      p.mood, p.armed ? p.armed.type : null, p.cd.falso, p.cd.fuze, p.cd.asirtma,
      p.bubble ? p.bubble.text : null, p.bubble ? p.bubble.t : 0,
      r2(p.charge || 0),   // şut güç barı
    ]),
  };
}

// myUid: bu istemcinin bağlantı kimliği; kendi oyuncusu 'h1' olarak işaretlenir (HUD ve çizim için)
export function createView(rosterList, info, myUid){
  const players = rosterList.map(p => ({
    ...p, x: 0, y: 0, vx: 0, vy: 0, im: .5, dirA: 0, sta: 1, tired: false, sprinting: false,
    mood: 'idle', armed: null, cd: { falso: 0, fuze: 0, asirtma: 0 }, bubble: null,
    input: { x: 0, y: 0, kick: false }, charge: 0, ctrl: 'ai', mine: p.uid != null && p.uid === myUid,
  }));
  return {
    online: true, t: 0, phase: 'kickoff', score: [0, 0], timeLeft: 0, overtime: false, kickoffTeam: 0,
    arena: info.arena, weather: info.weather, specials: info.specials, teamNames: info.teamNames, timed: info.timed,
    players, ball: { x: W/2, y: H/2, vx: 0, vy: 0, r: 12, z: 0, fire: 0, curve: 0, spin: 0 },
    owner: null, pass: null, req: [null, null], goalInfo: null, lastTouch: null,
  };
}

export function applySnapshot(V, s){
  V.t = s.t; V.phase = s.phase; V.score = s.score; V.timeLeft = s.timeLeft; V.overtime = s.overtime; V.kickoffTeam = s.kickoffTeam;
  const P = V.players;
  V.owner = s.owner != null ? P[s.owner] : null;
  V.pass = s.pass ? { to: P[s.pass.to], x: s.pass.x, y: s.pass.y } : null;
  V.req = s.req.map(id => id != null ? { p: P[id] } : null);
  V.goalInfo = s.goal ? { team: s.goal.team, t: s.goal.t, scorer: s.goal.scorer != null ? P[s.goal.scorer] : null, own: s.goal.own, cele: s.goal.cele } : null;
  const b = V.ball, sb = s.ball;
  b.x = sb[0]; b.y = sb[1]; b.vx = sb[2]; b.vy = sb[3]; b.z = sb[4]; b.fire = sb[5]; b.curve = sb[6]; b.spin = sb[7];
  s.players.forEach((a, i) => {
    const p = P[i];
    p.x = a[0]; p.y = a[1]; p.vx = a[2]; p.vy = a[3]; p.dirA = a[4]; p.sta = a[5];
    p.tired = !!(a[6] & 1); p.sprinting = !!(a[6] & 2); p.input.kick = !!(a[6] & 4); p.slideT = a[6] & 16 ? 1 : 0;
    p.ctrl = a[6] & 8 ? 'ai' : p.mine ? 'h1' : 'net';
    p.mood = a[7]; p.armed = a[8] ? { type: a[8] } : null;
    p.cd.falso = a[9]; p.cd.fuze = a[10]; p.cd.asirtma = a[11];
    p.bubble = a[12] ? { text: a[12], t: a[13] } : null;
    p.charge = a[14] || 0;
  });
}

const lerp = (a, b, k) => a + (b - a)*k;
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a))*k;

// V'ye zaten b anlık görüntüsü yazılmış olmalı; konumları a'dan b'ye k oranında geri çeker
export function lerpView(V, a, b, k){
  if (k >= 1) return;
  V.t = Math.round(lerp(a.t, b.t, k));
  const ba = a.ball, bb = b.ball, ball = V.ball;
  // gol sonrası ışınlanmada enterpolasyon yapma
  if (Math.hypot(bb[0] - ba[0], bb[1] - ba[1]) < 120){ ball.x = lerp(ba[0], bb[0], k); ball.y = lerp(ba[1], bb[1], k); ball.z = lerp(ba[4], bb[4], k); }
  V.players.forEach((p, i) => {
    const pa = a.players[i], pb = b.players[i];
    if (Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) > 120) return;
    p.x = lerp(pa[0], pb[0], k); p.y = lerp(pa[1], pb[1], k); p.dirA = lerpAngle(pa[4], pb[4], k);
  });
}
