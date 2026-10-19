/* ---------- çizim ----------
   Maç durumunu okur, değiştirmez. Parçacık, iz, yazı ve oyuncu animasyonları
   istemci tarafındaki efekt durumunda (fx) tutulur. */
import { W, H, GH, GD, TOP, BOT, POST_R, MARGIN, VIEW, TEAM_COL, TEAM_DARK, SHOTS, SHOT_TYPES, POSTS, ARENAS } from '../shared/constants.js';
import { fx, visOf, reduceMotion } from './effects.js';
import { SHOT_KEYS } from './input.js';
import { isTouch } from './ui.js';

const ART_R = 19; // karakter çizimi bu ölçüde yapılıp fizik yarıçapına büyütülür

let cv, ctx, stage, scale = 1, dpr = 1;
const bg = document.createElement('canvas'), bgx = bg.getContext('2d');
let S = null;   // çizilen maç durumu (yalnızca okunur)
let V = null;   // istemci görünümü: { mode, paused, cfg }

export function initRender(canvas, stageEl){ cv = canvas; ctx = cv.getContext('2d'); stage = stageEl; }

export function resize(){
  const r = stage.getBoundingClientRect();
  const aw = Math.max(200, r.width - 20), ah = Math.max(150, r.height - 10);
  scale = Math.min(aw/VIEW.w, ah/VIEW.h);
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = Math.floor(VIEW.w*scale), ch = Math.floor(VIEW.h*scale);
  cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
  cv.width = Math.floor(cw*dpr); cv.height = Math.floor(ch*dpr);
  renderBg();
}
function worldTransform(c){
  const k = scale*dpr;
  c.setTransform(k, 0, 0, k, -VIEW.x*k, -VIEW.y*k);
}
function rr(c, x, y, w, h, r){ c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }

// saha arka planı bir kez offscreen canvas'a çizilir
export function renderBg(state){
  if (state) S = state;
  if (!S) return;
  bg.width = cv.width; bg.height = cv.height;
  const c = bgx, A = ARENAS[S.arena];
  c.setTransform(1,0,0,1,0,0); c.clearRect(0,0,bg.width,bg.height);
  worldTransform(c);
  // dış alan
  c.fillStyle = A.outer; c.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
  decorateOuter(c, A);
  // saha zemini
  c.save(); rr(c, -6, -6, W + 12, H + 12, 22); c.clip();
  if (A.stripes){
    const n = 12, sw = (W + 12)/n;
    for (let i = 0; i < n; i++){ c.fillStyle = A.stripes[i%2]; c.fillRect(-6 + i*sw, -6, sw + 1, H + 12); }
  } else {
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#f48ca0'); g.addColorStop(.5, '#c56fae'); g.addColorStop(1, '#7a54c2');
    c.fillStyle = g; c.fillRect(-6, -6, W + 12, H + 12);
    for (let i = 0; i < 12; i += 2){ c.fillStyle = 'rgba(255,255,255,.045)'; c.fillRect(-6 + i*(W + 12)/12, -6, (W + 12)/12, H + 12); }
  }
  if (S.weather === 'kar'){
    for (let i = 0; i < 900; i++){
      c.fillStyle = `rgba(255,255,255,${.06 + Math.random()*.2})`;
      c.beginPath(); c.arc(Math.random()*W, Math.random()*H, .6 + Math.random()*1.6, 0, Math.PI*2); c.fill();
    }
    for (const [x0, y0, x1, y1] of [[0,0,0,60],[0,H,0,H-60]]){
      const fg = c.createLinearGradient(x0, y0, x1, y1);
      fg.addColorStop(0, 'rgba(255,255,255,.28)'); fg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = fg; c.fillRect(-6, Math.min(y0, y1) - 6, W + 12, 72);
    }
  }
  // kenarlarda yumuşak gölge
  const v = c.createRadialGradient(W/2, H/2, H*.3, W/2, H/2, W*.62);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.22)');
  c.fillStyle = v; c.fillRect(-6, -6, W + 12, H + 12);
  c.restore();

  // çizgiler
  c.strokeStyle = A.line; c.lineWidth = 3;
  if (A.id === 'gece'){ c.shadowColor = 'rgba(120,230,255,.9)'; c.shadowBlur = 10; }
  c.strokeRect(0, 0, W, H);
  c.beginPath(); c.moveTo(W/2, 0); c.lineTo(W/2, H); c.stroke();
  c.beginPath(); c.arc(W/2, H/2, 80, 0, Math.PI*2); c.stroke();
  c.fillStyle = A.line; c.beginPath(); c.arc(W/2, H/2, 4, 0, Math.PI*2); c.fill();
  for (const s of [0, 1]){
    const x = s ? W - 150 : 0;
    c.strokeRect(x, H/2 - 150, 150, 300);
    c.strokeRect(s ? W - 55 : 0, H/2 - 105, 55, 210);
    c.beginPath(); c.arc(s ? W - 150 : 150, H/2, 50, s ? Math.PI/2 : -Math.PI/2, s ? Math.PI*1.5 : Math.PI/2); c.stroke();
  }
  c.shadowBlur = 0;

  // kaleler
  for (const s of [0, 1]){
    const x0 = s ? W : -GD;
    c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(x0, TOP, GD, GH);
    c.save(); c.beginPath(); c.rect(x0, TOP, GD, GH); c.clip();
    c.strokeStyle = A.net; c.lineWidth = 1;
    for (let k = -GH; k < GD + GH; k += 9){
      c.beginPath(); c.moveTo(x0 + k, TOP); c.lineTo(x0 + k + GH, BOT); c.stroke();
      c.beginPath(); c.moveTo(x0 + k + GH, TOP); c.lineTo(x0 + k, BOT); c.stroke();
    }
    c.restore();
    c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 4; c.lineJoin = 'round';
    c.beginPath();
    if (s){ c.moveTo(W, TOP); c.lineTo(W + GD, TOP); c.lineTo(W + GD, BOT); c.lineTo(W, BOT); }
    else { c.moveTo(0, TOP); c.lineTo(-GD, TOP); c.lineTo(-GD, BOT); c.lineTo(0, BOT); }
    c.stroke();
  }
  for (const [i, po] of POSTS.entries()){
    const team = i < 2 ? 0 : 1;
    c.fillStyle = TEAM_COL[team]; c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 2;
    c.beginPath(); c.arc(po.x, po.y, POST_R, 0, Math.PI*2); c.fill(); c.stroke();
  }
}

