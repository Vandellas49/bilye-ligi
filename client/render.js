/* ---------- çizim ----------
   Maç durumunu okur, değiştirmez. Parçacık, iz, yazı ve oyuncu animasyonları
   istemci tarafındaki efekt durumunda (fx) tutulur. */
import { W, H, GH, GD, TOP, BOT, PR, CENTER_R, POST_R, MARGIN, VIEW, SCREEN, TEAM_COL, TEAM_DARK, SHOTS, SHOT_TYPES, POSTS, ARENAS, SKINS, KITS, kitById, shotInfo } from '../shared/constants.js';
import { fx, visOf, reduceMotion, jumpOf, celeOf, flipOf } from './effects.js';
import { shotKeyLabel } from './input.js';
import { drawCrowd2D } from './crowd.js';
import { isTouch, keyLayout, drawCrest } from './ui.js';

const ART_R = 19; // karakter çizimi bu ölçüde yapılıp fizik yarıçapına büyütülür

let cv, ctx, stage, scale = 1, dpr = 1;
const bg = document.createElement('canvas'), bgx = bg.getContext('2d');
let S = null;   // çizilen maç durumu (yalnızca okunur)
let V = null;   // istemci görünümü: { mode, paused, cfg }
let bgVersion = 0;               // arka plan her yeniden çizildiğinde artar (3B saha dokusu için)
let R3 = null, cv3 = null;       // 3B çizim katmanı (client/render3d.js), seçilince yüklenir
let use3D = false;
// isim, güç barı ve balonların çizileceği yer: 2B'de oyuncunun kendisi, 3B'de ekrana yansıtılmış hali
let posOf = p => p;

export function initRender(canvas, stageEl, canvas3d){ cv = canvas; ctx = cv.getContext('2d'); stage = stageEl; cv3 = canvas3d; }

// 3B katmanın 2B koddan kullandıkları
export const share = {
  ART_R, get bg(){ return bg; }, get bgVersion(){ return bgVersion; },
  drawFace: (...a) => drawFace(...a), drawAccessory: (...a) => drawAccessory(...a),
  drawHairBack: (...a) => drawHairBack(...a), drawGesture: (...a) => drawGesture(...a), drawCrest: (...a) => drawCrest(...a),
};

/* Görünüm: 3B istenirse Three.js (client/three.min.js) ve client/render3d.js yüklenir.
   Açılamazsa (WebGL yok, dosya yüklenemedi) 2B'de kalınır. Dönüş: 3B açık mı. */
/* Dönüş: '3d' açıldı; '2d' 2B istendi; 'software' tarayıcı ekran kartı kullanamıyor (3B yazılımla çizilir,
   oynanamayacak kadar yavaş); 'slow' bu oturumda 3B zaten yavaş bulundu; 'failed' yüklenemedi / WebGL yok. */
let block3D = '';
export async function setView3D(on){
  const off = st => { use3D = false; document.body.classList.remove('three'); resize(); return st; };
  if (!on) return off('2d');
  if (block3D) return off(block3D);
  try {
    if (!window.THREE) await new Promise((res, rej) => {
      const sc = document.createElement('script');
      sc.src = 'client/three.min.js'; sc.onload = res; sc.onerror = () => rej(new Error('three.min.js yüklenemedi'));
      document.head.appendChild(sc);
    });
    if (!R3){ const m = await import('./render3d.js'); m.init3D(cv3, share); R3 = m; }
    const sw = R3.softwareGL();
    // ?3dzorla: yazılımla çizilse de 3B'yi aç (yalnızca deneme ve test için)
    if (sw && !new URLSearchParams(location.search).has('3dzorla')){ console.warn('3B yazılımla çiziliyor (' + sw + '), 2B kullanılıyor.'); block3D = 'software'; return off('software'); }
    use3D = true; document.body.classList.add('three');
    resize();
    return '3d';
  } catch (e){
    console.warn('3B görünüm açılamadı, 2B ile devam ediliyor:', e);
    block3D = 'failed';
    return off('failed');
  }
}
// 3B oyun sırasında yavaş bulunup 2B'ye geçilince çağrılır (main.js menüyü ve kaydı günceller)
let onFallback = () => {};
export function setFallbackHandler(fn){ onFallback = fn; }
export const is3D = () => use3D;
// performans göstergesi için: görünüm ve 3B kalite kademesi (2 en yüksek)
export const viewInfo = () => use3D && R3 ? '3B, kalite ' + R3.quality3D() : '2B';

