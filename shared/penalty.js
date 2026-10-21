/* ---------- penaltı atışları ----------
   Süre bittiğinde beraberlik varsa ve settings.tiebreak === 'penalti' ise. Takımlar sırayla atar (5'er, erken belli
   olursa biter, sonra tek tek). Atan takımın oyuncusu (insan varsa insan, sırayla) topun arkasında; savunan takımın
   kalecisi (insan varsa insan) kale çizgisinde, yalnızca çizgi boyunca hareket eder. Diğerleri orta yuvarlakta bekler.
   Sonuç: gol (top ağızdan geçti), kurtarış (kaleci tuttu ya da son dokunan kaleci) ya da kaçtı (top durdu, süre doldu).
   Olaylar: penaltyStart, penaltyKick { team, kind: 'gol' | 'kurtaris' | 'kacti' }, end { score, pen }. */
import { W, H, TOP, BOT, PR, BR, GH, DIFF, KEEPER_GRAB_SPEED } from './constants.js';
import { random } from './rng.js';

export const PEN_SPOT = 150;           // kale çizgisinden penaltı noktası
const PREP = 480, FLIGHT = 210, SHOW = 100;   // atış için en fazla süre, topun yolculuğu, sonucu gösterme (tick)

const humanOf = (S, team) => S.players.filter(p => p.team === team && p.ctrl !== 'ai' && !(p.out > 0));
const keeperOf = (S, team) => humanOf(S, team)[0] || S.players.find(p => p.team === team && p.keeper) || S.players.filter(p => p.team === team).slice(-1)[0];

export function startPenalties(S, emit, first){
  S.phase = 'penalty';
  S.pens = { kicks: [[], []], turn: first, state: 'ready', t: 0, shooter: null, keeper: null, aim: 0, kickAt: 0, last: null, winner: null };
  for (const p of S.players){ p.out = 0; p.yellow = 0; }
  emit(S, 'penaltyStart', { first });
  setupKick(S);
}

function setupKick(S){
  const P = S.pens, team = P.turn, def = 1 - team;
  const dir = team === 0 ? 1 : -1, gx = team === 0 ? W : 0, sx = gx - dir*PEN_SPOT, b = S.ball;
  // atan: insanlar önce, sırayla; kaleci olmayanlar tercih edilir
  const list = S.players.filter(p => p.team === team).sort((a, c) => (a.ctrl === 'ai') - (c.ctrl === 'ai') || (a.keeper ? 1 : 0) - (c.keeper ? 1 : 0) || a.slot - c.slot);
  const shooter = list[P.kicks[team].length % list.length], keeper = keeperOf(S, def);
  P.shooter = shooter.id; P.keeper = keeper.id; P.state = 'ready'; P.t = 0; P.kickAt = 0;
  // botun nişanı: köşelerden biri, biraz sapmalı
  P.aim = Math.atan2(H/2 + (random(S.rng) < .5 ? -1 : 1)*(GH/2 - 18 - random(S.rng)*40) - H/2, gx - sx);
  if (shooter.ctrl !== 'ai') P.aim = team === 0 ? 0 : Math.PI;
  Object.assign(b, { x: sx, y: H/2, vx: 0, vy: 0, z: 0, vz: 0, curve: 0, fire: 0, grace: 0 });
  S.owner = null; S.pass = null; S.lastTouch = null; S.lastKick = null;
  let k = 0;
  for (const p of S.players){
    Object.assign(p, { vx: 0, vy: 0, stun: 0, slideT: 0, lunge: 0, charge: 0, shot: null, kickLock: true, armed: null, kickCd: 0, sprinting: false });
    if (p === shooter){ p.x = sx - Math.cos(P.aim)*(PR + BR + 24); p.y = H/2 - Math.sin(P.aim)*(PR + BR + 24); p.dirA = P.aim; }
    else if (p === keeper){ p.x = gx - dir*(PR + 4); p.y = H/2; p.dirA = dir > 0 ? Math.PI : 0; }
    else { const a = (k++)/(S.players.length - 2)*Math.PI*2; p.x = W/2 + Math.cos(a)*70; p.y = H/2 + Math.sin(a)*70; p.dirA = Math.PI/2; }
  }
}