function decorateOuter(c, A){
  const x0 = VIEW.x, x1 = VIEW.x + VIEW.w, y0 = VIEW.y, y1 = VIEW.y + VIEW.h;
  if (A.id === 'gece'){
    // tuğla duvar ve ışıklar
    for (const [ya, yb] of [[y0, -8], [H + 8, y1]]){
      for (let y = ya, row = 0; y < yb; y += 11, row++){
        for (let x = x0 - (row%2)*14; x < x1; x += 28){
          c.fillStyle = row%2 ? '#3a2430' : '#43293a'; c.fillRect(x + 1, y + 1, 26, 9);
        }
      }
    }
    for (let x = 40; x < W; x += 92){
      const g = c.createRadialGradient(x, y0 + 12, 0, x, y0 + 12, 26);
      g.addColorStop(0, 'rgba(255,214,120,.95)'); g.addColorStop(1, 'rgba(255,214,120,0)');
      c.fillStyle = g; c.fillRect(x - 26, y0 - 14, 52, 52);
    }
  } else if (A.id === 'kil'){
    c.fillStyle = '#c9c2b6';
    c.fillRect(x0, H + 14, VIEW.w, 4); c.fillRect(x0, -18, VIEW.w, 4);
    for (let x = 30; x < W; x += 110){
      for (const y of [H + 28, -28]){
        c.fillStyle = '#4f8d45'; c.beginPath(); c.arc(x, y, 9, 0, Math.PI*2); c.arc(x + 9, y + 2, 7, 0, Math.PI*2); c.arc(x - 8, y + 3, 6, 0, Math.PI*2); c.fill();
      }
    }
  } else if (A.id === 'cim'){
    for (let i = 0; i < 140; i++){
      const x = x0 + Math.random()*VIEW.w, y = Math.random() < .5 ? y0 + Math.random()*28 : y1 - Math.random()*28;
      c.fillStyle = ['#f6d2e4','#fff3b0','#ffffff'][i%3]; c.globalAlpha = .7;
      c.beginPath(); c.arc(x, y, 1.6 + Math.random()*1.4, 0, Math.PI*2); c.fill();
    }
    c.globalAlpha = 1;
  } else {
    const g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, '#5a2f63'); g.addColorStop(1, '#25183f');
    c.fillStyle = g; c.fillRect(x0, y0, VIEW.w, VIEW.h);
  }
}

function drawAmbient(c){
  if (!fx.ambient.length) return;
  const t = S.t, kar = fx.weather === 'kar', move = !V.paused && V.mode !== 'end';
  const tint = ARENAS[S.arena].rays || '255,240,200';
  for (const f of fx.ambient){
    if (move){
      f.y += f.vy*(reduceMotion ? .4 : 1) * (kar ? f.r/2 : 1);
      f.x += Math.sin(t*.018 + f.ph)*(kar ? .4 : .15) + (kar ? .12 : 0);
      if (f.y > VIEW.y + VIEW.h + 6){ f.y = VIEW.y - 6; f.x = VIEW.x + Math.random()*VIEW.w; }
      if (f.y < VIEW.y - 6){ f.y = VIEW.y + VIEW.h + 6; f.x = VIEW.x + Math.random()*VIEW.w; }
      if (f.x > VIEW.x + VIEW.w + 6) f.x = VIEW.x - 6;
    }
    if (kar){
      if (f.r > 2.4){ c.fillStyle = `rgba(255,255,255,${f.a*.18})`; c.beginPath(); c.arc(f.x, f.y, f.r*2.2, 0, Math.PI*2); c.fill(); }
      c.fillStyle = `rgba(255,255,255,${f.a})`; c.beginPath(); c.arc(f.x, f.y, f.r, 0, Math.PI*2); c.fill();
    } else {
      const a = f.a*(.35 + .65*Math.abs(Math.sin(t*.04 + f.ph))), r = f.r*1.8;
      c.fillStyle = `rgba(${tint},${a})`;
      c.beginPath(); c.moveTo(f.x, f.y - r); c.quadraticCurveTo(f.x, f.y, f.x + r, f.y); c.quadraticCurveTo(f.x, f.y, f.x, f.y + r);
      c.quadraticCurveTo(f.x, f.y, f.x - r, f.y); c.quadraticCurveTo(f.x, f.y, f.x, f.y - r); c.fill();
    }
  }
}

