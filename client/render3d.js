/* ---------- 3B çizim (Three.js r128) ----------
   Maç durumunu (S) okur, değiştirmez. Sahne: eğik yayın açısından kamera, gölgeli küre karakterler,
   3B kaleler ve file, tribünlerde seyirciler, LED panolar, projektörler, gerçek derinlikte kar/parıltı.
   İsimler, çubuklar, balonlar ve HUD 2B katmanda (render.js) üstte çizilir; project() ile yansıtılır.
   THREE global'i client/three.min.js ile gelir (render.js yükler). */
import { W, H, GH, GD, TOP, BOT, PR, BR, VIEW, TEAM_COL, TEAM_DARK, ARENAS, shotInfo, SKINS, KITS, kitById, keeperKit } from '../shared/constants.js';
import { visOf, reduceMotion, jumpOf, flipOf } from './effects.js';
import { isTouch, drawCrest } from './ui.js';
import { crowd } from './crowd.js';

const kitOf = (S, t) => kitById(S && S.kits ? S.kits[t] : null) || KITS[t];   // maçın formaları

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
  G3.camPos = new T.Vector3(0, 900, 600); G3.look = new T.Vector3(0, 0, 14); G3.yaw = -Math.PI/2; G3.pyaw = 0; G3.camMode = G3.camMode || 'genis';
  G3.hemi = new T.HemisphereLight(0xffffff, 0x444444, .65); sc.add(G3.hemi);
  const sun = G3.sun = new T.DirectionalLight(0xffffff, 1);
  sun.position.set(-320, 950, 420); sun.castShadow = true;
  sun.shadow.mapSize.set(light() ? 1024 : 2048, light() ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -1130, right: 1130, top: 780, bottom: -780, near: 100, far: 3200 });
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
  // reklam panoları: uzak panonun ve kale arkası panolarının iç yüzünde kayan reklamlar (golde GOL! yazısı)
  const ADW = 170;   // bir reklamın genişliği (dünya birimi)
  const adCv = document.createElement('canvas'); adCv.width = 256*SH.ads.length; adCv.height = 32;
  const ac = adCv.getContext('2d'); SH.ads.forEach((ad, i) => SH.drawAd(ac, ad, i*256, 0, 256, 32));
  G3.adTex = new T.CanvasTexture(adCv); G3.adTex.wrapS = T.RepeatWrapping;
  G3.goalCv = document.createElement('canvas'); G3.goalCv.width = 512; G3.goalCv.height = 32;
  G3.goalTex = new T.CanvasTexture(G3.goalCv); G3.goalTex.wrapS = T.RepeatWrapping; G3.goalTeam = -1;
  G3.adMat = new T.MeshBasicMaterial({ map: G3.adTex });
  G3.adPanels = [];
  const panel = (len, x, z, ry) => {
    const tex = G3.adTex.clone(); tex.needsUpdate = true; tex.wrapS = T.RepeatWrapping; tex.repeat.x = len/(ADW*SH.ads.length*1.4);
    const AH = 30;   // reklam panosu panodan yüksek (LED pano gibi)
    const m = new T.Mesh(new T.PlaneGeometry(len, AH), new T.MeshBasicMaterial({ map: tex }));
    m.position.set(x, AH/2 + 1, z); m.rotation.y = ry; g.add(m); G3.adPanels.push({ m, tex, len });
  };
  panel(x1 - x0, (x0 + x1)/2, z0 + 1.5, 0);                       // uzak pano
  panel(z1 - z0, x0 + 1.5, (z0 + z1)/2, Math.PI/2);               // sol kale arkası
  panel(z1 - z0, x1 - 1.5, (z0 + z1)/2, -Math.PI/2);              // sağ kale arkası
  // tribünler ve seyirciler
  G3.standMat = new T.MeshStandardMaterial({ color: 0x2a2236, roughness: .9 });
  G3.seatMat = new T.MeshStandardMaterial({ color: 0x3a3048, roughness: .9 });
  const fans = [], gap = light() ? 26 : 17;
  const ROWS = light() ? 4 : 6, RD = 26, RH = 15;
  const LZ = (z1 + 30) - (z0 + 10), LX = (x1 + 110) - (x0 - 110);
  G3.waveL = 2*LZ + LX;
  for (let r = 0; r < ROWS; r++){                          // uzak tribün
    const z = z0 - TB - 18 - r*RD, h = 12 + r*RH;
    box(x1 - x0 + 260, h, RD, (x0 + x1)/2, h/2, z, r % 2 ? G3.seatMat : G3.standMat);
    for (let x = x0 - 110; x <= x1 + 110; x += gap){
      if (Math.random() < .12) continue;
      fans.push({ x: x + (Math.random() - .5)*5, y: h + 7, z: z + (Math.random() - .5)*4, team: x < 0 ? 0 : 1, mix: true, kind: 'far', u: LZ + (x - (x0 - 110)) });
    }
  }
  for (const side of [0, 1]){                              // kale arkası tribünleri: o takımın taraftarı
    for (let r = 0; r < (light() ? 3 : 4); r++){
      const x = side ? x1 + TB + 18 + r*RD : x0 - TB - 18 - r*RD, h = 10 + r*RH;
      box(RD, h, z1 - z0 + 40, x, h/2, (z0 + z1)/2 + 20, r % 2 ? G3.seatMat : G3.standMat);
      for (let z = z0 + 10; z <= z1 + 30; z += gap){
        if (Math.random() < .1) continue;
        fans.push({ x: x + (Math.random() - .5)*4, y: h + 7, z: z + (Math.random() - .5)*5, team: side, mix: false, kind: 'end', u: side ? LZ + LX + (z - (z0 + 10)) : (z1 + 30) - z });
      }
    }
  }
  // seyirci: takımının formasını giymiş gövde + ten renginde baş (renkler applyKits'te formaya göre)
  const bodyGeo = new T.SphereGeometry(7.5, 10, 8); bodyGeo.scale(1, 1.3, .9);
  const inst = new T.InstancedMesh(bodyGeo, new T.MeshStandardMaterial({ roughness: .6, emissive: 0x161616 }), fans.length);
  const heads = new T.InstancedMesh(new T.SphereGeometry(4.6, 8, 6), new T.MeshStandardMaterial({ roughness: .7 }), fans.length);
  const c = new T.Color();
  fans.forEach((f, i) => {
    f.ph = Math.random()*6.28; f.sp = .6 + Math.random()*.8;
    f.r = Math.random();   // forma rengi seçimi (c1/c2), karışık tribünde başka renk
    c.set(SKINS[Math.random()*SKINS.length|0]); heads.setColorAt(i, c);
    c.set('#ffffff'); inst.setColorAt(i, c);   // renk tamponu ilk çizimden önce olmalı (yoksa gölgelendirici renksiz derlenir)
  });
  inst.receiveShadow = true; g.add(inst); g.add(heads);
  G3.fans = fans; G3.fanMesh = inst; G3.fanHeads = heads; G3.fanDummy = new T.Object3D(); G3.kitKey = '';
  // kollar (forma kolu): coşkuda havaya, kaçan pozisyonda başa; zayıf cihazda yok
  G3.fanArms = null;
  if (!light()){
    const armGeo = new T.CylinderGeometry(1.8, 1.5, 11, 6); armGeo.translate(0, 5.5, 0);   // dönme noktası omuz
    G3.fanArms = new T.InstancedMesh(armGeo, new T.MeshStandardMaterial({ roughness: .6, emissive: 0x161616 }), fans.length*2);
    for (let i = 0; i < fans.length*2; i++) G3.fanArms.setColorAt(i, c.set('#ffffff'));
    g.add(G3.fanArms);
  }
  // bayraklar: sopa + dalgalanan bez (forma renkleri)
  const flagFans = fans.filter(() => Math.random() < (light() ? .03 : .055));
  flagFans.forEach((f, i) => { f.flagI = i; f.fc = Math.random() < .55; });
  const poleGeo = new T.CylinderGeometry(.6, .6, 30, 5); poleGeo.translate(0, 15, 0);
  G3.poles = new T.InstancedMesh(poleGeo, new T.MeshStandardMaterial({ color: 0xd8d0c0, roughness: .6 }), Math.max(1, flagFans.length));
  const flagGeo = new T.PlaneGeometry(20, 12, 4, 1); flagGeo.translate(10, 0, 0);
  G3.flags = new T.InstancedMesh(flagGeo, new T.MeshStandardMaterial({ roughness: .8, side: T.DoubleSide, emissive: 0x1c1c1c }), Math.max(1, flagFans.length));
  for (let i = 0; i < flagFans.length; i++) G3.flags.setColorAt(i, c.set('#ffffff'));
  g.add(G3.poles, G3.flags);
  G3.flagFans = flagFans;
  // kale arkası tribünlerin önünde, sahaya bakan dev pankart: takım adı, arma, forma renkleri (applyKits çizer)
  G3.banners = [0, 1].map(t => {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 192;
    const tex = new T.CanvasTexture(cv);
    const m = new T.Mesh(new T.PlaneGeometry(320, 60), new T.MeshStandardMaterial({ map: tex, roughness: .8, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: .25 }));
    m.position.set(t ? x1 + TB + 18 - RD/2 - 1 : x0 - TB - 18 + RD/2 + 1, 46, (z0 + z1)/2); m.rotation.y = t ? -Math.PI/2 : Math.PI/2; g.add(m);
    return { cv, tex, m };
  });
  G3.flareTeam = -1; G3.flareFans = []; G3.smoke = [];
  // öğrenme modu hedef halkası
  G3.tutRing = new T.Mesh(new T.RingGeometry(.86, 1, 48), new T.MeshBasicMaterial({ color: 0x50ff8c, transparent: true, opacity: .85, depthWrite: false, side: T.DoubleSide }));
  G3.tutRing.rotation.x = -Math.PI/2; G3.tutRing.visible = false; G3.scene.add(G3.tutRing);
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
      (G3.postRings || (G3.postRings = [[], []]))[s].push(ring);
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
/* Forma dokusu (küre UV'si: u çevre, v yukarıdan aşağı). Formaya göre önbellekli. */
const kitTex = new Map();
function kitTexture(kit){
  if (kitTex.has(kit.id)) return kitTex.get(kit.id);
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  // desen gövdenin tamamında (yüz kartı önü kapatır, forma yanlarda ve altta görünür); ince beyaz yaka, en altta şort
  const c = cv.getContext('2d'), h = 128, collar = h*(1 - .44), shorts = h*(1 - .14);
  c.fillStyle = kit.c1; c.fillRect(0, 0, 256, h);
  c.fillStyle = kit.c2;
  if (kit.pat === 'serit') for (let x = 0; x < 256; x += 16) c.fillRect(x, 0, 8, h);
  else if (kit.pat === 'yarim') c.fillRect(0, 0, 128, h);
  else if (kit.pat === 'yatay') for (const y of [collar + 14, collar + 34, collar - 26]) c.fillRect(0, y, 256, 8);
  c.fillStyle = '#ffffff'; c.fillRect(0, collar, 256, 4);
  c.fillStyle = kit.dark; c.fillRect(0, shorts, 256, h - shorts);
  const tex = new T.CanvasTexture(cv);
  kitTex.set(kit.id, tex);
  return tex;
}