export function resize(){
  const r = stage.getBoundingClientRect();
  const aw = Math.max(200, r.width - 20), ah = Math.max(150, r.height - 10);
  scale = Math.min(aw/SCREEN.w, ah/SCREEN.h);
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = Math.floor(SCREEN.w*scale), ch = Math.floor(SCREEN.h*scale);
  cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
  cv.width = Math.floor(cw*dpr); cv.height = Math.floor(ch*dpr);
  if (use3D && R3){ cv3.style.width = cw + 'px'; cv3.style.height = ch + 'px'; R3.resize3D(cw, ch, dpr); }
  renderBg();
}
function worldTransform(c){
  const k = scale*dpr;
  c.setTransform(k, 0, 0, k, -SCREEN.x*k, -SCREEN.y*k);
}
function rr(c, x, y, w, h, r){ c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }

// saha arka planı bir kez offscreen canvas'a çizilir
/* O anki maçın formaları: TEAM_COL/TEAM_DARK (hale, konfeti, yazı, direk halkası) ve CSS --team-a/--team-b güncellenir. */
let kitKey = '';
export const kitOf = (S, t) => kitById(S && S.kits ? S.kits[t] : null) || KITS[t];
function applyKitColors(S){
  const key = S && S.kits ? S.kits.join() : 'limon,buz';
  if (key === kitKey) return;
  kitKey = key;
  for (const t of [0, 1]){ const k = kitOf(S, t); TEAM_COL[t] = k.ui; TEAM_DARK[t] = k.dark; }
  const st = document.documentElement.style;
  st.setProperty('--team-a', TEAM_COL[0]); st.setProperty('--team-b', TEAM_COL[1]);
}

