// Física de plataforma do jogador sobre as formas de colisão desenhadas no editor.
// Puro (sem PixiJS): o editor usa no ▶ Testar e o jogo final vai usar o mesmo código.
//
// Ideia: toda forma vira segmentos classificados em CHÃO (dá para pisar), PAREDE (bloqueia de lado) e
// TETO (bloqueia por baixo). O jogador é uma caixa (pés no ponto x, y). A cada passo:
//   1. movimento horizontal, barrado por PAREDES (raios na frente do corpo);
//   2. movimento vertical: caindo → raios para baixo procuram CHÃO (sobe degraus pequenos e acompanha rampas);
//      subindo → raios para cima procuram TETO.
// Plataformas atravessáveis só geram CHÃO de "uma via": seguram só quem vem de cima.
import type { Colisao } from './tipos';

export interface ConfigJogador {
  /** Tamanho da caixa de colisão do jogador, em px. */
  largura: number;
  altura: number;
  /** Velocidade máxima andando (px/s). */
  velocidade: number;
  /** Altura do pulo (px). */
  alturaPulo: number;
  /** Gravidade (px/s²). */
  gravidade: number;
}

export const JOGADOR_PADRAO: ConfigJogador = { largura: 36, altura: 100, velocidade: 210, alturaPulo: 120, gravidade: 1800 };

export interface Segmento { ax: number; ay: number; bx: number; by: number; tipo: 'chao' | 'parede' | 'teto'; umaVia: boolean }

const INCLINACAO_MAX = 1.73; // tan(60°): mais íngreme que isso vira parede

function areaAssinada(pts: [number, number][]) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return a / 2;
}

/** Converte as formas de colisão em segmentos classificados. */
export function montarSegmentos(colisoes: Colisao[]): Segmento[] {
  const saida: Segmento[] = [];
  for (const c of colisoes) {
    const pts = c.pontos;
    const umaVia = c.comportamento === 'atravessavel';
    if (c.forma === 'linha') {
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
        const dx = bx - ax, dy = by - ay;
        const ingreme = dx === 0 || Math.abs(dy / dx) > INCLINACAO_MAX;
        if (ingreme) { if (!umaVia) saida.push({ ax, ay, bx, by, tipo: 'parede', umaVia }); continue; }
        saida.push({ ax, ay, bx, by, tipo: 'chao', umaVia });
        if (!umaVia) saida.push({ ax, ay, bx, by, tipo: 'teto', umaVia }); // linha sólida também bloqueia por baixo
      }
      continue;
    }
    if (pts.length < 3) continue;
    const horario = areaAssinada(pts) > 0;
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      const dx = bx - ax, dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const ny = (horario ? -dx : dx) / len; // componente vertical da normal para fora
      const tipo = ny < -0.5 ? 'chao' : ny > 0.5 ? 'teto' : 'parede';
      if (umaVia && tipo !== 'chao') continue;
      saida.push({ ax, ay, bx, by, tipo, umaVia });
    }
  }
  return saida;
}

/** y do segmento na posição x (null se o segmento não passa por x). */
function yEm(s: Segmento, x: number) {
  const x0 = Math.min(s.ax, s.bx), x1 = Math.max(s.ax, s.bx);
  if (x < x0 || x > x1 || s.ax === s.bx) return null;
  return s.ay + ((x - s.ax) * (s.by - s.ay)) / (s.bx - s.ax);
}

/** x do segmento na altura y (null se o segmento não passa por y). */
function xEm(s: Segmento, y: number) {
  const y0 = Math.min(s.ay, s.by), y1 = Math.max(s.ay, s.by);
  if (y < y0 || y > y1) return null;
  if (s.ay === s.by) return null;
  return s.ax + ((y - s.ay) * (s.bx - s.ax)) / (s.by - s.ay);
}

export interface Entrada { esquerda: boolean; direita: boolean; pulo: boolean; puloApertado: boolean }

export class Jogador {
  vx = 0;
  vy = 0;
  noChao = false;
  olhandoDireita = true;
  private coyote = 0;
  private buffer = 0;
  private cortou = false;

  /** (x, y) = posição dos pés. */
  constructor(public cfg: ConfigJogador, public x: number, public y: number) {}

