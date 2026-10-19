/* ---------- girdi ----------
   Klavye, sanal joystick ve dokunmatik düğmeler -> { x, y, kick, special, call, hold, sprint, slide } */
import { SHOT_TYPES, normShot } from '../shared/constants.js';
import { ensureAudio } from './audio.js';

// özel şut tuşları: [1. oyuncu, 2. oyuncu]
export const SHOT_KEYS = { falso: ['KeyQ', 'KeyJ'], fuze: ['KeyE', 'KeyK'], asirtma: ['KeyR', 'KeyL'] };

const keys = new Set();
// son basılma anı: bir oyun karesinden kısa dokunuşlar da en az TAP_MS boyunca basılı sayılır
const downAt = new Map(), TAP_MS = 40;
const GAME_KEYS = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyW','KeyA','KeyS','KeyD','KeyX','Enter','NumpadEnter','KeyQ','KeyE','KeyR','KeyJ','KeyK','KeyL','KeyF','KeyH','ShiftLeft','KeyC','ShiftRight','Numpad0','KeyU','KeyV','KeyI'];
const touchIn = { x:0, y:0, active:false, id:null, ox:0, oy:0 };   // sanal joystick

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

// ctrl: 'h1' ya da 'h2'; friend: aynı klavyede iki kişi
export function readInput(ctrl, friend){
  const now = performance.now();
  const k = c => keys.has(c) || now - (downAt.get(c) || -1e9) < TAP_MS;
  let x = 0, y = 0, kick = false;
  if (ctrl === 'h1'){
    x = (k('KeyD')?1:0) - (k('KeyA')?1:0); y = (k('KeyS')?1:0) - (k('KeyW')?1:0);
    kick = k('Space') || k('KeyX');
    if (!friend){
      x += (k('ArrowRight')?1:0) - (k('ArrowLeft')?1:0); y += (k('ArrowDown')?1:0) - (k('ArrowUp')?1:0);
      kick = kick || k('Enter') || k('NumpadEnter');
    }
    if (touchIn.active){ x += touchIn.x; y += touchIn.y; }
    kick = kick || k('T:kick');
  } else {
    x = (k('ArrowRight')?1:0) - (k('ArrowLeft')?1:0); y = (k('ArrowDown')?1:0) - (k('ArrowUp')?1:0);
    kick = k('Enter') || k('NumpadEnter');
  }
  // basılı tüm özel şut tuşları: birden çoksa kombo ('falso+fuze' gibi)
  const pressed = SHOT_TYPES.filter(t => k(SHOT_KEYS[t][ctrl === 'h1' ? 0 : 1]) || (ctrl === 'h1' && k('T:' + t)));
  const special = normShot(pressed);
  const call = ctrl === 'h1' ? (k('KeyF') || k('T:call')) : k('KeyH');
  const hold = ctrl === 'h1' ? (k('KeyC') || k('T:hold')) : (k('KeyU') || k('Numpad0'));
  const sprint = ctrl === 'h1'
    ? (k('ShiftLeft') || (!friend && k('ShiftRight')) || (touchIn.active && Math.hypot(touchIn.x, touchIn.y) > .93))
    : k('ShiftRight');
  // kayma: 1. oyuncu V, 2. oyuncu I
  const slide = ctrl === 'h1' ? (k('KeyV') || k('T:slide')) : k('KeyI');
  return { x, y, kick, special, call, hold, sprint, slide };
}
