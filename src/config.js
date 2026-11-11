// ============================================================================
// config.js — TODOS os parâmetros do jogo ficam aqui.
// Altere os valores abaixo para ajustar arena, velocidades, tempos e pontuação.
// ============================================================================

// ---------------------------------------------------------------------------
// PERSONAGEM 3D
// Coloque o seu modelo (exportado do Meshy em .glb) em /assets/models/player.glb.
// Se o arquivo não existir, o jogo usa um personagem provisório automaticamente.
// ---------------------------------------------------------------------------

/** Caminho do modelo do jogador (relativo ao index.html). */
export const PLAYER_MODEL_PATH = 'assets/models/player.glb';

/** Escala extra do modelo. 1 = altura padrão (PLAYER_HEIGHT). Aumente/diminua à vontade. */
export const PLAYER_SCALE = 1.0;

/**
 * Modelos dos inimigos (um por tipo). Se um arquivo não existir, aquele tipo
 * usa um inimigo provisório feito de formas simples.
 */
export const ENEMY_MODEL_PATHS = {
  flamengo: 'assets/models/enemy_flamengo.glb',      // tipo básico
  fluminense: 'assets/models/enemy_fluminense.glb',  // tipo veloz (a partir da fase 2)
  botafogo: 'assets/models/enemy_botafogo.glb',      // tipo caçador (a partir da fase 3)
};

export const CONFIG = {
  // --- Arena -----------------------------------------------------------------
  COLS: 15,                 // largura da grade (inclui as paredes da borda)
  ROWS: 13,                 // altura da grade (inclui as paredes da borda)
  BLOCK_DENSITY: 0.72,      // chance de cada célula livre receber um bloco destrutível

  // --- Jogador ---------------------------------------------------------------
  PLAYER_MODEL_PATH,
  PLAYER_SCALE,
  PLAYER_HEIGHT: 1.25,          // altura (em células) para a qual o modelo é normalizado
  PLAYER_ROTATION_OFFSET: 0,    // radianos; use Math.PI se o modelo aparecer "de costas"
  PLAYER_SPEED: 3.6,            // células por segundo
  PLAYER_SPEED_BONUS: 0.45,     // ganho por power-up de velocidade
  PLAYER_SPEED_MAX: 6.3,
  PLAYER_LIVES: 3,
  PLAYER_MAX_LIVES: 5,
  PLAYER_BOMBS: 1,              // bombas simultâneas no início
  PLAYER_MAX_BOMBS: 6,
  PLAYER_RANGE: 2,              // alcance inicial da explosão (em células)
  PLAYER_MAX_RANGE: 7,
  INVULNERABLE_TIME: 2.0,       // segundos de invencibilidade após levar dano

  // --- Bombas ----------------------------------------------------------------
  BOMB_FUSE: 2.5,               // tempo do pavio (s)
  CHAIN_DELAY: 0.08,            // atraso da reação em cadeia entre bombas (s)
  EXPLOSION_DURATION: 0.45,     // tempo em que as chamas causam dano (s)

  // --- Power-ups -------------------------------------------------------------
  POWERUP_CHANCE: 0.32,         // chance de um bloco destruído soltar power-up
  // Raridade relativa. remote/pierce/mega são as bombas especiais (veja abaixo).
  POWERUP_WEIGHTS: { bomb: 3, range: 3, speed: 2, life: 1, remote: 1.2, pierce: 1.2, mega: 1 },

  // --- Bombas especiais ------------------------------------------------------
  // Cada item coletado dá essa quantidade de bombas do tipo; ao acabar, volta à comum.
  //   remote: só explode quando o jogador detona (tecla E / botão de detonar)
  //   pierce: a chama atravessa (e destrói) vários blocos em linha
  //   mega:   a chama vai até a parede, sem limite de alcance
  SPECIAL_AMMO: { remote: 6, pierce: 5, mega: 3 },
  REMOTE_MAX_TIME: 10,          // segurança: bomba remota explode sozinha após esse tempo (s)

  // --- Inimigos --------------------------------------------------------------
  ENEMY_HEIGHT: 1.2,            // altura (em células) dos modelos dos inimigos
  ENEMY_SPEED: 1.5,             // células por segundo na fase 1
  ENEMY_SPEED_PER_LEVEL: 0.08,  // aumento de velocidade por fase
  ENEMY_SPEED_MAX: 3.0,
  ENEMY_TURN_CHANCE: 0.3,       // chance de virar em cruzamentos
  ENEMY_SAFE_DISTANCE: 6,       // distância mínima (em células) do início do jogador

  // --- Rivais (os bonecos de time): soltam bombas e fogem das explosões --------
  RIVAL_BOMB_DELAY: 3.6,        // intervalo médio entre bombas na fase 1 (s)
  RIVAL_BOMB_DELAY_MIN: 1.3,    // intervalo mínimo nas fases finais (s)

  // --- Fases e pontuação -----------------------------------------------------
  TOTAL_LEVELS: 12,             // ao vencer a última fase, o jogo é zerado
  LEVELS_PER_WORLD: 1,          // de quantas em quantas fases o cenário muda
  LEVEL_TIME: 180,              // segundos por fase
  TIME_OUT_EXTRA: 60,           // tempo devolvido quando o relógio zera (custa 1 vida)
  SCORE_BLOCK: 10,
  SCORE_POWERUP: 50,
  SCORE_ENEMY: 100,             // multiplicado pelo valor de cada inimigo
  SCORE_GAME: 5000,             // bônus por zerar o jogo
  SCORE_LEVEL: 500,
  SCORE_PER_SECOND: 5,          // bônus por segundo restante ao terminar a fase

  // --- Visual / desempenho ---------------------------------------------------
  CAMERA_FOV: 30,
  CAMERA_TILT: 68,              // inclinação da câmera em graus (90 = totalmente de cima)
  MAX_PIXEL_RATIO: 2,           // limita a resolução em telas de alta densidade (celular)
  SHADOW_MAP_SIZE: 1024,
  MAX_PARTICLES: 500,
};

