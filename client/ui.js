/* ---------- menü, HUD ve ekranlar ---------- */
import { ARENAS, SHOTS, SHOT_TYPES, TEAM_NAME, SKINS, HAIRS, HAIR_COLS, TATTOOS, FACES, ACCS, cleanLook } from '../shared/constants.js';
import { roundName, TOUR_TEAMS } from '../shared/tournament.js';

export const $ = id => document.getElementById(id);
// kullanıcıdan gelen metni HTML'e güvenle yaz
export const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));

export const isTouchOnly = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
if (isTouchOnly || ('ontouchstart' in window && navigator.maxTouchPoints > 0)) document.body.classList.add('touch');
export const isTouch = () => document.body.classList.contains('touch');

const DIFF_NAME = ['Kolay', 'Orta', 'Zor'];

/* ayar kaydı (tarayıcıda) */
export function loadCfg(){ try { return JSON.parse(localStorage.getItem('bilye-cfg')||'null'); } catch(e){ return null; } }
export function saveCfg(c){ try { localStorage.setItem('bilye-cfg', JSON.stringify(c)); } catch(e){} }

const radio = n => { const el = document.querySelector(`input[name="${n}"]:checked`); return el && el.value; };

// menü seçeneklerini oluştur, kayıtlı ayarları yükle; kayıtlı ayarı döndürür
export function initMenu(){
  const arenaRadios = (seg, name, prefix) => {
    ARENAS.forEach((a,i) => {
      seg.insertAdjacentHTML('beforeend',
        `<input type="radio" name="${name}" id="${prefix}${i}" value="${i}"><label for="${prefix}${i}"><span class="sw" style="background:${a.sw}"></span>${a.name}</label>`);
    });
    seg.insertAdjacentHTML('beforeend', `<input type="radio" name="${name}" id="${prefix}r" value="r" checked><label for="${prefix}r">Rastgele</label>`);
  };
  arenaRadios($('arenaSeg'), 'arena', 'a');
  arenaRadios($('crArenaSeg'), 'crArena', 'cra');

  if (isTouchOnly) {
    $('keysHelp').innerHTML = 'Sol tarafta parmağını sürükleyerek hareket et, sağdaki <kbd>ŞUT</kbd> düğmesini basılı tuttukça güç barı dolar, bırakınca vurursun, <kbd>PAS</kbd> ile takım arkadaşından pas iste, <kbd>TUT</kbd> basılıyken top ayağına yapışır ve rakipten korursun. Joystick’i sonuna kadar itersen depar atarsın. Rakip toptayken <kbd>ŞUT</kbd> müdahale yapar, <kbd>KAY</kbd> ile kayarak topa girersin. Falso, füze ve aşırtma düğmeleri dolunca tekrar kullanılabilir; ikisine ya da üçüne birlikte basarsan kombo olur.';
  }

  const saved = loadCfg();
  if (saved) {
    const setR = (name, v) => { const el = document.querySelector(`input[name="${name}"][value="${v}"]`); if (el && !el.disabled) el.checked = true; };
    setR('mode', saved.mode); setR('tsize', saved.tsize);
    setR('size', saved.size); setR('keys', saved.keys); setR('diff', saved.diff); setR('arena', saved.arena); setR('time', saved.time); setR('weather', saved.weather); setR('assist', saved.assist); setR('view', saved.view);
  }

  // turnuva seçilince rakip ve bot seviyesi gizlenir (rakipler her turda zorlaşır)
  const syncMode = () => {
    const tour = radio('mode') === 'tour';
    $('tourField').hidden = !tour; $('tourNote').hidden = !tour;
    $('diffField').hidden = tour;
    $('startBtn').textContent = tour ? 'Turnuvaya başla' : 'Maça başla';
  };
  document.querySelectorAll('input[name="mode"]').forEach(el => el.addEventListener('change', syncMode));
  syncMode();
  // tuş düzeni: varsayılan FIFA; yardım metni seçilen düzene göre
  if (!document.querySelector('input[name="keys"]:checked')) $('kf').checked = true;
  const syncKeys = () => { if (!isTouchOnly) $('keysHelp').innerHTML = keysHelpHtml(keyLayout()); };
  document.querySelectorAll('input[name="keys"]').forEach(el => el.addEventListener('change', () => { saveCfg({ ...(loadCfg() || {}), keys: radio('keys') }); syncKeys(); }));
  syncKeys();
  // görünüm: kayıt yoksa bilgisayarda 3B, yalnızca dokunmatik cihazda 2B
  if (!document.querySelector('input[name="view"]:checked')) $(isTouchOnly ? 'v2' : 'v3').checked = true;
  document.querySelectorAll('input[name="view"]').forEach(el => el.addEventListener('change', () => saveCfg({ ...(loadCfg() || {}), view: radio('view') })));
  // pas yardımı seçimi hemen kaydedilir (maç başlatmadan çevrimiçine geçilse de hatırlansın)
  document.querySelectorAll('input[name="assist"]').forEach(el => el.addEventListener('change', () => saveCfg({ ...(loadCfg() || {}), assist: radio('assist') })));
  const syncCreate = () => { $('crTourField').hidden = radio('crType') !== 'tournament'; };
  document.querySelectorAll('input[name="crType"]').forEach(el => el.addEventListener('change', syncCreate));
  syncCreate();
  return saved;
}

