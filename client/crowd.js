/* ---------- seyirciler ----------
   Maça tepki veren tribün: coşku (topa sahip takım rakip kaleye yaklaştıkça artar), kaçan pozisyonda
   "Ooo" (eller başta), golde atan takımın tribünü zıplar ve bayrak sallar (öbürü susar), arka arkaya
   paslarda "Olé!", periyodik dalga, coşkuya göre tribün uğultusu. Durum yalnızca istemcide (maç durumunu değiştirmez).
   2B'de saha kenarındaki tribünlere çizilir (drawCrowd2D); 3B seyirciler de aynı durumu kullanır (crowd). */
import { W, H, TOP, BOT, GH, BR, SCREEN, SKINS, KITS, kitById } from '../shared/constants.js';
import { sfx, crowdLevel } from './audio.js';
import { fx, reduceMotion } from './effects.js';

export const crowd = {
  ex: [0, 0],          // takım başına coşku 0..1
  ooh: 0, oohTeam: -1, // kaçan pozisyon: kalan tick ve atak yapan takım
  oleT: [0, 0],        // "Olé!" sonrası tick (taraftar bir an hep birlikte zıplar)
  lastOwner: null, streak: 0, streakTeam: -1, oohCd: 0,
};
export function resetCrowd(){
  Object.assign(crowd, { ex: [0, 0], ooh: 0, oohTeam: -1, oleT: [0, 0], lastOwner: null, streak: 0, streakTeam: -1, oohCd: 0 });
}
const ownerTeam = S => S.owner ? S.owner.team : -1;

// her simülasyon adımından sonra (yerel ve çevrimiçi): coşku, ooo, olé, uğultu
export function updateCrowd(S){
  if (crowd.S !== S){ resetCrowd(); crowd.S = S; }   // yeni maç
  const b = S.ball, goal = S.phase === 'goal' && S.goalInfo;
  for (const t of [0, 1]){
    let target;
    if (goal) target = S.goalInfo.team === t ? 1 : 0;
    else {
      // topa sahip takımın tribünü rakip kaleye yaklaştıkça coşar; boş topta hafif
      const gx = t === 0 ? W : 0, near = Math.max(0, 1 - Math.abs(gx - b.x)/(W*.75));
      target = ownerTeam(S) === t ? .2 + .8*near*near : b.x !== undefined && (t === 0 ? b.x > W*.7 : b.x < W*.3) ? .35 : .12;
    }
    crowd.ex[t] += (target - crowd.ex[t])*(goal ? .2 : .04);
    if (crowd.oleT[t] > 0) crowd.oleT[t]--;
  }
  // kaçan pozisyon: hızlı top kale ağzının yanından çizgiye çarptı
  if (crowd.oohCd > 0) crowd.oohCd--;
  if (crowd.ooh > 0) crowd.ooh--;
  if (S.phase === 'play' && crowd.oohCd <= 0 && Math.hypot(b.vx, b.vy) > 3.5 && (b.x < BR + 4 || b.x > W - BR - 4)
      && (b.y < TOP - 2 || b.y > BOT + 2) && Math.abs(b.y - H/2) < GH*1.1){
    crowd.ooh = 70; crowd.oohTeam = b.x < W/2 ? 1 : 0; crowd.oohCd = 120;
    fx.pops.push({ x: b.x < W/2 ? 140 : W - 140, y: -28, text: 'Ooo!', color: '#ffffff', life: 60, max: 60, stand: true });
    sfx.ooh();
  }
  // arka arkaya paslar: top aynı takımda el değiştirdikçe seri artar, 3'ten sonra her pasta "Olé!"
  const o = S.owner;
  if (o && o !== crowd.lastOwner){
    if (crowd.lastOwner && crowd.lastOwner.team === o.team && S.phase === 'play'){
      crowd.streak = crowd.streakTeam === o.team ? crowd.streak + 1 : 1; crowd.streakTeam = o.team;
      if (crowd.streak >= 3){
        crowd.oleT[o.team] = 40;
        fx.pops.push({ x: o.team === 0 ? W*.25 : W*.75, y: -28, text: 'Olé!', color: '#ffffff', life: 55, max: 55, stand: true });
        sfx.ole(crowd.streak);
      }
    } else if (crowd.lastOwner && crowd.lastOwner.team !== o.team){ crowd.streak = 0; crowd.streakTeam = o.team; }
    crowd.lastOwner = o;
  }
  if (S.phase === 'goal') crowd.lastOwner = null;
  if (S.phase !== 'play') crowd.streak = 0;
  // uğultu: coşkuya göre (10 tickte bir ayarlanır)
  if (S.t % 10 === 0) crowdLevel(.012 + .05*Math.max(crowd.ex[0], crowd.ex[1]) + (goal ? .05 : 0));
}

