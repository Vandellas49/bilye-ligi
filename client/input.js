/* ---------- girdi ----------
   Klavye, sanal joystick ve dokunmatik düğmeler -> girdi nesnesi:
   { x, y, kick, kind, special, call, hold, sprint, slide, swap }
   kind: vuruşun türü. 'pass' yardımlı pas, 'shot' şut (arkadaşa kilitlenmez), 'through' ara pas
   (arkadaşın önüne), 'lob' havadan pas. Güç barı tuş bırakılınca vurduğu için tür, tuş bırakıldıktan
   sonra da hatırlanır.
   Tuş düzenleri: 'fifa' (varsayılan, FIFA'nın "sadece klavye" düzeni) ve 'klasik' (eski düzen). */
import { SHOT_TYPES, normShot } from '../shared/constants.js';
import { ensureAudio } from './audio.js';

export const LAYOUTS = {
  fifa:   { name: 'FIFA',   shots: { falso: 'KeyZ', fuze: 'KeyX', asirtma: 'KeyC' } },
  klasik: { name: 'Klasik', shots: { falso: 'KeyQ', fuze: 'KeyE', asirtma: 'KeyR' } },
};
// özel şut tuşunun ekranda gösterilecek adı ('KeyZ' -> 'Z')
export const shotKeyLabel = (layout, t) => (LAYOUTS[layout] || LAYOUTS.fifa).shots[t].replace('Key', '');

const keys = new Set();
// son basılma anı: bir oyun karesinden kısa dokunuşlar da en az TAP_MS boyunca basılı sayılır
const downAt = new Map(), TAP_MS = 40;
const GAME_KEYS = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyW','KeyA','KeyS','KeyD','KeyX','KeyZ','Enter','NumpadEnter',
  'KeyQ','KeyE','KeyR','KeyF','ShiftLeft','ShiftRight','KeyC','KeyV','Tab'];
const touchIn = { x:0, y:0, active:false, id:null, ox:0, oy:0 };   // sanal joystick
let kindLatch = 'pass';
let prevKick = false;   // FIFA A+D (havadan sert şut): aynı basışta ikisi de görülürse

export function clearKeys(){ keys.clear(); downAt.clear(); }

