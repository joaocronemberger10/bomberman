// ============================================================================
// player.js — Jogador: modelo 3D (GLB), animações, movimento e atributos.
//
// O modelo é carregado de PLAYER_MODEL_PATH (veja config.js). Se o arquivo não
// existir, um personagem provisório feito de formas simples é usado no lugar.
// ============================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG, PLAYER_MODEL_PATH, PLAYER_SCALE } from './config.js';
import { GridMover } from './mover.js';
import { normalizeModel } from './model.js';

// Busca flexível das animações pelo nome (maiúsculas/minúsculas não importam).
const ANIM_PATTERNS = {
  idle: /idle|stand|breath|wait|parad/i,
  walk: /walk|run|jog|move|andar|corr/i,
  death: /death|die|dead|dying|fall|defeat|knock|morte|morr/i,
};

export class Player {
  constructor(scene, map) {
    this.map = map;
    this.mover = new GridMover();

    // root: posição no mundo | pivot: rotação/balanço | visual: malha exibida
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.pivot.rotation.order = 'YXZ';
    this.root.add(this.pivot);
    scene.add(this.root);

    this.visual = this._buildPlaceholder();
    this.pivot.add(this.visual);

    // Animações do arquivo (preenchidas se o GLB tiver clipes).
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;
    this.animState = 'idle';
    this.animTime = 0;
    this.deathTimeScale = 1;   // acelera clipes de morte longos (veja _useModel)

    this.angle = 0;         // ângulo atual (para onde o personagem olha)
    this.targetAngle = 0;

    this.resetStats();
    this._loadModel();
  }

  // -------------------------------------------------------------- atributos

  /** Volta aos atributos iniciais (novo jogo). */
  resetStats() {
    this.lives = CONFIG.PLAYER_LIVES;
    this.maxBombs = CONFIG.PLAYER_BOMBS;
    this.range = CONFIG.PLAYER_RANGE;
    this.speed = CONFIG.PLAYER_SPEED;
    this.special = null;       // bomba especial em uso: { type, ammo }
    this.slowTime = 0;         // segundos lento (congelado pelo Yeti)
    this.invulnerable = 0;
    this.dead = false;
  }

  /** Coloca o jogador em uma célula (início de fase). */
  place(col, row) {
    this.mover.setCell(col, row);
    this.sliding = false;      // escorregando no gelo
    this.dead = false;
    this.deathTime = 0;
    this.targetAngle = this.angle = 0;
    this.pivot.scale.setScalar(1);
    this.pivot.rotation.set(0, CONFIG.PLAYER_ROTATION_OFFSET, 0);
    this.visual.visible = true;
    this._setAnim('idle', true);
    this._syncPosition();
  }

  get col() { return this.mover.cellCol; }
  get row() { return this.mover.cellRow; }
  get position() { return this.root.position; }

  /**
   * Aplica dano. Devolve true se o dano foi aplicado (false se estava
   * invencível ou já derrotado).
   */
  damage() {
    if (this.dead || this.invulnerable > 0) return false;
    this.lives--;
    if (this.lives <= 0) {
      this.lives = 0;
      this.dead = true;
      this.deathTime = 0;
      this._setAnim('death');
    } else {
      this.invulnerable = CONFIG.INVULNERABLE_TIME;
    }
    return true;
  }

  /** Aplica um power-up. */
  applyPowerUp(type) {
    if (type === 'bomb') this.maxBombs = Math.min(this.maxBombs + 1, CONFIG.PLAYER_MAX_BOMBS);
    else if (type === 'range') this.range = Math.min(this.range + 1, CONFIG.PLAYER_MAX_RANGE);
    else if (type === 'speed') this.speed = Math.min(this.speed + CONFIG.PLAYER_SPEED_BONUS, CONFIG.PLAYER_SPEED_MAX);
    else if (type === 'life') this.lives = Math.min(this.lives + 1, CONFIG.PLAYER_MAX_LIVES);
    else if (CONFIG.SPECIAL_AMMO[type]) {
      // Bomba especial: soma munição se for do mesmo tipo, senão troca.
      const atual = this.special && this.special.type === type ? this.special.ammo : 0;
      this.special = { type, ammo: atual + CONFIG.SPECIAL_AMMO[type] };
    }
  }

  /** Tipo da próxima bomba; gasta uma unidade da munição especial, se houver. */
  takeBombType() {
    if (!this.special) return 'normal';
    const type = this.special.type;
    if (--this.special.ammo <= 0) this.special = null;
    return type;
  }

