// ============================================================================
// game.js — Ponto de entrada: cena, câmera, luzes e laço principal do jogo.
// ============================================================================
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { GameMap } from './map.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { BombManager } from './bombs.js';
import { ParticleSystem } from './particles.js';
import { AudioFX } from './audio.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this._setupRenderer();
    this._setupScene();

    this.map = new GameMap(this.scene);
    this.player = new Player(this.scene, this.map);
    this.input = new Input();
    this.audio = new AudioFX();
    this.input.onAnyInput = () => this.audio.unlock();

    // Partículas: fogo (brilho aditivo) e destroços dos blocos (normal).
    const n = CONFIG.MAX_PARTICLES;
    this.fire = new ParticleSystem(this.scene, { count: n, size: 0.42, additive: true });
    this.debris = new ParticleSystem(this.scene, { count: Math.floor(n / 2), size: 0.22, additive: false });

    this.bombs = new BombManager(this.scene, this.map, {
      onExplosion: (col, row, cells) => this._onExplosion(col, row, cells),
      onBlockDestroyed: (col, row) => this._onBlockDestroyed(col, row),
    });

    // Clarão das explosões (uma única luz reaproveitada).
    this.flash = new THREE.PointLight(0xffa640, 0, 9, 1.6);
    this.flash.position.y = 1.4;
    this.scene.add(this.flash);

    this.state = 'playing';
    this.level = 1;
    this.shake = 0;               // intensidade atual do tremor de câmera
    this.clock = new THREE.Clock();

    this.loadLevel(1);

    window.addEventListener('resize', () => this._resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this._resize(), 200));
    this._resize();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  // ------------------------------------------------------------ preparação

  _setupRenderer() {
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.MAX_PIXEL_RATIO);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: dpr < 2,              // em telas densas o antialias custa caro e pouco aparece
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  _setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x161a36);

    this.camera = new THREE.PerspectiveCamera(CONFIG.CAMERA_FOV, 1, 0.5, 120);
    this.cameraBase = new THREE.Vector3();

    // Luz ambiente suave (céu/chão) + sol com sombras suaves.
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x5a6bb5, 1.15));
    const sol = new THREE.DirectionalLight(0xfff2dc, 2.1);
    sol.position.set(-6, 16, 7);
    sol.castShadow = true;
    sol.shadow.mapSize.set(CONFIG.SHADOW_MAP_SIZE, CONFIG.SHADOW_MAP_SIZE);
    const s = sol.shadow.camera;
    s.left = -9.5; s.right = 9.5; s.top = 9; s.bottom = -9; s.near = 1; s.far = 40;
    sol.shadow.bias = -0.0004;
    sol.shadow.normalBias = 0.03;
    this.scene.add(sol);
  }

  /** Espaço (em px) reservado no topo e na base da tela para a interface. */
  _uiMargins() {
    return { top: 0, bottom: 0 };
  }

  /**
   * Ajusta o tamanho do canvas e afasta a câmera o suficiente para a arena
   * inteira caber na área livre da tela (funciona em retrato e paisagem).
   */
  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const cam = this.camera;
    cam.aspect = w / h;
    cam.clearViewOffset();
    cam.updateProjectionMatrix();

    const { COLS, ROWS } = CONFIG;
    const tilt = THREE.MathUtils.degToRad(CONFIG.CAMERA_TILT);
    const dir = new THREE.Vector3(0, Math.sin(tilt), Math.cos(tilt));
    const hx = COLS / 2 + 0.3, hz = ROWS / 2 + 0.3;
    const cantos = [];
    for (const x of [-hx, hx]) for (const z of [-hz, hz]) for (const y of [0, 1]) cantos.push(new THREE.Vector3(x, y, z));

    const m = this._uiMargins();
    const largura = 2 * 0.985;                              // faixa útil em NDC
    const altura = 2 * (1 - (m.top + m.bottom) / h) * 0.985;
    const v = new THREE.Vector3();
    let minY = 0, maxY = 0;

    const medir = (dist) => {
      cam.position.copy(dir).multiplyScalar(dist);
      cam.lookAt(0, 0, 0);
      cam.updateMatrixWorld();
      let minX = Infinity, maxX = -Infinity;
      minY = Infinity; maxY = -Infinity;
      for (const c of cantos) {
        v.copy(c).project(cam);
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      }
      return (maxX - minX) <= largura && (maxY - minY) <= altura;
    };

    // Busca binária da menor distância em que tudo cabe.
    let perto = 6, longe = 110;
    for (let i = 0; i < 24; i++) {
      const meio = (perto + longe) / 2;
      if (medir(meio)) longe = meio; else perto = meio;
    }
    medir(longe);
    this.cameraBase.copy(cam.position);

    // Centraliza a arena na área livre (entre a HUD e os controles de toque).
    const centroAtual = (minY + maxY) / 2;
    const centroDesejado = (m.bottom - m.top) / h;
    const deslocY = Math.round((centroDesejado - centroAtual) * h / 2);
    if (deslocY !== 0) cam.setViewOffset(w, h, 0, deslocY, w, h);
  }

  // ------------------------------------------------------------------ fases

  loadLevel(level) {
    this.level = level;
    this.bombs.clear();
    this.map.generate(0);
    const s = this.map.playerStart;
    this.player.place(s.col, s.row);
    this.input.reset();
  }

  /** Diz se uma célula pode ser ocupada por quem está andando. */
  canEnter(col, row) {
    return this.map.isEmpty(col, row) && !this.bombs.hasBomb(col, row);
  }

  // ---------------------------------------------------------------- eventos

  _onExplosion(col, row, cells) {
    this.audio.explosion();
    this.shake = Math.min(1.4, this.shake + 0.8);
    const p = this.map.cellToWorld(col, row);
    this.flash.position.set(p.x, 1.4, p.z);
    this.flash.intensity = 16;
    for (const c of cells) {
      this.map.cellToWorld(c.col, c.row, p);
      this.fire.emit(p.x, 0.35, p.z, {
        count: c.dx === 0 && c.dz === 0 ? 14 : 7,
        colors: [0xffe27a, 0xffa530, 0xff5a1f, 0xff3b1f],
        speed: 2.2, up: 2.6, life: 0.6, gravity: 3, spread: 0.6,
      });
    }
  }

  _onBlockDestroyed(col, row) {
    const p = this.map.cellToWorld(col, row);
    this.debris.emit(p.x, 0.35, p.z, {
      count: 10, colors: [0xf2a03d, 0xd97f1e, 0xffc56b, 0x8a5a1e],
      speed: 2.6, up: 3.6, life: 0.8, gravity: 12, spread: 0.5,
    });
  }

  _hurtPlayer() {
    if (!this.player.damage()) return;
    this.audio.hurt();
    this.shake = Math.min(1.4, this.shake + 0.5);
  }

  // ------------------------------------------------------------ laço do jogo

  _frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.state === 'playing') this._update(dt);
    if (this.state !== 'paused') {
      this.fire.update(dt);
      this.debris.update(dt);
      this.flash.intensity = Math.max(0, this.flash.intensity - dt * 45);
    }
    this._updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _update(dt) {
    const player = this.player;
    player.update(dt, this.input.directions(), (c, r) => this.canEnter(c, r));

    // Bomba: colocada na célula do jogador, respeitando o limite simultâneo.
    if (this.input.consumeBomb() && !player.dead && this.bombs.count < player.maxBombs) {
      if (this.bombs.place(player.col, player.row, player.range)) this.audio.placeBomb();
    }

    this.bombs.update(dt);

    // Dano das chamas no jogador.
    if (this.bombs.isFlame(player.col, player.row)) this._hurtPlayer();
  }

  _updateCamera(dt) {
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const k = this.shake * this.shake * 0.35;
    this.camera.position.set(
      this.cameraBase.x + (Math.random() - 0.5) * k,
      this.cameraBase.y + (Math.random() - 0.5) * k,
      this.cameraBase.z + (Math.random() - 0.5) * k
    );
  }
}

window.game = new Game();
