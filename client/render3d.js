/* ---------- 3B çizim (Three.js r128) ----------
   Maç durumunu (S) okur, değiştirmez. Sahne: eğik yayın açısından kamera, gölgeli küre karakterler,
   3B kaleler ve file, tribünlerde seyirciler, LED panolar, projektörler, gerçek derinlikte kar/parıltı.
   İsimler, çubuklar, balonlar ve HUD 2B katmanda (render.js) üstte çizilir; project() ile yansıtılır.
   THREE global'i client/three.min.js ile gelir (render.js yükler). */
import { W, H, GH, GD, TOP, BOT, PR, BR, VIEW, TEAM_COL, TEAM_DARK, ARENAS, shotInfo } from '../shared/constants.js';
import { visOf, reduceMotion, jumpOf } from './effects.js';
import { isTouch } from './ui.js';

const ARENA3D = {
  gece:  { sky: 0x0b1020, fog: 0x0b1020, hs: 0x9fc0ff, hg: 0x1a1020, hi: .62, sun: 0xd6e8ff, si: .95, outer: 0x15101c, stand: 0x2a2236, seat: 0x3a3048, glow: 0xbff0ff },
  kil:   { sky: 0xbcd4e6, fog: 0xc6d8e4, hs: 0xffffff, hg: 0x8a6d55, hi: .55, sun: 0xfff1dc, si: .78, outer: 0xcfc8bd, stand: 0xb3aca0, seat: 0x9a948a, glow: 0xffffff },
  cim:   { sky: 0x9cc7e8, fog: 0xa9cde6, hs: 0xeaf4ff, hg: 0x2f5a35, hi: .52, sun: 0xfff6e0, si: .74, outer: 0x1c4128, stand: 0x2f3c46, seat: 0x46545e, glow: 0xffffff },
  aksam: { sky: 0x3b2350, fog: 0x5e3468, hs: 0xffc0dc, hg: 0x3a2050, hi: .58, sun: 0xffc8a8, si: .82, outer: 0x2e1d45, stand: 0x3a2a55, seat: 0x4d3a6c, glow: 0xffd6ec },
};
const EL = 57*Math.PI/180;        // kamera yükseklik açısı
const G3 = { ready: false };
let T, SH, S, V, FX;               // THREE, render.js paylaşımı, maç durumu, görünüm, efektler
const light = () => isTouch();     // dokunmatik cihazda daha hafif ayarlar

const toV = (x, y, h) => new T.Vector3(x - W/2, h, y - H/2);
// her karede yeni nesne üretmemek için tekrar kullanılan geçiciler (çöp toplayıcı takılması olmasın)
const TMP = {};
function tmp(){ if (!TMP.a){ TMP.a = new T.Vector3(); TMP.b = new T.Vector3(); TMP.c = new T.Vector3(); TMP.up = new T.Vector3(); TMP.ax = new T.Vector3(); TMP.q = new T.Quaternion(); } return TMP; }
const setV = (v, x, y, h) => v.set(x - W/2, h, y - H/2);

const colCache = new Map();
function parseCol(str){
  let c = colCache.get(str);
  if (c) return c;
  if (str[0] === '#'){
    const n = parseInt(str.slice(1), 16);
    c = [(n >> 16)/255, ((n >> 8) & 255)/255, (n & 255)/255, 1];
  } else {
    const m = str.match(/[\d.]+/g).map(Number);
    c = [m[0]/255, m[1]/255, m[2]/255, m.length > 3 ? m[3] : 1];
  }
  colCache.set(str, c); return c;
}

/* ---------- nokta bulutları (parçacık, iz, kar, parıltı) ---------- */
function makePoints(max, additive){
  const geo = new T.BufferGeometry();
  const pos = new Float32Array(max*3), col = new Float32Array(max*3), al = new Float32Array(max), sz = new Float32Array(max);
  geo.setAttribute('position', new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage));
  geo.setAttribute('color', new T.BufferAttribute(col, 3).setUsage(T.DynamicDrawUsage));
  geo.setAttribute('alpha', new T.BufferAttribute(al, 1).setUsage(T.DynamicDrawUsage));
  geo.setAttribute('size', new T.BufferAttribute(sz, 1).setUsage(T.DynamicDrawUsage));
  geo.setDrawRange(0, 0);
  const mat = new T.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: `attribute float alpha; attribute float size; attribute vec3 color; varying float vA; varying vec3 vC; uniform float uScale;
      void main(){ vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; varying vec3 vC;
      void main(){ vec2 d = gl_PointCoord - .5; float r = length(d); if (r > .5) discard; gl_FragColor = vec4(vC, vA * smoothstep(.5, .18, r)); }`,
    transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending,
  });
  const pts = new T.Points(geo, mat); pts.frustumCulled = false;
  return { pts, pos, col, al, sz, geo, max, n: 0 };
}
function putPoint(P, x, y, z, rgb, a, size){
  if (P.n >= P.max) return;
  const i = P.n++;
  P.pos[i*3] = x; P.pos[i*3+1] = y; P.pos[i*3+2] = z;
  P.col[i*3] = rgb[0]; P.col[i*3+1] = rgb[1]; P.col[i*3+2] = rgb[2];
  P.al[i] = a; P.sz[i] = size;
}
function flushPoints(P){
  const g = P.geo;
  g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
  g.attributes.alpha.needsUpdate = true; g.attributes.size.needsUpdate = true;
  g.setDrawRange(0, P.n);
}