function drawRays(c, A){
  if (!A.rays) return;
  const t = reduceMotion ? 0 : S.t;
  c.save(); rr(c, -6, -6, W + 12, H + 12, 22); c.clip();
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++){
    const base = ((t*.35 + i*330) % 1700) - 350;
    const w = 70 + (i%3)*45;
    const a = A.rayA*(.6 + .4*Math.sin(t*.01 + i*1.7));
    const g = c.createLinearGradient(base, 0, base + w, 0);
    g.addColorStop(0, `rgba(${A.rays},0)`); g.addColorStop(.5, `rgba(${A.rays},${a})`); g.addColorStop(1, `rgba(${A.rays},0)`);
    c.fillStyle = g;
    c.beginPath(); c.moveTo(base, -10); c.lineTo(base + w, -10); c.lineTo(base + w - 260, H + 10); c.lineTo(base - 260, H + 10); c.closePath(); c.fill();
  }
  c.restore();
}

function shade(hex, amt){
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, r + amt)); g = Math.max(0, Math.min(255, g + amt)); b = Math.max(0, Math.min(255, b + amt));
  return `rgb(${r},${g},${b})`;
}

function drawPlayer(c, p){
  // karakteri ART_R ölçüsünde çiz, fizik boyutuna büyüt
  const k = p.r/ART_R;
  c.save(); c.translate(p.x, p.y); c.scale(k, k); c.translate(-p.x, -p.y);
  drawPlayerArt(c, p, ART_R);
  c.restore();
}

function drawPlayerArt(c, p, r){
  const col = TEAM_COL[p.team], dark = TEAM_DARK[p.team], v = visOf(p);
  const sp = Math.hypot(p.vx, p.vy), run = Math.min(1, sp/2.2);
  const va = Math.atan2(p.vy, p.vx);
  const bob = -Math.abs(Math.sin(v.walk))*2*run;
  const y0 = p.y + bob;
  // gölge
  c.fillStyle = 'rgba(0,0,0,.3)';
  c.beginPath(); c.ellipse(p.x + 3, p.y + 8, r*.95 - bob*.3, r*.6, 0, 0, Math.PI*2); c.fill();
  // ayakkabılar
  for (const s of [-1, 1]){
    const lift = Math.max(0, Math.sin(v.walk + (s > 0 ? 0 : Math.PI)))*4*run;
    const fx = p.x + s*8, fy = p.y + r - 2 - lift;
    c.fillStyle = '#1e1828'; c.beginPath(); c.ellipse(fx, fy, 6.5, 4.2, 0, 0, Math.PI*2); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(fx, fy + 1.6, 5.5, 1.3, 0, 0, Math.PI*2); c.fill();
    c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(fx - 2, fy - 1.6, 2.2, 1, 0, 0, Math.PI*2); c.fill();
  }
  if (p.armed){
    c.strokeStyle = SHOTS[p.armed.type].color; c.lineWidth = 3; c.globalAlpha = .55 + .45*Math.sin(S.t*.6);
    c.beginPath(); c.arc(p.x, y0, r + 5, 0, Math.PI*2); c.stroke(); c.globalAlpha = 1;
  }
  // depar: arkada kalan yansımalar ve hız çizgileri
  if (p.sprinting && sp > 2.4){
    const ux = p.vx/sp, uy = p.vy/sp;
    for (let i = 3; i >= 1; i--){
      c.globalAlpha = .1 + .07*(3 - i);
      c.fillStyle = col; c.beginPath(); c.arc(p.x - ux*i*8, y0 - uy*i*8, r*(1 - i*.07), 0, Math.PI*2); c.fill();
    }
    c.globalAlpha = 1;
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineCap = 'round';
    for (const o of [-10, 0, 10]){
      const ph = (S.t*2.2 + (o + 10)*1.7) % 16, len = o === 0 ? 18 : 11;
      const px = -uy*o, py = ux*o;
      const sx = p.x - ux*(r + 4 + ph) + px, sy = y0 - uy*(r + 4 + ph) + py;
      c.globalAlpha = 1 - ph/16; c.lineWidth = o === 0 ? 2.6 : 2;
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx - ux*len, sy - uy*len); c.stroke();
    }
    c.globalAlpha = 1;
  }
  // topu tutuyorsa ayağının altında takım renginde hale
  if (S.owner === p){
    const a = .35 + .2*Math.sin(S.t*.25);
    c.strokeStyle = shade(col, 40); c.globalAlpha = a; c.lineWidth = 3;
    c.beginPath(); c.ellipse(p.x, p.y + 6, r + 7, r*.7 + 4, 0, 0, Math.PI*2); c.stroke(); c.globalAlpha = 1;
  }
  // gövde
  const st = Math.min(.1, sp*.028) + (p.mood === 'kick' ? .07 : 0) + (p.sprinting ? .05 : 0);
  c.save();
  c.translate(p.x, y0); c.rotate(va); c.scale(1 + st, 1 - st); c.rotate(-va);
  const g = c.createRadialGradient(-r*.38, -r*.45, r*.1, 0, 0, r*1.05);
  g.addColorStop(0, shade(col, 70)); g.addColorStop(.45, col); g.addColorStop(1, shade(col, -38));
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, Math.PI*2); c.fill();
  c.save(); c.clip();
  // forma: alt kısım koyu takım rengi, beyaz şerit ve numara
  const kitY = 7.5;
  const kg = c.createLinearGradient(0, kitY, 0, r);
  kg.addColorStop(0, shade(dark, 25)); kg.addColorStop(1, shade(dark, -15));
  c.fillStyle = kg; c.fillRect(-r - 2, kitY, 2*r + 4, r);
  c.fillStyle = 'rgba(255,255,255,.9)'; c.fillRect(-r - 2, kitY - 1.6, 2*r + 4, 1.8);
  c.fillStyle = '#ffffff';
  c.font = '800 8.5px Figtree, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(String(p.num), 0, kitY + 6.2);
  // kenar ışığı ve parlama
  c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 2;
  c.beginPath(); c.arc(0, 0, r - 1.5, Math.PI*.15, Math.PI*.6); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.ellipse(-7.5, -11, 5.2, 2.8, -.6, 0, Math.PI*2); c.fill();
  c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(-10.5, -9, 1.3, 0, Math.PI*2); c.fill();
  c.restore();
  const kicking = p.input.kick;
  c.lineWidth = kicking ? 3.5 : 2.2;
  c.strokeStyle = kicking ? '#ffffff' : shade(dark, -25);
  c.beginPath(); c.arc(0, 0, r, 0, Math.PI*2); c.stroke();
  c.restore();
  if (p.ctrl !== 'ai'){
    c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 2; c.setLineDash([4, 5]);
    c.beginPath(); c.arc(p.x, y0, r + 6, 0, Math.PI*2); c.stroke(); c.setLineDash([]);
  }
  if (p.ctrl !== 'ai' || S.owner === p){
    const ax = p.x + Math.cos(p.dirA)*(r + 11), ay = y0 + Math.sin(p.dirA)*(r + 11);
    c.save(); c.translate(ax, ay); c.rotate(p.dirA);
    c.fillStyle = S.owner === p ? '#ffffff' : 'rgba(255,255,255,.55)';
    c.beginPath(); c.moveTo(5, 0); c.lineTo(-3, -4.5); c.lineTo(-3, 4.5); c.closePath(); c.fill();
    c.restore();
  }
  drawFace(c, p, y0 - 2, v);
  drawAccessory(c, p, y0, r);
  // üzgünken ter damlası, sevinçte yıldız
  if (p.mood === 'dizzy'){
    const t = S.t*.2;
    c.fillStyle = '#ffe36b';
    for (let i = 0; i < 3; i++){ const a = t + i*2.09; c.beginPath(); c.arc(p.x + Math.cos(a)*12, y0 - r - 3 + Math.sin(a)*3.5, 2.2, 0, Math.PI*2); c.fill(); }
  }
  if (p.mood === 'sad' || p.tired){
    c.fillStyle = '#9fe3ff';
    c.beginPath(); c.moveTo(p.x + 13, y0 - 12); c.quadraticCurveTo(p.x + 17, y0 - 5, p.x + 13, y0 - 4); c.quadraticCurveTo(p.x + 9, y0 - 5, p.x + 13, y0 - 12); c.fill();
  } else if (p.mood === 'happy'){
    const t = S.t*.12 + p.slot;
    c.fillStyle = '#fff3a0';
    for (let i = 0; i < 3; i++){
      const a = t + i*2.1, sx = p.x + Math.cos(a)*(r + 8), sy = y0 - 4 + Math.sin(a)*(r*.6 + 6);
      c.beginPath(); for (let j = 0; j < 8; j++){ const rr2 = j % 2 ? 1.3 : 3.4, aa = j*Math.PI/4; c.lineTo(sx + Math.cos(aa)*rr2, sy + Math.sin(aa)*rr2); } c.closePath(); c.fill();
    }
  }
}

