/* ---------- simülasyon ----------
   Saf maç mantığı: DOM, ses, gerçek zaman ya da Math.random kullanmaz.

   createMatch(ayarlar)  -> state
   step(state, inputs)   -> olay listesi   (state yerinde güncellenir)

   inputs[oyuncuId] = { x, y, kick, special, call, hold, sprint }. Bot oyuncuların
   girdisi burada üretilir; insan oyuncunun girdisi yoksa boş girdi sayılır.
   Ses, parçacık, sarsıntı gibi yan etkiler olay olarak döner ({ type, ... });
   istemci bunları çizer ve seslendirir. */
import { W, H, GD, TOP, BOT, PR, BR, POST_R, VIEW, P_ACC, P_ACC_KICK, P_DAMP, B_DAMP, KICK, KICK_RANGE, WALL_REST,
  BOT_NAMES, TEAM_NAME, SHOTS, SHOT_TYPES, FACES, POSTS, ARENAS, DIFF, formation } from './constants.js';
import { createRng, random, randInt, shuffle } from './rng.js';
import { registerKick, updatePass } from './pass.js';
import { assignRoles, aiInput, aiCalls } from './ai.js';

export const NEUTRAL_INPUT = Object.freeze({ x: 0, y: 0, kick: false, special: null, call: false, hold: false, sprint: false });

const num = v => typeof v === 'number' && Number.isFinite(v) ? v : 0;

// girdiyi sınırla: vektör uzunluğu ≤ 1, bilinmeyen özel şut yok sayılır (sunucu da bunu kullanır)
export function sanitizeInput(raw){
  if (!raw || typeof raw !== 'object') return NEUTRAL_INPUT;
  let x = num(raw.x), y = num(raw.y);
  const l = Math.hypot(x, y);
  if (l > 1){ x /= l; y /= l; }
  return {
    x, y, kick: !!raw.kick, special: SHOT_TYPES.includes(raw.special) ? raw.special : null,
    call: !!raw.call, hold: !!raw.hold, sprint: !!raw.sprint,
  };
}

function emit(S, type, data){ S.events.push(data ? { type, ...data } : { type }); }

/* ---------- maç kurulumu ---------- */
function disc(x, y, r, im, damp){ return { x, y, vx:0, vy:0, r, im, damp }; }

function buildPlayers(S, n, humans){
  const rng = S.rng;
  S.players = [];
  const names = shuffle(rng, BOT_NAMES.slice());
  for (let team = 0; team < 2; team++){
    // takımın insan oyuncuları sırayla ilk yerlere geçer, kalanları bot doldurur
    const teamHumans = humans.filter(h => h.team === team).slice(0, n);
    for (let i = 0; i < n; i++){
      const p = formation(n, i, team);
      const d = disc(p.x, p.y, PR, 0.5, P_DAMP);
      const h = teamHumans[i];
      d.id = S.players.length;
      d.team = team; d.ctrl = h ? h.ctrl : 'ai';
      d.uid = h && h.uid != null ? h.uid : null;   // çevrimiçi: oyuncuyu kontrol eden bağlantının kimliği
      d.name = h ? h.name : names.pop();
      d.slot = i; d.input = {x:0,y:0,kick:false}; d.kickCd = 0;
      d.mood = 'idle'; d.moodT = 0; d.role = 'chaser'; d.aimOff = 0; d.aimT = 0;
      d.face = FACES[randInt(rng, FACES.length)];
      d.cd = { falso: 0, fuze: 0, asirtma: 0 }; d.armed = null;
      d.plan = null; d.planT = 0; d.bubble = null; d.callCd = 0;
      d.dirA = team === 0 ? 0 : Math.PI; d.noGrab = 0;
      d.sta = 1; d.tired = false; d.sprinting = false; d.stun = 0; d.tackleCd = 0; d.lunge = 0;
      d.num = h ? [10, 8, 23][i] : [7, 4, 9, 11, 5, 8, 3, 6, 14, 17][(team*3 + i + randInt(rng, 10)) % 10];
      const accs = S.weather === 'kar' ? ['beanie','beanie','earmuffs','scarf','cap','headband','sprout','none']
                                       : ['cap','cap','headband','sprout','beanie','scarf','none'];
      d.acc = accs[randInt(rng, accs.length)];
      d.accCol = ['#e8455c','#ffffff','#5b3fd9','#2a2233','#ff8a3d','#2fb67c'][randInt(rng, 6)];
      S.players.push(d);
    }
  }
  S.ball = disc(W/2, H/2, BR, 1, B_DAMP);
  Object.assign(S.ball, { spin: 0, z: 0, vz: 0, curve: 0, fire: 0, grace: 0 });
}

