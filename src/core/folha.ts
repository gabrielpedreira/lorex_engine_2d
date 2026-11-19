// Animação por spritesheet usada por OBJETOS da fase (tocha, porta abrindo, ventilador…) e pelas TELAS DE
// TRANSIÇÃO do Mapa (porta se abrindo enquanto a próxima sala carrega). Puro (sem PixiJS e sem DOM).
//
// A folha é dividida numa grade: "colunas" quadros por linha, lidos da esquerda para a direita, linha por linha.

export type ModoAnim = 'loop' | 'umaVez' | 'parado';

export const MODOS_ANIM: { id: ModoAnim; nome: string; texto: string }[] = [
  { id: 'loop', nome: 'Repetir sempre', texto: 'Toca sem parar desde o início da fase (tocha, ventilador, monitor piscando).' },
  { id: 'umaVez', nome: 'Uma vez ao começar', texto: 'Toca uma vez quando a fase começa e para no último quadro.' },
  { id: 'parado', nome: 'Parado até mandar', texto: 'Fica no primeiro quadro até algo mandar tocar: a porta ao abrir, ou o código (eu.tocar()).' },
];

export interface AnimFolha {
  /** Quantos quadros usar. */
  quadros: number;
  /** Quadros por linha da folha. */
  colunas: number;
  fps: number;
  modo: ModoAnim;
  /** Tamanho da folha inteira (px), para achar o tamanho do quadro. */
  folha: [number, number];
}

export function linhasDe(a: AnimFolha) { return Math.max(1, Math.ceil(a.quadros / Math.max(1, a.colunas))); }

/** Tamanho de um quadro (px). */
export function tamanhoQuadro(a: AnimFolha): { w: number; h: number } {
  return { w: Math.max(1, Math.floor(a.folha[0] / Math.max(1, a.colunas))), h: Math.max(1, Math.floor(a.folha[1] / linhasDe(a))) };
}

/** Retângulo (na folha) do quadro i. */
export function retanguloFolha(a: AnimFolha, i: number) {
  const { w, h } = tamanhoQuadro(a);
  const c = Math.max(1, a.colunas);
  return { x: (i % c) * w, y: Math.floor(i / c) * h, w, h };
}

/** Quadro a mostrar t segundos depois de começar a tocar (repetir = volta ao início). */
export function quadroDaFolha(a: AnimFolha, t: number, repetir: boolean): number {
  const n = Math.max(0, Math.floor(t * a.fps));
  return repetir ? n % a.quadros : Math.min(n, a.quadros - 1);
}

export const duracaoFolha = (a: Pick<AnimFolha, 'quadros' | 'fps'>) => a.quadros / Math.max(0.1, a.fps);

/** Parece um spritesheet? (nome com "spritesheet"/"_8fps" ou uma tira bem mais larga que alta) */
export function pareceFolha(nomeArquivo: string, w: number, h: number) {
  return /sprite\s*sheet|spritesheet|_\d+\s*fps/i.test(nomeArquivo) || (h > 0 && w / h >= 3 && w % h === 0);
}

/** Palpite inicial: quadros quadrados numa tira (altura = largura do quadro) e FPS pelo nome ("..._8fps.png"). */
export function palpiteAnim(nomeArquivo: string, w: number, h: number, modo: ModoAnim = 'loop'): AnimFolha {
  const fps = Number(/_(\d+(?:[.,]\d+)?)\s*fps/i.exec(nomeArquivo)?.[1]?.replace(',', '.')) || 8;
  let quadros = Math.max(1, Math.round(w / Math.max(1, h)));
  if (w % quadros !== 0) {
    for (let d = 1; d <= 6; d++) {
      const q = [quadros + d, quadros - d].find((x) => x >= 1 && w % x === 0);
      if (q) { quadros = q; break; }
    }
  }
  return { quadros, colunas: quadros, fps, modo, folha: [w, h] };
}

export function normalizarAnim(d: unknown): AnimFolha | undefined {
  if (!d || typeof d !== 'object') return undefined;
  const a = d as Partial<AnimFolha>;
  const folha = Array.isArray(a.folha) && a.folha.length === 2 ? [Number(a.folha[0]) || 1, Number(a.folha[1]) || 1] as [number, number] : null;
  if (!folha) return undefined;
  const quadros = Math.max(1, Math.round(Number(a.quadros) || 1));
  return {
    quadros,
    colunas: Math.max(1, Math.min(quadros, Math.round(Number(a.colunas) || quadros))),
    fps: Math.max(0.5, Number(a.fps) || 8),
    modo: MODOS_ANIM.some((m) => m.id === a.modo) ? a.modo as ModoAnim : 'loop',
    folha,
  };
}
