/* ---------- turnuva ----------
   4 ya da 8 takımlı tek eleme tablosu. Hem tek kişilik turnuvada (tarayıcı)
   hem çevrimiçi turnuva odasında (sunucu) kullanılır. */
import { createRng, random, shuffle } from './rng.js';
import { createMatch, step } from './sim.js';

export const TOUR_TEAMS = ['Limon', 'Buz', 'Nar', 'Erik', 'Kivi', 'Zeytin', 'Ayva', 'Dut'];

// names verilmezse TOUR_TEAMS'ten karışık seçilir (ilk takım her zaman verilen sırada kalır)
export function createTournament({ size = 4, names, seed = 1 } = {}){
  const n = size === 8 ? 8 : 4;
  const list = names ? names.slice(0, n) : [TOUR_TEAMS[0], ...shuffle(createRng(seed), TOUR_TEAMS.slice(1)).slice(0, n - 1)];
  const rounds = [];
  for (let len = n/2; len >= 1; len /= 2){
    rounds.push(Array.from({ length: len }, () => ({ a: null, b: null, sa: null, sb: null, pen: null, winner: null })));
  }
  rounds[0].forEach((m, i) => { m.a = 2*i; m.b = 2*i + 1; });
  return { size: n, teams: list.map(name => ({ name })), rounds, champion: null };
}

export function roundName(T, r){
  const left = T.rounds.length - r;
  return left === 1 ? 'Final' : left === 2 ? 'Yarı final' : 'Çeyrek final';
}

// sıradaki oynanmamış maç: { round, index, a, b } ya da turnuva bittiyse null
export function nextMatch(T){
  for (let r = 0; r < T.rounds.length; r++){
    const i = T.rounds[r].findIndex(m => m.winner === null && m.a !== null && m.b !== null);
    if (i >= 0) return { round: r, index: i, a: T.rounds[r][i].a, b: T.rounds[r][i].b };
  }
  return null;
}

// sa/sb: a ve b takımlarının golleri; pen: berabere ise [a, b] penaltı skoru
export function recordResult(T, round, index, sa, sb, pen = null){
  const m = T.rounds[round][index];
  m.sa = sa; m.sb = sb; m.pen = pen;
  const aWins = sa !== sb ? sa > sb : pen[0] > pen[1];
  m.winner = aWins ? m.a : m.b;
  const next = T.rounds[round + 1];
  if (next){
    const nm = next[index >> 1];
    if (index % 2 === 0) nm.a = m.winner; else nm.b = m.winner;
  } else T.champion = m.winner;
  return m.winner;
}

// bir takım hâlâ turnuvada mı
export function alive(T, team){
  if (T.champion !== null) return T.champion === team;
  return !T.rounds.some(round => round.some(m => m.winner !== null && (m.a === team || m.b === team) && m.winner !== team));
}

// zorluk her turda artar: son tur her zaman en zor (2)
export function roundDiff(T, round){ return Math.max(0, Math.min(2, 2 - (T.rounds.length - 1 - round))); }

// penaltı atışları: 5'er atış, eşitlikte tek tek
export function shootout(rng){
  let a = 0, b = 0;
  for (let i = 0; i < 5; i++){ if (random(rng) < .75) a++; if (random(rng) < .75) b++; }
  while (a === b){ if (random(rng) < .75) a++; if (random(rng) < .75) b++; }
  return [a, b];
}

/* iki bot takımının maçını ekran olmadan oynat.
   Altın gol çok uzarsa (süre kadar daha) penaltılara gidilir. */
export function simulateMatch({ size = 3, diff = 1, minutes = 2, seed = 1, specials = true } = {}){
  const S = createMatch({ size, diff, minutes, seed, specials, arena: 0, weather: 'sade' });
  const cap = minutes*3600*3 + 3600;
  for (let i = 0; i < cap && S.phase !== 'over'; i++) step(S, {});
  const [sa, sb] = S.score;
  if (sa !== sb) return { sa, sb, pen: null };
  return { sa, sb, pen: shootout(S.rng) };
}