/* "Oyuncum": görünüm seçimi. Her satırda ilk seçenek Rastgele (alan kaydedilmez, maçta rastgele olur).
   Seçim bilye-cfg.look'ta saklanır; onChange(look) önizlemeyi çizer ve çevrimiçine bildirir. */
const LOOK_ROWS = [
  { key: 'skin', title: 'Ten', opts: SKINS.map(v => [v, null, v]) },
  { key: 'hair', title: 'Saç', opts: [...new Set(HAIRS)].map(v => [v, { kisa: 'Kısa', uzun: 'Uzun', kivircik: 'Afro', mohikan: 'Mohikan', topuz: 'Topuz', orgu: 'Örgü', kel: 'Kel' }[v]]) },
  { key: 'hairCol', title: 'Saç rengi', opts: [...new Set(HAIR_COLS)].map(v => [v, null, v]) },
  { key: 'face', title: 'Yüz', opts: [...new Set(FACES)].map(v => [v, { bead: 'Boncuk', big: 'İri göz', sleepy: 'Uykulu', cyclops: 'Tek göz', grumpy: 'Asık', smug: 'Havalı' }[v]]) },
  { key: 'acc', title: 'Aksesuar', opts: ACCS.map(v => [v, { none: 'Yok', cap: 'Şapka', beanie: 'Bere', headband: 'Saç bandı', scarf: 'Atkı', earmuffs: 'Kulaklık', sprout: 'Filiz' }[v]]) },
  { key: 'tattoo', title: 'Dövme', opts: [['yok', 'Yok'], ...TATTOOS.map(v => [v, { yildiz: 'Yıldız', kalp: 'Kalp', kabile: 'Kabile', damla: 'Damla' }[v]])] },
];
export function loadLook(){
  const l = (loadCfg() || {}).look;
  const out = cleanLook(l);
  if (out.tattoo === null) out.tattoo = 'yok';   // önizleme ve kayıt biçimi
  return out;
}
export function initLookEditor(onChange){
  const box = $('lookRows');
  const look = loadLook();
  box.innerHTML = LOOK_ROWS.map(r => {
    const chips = [['', 'Rastgele'], ...r.opts].map(([v, label, col], i) => {
      const id = 'lk-' + r.key + '-' + i, on = (look[r.key] || '') === v ? ' checked' : '';
      const inner = col ? `<span class="sw" style="background:${col}"></span>` : esc(label);
      return `<input type="radio" name="lk-${r.key}" id="${id}" value="${v}"${on}><label for="${id}"${col ? ` aria-label="${r.title} ${i}" class="swonly"` : ''}>${inner}</label>`;
    }).join('');
    return `<fieldset><legend>${r.title}</legend><div class="seg">${chips}</div></fieldset>`;
  }).join('');
  const read = () => {
    const l = {};
    for (const r of LOOK_ROWS){ const v = radio('lk-' + r.key); if (v) l[r.key] = v; }
    return l;
  };
  box.addEventListener('change', () => { const l = read(); saveCfg({ ...(loadCfg() || {}), look: l }); onChange(l); });
  onChange(look);
}

// pas yardımı tercihi (menüdeki seçim; çevrimiçinde de kullanılır)
export const passAssist = () => radio('assist') !== '0';
// tuş düzeni: 'fifa' | 'klasik'
export const keyLayout = () => radio('keys') === 'klasik' ? 'klasik' : 'fifa';