function resetPositions(S){
  const n = S.players.length/2;
  for (const p of S.players){
    const f = formation(n, p.slot, p.team);
    p.x = f.x; p.y = f.y; p.vx = p.vy = 0; p.kickCd = 0; p.armed = null; p.plan = null;
    p.stun = 0; p.lunge = 0; p.tackleCd = 0; p.sta = Math.min(1, p.sta + .3);
    p.dirA = p.team === 0 ? 0 : Math.PI; p.noGrab = 0;
  }
  // başlama vuruşunu yapan takımın ilk oyuncusu topa yakın dursun
  const k = S.players.find(p => p.team === S.kickoffTeam && p.slot === 0);
  if (k){ k.x = W/2 + (S.kickoffTeam === 0 ? -60 : 60); k.y = H/2; }
  Object.assign(S.ball, { x: W/2, y: H/2, vx: 0, vy: 0, z: 0, vz: 0, curve: 0, fire: 0 });
  S.phase = 'kickoff'; S.lastTouch = null; S.pass = null; S.req = [null, null]; S.owner = null;
  emit(S, 'kickoff', { team: S.kickoffTeam });
}

/* ayarlar:
   size      kadro (1, 2, 3)
   humans    [{ team, ctrl, name }]  ctrl 'ai' dışında bir değer (örn. 'h1')
   diff      bot zorluğu (DIFF indeksi)
   arena     ARENAS indeksi ya da 'r' (rastgele)
   weather   'kar' | 'parilti' | 'sade'  (aksesuar seçimini etkiler)
   minutes   maç süresi; 0 ise süresiz (menü arkasındaki demo)
   specials  özel şutlar açık mı
   seed      RNG tohumu
   teamNames    isteğe bağlı takım adları [sol, sağ] (turnuva); verilmezse TEAM_NAME
   kickoffTeam  isteğe bağlı; verilmezse rastgele */
export function createMatch(settings = {}){
  const cfg = { size: 3, humans: [], diff: 1, arena: 'r', weather: 'kar', minutes: 0, specials: true, seed: 1, ...settings };
  const rng = createRng(cfg.seed);
  const S = {
    settings: cfg, rng, events: [], t: 0,
    phase: 'kickoff',
    players: [], ball: null, score: [0, 0],
    timed: cfg.minutes > 0, timeLeft: cfg.minutes*60*60, overtime: false,
    kickoffTeam: 0, goalT: 0, goalInfo: null,
    arena: cfg.arena === 'r' ? randInt(rng, ARENAS.length) : +cfg.arena,
    weather: cfg.weather, diff: +cfg.diff, specials: !!cfg.specials,
    teamNames: cfg.teamNames || TEAM_NAME.slice(),
    lastTouch: null, pass: null, req: [null, null], owner: null,
  };
  buildPlayers(S, +cfg.size, cfg.humans);
  S.kickoffTeam = cfg.kickoffTeam ?? (random(rng) < .5 ? 0 : 1);
  resetPositions(S);
  S.events = [];
  return S;
}