function makePlayer(p){
  const g = new T.Group();
  // gövde: tepe takım rengi, altta beyaz şerit ve koyu forma (köşe renkleriyle)
  const geo = new T.SphereGeometry(PR, 36, 26);
  const mat = new T.MeshStandardMaterial({ map: kitTexture(p.kitOverride || (p.keeper ? keeperKit(S.kits, p.team) : kitOf(S, p.team))), roughness: .4, metalness: .05, emissive: 0x000000 });
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
  const halo = new T.Mesh(new T.RingGeometry(PR + 4, PR + 9, 48), new T.MeshBasicMaterial({ color: TEAM_COL[Math.max(0, p.team)], transparent: true, opacity: .6, depthWrite: false }));
  halo.rotation.x = -Math.PI/2; halo.position.y = .7; g.add(halo);
  const human = dashedRing(PR + 10, 2.4, 0xffffff, 12); g.add(human);
  const recv = dashedRing(PR + 15, 3, 0xffffff, 16); g.add(recv);
  const shp = new T.Shape(); shp.moveTo(7, 0); shp.lineTo(-4, -6); shp.lineTo(-4, 6); shp.closePath();
  const arrow = new T.Mesh(new T.ShapeGeometry(shp), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .9, depthWrite: false }));
  arrow.rotation.x = -Math.PI/2; arrow.position.y = 1;
  const arrowPivot = new T.Group(); arrowPivot.add(arrow); g.add(arrowPivot);
  const ghostMat = new T.MeshBasicMaterial({ color: TEAM_COL[Math.max(0, p.team)], transparent: true, opacity: .16, depthWrite: false });
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
  const kit = p.kitOverride || (p.keeper ? keeperKit(S.kits, p.team) : kitOf(S, p.team));
  if (kit.crest) SH.drawCrest(c, kit.crest, p.x - 10, p.y + 12.6, 3.4);   // göğüste arma
  SH.drawHairBack(c, p, p.y, r);
  SH.drawFace(c, p, p.y - 2, v);
  SH.drawAccessory(c, p, p.y, r);
  SH.drawGesture(c, p, p.y, r);
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
    G3.snowList.push({ x: (Math.random() - .5)*2500, y: Math.random()*520, z: (Math.random() - .5)*1680 - 160,
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
  const cam = G3.camera, fov = cam.fov;
  cam.fov = 36; cam.aspect = cw/ch; cam.updateProjectionMatrix();
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
  cam.fov = fov; cam.updateProjectionMatrix();
  const uScale = ch*d/(2*Math.tan(cam.fov*Math.PI/360));
  for (const P of [G3.fx, G3.glow, G3.snow]) P.pts.material.uniforms.uScale.value = uScale;
}

/* Kamera modları. G3.yaw: ekranın "yukarı"sının sahadaki yönü (açı, sim koordinatı); main.js girdiyi buna göre döndürür.
   genis: stadyum (sabit açı, topu hafif izler) · tv: yandan yayın kamerası · dinamik: hücum yönünün arkasından
   oyuncu: kontrol edilen oyuncunun arkasından (hareket yönünü yavaşça izler) · ust: kuşbakışı */
export const CAMERAS = ['genis', 'tv', 'dinamik', 'oyuncu', 'ust'];
export function setCameraMode(m){
  if (!CAMERAS.includes(m)) m = 'genis';
  G3.camMode = m;
  if (!G3.camera) return;
  G3.camera.fov = m === 'oyuncu' ? 55 : m === 'dinamik' ? 48 : 36; G3.camera.updateProjectionMatrix();
  if (G3.fx) for (const P of [G3.fx, G3.glow, G3.snow]) P.pts.material.uniforms.uScale.value = G3.ch*Math.min(G3.dpr || 1, light() ? 1.25 : 1.5)/(2*Math.tan(G3.camera.fov*Math.PI/360));
}
export const cameraYaw = () => G3.yaw ?? -Math.PI/2;
const lerpAng = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a))*k;

