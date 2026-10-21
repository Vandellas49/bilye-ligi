/* ---------- öğrenme modu ----------
   Yeni başlayanlar için adım adım dersler. Yerel bir maç durumu (2'ye 2, süresiz) üzerinde çalışır: her ders
   oyuncuları ve topu yerleştirir (kullanılmayanlar köşeye park edilir, ctrl 'h9' = girdisiz), hedef halkasını
   (S.tutTarget, 2B ve 3B çizer) koyar ve her adımda başarı koşulunu denetler. Metinler seçili tuş düzenine göre. */
import { W, H, B_DAMP } from '../shared/constants.js';
import { sfx } from './audio.js';

const kbd = k => `<kbd>${k}</kbd>`;
function keysOf(layout){
  return layout === 'klasik'
    ? { move: 'WASD ya da ok tuşları', sprint: kbd('Shift'), pass: kbd('Boşluk'), shot: kbd('Boşluk'), through: null, lob: null,
        hold: kbd('C'), press: null, tackle: kbd('Boşluk'), slide: kbd('V'), sp: [kbd('Q'), kbd('E'), kbd('R')], air: kbd('Boşluk') }
    : { move: 'ok tuşları', sprint: kbd('E'), pass: kbd('S'), shot: kbd('D'), through: kbd('W'), lob: kbd('A'),
        hold: kbd('Shift'), press: kbd('S'), tackle: kbd('D'), slide: kbd('A'), sp: [kbd('Z'), kbd('X'), kbd('C')], air: kbd('D') };
}

// oyuncular: [ben, arkadaş], [rakip1, rakip2]
const roster = S => {
  const me = S.players.find(p => p.ctrl === 'h1');
  return { me, mate: S.players.find(p => p.team === me.team && p !== me), opps: S.players.filter(p => p.team !== me.team) };
};
// ders konumları 1250x700 sahaya göre yazıldı, saha boyutuna oranlanır
const SX = W/1250, SY = H/700;
const tgt = (x, y, r) => ({ x: x*SX, y: y*SY, r });
const atTgt = (S, o, k = 1) => S.tutTarget && Math.hypot(o.x - S.tutTarget.x, o.y - S.tutTarget.y) < S.tutTarget.r*k;
function place(p, x, y, ctrl){ x *= SX; y *= SY; Object.assign(p, { x, y, vx: 0, vy: 0, stun: 0, slideT: 0, kickCd: 0, charge: 0, shot: null, kickLock: false, armed: null }); if (ctrl) p.ctrl = ctrl; }
function ballAt(S, x, y, owner = null){ x *= SX; y *= SY; Object.assign(S.ball, { x, y, vx: 0, vy: 0, z: 0, vz: 0, curve: 0, fire: 0 }); S.owner = owner; S.pass = null; }
function park(p, i){ place(p, (p.team === 0 ? 60 + i*40 : W - 60 - i*40)/SX, (i % 2 ? H - 30 : 30)/SY, 'h9'); }
function fresh(S){ S.phase = 'play'; S.goalInfo = null; S.goalT = 0; S.req = [null, null]; S.pass = null; S.tutTarget = null; }

// orta: top kanattan, oyuncunun biraz ötesine düşecek şekilde, kafa yüksekliğinde gelir
function cross(S, from, to){
  const vz = 6.2, air = 2*vz/.32, dx = to.x - from.x, dy = to.y - from.y, d = Math.hypot(dx, dy), L = d + 60;
  const sp = L*(1 - B_DAMP)/(1 - Math.pow(B_DAMP, air));
  Object.assign(S.ball, { x: from.x, y: from.y, vx: dx/d*sp, vy: dy/d*sp, z: .5, vz, curve: 0, fire: 0 });
  S.owner = null;
}