/* ---------- fizik ---------- */
function collide(a, b, rest){
  let dx = b.x - a.x, dy = b.y - a.y; const d = Math.hypot(dx, dy), min = a.r + b.r;
  if (d >= min || d === 0) return 0;
  const nx = dx/d, ny = dy/d, pen = min - d, tot = a.im + b.im;
  a.x -= nx*pen*a.im/tot; a.y -= ny*pen*a.im/tot;
  b.x += nx*pen*b.im/tot; b.y += ny*pen*b.im/tot;
  const rv = (b.vx - a.vx)*nx + (b.vy - a.vy)*ny;
  if (rv < 0){
    const j = -(1 + rest)*rv/tot;
    a.vx -= j*a.im*nx; a.vy -= j*a.im*ny; b.vx += j*b.im*nx; b.vy += j*b.im*ny;
  }
  return -rv;
}
function collidePost(d, p, rest){
  let dx = d.x - p.x, dy = d.y - p.y; const dist = Math.hypot(dx, dy), min = d.r + POST_R;
  if (dist >= min || dist === 0) return 0;
  const nx = dx/dist, ny = dy/dist;
  d.x = p.x + nx*min; d.y = p.y + ny*min;
  const vn = d.vx*nx + d.vy*ny;
  if (vn < 0){ d.vx -= (1 + rest)*vn*nx; d.vy -= (1 + rest)*vn*ny; return -vn; }
  return 0;
}
function ballWalls(S, b){
  const r = b.r, rest = WALL_REST; let hit = 0;
  if (b.x >= 0 && b.x <= W){
    if (b.y < r){ b.y = r; if (b.vy < 0){ hit = -b.vy; b.vy = -b.vy*rest; } }
    if (b.y > H - r){ b.y = H - r; if (b.vy > 0){ hit = b.vy; b.vy = -b.vy*rest; } }
  }
  const inMouth = b.y > TOP && b.y < BOT && b.z < 26;
  // sol
  if (b.x < r && b.x >= 0 && !inMouth){ b.x = r; if (b.vx < 0){ hit = -b.vx; b.vx = -b.vx*rest; } }
  if (b.x < 0){
    if (b.y < TOP + r){ b.y = TOP + r; if (b.vy < 0) b.vy = -b.vy*.3; }
    if (b.y > BOT - r){ b.y = BOT - r; if (b.vy > 0) b.vy = -b.vy*.3; }
    if (b.x < -GD + r){ b.x = -GD + r; if (b.vx < 0) b.vx = -b.vx*.2; }
  }
  // sağ
  if (b.x > W - r && b.x <= W && !inMouth){ b.x = W - r; if (b.vx > 0){ hit = b.vx; b.vx = -b.vx*rest; } }
  if (b.x > W){
    if (b.y < TOP + r){ b.y = TOP + r; if (b.vy < 0) b.vy = -b.vy*.3; }
    if (b.y > BOT - r){ b.y = BOT - r; if (b.vy > 0) b.vy = -b.vy*.3; }
    if (b.x > W + GD - r){ b.x = W + GD - r; if (b.vx > 0) b.vx = -b.vx*.2; }
  }
  if (hit > 1.2) emit(S, 'bounce', { s: hit });
  if (hit > 0){ b.curve = 0; }
}
function playerWalls(p){
  const x0 = VIEW.x + p.r, x1 = VIEW.x + VIEW.w - p.r, y0 = VIEW.y + p.r, y1 = VIEW.y + VIEW.h - p.r;
  if (p.x < x0){ p.x = x0; p.vx = 0; } if (p.x > x1){ p.x = x1; p.vx = 0; }
  if (p.y < y0){ p.y = y0; p.vy = 0; } if (p.y > y1){ p.y = y1; p.vy = 0; }
}
function kickoffConstraint(S, p){
  if (S.phase !== 'kickoff') return;
  if (p.team === 0 && p.x > W/2 - p.r){ p.x = W/2 - p.r; if (p.vx > 0) p.vx = 0; }
  if (p.team === 1 && p.x < W/2 + p.r){ p.x = W/2 + p.r; if (p.vx < 0) p.vx = 0; }
  if (p.team !== S.kickoffTeam){
    const dx = p.x - W/2, dy = p.y - H/2, d = Math.hypot(dx, dy), min = 80 + p.r;
    if (d < min){ const nx = d ? dx/d : (p.team === 0 ? -1 : 1), ny = d ? dy/d : 0; p.x = W/2 + nx*min; p.y = H/2 + ny*min; }
  }
}