  // ------------------------------------------------------------- atualização

  /**
   * @param {number} dt segundos desde o último quadro
   * @param {Array<{dx:number,dz:number}>} dirs direções desejadas (por prioridade)
   * @param {(col:number,row:number)=>boolean} canEnter diz se uma célula está livre
   * @param {object} [terrain] perigos do cenário: speedFactor(col,row) e isIce(col,row)
   */
  update(dt, dirs, canEnter, terrain = null) {
    this.animTime += dt;

    if (this.dead) {
      this.deathTime += dt;
    } else {
      this._move(dt, dirs, canEnter, terrain);
      if (this.slowTime > 0) this.slowTime = Math.max(0, this.slowTime - dt);
      if (this.invulnerable > 0) this.invulnerable = Math.max(0, this.invulnerable - dt);
    }

    // Pisca enquanto estiver invencível.
    this.visual.visible = this.invulnerable <= 0 || Math.floor(this.animTime * 14) % 2 === 0;

    this._syncPosition();
    this._animate(dt);
  }

  _move(dt, dirs, canEnter, terrain) {
    const m = this.mover;

    // Meia-volta imediata se o jogador apertar a direção oposta (não vale no gelo).
    if (m.moving && dirs.length && !this.sliding) {
      const d = dirs[0];
      if (d.dx === -m.dirX && d.dz === -m.dirZ && canEnter(m.col, m.row)) m.reverse();
    }

    // Terreno: lama deixa lento, gelo acelera.
    let resto = this.speed * dt * (terrain ? terrain.speedFactor(m.cellCol, m.cellRow) : 1) * (this.slowTime > 0 ? 0.45 : 1);
    let guarda = 0;
    while (resto > 1e-6 && guarda++ < 4) {
      if (!m.moving) {
        let d;
        if (this.sliding && canEnter(m.col + m.dirX, m.row + m.dirZ)) {
          // No gelo: continua escorregando na mesma direção, sem controle.
          d = { dx: m.dirX, dz: m.dirZ };
        } else {
          this.sliding = false;
          d = dirs.find((d) => canEnter(m.col + d.dx, m.row + d.dz));
        }
        if (!d) {
          if (dirs[0]) this._face(dirs[0].dx, dirs[0].dz);   // olha para a parede
          break;
        }
        m.start(d.dx, d.dz);
      }
      this._face(m.dirX, m.dirZ);
      resto = m.advance(resto);
      // Chegou a uma célula de gelo andando: começa (ou continua) a escorregar.
      if (!m.moving) this.sliding = !!terrain && terrain.isIce(m.col, m.row);
    }

    this._setAnim(m.moving && !this.sliding ? 'walk' : 'idle');
  }

  _face(dx, dz) {
    this.targetAngle = Math.atan2(dx, dz);
  }

  _syncPosition() {
    const { COLS, ROWS } = CONFIG;
    this.root.position.set(this.mover.gx - (COLS - 1) / 2, 0, this.mover.gz - (ROWS - 1) / 2);
  }

  // --------------------------------------------------------------- animação

  _animate(dt) {
    if (this.mixer) this.mixer.update(dt);

    // Vira suavemente na direção do movimento (pelo caminho mais curto).
    let diff = this.targetAngle - this.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.angle += diff * Math.min(1, dt * 16);

    const p = this.pivot;
    const t = this.animTime;
    const temClipe = !!this.actions[this.animState];
    let y = 0, tilt = 0, scale = 1, spin = 0;

    if (this.animState === 'death') {
      if (!temClipe) {
        // Sem animação de morte no arquivo: gira e encolhe.
        const k = Math.min(1, this.deathTime / 1.1);
        spin = k * k * 14;
        scale = 1 - k;
        y = Math.sin(k * Math.PI) * 0.5;
      }
    } else if (!temClipe) {
      // Animação por código: balanço ao andar, "respiração" parado.
      if (this.animState === 'walk') {
        y = Math.abs(Math.sin(t * 11)) * 0.07;
        tilt = Math.sin(t * 11) * 0.1;
      } else {
        scale = 1 + Math.sin(t * 2.4) * 0.025;
      }
    }

    p.position.y = y;
    p.rotation.set(0, this.angle + spin + CONFIG.PLAYER_ROTATION_OFFSET, tilt);
    p.scale.set(1, Math.max(scale, 0.0001), 1);
    if (this.animState === 'death' && !temClipe) p.scale.setScalar(Math.max(scale, 0.0001));
  }