function drawAccessory(c, p, yBody, r){
  const x = p.x, k = p.accCol;
  // başlıklar gözleri kapatmasın diye biraz yukarıda durur
  const y0 = p.acc === 'scarf' ? yBody : yBody - 4;
  c.lineCap = 'round';
  if (p.acc === 'beanie'){
    c.save(); c.beginPath(); c.arc(x, yBody, r + .5, 0, Math.PI*2); c.clip();
    c.fillStyle = k; c.fillRect(x - r - 2, y0 - r - 2, 2*r + 4, r - 7);
    c.fillStyle = 'rgba(255,255,255,.35)';
    for (let i = -r; i < r; i += 5) c.fillRect(x + i, y0 - r - 2, 2, r - 9);
    c.fillStyle = shade(k.length === 7 ? k : '#888888', -35); c.fillRect(x - r - 2, y0 - 12, 2*r + 4, 5);
    c.restore();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x + 2, y0 - r - 2, 5, 0, Math.PI*2); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.2)'; c.lineWidth = 1; c.stroke();
  } else if (p.acc === 'headband'){
    c.save(); c.beginPath(); c.arc(x, yBody, r + .5, 0, Math.PI*2); c.clip();
    c.fillStyle = k; c.fillRect(x - r - 2, y0 - 13, 2*r + 4, 5); c.restore();
    const flap = Math.sin(S.t*.25 + p.slot)*2;
    c.strokeStyle = k; c.lineWidth = 3;
    c.beginPath(); c.moveTo(x + r - 1, y0 - 10); c.lineTo(x + r + 7, y0 - 14 + flap); c.stroke();
    c.beginPath(); c.moveTo(x + r - 1, y0 - 10); c.lineTo(x + r + 6, y0 - 6 + flap); c.stroke();
  } else if (p.acc === 'cap'){
    c.save(); c.beginPath(); c.arc(x, yBody, r + .5, 0, Math.PI*2); c.clip();
    c.fillStyle = k; c.beginPath(); c.ellipse(x, y0 - r + 2, r + 2, 11, 0, 0, Math.PI*2); c.fill(); c.restore();
    const bx = x + Math.cos(p.dirA)*9, by = y0 - 9 + Math.sin(p.dirA)*2;
    c.fillStyle = shade(k, -30); c.beginPath(); c.ellipse(bx, by, 10, 3.5, p.dirA*.25, 0, Math.PI*2); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x, y0 - r + 1, 1.8, 0, Math.PI*2); c.fill();
  } else if (p.acc === 'earmuffs'){
    c.strokeStyle = '#2a2233'; c.lineWidth = 2.5;
    c.beginPath(); c.arc(x, y0 - 2, r + 1, Math.PI*1.08, Math.PI*1.92); c.stroke();
    for (const s of [-1, 1]){
      c.fillStyle = k; c.beginPath(); c.arc(x + s*(r - 1), y0 - 3, 6, 0, Math.PI*2); c.fill();
      c.fillStyle = 'rgba(255,255,255,.45)'; c.beginPath(); c.arc(x + s*(r - 1) - 1.5, y0 - 4.5, 2.2, 0, Math.PI*2); c.fill();
    }
  } else if (p.acc === 'scarf'){
    c.save(); c.beginPath(); c.arc(x, y0, r + .5, 0, Math.PI*2); c.clip();
    c.fillStyle = k; c.fillRect(x - r - 2, y0 + 3, 2*r + 4, 5);
    c.fillStyle = 'rgba(255,255,255,.5)'; for (let i = -r; i < r; i += 7) c.fillRect(x + i, y0 + 3, 3, 5);
    c.restore();
    // rüzgârda dalgalanan uç (hareketin tersine)
    const sp = Math.hypot(p.vx, p.vy), back = Math.atan2(-p.vy, -p.vx);
    const len = 8 + Math.min(10, sp*3), wv = Math.sin(S.t*.35 + p.slot)*2.5;
    const sx = x + (sp > .3 ? Math.cos(back)*8 : 9), sy = y0 + 6;
    const ex = sx + (sp > .3 ? Math.cos(back) : .4)*len, ey = sy + (sp > .3 ? Math.sin(back) : 1)*len + wv;
    c.strokeStyle = k; c.lineWidth = 5; c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.stroke();
  } else if (p.acc === 'sprout'){
    const sw = Math.sin(S.t*.08 + p.slot)*.25;
    c.strokeStyle = '#3c8a3a'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x, y0 - r + 1); c.quadraticCurveTo(x + 1, y0 - r - 6, x + sw*10, y0 - r - 9); c.stroke();
    c.fillStyle = '#5cc35a';
    c.beginPath(); c.ellipse(x - 4 + sw*10, y0 - r - 9, 5, 2.6, -.5, 0, Math.PI*2); c.fill();
    c.beginPath(); c.ellipse(x + 4 + sw*10, y0 - r - 10, 5, 2.6, .5, 0, Math.PI*2); c.fill();
  }
}

