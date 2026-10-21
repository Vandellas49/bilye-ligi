/* ---------- efektler ----------
   Simülasyonun döndürdüğü olayları parçacık, yazı, sarsıntı ve sese çevirir.
   Buradaki her şey yalnızca istemcide yaşar; maç durumuna (S) yazılmaz. */
import { W, H, SCREEN, TEAM_COL, TEAM_DARK, shotInfo } from '../shared/constants.js';
import { sfx } from './audio.js';

export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const AIR_T = 22;   // kafa/vole/rövaşata animasyon süresi (tick)

export const fx = {
  particles: [], pops: [], trail: [], shake: 0, confetti: [],
  ambient: [], weather: 'sade',
  vis: [],   // oyuncu başına görsel durum (göz kırpma, yürüme, bakış), oyuncu id'siyle
  air: {},   // havadaki topa vuruş animasyonu: id -> { kind: 'kafa' | 'vole' | 'rovasata', t }
};

export function resetFx(){
  fx.particles = []; fx.pops = []; fx.trail = []; fx.shake = 0; fx.vis = []; fx.confetti = []; fx.air = {};
}

export function visOf(p){
  return fx.vis[p.id] || (fx.vis[p.id] = { blink: 120 + Math.random()*200|0, walk: 0, lookX: 0, lookY: 0 });
}

export function burst(x, y, color, n, spd, life){
  if (reduceMotion) n = Math.ceil(n/3);
  for (let i = 0; i < n; i++){
    const a = Math.random()*Math.PI*2, s = spd*(.3 + Math.random()*.7);
    fx.particles.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s, life, max: life, color, size: 2 + Math.random()*3 });
  }
}

/* Gol sevinci: golü atan takımın oyuncuları zıplar (yükseklik, dünya birimi). 2B ve 3B çizim kullanır. */
export function jumpOf(S, p){
  const air = fx.air[p.id];
  if (air && !reduceMotion) return Math.sin((1 - air.t/AIR_T)*Math.PI)*(air.kind === 'kafa' ? 16 : 10);
  if (reduceMotion || S.phase !== 'goal' || !S.goalInfo || p.team !== S.goalInfo.team) return 0;
  const t = S.t - S.goalInfo.t, c = celeOf(S, p);
  if (c){
    // takla atan yüksek sıçrar; el hareketi yapan (gözlük, kulak, uçak, diz) yerde kalır
    if (c.type !== 'takla') return 0;
    const k = taklaPhase(c.t);
    return k < 0 ? 0 : Math.sin(k*Math.PI)*34;
  }
  const scorer = S.goalInfo.scorer === p ? 1.5 : 1;   // golü atan daha yükseğe
  return Math.abs(Math.sin(t*.2 + p.id*1.3))*12*scorer;
}

/* Golü atanın sevinci: { type: 'takla' | 'gozluk' | 'kulak' | 'ucak' | 'diz', t: golden beri tick } ya da null.
   Tür simülasyonda seçilir (goalInfo.cele), kendi kalesine golde sevinç yok. */
export function celeOf(S, p){
  const g = S.goalInfo;
  if (S.phase !== 'goal' || !g || g.own || !g.cele || g.scorer !== p) return null;
  return { type: g.cele, t: S.t - g.t };
}
// takla: 20. tickten başlayıp 40'ar tickte bir tur, iki kez; 0..1 tur içi ilerleme, dışında -1
function taklaPhase(t){ return t >= 20 && t < 100 ? ((t - 20) % 40)/40 : -1; }
// takla dönüş açısı (radyan); 2B'de çizim döner, 3B'de gövde ve yüz kartı
export function flipOf(S, p){
  if (reduceMotion) return 0;
  const air = fx.air[p.id];
  if (air && air.kind === 'rovasata') return (1 - air.t/AIR_T)*Math.PI*2*(p.team === 0 ? -1 : 1);   // geriye takla
  const c = celeOf(S, p);
  if (!c || c.type !== 'takla') return 0;
  const k = taklaPhase(c.t);
  return k < 0 ? 0 : k*Math.PI*2*(p.team === 0 ? 1 : -1);
}

