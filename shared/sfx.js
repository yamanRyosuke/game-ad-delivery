/*
 * sfx.js — Web Audio API の最小限のラッパー
 *
 * 効果音ファイルを持たず、その場で合成する。読み込むファイルが増えないので
 * 広告として軽い。
 *
 * ★ AudioContext を作るのは SFX.unlock() の中だけ。
 *   ゲーム側は必ず「ユーザーが開始ボタンを押した後」に呼ぶこと。
 *   ページを開いただけで音が鳴る作りにしてはいけない（Autoplay Policy）。
 */
(() => {
  'use strict';

  let ac = null, master = null, noiseBuf = null;

  function unlock() {
    if (ac) {
      if (ac.state === 'suspended' && ac.resume) ac.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.28;
      master.connect(ac.destination);
      if (ac.state === 'suspended' && ac.resume) ac.resume();
    } catch (e) {
      ac = null; master = null;
    }
  }

  function tone(freq, dur, type, gain, toFreq, delay) {
    if (!ac) return;
    const t = ac.currentTime + (delay || 0);
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (toFreq) o.frequency.exponentialRampToValueAtTime(Math.max(20, toFreq), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.03, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(dur, f0, f1, gain, delay) {
    if (!ac) return;
    const t = ac.currentTime + (delay || 0);
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 1.2), ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const bp = ac.createBiquadFilter(); bp.type = 'lowpass';
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp); bp.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.05);
  }

  window.SFX = { unlock: unlock, tone: tone, noise: noise };
})();