/* ---------- kurulum ---------- */
export function init3D(canvas, share){
  T = window.THREE; SH = share;
  const r = G3.renderer = new T.WebGLRenderer({ canvas, antialias: !light() });
  r.shadowMap.enabled = true; r.shadowMap.type = T.PCFShadowMap;
  const sc = G3.scene = new T.Scene();
  G3.camera = new T.PerspectiveCamera(36, 16/9, 10, 8000);
  G3.target = new T.Vector3(0, 0, 14); G3.baseDist = 1100; G3.zoom = 1; G3.cw = 800; G3.ch = 450;
  G3.hemi = new T.HemisphereLight(0xffffff, 0x444444, .65); sc.add(G3.hemi);
  const sun = G3.sun = new T.DirectionalLight(0xffffff, 1);
  sun.position.set(-320, 950, 420); sun.castShadow = true;
  sun.shadow.mapSize.set(light() ? 1024 : 2048, light() ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -760, right: 760, top: 520, bottom: -520, near: 100, far: 2600 });
  sun.shadow.bias = -0.0006;
  sc.add(sun); sc.add(sun.target);
  sc.fog = new T.Fog(0x000000, 1800, 4200);

  // saha zemini: 2B arka plan dokusu (render.js'in önbellekli saha çizimi)
  G3.pitchTex = new T.CanvasTexture(SH.bg);
  G3.pitchTex.anisotropy = r.capabilities.getMaxAnisotropy();
  G3.bgVersion = -1;
  const ground = new T.Mesh(new T.PlaneGeometry(VIEW.w, VIEW.h), new T.MeshStandardMaterial({ map: G3.pitchTex, roughness: .95 }));
  ground.rotation.x = -Math.PI/2;
  ground.position.set(VIEW.x + VIEW.w/2 - W/2, 0, VIEW.y + VIEW.h/2 - H/2);
  ground.receiveShadow = true; sc.add(ground);
  G3.outerMat = new T.MeshStandardMaterial({ color: 0x222222, roughness: 1 });
  const outer = new T.Mesh(new T.PlaneGeometry(7000, 7000), G3.outerMat);
  outer.rotation.x = -Math.PI/2; outer.position.y = -.6; outer.receiveShadow = true; sc.add(outer);

  buildStadium(); buildGoals(); buildBall();
  G3.fx = makePoints(2200, false); sc.add(G3.fx.pts);
  G3.glow = makePoints(500, true); sc.add(G3.glow.pts);
  G3.snow = makePoints(1600, false); sc.add(G3.snow.pts);
  G3.snowList = []; G3.trail = []; G3.players = new Map();
  G3.prevBall = { x: W/2, y: H/2 };
  G3.key = '';   // saha/hava değişince yeniden ayarlamak için
  G3.quality = 2; G3.ft = []; G3.lastT = 0; G3.tooSlow = false;   // otomatik kalite (bkz. adaptQuality)
  G3.ready = true;
}

