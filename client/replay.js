/* ---------- gol tekrarı ----------
   İstemci her adımda çizilen durumun küçük bir kopyasını tutar (son ~4 sn). Golden sonra kısa canlı sevinç,
   ardından golden önceki ~3 sn ağır çekimde oynatılır. Simülasyon bu sırada gol arasında bekler
   (settings.replay ile GOAL_PAUSE_REPLAY); golü atan takımın insan oyuncusu vuruş tuşuyla geçerse
   simülasyon 'replaySkip' olayı yayınlar ve tekrar biter. Çizim sırasında kayıttaki değerler oyunculara ve topa
   geçici olarak yazılır (withReplay), çizimden sonra gerçek değerler geri konur; maç durumu değişmez. */
import { REPLAY_BEFORE, REPLAY_AFTER, REPLAY_DELAY, REPLAY_SPEED } from '../shared/constants.js';

const MAX = REPLAY_BEFORE + REPLAY_AFTER + 40;
export const replay = { frames: [], on: false, list: null, cur: 0, pendingT: -1, goalT: 0, team: -1 };

export function resetReplay(){ Object.assign(replay, { frames: [], on: false, list: null, cur: 0, pendingT: -1 }); }

// her simülasyon adımından sonra
export function recordFrame(S){
  if (replay.S !== S){ resetReplay(); replay.S = S; }
  if (!S.players.length) return;
  const b = S.ball;
  replay.frames.push({
    t: S.t, owner: S.owner ? S.owner.id : -1,
    ball: [b.x, b.y, b.z || 0, b.vx, b.vy, b.curve || 0, b.fire || 0],
    ps: S.players.map(p => [p.x, p.y, p.vx, p.vy, p.dirA, p.mood, p.slideT || 0, !!p.sprinting, p.stun || 0, p.charge || 0]),
  });
  if (replay.frames.length > MAX) replay.frames.shift();
}

// olaylar: gol -> tekrar zamanlanır; replaySkip -> biter
export function replayEvents(S, events){
  for (const e of events){
    const on = S.settings ? S.settings.replay : S.replay;
    if (e.type === 'goal' && on){ replay.pendingT = S.t + REPLAY_DELAY; replay.goalT = S.t; replay.team = e.team; }
    else if (e.type === 'replaySkip') stopReplay();
  }
}
export function stopReplay(){ replay.on = false; replay.list = null; replay.pendingT = -1; }

// her çizim karesinde: dt = geçen süre (tick cinsinden)
export function updateReplay(S, dt, paused){
  if (replay.pendingT >= 0 && S.t >= replay.pendingT){
    replay.pendingT = -1;
    const list = replay.frames.filter(f => f.t >= replay.goalT - REPLAY_BEFORE && f.t <= replay.goalT + REPLAY_AFTER);
    if (S.phase === 'goal' && list.length > 20){ replay.list = list; replay.cur = 0; replay.on = true; }
  }
  if (!replay.on) return;
  if (S.phase !== 'goal'){ stopReplay(); return; }
  if (!paused) replay.cur += dt*REPLAY_SPEED;
  if (replay.cur >= replay.list.length - 1) stopReplay();
}

// tekrar açıksa kayıttaki kareyi (iki kare arası ara değerle) geçici olarak yazıp çizer
export function withReplay(S, fn){
  if (!replay.on || !replay.list) return false;
  const L = replay.list, i = Math.min(L.length - 2, Math.floor(replay.cur)), k = replay.cur - i, a = L[i], c = L[i + 1];
  const mix = (u, v) => u + (v - u)*k;
  const b = S.ball, keepB = [b.x, b.y, b.z, b.vx, b.vy, b.curve, b.fire];
  const keep = S.players.map(p => [p.x, p.y, p.vx, p.vy, p.dirA, p.mood, p.slideT, p.sprinting, p.stun, p.charge]);
  const keepS = { t: S.t, phase: S.phase, goalInfo: S.goalInfo, owner: S.owner };
  try {
    [b.x, b.y, b.z, b.vx, b.vy] = [0, 1, 2, 3, 4].map(j => mix(a.ball[j], c.ball[j])); b.curve = a.ball[5]; b.fire = a.ball[6];
    S.players.forEach((p, n) => {
      const u = a.ps[n], v = c.ps[n];
      if (!u || !v) return;
      p.x = mix(u[0], v[0]); p.y = mix(u[1], v[1]); p.vx = u[2]; p.vy = u[3]; p.dirA = u[4]; p.mood = u[5]; p.slideT = u[6]; p.sprinting = u[7]; p.stun = u[8]; p.charge = u[9];
    });
    S.t = a.t; S.phase = 'play'; S.goalInfo = null; S.owner = a.owner >= 0 ? S.players[a.owner] : null;
    fn();
  } finally {
    [b.x, b.y, b.z, b.vx, b.vy, b.curve, b.fire] = keepB;
    S.players.forEach((p, n) => { const u = keep[n]; [p.x, p.y, p.vx, p.vy, p.dirA, p.mood, p.slideT, p.sprinting, p.stun, p.charge] = u; });
    Object.assign(S, keepS);
  }
  return true;
}