function drawFace(c, p, y0, v){
  const ink = '#241c2e';
  const lx = v.lookX, ly = v.lookY, mood = p.mood, f = p.face;
  const cx = p.x + Math.cos(p.dirA)*3, cy = y0 + Math.sin(p.dirA)*2;
  // yanak
  c.fillStyle = 'rgba(255,110,140,.38)';
  c.beginPath(); c.ellipse(cx - 10.5, cy + 3, 3.6, 2.2, 0, 0, Math.PI*2); c.fill();
  c.beginPath(); c.ellipse(cx + 10.5, cy + 3, 3.6, 2.2, 0, 0, Math.PI*2); c.fill();
  if (V.mode !== 'end' && !V.paused && --v.blink < 0) v.blink = 150 + Math.random()*220|0;
  const blinking = v.blink < 6 && mood !== 'happy';
  c.lineCap = 'round'; c.lineJoin = 'round';
  const eyePos = f === 'cyclops' ? [[0, -3]] : [[-5.5, -3], [5.5, -3]];

  for (const [ox, oy] of eyePos){
    const ex = cx + ox, ey = cy + oy;
    c.strokeStyle = ink; c.fillStyle = ink;
    if (mood === 'happy'){
      c.lineWidth = 2.2; c.beginPath(); c.arc(ex, ey + 1.8, f === 'cyclops' ? 4.5 : 3, Math.PI*1.15, Math.PI*1.85); c.stroke(); continue;
    }
    if (mood === 'dizzy'){
      c.lineWidth = 2; c.beginPath(); c.moveTo(ex - 2.8, ey - 2.8); c.lineTo(ex + 2.8, ey + 2.8); c.moveTo(ex + 2.8, ey - 2.8); c.lineTo(ex - 2.8, ey + 2.8); c.stroke(); continue;
    }
    if (blinking){ c.lineWidth = 2; c.beginPath(); c.moveTo(ex - 3, ey); c.lineTo(ex + 3, ey); c.stroke(); continue; }
    if (f === 'bead' || f === 'grumpy' || f === 'smug'){
      c.beginPath(); c.arc(ex + lx*.8, ey + ly*.8, 3.1, 0, Math.PI*2); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(ex + lx*.8 - 1.1, ey + ly*.8 - 1.1, 1.1, 0, Math.PI*2); c.fill();
    } else if (f === 'big' || f === 'cyclops'){
      const rw = f === 'cyclops' ? 7.5 : 5, rh = f === 'cyclops' ? 7.5 : 6;
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(ex, ey, rw, rh, 0, 0, Math.PI*2); c.fill();
      c.lineWidth = 1; c.stroke();
      c.fillStyle = ink; c.beginPath(); c.arc(ex + lx*rw*.45, ey + ly*rh*.4, f === 'cyclops' ? 3.4 : 2.4, 0, Math.PI*2); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(ex + lx*rw*.45 - 1, ey + ly*rh*.4 - 1, .9, 0, Math.PI*2); c.fill();
    } else if (f === 'sleepy'){
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(ex, ey + .5, 4, 3, 0, 0, Math.PI*2); c.fill();
      c.fillStyle = ink; c.beginPath(); c.arc(ex + lx, ey + 1, 1.9, 0, Math.PI*2); c.fill();
      c.lineWidth = 2; c.beginPath(); c.moveTo(ex - 4.5, ey - .8); c.lineTo(ex + 4.5, ey - .8); c.stroke();
    }
    // kaşlar
    const side = Math.sign(ox) || 1;
    if (f === 'grumpy' || mood === 'kick' || (p.sprinting && mood === 'idle')){
      c.lineWidth = 2; c.beginPath(); c.moveTo(ex - 3.5*side, ey - 6.5); c.lineTo(ex + 3*side, ey - 4.2); c.stroke();
    } else if (mood === 'sad'){
      c.lineWidth = 1.8; c.beginPath(); c.moveTo(ex - 3.5*side, ey - 4.5); c.lineTo(ex + 3*side, ey - 6.8); c.stroke();
    }
  }

  const mx = cx, my = cy + 6.5;
  c.strokeStyle = ink; c.fillStyle = ink; c.lineWidth = 1.9;
  if (mood === 'happy'){ c.beginPath(); c.arc(mx, my - 2, 4.6, .12*Math.PI, .88*Math.PI); c.closePath(); c.fill(); }
  else if (mood === 'sad'){ c.beginPath(); c.arc(mx, my + 3, 3.6, 1.2*Math.PI, 1.8*Math.PI); c.stroke(); }
  else if (p.sprinting && mood === 'idle'){
    // dişini sıkmış
    c.fillStyle = '#ffffff'; rr(c, mx - 3.8, my - 1.6, 7.6, 3.6, 1.6); c.fill();
    c.lineWidth = 1.3; c.stroke();
    c.beginPath(); c.moveTo(mx, my - 1.6); c.lineTo(mx, my + 2); c.stroke();
  }
  else if (mood === 'tired' || p.tired){ c.beginPath(); c.ellipse(mx, my + 1, 3.2, 2.4 + Math.abs(Math.sin(S.t*.3))*1.2, 0, 0, Math.PI*2); c.fill(); }
  else if (mood === 'dizzy'){ c.beginPath(); c.moveTo(mx - 3.5, my + 1); c.quadraticCurveTo(mx - 1.5, my - 1.5, mx, my + 1); c.quadraticCurveTo(mx + 1.5, my + 3, mx + 3.5, my); c.stroke(); }
  else if (mood === 'kick'){ c.beginPath(); c.ellipse(mx, my, 2.3, 2.9, 0, 0, Math.PI*2); c.fill(); }
  else if (f === 'grumpy'){ c.beginPath(); c.moveTo(mx - 3, my + 1); c.lineTo(mx + 3, my + 1); c.stroke(); }
  else if (f === 'smug'){ c.beginPath(); c.moveTo(mx - 3, my); c.quadraticCurveTo(mx + 1, my + 2.5, mx + 4, my - 1.5); c.stroke(); }
  else if (f === 'sleepy'){ c.beginPath(); c.arc(mx, my + .5, 1.6, 0, Math.PI*2); c.stroke(); }
  else { c.beginPath(); c.moveTo(mx - 2.6, my); c.quadraticCurveTo(mx, my + 2.2, mx + 2.6, my); c.stroke(); }
}