function buildStadium(){
  const g = new T.Group(); G3.scene.add(g);
  const x0 = VIEW.x - W/2, x1 = VIEW.x + VIEW.w - W/2, z0 = VIEW.y - H/2, z1 = VIEW.y + VIEW.h - H/2;
  G3.boardMat = new T.MeshStandardMaterial({ color: 0x1b1626, roughness: .6 });
  const led = c => new T.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: .7, roughness: .5 });
  G3.leds = [led(TEAM_COL[0]), led(TEAM_COL[1])];
  const HB = 16, TB = 8;
  const box = (w, h, d, x, y, z, m, shadow = true) => {
    const b = new T.Mesh(new T.BoxGeometry(w, h, d), m); b.position.set(x, y, z);
    b.castShadow = shadow; b.receiveShadow = true; g.add(b); return b;
  };
  // kenar panoları
  box(x1 - x0 + 2*TB, HB, TB, (x0 + x1)/2, HB/2, z0 - TB/2, G3.boardMat);
  box(x1 - x0 + 2*TB, HB*.7, TB, (x0 + x1)/2, HB*.35, z1 + TB/2, G3.boardMat);
  box(TB, HB, z1 - z0, x0 - TB/2, HB/2, (z0 + z1)/2, G3.boardMat);
  box(TB, HB, z1 - z0, x1 + TB/2, HB/2, (z0 + z1)/2, G3.boardMat);
  // LED reklam şeridi: uzak panonun iç yüzü, takım renklerinde
  const segW = 70, n = Math.floor((x1 - x0)/segW);
  for (let i = 0; i < n; i++) box(segW - 4, HB - 6, 1.2, x0 + segW/2 + i*segW + ((x1 - x0) - n*segW)/2, HB/2, z0 + .7, G3.leds[i % 2], false);
  // tribünler ve seyirciler
  G3.standMat = new T.MeshStandardMaterial({ color: 0x2a2236, roughness: .9 });
  G3.seatMat = new T.MeshStandardMaterial({ color: 0x3a3048, roughness: .9 });
  const fans = [], gap = light() ? 26 : 17;
  const ROWS = light() ? 4 : 6, RD = 26, RH = 15;
  for (let r = 0; r < ROWS; r++){                          // uzak tribün
    const z = z0 - TB - 18 - r*RD, h = 12 + r*RH;
    box(x1 - x0 + 260, h, RD, (x0 + x1)/2, h/2, z, r % 2 ? G3.seatMat : G3.standMat);
    for (let x = x0 - 110; x <= x1 + 110; x += gap){
      if (Math.random() < .12) continue;
      fans.push({ x: x + (Math.random() - .5)*5, y: h + 7, z: z + (Math.random() - .5)*4, team: x < 0 ? 0 : 1, mix: true });
    }
  }
  for (const side of [0, 1]){                              // kale arkası tribünleri: o takımın taraftarı
    for (let r = 0; r < (light() ? 3 : 4); r++){
      const x = side ? x1 + TB + 18 + r*RD : x0 - TB - 18 - r*RD, h = 10 + r*RH;
      box(RD, h, z1 - z0 + 40, x, h/2, (z0 + z1)/2 + 20, r % 2 ? G3.seatMat : G3.standMat);
      for (let z = z0 + 10; z <= z1 + 30; z += gap){
        if (Math.random() < .1) continue;
        fans.push({ x: x + (Math.random() - .5)*4, y: h + 7, z: z + (Math.random() - .5)*5, team: side, mix: false });
      }
    }
  }
  const inst = new T.InstancedMesh(new T.SphereGeometry(6.5, 10, 8), new T.MeshStandardMaterial({ roughness: .7 }), fans.length);
  const others = ['#f05a5a', '#ffffff', '#7c6cf0', '#5bd18b', '#ff9f43', '#e86fb5'];
  const c = new T.Color();
  fans.forEach((f, i) => {
    const hex = f.mix ? (Math.random() < .55 ? TEAM_COL[f.team] : others[Math.random()*others.length|0])
                      : (Math.random() < .8 ? TEAM_COL[f.team] : '#ffffff');
    c.set(hex); inst.setColorAt(i, c);
    f.ph = Math.random()*6.28; f.sp = .6 + Math.random()*.8;
  });
  inst.receiveShadow = true; g.add(inst);
  G3.fans = fans; G3.fanMesh = inst; G3.fanDummy = new T.Object3D();
  // projektör direkleri
  G3.lampMat = new T.MeshBasicMaterial({ color: 0xfff6d8 });
  const poleMat = new T.MeshStandardMaterial({ color: 0x55505e, roughness: .6, metalness: .3 });
  G3.lamps = [];
  for (const [lx, lz] of [[x0 - 150, z0 - 190], [x1 + 150, z0 - 190], [x0 - 170, z1 + 60], [x1 + 170, z1 + 60]]){
    const pole = new T.Mesh(new T.CylinderGeometry(4, 6, 420, 10), poleMat); pole.position.set(lx, 210, lz); pole.castShadow = true; g.add(pole);
    const head = new T.Mesh(new T.BoxGeometry(70, 34, 10), G3.lampMat); head.position.set(lx, 430, lz); head.lookAt(0, 0, 0); g.add(head);
    G3.lamps.push(head.position.clone());
  }
}

function buildGoals(){
  const GHT = 26 + 2*BR, pr = 4.2;
  const postMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: .3, metalness: .15 });
  const nc = document.createElement('canvas'); nc.width = nc.height = 128;
  const nx = nc.getContext('2d');
  nx.strokeStyle = 'rgba(255,255,255,.75)'; nx.lineWidth = 2.2;
  for (let i = 0; i <= 128; i += 16){ nx.beginPath(); nx.moveTo(i, 0); nx.lineTo(i, 128); nx.stroke(); nx.beginPath(); nx.moveTo(0, i); nx.lineTo(128, i); nx.stroke(); }
  const netTex = new T.CanvasTexture(nc); netTex.wrapS = netTex.wrapT = T.RepeatWrapping;
  const netMat = (rx, ry) => { const t = netTex.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return new T.MeshBasicMaterial({ map: t, transparent: true, side: T.DoubleSide, depthWrite: false, opacity: .85 }); };
  const g = new T.Group(); G3.scene.add(g);
  const cyl = (len, a, b2) => {
    const m = new T.Mesh(new T.CylinderGeometry(pr, pr, len, 14), postMat);
    m.position.copy(a.clone().add(b2).multiplyScalar(.5));
    m.lookAt(b2); m.rotateX(Math.PI/2); m.castShadow = true; g.add(m); return m;
  };
  for (const s of [0, 1]){
    const gx = s ? W : 0, dir = s ? 1 : -1;
    const pT = toV(gx, TOP, 0), pB = toV(gx, BOT, 0);
    cyl(GHT, pT, pT.clone().setY(GHT)); cyl(GHT, pB, pB.clone().setY(GHT));
    cyl(GH, pT.clone().setY(GHT), pB.clone().setY(GHT));
    const bx = gx + dir*GD;
    const bT = toV(bx, TOP, 0), bB = toV(bx, BOT, 0), backH = GHT*.8;
    cyl(backH, bT, bT.clone().setY(backH)); cyl(backH, bB, bB.clone().setY(backH));
    cyl(GD, pT.clone().setY(GHT), bT.clone().setY(backH)); cyl(GD, pB.clone().setY(GHT), bB.clone().setY(backH));
    const back = new T.Mesh(new T.PlaneGeometry(GH, backH), netMat(GH/18, backH/18));
    back.position.copy(toV(bx, H/2, backH/2)); back.rotation.y = Math.PI/2; g.add(back);
    for (const yy of [TOP, BOT]){
      const shp = new T.Shape(); shp.moveTo(0, 0); shp.lineTo(GD, 0); shp.lineTo(GD, backH); shp.lineTo(0, GHT); shp.closePath();
      const side = new T.Mesh(new T.ShapeGeometry(shp), netMat(GD/18, GHT/18));
      side.position.copy(toV(gx, yy, 0)); if (s === 0) side.rotation.y = Math.PI; g.add(side);
    }
    const top = new T.Mesh(new T.PlaneGeometry(GD, GH), netMat(GD/18, GH/18));
    top.position.copy(toV(gx + dir*GD/2, H/2, (GHT + backH)/2));
    top.rotation.x = -Math.PI/2; top.rotation.y = dir*Math.atan2(GHT - backH, GD); g.add(top);
    for (const pp of [pT, pB]){                              // direk dibinde takım renkli halka
      const ring = new T.Mesh(new T.CylinderGeometry(pr + 3, pr + 3, 3, 16), new T.MeshStandardMaterial({ color: TEAM_COL[s], roughness: .4 }));
      ring.position.copy(pp).setY(1.5); g.add(ring);
    }
  }
}