// takım renklerinde konfeti: kalenin önünden ve gol atanın üstünden yağar
function confetti(team, x, y){
  const n = reduceMotion ? 30 : 140, cols = [TEAM_COL[team], TEAM_DARK[team], '#ffffff', TEAM_COL[team]];
  for (let i = 0; i < n; i++){
    const around = i % 3 === 0 && x !== null;
    fx.confetti.push({
      x: around ? x + (Math.random() - .5)*120 : (team === 0 ? W - 160 : 160) + (Math.random() - .5)*320,
      y: around ? y + (Math.random() - .5)*80 : H/2 + (Math.random() - .5)*420,
      h: 60 + Math.random()*160, vh: -(.5 + Math.random()*.9), vx: (Math.random() - .5)*.8, vy: (Math.random() - .5)*.4,
      rot: Math.random()*6.28, vr: (Math.random() - .5)*.3, flip: Math.random()*6.28, vf: .1 + Math.random()*.2,
      size: 4 + Math.random()*4, color: cols[i % cols.length], life: 150 + Math.random()*60,
    });
  }
}

function pop(x, y, text, color, life){ fx.pops.push({ x, y, text, color, life, max: life }); }

export function applyEvents(events){
  for (const e of events){
    switch (e.type){
      case 'kick': burst(e.x, e.y, '#ffffff', 10, 3.2, 22); sfx.kick(); break;
      case 'bounce': sfx.bounce(e.s); break;
      case 'land': sfx.bounce(2); burst(e.x, e.y, 'rgba(255,255,255,.8)', 6, 1.5, 16); break;
      case 'fireStop': burst(e.x, e.y, '#ff9a3c', 14, 4, 26); break;
      case 'steal': burst(e.x, e.y, '#ffffff', 8, 2.5, 18); sfx.bounce(3); break;
      case 'tackle': sfx.tackle(); break;
      case 'tackleWin':
        pop(e.px, e.py - 36, 'Kaptı!', TEAM_COL[e.team], 45);
        burst(e.x, e.y, '#ffffff', 12, 3, 20); sfx.tackleWin(); break;
      case 'slide': sfx.tackle(); burst(e.x, e.y + 14, 'rgba(255,255,255,.7)', 8, 2, 18); break;
      case 'slideWin':
        pop(e.px, e.py - 36, 'Kayarak kaptı!', TEAM_COL[e.team], 50);
        burst(e.x, e.y, '#ffffff', 14, 3.2, 22); sfx.tackleWin(); break;
      case 'slideKick': burst(e.x, e.y, '#ffffff', 8, 2.5, 18); sfx.kick(); break;
      case 'slideMiss': pop(e.x, e.y - 36, 'Sıyrıldı!', TEAM_COL[e.team], 45); sfx.tackleMiss(); break;
      case 'tackleMiss': pop(e.x, e.y - 36, 'Sıyrıldı!', TEAM_COL[e.team], 45); sfx.tackleMiss(); break;
      case 'whiff': pop(e.x, e.y - 36, 'Iska!', '#ffffff', 35); break;
      case 'special': {
        const sh = shotInfo(e.shot), parts = e.shot.split('+');
        if (parts.includes('fuze') && !reduceMotion) fx.shake = Math.max(fx.shake, parts.length > 1 ? 8 : 6);
        burst(e.x, e.y, sh.color, 22, 4.5, 30);
        pop(e.px, e.py - 34, sh.name + '!', sh.color, 55);
        for (const t of parts) sfx[t]();   // kombo: parçaların sesleri birlikte
        break;
      }
      case 'hardShot':   // şut tuşuyla sert şut: füze gibi alev, kısa sarsıntı
        if (!reduceMotion) fx.shake = Math.max(fx.shake, 4);
        burst(e.x, e.y, '#ff7a1f', 16, 4, 26); sfx.fuze(); break;
      case 'aerial': {
        fx.air[e.id] = { kind: e.kind, t: AIR_T };
        const name = { kafa: 'Kafa!', vole: 'Vole!', rovasata: 'Rövaşata!' }[e.kind];
        pop(e.x, e.y - 40, name, e.kind === 'rovasata' ? '#ffe14d' : '#ffffff', 50);
        if (e.kind !== 'kafa' && !reduceMotion) fx.shake = Math.max(fx.shake, 4);
        sfx.ooh(); break;
      }
      case 'foul':
        sfx.whistle();
        pop(e.x, e.y - 40, 'Faul!', '#ffffff', 50);
        if (e.card) pop(e.x, e.y - 70, e.card === 'kirmizi' ? '🟥 Kırmızı kart! 30 sn dışarıda' : '🟨 Sarı kart', e.card === 'kirmizi' ? '#ff5a5a' : '#ffe14d', 90);
        break;
      case 'return': pop(e.x, e.y - 40, 'Oyuna döndü', '#ffffff', 50); break;
      case 'call': sfx.call(); break;
      case 'swap': burst(e.x, e.y, '#ffffff', 10, 2.2, 18); sfx.call(); break;
      case 'goal':
        burst(e.x, H/2, TEAM_COL[e.team], 60, 7, 70);
        burst(e.x, H/2, '#ffffff', 30, 5, 60);
        fx.shake = reduceMotion ? 0 : 16;
        confetti(e.team, e.sx ?? null, e.sy ?? null);
        sfx.goal(); break;
      case 'overtime': case 'end': sfx.whistle(); break;
      case 'kickoff': fx.trail = []; break;
    }
  }
}