/* ---------- 2B tribünler ---------- */
// seyirci çizimleri önbellekte: forma, desen, ten, duruş ('asagi' | 'yukari' | 'bas')
const sprites = new Map();
const SPR = 3;   // çizim çözünürlüğü (birim başına piksel)
function sprite(shirt, skin, pose){
  const key = (shirt.id || shirt.c1) + '|' + (shirt.plain ? 1 : 0) + '|' + skin + '|' + pose;
  let cv = sprites.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas'); cv.width = 14*SPR; cv.height = 18*SPR;
  const c = cv.getContext('2d'); c.scale(SPR, SPR);
  // kollar (arkada)
  c.strokeStyle = skin; c.lineWidth = 2; c.lineCap = 'round';
  if (pose === 'yukari'){ c.beginPath(); c.moveTo(3.5, 11); c.lineTo(1.5, 4); c.moveTo(10.5, 11); c.lineTo(12.5, 4); c.stroke(); }
  else if (pose === 'bas'){ c.beginPath(); c.moveTo(3.5, 11); c.lineTo(3.2, 6); c.moveTo(10.5, 11); c.lineTo(10.8, 6); c.stroke(); }
  // gövde: forma (desenli)
  c.save(); c.beginPath(); c.ellipse(7, 13.5, 4.6, 4.2, 0, 0, Math.PI*2); c.clip();
  c.fillStyle = shirt.c1; c.fillRect(0, 8, 14, 10);
  if (!shirt.plain){
    c.fillStyle = shirt.c2;
    if (shirt.pat === 'serit') for (let x = 3; x < 12; x += 3) c.fillRect(x, 8, 1.4, 10);
    else if (shirt.pat === 'yarim') c.fillRect(7, 8, 7, 10);
    else if (shirt.pat === 'yatay') c.fillRect(0, 13, 14, 1.6);
  }
  c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(0, 15.5, 14, 3);
  c.restore();
  // baş
  c.fillStyle = skin; c.beginPath(); c.arc(7, 6.5, 3.1, 0, Math.PI*2); c.fill();
  c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.arc(7, 6.5, 3.1, Math.PI*.1, Math.PI*.9); c.lineWidth = .6; c.strokeStyle = 'rgba(0,0,0,.25)'; c.stroke();
  sprites.set(key, cv);
  return cv;
}

const OTHERS = ['#f05a5a', '#ffffff', '#7c6cf0', '#5bd18b', '#ff9f43', '#e86fb5', '#2a2233'].map(c1 => ({ c1, c2: c1, pat: 'duz', id: c1 }));
let fans = [], fansKey = '';
function buildFans(S){
  fans = [];
  const kits = [0, 1].map(t => kitById(S.kits ? S.kits[t] : null) || KITS[t]);
  const x0 = SCREEN.x + 6, x1 = SCREEN.x + SCREEN.w - 6;
  const rows = [-22, -35, -48, H + 34, H + 47, H + 60];
  let seed = 7;
  const rnd = () => (seed = (seed*16807) % 2147483647)/2147483647;   // sabit dizilim (her maç aynı yerler)
  for (const y of rows){
    for (let x = x0 + (rows.indexOf(y) % 2)*6; x < x1; x += 12){
      if (rnd() < .07) continue;
      const blend = (x - W/2)/160, team = rnd() < .5 + Math.max(-.5, Math.min(.5, blend)) ? 1 : 0, k = kits[team];
      const r = rnd();
      const shirt = r < .12 ? OTHERS[(r*100|0) % OTHERS.length] : r < .27 && k.pat !== 'duz' ? { ...k, plain: true } : k;
      fans.push({ x: x + (rnd() - .5)*3, y, team, shirt, skin: SKINS[rnd()*SKINS.length|0], ph: rnd()*6.28, sp: .7 + rnd()*.6,
        flag: rnd() < .06 && shirt === k, u: y < 0 ? x - SCREEN.x : SCREEN.w + (SCREEN.x + SCREEN.w - x), kit: k });
    }
  }
  fans.sort((a, b) => a.y - b.y);   // arkadan öne
  fansKey = S.kits ? S.kits.join() : '';
}

