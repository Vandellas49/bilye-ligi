/* ---------- girdi ----------
   Klavye, sanal joystick ve dokunmatik düğmeler -> { x, y, kick, special, call, hold, sprint } */
import { SHOT_TYPES } from '../shared/constants.js';
import { ensureAudio } from './audio.js';

// özel şut tuşları: [1. oyuncu, 2. oyuncu]
export const SHOT_KEYS = { falso: ['KeyQ', 'KeyJ'], fuze: ['KeyE', 'KeyK'], asirtma: ['KeyR', 'KeyL'] };

const keys = new Set();
const GAME_KEYS = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyW','KeyA','KeyS','KeyD','KeyX','Enter','NumpadEnter','KeyQ','KeyE','KeyR','KeyJ','KeyK','KeyL','KeyF','KeyH','ShiftLeft','KeyC','ShiftRight','Numpad0','KeyU'];
const touchIn = { x:0, y:0, kick:false, active:false, id:null, ox:0, oy:0, special:null, call:false, hold:false };

export function clearKeys(){ keys.clear(); }

/* onPause: Esc/P basıldığında; isPlaying: maç sürüyor ve duraklatılmamışsa true */
export function initInput({ onPause, isPlaying }){
  addEventListener('keydown', e => {
    if (e.code === 'Escape' || e.code === 'KeyP'){ onPause(); return; }
    if (isPlaying() && GAME_KEYS.includes(e.code)){ e.preventDefault(); ensureAudio(); }
    keys.add(e.code);
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

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

  // basılı tutulan düğme: down/up durumunu touchIn alanına yazar
  const holdButton = (btn, down, up) => {
    btn.addEventListener('pointerdown', e => { e.preventDefault(); ensureAudio(); down(); btn.classList.add('down'); });
    const release = () => { up(); btn.classList.remove('down'); };
    btn.addEventListener('pointerup', release); btn.addEventListener('pointercancel', release); btn.addEventListener('pointerleave', release);
  };
  holdButton($('kickBtn'), () => touchIn.kick = true, () => touchIn.kick = false);
  holdButton($('holdBtn'), () => touchIn.hold = true, () => touchIn.hold = false);
  holdButton($('passBtn'), () => touchIn.call = true, () => touchIn.call = false);
  document.querySelectorAll('.spBtn').forEach(btn => {
    const t = btn.dataset.shot;
    holdButton(btn, () => touchIn.special = t, () => { if (touchIn.special === t) touchIn.special = null; });
  });
}

// ctrl: 'h1' ya da 'h2'; friend: aynı klavyede iki kişi
export function readInput(ctrl, friend){
  const k = c => keys.has(c);
  let x = 0, y = 0, kick = false;
  if (ctrl === 'h1'){
    x = (k('KeyD')?1:0) - (k('KeyA')?1:0); y = (k('KeyS')?1:0) - (k('KeyW')?1:0);
    kick = k('Space') || k('KeyX');
    if (!friend){
      x += (k('ArrowRight')?1:0) - (k('ArrowLeft')?1:0); y += (k('ArrowDown')?1:0) - (k('ArrowUp')?1:0);
      kick = kick || k('Enter') || k('NumpadEnter');
    }
    if (touchIn.active){ x += touchIn.x; y += touchIn.y; }
    kick = kick || touchIn.kick;
  } else {
    x = (k('ArrowRight')?1:0) - (k('ArrowLeft')?1:0); y = (k('ArrowDown')?1:0) - (k('ArrowUp')?1:0);
    kick = k('Enter') || k('NumpadEnter');
  }
  let special = null;
  for (const t of SHOT_TYPES) if (k(SHOT_KEYS[t][ctrl === 'h1' ? 0 : 1])) special = t;
  if (ctrl === 'h1' && touchIn.special) special = touchIn.special;
  const call = ctrl === 'h1' ? (k('KeyF') || touchIn.call) : k('KeyH');
  const hold = ctrl === 'h1' ? (k('KeyC') || touchIn.hold) : (k('KeyU') || k('Numpad0'));
  const sprint = ctrl === 'h1'
    ? (k('ShiftLeft') || (!friend && k('ShiftRight')) || (touchIn.active && Math.hypot(touchIn.x, touchIn.y) > .93))
    : k('ShiftRight');
  return { x, y, kick, special, call, hold, sprint };
}
