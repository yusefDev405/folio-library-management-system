const AUDIO_KEY = 'folio-desk-audio';
let audioCtx = null;

export function isDeskAudioEnabled() {
  try {
    return localStorage.getItem(AUDIO_KEY) === 'on';
  } catch {
    return false;
  }
}

export function setDeskAudioEnabled(enabled) {
  try {
    localStorage.setItem(AUDIO_KEY, enabled ? 'on' : 'off');
  } catch {
    // ignore
  }
}

export function playScanTone(kind = 'ok') {
  if (!isDeskAudioEnabled()) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioCtx) audioCtx = new AudioCtx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = kind === 'ok' ? 'sine' : 'triangle';
    osc.frequency.value = kind === 'ok' ? 784 : 240;
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (kind === 'ok' ? 0.12 : 0.24));
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + (kind === 'ok' ? 0.13 : 0.25));
  } catch {
    // ignore Web Audio restrictions
  }
}