export function renderBg(state){
  if (state) S = state;
  if (!S) return;
  applyKitColors(S);
  bg.width = cv.width; bg.height = cv.height; bgVersion++;
  const c = bgx, A = ARENAS[S.arena];
  c.setTransform(1,0,0,1,0,0); c.clearRect(0,0,bg.width,bg.height);
  worldTransform(c);
  // dış alan
  c.fillStyle = A.outer; c.fillRect(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h);
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
  c.beginPath(); c.arc(W/2, H/2, CENTER_R, 0, Math.PI*2); c.stroke();
  c.fillStyle = A.line; c.beginPath(); c.arc(W/2, H/2, 4, 0, Math.PI*2); c.fill();
  for (const s of [0, 1]){
    // ceza sahası, kale alanı ve ceza yayı
    const BX = 188, BH = 375, SX = 69, SH = 262;
    const x = s ? W - BX : 0;
    c.strokeRect(x, H/2 - BH/2, BX, BH);
    c.strokeRect(s ? W - SX : 0, H/2 - SH/2, SX, SH);
    c.beginPath(); c.arc(s ? W - BX : BX, H/2, 62, s ? Math.PI/2 : -Math.PI/2, s ? Math.PI*1.5 : Math.PI/2); c.stroke();
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
  const x0 = SCREEN.x, x1 = SCREEN.x + SCREEN.w, y0 = SCREEN.y, y1 = SCREEN.y + SCREEN.h;
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
    c.fillRect(x0, H + 14, SCREEN.w, 4); c.fillRect(x0, -18, SCREEN.w, 4);
    for (let x = 30; x < W; x += 110){
      for (const y of [H + 28, -28]){
        c.fillStyle = '#4f8d45'; c.beginPath(); c.arc(x, y, 9, 0, Math.PI*2); c.arc(x + 9, y + 2, 7, 0, Math.PI*2); c.arc(x - 8, y + 3, 6, 0, Math.PI*2); c.fill();
      }
    }
  } else if (A.id === 'cim'){
    for (let i = 0; i < 140; i++){
      const x = x0 + Math.random()*SCREEN.w, y = Math.random() < .5 ? y0 + Math.random()*28 : y1 - Math.random()*28;
      c.fillStyle = ['#f6d2e4','#fff3b0','#ffffff'][i%3]; c.globalAlpha = .7;
      c.beginPath(); c.arc(x, y, 1.6 + Math.random()*1.4, 0, Math.PI*2); c.fill();
    }
    c.globalAlpha = 1;
  } else {
    const g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, '#5a2f63'); g.addColorStop(1, '#25183f');
    c.fillStyle = g; c.fillRect(x0, y0, SCREEN.w, SCREEN.h);
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
      if (f.y > SCREEN.y + SCREEN.h + 6){ f.y = SCREEN.y - 6; f.x = SCREEN.x + Math.random()*SCREEN.w; }
      if (f.y < SCREEN.y - 6){ f.y = SCREEN.y + SCREEN.h + 6; f.x = SCREEN.x + Math.random()*SCREEN.w; }
      if (f.x > SCREEN.x + SCREEN.w + 6) f.x = SCREEN.x - 6;
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
  const y0 = p.y + bob - jumpOf(S, p)*.8;   // gol sevincinde zıplar (gölge yerde kalır)
  // gölge
  c.fillStyle = 'rgba(0,0,0,.3)';
  c.beginPath(); c.ellipse(p.x + 3, p.y + 8, r*.95 - bob*.3, r*.6, 0, 0, Math.PI*2); c.fill();
  const flip = flipOf(S, p);
  if (flip){ c.save(); c.translate(p.x, y0); c.rotate(flip); c.translate(-p.x, -y0); }
  // ayakkabılar
  for (const s of [-1, 1]){
    const lift = Math.max(0, Math.sin(v.walk + (s > 0 ? 0 : Math.PI)))*4*run;
    const fx = p.x + s*8, fy = p.y + r - 2 - lift;
    c.fillStyle = '#1e1828'; c.beginPath(); c.ellipse(fx, fy, 6.5, 4.2, 0, 0, Math.PI*2); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(fx, fy + 1.6, 5.5, 1.3, 0, 0, Math.PI*2); c.fill();
    c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(fx - 2, fy - 1.6, 2.2, 1, 0, 0, Math.PI*2); c.fill();
  }
  if (p.armed){
    c.strokeStyle = (shotInfo(p.armed.type) || SHOTS.falso).color; c.lineWidth = 3; c.globalAlpha = .55 + .45*Math.sin(S.t*.6);
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
  drawHairBack(c, p, y0, r);
  // gövde
  // kayarken hareket yönünde belirgin şekilde uzayıp yassılır
  const st = p.slideT > 0 ? .3 : Math.min(.1, sp*.028) + (p.mood === 'kick' ? .07 : 0) + (p.sprinting ? .05 : 0);
  c.save();
  c.translate(p.x, y0); c.rotate(va); c.scale(1 + st, 1 - st); c.rotate(-va);
  const kit = kitOf(S, p.team);
  c.fillStyle = kit.c1; c.beginPath(); c.arc(0, 0, r, 0, Math.PI*2); c.fill();
  c.save(); c.clip();
  // forma deseni (çubuk, yarım, yatay şerit), üstüne ışık-gölge
  c.fillStyle = kit.c2;
  if (kit.pat === 'serit') for (let sx = -r + 2; sx < r; sx += 9) c.fillRect(sx, -r - 2, 4.5, 2*r + 4);
  else if (kit.pat === 'yarim') c.fillRect(0, -r - 2, r + 2, 2*r + 4);
  else if (kit.pat === 'yatay'){ c.fillRect(-r - 2, -4, 2*r + 4, 5); c.fillRect(-r - 2, -14, 2*r + 4, 4); }
  const g = c.createRadialGradient(-r*.38, -r*.45, r*.1, 0, 0, r*1.05);
  g.addColorStop(0, 'rgba(255,255,255,.45)'); g.addColorStop(.45, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.32)');
  c.fillStyle = g; c.fillRect(-r - 2, -r - 2, 2*r + 4, 2*r + 4);
  // forma: alt kısım koyu takım rengi, beyaz şerit ve numara
  // yüzün altı forma (desen üstte çizildi), yaka beyaz, en altta koyu şort; numara konturlu ki desende okunsun
  const kitY = 5.5;
  c.fillStyle = shade(kit.dark, -10); c.fillRect(-r - 2, r - 4.5, 2*r + 4, 6);
  c.fillStyle = 'rgba(255,255,255,.95)'; c.fillRect(-r - 2, kitY - 1.6, 2*r + 4, 1.8);
  c.font = '800 9px Figtree, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = 2.4; c.strokeStyle = kit.dark; c.lineJoin = 'round'; c.strokeText(String(p.num), 0, kitY + 6.6);
  c.fillStyle = kit.num; c.fillText(String(p.num), 0, kitY + 6.6);
  if (kit.crest) drawCrest(c, kit.crest, -10.5, kitY + 5.4, 3.6);   // göğüste arma
  // kenar ışığı ve parlama
  c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 2;
  c.beginPath(); c.arc(0, 0, r - 1.5, Math.PI*.15, Math.PI*.6); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.ellipse(-7.5, -11, 5.2, 2.8, -.6, 0, Math.PI*2); c.fill();
  c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(-10.5, -9, 1.3, 0, Math.PI*2); c.fill();
  c.restore();
  const kicking = p.input.kick;
  c.lineWidth = kicking ? 3.5 : 2.6;
  c.strokeStyle = kicking ? '#ffffff' : kit.pat === 'duz' ? shade(dark, -25) : kit.dark;
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
  drawGesture(c, p, y0, r);
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
  if (flip) c.restore();
}

/* Menüdeki "Oyuncum" önizlemesi: seçilen görünümle tek oyuncu çizer. Seçilmeyen alanlar örnek değerle gösterilir. */
export function drawLookPreview(canvas, look, team = 0){
  const c = canvas.getContext('2d'), d = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 72, h = canvas.clientHeight || 72;
  if (canvas.width !== w*d){ canvas.width = w*d; canvas.height = h*d; }
  const p = { id: 999, x: 0, y: 0, vx: 0, vy: 0, r: ART_R, team, ctrl: 'ai', slot: 0, num: 10, mood: 'idle', dirA: Math.PI/2,
    input: {}, face: 'bead', acc: 'none', accCol: '#e8455c', skin: '#e8b48a', hair: 'kisa', hairCol: '#3b2416', tattoo: null, ...look };
  const keepS = S, keepV = V;
  S = { t: 0, owner: null, phase: 'play', goalInfo: null, players: [p] }; V = { mode: 'menu', paused: true };
  try {
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, canvas.width, canvas.height);
    const k = d*h/(ART_R*3.4);
    c.setTransform(k, 0, 0, k, canvas.width/2, canvas.height/2 + 4*k);
    drawPlayerArt(c, p, ART_R);
  } finally { S = keepS; V = keepV; }
}