  /** Troca de estado de animação (idle / walk / death). */
  _setAnim(state, force = false) {
    if (state === this.animState && !force) return;
    this.animState = state;
    if (!this.mixer) return;

    const alvo = this.actions[state];
    const atual = this.currentAction;
    if (alvo) {
      // A caminhada acompanha a velocidade do jogador; a morte cabe no tempo da cena.
      alvo.timeScale = state === 'death' ? this.deathTimeScale
        : state === 'walk' ? 1.3 * this.speed / CONFIG.PLAYER_SPEED : 1;
      if (alvo !== atual || force) {
        alvo.reset().fadeIn(0.15).play();
        if (atual && atual !== alvo) atual.fadeOut(0.15);
        this.currentAction = alvo;
      }
    } else {
      // Não há clipe para este estado: congela uma pose (a atual ou o início
      // da caminhada) e deixa a animação por código assumir. Evita a "pose em T".
      const base = (state === 'death' ? atual : this.actions.walk) || atual;
      if (!base) return;
      if (base !== atual) {
        base.reset().play();
        if (atual) atual.stop();
        this.currentAction = base;
      }
      base.timeScale = 0;
    }
  }

  // ---------------------------------------------------------------- modelos

  /** Personagem provisório feito de formas simples. */
  _buildPlaceholder() {
    const g = new THREE.Group();
    const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });

    const corpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.2, 4, 14), mat(0xff7a3d));
    corpo.position.y = 0.36;
    const cabeca = new THREE.Mesh(new THREE.SphereGeometry(0.25, 20, 14), mat(0xffe3c2));
    cabeca.position.y = 0.72;
    const capacete = new THREE.Mesh(
      new THREE.SphereGeometry(0.27, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(0x3d7bff));
    capacete.position.y = 0.74;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.08), mat(0x1c2340, { roughness: 0.2 }));
    visor.position.set(0, 0.72, 0.21);
    const mochila = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.24, 0.14), mat(0x2f3d8f));
    mochila.position.set(0, 0.4, -0.22);
    const peE = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat(0x2f3d8f));
    peE.position.set(-0.12, 0.08, 0.04);
    const peD = peE.clone();
    peD.position.x = 0.12;

    g.add(corpo, cabeca, capacete, visor, mochila, peE, peD);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  /** Tenta carregar o GLB; em caso de falha mantém o personagem provisório. */
  _loadModel() {
    new GLTFLoader().load(
      PLAYER_MODEL_PATH,
      (gltf) => {
        try { this._useModel(gltf); }
        catch (err) { console.warn('[player] Falha ao preparar o modelo; usando o provisório.', err); }
      },
      undefined,
      () => console.info(`[player] "${PLAYER_MODEL_PATH}" não encontrado — usando o personagem provisório.`)
    );
  }

  _useModel(gltf) {
    const model = gltf.scene;

    // Normaliza o tamanho: o modelo passa a ter PLAYER_HEIGHT * PLAYER_SCALE de
    // altura, fica centralizado na célula e com os pés no chão.
    const wrapper = normalizeModel(model, CONFIG.PLAYER_HEIGHT * PLAYER_SCALE);
    this.pivot.remove(this.visual);
    this.visual = wrapper;
    this.pivot.add(wrapper);

    // Animações: procura idle / walk / death pelo nome.
    const clips = gltf.animations || [];
    if (clips.length) {
      this.mixer = new THREE.AnimationMixer(model);
      const found = {};
      for (const key of Object.keys(ANIM_PATTERNS)) {
        found[key] = clips.find((c) => ANIM_PATTERNS[key].test(c.name));
      }
      // Se nenhum nome bater com "walk", usa o primeiro clipe que sobrar.
      if (!found.walk) found.walk = clips.find((c) => c !== found.idle && c !== found.death);
      for (const key of Object.keys(found)) {
        if (found[key]) this.actions[key] = this.mixer.clipAction(found[key]);
      }
      if (this.actions.death) {
        this.actions.death.setLoop(THREE.LoopOnce, 1);
        this.actions.death.clampWhenFinished = true;
        // O jogo espera ~1,5 s antes da tela de fim de jogo: clipes mais longos são acelerados.
        this.deathTimeScale = Math.max(1, found.death.duration / 1.3);
      }
      console.info('[player] Animações encontradas:', clips.map((c) => c.name),
        '→ usadas:', Object.keys(this.actions));
      this._setAnim(this.animState, true);
    }
  }
}
