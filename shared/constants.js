/* ---------- sabitler ----------
   Hem tarayıcıda hem sunucuda kullanılır; DOM'a dokunmaz. */

export const W = 1000, H = 560;           // saha
export const GH = 170, GD = 48;           // kale ağzı ve derinliği
export const TOP = H/2 - GH/2, BOT = H/2 + GH/2;
export const PR = 22, BR = 12, POST_R = 7;
export const MARGIN = 38;
export const VIEW = { x: -GD - MARGIN, y: -MARGIN, w: W + 2*(GD + MARGIN), h: H + 2*MARGIN };
export const P_ACC = 0.135, P_ACC_KICK = 0.09, P_DAMP = 0.96, B_DAMP = 0.99;
export const KICK = 6.4, KICK_RANGE = 5, WALL_REST = .7;
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
export const FACES = ['bead','big','sleepy','cyclops','grumpy','bead','big','smug'];
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
  { speed:.80, align:.88, aim:.42, predict:.3, react:.35, range:330, special:.03, pass:.25, tackle:.008, turnTol:.13, tackleTry:.03, sprint:.5 },
  { speed:.92, align:.92, aim:.32, predict:.7, react:.7, range:420, special:.07, pass:.45, tackle:.014, turnTol:.09, tackleTry:.06, sprint:.8 },
  { speed:1.0, align:.95, aim:.24, predict:1, react:1, range:520, special:.14, pass:.6, tackle:.022, turnTol:.06, tackleTry:.1, sprint:1 },
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