/* ---------- ana tick ---------- */
export function step(S, inputs = {}){
  const events = S.events = [];
  S.t++;
  const b = S.ball;
  const live = S.phase === 'kickoff' || S.phase === 'play' || S.phase === 'goal';
  if (!live) return events;

  assignRoles(S);
  for (const p of S.players){
    let inp = sanitizeInput(p.ctrl === 'ai' ? aiInput(S, p) : inputs[p.id]);
    if (S.phase === 'goal' && p.ctrl === 'ai') inp = NEUTRAL_INPUT;
    const { x, y } = inp;
    const special = S.specials ? inp.special : null;
    p.input = { x, y, kick: inp.kick, hold: inp.hold };
    if (p.callCd > 0) p.callCd--;
    if (p.bubble && --p.bubble.t <= 0) p.bubble = null;
    if (inp.call && p.callCd <= 0 && S.phase !== 'goal'){
      S.req[p.team] = { p, t: 330 }; p.bubble = null; p.callCd = 30;
      emit(S, 'call', { id: p.id, team: p.team });
      // topu tutan ya da topa en yakın bot "geliyor" desin
      const mate = S.players.filter(m => m.team === p.team && m.ctrl === 'ai')
        .sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y))[0];
      if (mate && (S.owner === mate || Math.hypot(mate.x - b.x, mate.y - b.y) < 140)){ mate.bubble = { text: 'Geliyor!', t: 60 }; mate.plan = null; }
    }
    for (const t of SHOT_TYPES) if (p.cd[t] > 0) p.cd[t]--;
    if (special && p.cd[special] <= 0 && S.phase !== 'goal') p.armed = { type: special, t: 24 };
    if (p.armed && --p.armed.t <= 0) p.armed = null;
    // bakış yönü: top sürerken yavaş döner, top etrafında kayar
    const il = Math.hypot(x, y); let ta = null;
    if (il > .2) ta = Math.atan2(y, x);
    else if (Math.hypot(p.vx, p.vy) > .6 && S.owner !== p) ta = Math.atan2(p.vy, p.vx);
    if (ta !== null){
      const da = Math.atan2(Math.sin(ta - p.dirA), Math.cos(ta - p.dirA)), mt = S.owner === p ? .11 : .3;
      p.dirA += Math.max(-mt, Math.min(mt, da));
    }
    if (p.noGrab > 0) p.noGrab--;
    // depar ve dayanıklılık
    const moving = il > .15;
    const spr = inp.sprint && moving && !p.tired && p.sta > 0 && S.phase !== 'goal';
    p.sprinting = spr;
    if (spr){
      p.sta = Math.max(0, p.sta - (S.owner === p ? .0075 : .0062));
      if (p.sta === 0){ p.tired = true; p.mood = 'tired'; p.moodT = 70; }
    } else p.sta = Math.min(1, p.sta + (p.tired ? .0028 : moving ? .0034 : .0055));
    if (p.tired && p.sta >= .38) p.tired = false;
    let mul = spr ? (S.owner === p ? 1.25 : 1.38) : (p.tired ? .72 : 1);
    if (p.stun > 0){ p.stun--; mul *= .25; }
    if (p.tackleCd > 0) p.tackleCd--;
    const acc = (inp.kick ? P_ACC_KICK : P_ACC) * (S.owner === p ? (inp.hold ? .8 : .9) : 1) * mul;
    p.vx += x*acc; p.vy += y*acc;
    if (p.kickCd > 0) p.kickCd--;
    if (p.moodT > 0 && --p.moodT === 0) p.mood = 'idle';
  }

  // hareket
  for (let t = 0; t < 2; t++) if (S.req[t] && --S.req[t].t <= 0) S.req[t] = null;
  updatePass(S);
  aiCalls(S);
  for (const p of S.players){ p.x += p.vx; p.y += p.vy; p.vx *= P_DAMP; p.vy *= P_DAMP; }
  b.x += b.vx; b.y += b.vy; b.vx *= B_DAMP; b.vy *= B_DAMP;
  b.spin += Math.hypot(b.vx, b.vy)/b.r;
  if (b.grace > 0) b.grace--;
  if (b.curve){
    const cs = Math.cos(b.curve), sn = Math.sin(b.curve), vx = b.vx*cs - b.vy*sn;
    b.vy = b.vx*sn + b.vy*cs; b.vx = vx; b.curve *= .975;
    if (Math.abs(b.curve) < .0006) b.curve = 0;
  }
  if (b.z > 0 || b.vz > 0){
    b.z += b.vz; b.vz -= .32;
    if (b.z <= 0){ b.z = 0; if (b.vz < -1.8){ b.vz = -b.vz*.42; emit(S, 'land', { x: b.x, y: b.y }); } else b.vz = 0; }
  }
  if (b.fire > 0){
    b.fire--;
    if (Math.hypot(b.vx, b.vy) < 3) b.fire = 0;
  }

  // şutlar
  for (const p of S.players){
    if (S.phase === 'goal' || b.z > 12) continue;
    const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy);
    if (p.armed && d - p.r - b.r < KICK_RANGE + 3){ specialKick(S, p, p.armed.type); continue; }
    if (S.owner && S.owner.team !== p.team){
      if (p.input.kick && p.tackleCd <= 0 && p.stun <= 0 && d - p.r - b.r < 34) startTackle(S, p);
      continue;
    }
    if (!p.input.kick || p.kickCd > 0) continue;
    if (d - p.r - b.r < KICK_RANGE){
      const owned = S.owner === p;
      releaseBall(S, p);
      // top sürülüyorsa oyuncunun baktığı yöne gider
      let nx = owned ? Math.cos(p.dirA) : dx/d, ny = owned ? Math.sin(p.dirA) : dy/d;
      if (owned && p.ctrl !== 'ai'){ const a = kickAim(S, p); nx = Math.cos(a); ny = Math.sin(a); }
      if (owned){ b.vx = p.vx + nx*KICK; b.vy = p.vy + ny*KICK; }
      else { b.vx += nx*KICK*b.im; b.vy += ny*KICK*b.im; }
      // yana koşarken vurursan top kendiliğinden falso alır
      const lat = nx*(p.vy + p.input.y) - ny*(p.vx + p.input.x);
      b.curve = Math.abs(lat) > .9 ? Math.max(-.014, Math.min(.014, lat*.005)) : 0;
      b.grace = 8;
      p.kickCd = 14; p.mood = 'kick'; p.moodT = 14; S.lastTouch = p;
      emit(S, 'kick', { id: p.id, x: b.x - nx*b.r, y: b.y - ny*b.r });
      p.plan = null;
      registerKick(S, p);
      if (S.phase === 'kickoff') S.phase = 'play';
    }
  }

  // hamle yapan oyuncu topa ulaştıysa sonuçlandır
  for (const p of S.players){
    if (p.lunge <= 0) continue;
    p.lunge--;
    const o = S.owner;
    if (!o || o.team === p.team){ p.lunge = 0; continue; }
    if (Math.hypot(b.x - p.x, b.y - p.y) - p.r - b.r < 9) resolveTackle(S, p);
    else if (p.lunge === 0){ p.stun = 16; p.mood = 'dizzy'; p.moodT = 20; emit(S, 'whiff', { id: p.id, x: p.x, y: p.y }); }
  }

  // çarpışmalar
  const ps = S.players;
  for (let it = 0; it < 2; it++){
    for (let i = 0; i < ps.length; i++){
      for (let j = i + 1; j < ps.length; j++) collide(ps[i], ps[j], .5);
      if (b.z < PR*.9 && collide(ps[i], b, .5) > 0){
        S.lastTouch = ps[i];
        if (!(b.grace > 0)) b.curve = 0;
        if (b.fire > 0 && !(b.grace > 0)){ ps[i].mood = 'sad'; ps[i].moodT = 30; b.fire = 0; emit(S, 'fireStop', { x: b.x, y: b.y }); }
        if (S.phase === 'kickoff') S.phase = 'play';
      }
      for (const po of POSTS) collidePost(ps[i], po, .5);
      kickoffConstraint(S, ps[i]);
      playerWalls(ps[i]);
    }
    for (const po of POSTS){ const h = collidePost(b, po, .5); if (h > 1) emit(S, 'bounce', { s: h }); }
    ballWalls(S, b);
  }
  updateOwner(S);

  // gol
  if (S.phase !== 'goal'){
    if (b.x < -b.r) goal(S, 1);
    else if (b.x > W + b.r) goal(S, 0);
  }

  // süre
  if (S.timed && S.phase === 'play' && !S.overtime){
    S.timeLeft--;
    if (S.timeLeft <= 0){
      S.timeLeft = 0;
      if (S.score[0] === S.score[1]){ S.overtime = true; emit(S, 'overtime'); }
      else { endMatch(S); return events; }
    }
  }

  if (S.phase === 'goal' && --S.goalT <= 0){
    if (S.overtime){ endMatch(S); return events; }
    resetPositions(S);
  }
  return events;
}