/* ---------- görünüm: ten, saç, dövme, sevinç hareketleri ----------
   Gövde takım renginde bir top; yüz bölgesi ten renginde, saç üstte (uzun saç, örgü ve afro
   gövdenin arkasından da taşar). Hepsi ART_R ölçüsünde çizilir; 3B yüz kartı da bunları kullanır. */
const HATS = ['beanie', 'cap'];
const isDark = p => SKINS.indexOf(p.skin) >= 4;

// gövdenin arkasında kalan saç: uzun saç, örgüler, afro
function drawHairBack(c, p, yBody, r){
  const col = p.hairCol, x = p.x;
  if (!col) return;
  c.fillStyle = col;
  if (p.hair === 'uzun'){
    const sw = Math.sin(S.t*.12 + p.slot)*1.5;
    for (const s of [-1, 1]){ c.beginPath(); c.ellipse(x + s*(r - 1) + sw*.5, yBody + 2, 5, r*.75, s*.12, 0, Math.PI*2); c.fill(); }
  } else if (p.hair === 'orgu'){
    for (const s of [-1, 1]){
      const sw = Math.sin(S.t*.15 + p.slot + s)*2;
      for (let i = 0; i < 6; i++){
        const t = i/5, bx = x + s*(r - 1 + t*2) + sw*t, by = yBody - 4 + t*(r + 8);
        c.beginPath(); c.arc(bx + (i % 2 ? 1 : -1)*.8, by, 3.4 - t*.6, 0, Math.PI*2); c.fill();
      }
      c.fillStyle = p.accCol; c.beginPath(); c.arc(x + s*(r + 1) + sw, yBody + r + 5, 2, 0, Math.PI*2); c.fill(); c.fillStyle = col;
    }
  } else if (p.hair === 'kivircik' && !HATS.includes(p.acc)){
    for (let i = 0; i <= 9; i++){
      const a = Math.PI*(1.02 + i*.096);
      c.beginPath(); c.arc(x + Math.cos(a)*(r + 1), yBody - 2 + Math.sin(a)*(r + 2), 6.5, 0, Math.PI*2); c.fill();
    }
  }
}

