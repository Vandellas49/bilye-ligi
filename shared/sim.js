/* ---------- simülasyon ----------
   Saf maç mantığı: DOM, ses, gerçek zaman ya da Math.random kullanmaz.

   createMatch(ayarlar)  -> state
   step(state, inputs)   -> olay listesi   (state yerinde güncellenir)

   inputs[oyuncuId] = { x, y, kick, special, call, hold, sprint, slide, assist }. Bot oyuncuların
   girdisi burada üretilir; insan oyuncunun girdisi yoksa boş girdi sayılır.
   Ses, parçacık, sarsıntı gibi yan etkiler olay olarak döner ({ type, ... });
   istemci bunları çizer ve seslendirir. */
import { W, H, GD, TOP, BOT, PR, BR, POST_R, VIEW, P_ACC, P_ACC_KICK, P_DAMP, B_DAMP, KICK, KICK_RANGE, WALL_REST,
  CHARGE_TICKS, KICK_MIN, KICK_MAX, AI_KICK_POWER, SPRINT_DRAIN, SPRINT_DRAIN_BALL,
  SLIDE_SPEED, SLIDE_TICKS, SLIDE_REACH, SLIDE_POKE, SLIDE_CD, SLIDE_GETUP, SLIDE_MISS_GETUP,
  PASS_CONE, PASS_ARRIVE, PASS_POWER_MIX, SHOT_OVERRIDE,
  BOT_NAMES, TEAM_NAME, SHOTS, SHOT_TYPES, SHOT_PHYS, normShot, COMBO_WAIT, FACES, POSTS, ARENAS, DIFF, formation } from './constants.js';
import { createRng, random, randInt, shuffle } from './rng.js';
import { registerKick, updatePass, laneOpen } from './pass.js';
import { assignRoles, aiInput, aiCalls } from './ai.js';

export const NEUTRAL_INPUT = Object.freeze({ x: 0, y: 0, kick: false, special: null, call: false, hold: false, sprint: false, slide: false, assist: true });

const num = v => typeof v === 'number' && Number.isFinite(v) ? v : 0;