// adımda: insan olmayan atan ve kaleci için girdi (sim.step kullanır)
export function penaltyInput(S, p){
  const P = S.pens, b = S.ball;
  if (P.state !== 'ready' && P.state !== 'flight') return { x: 0, y: 0 };
  if (p.id === P.shooter){
    if (P.state !== 'ready') return { x: 0, y: 0 };
    // biraz bekle, topa koş, vur (vuruş yönü topa giriş yönü)
    if (P.t < 50) return { x: 0, y: 0 };
    const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 1;
    return { x: dx/d, y: dy/d, kick: d - p.r - b.r < 8 };
  }
  if (p.id === P.keeper){
    const D = DIFF[S.diff], dir = P.turn === 0 ? 1 : -1, gx = P.turn === 0 ? W : 0;
    let ty = H/2;
    if (P.state === 'flight'){
      // atış anında taraf seçer: seviyeye göre doğru tarafa, değilse rastgele
      if (P.guess === undefined){
        const t = Math.abs((gx - dir*(PR + 4) - b.x)/(b.vx || 1e-6)), yc = b.y + b.vy*t;
        P.guess = random(S.rng) < .1 + D.keeper*.8 ? yc : H/2 + (random(S.rng) < .5 ? -1 : 1)*GH*.35;
      }
      ty = Math.max(TOP + 10, Math.min(BOT - 10, P.guess));
    }
    const dy = ty - p.y;
    return { x: 0, y: Math.max(-1, Math.min(1, dy/12)), sprint: P.state === 'flight' };
  }
  return { x: 0, y: 0 };
}

// adım sonunda: durum makinesi (sim.step çağırır)
export function penaltyStep(S, emit, endMatch){
  const P = S.pens, b = S.ball, team = P.turn, dir = team === 0 ? 1 : -1, gx = team === 0 ? W : 0;
  P.t++;
  const keeper = S.players[P.keeper];
  // kaleci çizgide kalır, diğerleri yerinde
  const lineX = gx - dir*(PR + 4);
  if (Math.abs(keeper.x - lineX) > 26){ keeper.x = lineX + Math.sign(keeper.x - lineX)*26; keeper.vx = 0; }
  for (const p of S.players) if (p.id !== P.shooter && p.id !== P.keeper){ p.vx = 0; p.vy = 0; }
  if (P.state === 'ready'){
    if (S.lastKick && S.lastKick.p.id === P.shooter){ P.state = 'flight'; P.t = 0; P.guess = undefined; }
    else if (P.t > PREP) result(S, emit, endMatch, 'kacti');
    return;
  }
  if (P.state === 'flight'){
    const inMouth = b.y > TOP && b.y < BOT && b.z < 26;
    if ((dir > 0 ? b.x > W + b.r : b.x < -b.r) && inMouth) return result(S, emit, endMatch, 'gol');
    // kaleci yakınındaki topu tutar (insan kaleci her zaman, bot seviyesine göre)
    const kd = Math.hypot(b.x - keeper.x, b.y - keeper.y) - keeper.r - b.r, sp = Math.hypot(b.vx, b.vy);
    if (kd < 10 && sp < KEEPER_GRAB_SPEED + 3 && b.z < 30 && !P.tried){
      P.tried = true;
      if (keeper.ctrl !== 'ai' || random(S.rng) < .2 + DIFF[S.diff].keeper){ Object.assign(b, { vx: 0, vy: 0 }); return result(S, emit, endMatch, 'kurtaris'); }
    }
    if (P.t > FLIGHT || (sp < .35 && P.t > 20) || (b.x - gx)*dir < -(PEN_SPOT + 120)){
      return result(S, emit, endMatch, S.lastTouch === keeper ? 'kurtaris' : 'kacti');
    }
    return;
  }
  if (P.state === 'show' && P.t > SHOW) nextKick(S, emit, endMatch);
}

function result(S, emit, endMatch, kind){
  const P = S.pens;
  P.kicks[P.turn].push(kind === 'gol');
  P.last = { team: P.turn, kind };
  P.state = 'show'; P.t = 0; P.tried = false;
  emit(S, 'penaltyKick', { team: P.turn, kind, id: P.shooter, x: S.ball.x, y: S.ball.y });
}

function nextKick(S, emit, endMatch){
  const P = S.pens, [ka, kb] = P.kicks, a = ka.filter(Boolean).length, b = kb.filter(Boolean).length;
  let done = false;
  if (ka.length <= 5 && kb.length <= 5){
    // kalan atışlarla yetişemeyecekse biter
    if (a > b + (5 - kb.length) || b > a + (5 - ka.length)) done = true;
    else if (ka.length === 5 && kb.length === 5 && a !== b) done = true;
  } else if (ka.length === kb.length && a !== b) done = true;
  if (done){
    P.winner = a > b ? 0 : 1; S.penScore = [a, b];
    S.phase = 'over';
    emit(S, 'end', { score: S.score.slice(), pen: [a, b] });
    return;
  }
  P.turn = 1 - P.turn;
  setupKick(S);
}