const kbd = k => `<kbd>${k}</kbd>`;
function keysHelpHtml(layout){
  if (layout === 'klasik') return [
    `Hareket: ${kbd('W')}${kbd('A')}${kbd('S')}${kbd('D')} ya da ok tuşları. Şut / pas: ${kbd('Boşluk')}; basılı tuttukça güç barı dolar, bırakınca vurursun. Pas yardımı açıksa bastığın yöndeki arkadaşına gider.`,
    `Depar: ${kbd('Shift')}. Topu koru: ${kbd('C')}. Pas iste: ${kbd('F')}. Oyuncu değiştir: ${kbd('Tab')} (topa en yakın arkadaşına geçersin).`,
    `Rakip toptayken ${kbd('Boşluk')} müdahale, ${kbd('V')} kayarak müdahale.`,
    `Özel şutlar: ${kbd('Q')} falso, ${kbd('E')} füze, ${kbd('R')} aşırtma; birlikte basınca kombo (${kbd('Q')}+${kbd('E')}, ${kbd('E')}+${kbd('R')}, ${kbd('Q')}+${kbd('R')}, üçü birden).`,
    `Duraklat: ${kbd('Esc')}.`].join('<br>');
  return [
    `<b>FIFA düzeni.</b> Hareket: ok tuşları. Depar: ${kbd('E')}. Topu koru: ${kbd('Shift')}.`,
    `Topu sürerken: ${kbd('S')} pas (arkadaşına), ${kbd('D')} sert şut (bar dolunca alevli), ${kbd('A')}+${kbd('D')} havadan sert şut, ${kbd('W')} ara pas (arkadaşının önüne), ${kbd('A')} havadan pas / orta. Basılı tuttukça güç barı dolar, bırakınca vurursun.`,
    `Rakip toptayken: ${kbd('S')} ya da ${kbd('A')} müdahale, ${kbd('D')} kayarak müdahale.`,
    `Oyuncu değiştir: ${kbd('Q')} (topa en yakın arkadaşına geçersin). Pas iste: ${kbd('F')}.`,
    `Özel şutlar: ${kbd('Z')} falso, ${kbd('X')} füze, ${kbd('C')} aşırtma; birlikte basınca kombo (${kbd('Z')}+${kbd('X')}, ${kbd('X')}+${kbd('C')}, ${kbd('Z')}+${kbd('C')}, üçü birden).`,
    `Duraklat: ${kbd('Esc')}.`].join('<br>');
}

// görünüm tercihi: true = 3B
export const want3D = () => radio('view') === '3';

export function readCfg(){
  return { view: radio('view'), keys: radio('keys'), assist: radio('assist'), mode: radio('mode'), tsize: radio('tsize'), size: radio('size'), diff: radio('diff'),
    arena: radio('arena'), time: radio('time'), weather: radio('weather') };
}

// oda kurma formu -> sunucu ayarları
export function readCreate(){
  return {
    name: $('crName').value, password: $('crPass').value,
    settings: {
      type: radio('crType'), tSize: +radio('crTSize'), size: +radio('crSize'), diff: +radio('crDiff'),
      arena: radio('crArena'), minutes: +radio('crTime'), specials: radio('crSp') === '1',
      weather: radio('weather') || 'kar',
    },
  };
}

export function updateHud(S){
  $('sA').textContent = S.score[0]; $('sB').textContent = S.score[1];
  const names = S.teamNames || TEAM_NAME;
  $('nmA').textContent = names[0]; $('nmB').textContent = names[1];
  const c = $('clock');
  if (S.overtime){ c.textContent = 'Altın gol'; c.classList.add('ot'); }
  else {
    const s = Math.ceil(S.timeLeft/60), m = Math.floor(s/60);
    c.textContent = `${m}:${String(s%60).padStart(2,'0')}`; c.classList.remove('ot');
  }
}

const OVERLAYS = ['menu', 'pauseOv', 'endOv', 'tourOv', 'onlineOv', 'lobbyOv'];
export function currentOverlay(){ return OVERLAYS.find(o => $(o).classList.contains('on')) || null; }
export function showOverlay(id){
  for (const o of OVERLAYS) $(o).classList.toggle('on', o === id);
  const first = id && $(id).querySelector('button.btn');
  if (first && !isTouch()) setTimeout(() => first.focus({preventScroll:true}), 30);
}

