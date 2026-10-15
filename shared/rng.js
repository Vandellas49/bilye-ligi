/* ---------- tohumlu rastgele sayı üreteci ----------
   mulberry32. Durum düz bir nesnede tutulur ({ s }), böylece maç durumuyla
   birlikte kopyalanabilir ya da gönderilebilir. Aynı tohum aynı diziyi verir. */

export function createRng(seed){ return { s: seed >>> 0 }; }

// [0, 1) aralığında sayı
export function random(r){
  let t = r.s = (r.s + 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(r, n){ return random(r)*n | 0; }

export function shuffle(r, a){
  for (let i = a.length - 1; i > 0; i--){ const j = randInt(r, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// yeni maç için tohum (yalnızca istemci ya da sunucu kullanır, simülasyon değil)
export function randomSeed(){ return Math.random()*4294967296 >>> 0; }
