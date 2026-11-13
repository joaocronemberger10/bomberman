// ============================================================================
// game.js — Ponto de entrada: cena, câmera, luzes, regras e laço principal.
//
// Estados do jogo:
//   menu        tela inicial (arena ao fundo)
//   playing     partida em andamento
//   paused      pausado
//   levelclear  fase concluída (aguardando "Próxima fase")
//   gameover    fim de jogo
//   victory     todas as fases concluídas
// ============================================================================
import * as THREE from 'three';
import { CONFIG, levelSetup } from './config.js';
import { GameMap } from './map.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { BombManager } from './bombs.js';
import { ParticleSystem } from './particles.js';
import { AudioFX } from './audio.js';
import { PowerUpManager, POWERUP_LABELS } from './powerups.js';
import { EnemyManager } from './enemies.js';
import { UI } from './ui.js';
import { HazardManager } from './hazards.js';
import { Music } from './music.js';

const CHAVE_RECORDE = 'boom-arena-recorde';

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this._setupRenderer();
    this._setupScene();

    this.ui = new UI();
    this.audio = new AudioFX();
    this.music = new Music(this.audio);     // uma música diferente por fase
    this.input = new Input();
    this.map = new GameMap(this.scene);
    this.player = new Player(this.scene, this.map);
    this.powerups = new PowerUpManager(this.scene, this.map);
    this.enemies = new EnemyManager(this.scene, this.map);
    this.bombs = new BombManager(this.scene, this.map, {
      onExplosion: (bomb, cells) => this._onExplosion(bomb, cells),
      onBlockDestroyed: (col, row, bomb) => this._onBlockDestroyed(col, row, bomb),
    });

    // Perigos típicos de cada cenário (lama, espinhos, gelo, lasers, balas, bolas de fogo).
    this.hazards = new HazardManager(this.scene, this.map, {
      onImpact: (col, row) => this._onFireball(col, row),
    });

    // Partículas: fogo (brilho aditivo) e destroços dos blocos (normal).
    const n = CONFIG.MAX_PARTICLES;
    this.fire = new ParticleSystem(this.scene, { count: n, size: 0.42, additive: true });
    this.debris = new ParticleSystem(this.scene, { count: Math.floor(n / 2), size: 0.22, additive: false });

    // Clarão das explosões (uma única luz reaproveitada).
    this.flash = new THREE.PointLight(0xffa640, 0, 9, 1.6);
    this.flash.position.y = 1.4;
    this.scene.add(this.flash);

    this.state = 'menu';
    this.level = 1;
    this.score = 0;
    this.time = CONFIG.LEVEL_TIME;
    this.deathTimer = 0;
    this.shake = 0;               // intensidade atual do tremor de câmera
    this.best = this._loadBest();
    this.clock = new THREE.Clock();

    this._bindUI();
    this.loadLevel(1);            // arena de fundo para a tela inicial
    this.ui.setMuted(this.audio.muted);
    this.ui.show('menu', { best: this.best });

    window.addEventListener('resize', () => this._resize());
    document.addEventListener('fullscreenchange', () => this._resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this._resize(), 250));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });
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
    this.cameraBase = new THREE.Vector3();    // posição da câmera mostrando a arena inteira
    this.cameraDir = new THREE.Vector3();     // direção (normalizada) do alvo até a câmera
    this.cameraDist = 30;                     // distância para a arena inteira caber
    this.camTarget = new THREE.Vector3();     // ponto do chão que a câmera acompanha
    this.zoom = 1;                            // aproximação atual (vai suavemente até a desejada)
    this._ray = new THREE.Raycaster();
    this._chao = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._v2 = new THREE.Vector2();
    this._v3 = new THREE.Vector3();

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

  _bindUI() {
    const ui = this.ui;
    ui.on('play', () => this.startGame());
    ui.on('restart', () => this.startGame());
    ui.on('resume', () => this.resume());
    ui.on('pause', () => this.togglePause());
    ui.on('next', () => this.nextLevel());
    ui.on('mute', () => { this.audio.unlock(); ui.setMuted(this.audio.toggleMute()); });

    this.input.onAnyInput = () => this.audio.unlock();
    this.input.onPause = () => this.togglePause();
    this.input.onConfirm = () => ui.confirm();
    this.input.onTouchDetected = () => this._resize();
    // Qualquer toque/clique libera o áudio (cada navegador aceita um evento diferente).
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click']) {
      window.addEventListener(ev, () => this.audio.unlock(), { passive: true });
    }
  }

  /** Espaço (em px) reservado no topo e na base da tela para a interface. */
  _uiMargins() {
    // No celular em pé, deixa a parte de baixo livre para o joystick e a bomba.
    const retrato = window.innerHeight > window.innerWidth;
    return { top: this.ui.hudHeight, bottom: this.input.isTouch && retrato ? 190 : 0 };
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
    this.cameraDir.copy(dir);
    this.cameraDist = longe;
    // Faixa da tela (em NDC) que fica livre entre a HUD e os controles de toque.
    this.freeTop = 1 - 2 * m.top / h;
    this.freeBottom = -1 + 2 * m.bottom / h;

    // Centraliza a arena na área livre (entre a HUD e os controles de toque).
    const centroAtual = (minY + maxY) / 2;
    const centroDesejado = (m.bottom - m.top) / h;
    const deslocY = Math.round((centroDesejado - centroAtual) * h / 2);
    if (deslocY !== 0) cam.setViewOffset(w, h, 0, deslocY, w, h);
  }

  // ---------------------------------------------------------- fluxo do jogo

  /** Começa um jogo novo a partir da fase 1. */
  startGame() {
    this.audio.unlock();
    this.audio.click();
    this._enterFullscreen();
    this.score = 0;
    this.player.resetStats();
    this.loadLevel(1);
    this.state = 'playing';
    this.ui.hide();
    this._announceLevel();
  }

  /** Mostra o aviso da fase e começa a música dela. */
  _announceLevel() {
    this.music.play(this.level, this.setup.theme.name);
    const t = this.setup.theme;
    this.ui.toast(`Fase ${this.level} — ${t.name}. ${t.tip}`, 3200);
  }

  /** No celular, tenta entrar em tela cheia (nem todo navegador permite). */
  _enterFullscreen() {
    if (!this.input.isTouch || document.fullscreenElement) return;
    const el = document.documentElement;
    const pedir = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!pedir) return;
    try {
      const r = pedir.call(el, { navigationUI: 'hide' });
      if (r && r.catch) r.catch(() => {});
    } catch { /* segue em tela normal */ }
  }

  /** Monta uma fase: mais inimigos (e mais rápidos) a cada nível. */
  loadLevel(level) {
    this.level = level;
    this.time = CONFIG.LEVEL_TIME;
    this.deathTimer = 0;
    this.bombs.clear();
    this.powerups.clear();
    this.enemies.clear();
    // Conteúdo da fase (cenário, rivais, monstros, dificuldade): veja levelSetup() em config.js.
    const setup = this.setup = levelSetup(level);
    this.map.setTheme(setup.theme);
    this.scene.background.set(setup.theme.background);
    const qtd = setup.rivals.length + setup.monsters.length;
    const nascimentos = this.map.generate(qtd, setup.blockDensity);
    this.enemies.spawn(nascimentos, setup);
    this.hazards.setup(setup.theme.hazard, setup.hazardLevel, nascimentos);
    const s = this.map.playerStart;
    this.player.place(s.col, s.row);
    if (this.state !== 'menu') this.camTarget.copy(this.player.position).setY(0);
    this.player.invulnerable = 0;
    this.input.reset();
  }

  nextLevel() {
    if (this.state !== 'levelclear') return;
    this.audio.click();
    this.loadLevel(this.level + 1);
    this.state = 'playing';
    this.ui.hide();
    this._announceLevel();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.music.setPaused(true);
    this.input.reset();
    this.ui.show('paused');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.music.setPaused(false);
    this.input.reset();
    this.clock.getDelta();        // descarta o tempo em que ficou pausado
    this.ui.hide();
  }

  togglePause() {
    if (this.state === 'playing') this.pause();
    else if (this.state === 'paused') this.resume();
  }

  _levelClear() {
    const bonus = CONFIG.SCORE_LEVEL + Math.ceil(this.time) * CONFIG.SCORE_PER_SECOND;
    this.score += bonus;
    this.state = 'levelclear';
    this.music.stop();
    this.audio.levelClear();
    this._updateHUD();

    if (this.level >= CONFIG.TOTAL_LEVELS) {
      // Última fase vencida: jogo zerado.
      this.score += CONFIG.SCORE_GAME;
      this.state = 'victory';
      const novoRecorde = this.score > this.best;
      this._saveBest();
      this._updateHUD();
      this.ui.show('victory', { score: this.score, best: this.best, recordMsg: novoRecorde ? '★ Novo recorde! ★' : '' });
      return;
    }
    this._saveBest();
    const prox = levelSetup(this.level + 1);
    this.ui.show('levelclear', {
      level: this.level, bonus: `+${bonus}`, score: this.score,
      next: prox.theme !== this.setup.theme
        ? `Novo cenário: ${prox.theme.name}!`
        : `A seguir: fase ${this.level + 1} de ${CONFIG.TOTAL_LEVELS}`,
    });
  }

  _gameOver() {
    this.state = 'gameover';
    this.music.stop();
    this.audio.gameOver();
    const novoRecorde = this.score > this.best;
    this._saveBest();
    this.ui.show('gameover', {
      level: this.level, score: this.score, best: this.best,
      recordMsg: novoRecorde ? '★ Novo recorde! ★' : '',
    });
  }

  _loadBest() {
    try { return parseInt(localStorage.getItem(CHAVE_RECORDE), 10) || 0; } catch { return 0; }
  }

  _saveBest() {
    if (this.score <= this.best) return;
    this.best = this.score;
    try { localStorage.setItem(CHAVE_RECORDE, String(this.best)); } catch { /* sem armazenamento */ }
  }

  /** Mapa de perigo para a IA: explosões + perigos do cenário. */
  _dangerMap() {
    const danger = this.bombs.computeDanger();
    this.hazards.addDanger(danger);
    return danger;
  }

  /** Diz se uma célula pode ser ocupada por quem está andando. */
  canEnter(col, row) {
    return this.map.isEmpty(col, row) && !this.bombs.hasBomb(col, row);
  }

  // ---------------------------------------------------------------- eventos

  _onExplosion(bomb, cells) {
    this.audio.explosion();
    this.shake = Math.min(1.4, this.shake + (bomb.type === 'mega' ? 1.2 : 0.8));
    const p = this.map.cellToWorld(bomb.col, bomb.row);
    this.flash.position.set(p.x, 1.4, p.z);
    this.flash.intensity = 16;
    for (const c of cells) {
      this.map.cellToWorld(c.col, c.row, p);
      this.fire.emit(p.x, 0.35, p.z, {
        count: c.dx === 0 && c.dz === 0 ? 14 : 7,
        colors: bomb.type === 'pierce' ? [0xe9dcff, 0xb48cff, 0x7a2fd0] : [0xffe27a, 0xffa530, 0xff5a1f, 0xff3b1f],
        speed: 2.2, up: 2.6, life: 0.6, gravity: 3, spread: 0.6,
      });
    }
  }

  _onBlockDestroyed(col, row, bomb) {
    const p = this.map.cellToWorld(col, row);
    this.debris.emit(p.x, 0.35, p.z, {
      count: 10, colors: this.setup.theme.debris,
      speed: 2.6, up: 3.6, life: 0.8, gravity: 12, spread: 0.5,
    });
    if (bomb && bomb.owner === this.player) this.score += CONFIG.SCORE_BLOCK;

    if (this.map.isDoor(col, row)) {
      // A porta de saída estava escondida sob este bloco.
      this.map.revealDoor();
      this.ui.toast(this.map.door.open ? 'Saída encontrada!' : 'Saída encontrada! Elimine os inimigos.');
    } else if (Math.random() < CONFIG.POWERUP_CHANCE) {
      this.powerups.spawn(col, row);
    }
  }

  /** Uma bola de fogo do vulcão caiu: vira chama, destrói bloco e faz barulho. */
  _onFireball(col, row) {
    if (this.map.destroyBlock(col, row)) this._onBlockDestroyed(col, row, null);
    this.bombs.addFlame(col, row);
    this.audio.impact();
    this.shake = Math.min(1.4, this.shake + 0.35);
    const p = this.map.cellToWorld(col, row);
    this.fire.emit(p.x, 0.35, p.z, {
      count: 16, colors: [0xffe27a, 0xffa530, 0xff5a1f, 0xff3b1f], speed: 2.6, up: 3.2, life: 0.6, gravity: 4, spread: 0.5,
    });
  }

  _onPowerUp(tipo) {
    this.player.applyPowerUp(tipo);
    this.score += CONFIG.SCORE_POWERUP;
    this.audio.powerUp();
    this.ui.toast(POWERUP_LABELS[tipo], 900);
    const p = this.player.position;
    this.fire.emit(p.x, 0.5, p.z, {
      count: 14, colors: [0xffffff, 0xffe066, 0x7dffb0], speed: 1.8, up: 3, life: 0.55, gravity: 4,
    });
  }

  /** @param {boolean} pontua  true quando foi o jogador quem derrotou o inimigo */
  _onEnemyKilled(e, pontua = true) {
    const valor = this.enemies.kill(e);
    if (pontua) this.score += CONFIG.SCORE_ENEMY * valor;
    this.audio.enemyDown();
    this.fire.emit(e.mesh.position.x, 0.4, e.mesh.position.z, {
      count: 16, colors: [e.type.color, 0xffffff], speed: 2.4, up: 3, life: 0.6, gravity: 6,
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

    if (this.state === 'playing') {
      this._update(dt);
    } else if (this.state === 'menu') {
      // Na tela inicial os inimigos passeiam pela arena ao fundo.
      this.enemies.update(dt, { canEnter: (c, r) => this.canEnter(c, r), bombs: null, danger: null, player: null });
    }

    if (this.state !== 'paused') {
      this.map.update(dt);
      this.fire.update(dt);
      this.debris.update(dt);
      this.flash.intensity = Math.max(0, this.flash.intensity - dt * 45);
    }

    this._updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _update(dt) {
    const player = this.player;
    const hazards = this.hazards;
    player.update(dt, this.input.directions(), (c, r) => this.canEnter(c, r), hazards);

    // Jogador derrotado: espera a animação terminar e encerra o jogo.
    if (player.dead) {
      this.deathTimer += dt;
      if (this.deathTimer > 1.5) { this._gameOver(); return; }
    }

    // Bomba: colocada na célula do jogador, respeitando o limite simultâneo.
    if (this.input.bombPressed) {
      // A bomba cai sempre na célula que o jogador está deixando — nunca na da
      // frente —, para que ele jamais atravesse a própria bomba. Parado, é a
      // célula onde ele está.
      const m = player.mover;
      const podeSoltar = !player.dead && this.bombs.countOf(player) < player.maxBombs;
      if (podeSoltar && this.map.isEmpty(m.col, m.row) && !this.bombs.hasBomb(m.col, m.row)) {
        this.input.consumeBomb();
        const type = player.takeBombType();     // comum ou especial (remota, perfurante, mega)
        this.bombs.place(m.col, m.row, player.range, { owner: player, type });
        this.audio.placeBomb();
      } else if (!podeSoltar || !m.moving) {
        this.input.consumeBomb();               // não dá para soltar agora: descarta o pedido
      }
      // Andando e saindo de uma célula que já tem bomba: o pedido fica guardado
      // e a bomba cai assim que ele chegar à próxima célula.
    }
    // Bombas remotas: explodem quando o jogador manda.
    if (this.input.consumeDetonate() && !player.dead) this.bombs.detonateRemote(player);

    this.bombs.update(dt);

    // Dano das chamas no jogador.
    if (this.bombs.isFlame(player.col, player.row)) this._hurtPlayer();

    // Power-ups: coletados ao pisar na célula.
    this.powerups.update(dt);
    if (!player.dead) {
      const tipo = this.powerups.collect(player.col, player.row);
      if (tipo) this._onPowerUp(tipo);
    }

    // Perigos do cenário: ferem o jogador e eliminam rivais.
    hazards.update(dt, {
      canEnter: (c, r) => this.canEnter(c, r),
      player: { col: player.col, row: player.row, dead: player.dead },
    });
    if (!player.dead && player.invulnerable <= 0 && hazards.hits(player.col, player.row)) {
      this.audio.zap();
      this._hurtPlayer();
    }

    // Inimigos. Os rivais usam o mapa de perigo para fugir das explosões e
    // pedem ao jogo para soltar as próprias bombas.
    this.enemies.update(dt, {
      canEnter: (c, r) => this.canEnter(c, r),
      bombs: this.bombs,
      danger: this._dangerMap(),
      terrain: hazards,
      player: { col: player.col, row: player.row, dead: player.dead },
      placeBomb: (e) => {
        if (this.bombs.place(e.col, e.row, e.range, { owner: e })) this.audio.placeBomb();
      },
    });

    const lista = this.enemies.enemies;
    for (const e of lista) {
      if (!e.alive) continue;
      // Chamas eliminam qualquer inimigo; só pontua se a bomba era do jogador.
      if (this.bombs.isFlame(e.col, e.row)) {
        this._onEnemyKilled(e, this.bombs.flameOwner(e.col, e.row) === player);
        continue;
      }
      if (e.kind !== 'monster') {
        if (hazards.hits(e.col, e.row)) this._onEnemyKilled(e, false);   // rival pego pelo cenário
        continue;
      }
      // Monstros atacam qualquer um: ferem o jogador e eliminam rivais.
      const ex = e.mesh.position.x, ez = e.mesh.position.z;
      const dx = ex - player.position.x, dz = ez - player.position.z;
      if (dx * dx + dz * dz < 0.36) this._hurtPlayer();
      for (const r of lista) {
        if (!r.alive || r.kind !== 'rival') continue;
        const rx = r.mesh.position.x - ex, rz = r.mesh.position.z - ez;
        if (rx * rx + rz * rz < 0.3) this._onEnemyKilled(r, false);
      }
    }

    if (!player.dead) {
      // Porta de saída: abre quando não resta nenhum inimigo.
      const door = this.map.door;
      if (!door.open && this.enemies.aliveCount === 0) {
        this.map.openDoor();
        this.audio.doorOpen();
        this.ui.toast(door.revealed ? 'A saída abriu!' : 'Inimigos eliminados! Encontre a saída.', 2400);
      }
      if (door.open && door.revealed && this.map.isDoor(player.col, player.row)) {
        this._levelClear();
        return;
      }

      // Relógio: se zerar, custa uma vida e devolve um pouco de tempo.
      this.time -= dt;
      if (this.time <= 0) {
        this.time = CONFIG.TIME_OUT_EXTRA;
        player.invulnerable = 0;
        this._hurtPlayer();
        this.ui.toast('Tempo esgotado!');
      }
    }

    this._updateHUD();
  }

  _updateHUD() {
    const p = this.player;
    const nomes = { remote: 'REMOTA', pierce: 'PERFURANTE', mega: 'MEGA' };
    this.ui.setSpecial(p.special ? `${nomes[p.special.type]} ×${p.special.ammo}` : null);
    this.ui.setDetonate(this.bombs.hasRemote(p));
    this.ui.setHUD({
      lives: p.lives,
      bombs: p.maxBombs,
      range: p.range,
      level: `${this.level}/${CONFIG.TOTAL_LEVELS}`,
      time: this.time,
      score: this.score,
    });
  }

  /**
   * Câmera: na tela inicial mostra a arena inteira; durante a partida se
   * aproxima (CAMERA_ZOOM) e acompanha o jogador, sem passar das bordas.
   */
  _updateCamera(dt) {
    const cam = this.camera;
    const jogando = this.state !== 'menu';
    const retrato = window.innerHeight > window.innerWidth;
    const zoomJogo = retrato ? CONFIG.CAMERA_ZOOM_PORTRAIT : CONFIG.CAMERA_ZOOM;
    const zoomAlvo = jogando ? zoomJogo : 1;
    const k = 1 - Math.exp(-dt * CONFIG.CAMERA_FOLLOW);
    this.zoom += (zoomAlvo - this.zoom) * k;

    // Ponto desejado: o jogador (ou o centro, na tela inicial).
    const alvo = this._v3.set(0, 0, 0);
    if (jogando) alvo.set(this.player.position.x, 0, this.player.position.z);
    this.camTarget.x += (alvo.x - this.camTarget.x) * k;
    this.camTarget.z += (alvo.z - this.camTarget.z) * k;

    // Inclinação: vai da vista de cima (tela inicial) para uma vista mais de
    // frente durante a partida, acompanhando o zoom.
    const p = zoomJogo > 1 ? Math.min(1, Math.max(0, (this.zoom - 1) / (zoomJogo - 1))) : 0;
    const tilt = THREE.MathUtils.degToRad(CONFIG.CAMERA_TILT + (CONFIG.CAMERA_PLAY_TILT - CONFIG.CAMERA_TILT) * p);
    this.cameraDir.set(0, Math.sin(tilt), Math.cos(tilt));

    // Posiciona a câmera olhando para o alvo, à distância do zoom atual.
    const dist = this.cameraDist / this.zoom;
    cam.position.copy(this.cameraDir).multiplyScalar(dist).add(this.camTarget);
    cam.lookAt(this.camTarget);
    cam.updateMatrixWorld();

    // Não deixa a câmera mostrar além da arena: mede quanto do chão aparece
    // na área livre da tela e limita o alvo para as bordas não "sobrarem".
    if (this.zoom > 1.001) {
      const vis = this._visibleGround();
      if (vis) {
        const hx = CONFIG.COLS / 2 + 0.3, hz = CONFIG.ROWS / 2 + 0.3;
        const limita = (v, min, max, lo, hi) => {
          const a = lo - min, b = hi - max;      // faixa permitida para o alvo
          return a > b ? (a + b) / 2 : Math.max(a, Math.min(b, v));
        };
        const tx = limita(this.camTarget.x, vis.xMin, vis.xMax, -hx, hx);
        const tz = limita(this.camTarget.z, vis.zMin, vis.zMax, -hz, hz);
        if (tx !== this.camTarget.x || tz !== this.camTarget.z) {
          this.camTarget.x = tx;
          this.camTarget.z = tz;
          cam.position.copy(this.cameraDir).multiplyScalar(dist).add(this.camTarget);
          cam.lookAt(this.camTarget);
        }
      }
    }

    // Tremor das explosões.
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const s = this.shake * this.shake * 0.35;
    cam.position.x += (Math.random() - 0.5) * s;
    cam.position.y += (Math.random() - 0.5) * s;
    cam.position.z += (Math.random() - 0.5) * s;
  }

  /**
   * Quanto do chão aparece na área livre da tela, relativo ao alvo da câmera:
   * { xMin, xMax, zMin, zMax }. Usa raios saindo das bordas da área livre.
   */
  _visibleGround() {
    const cam = this.camera;
    const meio = (this.freeTop + this.freeBottom) / 2;
    const pts = [[0, this.freeTop], [0, this.freeBottom], [-1, meio], [1, meio]];
    const out = [];
    for (const [x, y] of pts) {
      this._ray.setFromCamera(this._v2.set(x, y), cam);
      const p = new THREE.Vector3();
      if (!this._ray.ray.intersectPlane(this._chao, p)) return null;
      out.push(p);
    }
    return {
      zMin: out[0].z - this.camTarget.z, zMax: out[1].z - this.camTarget.z,
      xMin: out[2].x - this.camTarget.x, xMax: out[3].x - this.camTarget.x,
    };
  }
}

window.game = new Game();