function buildBall(){
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 512, 256);
  x.fillStyle = '#231c2c';
  const spots = [[0,.5],[.2,.5],[.4,.5],[.6,.5],[.8,.5],[.1,.18],[.3,.18],[.5,.18],[.7,.18],[.9,.18],[.1,.82],[.3,.82],[.5,.82],[.7,.82],[.9,.82]];
  for (const [u, v] of spots){
    const cx = u*512, cy = v*256, r = 26;
    x.beginPath();
    for (let i = 0; i < 5; i++){ const a = i*Math.PI*2/5 - Math.PI/2; x.lineTo(cx + Math.cos(a)*r*1.25, cy + Math.sin(a)*r); }
    x.closePath(); x.fill();
  }
  G3.ballMat = new T.MeshStandardMaterial({ map: new T.CanvasTexture(c), roughness: .32, metalness: .05, emissive: 0x000000 });
  G3.ball = new T.Mesh(new T.SphereGeometry(BR, 32, 22), G3.ballMat);
  G3.ball.castShadow = true; G3.scene.add(G3.ball);
  G3.ballLight = new T.PointLight(0xff7a20, 0, 260, 2); G3.scene.add(G3.ballLight);
  G3.curveRing = new T.Mesh(new T.TorusGeometry(BR + 7, 1.5, 8, 40, Math.PI*1.3), new T.MeshBasicMaterial({ color: 0xc86bff, transparent: true, opacity: .9 }));
  G3.curveRing.rotation.x = -Math.PI/2; G3.curveRing.visible = false; G3.scene.add(G3.curveRing);
}

function dashedRing(r, w, color, n){
  const g = new T.Group();
  const mat = new T.MeshBasicMaterial({ color, transparent: true, opacity: .85, depthWrite: false });
  for (let i = 0; i < n; i++) g.add(new T.Mesh(new T.RingGeometry(r, r + w, 8, 1, i*Math.PI*2/n, Math.PI*2/n*.55), mat));
  g.rotation.x = -Math.PI/2; g.position.y = .8;
  g.userData.mat = mat;
  return g;
}