/** As quatro direções da grade (dx = coluna, dz = linha). */
export const DIRS = [
  { dx: 0, dz: -1 },  // cima
  { dx: 0, dz: 1 },   // baixo
  { dx: -1, dz: 0 },  // esquerda
  { dx: 1, dz: 0 },   // direita
];

/**
 * Cenários (mundos). A cada LEVELS_PER_WORLD fases o jogo passa ao próximo;
 * depois do último, a lista recomeça (com a dificuldade ainda subindo).
 * Todas as cores podem ser trocadas à vontade.
 * `hazard` é o perigo típico do cenário (veja hazards.js) e `tip` o aviso da fase.
 */
export const THEMES = [
  {
    name: 'Gramado',
    hazard: 'mud', tip: 'A lama deixa todo mundo lento.',
    background: 0x161a36, base: 0x39457e,
    floor: ['#74d680', '#63c871'],
    wall: 0x4f63d2, wallTop: 0x7d92ff, border: 0x3b4a9c, borderTop: 0x5567c9,
    block: ['#f2a03d', '#d97f1e', '#ffc56b'],      // fundo, moldura, brilho
    debris: [0xf2a03d, 0xd97f1e, 0xffc56b, 0x8a5a1e],
  },
  {
    name: 'Deserto',
    hazard: 'spikes', tip: 'Cuidado com os espinhos na areia!',
    background: 0x2b1a12, base: 0x8a5a33,
    floor: ['#f0d58a', '#e6c673'],
    wall: 0xb5532f, wallTop: 0xde7a4c, border: 0x8c3d22, borderTop: 0xb86039,
    block: ['#c9a25f', '#9c7a3f', '#ead29a'],
    debris: [0xc9a25f, 0x9c7a3f, 0xead29a, 0x6e5326],
  },
  {
    name: 'Geleira',
    hazard: 'ice', tip: 'O gelo escorrega!',
    background: 0x0c2238, base: 0x3f6f96,
    floor: ['#d9f1ff', '#c2e6fb'],
    wall: 0x5f8fbf, wallTop: 0xf4fbff, border: 0x44709c, borderTop: 0xd3ebfa,
    block: ['#7fd3f0', '#4aa8d6', '#e6faff'],
    debris: [0x7fd3f0, 0x4aa8d6, 0xe6faff, 0xffffff],
  },
  {
    name: 'Noite Neon',
    hazard: 'laser', tip: 'Fuja dos lasers quando piscarem!',
    background: 0x07041a, base: 0x1a1140,
    floor: ['#2a2360', '#241d55'],
    wall: 0x3a1f8f, wallTop: 0xff3fd0, border: 0x24125e, borderTop: 0x38e8ff,
    block: ['#1fb8c9', '#127886', '#aef6ff'],
    debris: [0x1fb8c9, 0x127886, 0xaef6ff, 0xff3fd0],
  },
  {
    name: 'Doceria',
    hazard: 'balls', tip: 'Não encoste nas balas gigantes!',
    background: 0x3a1230, base: 0xa8477f,
    floor: ['#ffe9f2', '#ffd6e8'],
    wall: 0xe0559a, wallTop: 0xfff3a8, border: 0xb53a7c, borderTop: 0xffc9e2,
    block: ['#8b5a3c', '#6a3f27', '#f6d7b0'],
    debris: [0x8b5a3c, 0x6a3f27, 0xf6d7b0, 0xffffff],
  },
  {
    name: 'Vulcão',
    hazard: 'meteor', tip: 'Bolas de fogo caem do céu!',
    background: 0x1a0705, base: 0x2b1a1a,
    floor: ['#55484a', '#4a3e40'],
    wall: 0x2a2428, wallTop: 0xff5a2a, border: 0x1c181b, borderTop: 0xc23a18,
    block: ['#8a4a3a', '#5e2d22', '#ff9a4a'],
    debris: [0x8a4a3a, 0x5e2d22, 0xff9a4a, 0x2a1512],
  },
];