// her tick sonrası: depar tozu, füze alevi, top izi, göz ve yürüme animasyonu
export function afterStep(S){
  const live = S.phase === 'kickoff' || S.phase === 'play' || S.phase === 'goal';
  if (!live) return;
  const b = S.ball;
  if (!reduceMotion){
    for (const p of S.players){
      // kayarken yerde toz izi
      if (p.slideT > 0 && Math.hypot(p.vx, p.vy) > 1.5)
        fx.particles.push({ x: p.x - p.vx*2 + (Math.random()-.5)*12, y: p.y + p.r - 6 + (Math.random()-.5)*6, vx: -p.vx*.1, vy: -.4, life: 22, max: 22, color: 'rgba(255,255,255,.6)', size: 2.5 + Math.random()*3 });
      if (p.sprinting && Math.hypot(p.vx, p.vy) > 3 && S.t % 3 === 0)
        fx.particles.push({ x: p.x - p.vx*4 + (Math.random()-.5)*10, y: p.y + p.r - 4, vx: -p.vx*.15, vy: -.3, life: 16, max: 16, color: 'rgba(255,255,255,.55)', size: 2 + Math.random()*2.5 });
    }
    if (b.fire > 0) fx.particles.push({ x: b.x + (Math.random()-.5)*8, y: b.y - b.z + (Math.random()-.5)*8, vx: -b.vx*.12 + (Math.random()-.5), vy: -b.vy*.12 + (Math.random()-.5),
      life: 18, max: 18, color: Math.random() < .5 ? '#ffb238' : '#ff5a1f', size: 2 + Math.random()*3 });
  }

  for (const id in fx.air) if (--fx.air[id].t <= 0) delete fx.air[id];

  // iz
  const sp = Math.hypot(b.vx, b.vy);
  const tType = b.fire > 0 ? 'fuze' : b.curve ? 'falso' : b.z > 0 ? 'asirtma' : 'normal';
  // y: 2B'de havadaki topun ekrandaki yeri; gy ve z: 3B için yerdeki konum ve yükseklik
  if ((sp > 4.5 || tType !== 'normal') && !reduceMotion) fx.trail.push({ x: b.x, y: b.y - b.z, gy: b.y, z: b.z, life: tType === 'normal' ? 14 : 20, max: tType === 'normal' ? 14 : 20, type: tType });
  for (const t of fx.trail) t.life--;
  fx.trail = fx.trail.filter(t => t.life > 0);

  // konfeti: süzülerek düşer, yere değince kaybolur
  for (const q of fx.confetti){
    q.h += q.vh; q.x += q.vx + Math.sin(q.flip)*.3; q.y += q.vy; q.rot += q.vr; q.flip += q.vf; q.life--;
    if (q.h <= 0){ q.h = 0; q.life = Math.min(q.life, 20); }
  }
  fx.confetti = fx.confetti.filter(q => q.life > 0);

  // göz yönü ve yürüme
  for (const p of S.players){
    const v = visOf(p);
    const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 1;
    v.lookX += (dx/d - v.lookX)*.2; v.lookY += (dy/d - v.lookY)*.2;
    v.walk += Math.hypot(p.vx, p.vy)*.32;
  }
}

/* hava: kar taneleri ya da parıltılar */
export function buildAmbient(kind){
  fx.weather = kind; fx.ambient = [];
  const n = kind === 'kar' ? (reduceMotion ? 60 : 170) : kind === 'parilti' ? (reduceMotion ? 30 : 80) : 0;
  for (let i = 0; i < n; i++){
    fx.ambient.push({
      x: SCREEN.x + Math.random()*SCREEN.w, y: SCREEN.y + Math.random()*SCREEN.h,
      r: kind === 'kar' ? .8 + Math.random()*2.6 : 1.2 + Math.random()*2.4,
      vy: kind === 'kar' ? .35 + Math.random()*.9 : -(.05 + Math.random()*.25),
      ph: Math.random()*6.283, a: .35 + Math.random()*.55,
    });
  }
}
