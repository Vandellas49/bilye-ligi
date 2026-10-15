/* ---------- ses ----------
   WebAudio ile üretilen sesler; dosya kullanılmıyor. */

let actx = null, muted = false, active = false, lastBounce = 0;

export function ensureAudio(){
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){ actx = null; } }
  if (actx && actx.state === 'suspended') actx.resume();
}
// yalnızca maç sırasında ses çıkar (menü arkasındaki demo sessiz)
export function setSoundActive(on){ active = on; }
export function toggleMute(){ muted = !muted; return muted; }

function soundOn(){ return actx && !muted && active; }
function tone(f, dur, type, vol, f2){
  if (!soundOn()) return;
  const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + .02);
}
function noise(dur, vol, freq, attack){
  if (!soundOn()) return;
  const t = actx.currentTime, len = Math.floor(actx.sampleRate * dur);
  const buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random()*2 - 1;
  const src = actx.createBufferSource(); src.buffer = buf;
  const fl = actx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = freq; fl.Q.value = .8;
  const g = actx.createGain();
  g.gain.setValueAtTime(attack ? 0.0001 : vol, t);
  if (attack) g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(fl).connect(g).connect(actx.destination); src.start(t);
}

export const sfx = {
  kick(){ noise(.06, .4, 1400); tone(160, .09, 'sine', .35, 55); },
  bounce(s){ const n = performance.now(); if (n - lastBounce < 60) return; lastBounce = n; tone(260, .05, 'triangle', Math.min(.12, s*.025)); },
  whistle(){ tone(2100, .12, 'square', .04); setTimeout(() => tone(2100, .3, 'square', .04), 160); },
  falso(){ tone(380, .22, 'triangle', .16, 980); noise(.08, .25, 2200); },
  fuze(){ noise(.35, .5, 500); tone(110, .35, 'sawtooth', .18, 40); tone(900, .12, 'square', .05, 300); },
  tackle(){ noise(.14, .3, 900, .02); },
  tackleWin(){ tone(520, .08, 'triangle', .14); setTimeout(() => tone(780, .12, 'triangle', .14), 70); },
  tackleMiss(){ tone(300, .18, 'triangle', .12, 140); },
  call(){ tone(880, .07, 'sine', .12); setTimeout(() => tone(1180, .09, 'sine', .12), 70); },
  asirtma(){ tone(260, .2, 'sine', .25, 620); noise(.05, .2, 1800); },
  goal(){ noise(1.6, .25, 700, .15); tone(523, .15, 'triangle', .12); setTimeout(() => tone(659, .15, 'triangle', .12), 120); setTimeout(() => tone(784, .3, 'triangle', .12), 240); },
};
