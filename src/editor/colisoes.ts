// Desenho e seleção das formas de colisão e do marcador de início do jogador (espaço do mundo, parallax 1).
import type { Graphics } from 'pixi.js';
import type { Colisao, Fase } from '../core/tipos';

export const COR_SOLIDO = 0xa7dd3e;       // lima
export const COR_ATRAVESSAVEL = 0xf89715; // laranja
export const COR_RAMPA = 0x2ca782;        // verde
export const COR_INICIO = 0x65da67;

type ParaTela = (x: number, y: number) => { x: number; y: number };

/** Vértices da forma no espaço do mundo. */
export function vertices(c: Colisao): [number, number][] {
  if (c.tipo === 'rampa') {
    // "sobe para a direita" = canto alto à direita (◢)
    return c.sobe === 'esquerda'
      ? [[c.x, c.y], [c.x + c.w, c.y + c.h], [c.x, c.y + c.h]]
      : [[c.x + c.w, c.y], [c.x + c.w, c.y + c.h], [c.x, c.y + c.h]];
  }
  return [[c.x, c.y], [c.x + c.w, c.y], [c.x + c.w, c.y + c.h], [c.x, c.y + c.h]];
}

export function corDe(c: Colisao) {
  return c.tipo === 'solido' ? COR_SOLIDO : c.tipo === 'atravessavel' ? COR_ATRAVESSAVEL : COR_RAMPA;
}

/** Desenha todas as colisões. destaque = modo Colisão ativo (mais visível). */
export function desenharColisoes(g: Graphics, fase: Fase, paraTela: ParaTela, selecionada: string | null, destaque: boolean) {
  for (const c of fase.colisoes) {
    const cor = corDe(c);
    const pts = vertices(c).flatMap(([x, y]) => { const p = paraTela(x, y); return [Math.round(p.x) + 0.5, Math.round(p.y) + 0.5]; });
    g.poly(pts).fill({ color: cor, alpha: destaque ? 0.28 : 0.14 }).stroke({ width: 1, color: cor, alpha: destaque ? 0.95 : 0.55 });
    if (c.tipo === 'atravessavel') {
      // Linha grossa no topo: só ela segura o jogador (pula-se por baixo)
      const a = paraTela(c.x, c.y), b = paraTela(c.x + c.w, c.y);
      g.moveTo(a.x, a.y + 1).lineTo(b.x, b.y + 1).stroke({ width: 3, color: cor, alpha: destaque ? 1 : 0.7 });
    }
    if (c.id === selecionada) {
      g.poly(pts).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
    }
  }
}

/** Colisão sob o ponto do mundo (a última desenhada fica por cima). */
export function colisaoEm(fase: Fase, wx: number, wy: number): Colisao | undefined {
  for (let i = fase.colisoes.length - 1; i >= 0; i--) {
    const c = fase.colisoes[i];
    if (wx < c.x || wx > c.x + c.w || wy < c.y || wy > c.y + c.h) continue;
    if (c.tipo !== 'rampa') return c;
    // Dentro do triângulo?
    const fx = (wx - c.x) / c.w, fy = (wy - c.y) / c.h;
    const dentro = c.sobe === 'esquerda' ? fy >= fx : fy >= 1 - fx;
    if (dentro) return c;
  }
  return undefined;
}

/** Marcador do início do jogador: pino com bandeira, tamanho fixo na tela. (sx, sy) = posição dos pés na tela. */
export function desenharInicio(g: Graphics, sx: number, sy: number, ativo: boolean) {
  const x = Math.round(sx) + 0.5, y = Math.round(sy) + 0.5;
  const alt = 34;
  g.ellipse(x, y, 9, 3).fill({ color: 0x000000, alpha: 0.35 });
  g.moveTo(x, y).lineTo(x, y - alt).stroke({ width: 2, color: 0xffffff });
  g.poly([x, y - alt, x + 16, y - alt + 6, x, y - alt + 12]).fill({ color: COR_INICIO }).stroke({ width: 1, color: 0x083933 });
  g.circle(x, y, ativo ? 5 : 4).fill({ color: COR_INICIO }).stroke({ width: 1.5, color: 0x083933 });
}

/** O ponto (tela) está sobre o marcador de início? */
export function sobreInicio(sx: number, sy: number, mx: number, my: number) {
  return mx >= sx - 8 && mx <= sx + 18 && my >= sy - 38 && my <= sy + 8;
}