function updateCamera(){
  const cam = G3.camera, b = S.ball, mode = G3.camMode || 'genis';
  const goal = S.phase === 'goal' && S.goalInfo;
  if (mode !== 'genis' && !goal && S.players.length){
    const me = S.players.find(p => p.ctrl === 'h1') || null, attack = me && me.team === 1 ? -1 : 1;
    const bX = b.x - W/2, bZ = b.y - H/2;
    let px, py, pz, lx, ly, lz, yaw = -Math.PI/2;
    if (mode === 'tv'){
      lx = bX*.85; ly = 0; lz = bZ*.35; px = lx; py = 330; pz = lz + 780;
    } else if (mode === 'ust'){
      lx = bX*.55; ly = 0; lz = bZ*.3; px = lx; py = 1650; pz = lz + 40;
    } else if (mode === 'dinamik'){
      yaw = attack > 0 ? 0 : Math.PI;
      const dx = Math.cos(yaw), dz = Math.sin(yaw);
      lx = bX + dx*170; ly = 0; lz = bZ*.85; px = bX - dx*470; py = 330; pz = bZ*.85;
    } else {
      // oyuncu: kontrol edilen oyuncunun (yoksa topun) arkasından, hareket yönüne doğru
      const p = me || S.owner;
      const ox = p ? p.x : b.x, oy = p ? p.y : b.y, sp = p ? Math.hypot(p.vx, p.vy) : 0;
      if (p && sp > .6) G3.pyaw = lerpAng(G3.pyaw, Math.atan2(p.vy, p.vx), reduceMotion ? 1 : .035);
      else if (!p) G3.pyaw = attack > 0 ? 0 : Math.PI;
      yaw = G3.pyaw;
      const dx = Math.cos(yaw), dz = Math.sin(yaw), oX = ox - W/2, oZ = oy - H/2;
      px = oX - dx*380; py = 235; pz = oZ - dz*380; lx = oX + dx*320; ly = 0; lz = oZ + dz*320;   // arkadan ve yukarıdan (uzaklık 380, yükseklik 235)
    }
    const k = reduceMotion ? 1 : mode === 'oyuncu' ? .12 : .07;
    G3.camPos.x += (px - G3.camPos.x)*k; G3.camPos.y += (py - G3.camPos.y)*k; G3.camPos.z += (pz - G3.camPos.z)*k;
    G3.look.x += (lx - G3.look.x)*k; G3.look.y += (ly - G3.look.y)*k; G3.look.z += (lz - G3.look.z)*k;
    G3.yaw = yaw;
    cam.position.copy(G3.camPos);
    if (FX.shake > 0){
      cam.position.x += (Math.random()*2 - 1)*FX.shake*.6; cam.position.y += (Math.random()*2 - 1)*FX.shake*.4;
      FX.shake *= .88; if (FX.shake < .3) FX.shake = 0;
    }
    cam.up.set(0, 1, 0);
    if (mode === 'ust') cam.up.set(0, 0, -1);
    cam.lookAt(G3.look);
    // geniş kameraya dönünce yumuşak geçsin
    G3.target.copy(G3.look); G3.zoom = Math.max(.6, Math.min(1.4, G3.camPos.distanceTo(G3.look)/(G3.baseDist*1.03)));
    return;
  }
  G3.yaw = -Math.PI/2; cam.up.set(0, 1, 0);
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
  G3.camPos.copy(cam.position); G3.look.copy(G3.target);
}