export function createTutorial(layout){
  const K = keysOf(layout), fifa = layout !== 'klasik';
  const steps = [
    { title: 'Hareket', text: `${K.move} ile oyuncunu yeşil halkaya götür.`,
      setup(S){ const { me, mate, opps } = roster(S); place(me, 300, 350); park(mate, 0); opps.forEach(park); ballAt(S, 40, H - 40); S.tutTarget = tgt(620, 230, 40); },
      check(S){ const { me } = roster(S); return atTgt(S, me, .95); } },
    { title: 'Depar', text: `${K.sprint} basılı tutarak depar at ve uzaktaki halkaya koş. Dayanıklılık çubuğu azalır, bırakınca dolar.`,
      setup(S, st){ const { me, mate, opps } = roster(S); place(me, 250, 500); me.sta = 1; park(mate, 0); opps.forEach(park); ballAt(S, 40, H - 40); S.tutTarget = tgt(1020, 220, 45); st.sprinted = false; },
      check(S, st){ const { me } = roster(S); if (me.sprinting) st.sprinted = true; return st.sprinted && atTgt(S, me); } },
    { title: 'Top sürme', text: `Topa yaklaş, top ayağına yapışır. Topu halkaya sür. ${K.hold} basılıyken topu daha sıkı tutar ve korursun.`,
      setup(S){ const { me, mate, opps } = roster(S); place(me, 300, 350); park(mate, 0); opps.forEach(park); ballAt(S, 420, 350); S.tutTarget = tgt(880, 220, 50); },
      check(S){ const { me } = roster(S); return S.owner === me && atTgt(S, S.ball); } },
    { title: 'Pas', text: `Arkadaşına doğru yön tuşuna bas ve ${K.pass} ile pas ver. Kısa basış yeter: pas yardımı gücü ve yönü ayarlar.`,
      setup(S){ const { me, mate, opps } = roster(S); place(me, 380, 380); place(mate, 720, 230, 'h9'); opps.forEach(park); ballAt(S, 416, 380, me); me.dirA = 0; S.tutTarget = tgt(720, 230, 34); },
      check(S){ const { mate } = roster(S); return S.owner === mate; } },
    fifa && { title: 'Ara pas', text: `Arkadaşın hücuma koşuyor. ${K.through} ile önündeki boşluğa ara pas at; bar ne kadar doluysa o kadar ileri gider.`,
      setup(S, st){ const { me, mate, opps } = roster(S); place(me, 350, 450); place(mate, 520, 250, 'ai'); opps.forEach(park); ballAt(S, 386, 450, me); me.dirA = 0; st.through = false; },
      check(S, st, ev){ const { me, mate } = roster(S); if (ev.some(e => e.type === 'kick' && e.id === me.id) && me.input.kind === 'through') st.through = true; return st.through && S.owner === mate; } },
    { title: 'Şut ve güç barı', text: `Kaleye doğru bas ve ${K.shot} basılı tut: güç barı dolar, bırakınca vurursun. Çapraz basarsan köşeye gider. Gol at!`,
      setup(S){ const { me, mate, opps } = roster(S); place(me, 820, 300); park(mate, 0); opps.forEach(park); ballAt(S, 856, 300, me); me.dirA = 0; },
      check(S, st, ev){ return ev.some(e => e.type === 'goal' && e.team === 0); } },
    { title: 'Kafa, vole, rövaşata', text: `Arkadaşın kanattan orta açacak. Top havadayken ve yanındayken ${K.air} bas: yüksekse kafa, alçaksa vole, kaleye sırtın dönükse rövaşata.` + (fifa ? ` Kendin orta açmak için ${K.lob}.` : ''),
      setup(S, st){ const { me, mate, opps } = roster(S); place(me, 1080, 400); me.dirA = 0; place(mate, 990, 70, 'h9'); opps.forEach(park); ballAt(S, 990, 106); st.next = S.t + 50; },
      check(S, st, ev){
        const { me } = roster(S);
        if (S.t >= st.next && S.phase === 'play'){ cross(S, { x: 990*SX, y: 100*SY }, { x: me.x + 10, y: me.y }); st.next = S.t + 170; }
        return ev.some(e => e.type === 'aerial' && e.id === me.id);
      } },
    { title: 'Özel şutlar', text: `${K.sp[0]} falso, ${K.sp[1]} füze, ${K.sp[2]} aşırtma. Bir özel şutla gol at. İki tuşa birlikte basarsan kombo olur (ör. ${K.sp[1]}+${K.sp[2]} havadan füze).`,
      setup(S, st){ const { me, mate, opps } = roster(S); place(me, 760, 330); park(mate, 0); opps.forEach(park); ballAt(S, 796, 330, me); me.dirA = 0; me.cd = { falso: 0, fuze: 0, asirtma: 0 }; st.special = false; },
      check(S, st, ev){ const { me } = roster(S); if (ev.some(e => e.type === 'special' && e.id === me.id)) st.special = true; if (ev.some(e => e.type === 'kick' && e.id === me.id) && !st.special) st.normal = true; return st.special && ev.some(e => e.type === 'goal' && e.team === 0); } },
    { title: 'Savunma', text: fifa
        ? `Rakip topla geliyor. ${K.press} basılı tut: baskı, oyuncun ona kendiliğinden kapanır. Yaklaşınca ${K.tackle} ayak koy ya da ${K.slide} ile kayarak gir. Topu kap!`
        : `Rakip topla geliyor. Ona yaklaş, ${K.tackle} ile müdahale et ya da ${K.slide} ile kayarak gir. Topu kap!`,
      setup(S){ const { me, mate, opps } = roster(S); place(me, 380, 350); park(mate, 0); place(opps[0], 820, 350, 'ai'); park(opps[1], 1); ballAt(S, 784, 350, opps[0]); opps[0].dirA = Math.PI; },
      check(S, st, ev){
        const { me } = roster(S);
        if (ev.some(e => e.type === 'goal' && e.team === 1)) st.retry = 'Gol yedin, tekrar dene';
        if (ev.some(e => e.type === 'foul' && e.id === me.id)) st.retry = 'Faul yaptın: arkadan değil, önden gir';
        return S.owner === me;
      } },
  ].filter(Boolean);

  const T = { steps, i: 0, st: {}, wait: 0, done: false };

  T.begin = (S, i = 0) => {
    T.i = i; T.st = {}; T.wait = 0;
    fresh(S);
    if (i >= steps.length){ T.done = true; render(); return; }
    steps[i].setup(S, T.st);
    render();
  };
  // her simülasyon adımından sonra
  T.update = (S, events) => {
    if (T.done) return;
    if (T.wait > 0){ if (--T.wait === 0) T.begin(S, T.i + 1); return; }
    const step = steps[T.i];
    if (step.check(S, T.st, events)){
      T.wait = 75; sfx.tackleWin();
      T.ok && T.ok(step.title);
    } else if (T.st.retry){
      const why = T.st.retry; T.st = {}; fresh(S); for (const p of S.players){ p.out = 0; p.yellow = 0; } step.setup(S, T.st); T.retry && T.retry(why);
    }
  };
  T.skip = S => T.begin(S, T.i + 1);

  // ekran üstündeki ders kutusu
  function render(){
    const box = document.getElementById('tutBox');
    if (!box) return;
    if (T.done){
      box.innerHTML = `<div class="tt">Tebrikler, dersler bitti!</div><div class="tx">Artık hazırsın. Tek maçta ya da turnuvada dene. 3B görünümde ${kbd('K')} ile kamerayı değiştirebilirsin.</div><div class="tb"><button class="btn small" type="button" data-tut="menu">Menüye dön</button></div>`;
    } else {
      const s = steps[T.i];
      box.innerHTML = `<div class="tn">Ders ${T.i + 1}/${steps.length}</div><div class="tt">${s.title}</div><div class="tx">${s.text}</div><div class="tb"><button class="btn ghost small" type="button" data-tut="skip">Atla</button><button class="btn ghost small" type="button" data-tut="menu">Çık</button></div>`;
    }
    box.hidden = false;
  }
  return T;
}