/* ---------- top tutma ve sürme ---------- */
function releaseBall(S, kicker){
  if (!S.owner) return;
  S.owner.noGrab = S.owner === kicker ? 12 : 28;
  S.owner = null;
}

function updateOwner(S){
  const b = S.ball;
  if (S.phase === 'goal' || b.z > 8){ S.owner = null; return; }
  const gapOf = p => Math.hypot(b.x - p.x, b.y - p.y) - PR - BR;
  let o = S.owner;
  if (o && gapOf(o) > 10){ o.noGrab = 10; S.owner = o = null; }
  if (o){
    // rakip topa dokunursa kapabilir ya da topu düşürtebilir
    for (const q of S.players){
      if (q.team === o.team || q.noGrab > 0 || gapOf(q) > 2.5) continue;
      if (q.stun > 0) continue;
      let ch = q.ctrl === 'ai' ? DIFF[S.diff].tackle : .03;
      if (o.sprinting) ch *= 1.8;
      if (o.input && o.input.hold) ch *= .5;   // tutarken topu korur
      if (random(S.rng) > ch) continue;
      o.noGrab = 30; o.mood = 'sad'; o.moodT = 30;
      if (random(S.rng) < .5){ S.owner = q; q.dirA = Math.atan2(b.y - q.y, b.x - q.x); }
      else {
        S.owner = null; q.noGrab = 8;
        const a = Math.atan2(b.y - q.y, b.x - q.x);
        b.vx = Math.cos(a)*3 + q.vx; b.vy = Math.sin(a)*3 + q.vy;
      }
      emit(S, 'steal', { id: q.id, x: b.x, y: b.y });
      S.lastTouch = q; S.pass = null;
      return;
    }
  } else {
    let best = null, bd = 1e9;
    for (const p of S.players){
      if (p.noGrab > 0 || p.kickCd > 0) continue;
      const g = gapOf(p);
      const hold = p.input && p.input.hold;
      if (g > (hold ? 12 : 5) || Math.hypot(b.vx - p.vx, b.vy - p.vy) > (hold ? 9 : 5)) continue;
      if (g < bd){ bd = g; best = p; }
    }
    if (best){
      S.owner = best; S.lastTouch = best; best.plan = null;
      if (S.req[best.team] && S.req[best.team].p === best) S.req[best.team] = null;
      best.dirA = Math.atan2(b.y - best.y, b.x - best.x);
      if (S.phase === 'kickoff') S.phase = 'play';
    }
  }
  o = S.owner;
  if (o && o.input && o.input.hold){
    let near = null, nd = 80;
    for (const q of S.players){
      if (q.team === o.team) continue;
      const d = Math.hypot(q.x - o.x, q.y - o.y);
      if (d < nd){ nd = d; near = q; }
    }
    if (near){
      const away = Math.atan2(o.y - near.y, o.x - near.x);
      const da = Math.atan2(Math.sin(away - o.dirA), Math.cos(away - o.dirA));
      o.dirA += Math.max(-.22, Math.min(.22, da));
    }
  }
  if (o){
    const R0 = PR + BR + 1.5;
    const tx = o.x + Math.cos(o.dirA)*R0, ty = o.y + Math.sin(o.dirA)*R0;
    const pull = o.input && o.input.hold ? .7 : .45;
    b.x += (tx - b.x)*pull; b.y += (ty - b.y)*pull;
    b.vx = o.vx; b.vy = o.vy; b.curve = 0; b.fire = 0;
    ballWalls(S, b);
    S.lastTouch = o;
  }
}