/* ---------- her kare ---------- */
function syncPlayers(){
  const all = FX.ref ? [...S.players, FX.ref] : S.players;   // hakem de (yalnızca görsel)
  const live = new Set(all);
  for (const [p, o] of G3.players){
    if (live.has(p)) continue;
    G3.scene.remove(o.g); G3.scene.remove(o.sprite); o.ghosts.forEach(m => G3.scene.remove(m));
    o.body.geometry.dispose(); o.tex.dispose(); G3.players.delete(p);
  }
  for (const p of all) if (!G3.players.has(p)) G3.players.set(p, makePlayer(p));
}

const WAVE_CYCLE = 2100, WAVE_SPEED = 6.5, WAVE_W = 85;   // ~35 sn'de bir, ~10 sn sürer; dalga genişliği (birim)

// pankart: forma deseni, ortada koyu şerit üstünde takım adı, solda arma
function drawBanner(bn, kit, name){
  const c = bn.cv.getContext('2d'), w = bn.cv.width, h = bn.cv.height;
  c.fillStyle = kit.c1; c.fillRect(0, 0, w, h);
  c.fillStyle = kit.c2;
  if (kit.pat === 'serit') for (let x = 0; x < w; x += 64) c.fillRect(x, 0, 32, h);
  else if (kit.pat === 'yarim') c.fillRect(w/2, 0, w/2, h);
  else if (kit.pat === 'yatay') for (let y = 12; y < h; y += 48) c.fillRect(0, y, w, 18);
  c.fillStyle = 'rgba(10,8,20,.72)'; c.fillRect(0, h*.2, w, h*.6);
  c.font = '900 92px Figtree, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  let fs = 92; while (c.measureText(name.toUpperCase()).width > w - 260 && fs > 40){ fs -= 6; c.font = `900 ${fs}px Figtree, system-ui, sans-serif`; }
  c.lineWidth = 8; c.strokeStyle = 'rgba(0,0,0,.6)'; c.strokeText(name.toUpperCase(), w/2 + 50, h/2 + 4);
  c.fillStyle = '#ffffff'; c.fillText(name.toUpperCase(), w/2 + 50, h/2 + 4);
  if (kit.crest) drawCrest(c, kit.crest, 110, h/2, 78);
  else { c.fillStyle = kit.c1; c.beginPath(); c.arc(110, h/2, 60, 0, Math.PI*2); c.fill(); c.lineWidth = 8; c.strokeStyle = '#ffffff'; c.stroke(); }
  bn.tex.needsUpdate = true;
}