/* ---------- karakter ---------- */
function makePlayer(p){
  const g = new T.Group();
  // gövde: tepe takım rengi, altta beyaz şerit ve koyu forma (köşe renkleriyle)
  const geo = new T.SphereGeometry(PR, 36, 26);
  const cols = [], pa = geo.attributes.position, c = new T.Color();
  const base = new T.Color(TEAM_COL[p.team]), dark = new T.Color(TEAM_DARK[p.team]).multiplyScalar(1.15), white = new T.Color(0xffffff);
  for (let i = 0; i < pa.count; i++){
    const yy = pa.getY(i)/PR;
    c.copy(yy < -.44 ? dark : yy < -.33 ? white : base);
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
  const mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: .4, metalness: .05, emissive: 0x000000 });
  const pivot = new T.Group(); g.add(pivot);
  const body = new T.Mesh(geo, mat); body.castShadow = true; body.receiveShadow = true;
  pivot.add(body);
  const shoeMat = new T.MeshStandardMaterial({ color: 0x1e1828, roughness: .5 });
  const shoes = [-1, 1].map(s => {
    const m = new T.Mesh(new T.SphereGeometry(1, 14, 10), shoeMat);
    m.scale.set(7, 4.6, 9.5); m.castShadow = true; g.add(m); m.userData.s = s; return m;
  });
  // yüz: 2B yüz çizimi bir dokuya çizilip kameraya bakan karta konur
  const fc = document.createElement('canvas'); fc.width = fc.height = 160;
  const tex = new T.CanvasTexture(fc);
  const sprite = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  const k = PR/SH.ART_R;
  sprite.scale.set(160/2.5*k, 160/2.5*k, 1);
  G3.scene.add(sprite);
  const halo = new T.Mesh(new T.RingGeometry(PR + 4, PR + 9, 48), new T.MeshBasicMaterial({ color: TEAM_COL[p.team], transparent: true, opacity: .6, depthWrite: false }));
  halo.rotation.x = -Math.PI/2; halo.position.y = .7; g.add(halo);
  const human = dashedRing(PR + 10, 2.4, 0xffffff, 12); g.add(human);
  const recv = dashedRing(PR + 15, 3, 0xffffff, 16); g.add(recv);
  const shp = new T.Shape(); shp.moveTo(7, 0); shp.lineTo(-4, -6); shp.lineTo(-4, 6); shp.closePath();
  const arrow = new T.Mesh(new T.ShapeGeometry(shp), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .9, depthWrite: false }));
  arrow.rotation.x = -Math.PI/2; arrow.position.y = 1;
  const arrowPivot = new T.Group(); arrowPivot.add(arrow); g.add(arrowPivot);
  const ghostMat = new T.MeshBasicMaterial({ color: TEAM_COL[p.team], transparent: true, opacity: .16, depthWrite: false });
  const ghosts = [1, 2, 3].map(() => { const m = new T.Mesh(new T.SphereGeometry(PR, 20, 14), ghostMat); m.visible = false; G3.scene.add(m); return m; });
  G3.scene.add(g);
  return { g, pivot, body, mat, shoes, sprite, fc, fctx: fc.getContext('2d'), tex, halo, human, recv, arrow, arrowPivot, ghosts };
}

function drawFaceSprite(p, o){
  const c = o.fctx, k = 2.5, r = SH.ART_R, v = visOf(p);
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 160, 160);
  c.setTransform(k, 0, 0, k, 80 - k*p.x, 88 - k*p.y);
  c.fillStyle = 'rgba(255,255,255,.95)';
  c.font = '800 8px Figtree, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(String(p.num), p.x, p.y + 13.8);
  SH.drawFace(c, p, p.y - 2, v);
  SH.drawAccessory(c, p, p.y, r);
  const y0 = p.y;
  if (p.mood === 'dizzy'){
    c.fillStyle = '#ffe36b';
    for (let i = 0; i < 3; i++){ const a = S.t*.2 + i*2.09; c.beginPath(); c.arc(p.x + Math.cos(a)*12, y0 - r - 3 + Math.sin(a)*3.5, 2.2, 0, Math.PI*2); c.fill(); }
  }
  if (p.mood === 'sad' || p.tired){
    c.fillStyle = '#9fe3ff';
    c.beginPath(); c.moveTo(p.x + 13, y0 - 12); c.quadraticCurveTo(p.x + 17, y0 - 5, p.x + 13, y0 - 4); c.quadraticCurveTo(p.x + 9, y0 - 5, p.x + 13, y0 - 12); c.fill();
  } else if (p.mood === 'happy'){
    c.fillStyle = '#fff3a0';
    for (let i = 0; i < 3; i++){
      const a = S.t*.12 + p.slot + i*2.1, sx = p.x + Math.cos(a)*(r + 8), sy = y0 - 4 + Math.sin(a)*(r*.6 + 6);
      c.beginPath(); for (let j = 0; j < 8; j++){ const r2 = j % 2 ? 1.3 : 3.4, aa = j*Math.PI/4; c.lineTo(sx + Math.cos(aa)*r2, sy + Math.sin(aa)*r2); } c.closePath(); c.fill();
    }
  }
  o.tex.needsUpdate = true;
}

/* ---------- saha ve hava ayarı ---------- */
function applyArena(){
  const A0 = ARENAS[S.arena] || ARENAS[0], A = ARENA3D[A0.id] || ARENA3D.cim;
  G3.scene.background = new T.Color(A.sky);
  G3.scene.fog.color.setHex(A.fog);
  G3.hemi.color.setHex(A.hs); G3.hemi.groundColor.setHex(A.hg); G3.hemi.intensity = A.hi;
  G3.sun.color.setHex(A.sun); G3.sun.intensity = A.si;
  G3.outerMat.color.setHex(A.outer);
  G3.standMat.color.setHex(A.stand); G3.seatMat.color.setHex(A.seat);
  G3.lampMat.color.setHex(A.glow);
  G3.snowList = [];
  const kind = S.weather, n = kind === 'kar' ? (reduceMotion || light() ? 400 : 1400) : kind === 'parilti' ? (reduceMotion || light() ? 120 : 320) : 0;
  for (let i = 0; i < n; i++){
    G3.snowList.push({ x: (Math.random() - .5)*1700, y: Math.random()*520, z: (Math.random() - .5)*1100 - 120,
      s: kind === 'kar' ? 2.2 + Math.random()*4.2 : 3 + Math.random()*5, v: kind === 'kar' ? .5 + Math.random()*.9 : -(.08 + Math.random()*.25),
      ph: Math.random()*6.28, a: .45 + Math.random()*.5 });
  }
}

