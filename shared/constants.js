/* ---------- sabitler ----------
   Hem tarayıcıda hem sunucuda kullanılır; DOM'a dokunmaz. */

export const W = 1250, H = 700;           // saha (paslaşmaya yer olsun diye 1000x560'tan büyütüldü)
export const GH = 220, GD = 48;           // kale ağzı ve derinliği
export const CENTER_R = 100;              // orta yuvarlak (başlama vuruşunda rakip dışında bekler)
export const TOP = H/2 - GH/2, BOT = H/2 + GH/2;
export const PR = 22, BR = 12, POST_R = 7;
export const MARGIN = 38;
export const VIEW = { x: -GD - MARGIN, y: -MARGIN, w: W + 2*(GD + MARGIN), h: H + 2*MARGIN };   // oyuncuların gidebildiği alan
// 2B çizim alanı: VIEW + üstte ve altta seyirci tribünü (yalnızca istemci çizimi; simülasyon VIEW kullanır)
export const STAND = 34;
export const SCREEN = { x: VIEW.x, y: VIEW.y - STAND, w: VIEW.w, h: VIEW.h + 2*STAND };
export const P_ACC = 0.135, P_ACC_KICK = 0.09, P_DAMP = 0.96, B_DAMP = 0.99;
export const KICK = 6.4, KICK_RANGE = 5, WALL_REST = .7;
// depar: tick başına dayanıklılık harcaması (1/değer = tam dolu bardan tükenene kadar tick)
export const SPRINT_DRAIN = .0041;        // topsuz ~4 sn
export const SPRINT_DRAIN_BALL = .005;    // top ayaktayken ~3,3 sn
// kayarak müdahale
export const SLIDE_SPEED = 6.5;        // kaymaya başlarken hız (normal azami hız ~3,4)
export const SLIDE_TICKS = 20;         // kayma süresi (~0,33 sn, ~100 birim)
export const SLIDE_REACH = 10;         // topa bu kadar yaklaşınca değmiş sayılır
export const SLIDE_POKE = 3.6;         // değince topun itilme hızı
export const SLIDE_CD = 150;           // yeniden kaymak için bekleme (~2,5 sn)
export const SLIDE_GETUP = 16;         // topa değdiyse yerden kalkma (tick)
export const SLIDE_MISS_GETUP = 32;    // ıskaladıysa yerden kalkma (tick)
export const GOAL_PAUSE = 180;
// faul: serbest vuruşta rakiplerin uzak durduğu mesafe, oyunun kendiliğinden başladığı süre; kırmızı kartta dışarıda kalma
export const FK_DIST = 110, FK_TICKS = 300, SENDOFF_TICKS = 30*60;
// gol tekrarı (settings.replay): golden önce/sonra kaç tick oynatılır, canlı sevinçten sonra başlar, hız
export const REPLAY_BEFORE = 180, REPLAY_AFTER = 15, REPLAY_DELAY = 100, REPLAY_SPEED = .6;
export const GOAL_PAUSE_REPLAY = REPLAY_DELAY + Math.ceil((REPLAY_BEFORE + REPLAY_AFTER)/REPLAY_SPEED) + 30;
export const REPLAY_SKIP_AFTER = 40;   // golden bu kadar tick sonra geçilebilir (golü atan tuşu basılı tutuyorsa hemen geçmesin)        // golden sonra sevinç ve yeniden başlama arası (tick, 3 sn)
// pas yardımı (insan oyuncu): basılan yöne yakın arkadaşa, koştuğu yere, mesafeye uygun güçle
export const PASS_CONE = .8;           // basılan yönden en fazla bu kadar sapan arkadaşa kilitlenir (rad, ~46°; 8 yönlü ok tuşlarında her yöne yeter)
export const SHOT_CONE = .9;           // şut yardımı: basılan yön kaleye bu kadar yakınsa (rad, ~52°) top kale ağzına gider
export const SHOT_CONE_WIDE = 1.35;    // şut tuşunda (FIFA D) daha geniş: kaleye bakan hemen her yön (~77°)
export const SHOT_RANGE = 800;         // şut yardımının çalıştığı en uzak mesafe (kale çizgisine)
export const PASS_ARRIVE = 2.4;        // top arkadaşa bu hızla varacak şekilde atılır
export const PASS_POWER_MIX = .25;     // güç barının yardımlı pas gücüne etkisi (0: hiç, 1: tamamen bar)
export const SHOT_OVERRIDE = .6;       // kaleye nişan alıp bar bu kadar doluysa pas değil şut sayılır
export const THROUGH_LEAD = 110;       // ara pas: arkadaşın önüne en az bu kadar (güç barı +THROUGH_BAR'a kadar uzatır)
export const THROUGH_BAR = 110;
export const LOB_CONE = 1.2, THROUGH_CONE = 1.0;
// havadaki top: bu yükseklik aralığında vurulabilir (kafa üstte, vole/rövaşata altta), yatay erişim
export const AIR_MIN = 12, AIR_MAX = 48, AIR_HEAD = 24, AIR_REACH = 12;
export const CROSS_ZONE = 420;   // orta: hedef rakip kaleye bu kadar yakınsa top arkadaşa kafa yüksekliğinde gelir   // orta ve ara paste arkadaş arama açısı (daha geniş)
// şut güç barı (insan oyuncu): şut tuşu basılı tutuldukça dolar, bırakınca vurur
// insan oyuncu için daha geniş erişim: vurma ve top alma mesafesi (yüzeyler arası), hız sınırı, bırakınca vuruşun bekleme süresi
export const HUMAN_REACH = 12, HUMAN_GRAB = 11, HUMAN_GRAB_SPEED = 7.5, SHOT_WAIT = 16;
export const CHARGE_TICKS = 28;                 // boştan tam güce ~0,47 sn (baskı altında da vurulabilsin)
export const KICK_MIN = .75, KICK_MAX = 1.35;   // KICK çarpanı: kısa dokunuş .. tam bar
// şut tuşu (FIFA D): füze gibi sert; tam barda füzeye yakın hız (füze 1.95), bar bu eşiği geçince top alevlenir
export const SHOT_KEY_MIN = .95, SHOT_KEY_MAX = 1.85, SHOT_KEY_FIRE = .7;
export const AI_KICK_POWER = (1 - KICK_MIN)/(KICK_MAX - KICK_MIN);   // botlar eskisi gibi tam KICK gücüyle vurur
export const TICK = 1000/60;
export const TEAM_COL = ['#ffcf3a', '#3fd0e8'];
export const TEAM_DARK = ['#9a6f00', '#0f7f93'];
export const TEAM_NAME = ['Limon', 'Buz'];
// hazır mesajlar (1–6 tuşları): maçta oyuncunun üstünde balon, lobide sohbet
export const QUICK_CHAT = ['Pas ver!', 'Güzel gol!', 'Hadi!', 'Geri dön!', 'Tamam', 'Pardon!'];
/* Formalar. c1 ana renk, c2 desen rengi, dark şort/kontur, ui arayüz rengi (hale, skor, konfeti), num numara rengi.
   pat: 'duz' | 'serit' (dikey çubuk) | 'yarim' (iki renk yarım) | 'yatay' (yatay şerit).
   Üç kulüp forması adı ve armasıyla (crest: 'fb' | 'gs' | 'bjk', çizim client/ui.js drawCrest); oyun kendi aramızda oynanıyor, yayınlanmıyor.
   İstemcide TEAM_COL/TEAM_DARK o anki maçın formalarına göre güncellenir (render.js applyKitColors). */