// girdiyi sınırla: vektör uzunluğu ≤ 1, bilinmeyen özel şut yok sayılır (sunucu da bunu kullanır)
export function sanitizeInput(raw){
  if (!raw || typeof raw !== 'object') return NEUTRAL_INPUT;
  let x = num(raw.x), y = num(raw.y);
  const l = Math.hypot(x, y);
  if (l > 1){ x /= l; y /= l; }
  return {
    x, y, kick: !!raw.kick, special: normShot(raw.special),   // tek şut ya da kombo ('falso+fuze')
    call: !!raw.call, hold: !!raw.hold, sprint: !!raw.sprint, slide: !!raw.slide,
    assist: raw.assist !== false,   // pas yardımı (oyuncunun tercihi, varsayılan açık)
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
      d.charge = 0; d.shot = null; d.kickLock = false;   // şut güç barı (bkz. chargeShot)
      d.slideT = 0; d.slideCd = 0; d.slideA = 0; d.slideHit = false; d.slidePrev = false;   // kayma (bkz. startSlide)
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
    p.charge = 0; p.shot = null; p.kickLock = false;
    p.slideT = 0; p.slideCd = 0;
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
    p.input = { x, y, kick: inp.kick, hold: inp.hold, assist: inp.assist };
    if (p.ctrl !== 'ai') chargeShot(S, p, inp.kick);
    // kayma: tuşa basıldığı an başlar (basılı tutmak yeniden kaydırmaz)
    if (p.slideCd > 0) p.slideCd--;
    if (inp.slide && !p.slidePrev) startSlide(S, p, x, y);
    p.slidePrev = inp.slide;
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
    if (special && S.phase !== 'goal') armShot(p, special);
    if (p.armed){
      if (p.armed.wait > 0) p.armed.wait--;
      if (--p.armed.t <= 0) p.armed = null;
    }
    // bakış yönü: top sürerken yavaş döner, top etrafında kayar
    const il = Math.hypot(x, y); let ta = null;
    if (il > .2) ta = Math.atan2(y, x);
    else if (Math.hypot(p.vx, p.vy) > .6 && S.owner !== p) ta = Math.atan2(p.vy, p.vx);
    if (ta !== null && p.slideT <= 0){
      const da = Math.atan2(Math.sin(ta - p.dirA), Math.cos(ta - p.dirA)), mt = S.owner === p ? .11 : .3;
      p.dirA += Math.max(-mt, Math.min(mt, da));
    }
    if (p.noGrab > 0) p.noGrab--;
    // depar ve dayanıklılık
    const moving = il > .15;
    const spr = inp.sprint && moving && !p.tired && p.sta > 0 && S.phase !== 'goal';
    p.sprinting = spr;
    if (spr){
      p.sta = Math.max(0, p.sta - (S.owner === p ? SPRINT_DRAIN_BALL : SPRINT_DRAIN));
      if (p.sta === 0){ p.tired = true; p.mood = 'tired'; p.moodT = 70; }
    } else p.sta = Math.min(1, p.sta + (p.tired ? .0028 : moving ? .0034 : .0055));
    if (p.tired && p.sta >= .38) p.tired = false;
    let mul = spr ? (S.owner === p ? 1.25 : 1.38) : (p.tired ? .72 : 1);
    if (p.stun > 0){ p.stun--; mul *= .25; }
    if (p.tackleCd > 0) p.tackleCd--;
    const acc = (inp.kick ? P_ACC_KICK : P_ACC) * (S.owner === p ? (inp.hold ? .8 : .9) : 1) * mul;
    if (p.slideT <= 0){ p.vx += x*acc; p.vy += y*acc; }   // kayarken yön değiştirilemez
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
    if (S.phase === 'goal' || b.z > 12 || p.slideT > 0) continue;   // kayan oyuncu şut atmaz
    const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy);
    // özel şut hazırsa top menzildeyken atılır; kombo için ikinci tuş beklenirken normal vuruş da yapılmaz
    if (p.armed && d - p.r - b.r < KICK_RANGE + 3){ if (p.armed.wait <= 0) specialKick(S, p, p.armed.type); continue; }
    if (S.owner && S.owner.team !== p.team){
      if (p.input.kick && p.tackleCd <= 0 && p.stun <= 0 && d - p.r - b.r < 34) startTackle(S, p);
      continue;
    }
    // insan: güç barından bekleyen vuruş; bot: tuşa basıldığı an sabit güç
    const human = p.ctrl !== 'ai';
    if ((human ? !p.shot : !p.input.kick) || p.kickCd > 0) continue;
    if (d - p.r - b.r < KICK_RANGE){
      const power = human ? p.shot.power : AI_KICK_POWER;
      const kick = KICK*(KICK_MIN + (KICK_MAX - KICK_MIN)*power);
      p.shot = null;
      const owned = S.owner === p;
      releaseBall(S, p);
      // top sürülüyorsa oyuncunun baktığı yöne gider
      let nx = owned ? Math.cos(p.dirA) : dx/d, ny = owned ? Math.sin(p.dirA) : dy/d;
      // pas yardımı (insan): basılan yöne yakın arkadaş varsa ona, mesafeye uygun güçle
      let pass = null;
      if (human){
        const il = Math.hypot(p.input.x, p.input.y);
        const contact = Math.atan2(ny, nx);
        const base = il > .3 ? Math.atan2(p.input.y, p.input.x) : contact;
        if (p.input.assist){
          // gelen topa tek vuruşta topun arkasından çok sapamaz; kaleye güçlü nişan şuttur
          const canTurn = owned || angDiff(base, contact) < 1.75;   // en fazla ~100°
          if (canTurn && !(power >= SHOT_OVERRIDE && aimsAtGoal(S, p, base))) pass = passTarget(S, p, base);
        }
        // yardım yoksa (ya da uygun arkadaş yoksa) top sürülürken basılan yöne vurulur
        if (!pass && owned && il > .3){ nx = Math.cos(base); ny = Math.sin(base); p.dirA = base; }
      }
      if (pass){
        nx = pass.nx; ny = pass.ny; p.dirA = pass.a;
        const sp = pass.speed*(1 - PASS_POWER_MIX) + kick*PASS_POWER_MIX;
        b.vx = nx*sp; b.vy = ny*sp;                      // koşu hızı eklenmez, top tam hedefe
        b.curve = 0;
      } else {
        if (owned){ b.vx = p.vx + nx*kick; b.vy = p.vy + ny*kick; }
        else { b.vx += nx*kick*b.im; b.vy += ny*kick*b.im; }
        // yana koşarken vurursan top kendiliğinden falso alır
        const lat = nx*(p.vy + p.input.y) - ny*(p.vx + p.input.x);
        b.curve = Math.abs(lat) > .9 ? Math.max(-.014, Math.min(.014, lat*.005)) : 0;
      }
      b.grace = 8;
      p.kickCd = 14; p.mood = 'kick'; p.moodT = 14; S.lastTouch = p;
      emit(S, 'kick', { id: p.id, x: b.x - nx*b.r, y: b.y - ny*b.r });
      p.plan = null;
      registerKick(S, p);
      if (S.phase === 'kickoff') S.phase = 'play';
    }
  }

  // kayan oyuncular: topa değerse topu iter (rakipteyse kapmayı dener); kayma bitince yerden kalkar
  for (const p of S.players){
    if (p.slideT <= 0) continue;
    if (!p.slideHit && S.phase !== 'goal' && b.z < 12 && Math.hypot(b.x - p.x, b.y - p.y) - p.r - b.r < SLIDE_REACH) slideHit(S, p);
    if (--p.slideT === 0){ p.stun = p.slideHit ? SLIDE_GETUP : SLIDE_MISS_GETUP; if (!p.slideHit){ p.mood = 'dizzy'; p.moodT = SLIDE_MISS_GETUP; } }
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

/* Şut güç barı (insan oyuncu): tuş basılı tutuldukça p.charge 0'dan 1'e dolar.
   Bırakınca o güçte bir vuruş bekler (p.shot, 10 tick içinde top menzile girerse vurulur);
   bar dolunca tuş bırakılmadan kendiliğinden vurur ve tuş bırakılana kadar yeniden dolmaz.
   Rakip toptayken tuş müdahale yapar, bar dolmaz. */
function chargeShot(S, p, held){
  if (p.shot && --p.shot.t <= 0) p.shot = null;
  const tackling = S.owner && S.owner.team !== p.team;
  if (!held){
    if (p.charge > 0 && !p.kickLock && !tackling) p.shot = { power: p.charge, t: 10 };
    p.charge = 0; p.kickLock = false;
    return;
  }
  if (tackling || p.kickLock || S.phase === 'goal'){ p.charge = 0; return; }
  p.charge = Math.min(1, p.charge + 1/CHARGE_TICKS);
  if (p.charge >= 1){ p.shot = { power: 1, t: 10 }; p.charge = 0; p.kickLock = true; }
}

/* Kayarak müdahale: oyuncu baktığı/bastığı yöne hızla kayar, kayarken yönünü değiştiremez.
   Topa değerse topu kayma yönüne iter; top rakipteyse önce kapma şansı hesaplanır.
   Kayma bitince yerden kalkar (stun); ıskaladıysa daha uzun sürer. */
function startSlide(S, p, x, y){
  if (p.slideCd > 0 || p.slideT > 0 || p.stun > 0 || S.owner === p || S.phase === 'goal') return;
  const a = Math.hypot(x, y) > .2 ? Math.atan2(y, x) : p.dirA;
  p.dirA = p.slideA = a; p.slideT = SLIDE_TICKS; p.slideCd = SLIDE_CD; p.slideHit = false;
  p.vx = Math.cos(a)*SLIDE_SPEED; p.vy = Math.sin(a)*SLIDE_SPEED;
  p.noGrab = SLIDE_TICKS + 4;               // kayarken topu ayağına alamaz
  p.charge = 0; p.shot = null; p.armed = null; p.lunge = 0;
  p.mood = 'kick'; p.moodT = SLIDE_TICKS;
  emit(S, 'slide', { id: p.id, x: p.x, y: p.y });
}

function slideHit(S, p){
  const b = S.ball, o = S.owner;
  if (o && o.team === p.team) return;       // takım arkadaşının topuna dokunma
  p.slideHit = true;
  if (o){
    // önden (topun olduğu taraftan) girerse şans yüksek
    const ox = p.x - o.x, oy = p.y - o.y, od = Math.hypot(ox, oy) || 1;
    const front = (Math.cos(o.dirA)*ox + Math.sin(o.dirA)*oy)/od;
    let ch = .62 + front*.2;
    if (o.input && o.input.hold) ch -= .15;
    if (o.sprinting) ch += .1;
    if (o.tired) ch += .08;
    if (p.ctrl === 'ai') ch += (S.diff - 1)*.06;
    ch = Math.max(.15, Math.min(.9, ch));
    if (random(S.rng) >= ch){
      o.vx += Math.cos(o.dirA)*.8; o.vy += Math.sin(o.dirA)*.8;
      emit(S, 'slideMiss', { id: o.id, team: o.team, x: o.x, y: o.y });
      return;
    }
    o.noGrab = 30; o.stun = 14; o.mood = 'sad'; o.moodT = 40;
    S.owner = null;
  }
  let ax = Math.cos(p.slideA), ay = Math.sin(p.slideA);
  if (o){
    // rakipten kapınca top gövdesine değil, yanından çapraz dürtülür (önden kayınca geri sekmesin)
    const px = -ay, py = ax;
    const s = Math.sign((b.x - o.x)*px + (b.y - o.y)*py) || (random(S.rng) < .5 ? 1 : -1);
    const dx = ax*.5 + px*s, dy = ay*.5 + py*s, dl = Math.hypot(dx, dy);
    ax = dx/dl; ay = dy/dl;
    b.vx = ax*SLIDE_POKE; b.vy = ay*SLIDE_POKE;
  } else { b.vx = ax*SLIDE_POKE + p.vx*.3; b.vy = ay*SLIDE_POKE + p.vy*.3; }
  b.curve = 0; b.fire = 0; b.grace = 6;
  S.lastTouch = p; S.pass = null; p.plan = null;
  emit(S, o ? 'slideWin' : 'slideKick', { id: p.id, team: p.team, x: b.x, y: b.y, px: p.x, py: p.y });
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

const angDiff = (a, c) => Math.abs(Math.atan2(Math.sin(a - c), Math.cos(a - c)));

/* Pas yardımı: base yönüne PASS_CONE içinde kalan arkadaşlardan en uygununu seçer.
   Topun arkadaşa varış süresini (B_DAMP yavaşlamasıyla) hesaplayıp arkadaşın o anki yerine nişan alır,
   top oraya PASS_ARRIVE hızıyla varacak şekilde gücü ayarlar. Arada rakip olmayan arkadaş tercih edilir.
   Dönüş: { a, nx, ny, speed, mate } ya da null. */
function passTarget(S, p, base){
  const b = S.ball;
  let best = null;
  for (const m of S.players){
    if (m.team !== p.team || m === p) continue;
    const d0 = Math.hypot(m.x - b.x, m.y - b.y);
    if (d0 < 50 || d0 > 700 || angDiff(Math.atan2(m.y - b.y, m.x - b.x), base) > PASS_CONE) continue;
    let tx = m.x, ty = m.y, speed = 0;
    for (let k = 0; k < 3; k++){
      const d = Math.hypot(tx - b.x, ty - b.y), ux = (tx - b.x)/(d || 1), uy = (ty - b.y)/(d || 1);
      // arkadaş pas yönünde uzaklaşıyorsa top ona yetişecek kadar hızlı varmalı
      const f0 = predictPos(m, 30), f1 = predictPos(m, 31);
      const away = Math.max(0, (f1.x - f0.x)*ux + (f1.y - f0.y)*uy);
      speed = Math.max(KICK*KICK_MIN*.8, Math.min(KICK*KICK_MAX, d*(1 - B_DAMP) + PASS_ARRIVE + away));
      const r = 1 - d*(1 - B_DAMP)/speed;                 // B_DAMP^n: n tick sonra kalan hız oranı
      const n = r > 0 ? Math.min(150, Math.log(r)/Math.log(B_DAMP)) : 150;
      const f = predictPos(m, n);
      tx = Math.max(PR, Math.min(W - PR, f.x));
      ty = Math.max(PR, Math.min(H - PR, f.y));
    }
    const a = Math.atan2(ty - b.y, tx - b.x), err = angDiff(a, base);
    if (err > PASS_CONE) continue;
    const score = err + (laneOpen(S, b.x, b.y, tx, ty, p.team) ? 0 : .35) + d0/2000;
    if (!best || score < best.score) best = { score, a, nx: Math.cos(a), ny: Math.sin(a), speed, mate: m };
  }
  return best;
}

/* Oyuncunun n tick sonraki yeri. İnsan oyuncu bastığı yöne ivmelenmeye devam eder (P_ACC, P_DAMP ile
   kapalı biçimde); bot için mevcut hızla düz gider (bot alıcı zaten pas atılınca topun geleceği yere koşar). */
function predictPos(m, n){
  const k = 1 - P_DAMP, Dn = Math.pow(P_DAMP, n), drift = (1 - Dn)/k;
  let ax = 0, ay = 0;
  if (m.ctrl !== 'ai' && m.input){
    const il = Math.hypot(m.input.x, m.input.y);
    if (il > .2){ const acc = P_ACC*(m.sprinting ? 1.38 : 1); ax = m.input.x/il*acc; ay = m.input.y/il*acc; }
    return { x: m.x + m.vx*drift + ax/k*(n - drift), y: m.y + m.vy*drift + ay/k*(n - drift) };
  }
  return { x: m.x + m.vx*n, y: m.y + m.vy*n };
}

// base yönü rakip kalenin ağzına mı bakıyor (o zaman güçlü vuruş şuttur, pasa çevrilmez)
function aimsAtGoal(S, p, base){
  const b = S.ball, gx = p.team === 0 ? W : 0;
  if (Math.abs(gx - b.x) > 650) return false;
  const a1 = Math.atan2(TOP + 8 - b.y, gx - b.x), a2 = Math.atan2(BOT - 8 - b.y, gx - b.x);
  const span = angDiff(a1, a2);
  return angDiff(base, a1) <= span + .05 && angDiff(base, a2) <= span + .05;
}

// insan oyuncunun özel şut yönü: basılan yön, uygun bir arkadaş varsa ona kilitlen
function kickAim(S, p){
  const il = Math.hypot(p.input.x, p.input.y);
  const base = il > .3 ? Math.atan2(p.input.y, p.input.x) : p.dirA;
  const t = passTarget(S, p, base);
  if (t){ p.dirA = t.a; return t.a; }
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

/* Özel şut tuşu: hazır (bekleme süresi bitmiş) parçalar mevcut hazırlığa eklenir.
   İlk tuştan sonra COMBO_WAIT tick boyunca atış yapılmaz ki ikinci tuş yetişip kombo olsun.
   Tuş basılı kaldıkça hazırlık tazelenir (24 tick). */
function armShot(p, special){
  const ready = special.split('+').filter(t => p.cd[t] <= 0);
  if (!ready.length) return;
  if (!p.armed){ p.armed = { type: ready.join('+'), t: 24, wait: COMBO_WAIT }; return; }
  p.armed.type = normShot([...p.armed.type.split('+'), ...ready]);
  p.armed.t = 24;
}

function specialKick(S, p, type){
  const b = S.ball;
  const owned = S.owner === p;
  const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 1;
  let nx = owned ? Math.cos(p.dirA) : dx/d, ny = owned ? Math.sin(p.dirA) : dy/d;
  if (owned && p.ctrl !== 'ai'){ const a = kickAim(S, p); nx = Math.cos(a); ny = Math.sin(a); }
  releaseBall(S, p);
  // kombo kullandığı tüm şutların bekleme süresini doldurur
  for (const t of type.split('+')) p.cd[t] = SHOTS[t].cd;
  p.armed = null; p.kickCd = 14;
  p.mood = 'kick'; p.moodT = 20; S.lastTouch = p;
  b.curve = 0; b.fire = 0; b.grace = 8;
  const ph = SHOT_PHYS[type], sp = KICK*ph.sp;
  if (ph.curve){
    // falso: koşu yönü topa biraz eklenir, dönüş yönü yana hareketten (yoksa kaleye doğru)
    b.vx = nx*sp + p.vx*.3; b.vy = ny*sp + p.vy*.3;
    let sgn = Math.sign(nx*(p.input.y + p.vy*.3) - ny*(p.input.x + p.vx*.3));
    if (!sgn){ const gx = (p.team === 0 ? W : 0) - b.x, gy = H/2 - b.y; sgn = Math.sign(nx*gy - ny*gx) || 1; }
    b.curve = sgn*ph.curve;
  } else { b.vx = nx*sp; b.vy = ny*sp; }
  if (ph.vz){ b.vz = ph.vz; b.z = .5; }
  if (ph.fire) b.fire = ph.fire;
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
