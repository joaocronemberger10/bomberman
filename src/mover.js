// ============================================================================
// mover.js — Movimento em grade com deslizamento suave.
// A entidade anda de célula em célula; a posição visual é interpolada entre
// a célula de origem e a de destino. Usado pelo jogador e pelos inimigos.
// ============================================================================

export class GridMover {
  constructor() {
    this.setCell(1, 1);
  }

  /** Coloca a entidade parada exatamente em uma célula. */
  setCell(col, row) {
    this.col = col; this.row = row;         // célula lógica (origem enquanto anda)
    this.toCol = col; this.toRow = row;     // célula de destino
    this.t = 0;                             // progresso 0..1 entre origem e destino
    this.moving = false;
    this.dirX = 0; this.dirZ = 0;
  }

  /** Começa a andar uma célula na direção indicada. */
  start(dx, dz) {
    this.toCol = this.col + dx; this.toRow = this.row + dz;
    this.dirX = dx; this.dirZ = dz;
    this.t = 0;
    this.moving = true;
  }

  /** Dá meia-volta no meio do caminho. */
  reverse() {
    const c = this.col, r = this.row;
    this.col = this.toCol; this.row = this.toRow;
    this.toCol = c; this.toRow = r;
    this.dirX = -this.dirX; this.dirZ = -this.dirZ;
    this.t = 1 - this.t;
  }

  /**
   * Avança `dist` células. Se chegar ao destino, para e devolve a distância
   * que sobrou (para continuar o movimento no mesmo quadro); senão devolve 0.
   */
  advance(dist) {
    const falta = 1 - this.t;
    if (dist >= falta) {
      this.col = this.toCol; this.row = this.toRow;
      this.t = 0;
      this.moving = false;
      return dist - falta;
    }
    this.t += dist;
    return 0;
  }

  /** Posição contínua em coordenadas de grade. */
  get gx() { return this.col + (this.toCol - this.col) * this.t; }
  get gz() { return this.row + (this.toRow - this.row) * this.t; }

  /** Célula que a entidade "ocupa" (a mais próxima da posição atual). */
  get cellCol() { return this.moving && this.t >= 0.5 ? this.toCol : this.col; }
  get cellRow() { return this.moving && this.t >= 0.5 ? this.toRow : this.row; }
}
