/* ---------- efektler ----------
   Simülasyonun döndürdüğü olayları parçacık, yazı, sarsıntı ve sese çevirir.
   Buradaki her şey yalnızca istemcide yaşar; maç durumuna (S) yazılmaz. */
import { H, VIEW, TEAM_COL, shotInfo } from '../shared/constants.js';
import { sfx } from './audio.js';

export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export const fx = {
  particles: [], pops: [], trail: [], shake: 0,
  ambient: [], weather: 'sade',
  vis: [],   // oyuncu başına görsel durum (göz kırpma, yürüme, bakış), oyuncu id'siyle
};

export function resetFx(){
  fx.particles = []; fx.pops = []; fx.trail = []; fx.shake = 0; fx.vis = [];
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
      case 'call': sfx.call(); break;
      case 'goal':
        burst(e.x, H/2, TEAM_COL[e.team], 60, 7, 70);
        burst(e.x, H/2, '#ffffff', 30, 5, 60);
        fx.shake = reduceMotion ? 0 : 16;
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
      if (p.sprinting && Math.hypot(p.vx, p.vy) > 3 && S.t % 3 === 0)
        fx.particles.push({ x: p.x - p.vx*4 + (Math.random()-.5)*10, y: p.y + p.r - 4, vx: -p.vx*.15, vy: -.3, life: 16, max: 16, color: 'rgba(255,255,255,.55)', size: 2 + Math.random()*2.5 });
    }
    if (b.fire > 0) fx.particles.push({ x: b.x + (Math.random()-.5)*8, y: b.y - b.z + (Math.random()-.5)*8, vx: -b.vx*.12 + (Math.random()-.5), vy: -b.vy*.12 + (Math.random()-.5),
      life: 18, max: 18, color: Math.random() < .5 ? '#ffb238' : '#ff5a1f', size: 2 + Math.random()*3 });
  }

  // iz
  const sp = Math.hypot(b.vx, b.vy);
  const tType = b.fire > 0 ? 'fuze' : b.curve ? 'falso' : b.z > 0 ? 'asirtma' : 'normal';
  if ((sp > 4.5 || tType !== 'normal') && !reduceMotion) fx.trail.push({ x: b.x, y: b.y - b.z, life: tType === 'normal' ? 14 : 20, max: tType === 'normal' ? 14 : 20, type: tType });
  for (const t of fx.trail) t.life--;
  fx.trail = fx.trail.filter(t => t.life > 0);

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
      x: VIEW.x + Math.random()*VIEW.w, y: VIEW.y + Math.random()*VIEW.h,
      r: kind === 'kar' ? .8 + Math.random()*2.6 : 1.2 + Math.random()*2.4,
      vy: kind === 'kar' ? .35 + Math.random()*.9 : -(.05 + Math.random()*.25),
      ph: Math.random()*6.283, a: .35 + Math.random()*.55,
    });
  }
}