// insan oyuncunun şut/pas yönü: basılan yön, yakında bir arkadaş varsa ona kilitlen
function kickAim(S, p){
  const il = Math.hypot(p.input.x, p.input.y);
  const base = il > .3 ? Math.atan2(p.input.y, p.input.x) : p.dirA;
  const b = S.ball;
  let best = null, bestErr = .4;   // ~23 derece
  for (const m of S.players){
    if (m.team !== p.team || m === p) continue;
    const lx = m.x + m.vx*14 - b.x, ly = m.y + m.vy*14 - b.y, d = Math.hypot(lx, ly);
    if (d < 60 || d > 650) continue;
    const a = Math.atan2(ly, lx);
    const err = Math.abs(Math.atan2(Math.sin(a - base), Math.cos(a - base)));
    if (err < bestErr){ bestErr = err; best = a; }
  }
  if (best !== null){ p.dirA = best; return best; }
  return base;
}

function startTackle(S, p){
  const b = S.ball;
  const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 1;
  p.tackleCd = 50; p.lunge = 12; p.mood = 'kick'; p.moodT = 12;
  p.vx += dx/d*2.6; p.vy += dy/d*2.6;
  emit(S, 'tackle', { id: p.id });
  if (d - p.r - b.r < 9) resolveTackle(S, p);
}