// yüzün üstündeki saç (gövdeye kırpılmış) ve tepeden taşan kısımlar (mohikan, topuz)
function drawHairFront(c, p, yBody, r){
  const col = p.hairCol, x = p.x, hat = HATS.includes(p.acc);
  if (!col || p.hair === 'kel' || !p.hair){
    if (p.hair === 'kel' && !hat){ c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(x - 4, yBody - r + 6, 5, 2.4, -.4, 0, Math.PI*2); c.fill(); }
    return;
  }
  const hi = shade(col, 40);
  if (!hat){
    c.save(); c.beginPath(); c.arc(x, yBody, r + .5, 0, Math.PI*2); c.clip();
    c.fillStyle = col;
    if (p.hair === 'mohikan'){
      // yanlar kazınmış: hafif gölge, ortada şerit
      c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.ellipse(x, yBody - r + 2, r + 2, 8, 0, 0, Math.PI*2); c.fill();
      c.fillStyle = col; c.fillRect(x - 3.5, yBody - r - 2, 7, 11);
    } else {
      const ry = 8;
      c.beginPath(); c.ellipse(x, yBody - r + 2, r + 2, ry, 0, 0, Math.PI*2); c.fill();
      if (p.hair === 'kisa'){
        // perçem
        c.beginPath();
        for (let i = -2; i <= 2; i++){ const fx0 = x + i*5 + Math.cos(p.dirA)*2; c.moveTo(fx0 - 3, yBody - r + 8); c.lineTo(fx0, yBody - r + 12); c.lineTo(fx0 + 3, yBody - r + 8); }
        c.fill();
      } else if (p.hair === 'kivircik'){
        for (let i = -3; i <= 3; i++){ c.beginPath(); c.arc(x + i*5.2, yBody - r + 9 + (i % 2 ? 1 : 0), 3.6, 0, Math.PI*2); c.fill(); }
      } else if (p.hair === 'uzun' || p.hair === 'orgu'){
        // ortadan ayrık, yüzü yanlardan çerçeveler
        for (const s of [-1, 1]){ c.beginPath(); c.ellipse(x + s*(r - 1), yBody - 5, 3, 8, s*.15, 0, Math.PI*2); c.fill(); }
        c.strokeStyle = shade(col, -30); c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, yBody - r); c.lineTo(x + 1, yBody - r + 9); c.stroke();
      }
    }
    // parlaklık
    c.fillStyle = hi; c.globalAlpha = .55;
    c.beginPath(); c.ellipse(x - 6, yBody - r + 4, 4.5, 1.8, -.35, 0, Math.PI*2); c.fill();
    c.globalAlpha = 1;
    c.restore();
  }
  // tepeden taşanlar (şapka yoksa)
  if (hat) return;
  if (p.hair === 'mohikan'){
    c.fillStyle = col;
    c.beginPath();
    for (let i = 0; i < 4; i++){ const by = yBody - r + 2 + i*3.5, lean = -i*.4; c.moveTo(x - 3.5, by + 3); c.lineTo(x + lean, by - 8 + i*1.5); c.lineTo(x + 3.5, by + 3); }
    c.fill();
    c.fillStyle = hi; c.beginPath(); c.moveTo(x - 1, yBody - r + 4); c.lineTo(x, yBody - r - 5); c.lineTo(x + 1, yBody - r + 4); c.fill();
  } else if (p.hair === 'topuz'){
    c.fillStyle = col; c.beginPath(); c.arc(x, yBody - r - 3, 6.5, 0, Math.PI*2); c.fill();
    c.fillStyle = hi; c.globalAlpha = .5; c.beginPath(); c.arc(x - 2, yBody - r - 5, 2.2, 0, Math.PI*2); c.fill(); c.globalAlpha = 1;
    c.fillStyle = p.accCol; c.fillRect(x - 4.5, yBody - r + 1.5, 9, 2.2);
  }
}

// yüz bölgesi ten renginde (gövdeye ve forma şeridinin üstüne kırpılır), üstüne dövme
function drawSkin(c, p, cx, cy, yBody, r){
  if (!p.skin) return;
  c.save();
  c.beginPath(); c.arc(p.x, yBody, r - .4, 0, Math.PI*2); c.clip();
  c.beginPath(); c.rect(p.x - r - 2, yBody - r - 2, 2*r + 4, r + 5.5); c.clip();
  const g = c.createRadialGradient(cx - 4, cy - 6, 1, cx, cy, 16);
  g.addColorStop(0, shade(p.skin, 22)); g.addColorStop(1, shade(p.skin, -12));
  c.fillStyle = g; c.beginPath(); c.ellipse(cx, cy - 1, 13, 11, 0, 0, Math.PI*2); c.fill();
  c.restore();
  if (!p.tattoo) return;
  // dövme sol şakakta/yanakta; koyu tende açık mürekkep
  const ink = isDark(p) ? 'rgba(225,235,255,.8)' : 'rgba(30,50,95,.78)';
  const tx = cx - 12, ty = cy - 1;
  c.fillStyle = ink; c.strokeStyle = ink; c.lineCap = 'round';
  if (p.tattoo === 'yildiz'){
    c.beginPath(); for (let j = 0; j < 10; j++){ const rr2 = j % 2 ? 1.1 : 2.7, a = -Math.PI/2 + j*Math.PI/5; c.lineTo(tx + Math.cos(a)*rr2, ty + Math.sin(a)*rr2); } c.closePath(); c.fill();
  } else if (p.tattoo === 'kalp'){
    c.fillStyle = isDark(p) ? 'rgba(255,170,190,.9)' : 'rgba(190,30,60,.8)';
    c.beginPath(); c.moveTo(tx, ty + 2.4); c.bezierCurveTo(tx - 3.6, ty - .4, tx - 1.8, ty - 3.2, tx, ty - 1.2); c.bezierCurveTo(tx + 1.8, ty - 3.2, tx + 3.6, ty - .4, tx, ty + 2.4); c.fill();
  } else if (p.tattoo === 'kabile'){
    c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(tx + 1, ty - 6); c.quadraticCurveTo(tx - 3, ty - 2, tx + 1, ty + 1); c.quadraticCurveTo(tx - 2, ty + 3, tx, ty + 6); c.stroke();
    c.beginPath(); c.moveTo(tx + 2.5, ty - 3); c.lineTo(tx + .5, ty - 1.5); c.stroke();
  } else if (p.tattoo === 'damla'){
    const dx = cx - 6, dy = cy + 2.5;
    c.beginPath(); c.moveTo(dx, dy - 2); c.quadraticCurveTo(dx + 1.6, dy + .8, dx, dy + 1.6); c.quadraticCurveTo(dx - 1.6, dy + .8, dx, dy - 2); c.fill();
  }
}

