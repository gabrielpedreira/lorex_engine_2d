// Formas de colisão: desenho, seleção, edição de vértices e escala (espaço do mundo, parallax 1).
// Toda forma é uma lista de pontos: bloco/rampa/polígono são fechados; linha (inclui mão livre) é aberta.
import type { Graphics } from 'pixi.js';
import type { Colisao, Fase } from '../core/tipos';

export const COR_SOLIDO = 0xa7dd3e;       // lima
export const COR_ATRAVESSAVEL = 0xf89715; // laranja
export const COR_INICIO = 0x65da67;

type Ponto = [number, number];
type ParaTela = (x: number, y: number) => { x: number; y: number };

export const NOMES_FORMA: Record<Colisao['forma'], string> = {
  bloco: 'Bloco', rampa: 'Rampa', poligono: 'Polígono', linha: 'Linha',
};

export function fechada(c: Colisao) { return c.forma !== 'linha'; }

export function corDe(c: Colisao) { return c.comportamento === 'atravessavel' ? COR_ATRAVESSAVEL : COR_SOLIDO; }

/** Caixa que envolve a forma. */
export function caixa(c: Pick<Colisao, 'pontos'>) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of c.pontos) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function retangulo(x: number, y: number, w: number, h: number): Ponto[] {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

/** Rampa dentro de um retângulo: "direita" sobe para a direita (◢). */
export function rampa(x: number, y: number, w: number, h: number, sobe: 'direita' | 'esquerda'): Ponto[] {
  return sobe === 'esquerda' ? [[x, y], [x + w, y + h], [x, y + h]] : [[x + w, y], [x + w, y + h], [x, y + h]];
}

/** Redimensiona os pontos de uma caixa para outra (aumentar/diminuir a forma). */
export function reescalar(pontos: Ponto[], de: { x: number; y: number; w: number; h: number }, para: { x: number; y: number; w: number; h: number }): Ponto[] {
  const sx = de.w ? para.w / de.w : 1, sy = de.h ? para.h / de.h : 1;
  return pontos.map(([x, y]) => [Math.round(para.x + (x - de.x) * sx), Math.round(para.y + (y - de.y) * sy)]);
}

/** Simplifica um traço à mão livre (Ramer–Douglas–Peucker). */
export function simplificar(pts: Ponto[], tolerancia: number): Ponto[] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let maior = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distanciaSegmento(pts[i][0], pts[i][1], a, b);
    if (d > maior) { maior = d; idx = i; }
  }
  if (maior <= tolerancia) return [a, b];
  return [...simplificar(pts.slice(0, idx + 1), tolerancia).slice(0, -1), ...simplificar(pts.slice(idx), tolerancia)];
}

export function distanciaSegmento(px: number, py: number, a: Ponto, b: Ponto) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2)) : 0;
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

function dentroPoligono(px: number, py: number, pts: Ponto[]) {
  let dentro = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** Segmentos da forma (fechadas incluem o último → primeiro). */
export function segmentos(c: Pick<Colisao, 'pontos' | 'forma'>): [Ponto, Ponto][] {
  const s: [Ponto, Ponto][] = [];
  for (let i = 0; i < c.pontos.length - 1; i++) s.push([c.pontos[i], c.pontos[i + 1]]);
  if (c.forma !== 'linha' && c.pontos.length > 2) s.push([c.pontos[c.pontos.length - 1], c.pontos[0]]);
  return s;
}

/** Colisão sob o ponto do mundo. tol = tolerância (mundo) para linhas e bordas. */
export function colisaoEm(fase: Fase, wx: number, wy: number, tol: number): Colisao | undefined {
  for (let i = fase.colisoes.length - 1; i >= 0; i--) {
    const c = fase.colisoes[i];
    if (fechada(c) && dentroPoligono(wx, wy, c.pontos)) return c;
    if (segmentos(c).some(([a, b]) => distanciaSegmento(wx, wy, a, b) <= tol)) return c;
  }
  return undefined;
}

export function verticeEm(c: Colisao, wx: number, wy: number, tol: number) {
  return c.pontos.findIndex(([x, y]) => Math.hypot(x - wx, y - wy) <= tol);
}

/** Índice do segmento sob o ponto (para inserir um vértice depois dele). */
export function arestaEm(c: Colisao, wx: number, wy: number, tol: number) {
  return segmentos(c).findIndex(([a, b]) => distanciaSegmento(wx, wy, a, b) <= tol);
}

/** Desenha todas as colisões. destaque = ferramenta Colisão ativa (mais visível). */
export function desenharColisoes(g: Graphics, colisoes: Colisao[], paraTela: ParaTela, selecionada: string | null, destaque: boolean) {
  for (const c of colisoes) {
    const cor = corDe(c);
    const pts = c.pontos.flatMap(([x, y]) => { const p = paraTela(x, y); return [Math.round(p.x) + 0.5, Math.round(p.y) + 0.5]; });
    if (pts.length < 4) continue;
    if (fechada(c)) {
      g.poly(pts).fill({ color: cor, alpha: destaque ? 0.26 : 0.13 }).stroke({ width: 1, color: cor, alpha: destaque ? 0.95 : 0.55 });
    } else {
      g.poly(pts, false).stroke({ width: 3, color: cor, alpha: destaque ? 1 : 0.6, cap: 'round', join: 'round' });
    }
    if (c.comportamento === 'atravessavel' && fechada(c)) {
      // Bordas de cima em destaque: só elas seguram o jogador
      for (const [a, b] of segmentos(c)) {
        if (!bordaDeCima(c, a, b)) continue;
        const pa = paraTela(a[0], a[1]), pb = paraTela(b[0], b[1]);
        g.moveTo(pa.x, pa.y + 1).lineTo(pb.x, pb.y + 1).stroke({ width: 3, color: cor, alpha: destaque ? 1 : 0.7 });
      }
    }
    if (c.id === selecionada) {
      if (fechada(c)) g.poly(pts).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
      else g.poly(pts, false).stroke({ width: 1, color: 0xffffff, alpha: 0.9 });
    }
  }
}

/** A borda a→b de uma forma fechada fica voltada para cima (é "chão")? */
export function bordaDeCima(c: Pick<Colisao, 'pontos'>, a: Ponto, b: Ponto) {
  const horario = areaAssinada(c.pontos) > 0; // em coordenadas de tela (y para baixo), área > 0 = sentido horário
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  // normal para fora
  const ny = (horario ? -dx : dx) / len;
  return ny < -0.5; // aponta para cima e não é íngreme demais (até ~60°)
}

export function areaAssinada(pts: Ponto[]) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] * pts[i][1]) - (pts[i][0] * pts[j][1]);
  return a / 2;
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