/* Maçın formaları değişince: seyirci formaları, LED'ler, direk halkaları */
function applyKits(){
  const key = (S.kits ? S.kits.join() : '') + '|' + (S.teamNames || []).join();
  if (key === G3.kitKey) return;
  G3.kitKey = key;
  const kits = [kitOf(S, 0), kitOf(S, 1)], c = new T.Color();
  const others = ['#f05a5a', '#ffffff', '#7c6cf0', '#5bd18b', '#ff9f43', '#e86fb5'];
  G3.fans.forEach((f, i) => {
    const k = kits[f.team];
    // karışık (uzak) tribünde %25 başka renk; formanın iki rengi desen oranında
    const hex = f.mix && f.r > .75 ? others[(f.r*97|0) % others.length] : (k.pat !== 'duz' && (f.r*13 % 1) < .45 ? k.c2 : k.c1);
    c.set(hex); G3.fanMesh.setColorAt(i, c);
  });
  if (G3.fanMesh.instanceColor) G3.fanMesh.instanceColor.needsUpdate = true;
  if (G3.fanArms){
    G3.fans.forEach((f, i) => { G3.fanMesh.getColorAt(i, c); G3.fanArms.setColorAt(i*2, c); G3.fanArms.setColorAt(i*2 + 1, c); });
    G3.fanArms.instanceColor.needsUpdate = true;
  }
  G3.flagFans.forEach(f => { const k = kits[f.team]; G3.flags.setColorAt(f.flagI, c.set(f.fc || k.c2 === k.c1 ? k.c1 : k.c2)); });
  if (G3.flags.instanceColor) G3.flags.instanceColor.needsUpdate = true;
  G3.banners.forEach((bn, t) => drawBanner(bn, kits[t], (S.teamNames || [])[t] || kits[t].name));
  G3.leds.forEach((m, i) => { m.color.set(kits[i].ui); m.emissive.set(kits[i].ui); });
  (G3.postRings || [[], []]).forEach((list, i) => list.forEach(r => r.material.color.set(kits[i].ui)));
}

