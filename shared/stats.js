/* ---------- maç istatistikleri ----------
   Simülasyonun içinde tutulur (S.stats), deterministiktir; çevrimiçinde sunucu maç sonunda özetini gönderir.
   Topa sahip olma: topu tutan takımın tick sayısı. Şut: rakip kaleye 520 birimden yakın, ağız çevresine yönelen sert (5,5 üstü) vuruş,
   isabetli: kale ağzına giden. Pas: şut olmayan vuruş, isabetli: top aynı takımdan başka oyuncuya geçerse.
   Top kapma: müdahale, kayarak kapma ve top çalma. Kurtarış: kalecinin rakip şutunu tutması. */
import { W, TOP, BOT } from './constants.js';

const blank = () => ({ g: 0, sh: 0, onT: 0, pa: 0, paOk: 0, tk: 0, sv: 0 });

export function initStats(S){
  S.stats = { poss: [0, 0], last: null, pl: S.players.map(blank) };
}

// her vuruştan hemen sonra (top hızı ayarlanmışken)
export function statKick(S, p){
  const st = S.stats, b = S.ball, dir = p.team === 0 ? 1 : -1, gx = p.team === 0 ? W : 0;
  let shot = false, onT = false;
  const sp = Math.hypot(b.vx, b.vy);
  if (b.vx*dir > .5 && Math.abs(gx - b.x) < 520 && sp > 5.5){
    const t = (gx - b.x)/b.vx, yc = b.y + b.vy*t;
    if (yc > TOP - 40 && yc < BOT + 40){ shot = true; onT = yc > TOP + 4 && yc < BOT - 4; }
  }
  const pl = st.pl[p.id];
  if (shot){ pl.sh++; if (onT) pl.onT++; } else pl.pa++;
  st.last = { id: p.id, team: p.team, shot, done: false };
}

// top bir oyuncuya geçtiğinde (updateOwner)
export function statOwner(S, q){
  const st = S.stats, l = st.last;
  if (!l || l.done) return;
  l.done = true;
  if (!l.shot && q.team === l.team && q.id !== l.id) st.pl[l.id].paOk++;
  if (l.shot && q.keeper && q.team !== l.team) st.pl[q.id].sv++;
}

// her adımın sonunda: sahiplik ve olaylar (top kapma, gol)
export function statStep(S){
  const st = S.stats;
  if (S.phase === 'play' && S.owner) st.poss[S.owner.team]++;
  for (const e of S.events){
    if ((e.type === 'tackleWin' || e.type === 'slideWin' || e.type === 'steal') && st.pl[e.id]) st.pl[e.id].tk++;
    else if (e.type === 'goal' && S.goalInfo && S.goalInfo.scorer && !S.goalInfo.own) st.pl[S.goalInfo.scorer.id].g++;
  }
}

/* Özet: takım karşılaştırması ve maçın oyuncusu (gol, isabetli şut, isabetli pas, top kapma, kurtarış; kazanan takıma artı) */
export function statSummary(S){
  const st = S.stats;
  if (!st) return null;
  const sum = (t, k) => st.pl.reduce((a, v, i) => a + (S.players[i] && S.players[i].team === t ? v[k] : 0), 0);
  const tot = st.poss[0] + st.poss[1] || 1;
  const teams = [0, 1].map(t => ({
    poss: Math.round(st.poss[t]/tot*100), sh: sum(t, 'sh'), onT: sum(t, 'onT'), pa: sum(t, 'pa'), paOk: sum(t, 'paOk'), tk: sum(t, 'tk'), sv: sum(t, 'sv'),
  }));
  const win = S.score[0] === S.score[1] ? -1 : S.score[0] > S.score[1] ? 0 : 1;
  let mvp = null;
  st.pl.forEach((v, i) => {
    const p = S.players[i];
    if (!p) return;
    const score = v.g*3 + v.onT*.6 + v.paOk*.25 + v.tk*.8 + v.sv*1.2 + (p.team === win ? 1 : 0);
    if (!mvp || score > mvp.score) mvp = { id: i, name: p.name, team: p.team, score, ...v };
  });
  return { teams, mvp, players: st.pl.map((v, i) => ({ id: i, name: S.players[i].name, team: S.players[i].team, ...v })) };
}