// şut güç barı: oyuncunun etrafında saat yönünde dolan halka (yeşil -> sarı -> kırmızı)
function drawCharge(c, p){
  if (!(p.charge > 0) || S.phase === 'goal') return;
  const r = p.r + 10, a0 = -Math.PI/2, k = Math.min(1, p.charge);
  c.lineCap = 'round';
  c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 6;
  c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI*2); c.stroke();
  c.strokeStyle = k < .5 ? '#5be37d' : k < .85 ? '#ffd23f' : '#ff5a5a'; c.lineWidth = 4;
  c.beginPath(); c.arc(p.x, p.y, r, a0, a0 + Math.PI*2*k); c.stroke();
}

function drawLabel(c, p){
  drawCharge(c, p);
  if (p.sta < .995 && S.phase !== 'goal'){
    const w = 30, h = 5, x = p.x - w/2, y = p.y - p.r - 11;
    c.fillStyle = 'rgba(0,0,0,.5)'; rr(c, x - 1, y - 1, w + 2, h + 2, 3.5); c.fill();
    const col = p.tired ? (S.t % 16 < 8 ? '#ff5a5a' : '#ff9a9a') : p.sta > .5 ? '#5be37d' : p.sta > .25 ? '#ffd23f' : '#ff7a45';
    c.fillStyle = col; rr(c, x, y, Math.max(2, w*p.sta), h, 2.5); c.fill();
    if (p.sprinting){
      // şimşek işareti
      const bx = x - 8, by = y + 2.5;
      c.fillStyle = '#ffe14d'; c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(bx + 1.5, by - 6); c.lineTo(bx - 2.5, by + .8); c.lineTo(bx, by + .8); c.lineTo(bx - 1.5, by + 6);
      c.lineTo(bx + 3, by - 1); c.lineTo(bx + .5, by - 1); c.closePath(); c.fill(); c.stroke();
    }
  }
  c.font = '700 11px Figtree, system-ui, sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const w = c.measureText(p.name).width + 10, y = p.y + p.r + 11;
  c.fillStyle = 'rgba(0,0,0,.45)'; rr(c, p.x - w/2, y - 7, w, 14, 7); c.fill();
  c.fillStyle = p.ctrl !== 'ai' ? '#ffffff' : 'rgba(255,255,255,.82)';
  c.fillText(p.name, p.x, y + .5);
}