export const KITS = [
  { id: 'limon',        name: 'Limon',         c1: '#ffcf3a', c2: '#ffcf3a', dark: '#9a6f00', ui: '#ffcf3a', num: '#ffffff', pat: 'duz' },
  { id: 'buz',          name: 'Buz',           c1: '#3fd0e8', c2: '#3fd0e8', dark: '#0f7f93', ui: '#3fd0e8', num: '#ffffff', pat: 'duz' },
  { id: 'sarilacivert', name: 'Fenerbahçe',    c1: '#ffd200', c2: '#1b2a6b', dark: '#1b2a6b', ui: '#ffd200', num: '#ffffff', pat: 'serit',
    crest: 'fb' },
  { id: 'sarikirmizi',  name: 'Galatasaray',   c1: '#c8102e', c2: '#fdb912', dark: '#7a0a1c', ui: '#f0542a', num: '#ffffff', pat: 'yarim',
    crest: 'gs' },
  { id: 'siyahbeyaz',   name: 'Beşiktaş',      c1: '#f4f4f4', c2: '#151515', dark: '#151515', ui: '#f4f4f4', num: '#ffffff', pat: 'serit',
    crest: 'bjk' },
  { id: 'bordomavi',    name: 'Bordo-Mavi',    c1: '#7a1e3a', c2: '#5fb6e6', dark: '#4a1024', ui: '#b0365a', num: '#ffffff', pat: 'yarim' },
  { id: 'kirmizi',      name: 'Kırmızı',       c1: '#e8455c', c2: '#e8455c', dark: '#8f1d2e', ui: '#e8455c', num: '#ffffff', pat: 'duz' },
  { id: 'yesilbeyaz',   name: 'Yeşil-Beyaz',   c1: '#2fb67c', c2: '#ffffff', dark: '#16603f', ui: '#2fb67c', num: '#ffffff', pat: 'yatay' },
  { id: 'mor',          name: 'Mor',           c1: '#7c5cf0', c2: '#7c5cf0', dark: '#3b2a8a', ui: '#8f74ff', num: '#ffffff', pat: 'duz' },
  { id: 'turuncu',      name: 'Turuncu',       c1: '#ff8a3d', c2: '#ff8a3d', dark: '#a3480c', ui: '#ff8a3d', num: '#ffffff', pat: 'duz' },
];
export const kitById = id => KITS.find(k => k.id === id) || null;
// iki takımın formaları: geçersizse varsayılan, aynıysa ikinci takıma farklı bir forma
// kaleci forması: iki takımın formasından farklı, iki kaleci de birbirinden farklı
export function keeperKit(kits, team){
  const free = ['turuncu', 'mor', 'kirmizi', 'yesilbeyaz', 'limon', 'buz'].filter(id => !(kits || []).includes(id));
  return kitById(free[team] || free[0]) || KITS[0];
}
export function matchKits(a, b){
  const A = kitById(a) || KITS[0];
  let B = kitById(b) || (A.id === 'buz' ? KITS[0] : KITS[1]);
  if (B.id === A.id) B = ['buz', 'limon', 'kirmizi'].map(kitById).find(k => k.id !== A.id);
  return [A.id, B.id];
}
export const BOT_NAMES = ['Topaç','Zıpzıp','Fındık','Pofuduk','Leblebi','Çakıl','Mısır','Kestane','Lokum','Simit','Pamuk','Fıstık'];
export const SHOTS = {
  falso:   { name:'Falso',   cd:240, color:'#c86bff' },
  fuze:    { name:'Füze',    cd:540, color:'#ff7a1f' },
  asirtma: { name:'Aşırtma', cd:300, color:'#4fc3e8' },
};
export const SHOT_TYPES = Object.keys(SHOTS);

