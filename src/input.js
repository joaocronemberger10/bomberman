// ============================================================================
// input.js — Entrada do jogador (teclado e toque).
// Teclado: setas ou WASD para mover, espaço para bomba, P para pausar.
// Toque: joystick virtual à esquerda e botão de bomba à direita.
// ============================================================================

const KEY_DIRS = {
  ArrowUp: { dx: 0, dz: -1 }, KeyW: { dx: 0, dz: -1 },
  ArrowDown: { dx: 0, dz: 1 }, KeyS: { dx: 0, dz: 1 },
  ArrowLeft: { dx: -1, dz: 0 }, KeyA: { dx: -1, dz: 0 },
  ArrowRight: { dx: 1, dz: 0 }, KeyD: { dx: 1, dz: 0 },
};

export class Input {
  constructor() {
    this.held = [];            // teclas de direção pressionadas (a mais recente por último)
    this.touchDirs = [];       // direções vindas do joystick virtual
    this.bombPressed = false;
    this.onPause = null;       // callback: tecla P / Esc
    this.onConfirm = null;     // callback: Enter (confirma o botão principal das telas)
    this.onAnyInput = null;    // callback: primeiro gesto do usuário (libera o áudio)

    window.addEventListener('keydown', (e) => this._keyDown(e));
    window.addEventListener('keyup', (e) => this._keyUp(e));
    window.addEventListener('blur', () => this.reset());

    // Evita menu de contexto, zoom por gesto e duplo toque durante o jogo.
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('gesturestart', (e) => e.preventDefault());
    window.addEventListener('dblclick', (e) => e.preventDefault());

    this.isTouch = false;
    this.onTouchDetected = null;   // callback: descobrimos que é uma tela de toque
    this._setupTouch();
  }

  // ------------------------------------------------------------------ toque

  /**
   * Joystick virtual "flutuante": o toque em qualquer ponto da metade esquerda
   * da tela vira o centro do joystick. O botão de bomba fica à direita.
   */
  _setupTouch() {
    const zone = document.getElementById('touch-zone');
    const base = document.getElementById('joy-base');
    const knob = document.getElementById('joy-knob');
    const bomb = document.getElementById('btn-bomb');
    if (!zone || !base || !knob || !bomb) return;

    const marcarToque = () => {
      if (this.isTouch) return;
      this.isTouch = true;
      document.body.classList.add('touch');
      if (this.onTouchDetected) this.onTouchDetected();
    };
    if (window.matchMedia('(pointer: coarse)').matches) marcarToque();
    window.addEventListener('touchstart', marcarToque, { passive: true });

    const RAIO = 48;          // curso máximo do manche (px)
    const ZONA_MORTA = 0.3;   // fração do raio ignorada no centro
    let id = null, cx = 0, cy = 0;

    const posicionar = () => {
      const r = zone.getBoundingClientRect();
      base.style.left = `${cx - r.left}px`;
      base.style.top = `${cy - r.top}px`;
    };

    const soltar = (e) => {
      if (e && e.pointerId !== id) return;
      id = null;
      this.touchDirs = [];
      base.classList.remove('active');
      base.style.left = base.style.top = '';
      knob.style.transform = '';
    };

    zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      e.preventDefault();
      if (this.onAnyInput) this.onAnyInput();
      id = e.pointerId;
      try { zone.setPointerCapture(id); } catch { /* alguns navegadores não suportam */ }
      cx = e.clientX; cy = e.clientY;
      base.classList.add('active');
      posicionar();
    });

    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      e.preventDefault();
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > RAIO) {
        // O centro acompanha o dedo: trocar de direção fica sempre rápido.
        cx += (dx / len) * (len - RAIO);
        cy += (dy / len) * (len - RAIO);
        dx = (dx / len) * RAIO; dy = (dy / len) * RAIO;
        posicionar();
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;

      const dirs = [];
      if (Math.hypot(dx, dy) > RAIO * ZONA_MORTA) {
        const horiz = { dx: Math.sign(dx), dz: 0 }, vert = { dx: 0, dz: Math.sign(dy) };
        const ax = Math.abs(dx), ay = Math.abs(dy);
        // Direção dominante primeiro; a outra entra como alternativa nas diagonais.
        if (ax >= ay) { dirs.push(horiz); if (ay > ax * 0.5) dirs.push(vert); }
        else { dirs.push(vert); if (ax > ay * 0.5) dirs.push(horiz); }
      }
      this.touchDirs = dirs;
    });

    zone.addEventListener('pointerup', soltar);
    zone.addEventListener('pointercancel', soltar);
    this._releaseTouch = () => soltar();

    bomb.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.onAnyInput) this.onAnyInput();
      this.bombPressed = true;
      bomb.classList.add('active');
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
      bomb.addEventListener(ev, () => bomb.classList.remove('active'));
    }
  }

  _keyDown(e) {
    if (this.onAnyInput) this.onAnyInput();
    if (KEY_DIRS[e.code]) {
      e.preventDefault();
      if (!this.held.includes(e.code)) this.held.push(e.code);
      return;
    }
    if (e.repeat) return;
    if (e.code === 'Space') { e.preventDefault(); this.bombPressed = true; }
    else if (e.code === 'KeyP' || e.code === 'Escape') { if (this.onPause) this.onPause(); }
    else if (e.code === 'Enter') { if (this.onConfirm) this.onConfirm(); }
  }

  _keyUp(e) {
    const i = this.held.indexOf(e.code);
    if (i >= 0) this.held.splice(i, 1);
  }

  /** Solta tudo (usado ao perder o foco, pausar ou trocar de fase). */
  reset() {
    this.held.length = 0;
    if (this._releaseTouch) this._releaseTouch();
    this.touchDirs = [];
    this.bombPressed = false;
  }

  /**
   * Direções desejadas em ordem de prioridade (a mais recente primeiro).
   * As demais servem de alternativa quando a principal está bloqueada,
   * o que deixa as curvas nos corredores bem mais fáceis.
   */
  directions() {
    const out = [...this.touchDirs];
    for (let i = this.held.length - 1; i >= 0; i--) out.push(KEY_DIRS[this.held[i]]);
    return out;
  }

  /** Devolve true uma única vez para cada toque no botão/tecla de bomba. */
  consumeBomb() {
    const p = this.bombPressed;
    this.bombPressed = false;
    return p;
  }
}
