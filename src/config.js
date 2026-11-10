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

export const CONFIG = {
  // --- Arena -----------------------------------------------------------------
  COLS: 15,                 // largura da grade (inclui as paredes da borda)
  ROWS: 13,                 // altura da grade (inclui as paredes da borda)
  BLOCK_DENSITY: 0.72,      // chance de cada célula livre receber um bloco destrutível

  // --- Jogador ---------------------------------------------------------------
  PLAYER_MODEL_PATH,
  PLAYER_SCALE,
  PLAYER_HEIGHT: 0.95,          // altura (em células) para a qual o modelo é normalizado
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
  POWERUP_WEIGHTS: { bomb: 3, range: 3, speed: 2, life: 1 },  // raridade relativa

  // --- Inimigos --------------------------------------------------------------
  ENEMY_BASE_COUNT: 3,          // inimigos na fase 1
  ENEMY_PER_LEVEL: 1,           // inimigos extras por fase
  ENEMY_MAX: 10,
  ENEMY_SPEED: 1.5,             // células por segundo na fase 1
  ENEMY_SPEED_PER_LEVEL: 0.12,  // aumento de velocidade por fase
  ENEMY_SPEED_MAX: 3.4,
  ENEMY_TURN_CHANCE: 0.3,       // chance de virar em cruzamentos
  ENEMY_SAFE_DISTANCE: 6,       // distância mínima (em células) do início do jogador

  // --- Fases e pontuação -----------------------------------------------------
  LEVEL_TIME: 180,              // segundos por fase
  TIME_OUT_EXTRA: 60,           // tempo devolvido quando o relógio zera (custa 1 vida)
  SCORE_BLOCK: 10,
  SCORE_POWERUP: 50,
  SCORE_ENEMY: 100,
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
