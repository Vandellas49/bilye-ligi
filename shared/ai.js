/* ---------- yapay zekâ ----------
   Bot girdileri insan girdisiyle aynı biçimde üretilir: {x, y, kick, special, hold, sprint}. */
import { W, H, GH, TOP, BOT, PR, BR, P_ACC, KICK_RANGE, WALL_REST, DIFF, formation } from './constants.js';
import { random, shuffle } from './rng.js';
import { laneOpen } from './pass.js';

function passPlan(S, p, m, lead){
  const b = S.ball;
  const tx = Math.max(PR, Math.min(W - PR, m.x + m.vx*lead)), ty = Math.max(PR, Math.min(H - PR, m.y + m.vy*lead));
  if (Math.hypot(tx - b.x, ty - b.y) < 620 && laneOpen(S, b.x, b.y, tx, ty, p.team)) return { kind: 'pass', x: tx, y: ty, m };
  const opts = [];
  // duvardan sektirme: yansıyan hedefe nişan al (duvar sekmesi dikey hızı azaltır)
  for (const wy of [BR, H - BR]){
    const my = wy - (ty - wy)/WALL_REST;
    const t = (wy - b.y)/(my - b.y);
    if (!(t > 0 && t < 1)) continue;
    const bx2 = b.x + (tx - b.x)*t;
    if (bx2 < 30 || bx2 > W - 30) continue;
    const len = Math.hypot(bx2 - b.x, wy - b.y) + Math.hypot(tx - bx2, ty - wy);
    if (len < 540 && laneOpen(S, b.x, b.y, bx2, wy, p.team) && laneOpen(S, bx2, wy, tx, ty, p.team)) opts.push({ kind: 'bank', x: tx, y: my, m, len });
  }
  opts.sort((a, c) => a.len - c.len);
  return opts[0] || null;
}

function makePlan(S, p, D, oppX){
  const b = S.ball, dir = p.team === 0 ? 1 : -1;
  const goalDist = Math.hypot(oppX - b.x, H/2 - b.y);
  const req = S.req[p.team];
  if (req && req.p !== p){
    const pl = passPlan(S, p, req.p, 14);
    if (pl) return pl;
    // yol kapalı: isteyen arkadaşa doğru sür, açı bulunca at
    return { kind: 'dribble', x: req.p.x, y: req.p.y, m: req.p, toMate: true };
  }
  // kalenin açık köşesini seç
  const ys = shuffle(S.rng, [TOP + 24, BOT - 24, H/2]);
  const openY = ys.find(y => laneOpen(S, b.x, b.y, oppX, y, p.team));
  if (goalDist < D.range && openY !== undefined) return { kind: 'shoot', x: oppX, y: openY + p.aimOff*.35 };
  const pressured = S.players.some(o => o.team !== p.team && Math.hypot(o.x - b.x, o.y - b.y) < 75);
  if (random(S.rng) < D.pass + (pressured ? .25 : 0)){
    const cands = S.players.filter(m => m.team === p.team && m !== p)
      .map(m => ({ m, adv: (m.x - b.x)*dir, d: Math.hypot(m.x - b.x, m.y - b.y) }))
      .filter(c => c.d > 90 && c.d < 620 && c.adv > -70)
      .sort((a, c) => c.adv - a.adv);
    for (const c of cands){ const pl = passPlan(S, p, c.m, 10); if (pl) return pl; }
  }
  if (goalDist < D.range*.65){
    const keeper = S.players.filter(o => o.team !== p.team).sort((a, c) => Math.abs(a.x - oppX) - Math.abs(c.x - oppX))[0];
    const y = keeper && keeper.y < H/2 ? BOT - 22 : TOP + 22;
    return { kind: 'shoot', x: oppX, y };
  }
  return { kind: 'dribble', x: oppX, y: H/2 + p.aimOff*.5 };
}