// el: ten renginde yuvarlak, ince kontur
function hand(c, p, x, y, rad = 4.2){
  c.fillStyle = p.skin || '#e8b48a'; c.strokeStyle = 'rgba(30,20,30,.55)'; c.lineWidth = 1;
  c.beginPath(); c.arc(x, y, rad, 0, Math.PI*2); c.fill(); c.stroke();
}
// kol: forma renginde, dövmeli oyuncuda kolda desen
function arm(c, p, x0, y0, x1, y1){
  c.strokeStyle = TEAM_DARK[p.team]; c.lineWidth = 5; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  c.strokeStyle = p.skin || '#e8b48a'; c.lineWidth = 3.6;
  const mx = x0 + (x1 - x0)*.45, my = y0 + (y1 - y0)*.45;
  c.beginPath(); c.moveTo(mx, my); c.lineTo(x1, y1); c.stroke();
  if (p.tattoo){
    c.strokeStyle = isDark(p) ? 'rgba(225,235,255,.85)' : 'rgba(30,50,95,.85)'; c.lineWidth = 1.2;
    const nx = -(y1 - y0), ny = x1 - x0, L = Math.hypot(nx, ny) || 1;
    for (const t of [.6, .75]){ const px = x0 + (x1 - x0)*t, py = y0 + (y1 - y0)*t; c.beginPath(); c.moveTo(px - nx/L*1.6, py - ny/L*1.6); c.lineTo(px + nx/L*1.6, py + ny/L*1.6); c.stroke(); }
  }
  hand(c, p, x1, y1);
}