/* ---------- kamera ---------- */
export function resize3D(cw, ch, dpr){
  if (!G3.ready) return;
  G3.dpr = dpr;
  const d = Math.min(dpr, light() ? 1.25 : 1.5);   // yüksek DPI ekranda piksel sayısı sınırlı
  G3.renderer.setPixelRatio(d); G3.renderer.setSize(cw, ch, false);
  G3.cw = cw; G3.ch = ch;
  const cam = G3.camera;
  cam.aspect = cw/ch; cam.updateProjectionMatrix();
  // sahayı ve kaleleri ekrana sığdır (kenar boşluğu ve tribünler taşabilir)
  const corners = [[-GD - 6, -6], [W + GD + 6, -6], [-GD - 6, H + 14], [W + GD + 6, H + 14]];
  const fits = dist => {
    cam.position.set(G3.target.x, G3.target.y + Math.sin(EL)*dist, G3.target.z + Math.cos(EL)*dist);
    cam.lookAt(G3.target); cam.updateMatrixWorld();
    return corners.every(([x, y]) => { const v = toV(x, y, 0).project(cam); return Math.abs(v.x) < .96 && v.y > -.9 && v.y < .86; });
  };
  let lo = 300, hi = 6000;
  for (let i = 0; i < 30; i++){ const m = (lo + hi)/2; if (fits(m)) hi = m; else lo = m; }
  G3.baseDist = hi;
  const uScale = ch*d/(2*Math.tan(cam.fov*Math.PI/360));
  for (const P of [G3.fx, G3.glow, G3.snow]) P.pts.material.uniforms.uScale.value = uScale;
}

function updateCamera(){
  const cam = G3.camera, b = S.ball;
  let tx = 0, tz = 14, zoom = 1;
  if (S.players.length){
    tx = (b.x - W/2)*.16; tz = 14 + (b.y - H/2)*.06;
    // gol sevinci: kamera golü atana yaklaşır (yoksa kaleye)
    if (S.phase === 'goal' && S.goalInfo){
      const sc = S.goalInfo.scorer;
      if (sc && !S.goalInfo.own){ tx = (sc.x - W/2)*.8; tz = (sc.y - H/2)*.6; zoom = .6; }
      else { tx = (S.goalInfo.team === 0 ? W/2 : -W/2)*.55; tz = 0; zoom = .72; }
    }
  }
  const k = reduceMotion ? 1 : .05;
  G3.target.x += (tx - G3.target.x)*k; G3.target.z += (tz - G3.target.z)*k;
  G3.zoom += (zoom - G3.zoom)*(reduceMotion ? 1 : .04);
  const dist = G3.baseDist*1.03*G3.zoom;
  cam.position.set(G3.target.x, Math.sin(EL)*dist, G3.target.z + Math.cos(EL)*dist);
  if (FX.shake > 0){
    cam.position.x += (Math.random()*2 - 1)*FX.shake*.9; cam.position.y += (Math.random()*2 - 1)*FX.shake*.6;
    FX.shake *= .88; if (FX.shake < .3) FX.shake = 0;
  }
  cam.lookAt(G3.target);
}

/* ---------- her kare ---------- */
function syncPlayers(){
  const live = new Set(S.players);
  for (const [p, o] of G3.players){
    if (live.has(p)) continue;
    G3.scene.remove(o.g); G3.scene.remove(o.sprite); o.ghosts.forEach(m => G3.scene.remove(m));
    o.body.geometry.dispose(); o.tex.dispose(); G3.players.delete(p);
  }
  for (const p of S.players) if (!G3.players.has(p)) G3.players.set(p, makePlayer(p));
}