export function assignRoles(S){
  const b = S.ball;
  for (let team = 0; team < 2; team++){
    const mates = S.players.filter(p => p.team === team);
    const ai = mates.filter(p => p.ctrl === 'ai');
    if (!ai.length) continue;
    const dist = p => Math.hypot(p.x - b.x, p.y - b.y);
    const human = mates.find(p => p.ctrl !== 'ai');
    const ownX = team === 0 ? 0 : W;
    const pass = S.pass && S.pass.team === team ? S.pass : null;
    let chaser = null, receiver = null;
    if (pass){ if (pass.to.ctrl === 'ai') receiver = pass.to; }
    else {
      const nearestAI = ai.slice().sort((a,c) => dist(a) - dist(c))[0];
      const prev = ai.find(p => p.role === 'chaser');
      chaser = (prev && dist(prev) < dist(nearestAI) + 30) ? prev : nearestAI;
      if (human && dist(human) + 40 < dist(chaser)) chaser = null;
      if (ai.length === 1 && !human) chaser = ai[0];
    }
    const rest = ai.filter(p => p !== chaser && p !== receiver);
    rest.sort((a,c) => Math.abs(a.x - ownX) - Math.abs(c.x - ownX));
    rest.forEach((p, i) => p.role = i === 0 ? 'defender' : 'support');
    if (chaser) chaser.role = 'chaser';
    if (receiver) receiver.role = 'receiver';
  }
}

export function aiInput(S, p){
  const D = DIFF[S.diff], b = S.ball;
  const dir = p.team === 0 ? 1 : -1;
  const ownX = p.team === 0 ? 0 : W, oppX = p.team === 0 ? W + 20 : -20;
  const look = Math.min(18, Math.hypot(b.x - p.x, b.y - p.y)/6) * D.predict;
  let bx = b.x + b.vx*look, by = b.y + b.vy*look;
  let tx = p.x, ty = p.y, kick = false, special = null;
  const gap = Math.hypot(b.x - p.x, b.y - p.y) - PR - BR;

  if (--p.aimT <= 0){ p.aimT = 80 + random(S.rng)*80; p.aimOff = (random(S.rng)*2 - 1) * GH * D.aim; }

  const waiting = S.phase === 'kickoff' && p.team !== S.kickoffTeam;

  p.aiHold = false; p.aiSprint = false;
  if (S.owner === p && !waiting) return aiOwnerInput(S, p, D, oppX);
  const canSprint = !p.tired && p.sta > (1 - D.sprint*.55);

  if (p.role === 'chaser' && !waiting){
    // topa git: rakipteyse müdahale et, boştaysa al
    tx = bx; ty = by;
    if (S.owner && S.owner.team !== p.team){
      // topun önüne gir
      const o = S.owner; tx = b.x + Math.cos(o.dirA)*6; ty = b.y + Math.sin(o.dirA)*6;
      if (gap < 26 && p.tackleCd <= 0 && p.stun <= 0 && random(S.rng) < D.tackleTry) kick = true;
      if (canSprint && Math.abs(o.x - ownX) < 420) p.aiSprint = true;
    }
    if (canSprint && gap > 120 && !S.owner) p.aiSprint = true;
    // hızlı gelen boş topa tek vuruş
    const gx = oppX, gy = H/2;
    let dx = gx - b.x, dy = gy - b.y; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    const tbx = b.x - p.x, tby = b.y - p.y, tdl = Math.hypot(tbx, tby) || 1;
    const align = (tbx*dx + tby*dy)/tdl;
    const goalDist = Math.hypot(oppX - b.x, H/2 - b.y);
    // durdurulamayacak kadar hızlı gelen topa tek vuruş; yoksa topu kontrol et
    const fast = Math.hypot(b.vx - p.vx, b.vy - p.vy) > 4;
    if (!S.owner && fast && !S.req[p.team] && gap < KICK_RANGE + 1 && align > D.align && goalDist < D.range && random(S.rng) < D.react) kick = true;
    // pas istendiyse topu durdurmadan isteyene çevir
    const rq = S.req[p.team];
    if (rq && rq.p !== p && !S.owner && gap < KICK_RANGE + 1){
      const lx = rq.p.x + rq.p.vx*12 - b.x, ly = rq.p.y + rq.p.vy*12 - b.y, ll = Math.hypot(lx, ly) || 1;
      if ((tbx*lx + tby*ly)/(tdl*ll) > .9) kick = true;
    }
    if (S.diff > 0 && !kick) p.aiHold = true;
    const nearOwn = Math.abs(b.x - ownX) < 220;
    if (!S.owner && fast && nearOwn && gap < KICK_RANGE + 1 && (b.x - p.x)*dir > 0) kick = true;
  } else if (p.role === 'receiver' && S.pass && !waiting){
    tx = S.pass.x; ty = S.pass.y;
    if (canSprint && Math.hypot(tx - p.x, ty - p.y) > 80) p.aiSprint = true;
    p.aiHold = true;
    if (gap < 40){ tx = b.x; ty = b.y; }
  } else if (p.role === 'defender' || waiting){
    const gx = ownX + dir*6;
    const t = waiting ? .5 : .3;
    tx = gx + (b.x - gx)*t; ty = H/2 + (b.y - H/2)*.55;
    tx = p.team === 0 ? Math.min(tx, W*.42) : Math.max(tx, W*.58);
    if (waiting){ tx = p.team === 0 ? Math.min(tx, W/2 - 110) : Math.max(tx, W/2 + 110); if (p.slot > 0) ty = formation(S.players.length/2, p.slot, p.team).y; }
    const mateHas = S.owner && S.owner.team === p.team;
    if (!waiting && !mateHas && gap < KICK_RANGE + 1 && (b.x - p.x)*dir > -4) kick = true;
    if (!waiting && !mateHas && gap < 70 && (b.x - ownX)*dir < 260){ tx = b.x - dir*(PR + BR); ty = b.y; }
    if (!waiting && S.owner && S.owner.team !== p.team){
      if (gap < 26 && p.tackleCd <= 0 && p.stun <= 0 && random(S.rng) < D.tackleTry*.8) kick = true;
      if (canSprint && Math.abs(b.x - ownX) < 300) p.aiSprint = true;
    }
  } else {
    // hücumda boşa çık, savunmada geride kal
    const poss = S.lastTouch && S.lastTouch.team === p.team;
    tx = poss ? b.x + dir*170 : b.x - dir*120;
    ty = b.y < H/2 ? H*.74 : H*.26;
    tx = Math.max(60, Math.min(W - 60, tx));
    if (!(S.owner && S.owner.team === p.team) && gap < KICK_RANGE + 1 && (b.x - p.x)*dir > 0) kick = true;
  }

  // hedefe yaklaşınca fren yap (kaymayı önler)
  const vmax = 3.4*D.speed;
  let dvx = (tx - p.x)*.09, dvy = (ty - p.y)*.09; const dv = Math.hypot(dvx, dvy);
  if (dv > vmax){ dvx = dvx/dv*vmax; dvy = dvy/dv*vmax; }
  let mx = (dvx - p.vx)/P_ACC, my = (dvy - p.vy)/P_ACC; const ml = Math.hypot(mx, my);
  if (ml > 1){ mx /= ml; my /= ml; }
  return { x: mx, y: my, kick, special, hold: p.aiHold, sprint: p.aiSprint };
}