// golü atanın el hareketleri (takla dönüşle çizilir, burada değil)
function drawGesture(c, p, yBody, r){
  const ce = celeOf(S, p);
  if (!ce || ce.t < 8) return;
  const x = p.x, t = ce.t, slow = Math.hypot(p.vx, p.vy) < 1.2;
  const cx = x + Math.cos(p.dirA)*3, cy = yBody - 2 + Math.sin(p.dirA)*2;
  if (ce.type === 'gozluk' && (slow || t > 50)){
    // parmaklarla gözlük: gözlerin çevresinde halka, avuçlar yanaklarda
    c.strokeStyle = p.skin || '#e8b48a'; c.lineWidth = 2.4;
    for (const s of [-1, 1]){ c.beginPath(); c.arc(cx + s*5.5, cy - 3, 4.6, 0, Math.PI*2); c.stroke(); }
    c.strokeStyle = 'rgba(30,20,30,.45)'; c.lineWidth = .8;
    for (const s of [-1, 1]){ c.beginPath(); c.arc(cx + s*5.5, cy - 3, 5.9, 0, Math.PI*2); c.stroke(); }
    for (const s of [-1, 1]) hand(c, p, cx + s*12.5, cy + 4, 4.6);
  } else if (ce.type === 'kulak' && (slow || t > 60)){
    // eli kulağa atıp seyirciyi dinler: avuç ve ses dalgaları; 45 tickte bir taraf değişir
    const s = Math.floor(t/45) % 2 ? 1 : -1, hx = x + s*(r + 3), hy = yBody - 5;
    c.fillStyle = p.skin || '#e8b48a'; c.strokeStyle = 'rgba(30,20,30,.55)'; c.lineWidth = 1;
    c.beginPath(); c.ellipse(hx, hy, 4, 6.5, s*.25, 0, Math.PI*2); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 1.6;
    for (let i = 0; i < 3; i++){
      const k = ((t*.06 + i/3) % 1), rad = 6 + k*12;
      c.globalAlpha = 1 - k; c.beginPath(); c.arc(hx + s*2, hy, rad, s > 0 ? -.7 : Math.PI - .7, s > 0 ? .7 : Math.PI + .7); c.stroke();
    }
    c.globalAlpha = 1;
  } else if (ce.type === 'ucak'){
    // kollar açık uçak: koşarken iki yana yatar
    const tilt = Math.sin(t*.09)*7;
    for (const s of [-1, 1]) arm(c, p, x + s*(r - 4), yBody + 3, x + s*(r + 15), yBody + 2 + s*tilt);
  } else if (ce.type === 'diz'){
    // dizlerin üstünde kayar, yumruklar havada
    const pump = Math.sin(t*.25)*2.5;
    for (const s of [-1, 1]) arm(c, p, x + s*(r - 5), yBody - 4, x + s*(r + 5), yBody - r - 8 + (s > 0 ? pump : -pump));
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
  drawSkin(c, p, cx, cy, y0 + 2, ART_R);
  drawHairFront(c, p, y0 + 2, ART_R);
  // yanak
  c.fillStyle = isDark(p) ? 'rgba(255,110,140,.22)' : 'rgba(255,110,140,.38)';
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
      if (isDark(p)){ c.fillStyle = '#fff'; c.beginPath(); c.arc(ex + lx*.4, ey + ly*.4, 4.4, 0, Math.PI*2); c.fill(); c.fillStyle = ink; }
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
  const q = posOf(p), r = q.r + 10, a0 = -Math.PI/2, k = Math.min(1, p.charge);
  c.lineCap = 'round';
  c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 6;
  c.beginPath(); c.arc(q.x, q.y, r, 0, Math.PI*2); c.stroke();
  c.strokeStyle = k < .5 ? '#5be37d' : k < .85 ? '#ffd23f' : '#ff5a5a'; c.lineWidth = 4;
  c.beginPath(); c.arc(q.x, q.y, r, a0, a0 + Math.PI*2*k); c.stroke();
}

function drawLabel(c, p){
  drawCharge(c, p);
  const q = posOf(p);
  if (p.sta < .995 && S.phase !== 'goal'){
    const w = 30, h = 5, x = q.x - w/2, y = q.y - q.r - 11;
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
  const w = c.measureText(p.name).width + 10, y = q.y + q.r + 11;
  c.fillStyle = 'rgba(0,0,0,.45)'; rr(c, q.x - w/2, y - 7, w, 14, 7); c.fill();
  c.fillStyle = p.ctrl !== 'ai' ? '#ffffff' : 'rgba(255,255,255,.82)';
  c.fillText(p.name, q.x, y + .5);
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
    const p = rq.p, q = posOf(p), pulse = 1 + .08*Math.sin(S.t*.35);
    const x = q.x + 16, y = q.y - q.r - 24;
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

// ring: pas alıcısının etrafındaki kesikli halka (3B'de sahnede ayrıca çiziliyor)
function drawPassInfo(c, ring = true){
  drawReqBubbles(c);
  const ps = S.pass;
  if (ring && ps && S.phase !== 'goal'){
    const m = posOf(ps.to), a = .5 + .4*Math.sin(S.t*.3);
    c.strokeStyle = `rgba(255,255,255,${a})`; c.lineWidth = 2.5; c.setLineDash([3, 6]);
    c.beginPath(); c.arc(m.x, m.y, m.r + 9, 0, Math.PI*2); c.stroke(); c.setLineDash([]);
  }
  for (const p of S.players){
    if (!p.bubble) continue;
    const k = Math.min(1, p.bubble.t/10, (70 - p.bubble.t + 1)/6);
    const q = posOf(p), x = q.x + 14, y = q.y - q.r - 22;
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

// at(q, k): yazının ekrandaki yeri (3B'de havada yükselen nokta yansıtılır)
function drawPops(c, at = null){
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const q of fx.pops){
    const k = q.life/q.max;
    if (!V.paused) { q.life--; if (!at) q.y -= .5; }
    const pt = at ? at(q, k) : q;
    c.globalAlpha = Math.min(1, k*2);
    c.font = `800 ${16 + (1 - k)*4}px Figtree, system-ui, sans-serif`;
    c.lineWidth = 4; c.strokeStyle = 'rgba(20,10,30,.8)'; c.strokeText(q.text, pt.x, pt.y);
    c.fillStyle = q.color; c.fillText(q.text, pt.x, pt.y);
  }
  c.globalAlpha = 1;
  fx.pops = fx.pops.filter(q => q.life > 0);
}

function drawShotHud(c){
  if (V.mode !== 'match' || !S.specials) return;
  const touch = isTouch();
  for (const p of S.players){
    if (p.ctrl !== 'h1') continue;   // yalnızca bu cihazdaki oyuncu
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
      const key = touch ? '' : shotKeyLabel(keyLayout(), t) + '  ';
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
    const t = S.t - S.goalInfo.t, k = Math.min(1, t/14);
    // ilk ~0,8 sn ortada büyür, sonra küçülüp yukarı kayar ki gol sevinci görünsün
    const up = Math.min(1, Math.max(0, (t - 45)/25)), ease = up*up*(3 - 2*up);
    const sc = (.6 + .4*(1 - Math.pow(1 - k, 3)))*(1 - .45*ease);
    c.save(); c.translate(W/2, H/2 - 20 - (H/2 - 75)*ease); c.scale(sc, sc);
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
    const txt = mine ? (S.kickoffTeam === mine.team ? (V.online ? 'Başlama vuruşu takımında' : 'Başlama vuruşu sende') : 'Rakip başlıyor')
      : `Başlama vuruşu: ${S.teamNames[S.kickoffTeam]}`;
    const w = c.measureText(txt).width + 26;
    c.fillStyle = 'rgba(0,0,0,.45)'; rr(c, W/2 - w/2, H/2 + 100, w, 32, 16); c.fill();
    c.fillStyle = '#fff'; c.fillText(txt, W/2, H/2 + 116.5);
  }
}

// gol sevinci konfetisi: düşen, dönen küçük kâğıtlar (h: yerden yükseklik)
function drawConfetti(c){
  for (const q of fx.confetti){
    const a = Math.min(1, q.life/30);
    c.globalAlpha = a; c.fillStyle = q.color;
    c.save(); c.translate(q.x, q.y - q.h); c.rotate(q.rot); c.scale(1, Math.abs(Math.cos(q.flip)));
    c.fillRect(-q.size/2, -q.size*.3, q.size, q.size*.6); c.restore();
  }
  c.globalAlpha = 1;
}

/* 3B: sahne Three.js ile çizilir, isim/çubuk/balon/yazı/HUD bu 2B katmanda üstte kalır.
   Oyuncunun ayağı ve başı ekrana yansıtılıp 2B katmanın dünya koordinatına çevrilir. */
function render3DFrame(){
  if (R3.tooSlow()){
    // en düşük kalitede de 30 kare/sn altı: bu oturumda 2B'ye geç
    block3D = 'slow'; use3D = false; document.body.classList.remove('three'); resize();
    onFallback('slow');
    return render(S, V);
  }
  R3.render3D(S, V, fx);
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  worldTransform(ctx);
  if (!S.players.length) return;
  const toWorld = (x, y, h) => { const s = R3.project(x, y, h); return { x: s.x/scale + SCREEN.x, y: s.y/scale + SCREEN.y }; };
  const proj = new Map();
  for (const p of S.players){
    const j = jumpOf(S, p);
    const foot = toWorld(p.x, p.y + p.r*.6, j), head = toWorld(p.x, p.y, 2*p.r + 4 + j);
    proj.set(p, { x: (foot.x + head.x)/2, y: (foot.y + head.y)/2, r: Math.max(6, (foot.y - head.y)/2) });
  }
  posOf = p => proj.get(p) || p;
  try {
    const sorted = S.players.slice().sort((a, b) => a.y - b.y);
    for (const p of sorted) drawLabel(ctx, p);
    drawPassInfo(ctx, false);
    drawPops(ctx, (q, k) => toWorld(q.x, q.y + 36, 2*PR + 16 + (1 - k)*30));
  } finally { posOf = p => p; }
  drawShotHud(ctx);
  drawBanner(ctx);
  drawNetInfo(ctx);
}

export function render(state, view){
  S = state; V = view;
  if (!S) return;
  applyKitColors(S);
  if (use3D && R3) return render3DFrame();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  let sx = 0, sy = 0;
  if (fx.shake > 0){ sx = (Math.random()*2 - 1)*fx.shake*dpr*scale; sy = (Math.random()*2 - 1)*fx.shake*dpr*scale; fx.shake *= .88; if (fx.shake < .3) fx.shake = 0; }
  ctx.drawImage(bg, sx, sy);
  worldTransform(ctx);
  ctx.translate(sx/(scale*dpr), sy/(scale*dpr));
  drawRays(ctx, ARENAS[S.arena]);
  drawCrowd2D(ctx, S, V);
  if (!S.players.length) return;
  const sorted = S.players.slice().sort((a, b) => a.y - b.y);
  for (const p of sorted) drawPlayer(ctx, p);
  for (const p of sorted) drawLabel(ctx, p);
  drawBall(ctx, S.ball);
  drawParticles(ctx);
  drawConfetti(ctx);
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