/* onPause: Esc/P basıldığında; isPlaying: maç sürüyor ve duraklatılmamışsa true */
export function initInput({ onPause, isPlaying }){
  addEventListener('keydown', e => {
    if (e.code === 'Escape' || e.code === 'KeyP'){ onPause(); return; }
    if (isPlaying() && GAME_KEYS.includes(e.code)){ e.preventDefault(); ensureAudio(); }
    keys.add(e.code); downAt.set(e.code, performance.now());
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', clearKeys);

  const $ = id => document.getElementById(id);
  const stage = $('stage'), stickZone = $('stickZone'), stick = $('stick'), knob = $('knob');
  stickZone.addEventListener('pointerdown', e => {
    ensureAudio();
    touchIn.active = true; touchIn.id = e.pointerId;
    const r = stage.getBoundingClientRect();
    touchIn.ox = e.clientX; touchIn.oy = e.clientY;
    stick.style.left = (e.clientX - r.left) + 'px'; stick.style.top = (e.clientY - r.top) + 'px'; stick.style.display = 'block';
    knob.style.transform = 'translate(-50%,-50%)';
    stickZone.setPointerCapture(e.pointerId);
  });
  stickZone.addEventListener('pointermove', e => {
    if (!touchIn.active || e.pointerId !== touchIn.id) return;
    let dx = e.clientX - touchIn.ox, dy = e.clientY - touchIn.oy;
    const d = Math.hypot(dx, dy), max = 48;
    if (d > max){ dx = dx/d*max; dy = dy/d*max; }
    touchIn.x = dx/max; touchIn.y = dy/max;
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  });
  const endStick = e => { if (e.pointerId !== touchIn.id) return; touchIn.active = false; touchIn.x = touchIn.y = 0; stick.style.display = 'none'; };
  stickZone.addEventListener('pointerup', endStick);
  stickZone.addEventListener('pointercancel', endStick);

  // dokunmatik düğmeler klavye tuşu gibi davranır ('T:...' sanal tuşları): kısa dokunuşlar da TAP_MS boyunca sayılır
  const holdButton = (btn, code) => {
    btn.addEventListener('pointerdown', e => { e.preventDefault(); ensureAudio(); keys.add(code); downAt.set(code, performance.now()); btn.classList.add('down'); });
    const release = () => { keys.delete(code); btn.classList.remove('down'); };
    btn.addEventListener('pointerup', release); btn.addEventListener('pointercancel', release); btn.addEventListener('pointerleave', release);
  };
  holdButton($('kickBtn'), 'T:kick');
  holdButton($('holdBtn'), 'T:hold');
  holdButton($('passBtn'), 'T:call');
  holdButton($('slideBtn'), 'T:slide');
  // özel şut düğmeleri: iki parmakla birlikte basılırsa kombo olur
  document.querySelectorAll('.spBtn').forEach(btn => holdButton(btn, 'T:' + btn.dataset.shot));
}

/* layout: 'fifa' | 'klasik'
   ctx.defending: rakip takım topu kontrol ediyor. FIFA düzeninde S/A müdahale, D kayarak müdahale olur. */
export function readInput(layout = 'fifa', ctx = {}){
  const now = performance.now();
  const k = c => keys.has(c) || now - (downAt.get(c) || -1e9) < TAP_MS;
  const arrX = (k('ArrowRight')?1:0) - (k('ArrowLeft')?1:0), arrY = (k('ArrowDown')?1:0) - (k('ArrowUp')?1:0);
  let x, y, kick, slide, sprint, hold, swap;
  if (layout === 'klasik'){
    x = (k('KeyD')?1:0) - (k('KeyA')?1:0) + arrX; y = (k('KeyS')?1:0) - (k('KeyW')?1:0) + arrY;
    kick = k('Space') || k('KeyX') || k('Enter') || k('NumpadEnter');
    if (kick) kindLatch = 'pass';   // pas ya da şut: pas yardımı ayarı ve nişan belirler
    slide = k('KeyV');
    sprint = k('ShiftLeft') || k('ShiftRight');
    hold = k('KeyC');
    swap = k('Tab');
  } else {
    x = arrX; y = arrY;
    if (ctx.defending){
      kick = k('KeyS') || k('KeyA');   // müdahale
      slide = k('KeyD');               // kayarak müdahale
    } else {
      const s = k('KeyS'), d = k('KeyD'), w = k('KeyW'), a = k('KeyA');
      kick = s || d || w || a;
      // A ile D birlikte (ya da biri basılıyken öteki): havadan sert şut, tuşlar bırakılana kadar öyle kalır
      const both = (a && d) || (prevKick && (a || d) && (kindLatch === 'lobshot' || (kindLatch === 'lob' && d) || (kindLatch === 'shot' && a)));
      if (both) kindLatch = 'lobshot';
      else if (d) kindLatch = 'shot'; else if (w) kindLatch = 'through'; else if (a) kindLatch = 'lob'; else if (s) kindLatch = 'pass';
      slide = false;
    }
    sprint = k('KeyE');
    hold = k('ShiftLeft') || k('ShiftRight');
    swap = k('KeyQ');
  }
  // dokunmatik: joystick, ŞUT (pas yardımı ayarına göre pas ya da şut), TUT, PAS, KAY
  if (touchIn.active){ x += touchIn.x; y += touchIn.y; }
  if (k('T:kick')){ kick = true; kindLatch = 'pass'; }
  slide = slide || k('T:slide');
  hold = hold || k('T:hold');
  sprint = sprint || (touchIn.active && Math.hypot(touchIn.x, touchIn.y) > .93);
  // basılı tüm özel şut tuşları: birden çoksa kombo ('falso+fuze' gibi)
  const shots = (LAYOUTS[layout] || LAYOUTS.fifa).shots;
  const special = normShot(SHOT_TYPES.filter(t => k(shots[t]) || k('T:' + t)));
  const call = k('KeyF') || k('T:call');
  prevKick = !!kick;
  return { x, y, kick, kind: kindLatch, special, call, hold, sprint, slide, swap };
}