const WAVE_CYCLE = 2100, WAVE_SPEED = 6.5, WAVE_W = 70;
export function drawCrowd2D(c, S, V){
  if ((S.kits ? S.kits.join() : '') !== fansKey || !fans.length) buildFans(S);
  const t = S.t, still = reduceMotion, goal = S.phase === 'goal' && S.goalInfo;
  const wt = t % WAVE_CYCLE, wave = !still && V.mode !== 'end' ? wt*WAVE_SPEED - 100 : -1e9;
  for (const f of fans){
    const ex = crowd.ex[f.team];
    let jump = still ? 0 : Math.abs(Math.sin(t*.1*f.sp + f.ph))*(.6 + ex*3.2), pose = 'asagi';
    if (goal){
      if (goal.team === f.team){ pose = 'yukari'; jump = still ? 0 : Math.abs(Math.sin(t*.24*f.sp + f.ph))*7; }
      else { jump = 0; }
    } else if (crowd.ooh > 0 && crowd.oohTeam === f.team) pose = 'bas';
    else if (crowd.oleT[f.team] > 0){ pose = 'yukari'; if (!still) jump = Math.sin((40 - crowd.oleT[f.team])/40*Math.PI)*5; }
    else if (ex > .55 && Math.sin(t*.06*f.sp + f.ph) > .2) pose = 'yukari';
    if (!still){
      const d = Math.abs(f.u - wave)/WAVE_W;
      if (d < 1){ pose = 'yukari'; jump += (1 - d*d)*6; }
    }
    const spr = sprite(f.shirt, f.skin, pose);
    const y = f.y - jump + (goal && goal.team !== f.team ? 1.5 : 0);
    c.drawImage(spr, f.x - 7, y - 18, 14, 18);
    if (f.flag){
      // bayrak: sopa ve dalgalanan bez (forma renkleri); coşkuda hızlı sallanır
      const sw = Math.sin(t*(goal && goal.team === f.team ? .35 : .08 + ex*.15) + f.ph)*(still ? 0 : 3);
      const px = f.x + 5, py = y - 10;
      c.strokeStyle = '#d8d0c0'; c.lineWidth = .9; c.beginPath(); c.moveTo(px, py + 4); c.lineTo(px + sw*.3, py - 12); c.stroke();
      c.fillStyle = f.kit.c1; c.beginPath(); c.moveTo(px + sw*.3, py - 12); c.quadraticCurveTo(px + 6 + sw*.5, py - 13 + sw*.4, px + 12 + sw, py - 11); c.lineTo(px + 12 + sw, py - 5); c.quadraticCurveTo(px + 6 + sw*.5, py - 7 + sw*.4, px + sw*.3, py - 6); c.closePath(); c.fill();
      if (f.kit.c2 !== f.kit.c1){ c.fillStyle = f.kit.c2; c.beginPath(); c.moveTo(px + 6 + sw*.6, py - 12.6 + sw*.4); c.lineTo(px + 12 + sw, py - 11); c.lineTo(px + 12 + sw, py - 5); c.lineTo(px + 6 + sw*.6, py - 6.6 + sw*.4); c.closePath(); c.fill(); }
    }
  }
}
