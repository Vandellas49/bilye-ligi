/* ---------- çevrimiçi: kendi oyuncunun tahmini (client-side prediction) ----------
   Sunucu otoritedir; diğer oyuncular ve top ~100 ms geriden enterpole edilerek çizilir. Kendi oyuncun ise
   tuşlarına anında tepki versin diye burada, sunucuyla aynı hareket kurallarıyla (shared/sim.js predictMove)
   60 Hz'te yerel olarak ilerletilir.
   Düzeltme (reconciliation): bir anlık görüntü geldiğinde sunucunun bildirdiği konum, benim bir gidiş-dönüş
   süresi önceki tahmini konumumla karşılaştırılır (sunucu girdilerimi o kadar geç görür). Aradaki fark
   (çarpışma, müdahale gibi tahmin edilemeyenler) birkaç adımda yumuşakça uygulanır; çok büyükse doğrudan atlanır.
   Top sendeyse top da tahmini konumun önünde çizilir. Maç durumunu değiştirmez, yalnızca çizilen görünümü. */
import { TICK } from '../shared/constants.js';
import { predictMove, sanitizeInput } from '../shared/sim.js';

const PULL = .12;        // farkın her adımda uygulanan kısmı
const SNAP_DIST = 90;    // bundan büyük farkta doğrudan sunucu konumuna geç
const MAX_STEPS = 8;     // kare başına en fazla tahmin adımı (sekme arka plandan dönünce)
const HIST_MS = 1500;

export function createPredictor(){ return { on: false, x: 0, y: 0, vx: 0, vy: 0, sta: 1, tired: false, sprinting: false, acc: 0, dirA: 0, hist: [], errX: 0, errY: 0, seenAt: 0 }; }

/* M: çevrimiçi maç (client/net.js), V: görünüm, me: kendi oyuncum (görünümde), raw: bu karenin girdisi,
   dt: geçen süre (ms), now: performance.now(), rtt: ölçülen ping (ms) */
export function updatePrediction(P, M, V, me, raw, dt, now, rtt){
  const newest = M.snaps.length ? M.snaps[M.snaps.length - 1] : null;
  const live = newest && (newest.phase === 'play' || newest.phase === 'kickoff' || newest.phase === 'freekick') && V.phase !== 'goal';
  const srv = newest && newest.players[me.id];
  if (!live || !srv || (srv[6] & 48)){ P.on = false; return; }        // gol arası, kayarken ya da kenardayken: sunucuya bırak
  if (!P.on){
    Object.assign(P, { on: true, x: srv[0], y: srv[1], vx: srv[2], vy: srv[3], sta: srv[5], tired: !!(srv[6] & 1), acc: 0, dirA: srv[4], hist: [], errX: 0, errY: 0, seenAt: M.newestAt });
  }
  // yeni görüntü: sunucu konumunu bir gidiş-dönüş önceki tahminimle karşılaştır
  if (M.newestAt !== P.seenAt){
    P.seenAt = M.newestAt;
    const at = M.newestAt - (rtt || 0) - TICK, h = nearest(P.hist, at);
    if (h){
      P.errX = srv[0] - h.x; P.errY = srv[1] - h.y;
      if (Math.hypot(P.errX, P.errY) > SNAP_DIST){   // ışınlanma (başlama vuruşu, gol sonrası) ya da büyük kayma
        Object.assign(P, { x: srv[0], y: srv[1], vx: srv[2], vy: srv[3], hist: [], errX: 0, errY: 0 });
      }
    }
    P.sta = srv[5]; P.tired = !!(srv[6] & 1);   // dayanıklılık sunucudan
  }
  const inp = sanitizeInput(raw);
  const o = { owned: V.owner === me, phase: newest.phase, kickoffTeam: newest.kickoffTeam, sliding: false };
  const body = { x: P.x, y: P.y, vx: P.vx, vy: P.vy, sta: P.sta, tired: P.tired, sprinting: false, team: me.team, r: me.r };
  P.acc += Math.min(dt, MAX_STEPS*TICK);
  let t = now - P.acc;
  while (P.acc >= TICK){
    P.acc -= TICK; t += TICK;
    predictMove(body, inp, o);
    // farkın bir kısmını uygula; geçmişteki konumlar da aynı kadar kayar ki fark iki kez sayılmasın
    const cx = P.errX*PULL, cy = P.errY*PULL;
    body.x += cx; body.y += cy; P.errX -= cx; P.errY -= cy;
    for (const e of P.hist){ e.x += cx; e.y += cy; }
    P.hist.push({ t, x: body.x, y: body.y });
  }
  while (P.hist.length && now - P.hist[0].t > HIST_MS) P.hist.shift();
  Object.assign(P, { x: body.x, y: body.y, vx: body.vx, vy: body.vy, sta: body.sta, tired: body.tired, sprinting: body.sprinting });
  // bakış yönü: basılan yöne
  const il = Math.hypot(inp.x, inp.y);
  if (il > .2){ const ta = Math.atan2(inp.y, inp.x), da = Math.atan2(Math.sin(ta - P.dirA), Math.cos(ta - P.dirA)); P.dirA += Math.max(-.2, Math.min(.2, da)); }
  else P.dirA = me.dirA;
}
function nearest(hist, t){
  let best = null;
  for (const e of hist) if (!best || Math.abs(e.t - t) < Math.abs(best.t - t)) best = e;
  return best && Math.abs(best.t - t) < 120 ? best : null;
}

// tahmini görünüme yaz: kendi oyuncum tahmini yerde; top bendeyse top da onunla
export function applyPrediction(P, V, me){
  if (!P.on) return;
  const ox = me.x, oy = me.y;
  me.x = P.x; me.y = P.y; me.vx = P.vx; me.vy = P.vy; me.dirA = P.dirA; me.sprinting = P.sprinting;
  if (V.owner === me){ V.ball.x += P.x - ox; V.ball.y += P.y - oy; }
}
