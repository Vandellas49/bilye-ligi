/* ---------- lig tablosu ----------
   Çevrimiçi maçların sonuçları oyuncu adına göre (büyük/küçük harf duyarsız) birikir ve bir JSON dosyasında
   saklanır (sunucu yeniden başlasa da kalır). Galibiyet 3, beraberlik 1 puan; penaltıyla kazanan galip sayılır.
   Yalnızca maçta oynayan insan oyuncular (uid'li) sayılır; botlar sayılmaz. */
import fs from 'node:fs';
import path from 'node:path';

export function createLeague(file){
  const L = { file, rows: new Map(), warned: false };
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const r of Array.isArray(data.rows) ? data.rows : []) if (r && typeof r.name === 'string') L.rows.set(r.name.toLocaleLowerCase('tr'), r);
  } catch(e){ /* dosya yok ya da bozuk: boş tablo */ }
  return L;
}

const blank = name => ({ name, o: 0, g: 0, b: 0, m: 0, ag: 0, yg: 0, gol: 0, mvp: 0, son: 0 });

/* S: bitmiş maç; summary: statSummary(S); ipOf(uid): IP (isteğe bağlı) */
export function recordLeague(L, S, summary, ipOf = () => ''){
  const [a, b] = S.score, pen = S.penScore;
  const winner = a !== b ? (a > b ? 0 : 1) : pen ? (pen[0] > pen[1] ? 0 : 1) : -1;
  let changed = false;
  for (const p of S.players){
    if (p.uid == null) continue;
    const key = p.name.toLocaleLowerCase('tr');
    const r = L.rows.get(key) || blank(p.name);
    r.name = p.name; r.o++;
    if (winner === -1) r.b++; else if (winner === p.team) r.g++; else r.m++;
    r.ag += p.team === 0 ? a : b; r.yg += p.team === 0 ? b : a;
    const st = summary && summary.players ? summary.players[p.id] : null;
    if (st) r.gol += st.g;
    if (summary && summary.mvp && summary.mvp.id === p.id) r.mvp++;
    r.son = Date.now(); r.ip = ipOf(p.uid) || r.ip || '';
    L.rows.set(key, r); changed = true;
  }
  if (changed) saveLeague(L);
}

export function leagueRows(L, limit = 50){
  return [...L.rows.values()]
    .map(r => ({ ...r, puan: r.g*3 + r.b, av: r.ag - r.yg }))
    .sort((x, y) => y.puan - x.puan || y.av - x.av || y.ag - x.ag || y.gol - x.gol || x.name.localeCompare(y.name, 'tr'))
    .slice(0, limit);
}

function saveLeague(L){
  try {
    fs.mkdirSync(path.dirname(L.file), { recursive: true });
    const tmp = L.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ rows: [...L.rows.values()] }, null, 1));
    fs.renameSync(tmp, L.file);
  } catch(e){
    // IIS'te uygulama havuzu kimliğinin data klasörüne yazma izni yoksa: tablo bellekte kalır
    if (!L.warned){ L.warned = true; console.warn('Lig tablosu kaydedilemedi (' + L.file + '):', e.message); }
  }
}
