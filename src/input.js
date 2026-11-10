// ============================================================================
// input.js — Entrada do jogador (teclado e toque).
// Teclado: setas ou WASD para mover, espaço para bomba, P para pausar.
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