/**
 * Define o conteúdo de cada fase. Edite aqui para mudar a dificuldade.
 * Devolve: cenário, rivais (quantidade e força) e monstros (lista de tipos).
 */
export function levelSetup(level) {
  const mundo = Math.floor((level - 1) / CONFIG.LEVELS_PER_WORLD);
  const theme = THEMES[mundo % THEMES.length];

  // Rivais: 2 no começo, até 5. Fluminense entra na fase 2 e Botafogo na 3.
  const rivalCount = Math.min(2 + Math.floor(level / 3), 5);
  const rivalTypes = ['flamengo', 'fluminense', 'botafogo'].slice(0, Math.min(3, level));
  const rivals = [];
  for (let i = 0; i < rivalCount; i++) rivals.push(rivalTypes[i % rivalTypes.length]);

  // Monstros: atacam qualquer um (jogador e rivais). Fantasma entra na fase 4
  // (atravessa blocos) e o touro na fase 7 (dispara ao ver alguém).
  const monsterCount = Math.min(1 + Math.floor(level / 2), 6);
  const monsterTypes = ['gosma'];
  if (level >= 4) monsterTypes.push('fantasma');
  if (level >= 7) monsterTypes.push('touro');
  const monsters = [];
  for (let i = 0; i < monsterCount; i++) monsters.push(monsterTypes[(i + level) % monsterTypes.length]);

  return {
    theme,
    world: mundo + 1,
    hazardLevel: level > THEMES.length ? 2 : 1,           // perigos do cenário mais fortes na 2ª volta
    rivals,
    monsters,
    speed: Math.min(CONFIG.ENEMY_SPEED + CONFIG.ENEMY_SPEED_PER_LEVEL * (level - 1), CONFIG.ENEMY_SPEED_MAX),
    rivalRange: 2 + Math.floor((level - 1) / 4),          // alcance das bombas dos rivais
    rivalBombs: level >= 6 ? 2 : 1,                       // bombas simultâneas de cada rival
    rivalBombDelay: Math.max(CONFIG.RIVAL_BOMB_DELAY - 0.22 * (level - 1), CONFIG.RIVAL_BOMB_DELAY_MIN),
    blockDensity: Math.max(CONFIG.BLOCK_DENSITY - 0.01 * (level - 1), 0.6),
  };
}