function pickAiShot(S, p, goalDist, oppX){
  const b = S.ball, gx = oppX, gy = H/2;
  const lx = gx - b.x, ly = gy - b.y, ll = Math.hypot(lx, ly) || 1;
  const blocked = S.players.some(o => {
    if (o.team === p.team) return false;
    const t = ((o.x - b.x)*lx + (o.y - b.y)*ly)/(ll*ll);
    if (t < 0 || t > 1) return false;
    const px = b.x + lx*t - o.x, py = b.y + ly*t - o.y;
    return Math.hypot(px, py) < PR + 16;
  });
  if (blocked && p.cd.asirtma <= 0 && goalDist > 160 && goalDist < 520) return 'asirtma';
  if (p.cd.fuze <= 0 && goalDist > 180 && goalDist < 480) return 'fuze';
  if (p.cd.falso <= 0 && goalDist < 420) return 'falso';
  return null;
}

// topu süren bot: hedefe döner, sonra pas/şut
function aiOwnerInput(S, p, D, oppX){
  const b = S.ball;
  p.aiSprint = false;
  const req = S.req[p.team];
  if (!p.plan || --p.planT <= 0 || (req && req.p !== p && p.plan.m !== req.p)){
    p.plan = makePlan(S, p, D, oppX); p.planT = req ? (p.plan.toMate ? 10 : 200) : 45;
  }
  const pl = p.plan;
  const passing = pl.kind === 'pass' || pl.kind === 'bank';
  // pas hedefi hareket ediyorsa güncelle
  if (passing && pl.m && p.planT % 10 === 0){
    const np = passPlan(S, p, pl.m, 12); if (np){ pl.x = np.x; pl.y = np.y; pl.kind = np.kind; }
  }
  const ta = Math.atan2(pl.y - p.y, pl.x - p.x);
  const err = Math.atan2(Math.sin(ta - p.dirA), Math.cos(ta - p.dirA));
  const goalDist = Math.hypot(oppX - b.x, H/2 - b.y);
  let mx, my, spd = 1, kick = false, special = null;
  if (pl.kind === 'dribble'){
    // öndeki rakipten sıyrıl
    const fx = Math.cos(ta), fy = Math.sin(ta);
    let ax = fx, ay = fy;
    for (const o of S.players){
      if (o.team === p.team) continue;
      const ox = o.x - p.x, oy = o.y - p.y, od = Math.hypot(ox, oy);
      if (od > 110 || (ox*fx + oy*fy) < 0) continue;
      const side = (ox*(-fy) + oy*fx) > 0 ? -1 : 1;   // rakibin ters tarafına kay
      const w = (110 - od)/110*1.2;
      ax += -fy*side*w; ay += fx*side*w;
    }
    const al = Math.hypot(ax, ay) || 1; mx = ax/al; my = ay/al;
    const pressured = S.players.some(o => o.team !== p.team && Math.hypot(o.x - b.x, o.y - b.y) < 48);
    if (pressured && p.planT > 12) p.planT = 12;
    const clearAhead = !S.players.some(o => o.team !== p.team && Math.hypot(o.x - p.x, o.y - p.y) < 140 && ((o.x - p.x)*fx + (o.y - p.y)*fy) > 0);
    if (clearAhead && !p.tired && p.sta > .5 && goalDist > 220) p.aiSprint = true;
    if (goalDist < D.range*.8 && Math.abs(err) < .25 && pressured) kick = true;
  } else {
    spd = Math.abs(err) > .5 ? .3 : .55;
    mx = Math.cos(ta)*spd; my = Math.sin(ta)*spd;
    const req = S.req[p.team];
    const pressedNow = S.players.some(o => o.team !== p.team && Math.hypot(o.x - b.x, o.y - b.y) < 50);
    let tol = passing ? D.turnTol*.8 : D.turnTol;
    if (req && pl.m === req.p) tol = Math.max(tol, pressedNow ? .3 : .14);
    if (Math.abs(err) < tol && random(S.rng) < Math.max(.5, D.react)){
      kick = true;
      if (S.specials && pl.kind === 'shoot' && random(S.rng) < D.special*6) special = pickAiShot(S, p, goalDist, oppX);
      if (special) kick = false;
    }
  }
  // yakında rakip varsa topu vücuduyla koru
  // sadece sürerken koru; pas ya da şut için dönerken koruma bot'u ters yöne çevirmesin
  const shield = S.diff > 0 && pl.kind === 'dribble' && !pl.toMate &&
    S.players.some(o => o.team !== p.team && Math.hypot(o.x - p.x, o.y - p.y) < 60);
  return { x: mx*D.speed, y: my*D.speed, kick, special, hold: shield && !kick, sprint: !!p.aiSprint && !kick };
}

// botlar topu tutan insan oyuncudan pas ister
export function aiCalls(S){
  if (S.phase !== 'play') return;
  const b = S.ball;
  for (const h of S.players){
    if (h.ctrl === 'ai') continue;
    if (Math.hypot(b.x - h.x, b.y - h.y) - PR - BR > 30) continue;
    const dir = h.team === 0 ? 1 : -1;
    for (const m of S.players){
      if (m.team !== h.team || m.ctrl !== 'ai' || m.callCd > 0) continue;
      if ((m.x - b.x)*dir < 60 || random(S.rng) > .012) continue;
      if (!laneOpen(S, b.x, b.y, m.x, m.y, h.team)) continue;
      m.bubble = { text: 'Pas!', t: 70 }; m.callCd = 260;
    }
  }
}
