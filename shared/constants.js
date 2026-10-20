/* ---------- sabitler ----------
   Hem tarayıcıda hem sunucuda kullanılır; DOM'a dokunmaz. */

export const W = 1250, H = 700;           // saha (paslaşmaya yer olsun diye 1000x560'tan büyütüldü)
export const GH = 220, GD = 48;           // kale ağzı ve derinliği
export const CENTER_R = 100;              // orta yuvarlak (başlama vuruşunda rakip dışında bekler)
export const TOP = H/2 - GH/2, BOT = H/2 + GH/2;
export const PR = 22, BR = 12, POST_R = 7;
export const MARGIN = 38;
export const VIEW = { x: -GD - MARGIN, y: -MARGIN, w: W + 2*(GD + MARGIN), h: H + 2*MARGIN };
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
export const GOAL_PAUSE = 180;        // golden sonra sevinç ve yeniden başlama arası (tick, 3 sn)
// pas yardımı (insan oyuncu): basılan yöne yakın arkadaşa, koştuğu yere, mesafeye uygun güçle
export const PASS_CONE = .8;           // basılan yönden en fazla bu kadar sapan arkadaşa kilitlenir (rad, ~46°; 8 yönlü ok tuşlarında her yöne yeter)
export const SHOT_CONE = .9;           // şut yardımı: basılan yön kaleye bu kadar yakınsa (rad, ~52°) top kale ağzına gider
export const SHOT_CONE_WIDE = 1.35;    // şut tuşunda (FIFA D) daha geniş: kaleye bakan hemen her yön (~77°)
export const SHOT_RANGE = 800;         // şut yardımının çalıştığı en uzak mesafe (kale çizgisine)
export const PASS_ARRIVE = 2.4;        // top arkadaşa bu hızla varacak şekilde atılır
export const PASS_POWER_MIX = .25;     // güç barının yardımlı pas gücüne etkisi (0: hiç, 1: tamamen bar)
export const SHOT_OVERRIDE = .6;       // kaleye nişan alıp bar bu kadar doluysa pas değil şut sayılır
export const THROUGH_LEAD = 90;        // ara pas: arkadaşın önüne, koşu yoluna bu kadar ileriye
// şut güç barı (insan oyuncu): şut tuşu basılı tutuldukça dolar, bırakınca vurur
export const CHARGE_TICKS = 45;                 // boştan tam güce ~0,75 sn
export const KICK_MIN = .75, KICK_MAX = 1.35;   // KICK çarpanı: kısa dokunuş .. tam bar
export const AI_KICK_POWER = (1 - KICK_MIN)/(KICK_MAX - KICK_MIN);   // botlar eskisi gibi tam KICK gücüyle vurur
export const TICK = 1000/60;
export const TEAM_COL = ['#ffcf3a', '#3fd0e8'];
export const TEAM_DARK = ['#9a6f00', '#0f7f93'];
export const TEAM_NAME = ['Limon', 'Buz'];
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
export const DIFF = [
  { speed:.80, align:.88, aim:.42, predict:.3, react:.35, range:420, special:.03, pass:.25, tackle:.008, turnTol:.13, tackleTry:.03, sprint:.5, slide:0 },
  { speed:.92, align:.92, aim:.32, predict:.7, react:.7, range:540, special:.07, pass:.45, tackle:.014, turnTol:.09, tackleTry:.06, sprint:.8, slide:.007 },
  { speed:1.0, align:.95, aim:.24, predict:1, react:1, range:600, special:.14, pass:.6, tackle:.022, turnTol:.06, tackleTry:.1, sprint:1, slide:.014 },
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
