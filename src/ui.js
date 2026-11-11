// ============================================================================
// ui.js — Interface em HTML sobre o canvas: HUD, telas e avisos.
// ============================================================================

export class UI {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.hud = {
      lives: $('hud-lives'), bombs: $('hud-bombs'), range: $('hud-range'),
      level: $('hud-level'), time: $('hud-time'), score: $('hud-score'),
    };
    this.hudBar = $('hud');
    this.overlay = $('overlay');
    this.toastEl = $('toast');
    this.muteBtn = $('btn-mute');
    this.specialChip = $('chip-special');
    this.specialText = $('hud-special');
    this.detonateBtn = $('btn-detonate');
    this.screens = [...document.querySelectorAll('.screen')];
    this.handlers = {};
    this._last = {};          // últimos valores exibidos (evita mexer no DOM à toa)
    this._toastTimer = 0;

    // Qualquer elemento com data-action="..." dispara o handler correspondente.
    document.querySelectorAll('[data-action]').forEach((el) => {
      el.addEventListener('click', () => {
        el.blur();
        const fn = this.handlers[el.dataset.action];
        if (fn) fn();
      });
    });
  }

  /** Registra o que fazer quando um botão (data-action) é acionado. */
  on(action, fn) { this.handlers[action] = fn; }

  /** Altura ocupada pela HUD no topo (px). */
  get hudHeight() { return this.hudBar.offsetHeight || 52; }

  /** Atualiza a HUD. `time` em segundos. */
  setHUD(values) {
    for (const key in values) {
      let v = values[key];
      if (key === 'time') {
        const s = Math.max(0, Math.ceil(v));
        v = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        this.hud.time.parentElement.classList.toggle('alert', s <= 30);
      }
      if (this._last[key] === v) continue;
      this._last[key] = v;
      this.hud[key].textContent = v;
      if (key !== 'time') {
        // Pequeno "pulo" quando o valor muda.
        const chip = this.hud[key].parentElement;
        chip.classList.remove('pop');
        void chip.offsetWidth;
        chip.classList.add('pop');
      }
    }
  }

  /** Bomba especial em uso (texto) — ou null para esconder o indicador. */
  setSpecial(text) {
    if (this._special === text) return;
    this._special = text;
    this.specialChip.hidden = !text;
    this.specialText.textContent = text || '';
  }

  /** Mostra/esconde o botão de detonar (toque). */
  setDetonate(visible) {
    if (this._detonate === visible) return;
    this._detonate = visible;
    this.detonateBtn.hidden = !visible;
  }

  /** Mostra uma tela (menu, paused, levelclear, gameover) e preenche seus campos. */
  show(name, data = {}) {
    for (const s of this.screens) {
      const ativa = s.dataset.screen === name;
      s.classList.toggle('active', ativa);
      if (ativa) {
        s.querySelectorAll('[data-field]').forEach((el) => {
          if (data[el.dataset.field] !== undefined) el.textContent = data[el.dataset.field];
        });
      }
    }
    this.overlay.classList.add('visible');
    document.body.classList.toggle('in-game', false);
  }

  hide() {
    this.overlay.classList.remove('visible');
    document.body.classList.toggle('in-game', true);
  }

  /** Aciona o botão principal da tela visível (tecla Enter). */
  confirm() {
    if (!this.overlay.classList.contains('visible')) return;
    const btn = this.overlay.querySelector('.screen.active .btn.primary');
    if (btn) btn.click();
  }

  /** Aviso rápido no meio da tela. */
  toast(text, ms = 1800) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('visible'), ms);
  }

  setMuted(muted) {
    this.muteBtn.textContent = muted ? '🔇' : '🔊';
    this.muteBtn.setAttribute('aria-pressed', String(muted));
  }
}