// maç ekranı (skor, mola düğmesi, dokunmatik kontroller) açık/kapalı
export function setPlaying(on, touch = on){
  $('score').classList.toggle('on', on); $('pauseBtn').hidden = !on;
  document.body.classList.toggle('playing', on);
  $('touch').classList.toggle('on', touch);
}

/* maç sonu ekranı
   myTeam: oyuncunun tarafı (0/1) ya da izleyiciyse null
   buttons: { again, menu } düğme yazıları (again boşsa gizlenir) */
export function showEnd(S, { myTeam = 0, buttons } = {}){
  const [a, c] = S.score, names = S.teamNames || TEAM_NAME;
  let title, text = `${names[0]} ${a} – ${c} ${names[1]}`;
  if (a === c){ title = 'Berabere'; text = `${a} – ${c}. Kimse kazanamadı.`; }
  else {
    const w = a > c ? 0 : 1;
    if (myTeam === null) title = `${names[w]} kazandı`;
    else title = w === myTeam ? 'Kazandın!' : 'Bu sefer olmadı';
  }
  $('endTitle').textContent = title; $('endText').textContent = text;
  const b = buttons || { again: 'Bir maç daha', menu: 'Ayarları değiştir' };
  $('againBtn').hidden = !b.again; if (b.again) $('againBtn').textContent = b.again;
  $('menuBtn').textContent = b.menu;
  showOverlay('endOv'); $('pauseBtn').hidden = true; $('touch').classList.remove('on');
  updateHud(S);
}

// dokunmatik özel şut düğmelerinin dolumu
export function updateTouchCooldowns(S){
  if (!S.specials || !isTouch()) return;
  const h1 = S.players.find(p => p.ctrl === 'h1');
  if (!h1) return;
  for (const t of SHOT_TYPES){
    const el = $('sp-' + t);
    const k = 1 - h1.cd[t]/SHOTS[t].cd;
    el.style.setProperty('--p', k.toFixed(3)); el.classList.toggle('wait', k < 1);
  }
}

/* ---------- turnuva tablosu ----------
   me: oyuncunun takım(lar)ı (Set ya da tek indeks), current: { round, index } oynanan maç */
export function bracketHtml(T, { me = null, current = null } = {}){
  const mine = t => me instanceof Set ? me.has(t) : me === t;
  const team = (m, side) => {
    const t = side ? m.b : m.a;
    if (t === null) return `<div class="bt tbd"><span>Belli değil</span></div>`;
    const s = side ? m.sb : m.sa, pen = m.pen ? ` <small>(p ${m.pen[side]})</small>` : '';
    const cls = ['bt', m.winner === null ? '' : m.winner === t ? 'win' : 'lose', mine(t) ? 'me' : ''].join(' ');
    return `<div class="${cls}"><span>${esc(T.teams[t].name)}</span><b>${s === null ? '' : s + pen}</b></div>`;
  };
  return `<div class="bracket">${T.rounds.map((round, r) => `
    <div class="bround"><div class="bn">${roundName(T, r)}</div>
      ${round.map((m, i) => `<div class="bm ${current && current.round === r && current.index === i ? 'cur' : ''}">${team(m, 0)}${team(m, 1)}</div>`).join('')}
    </div>`).join('')}</div>`;
}

/* ---------- çevrimiçi: oda listesi ---------- */
export function renderRooms(list, onJoin){
  const el = $('roomList');
  if (!list.length){ el.innerHTML = '<div class="empty">Henüz oda yok. Aşağıdan bir tane kur.</div>'; return; }
  const phase = { lobby: 'Lobide', playing: 'Maç oynanıyor', between: 'Turnuva sürüyor', done: 'Lobide' };
  el.innerHTML = list.map(r => `
    <div class="room" data-id="${esc(r.id)}">
      <span class="rn">${r.locked ? '🔒 ' : ''}${esc(r.name)}</span>
      <span class="rm">${r.type === 'tournament' ? `Turnuva · ${r.tSize} takım` : 'Maç'} · ${r.size}’e ${r.size} · ${r.players} kişi · ${phase[r.phase] || ''}</span>
      ${r.locked ? '<input type="password" placeholder="Şifre" aria-label="Oda şifresi">' : ''}
      <button class="btn small" type="button">Katıl</button>
    </div>`).join('');
  el.querySelectorAll('.room').forEach(row => {
    const pass = row.querySelector('input');
    const go = () => onJoin(row.dataset.id, pass ? pass.value : '');
    row.querySelector('button').onclick = go;
    if (pass) pass.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  });
}

