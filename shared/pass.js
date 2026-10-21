/* ---------- pas sistemi: top yolu tahmini ve alıcı seçimi ---------- */
import { W, H, TOP, BOT, PR, BR, B_DAMP, WALL_REST } from './constants.js';

export function simBall(x, y, vx, vy, n){
  const pts = [];
  for (let i = 0; i < n; i++){
    x += vx; y += vy; vx *= B_DAMP; vy *= B_DAMP;
    if (y < BR){ y = BR; vy = -vy*WALL_REST; }
    if (y > H - BR){ y = H - BR; vy = -vy*WALL_REST; }
    if (x < BR){ if (y > TOP && y < BOT){ pts.push({ x, y, goal: true }); break; } x = BR; vx = -vx*WALL_REST; }
    if (x > W - BR){ if (y > TOP && y < BOT){ pts.push({ x, y, goal: true }); break; } x = W - BR; vx = -vx*WALL_REST; }
    pts.push({ x, y });
    if (Math.hypot(vx, vy) < .35) break;
  }
  return pts;
}

// top yolu üzerinde oyuncunun yetişebileceği ilk nokta
export function interceptFor(m, pts){
  for (let i = 0; i < pts.length; i++){
    if (pts[i].goal) return null;
    const d = Math.hypot(pts[i].x - m.x, pts[i].y - m.y) - PR - BR;
    if (d <= i*2.6 + 8) return { i, x: pts[i].x, y: pts[i].y };
  }
  return null;
}

export function registerKick(S, p){
  const b = S.ball, pts = simBall(b.x, b.y, b.vx, b.vy, 120);
  let best = null;
  for (const m of S.players){
    if (m.team !== p.team || m === p || m.out > 0) continue;   // kenardaki pası alamaz
    const it = interceptFor(m, pts);
    if (it && (!best || it.i < best.i)) best = { ...it, m };
  }
  S.pass = best ? { team: p.team, from: p, to: best.m, x: best.x, y: best.y, t: best.i + 45, re: 8 } : null;
  if (S.req[p.team] && best && S.req[p.team].p === best.m) S.req[p.team] = null;
}

export function updatePass(S){
  const ps = S.pass;
  if (!ps) return;
  if (S.lastTouch !== ps.from || --ps.t <= 0){ S.pass = null; return; }
  if (--ps.re <= 0){
    ps.re = 8;
    const b = S.ball, it = interceptFor(ps.to, simBall(b.x, b.y, b.vx, b.vy, 100));
    if (it){ ps.x = it.x; ps.y = it.y; } else { ps.x = b.x; ps.y = b.y; }
  }
}

export function segDist(px, py, ax, ay, bx, by){
  const dx = bx - ax, dy = by - ay, l2 = dx*dx + dy*dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax)*dx + (py - ay)*dy)/l2));
  return Math.hypot(ax + dx*t - px, ay + dy*t - py);
}

export function laneOpen(S, ax, ay, bx, by, team){
  return !S.players.some(o => o.team !== team && !(o.out > 0) && segDist(o.x, o.y, ax, ay, bx, by) < PR + BR + 6);
}
