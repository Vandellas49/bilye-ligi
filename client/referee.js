/* ---------- hakem ----------
   Yalnızca görsel (istemcide, fx.ref): maç durumuna, çarpışmalara ve sunucuya dokunmaz. Oyunu topu çaprazdan,
   oyunculardan uzak durarak izler; serbest vuruşta topun yanında, başlama vuruşunda orta yuvarlakta, penaltıda
   noktanın yanında durur. Faulde olay yerine koşar ve kartı (sarı/kırmızı) kaldırır. Çizimde bir oyuncu gibi
   (siyah forma, numarasız) çizilir: render.js ve render3d.js fx.ref'i oyuncu listesine ekler. */
import { W, H, PR, P_ACC, P_DAMP } from '../shared/constants.js';
import { fx } from './effects.js';

const REF_KIT = { id: 'hakem', name: 'Hakem', c1: '#1c1c22', c2: '#1c1c22', dark: '#08080a', ui: '#2a2a30', num: '#ffffff', pat: 'duz' };

function makeRef(){
  return {
    ref: true, id: 99, team: -1, slot: 0, name: 'Hakem', ctrl: 'ref', num: '', kitOverride: REF_KIT,
    x: W/2 - 70, y: H/2 + 150, vx: 0, vy: 0, r: PR, dirA: -Math.PI/2, sta: 1, tired: false, sprinting: false, stun: 0,
    mood: 'idle', moodT: 0, face: 'bead', acc: 'none', accCol: '#ffffff', skin: '#c98e62', hair: 'kisa', hairCol: '#1c1410', tattoo: null,
    input: { x: 0, y: 0, kick: false }, cd: { falso: 0, fuze: 0, asirtma: 0 }, armed: null, slideT: 0, charge: 0, bubble: null,
    card: null, focus: null,
  };
}

// her adımdan sonra (yerel ve çevrimiçi)
export function updateRef(S){
  if (!S || !S.players || !S.players.length){ fx.ref = null; return; }
  if (!fx.ref || fx.refS !== S){ fx.ref = makeRef(); fx.refS = S; }
  const R = fx.ref, b = S.ball;
  let tx, ty;
  if (R.focus && R.focus.t-- > 0){ tx = R.focus.x - 50; ty = R.focus.y + (R.focus.y < H/2 ? 60 : -60); }   // faul yerine koş
  else if (S.phase === 'freekick' && S.fk){ tx = S.fk.x + (S.fk.x < W/2 ? 70 : -70); ty = S.fk.y + (S.fk.y < H/2 ? 90 : -90); }
  else if (S.phase === 'kickoff' || S.phase === 'goal'){ tx = W/2 - 70; ty = H/2 - 165; }   // orta yuvarlağın üstünde (alttaki yazının altında kalmasın)
  else if (S.phase === 'penalty' && S.pens){ const gx = S.pens.turn === 0 ? W - 150 : 150; tx = gx; ty = H/2 + 170; }
  else {
    // topu çaprazdan izle: topun saha ortasına doğru yanında, biraz geride
    tx = b.x + (b.x > W/2 ? -120 : 120)*.7; ty = b.y + (b.y < H/2 ? 130 : -130);
  }
  tx = Math.max(40, Math.min(W - 40, tx)); ty = Math.max(30, Math.min(H - 30, ty));
  // oyunculardan uzak dur
  for (const p of S.players){
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d < 60 && d > 0){ tx += dx/d*(60 - d); ty += dy/d*(60 - d); }
  }
  const dx = tx - R.x, dy = ty - R.y, d = Math.hypot(dx, dy);
  const run = d > 140, acc = P_ACC*(run ? 1.15 : .85)*Math.min(1, d/40);
  if (d > 2){ R.vx += dx/d*acc; R.vy += dy/d*acc; }
  R.x += R.vx; R.y += R.vy; R.vx *= P_DAMP; R.vy *= P_DAMP;
  R.sprinting = run && Math.hypot(R.vx, R.vy) > 2.4;
  // topa bakar
  const ta = Math.atan2(b.y - R.y, b.x - R.x), da = Math.atan2(Math.sin(ta - R.dirA), Math.cos(ta - R.dirA));
  R.dirA += Math.max(-.15, Math.min(.15, da));
  if (R.card && --R.card.t <= 0) R.card = null;
}

// olaylar: faulde kart ve olay yerine koşu
export function refEvents(events){
  const R = fx.ref;
  if (!R) return;
  for (const e of events){
    if (e.type !== 'foul') continue;
    R.focus = { x: e.x, y: e.y, t: 70 };
    if (e.card) R.card = { color: e.card === 'kirmizi' ? '#e8283c' : '#ffd21f', t: 120 };
  }
}