/* Kombolar: özel şut tuşlarına birlikte basılınca. Anahtar, parçaların SHOT_TYPES sırasıyla '+' ile
   birleşmiş hali. Kombo kullandığı tüm şutların bekleme süresini doldurur. */
export const COMBOS = {
  'falso+fuze':         { name: 'Falsolu füze',    color: '#ff5fa2' },
  'falso+asirtma':      { name: 'Falsolu aşırtma', color: '#8f8cff' },
  'fuze+asirtma':       { name: 'Havadan füze',    color: '#ffb238' },
  'falso+fuze+asirtma': { name: 'Üçlü kombo',      color: '#ffe14d' },
};
// özel şut ya da kombo için ad ve renk
export const shotInfo = type => SHOTS[type] || COMBOS[type] || null;
// şut fiziği: hız (KICK çarpanı), havaya kalkış (vz), falso miktarı, füze alevi süresi (tick)
export const SHOT_PHYS = {
  'falso':              { sp: 1.2,  vz: 0,   curve: .03,  fire: 0  },
  'fuze':               { sp: 1.95, vz: 0,   curve: 0,    fire: 70 },
  'asirtma':            { sp: .95,  vz: 6.3, curve: 0,    fire: 0  },
  'falso+fuze':         { sp: 1.7,  vz: 0,   curve: .024, fire: 55 },
  'falso+asirtma':      { sp: 1.0,  vz: 6.0, curve: .026, fire: 0  },
  'fuze+asirtma':       { sp: 1.6,  vz: 4.6, curve: 0,    fire: 45 },
  'falso+fuze+asirtma': { sp: 1.5,  vz: 4.8, curve: .02,  fire: 45 },
};
// 'fuze+falso', ['asirtma','fuze'] gibi girdileri tek biçime çevirir; geçersizse null
export function normShot(s){
  const parts = Array.isArray(s) ? s : typeof s === 'string' ? s.split('+') : [];
  const key = SHOT_TYPES.filter(t => parts.includes(t)).join('+');
  return key && SHOT_PHYS[key] && parts.every(t => SHOT_TYPES.includes(t)) ? key : null;
}
export const COMBO_WAIT = 6;   // ilk tuştan sonra ikinci tuş için beklenen süre (tick, ~0,1 sn)
export const FACES = ['bead','big','sleepy','cyclops','grumpy','bead','big','smug'];
// görünüm: ten rengi (açıktan koyuya), saç modeli ve rengi, dövme
export const SKINS = ['#f6d3b3', '#e8b48a', '#c98e62', '#a8693f', '#7a4a2b', '#4e2f1c'];
export const HAIRS = ['kisa', 'kisa', 'uzun', 'uzun', 'kivircik', 'mohikan', 'topuz', 'orgu', 'kel'];
export const HAIR_COLS = ['#1c1410', '#1c1410', '#3b2416', '#6b4226', '#d9b25c', '#a8432a', '#b9b4ae', '#3fa9f5', '#ff6fb5'];
export const TATTOOS = ['yildiz', 'kalp', 'kabile', 'damla'];
// gol sevinçleri: golü atan oyuncu yapar (golde rastgele seçilir)
export const CELEBRATIONS = ['takla', 'gozluk', 'kulak', 'ucak', 'diz'];
export const ACCS = ['none', 'cap', 'beanie', 'headband', 'scarf', 'earmuffs', 'sprout'];
/* Oyuncunun seçtiği görünüm (menü "Oyuncum"): { skin, hair, hairCol, tattoo, face, acc }.
   Geçerli alanlar kalır, eksik ya da geçersiz alan maçta rastgele olur. tattoo: 'yok' = dövmesiz. */