function updateScene(){
  syncPlayers();
  const cam = G3.camera, paused = V.paused, move = !paused && V.mode !== 'end';
  const tp = tmp(), camDir = tp.a, camUp = tp.up.set(0, 1, 0).applyQuaternion(cam.quaternion);
  G3.frame = (G3.frame || 0) + 1;
  const goalPhase = S.phase === 'goal' && S.goalInfo;
  for (const [p, o] of G3.players){
    const v = visOf(p);
    const sp = Math.hypot(p.vx, p.vy), run = Math.min(1, sp/2.2);
    const bob = Math.abs(Math.sin(v.walk))*2.4*run, jump = jumpOf(S, p);
    setV(o.g.position, p.x, p.y, jump);
    const va = Math.atan2(p.vy, p.vx), sliding = p.slideT > 0;
    const lose = goalPhase && p.team !== S.goalInfo.team;
    let st = Math.min(.1, sp*.028) + (p.mood === 'kick' ? .07 : 0) + (p.sprinting ? .05 : 0);
    if (sliding) st = .3;
    // eğilme: depar öne, kayma geriye yatık; gol sevincinde dönerek zıplar
    o.pivot.rotation.set(0, -va + (jump > 0 ? S.t*.15 : 0), sliding ? .5 : p.sprinting ? -.22*run : -.06*run);
    o.body.position.set(0, PR + bob - (sliding ? 6 : 0), 0);
    o.body.scale.set(1 + st, (1 - st*.5)*(lose ? .88 : 1), 1 - st*.2);
    o.mat.emissive.setHex(p.input && p.input.kick ? 0x3a3a3a : p.stun > 0 ? 0x221100 : 0x000000);
    for (const sh of o.shoes){
      const s = sh.userData.s, lift = Math.max(0, Math.sin(v.walk + (s > 0 ? 0 : Math.PI)))*5*run;
      sh.position.set(s*8.5, 3.6 + lift, PR*.5 - lift*.6);
    }
    // yüz kartı: gövdenin kameraya bakan yüzünde
    camDir.copy(cam.position).sub(o.g.position).setY(cam.position.y - (PR + bob)).normalize();
    o.sprite.position.copy(o.g.position); o.sprite.position.y += PR + bob - (sliding ? 6 : 0);
    o.sprite.position.addScaledVector(camDir, PR*1.02).addScaledVector(camUp, 3.7);
    // yüz dokusu iki karede bir (oyuncular sırayla) yeniden çizilir: çizim ve ekran kartına yükleme ucuzlar
    if ((G3.frame + p.id) % 2 === 0) drawFaceSprite(p, o);
    // halkalar: topun sahibi takım renginde, özel şut/kombo hazırsa onun renginde
    const own = S.owner === p;
    o.halo.visible = own || !!p.armed;
    if (o.halo.visible){
      const info = p.armed && shotInfo(p.armed.type);
      o.halo.material.color.set(info ? info.color : TEAM_COL[p.team]);
      o.halo.material.opacity = .45 + .25*Math.sin(S.t*.25);
    }
    o.human.visible = p.ctrl !== 'ai'; o.human.rotation.z = S.t*.01;
    o.recv.visible = !!(S.pass && S.pass.to === p && S.phase !== 'goal');
    if (o.recv.visible){ o.recv.rotation.z = -S.t*.03; o.recv.userData.mat.opacity = .5 + .4*Math.sin(S.t*.3); }
    o.arrowPivot.visible = (p.ctrl !== 'ai' || own) && !goalPhase;
    o.arrowPivot.rotation.y = -p.dirA; o.arrow.position.x = PR + 12;
    o.arrow.material.opacity = own ? .95 : .55;
    const showG = p.sprinting && sp > 2.4 && !reduceMotion;  // depar yansımaları
    o.ghosts.forEach((m, i) => {
      m.visible = showG;
      if (showG){ m.position.set(o.g.position.x - p.vx/sp*(i + 1)*9, o.g.position.y + PR + bob, o.g.position.z - p.vy/sp*(i + 1)*9); m.scale.setScalar(1 - (i + 1)*.08); }
    });
  }
  // top
  const b = S.ball;
  setV(G3.ball.position, b.x, b.y, b.z + BR);
  const dx = b.x - G3.prevBall.x, dz = b.y - G3.prevBall.y, dist = Math.hypot(dx, dz);
  if (dist > 0 && dist < 60) G3.ball.quaternion.premultiply(tp.q.setFromAxisAngle(tp.ax.set(dz/dist, 0, -dx/dist), dist/BR));
  G3.prevBall.x = b.x; G3.prevBall.y = b.y;
  const fire = b.fire > 0;
  G3.ballMat.emissive.setHex(fire ? 0xff5a10 : 0x000000); G3.ballMat.emissiveIntensity = fire ? .55 : 0;
  G3.ballLight.intensity = fire ? 2.2 : 0; G3.ballLight.position.copy(G3.ball.position);
  G3.curveRing.visible = !!b.curve; G3.curveRing.position.copy(G3.ball.position); G3.curveRing.rotation.z += .3;
  const spd = Math.hypot(b.vx, b.vy), type = fire ? 'fuze' : b.curve ? 'falso' : b.z > 0 ? 'asirtma' : 'normal';
  if (!reduceMotion && move && (spd > 4.5 || type !== 'normal')) G3.trail.push({ x: b.x, y: b.y, z: b.z + BR, life: 18, type });
  // efekt noktaları: top izi, parçacıklar, konfeti, projektör parıltısı
  const P = G3.fx, GL = G3.glow; P.n = 0; GL.n = 0;
  const TC = { normal: [1,1,1], falso: [.78,.42,1], fuze: [1,.55,.15], asirtma: [.6,.88,1] };
  for (const t of G3.trail){
    if (!paused) t.life--;
    const k = t.life/18;
    putPoint(t.type === 'normal' ? P : GL, t.x - W/2, t.z, t.y - H/2, TC[t.type], k*(t.type === 'normal' ? .35 : .8), BR*2*(.4 + k*.8));
  }
  G3.trail = G3.trail.filter(t => t.life > 0);
  for (const q of FX.particles){
    if (move){ q.x += q.vx; q.y += q.vy; q.vx *= .95; q.vy *= .95; q.life--; if (q.h === undefined) q.h = 6 + Math.random()*18; }
    const c = parseCol(q.color);
    putPoint(P, q.x - W/2, q.h || 8, q.y - H/2, c, c[3]*Math.max(0, q.life/q.max), q.size*2.6);
  }
  FX.particles = FX.particles.filter(q => q.life > 0);
  for (const q of FX.confetti){
    const c = parseCol(q.color);
    putPoint(P, q.x - W/2, q.h + 2, q.y - H/2, c, Math.min(1, q.life/30)*(.6 + .4*Math.abs(Math.cos(q.flip))), q.size*1.6);
  }
  const night = (ARENAS[S.arena] || {}).id === 'gece';
  for (const l of G3.lamps) putPoint(GL, l.x, l.y, l.z, parseCol('#fff6d8'), night ? .85 : .35, 150);
  flushPoints(P); flushPoints(GL);
  // kar / parıltı
  const SN = G3.snow; SN.n = 0;
  const kar = S.weather === 'kar', rays = (ARENAS[S.arena] || {}).rays;
  const tint = kar ? [1, 1, 1] : (rays ? rays.split(',').map(x => x/255) : [1, .95, .8]);
  for (const f of G3.snowList){
    if (move){
      f.y -= f.v*(reduceMotion ? .4 : 1); f.x += Math.sin(S.t*.016 + f.ph)*.35 + (kar ? .15 : 0);
      if (f.y < 0){ f.y = 520; f.x = (Math.random() - .5)*1700; }
      if (f.y > 520) f.y = 0;
      if (f.x > 850) f.x = -850;
    }
    putPoint(SN, f.x, f.y, f.z, tint, kar ? f.a : f.a*(.3 + .7*Math.abs(Math.sin(S.t*.04 + f.ph))), f.s);
  }
  SN.pts.material.blending = kar ? T.NormalBlending : T.AdditiveBlending;
  flushPoints(SN);
  // seyirciler: golde gol atan takımın taraftarı zıplar, o takımın LED'leri yanıp söner
  const dm = G3.fanDummy, cheer = goalPhase ? S.goalInfo.team : -1;
  if (G3.frame % 2 === 0) G3.fans.forEach((f, i) => {
    let y = f.y;
    if (!reduceMotion){
      y += Math.abs(Math.sin(S.t*.05*f.sp + f.ph))*1.5;
      if (f.team === cheer) y += Math.abs(Math.sin(S.t*.22*f.sp + f.ph))*14;
    }
    dm.position.set(f.x, y, f.z); dm.updateMatrix(); G3.fanMesh.setMatrixAt(i, dm.matrix);
  });
  if (G3.frame % 2 === 0) G3.fanMesh.instanceMatrix.needsUpdate = true;
  G3.leds.forEach((m, i) => { m.emissiveIntensity = cheer === i ? .7 + .6*Math.abs(Math.sin(S.t*.3)) : .7; });
}

