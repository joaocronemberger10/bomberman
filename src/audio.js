// ============================================================================
// audio.js — Efeitos sonoros gerados por código com WebAudio.
// Não há nenhum arquivo de áudio: tudo é sintetizado com osciladores e ruído.
// ============================================================================

export class AudioFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('boom-arena-mudo') === '1'; } catch { /* sem armazenamento */ }
  }

  /** Deve ser chamado em um gesto do usuário (clique/tecla) para liberar o áudio. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      // Ruído branco reutilizado nas explosões.
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    try { localStorage.setItem('boom-arena-mudo', this.muted ? '1' : '0'); } catch { /* ignora */ }
    return this.muted;
  }

  /** Toca uma nota simples com envelope de volume. */
  _tone(freq, dur, { type = 'square', vol = 0.25, slide = 0, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Rajada de ruído filtrado (base das explosões). */
  _noise(dur, { vol = 0.6, from = 1800, to = 120 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // ------------------------------------------------------------ efeitos

  explosion() {
    this._noise(0.55, { vol: 0.7 });
    this._tone(110, 0.45, { type: 'sine', vol: 0.6, slide: -80 });
  }

  placeBomb() {
    this._tone(420, 0.09, { type: 'triangle', vol: 0.3, slide: -200 });
  }

  powerUp() {
    [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.12, { vol: 0.16, delay: i * 0.06 }));
  }

  hurt() {
    this._tone(300, 0.3, { type: 'sawtooth', vol: 0.25, slide: -220 });
  }

  enemyDown() {
    this._tone(700, 0.12, { vol: 0.16, slide: 500 });
    this._tone(1100, 0.1, { vol: 0.12, delay: 0.08 });
  }

  doorOpen() {
    [392, 523, 659].forEach((f, i) => this._tone(f, 0.2, { type: 'triangle', vol: 0.25, delay: i * 0.1 }));
  }

  levelClear() {
    [523, 659, 784, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.16, { vol: 0.17, delay: i * 0.11 }));
  }

  gameOver() {
    [392, 330, 262, 196].forEach((f, i) => this._tone(f, 0.3, { type: 'triangle', vol: 0.28, delay: i * 0.22 }));
  }

  click() {
    this._tone(660, 0.05, { type: 'triangle', vol: 0.15 });
  }
}