function resolveTackle(S, p){
  const o = S.owner, b = S.ball;
  p.lunge = 0;
  if (!o) return;
  const ox = p.x - o.x, oy = p.y - o.y, od = Math.hypot(ox, oy) || 1;
  const front = (Math.cos(o.dirA)*ox + Math.sin(o.dirA)*oy)/od;   // 1: topun olduğu taraftan
  let ch = .48 + front*.24;
  if (o.input && o.input.hold) ch -= .18;
  if (o.sprinting) ch += .12;
  if (o.tired) ch += .12;
  if (p.tired) ch -= .15;
  if (p.ctrl === 'ai') ch += (S.diff - 1)*.07;
  ch = Math.max(.08, Math.min(.9, ch));
  if (random(S.rng) < ch){
    o.noGrab = 32; o.mood = 'sad'; o.moodT = 40; o.stun = 8;
    if (random(S.rng) < .55){ S.owner = p; p.dirA = Math.atan2(b.y - p.y, b.x - p.x); }
    else {
      S.owner = null; p.noGrab = 6;
      const a = Math.atan2(b.y - p.y, b.x - p.x);
      b.vx = Math.cos(a)*3.6 + p.vx*.4; b.vy = Math.sin(a)*3.6 + p.vy*.4;
    }
    S.lastTouch = p; S.pass = null; p.plan = null;
    emit(S, 'tackleWin', { id: p.id, team: p.team, x: b.x, y: b.y, px: p.x, py: p.y });
  } else {
    p.stun = 30; p.mood = 'dizzy'; p.moodT = 34;
    o.vx += Math.cos(o.dirA)*.9; o.vy += Math.sin(o.dirA)*.9;
    emit(S, 'tackleMiss', { id: o.id, team: o.team, x: o.x, y: o.y });
  }
}

function specialKick(S, p, type){
  const b = S.ball;
  const owned = S.owner === p;
  const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 1;
  let nx = owned ? Math.cos(p.dirA) : dx/d, ny = owned ? Math.sin(p.dirA) : dy/d;
  if (owned && p.ctrl !== 'ai'){ const a = kickAim(S, p); nx = Math.cos(a); ny = Math.sin(a); }
  releaseBall(S, p);
  p.armed = null; p.cd[type] = SHOTS[type].cd; p.kickCd = 14;
  p.mood = 'kick'; p.moodT = 20; S.lastTouch = p;
  b.curve = 0; b.fire = 0; b.grace = 8;
  if (type === 'falso'){
    const sp = KICK*1.2;
    b.vx = nx*sp + p.vx*.3; b.vy = ny*sp + p.vy*.3;
    let sgn = Math.sign(nx*(p.input.y + p.vy*.3) - ny*(p.input.x + p.vx*.3));
    if (!sgn){ const gx = (p.team === 0 ? W : 0) - b.x, gy = H/2 - b.y; sgn = Math.sign(nx*gy - ny*gx) || 1; }
    b.curve = sgn*.03;
  } else if (type === 'fuze'){
    const sp = KICK*1.95;
    b.vx = nx*sp; b.vy = ny*sp; b.fire = 70;
  } else {
    const sp = KICK*.95;
    b.vx = nx*sp; b.vy = ny*sp; b.vz = 6.3; b.z = .5;
  }
  emit(S, 'special', { id: p.id, shot: type, x: b.x, y: b.y, px: p.x, py: p.y });
  p.plan = null;
  registerKick(S, p);
  if (S.phase === 'kickoff') S.phase = 'play';
}

function goal(S, team){
  S.score[team]++;
  S.phase = 'goal'; S.goalT = 130; S.pass = null; S.req = [null, null];
  S.kickoffTeam = 1 - team;
  const scorer = S.lastTouch;
  S.goalInfo = { team, t: S.t, scorer, own: scorer && scorer.team !== team };
  for (const p of S.players){ p.mood = p.team === team ? 'happy' : 'sad'; p.moodT = 150; }
  emit(S, 'goal', { team, x: team === 0 ? W + 10 : -10, scorer: scorer ? scorer.id : null });
}

function endMatch(S){
  S.phase = 'over';
  emit(S, 'end', { score: S.score.slice() });
}