function drawBall(c, b){
  const TC = { normal:'255,255,255', falso:'200,107,255', fuze:'255,140,40', asirtma:'150,225,255' };
  for (const t of fx.trail){
    const k = t.life/t.max;
    c.fillStyle = `rgba(${TC[t.type]},${k*(t.type === 'normal' ? .28 : .55)})`;
    c.beginPath(); c.arc(t.x, t.y, b.r*k*(t.type === 'fuze' ? 1.25 : .9), 0, Math.PI*2); c.fill();
  }
  const z = b.z, lift = 1 + z/70;
  c.fillStyle = `rgba(0,0,0,${.3/(1 + z/30)})`;
  c.beginPath(); c.ellipse(b.x + 3 + z*.15, b.y + 5, b.r*.9*(1 + z/90), b.r*.65*(1 + z/90), 0, 0, Math.PI*2); c.fill();
  const by = b.y - z, r = b.r*lift;
  if (b.fire > 0){
    const g = c.createRadialGradient(b.x, by, 0, b.x, by, r*3);
    g.addColorStop(0, 'rgba(255,170,60,.7)'); g.addColorStop(1, 'rgba(255,90,20,0)');
    c.fillStyle = g; c.beginPath(); c.arc(b.x, by, r*3, 0, Math.PI*2); c.fill();
  } else if (b.curve){
    c.strokeStyle = 'rgba(210,130,255,.8)'; c.lineWidth = 2;
    const a0 = S.t*.4;
    c.beginPath(); c.arc(b.x, by, r + 5, a0, a0 + 1.6); c.stroke();
    c.beginPath(); c.arc(b.x, by, r + 5, a0 + Math.PI, a0 + Math.PI + 1.6); c.stroke();
  }
  c.save();
  c.beginPath(); c.arc(b.x, by, r, 0, Math.PI*2); c.fillStyle = '#ffffff'; c.fill();
  c.clip();
  const dir = Math.atan2(b.vy, b.vx);
  c.fillStyle = '#2a2233';
  for (let i = 0; i < 3; i++){
    const off = ((b.spin*2.2 + i*7.3) % 22) - 11;
    const px = b.x + Math.cos(dir)*off + Math.cos(dir + Math.PI/2)*(i - 1)*7;
    const py = by + Math.sin(dir)*off + Math.sin(dir + Math.PI/2)*(i - 1)*7;
    c.beginPath(); c.arc(px, py, 2.8*lift, 0, Math.PI*2); c.fill();
  }
  c.restore();
  c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 1.6;
  c.beginPath(); c.arc(b.x, by, r, 0, Math.PI*2); c.stroke();
}

function drawReqBubbles(c){
  for (const rq of S.req){
    if (!rq || S.phase === 'goal') continue;
    const p = rq.p, pulse = 1 + .08*Math.sin(S.t*.35);
    const x = p.x + 16, y = p.y - p.r - 24;
    c.save(); c.translate(x, y); c.scale(pulse, pulse);
    c.font = '800 14px Figtree, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = c.measureText('Pas!').width + 18;
    c.fillStyle = '#ffffff'; c.strokeStyle = TEAM_DARK[p.team]; c.lineWidth = 2.5;
    rr(c, -w/2, -12, w, 24, 12); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-9, 10); c.lineTo(-16, 19); c.lineTo(-2, 11); c.closePath(); c.fill();
    c.fillStyle = '#241c2e'; c.fillText('Pas!', 0, .5);
    c.restore();
  }
}

function drawPassInfo(c){
  drawReqBubbles(c);
  const ps = S.pass;
  if (ps && S.phase !== 'goal'){
    const m = ps.to, a = .5 + .4*Math.sin(S.t*.3);
    c.strokeStyle = `rgba(255,255,255,${a})`; c.lineWidth = 2.5; c.setLineDash([3, 6]);
    c.beginPath(); c.arc(m.x, m.y, m.r + 9, 0, Math.PI*2); c.stroke(); c.setLineDash([]);
  }
  for (const p of S.players){
    if (!p.bubble) continue;
    const k = Math.min(1, p.bubble.t/10, (70 - p.bubble.t + 1)/6);
    const x = p.x + 14, y = p.y - p.r - 22;
    c.globalAlpha = k;
    c.font = '800 13px Figtree, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = c.measureText(p.bubble.text).width + 16;
    c.fillStyle = '#ffffff'; c.strokeStyle = TEAM_DARK[p.team]; c.lineWidth = 2;
    rr(c, x - w/2, y - 11, w, 22, 11); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x - 8, y + 9); c.lineTo(x - 14, y + 17); c.lineTo(x - 2, y + 10); c.closePath(); c.fill();
    c.fillStyle = '#241c2e'; c.fillText(p.bubble.text, x, y + .5);
    c.globalAlpha = 1;
  }
}

function drawPops(c){
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const q of fx.pops){
    const k = q.life/q.max;
    if (!V.paused) { q.life--; q.y -= .5; }
    c.globalAlpha = Math.min(1, k*2);
    c.font = `800 ${16 + (1 - k)*4}px Figtree, system-ui, sans-serif`;
    c.lineWidth = 4; c.strokeStyle = 'rgba(20,10,30,.8)'; c.strokeText(q.text, q.x, q.y);
    c.fillStyle = q.color; c.fillText(q.text, q.x, q.y);
  }
  c.globalAlpha = 1;
  fx.pops = fx.pops.filter(q => q.life > 0);
}

