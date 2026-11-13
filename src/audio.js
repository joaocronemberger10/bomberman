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

  /**
   * Deve ser chamado em um gesto do usuário (toque/clique/tecla) para liberar
   * o áudio — os navegadores bloqueiam som antes disso. Pode ser chamado
   * quantas vezes for preciso.
   */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      // iPhone: sem isto o som do jogo fica mudo quando a chave lateral está
      // no modo silencioso.
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* não suportado */ }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.ctx.destination);
      // Ruído branco reutilizado nas explosões.
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    // 'suspended' (ainda bloqueado) ou 'interrupted' (iPhone após ligação/troca de app).
    if (this.ctx.state !== 'running') {
      const p = this.ctx.resume();
      if (p && p.catch) p.catch(() => {});
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.8;
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

  /** Sons dos chefões. */
  boss(nome) {
    if (nome === 'bosshit') { this._tone(180, 0.25, { type: 'sawtooth', vol: 0.3, slide: -120 }); this._noise(0.2, { vol: 0.4, from: 3000, to: 300 }); }
    else if (nome === 'bossdown') { this._noise(1.4, { vol: 0.8, from: 2500, to: 60 }); [523, 659, 784, 1047, 1319].forEach((f, i) => this._tone(f, 0.2, { vol: 0.16, delay: 0.5 + i * 0.1 })); }
    else if (nome === 'charge') this._tone(220, 0.5, { type: 'sawtooth', vol: 0.12, slide: 500 });
    else if (nome === 'slam') { this._noise(0.6, { vol: 0.7, from: 1600, to: 60 }); this._tone(70, 0.4, { type: 'sine', vol: 0.6, slide: -40 }); }
    else if (nome === 'summon') [330, 440, 660].forEach((f, i) => this._tone(f, 0.12, { type: 'triangle', vol: 0.15, delay: i * 0.06 }));
    else if (nome === 'laser') this._tone(1400, 0.4, { type: 'square', vol: 0.14, slide: -1200 });
    else if (nome === 'teleport') this._tone(300, 0.35, { type: 'sine', vol: 0.2, slide: 1500 });
    else if (nome === 'roar') { this._tone(110, 0.6, { type: 'sawtooth', vol: 0.22, slide: -50 }); this._noise(0.5, { vol: 0.25, from: 900, to: 200 }); }
    else if (nome === 'freeze') this._noise(0.6, { vol: 0.3, from: 8000, to: 2000 });
    else if (nome === 'impact') this.impact();
  }

  /** Impacto de bola de fogo (explosão mais curta). */
  impact() {
    this._noise(0.3, { vol: 0.45, from: 1200, to: 150 });
    this._tone(90, 0.25, { type: 'sine', vol: 0.4, slide: -50 });
  }

  /** Dano causado por um perigo do cenário. */
  zap() {
    this._tone(900, 0.12, { type: 'sawtooth', vol: 0.2, slide: -700 });
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