  get passoMax() { return Math.max(8, Math.round(this.cfg.altura * 0.16)); }

  /** Avança dt segundos. Retorna false se caiu para fora da fase. */
  passo(dt: number, ent: Entrada, segs: Segmento[], larguraFase: number, alturaFase: number): boolean {
    const c = this.cfg;
    const meia = c.largura / 2;

    // --- Pulo: buffer (apertou um pouco antes de tocar o chão) e coyote (saiu da borda há pouco) ---
    this.buffer = ent.puloApertado ? 0.12 : Math.max(0, this.buffer - dt);
    this.coyote = this.noChao ? 0.1 : Math.max(0, this.coyote - dt);
    if (this.buffer > 0 && this.coyote > 0) {
      this.vy = -Math.sqrt(2 * c.gravidade * c.alturaPulo);
      this.noChao = false; this.coyote = 0; this.buffer = 0; this.cortou = false;
    }
    if (!ent.pulo && this.vy < 0 && !this.cortou) { this.vy *= 0.45; this.cortou = true; } // pulo curto ao soltar

    // --- Horizontal ---
    const dir = (ent.direita ? 1 : 0) - (ent.esquerda ? 1 : 0);
    if (dir) this.olhandoDireita = dir > 0;
    const alvo = dir * c.velocidade;
    const acel = dir ? (this.noChao ? 2400 : 1400) : (this.noChao ? 2800 : 900);
    this.vx += Math.sign(alvo - this.vx) * Math.min(Math.abs(alvo - this.vx), acel * dt);

    let dx = this.vx * dt;
    if (dx !== 0) {
      const lado = Math.sign(dx);
      const alturas = [this.y - this.passoMax - 2, this.y - c.altura * 0.5, this.y - c.altura + 2];
      let limite = this.x + dx;
      for (const s of segs) {
        if (s.tipo !== 'parede') continue;
        for (const hy of alturas) {
          const xi = xEm(s, hy);
          if (xi === null) continue;
          if (lado > 0 && xi >= this.x + meia - 0.5 && xi - meia < limite) limite = xi - meia;
          if (lado < 0 && xi <= this.x - meia + 0.5 && xi + meia > limite) limite = xi + meia;
        }
      }
      if (limite !== this.x + dx) this.vx = 0;
      dx = limite - this.x;
      this.x += dx;
    }
    this.x = Math.max(meia, Math.min(larguraFase - meia, this.x));

    // --- Vertical ---
    this.vy = Math.min(this.vy + c.gravidade * dt, 1400);
    const dy = this.vy * dt;
    const raios = [this.x - meia * 0.8, this.x, this.x + meia * 0.8];
    if (this.vy >= 0) {
      const estavaNoChao = this.noChao;
      const de = this.y - this.passoMax;               // sobe degraus pequenos
      const ate = this.y + dy + (estavaNoChao ? this.passoMax : 0); // acompanha rampas descendo
      let melhor: number | null = null;
      for (const s of segs) {
        if (s.tipo !== 'chao') continue;
        for (const rx of raios) {
          const yi = yEm(s, rx);
          if (yi === null || yi < de || yi > ate) continue;
          if (s.umaVia && yi < this.y - 0.5) continue; // atravessável: só segura quem estava em cima
          if (melhor === null || yi < melhor) melhor = yi;
        }
      }
      if (melhor !== null) { this.y = melhor; this.vy = 0; this.noChao = true; }
      else { this.y += dy; this.noChao = false; }
    } else {
      const cabeca = this.y - c.altura;
      let teto: number | null = null;
      for (const s of segs) {
        if (s.tipo !== 'teto') continue;
        for (const rx of [this.x - meia * 0.7, this.x, this.x + meia * 0.7]) {
          const yi = yEm(s, rx);
          if (yi === null || yi > cabeca + 0.5 || yi < cabeca + dy) continue;
          if (teto === null || yi > teto) teto = yi;
        }
      }
      if (teto !== null) { this.y = teto + c.altura; this.vy = 0; }
      else this.y += dy;
      this.noChao = false;
    }
    return this.y < alturaFase + 400;
  }
}