function drawShotHud(c){
  if (V.mode !== 'match' || !S.specials) return;
  const touch = isTouch();
  for (const p of S.players){
    if (p.ctrl !== 'h1' && p.ctrl !== 'h2') continue;   // yalnızca bu cihazdaki oyuncular
    const w = 96, h = 22, gap = 8, total = 3*w + 2*gap;
    let x = p.team === 0 ? 0 : W - total;
    const y = H + (MARGIN - h)/2 + 2;
    for (const t of SHOT_TYPES){
      const sh = SHOTS[t], ready = p.cd[t] <= 0, k = 1 - p.cd[t]/sh.cd;
      c.fillStyle = 'rgba(15,10,25,.6)'; rr(c, x, y, w, h, 11); c.fill();
      c.save(); rr(c, x, y, w, h, 11); c.clip();
      c.fillStyle = sh.color; c.globalAlpha = ready ? .95 : .45; c.fillRect(x, y, w*k, h); c.restore();
      c.globalAlpha = 1;
      c.font = '800 11.5px Figtree, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = ready ? '#160d20' : '#ffffff';
      const key = touch ? '' : SHOT_KEYS[t][p.ctrl === 'h1' ? 0 : 1].replace('Key', '') + '  ';
      c.fillText(key + sh.name, x + w/2, y + h/2 + .5);
      x += w + gap;
    }
  }
}

function drawParticles(c){
  for (const q of fx.particles){
    q.x += q.vx; q.y += q.vy; q.vx *= .95; q.vy *= .95; q.life--;
    c.globalAlpha = Math.max(0, q.life/q.max);
    c.fillStyle = q.color; c.beginPath(); c.arc(q.x, q.y, q.size, 0, Math.PI*2); c.fill();
  }
  c.globalAlpha = 1;
  fx.particles = fx.particles.filter(q => q.life > 0);
}

function drawBanner(c){
  if (S.phase === 'goal' && S.goalInfo){
    const k = Math.min(1, (S.t - S.goalInfo.t)/14);
    const sc = .6 + .4*(1 - Math.pow(1 - k, 3));
    c.save(); c.translate(W/2, H/2 - 20); c.scale(sc, sc);
    c.font = '400 110px "Bagel Fat One", Figtree, system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 12; c.strokeStyle = 'rgba(20,10,30,.75)'; c.lineJoin = 'round';
    c.strokeText('GOL!', 0, 0);
    c.fillStyle = TEAM_COL[S.goalInfo.team]; c.fillText('GOL!', 0, 0);
    const sc2 = S.goalInfo.scorer;
    if (sc2){
      c.font = '800 26px Figtree, system-ui, sans-serif';
      const txt = S.goalInfo.own ? `${sc2.name} kendi kalesine` : sc2.name;
      c.lineWidth = 6; c.strokeText(txt, 0, 74); c.fillStyle = '#ffffff'; c.fillText(txt, 0, 74);
    }
    c.restore();
  } else if (S.phase === 'kickoff' && V.mode === 'match'){
    c.font = '800 18px Figtree, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const mine = S.players.find(p => p.ctrl === 'h1');
    const txt = !V.online && V.cfg && V.cfg.opp === 'friend' ? `Başlama vuruşu: ${S.kickoffTeam === 0 ? '1P' : '2P'}`
      : mine ? (S.kickoffTeam === mine.team ? (V.online ? 'Başlama vuruşu takımında' : 'Başlama vuruşu sende') : 'Rakip başlıyor')
      : `Başlama vuruşu: ${S.teamNames[S.kickoffTeam]}`;
    const w = c.measureText(txt).width + 26;
    c.fillStyle = 'rgba(0,0,0,.45)'; rr(c, W/2 - w/2, H/2 + 100, w, 32, 16); c.fill();
    c.fillStyle = '#fff'; c.fillText(txt, W/2, H/2 + 116.5);
  }
}

export function render(state, view){
  S = state; V = view;
  if (!S) return;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  let sx = 0, sy = 0;
  if (fx.shake > 0){ sx = (Math.random()*2 - 1)*fx.shake*dpr*scale; sy = (Math.random()*2 - 1)*fx.shake*dpr*scale; fx.shake *= .88; if (fx.shake < .3) fx.shake = 0; }
  ctx.drawImage(bg, sx, sy);
  worldTransform(ctx);
  ctx.translate(sx/(scale*dpr), sy/(scale*dpr));
  drawRays(ctx, ARENAS[S.arena]);
  if (!S.players.length) return;
  const sorted = S.players.slice().sort((a, b) => a.y - b.y);
  for (const p of sorted) drawPlayer(ctx, p);
  for (const p of sorted) drawLabel(ctx, p);
  drawBall(ctx, S.ball);
  drawParticles(ctx);
  drawPassInfo(ctx);
  drawAmbient(ctx);
  drawPops(ctx);
  drawShotHud(ctx);
  drawBanner(ctx);
  drawNetInfo(ctx);
}

// çevrimiçi maçta bağlantı bilgisi (sahanın üst kenarında, küçük)
function drawNetInfo(c){
  if (!V.online || V.mode !== 'match' || !V.netInfo) return;
  c.font = '700 11px Figtree, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const w = c.measureText(V.netInfo).width + 16, y = -MARGIN/2;
  c.fillStyle = 'rgba(0,0,0,.45)'; rr(c, W/2 - w/2, y - 9, w, 18, 9); c.fill();
  c.fillStyle = 'rgba(255,255,255,.9)'; c.fillText(V.netInfo, W/2, y + .5);
}