/* Otomatik kalite: ~2 sn'lik ortalama kare süresine bakılır. Çözünürlük düşürülmez (görüntü bulanıklaşıyordu).
   2 -> 1: gölgeler kapanır;  1 -> 0: seyirciler gizlenir, kar azalır.
   En düşük kademede de ortalama 33 ms'yi (30 kare/sn) aşarsa tooSlow işaretlenir; render.js 2B'ye geçer. */
function adaptQuality(now){
  if (G3.lastT){ const dt = now - G3.lastT; if (dt < 1000) G3.ft.push(dt); }
  G3.lastT = now;
  const span = G3.ft.reduce((a, b) => a + b, 0);
  if (span < 2000 || G3.ft.length < 8) return;     // ~2 sn'lik ölçüm biriksin
  const avg = span/G3.ft.length;
  G3.ft = [];
  if (avg <= 22) return;
  if (G3.quality === 0){ if (avg > 33) G3.tooSlow = true; return; }
  G3.quality--;
  if (G3.quality === 1){
    G3.renderer.shadowMap.enabled = false;
    G3.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  } else {
    G3.fanMesh.visible = false;
    G3.snowList.length = Math.min(G3.snowList.length, 300);
  }
  console.info('3B kalite düşürüldü:', G3.quality, '(ortalama kare ' + avg.toFixed(1) + ' ms)');
}
// 3B bu cihazda akıcı değil (en düşük kalitede de 30 kare/sn altı)
export const tooSlow = () => !!G3.tooSlow;

/* Tarayıcı 3B'yi ekran kartı olmadan, yazılımla mı çiziyor? (uzak masaüstü, sanal makine, kapalı donanım
   hızlandırma, eski sürücü). O zaman 3B oynanamayacak kadar yavaştır. */
export function softwareGL(){
  const gl = G3.renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  return /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i.test(name) ? name : '';
}
export const quality3D = () => G3.quality;

export function render3D(state, view, fx){
  adaptQuality(performance.now());
  S = state; V = view; FX = fx;
  const key = S.arena + '|' + S.weather;
  if (key !== G3.key){ G3.key = key; applyArena(); }
  if (SH.bgVersion !== G3.bgVersion){ G3.bgVersion = SH.bgVersion; G3.pitchTex.needsUpdate = true; }
  updateCamera();
  updateScene();
  G3.renderer.render(G3.scene, G3.camera);
}

// dünya noktasının 3B tuvaldeki yeri (CSS piksel)
const _pv = { v: null };
export function project(x, y, h){
  const v = _pv.v || (_pv.v = new T.Vector3());
  v.set(x - W/2, h, y - H/2).project(G3.camera);
  return { x: (v.x*.5 + .5)*G3.cw, y: (-v.y*.5 + .5)*G3.ch };
}