/* ---------- çevrimiçi: lobi ---------- */
export function renderLobby(room, myId, { onTeam, onStart, onDiff }){
  const s = room.settings, tour = s.type === 'tournament';
  $('lobbyName').textContent = room.name;
  const arena = s.arena === 'r' ? 'Rastgele saha' : ARENAS[s.arena].name;
  $('lobbyInfo').textContent = [tour ? `Turnuva, ${s.tSize} takım` : 'Maç', `${s.size}’e ${s.size}`, `${s.minutes} dk`,
    `${DIFF_NAME[s.diff]} botlar`, arena, s.specials ? 'Özel şutlar açık' : 'Özel şutlar kapalı', room.locked ? 'Şifreli' : ''].filter(Boolean).join(' · ');

  // durum satırı
  let status = '';
  if (room.phase === 'playing' && room.current) status = `${room.current.label ? room.current.label + ': ' : 'Maç oynanıyor: '}${room.current.names[0]} – ${room.current.names[1]}`;
  else if (room.phase === 'between') status = `Sıradaki maç birazdan başlıyor (${Math.ceil(room.nextIn/1000)} sn).`;
  else if (room.phase === 'done' && room.tour && room.tour.champion !== null) status = `Turnuva bitti. Şampiyon: ${room.tour.teams[room.tour.champion].name}`;
  else if (room.lastResult) status = `Son maç: ${room.lastResult.names[0]} ${room.lastResult.score[0]} – ${room.lastResult.score[1]} ${room.lastResult.names[1]}`;
  else status = room.hostId === myId ? 'Takımlar hazır olunca başlat. Boş yerlere bot girer.' : 'Oda sahibinin başlatması bekleniyor.';
  $('lobbyStatus').textContent = status;

  // takım sütunları + izleyiciler
  const names = tour ? TOUR_TEAMS.slice(0, s.tSize) : TEAM_NAME;
  const me = room.members.find(m => m.id === myId);
  const canMove = room.phase === 'lobby' || room.phase === 'done';
  const col = (title, team, members, cap) => {
    const isMine = me && me.team === team;
    const full = cap !== null && members.length >= cap;
    const items = members.map(m => `<li class="${m.connected ? '' : 'off'}">${m.id === room.hostId ? '👑 ' : ''}${esc(m.name)}${m.id === myId ? ' (sen)' : ''}${m.connected ? '' : ' · bağlantı koptu'}</li>`);
    if (cap !== null) for (let i = members.length; i < cap; i++) items.push('<li class="bot">bot</li>');
    const btn = !isMine && canMove && !full ? `<button class="btn ghost small" type="button" data-team="${team}">${team === null ? 'İzle' : 'Katıl'}</button>` : '';
    return `<div class="tcol ${isMine ? 'mine' : ''}"><h4>${team !== null && !tour ? `<span class="sw" style="background:var(--team-${team ? 'b' : 'a'})"></span>` : ''}${esc(title)}${cap !== null ? `<span class="cnt">${members.length}/${cap}</span>` : ''}</h4><ul>${items.join('')}</ul>${btn}</div>`;
  };
  const cols = names.map((n, t) => col(n, t, room.members.filter(m => m.team === t), s.size));
  cols.push(col('İzleyiciler', null, room.members.filter(m => m.team === null), null));
  $('lobbyTeams').innerHTML = cols.join('');
  $('lobbyTeams').querySelectorAll('button[data-team]').forEach(b => {
    b.onclick = () => onTeam(b.dataset.team === 'null' ? null : +b.dataset.team);
  });

  // turnuva tablosu
  $('lobbyBracket').innerHTML = room.tour
    ? bracketHtml(room.tour, { me: me && me.team !== null ? me.team : null, current: room.current && room.current.round !== null ? room.current : null })
    : '';

  const host = room.hostId === myId;
  $('lobbyStart').hidden = !host || !canMove;
  $('lobbyStart').textContent = tour ? (room.phase === 'done' ? 'Yeni turnuva başlat' : 'Turnuvayı başlat') : 'Maçı başlat';
  $('lobbyStart').onclick = onStart;

  // oda sahibi bot seviyesini lobide değiştirebilir
  $('lobbyDiff').hidden = !host || !canMove;
  document.querySelectorAll('input[name="lbDiff"]').forEach(el => {
    el.checked = +el.value === s.diff;
    el.onchange = () => onDiff(+el.value);
  });
}