function updateScene(){
  syncPlayers();
  applyKits();
  const tt = S.tutTarget;
  G3.tutRing.visible = !!tt;
  if (tt){ const k = tt.r*(1 + (reduceMotion ? 0 : Math.sin(S.t*.12)*.12)); G3.tutRing.position.set(tt.x - W/2, 1.2, tt.y - H/2); G3.tutRing.scale.set(k, k, k); }
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
    const lose = goalPhase && !p.ref && p.team !== S.goalInfo.team;
    let st = Math.min(.1, sp*.028) + (p.mood === 'kick' ? .07 : 0) + (p.sprinting ? .05 : 0);
    if (sliding) st = .3;
    // eğilme: depar öne, kayma geriye yatık; gol sevincinde dönerek zıplar
    const flip = flipOf(S, p);
    o.pivot.rotation.set(0, flip ? 0 : -va + (jump > 0 ? S.t*.15 : 0), flip ? -flip : sliding ? .5 : p.sprinting ? -.22*run : -.06*run);
    o.sprite.material.rotation = -flip;
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
    o.human.visible = p.ctrl === 'h1'; o.human.rotation.z = S.t*.01;
    o.recv.visible = !!(S.pass && S.pass.to === p && S.phase !== 'goal');
    if (o.recv.visible){ o.recv.rotation.z = -S.t*.03; o.recv.userData.mat.opacity = .5 + .4*Math.sin(S.t*.3); }
    o.arrowPivot.visible = (p.ctrl === 'h1' || own) && !goalPhase;
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
  // meşaleler: golde atan takımın tribününde ~12 seyirci yakar (ışık + takım renginde duman)
  const fTeam = S.phase === 'goal' && S.goalInfo ? S.goalInfo.team : -1;
  if (fTeam !== G3.flareTeam){
    G3.flareTeam = fTeam;
    const pool = fTeam < 0 ? [] : G3.fans.filter(f => f.team === fTeam);
    G3.flareFans = [];
    for (let i = 0; i < 12 && pool.length; i++) G3.flareFans.push(pool[Math.random()*pool.length|0]);
  }
  if (G3.fanMesh.visible){
    const smokeCol = parseCol(TEAM_COL[Math.max(0, fTeam)]);
    for (const f of G3.flareFans){
      const fl = .7 + Math.random()*.3;
      putPoint(GL, f.x, f.y + 30, f.z, [1, .3 + Math.random()*.25, .08], fl, 16 + Math.random()*10);
      if (move && !reduceMotion && G3.smoke.length < 260 && Math.random() < .5)
        G3.smoke.push({ x: f.x + (Math.random() - .5)*4, y: f.y + 32, z: f.z, vx: (Math.random() - .5)*.4, vy: .6 + Math.random()*.4, life: 100, c: Math.random() < .6 ? smokeCol : [1, .35, .2] });
    }
  }
  for (const s of G3.smoke){
    if (move){ s.x += s.vx; s.y += s.vy; s.vy *= .99; s.life--; }
    const k = s.life/100;
    putPoint(P, s.x, s.y, s.z, s.c, k*.35, 14 + (1 - k)*40);
  }
  G3.smoke = G3.smoke.filter(s => s.life > 0);
  flushPoints(P); flushPoints(GL);
  // kar / parıltı
  const SN = G3.snow; SN.n = 0;
  const kar = S.weather === 'kar', rays = (ARENAS[S.arena] || {}).rays;
  const tint = kar ? [1, 1, 1] : (rays ? rays.split(',').map(x => x/255) : [1, .95, .8]);
  for (const f of G3.snowList){
    if (move){
      f.y -= f.v*(reduceMotion ? .4 : 1); f.x += Math.sin(S.t*.016 + f.ph)*.35 + (kar ? .15 : 0);
      if (f.y < 0){ f.y = 520; f.x = (Math.random() - .5)*2500; }
      if (f.y > 520) f.y = 0;
      if (f.x > 1250) f.x = -1250;
    }
    putPoint(SN, f.x, f.y, f.z, tint, kar ? f.a : f.a*(.3 + .7*Math.abs(Math.sin(S.t*.04 + f.ph))), f.s);
  }
  SN.pts.material.blending = kar ? T.NormalBlending : T.AdditiveBlending;
  flushPoints(SN);
  // seyirciler: golde gol atan takımın taraftarı zıplar, o takımın LED'leri yanıp söner
  const dm = G3.fanDummy, cheer = goalPhase ? S.goalInfo.team : -1;
  // meksika dalgası: WAVE_CYCLE tickte bir, tribünlerin çevresinde WAVE_SPEED hızla dolaşır
  const wt = S.t % WAVE_CYCLE, wave = !reduceMotion && S.mode !== 'end' ? wt*WAVE_SPEED - 120 : -1e9;
  const waving = wave > -120 && wave < G3.waveL + 120;
  if (G3.frame % 2 === 0 && G3.fanMesh.visible) G3.fans.forEach((f, i) => {
    let y = f.y, up = 0;
    if (!reduceMotion){
      y += Math.abs(Math.sin(S.t*.05*f.sp + f.ph))*(1.5 + crowd.ex[f.team]*7);
      if (f.team === cheer) y += Math.abs(Math.sin(S.t*.22*f.sp + f.ph))*14;
      else if (cheer >= 0) y -= 3;                                                    // gol yiyen tribün çöker
      if (crowd.ooh > 0 && crowd.oohTeam === f.team) y += 6;                          // kaçan pozisyonda ayağa kalkar
      if (crowd.oleT[f.team] > 0) y += Math.sin((40 - crowd.oleT[f.team])/40*Math.PI)*9;   // olé: hep birlikte
      if (waving){ const d = Math.abs(f.u - wave)/WAVE_W; if (d < 1){ up = (1 - d*d); y += up*16; } }
    }
    dm.position.set(f.x, y + 2, f.z); dm.scale.set(1, 1 + up*.5, 1); dm.updateMatrix(); G3.fanMesh.setMatrixAt(i, dm.matrix);
    dm.position.y = y + 14 + up*5; dm.scale.set(1, 1, 1); dm.updateMatrix(); G3.fanHeads.setMatrixAt(i, dm.matrix);
    // kol açısı (dikeyden dışa): aşağı sarkık, havada, başta
    const ex = crowd.ex[f.team], pump = reduceMotion ? 0 : Math.sin(S.t*.3*f.sp + f.ph)*.25;
    let ang = Math.PI - .28;
    if (cheer === f.team) ang = .3 + pump;
    else if (cheer >= 0) ang = Math.PI - .12;
    else if (crowd.ooh > 0 && crowd.oohTeam === f.team) ang = 1.0;
    else if (crowd.oleT[f.team] > 0 || up > .3) ang = .22;
    else if (ex > .55 && Math.sin(S.t*.06*f.sp + f.ph) > .2) ang = .45 + pump*.8;
    if (G3.fanArms) for (const s of [-1, 1]){
      if (f.kind === 'far'){ dm.position.set(f.x + s*6.5, y + 9 + up*3, f.z); dm.rotation.set(0, 0, -s*ang); }
      else { dm.position.set(f.x, y + 9 + up*3, f.z + s*6.5); dm.rotation.set(s*ang, 0, 0); }
      dm.updateMatrix(); G3.fanArms.setMatrixAt(i*2 + (s > 0 ? 1 : 0), dm.matrix);
    }
    dm.rotation.set(0, 0, 0);
    if (f.flagI !== undefined){
      const px = f.x + (f.kind === 'far' ? 7 : 0), pz = f.z + (f.kind === 'far' ? 0 : 7), py = y + 6 + up*3;
      dm.position.set(px, py, pz); dm.updateMatrix(); G3.poles.setMatrixAt(f.flagI, dm.matrix);
      const spd = cheer === f.team ? .32 : .07 + ex*.18, amp = reduceMotion ? 0 : cheer === f.team ? .9 : .35 + ex*.4;
      dm.position.set(px, py + 25, pz); dm.rotation.set(0, (f.kind === 'far' ? 0 : Math.PI/2) + Math.sin(S.t*spd + f.ph)*amp, 0);
      dm.updateMatrix(); G3.flags.setMatrixAt(f.flagI, dm.matrix); dm.rotation.set(0, 0, 0);
    }
  });
  dm.scale.set(1, 1, 1);
  if (G3.frame % 2 === 0){
    G3.fanMesh.instanceMatrix.needsUpdate = true; G3.fanHeads.instanceMatrix.needsUpdate = true;
    if (G3.fanArms) G3.fanArms.instanceMatrix.needsUpdate = true;
    G3.poles.instanceMatrix.needsUpdate = true; G3.flags.instanceMatrix.needsUpdate = true;
  }
  G3.leds.forEach((m, i) => { m.emissiveIntensity = cheer === i ? .7 + .6*Math.abs(Math.sin(S.t*.3)) : .7; });
  // reklam panoları: kayar; golde atan takımın renginde GOL!
  if (G3.adPanels){
    if (cheer !== G3.goalTeam){
      G3.goalTeam = cheer;
      if (cheer >= 0){
        const c = G3.goalCv.getContext('2d'), col = TEAM_COL[cheer];
        c.fillStyle = '#0d0a14'; c.fillRect(0, 0, 512, 32);
        c.font = '900 24px Figtree, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = col;
        for (let i = 0; i < 4; i++) c.fillText('GOL!', 64 + i*128, 17);
        G3.goalTex.needsUpdate = true;
      }
      for (const pnl of G3.adPanels){
        if (cheer >= 0){ const t = G3.goalTex.clone(); t.needsUpdate = true; t.wrapS = T.RepeatWrapping; t.repeat.x = pnl.len/400; pnl.m.material.map = t; }
        else pnl.m.material.map = pnl.tex;
        pnl.m.material.needsUpdate = true;
      }
    }
    if (move && !reduceMotion) for (const pnl of G3.adPanels){ const t = pnl.m.material.map; t.offset.x = (t.offset.x + (cheer >= 0 ? .006 : .0007)) % 1; }
  }
}

/* Otomatik kalite: ~2 sn'lik ortalama kare süresine bakılır. Çözünürlük düşürülmez (görüntü bulanıklaşıyordu).
   2 -> 1: gölgeler kapanır;  1 -> 0: seyirciler gizlenir, kar azalır.
   En düşük kademede de ortalama 33 ms'yi (30 kare/sn) aşarsa tooSlow işaretlenir; render.js 2B'ye geçer. */
// ?3dsabit: otomatik kalite kapalı (yalnızca deneme ve test için; yavaş test tarayıcısında seyirciler gizlenmesin)
const FIXED_QUALITY = new URLSearchParams(location.search).has('3dsabit');
function adaptQuality(now){
  if (FIXED_QUALITY) return;
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
    G3.fanMesh.visible = false; G3.fanHeads.visible = false;
    for (const m of [G3.fanArms, G3.poles, G3.flags]) if (m) m.visible = false;
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
  if (v.z > 1) return { x: -1e4, y: -1e4 };   // kameranın arkasında
  return { x: (v.x*.5 + .5)*G3.cw, y: (-v.y*.5 + .5)*G3.ch };
}
