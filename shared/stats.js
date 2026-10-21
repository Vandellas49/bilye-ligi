/* ---------- maç istatistikleri ----------
   Simülasyonun içinde tutulur (S.stats), deterministiktir; çevrimiçinde sunucu maç sonunda özetini gönderir.
   Topa sahip olma: topu tutan takımın tick sayısı.
   Şut: rakip kaleye 520 birimden yakın, ağız çevresine yönelen sert (5,5 üstü) vuruş; gol olan her vuruş da şuttur.
   İsabetli şut: sonuca göre, gol olduysa ya da rakip kaleci tuttuysa/değdiyse (kurtarış). Savunmacıya çarpan
   ya da dışarı giden isabetsiz.
   Pas: şut olmayan vuruş. İsabetli: topa sonra dokunan (tutan ya da tek dokunuşla vuran) aynı takımdan başka
   biriyse; rakip dokunursa isabetsiz. Top kapma: müdahale, kayarak kapma, top çalma. Penaltı atışları sayılmaz. */
import { W, TOP, BOT } from './constants.js';

const blank = () => ({ g: 0, sh: 0, onT: 0, pa: 0, paOk: 0, tk: 0, sv: 0, fl: 0, yc: 0, rc: 0 });
const SHOT_WINDOW = 150;   // şutun sonucunu bekleme süresi (tick)

export function initStats(S){
  S.stats = { poss: [0, 0], last: null, shot: null, pl: S.players.map(blank) };
}

// her vuruştan hemen sonra (top hızı ayarlanmışken)
export function statKick(S, p){
  if (S.phase === 'penalty') return;
  const st = S.stats, b = S.ball, dir = p.team === 0 ? 1 : -1, gx = p.team === 0 ? W : 0;
  let shot = false;
  if (b.vx*dir > .5 && Math.abs(gx - b.x) < 520 && Math.hypot(b.vx, b.vy) > 5.5){
    const t = (gx - b.x)/b.vx, yc = b.y + b.vy*t;
    if (yc > TOP - 40 && yc < BOT + 40) shot = true;
  }
  const pl = st.pl[p.id];
  if (shot){ pl.sh++; st.shot = { id: p.id, team: p.team, t: S.t }; st.last = null; }
  else { pl.pa++; st.last = { id: p.id, team: p.team }; st.shot = null; }
}

// eski çağrı yeri (updateOwner); sonuçlar statStep'te son dokunana göre belirlenir
export function statOwner(){}

// her adımın sonunda: sahiplik, pas ve şut sonuçları, olaylar (top kapma, faul, gol)
export function statStep(S){
  const st = S.stats, lt = S.lastTouch, goal = S.events.find(e => e.type === 'goal');
  if (S.phase === 'play' && S.owner) st.poss[S.owner.team]++;
  if (goal && S.goalInfo && S.goalInfo.scorer && !S.goalInfo.own){
    const v = st.pl[S.goalInfo.scorer.id];
    v.g++;
    if (st.shot && st.shot.id === S.goalInfo.scorer.id) v.onT++;
    else {
      // yavaş ya da sekerek giren vuruş da şuttur (pas sayıldıysa düzelt)
      if (st.last && st.last.id === S.goalInfo.scorer.id && v.pa > 0) v.pa--;
      v.sh++; v.onT++;
    }
    st.shot = null; st.last = null;
  }
  // pas: topa sonra dokunan belli olunca
  if (st.last && lt && lt.id !== st.last.id){
    if (lt.team === st.last.team) st.pl[st.last.id].paOk++;
    st.last = null;
  }
  // şut: rakip kaleci değdiyse kurtarış ve isabetli; başka biri değdiyse (blok) isabetsiz
  if (st.shot){
    if (lt && lt.id !== st.shot.id){
      if (lt.keeper && lt.team !== st.shot.team){ st.pl[st.shot.id].onT++; st.pl[lt.id].sv++; }
      st.shot = null;
    } else if (S.t - st.shot.t > SHOT_WINDOW) st.shot = null;
  }
  for (const e of S.events){
    if ((e.type === 'tackleWin' || e.type === 'slideWin' || e.type === 'steal') && st.pl[e.id]) st.pl[e.id].tk++;
    else if (e.type === 'foul' && st.pl[e.id]){ const v = st.pl[e.id]; v.fl++; if (e.card === 'sari') v.yc++; if (e.card === 'kirmizi') v.rc++; }
  }
}

/* Özet: takım karşılaştırması ve maçın oyuncusu (gol, isabetli şut, isabetli pas, top kapma, kurtarış; kazanan takıma artı) */
export function statSummary(S){
  const st = S.stats;
  if (!st) return null;
  const sum = (t, k) => st.pl.reduce((a, v, i) => a + (S.players[i] && S.players[i].team === t ? v[k] : 0), 0);
  const tot = st.poss[0] + st.poss[1] || 1;
  const teams = [0, 1].map(t => ({
    poss: Math.round(st.poss[t]/tot*100), sh: sum(t, 'sh'), onT: sum(t, 'onT'), pa: sum(t, 'pa'), paOk: sum(t, 'paOk'), tk: sum(t, 'tk'), sv: sum(t, 'sv'), fl: sum(t, 'fl'), yc: sum(t, 'yc'), rc: sum(t, 'rc'),
  }));
  const win = S.score[0] !== S.score[1] ? (S.score[0] > S.score[1] ? 0 : 1) : S.penScore ? (S.penScore[0] > S.penScore[1] ? 0 : 1) : -1;
  let mvp = null;
  st.pl.forEach((v, i) => {
    const p = S.players[i];
    if (!p) return;
    const score = v.g*3 + v.onT*.6 + v.paOk*.25 + v.tk*.8 + v.sv*1.2 + (p.team === win ? 1 : 0) - v.yc*.5 - v.rc*2;
    if (!mvp || score > mvp.score) mvp = { id: i, name: p.name, team: p.team, score, ...v };
  });
  return { teams, mvp, players: st.pl.map((v, i) => ({ id: i, name: S.players[i].name, team: S.players[i].team, ...v })) };
}