export function cleanLook(look){
  const out = {};
  if (!look || typeof look !== 'object') return out;
  const pick = (k, list) => { if (typeof look[k] === 'string' && list.includes(look[k])) out[k] = look[k]; };
  pick('skin', SKINS); pick('hair', HAIRS); pick('hairCol', HAIR_COLS); pick('face', FACES); pick('acc', ACCS);
  if (look.tattoo === 'yok' || look.tattoo === null) out.tattoo = null;
  else pick('tattoo', TATTOOS);
  return out;
}
export const POSTS = [{x:0,y:TOP},{x:0,y:BOT},{x:W,y:TOP},{x:W,y:BOT}];

export const ARENAS = [
  { id:'gece', name:'Gece arenası', sw:'linear-gradient(135deg,#14263f,#3a8fb8)',
    outer:'#1a1422', stripes:['#13253d','#16304f'], line:'rgba(150,240,255,.8)', rays:'150,230,255', rayA:.10, net:'rgba(190,240,255,.35)' },
  { id:'kil', name:'Kil kort', sw:'linear-gradient(135deg,#c4673f,#e19a6d)',
    outer:'#d7d1c7', stripes:['#c4673f','#ca7048'], line:'rgba(255,255,255,.9)', rays:null, net:'rgba(255,255,255,.45)' },
  { id:'cim', name:'Işıklı çim', sw:'linear-gradient(135deg,#2f7a41,#8fd18a)',
    outer:'#1c4128', stripes:['#3b8a4c','#43965a'], line:'rgba(255,255,255,.85)', rays:'255,255,225', rayA:.10, net:'rgba(255,255,255,.4)' },
  { id:'aksam', name:'Gün batımı', sw:'linear-gradient(135deg,#f3879d,#7d55c2)',
    outer:'#2e1d45', stripes:null, line:'rgba(255,240,250,.75)', rays:'255,210,235', rayA:.09, net:'rgba(255,230,245,.4)' },
];

/* ---------- yapay zekâ zorlukları ---------- */
// kaleci: kale çizgisinden uzaklık, tutabildiği en hızlı top, kale alanı (kalecinin topa çıktığı mesafe)
export const KEEPER_OUT = 40, KEEPER_GRAB_SPEED = 9.5, KEEPER_BOX = 170;
export const DIFF = [
  { speed:.80, align:.88, aim:.42, predict:.3, react:.35, range:420, special:.03, pass:.25, tackle:.008, turnTol:.13, tackleTry:.03, sprint:.5, slide:0, keeper:.2 },
  { speed:.92, align:.92, aim:.32, predict:.7, react:.7, range:540, special:.07, pass:.45, tackle:.014, turnTol:.09, tackleTry:.06, sprint:.8, slide:.007, keeper:.3 },
  { speed:1.0, align:.95, aim:.24, predict:1, react:1, range:600, special:.14, pass:.6, tackle:.022, turnTol:.06, tackleTry:.1, sprint:1, slide:.014, keeper:.4 },
];

// kadro büyüklüğüne göre başlangıç dizilişi
export function formation(n, i, team){
  const sets = {
    1: [[.25,.5]],
    2: [[.36,.5],[.14,.5]],
    3: [[.37,.5],[.22,.24],[.22,.76]],
  };
  const [fx, fy] = sets[n][i];
  const x = team === 0 ? fx*W : W - fx*W;
  return { x, y: fy*H };
}
