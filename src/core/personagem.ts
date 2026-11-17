// Personagens animados: formato dos dados (jogo/personagens/<nome>.json), detecção automática de spritesheets
// e escolha da animação conforme o estado do jogador. Puro (sem PixiJS e sem DOM).

/** Estados de animação que o jogo usa. Os que faltarem caem num substituto (ver SUBSTITUTOS). */
export type EstadoAnim = 'parado' | 'andando' | 'pulando' | 'caindo' | 'aterrissando' | 'dano' | 'morte';

export const ESTADOS: { id: EstadoAnim; nome: string; texto: string; obrigatorio?: boolean }[] = [
  { id: 'parado', nome: 'Parado', texto: 'Respirando, sem andar (idle). É a animação base: se outra faltar, esta aparece.', obrigatorio: true },
  { id: 'andando', nome: 'Andando', texto: 'Andando para os lados.' },
  { id: 'pulando', nome: 'Pulando', texto: 'Subindo no pulo. Se faltar, usa Parado.' },
  { id: 'caindo', nome: 'Caindo', texto: 'Descendo no ar. Se faltar, usa Pulando (ou Parado).' },
  { id: 'aterrissando', nome: 'Aterrissando', texto: 'Ao tocar o chão depois de cair (toca uma vez). Opcional.' },
  { id: 'dano', nome: 'Dano', texto: 'Ao levar dano (toca uma vez). Usado quando houver combate.' },
  { id: 'morte', nome: 'Morte', texto: 'Ao morrer (toca uma vez). Usado quando houver combate.' },
];

const SUBSTITUTOS: Record<EstadoAnim, EstadoAnim[]> = {
  parado: [],
  andando: ['parado'],
  pulando: ['parado'],
  caindo: ['pulando', 'parado'],
  aterrissando: ['parado'],
  dano: ['parado'],
  morte: ['parado'],
};

export interface Animacao {
  /** Spritesheet (caminho relativo a jogo/, ex.: "assets/personagens/lorena/idle.png"). */
  folha: string;
  /** Imagem original (relativa à raiz do projeto), para referência. */
  origem?: string;
  larguraQuadro: number;
  alturaQuadro: number;
  /** Quantos quadros usar (da esquerda para a direita, linha por linha). */
  quadros: number;
  fps: number;
  /** Repete? (false = toca uma vez e para no último quadro) */
  repetir: boolean;
  /** Escala só desta animação (ex.: 0,25 para uma folha desenhada 4× maior). */
  escala: number;
}

export interface Personagem {
  versao: number;
  nome: string;
  /** Ponto dos PÉS dentro do quadro (px do quadro): é este ponto que fica na posição do jogador. */
  pes: [number, number];
  /** Caixa de colisão do corpo (px, já na escala do personagem). */
  caixa: { largura: number; altura: number };
  /** Escala geral do desenho. */
  escala: number;
  /** O desenho original olha para a direita? (para espelhar certo) */
  olhaDireita: boolean;
  animacoes: Partial<Record<EstadoAnim, Animacao>>;
}

export function personagemNovo(nome: string): Personagem {
  return { versao: 1, nome, pes: [64, 128], caixa: { largura: 40, altura: 110 }, escala: 1, olhaDireita: true, animacoes: {} };
}

export function normalizarPersonagem(d: unknown): Personagem {
  const p = (d ?? {}) as Partial<Personagem>;
  const base = personagemNovo(typeof p.nome === 'string' ? p.nome : 'Personagem');
  const animacoes: Personagem['animacoes'] = {};
  for (const e of ESTADOS) {
    const a = p.animacoes?.[e.id];
    if (!a || typeof a.folha !== 'string' || !a.folha) continue;
    animacoes[e.id] = {
      folha: a.folha, ...(a.origem ? { origem: String(a.origem) } : {}),
      larguraQuadro: Math.max(1, Math.round(Number(a.larguraQuadro) || 1)),
      alturaQuadro: Math.max(1, Math.round(Number(a.alturaQuadro) || 1)),
      quadros: Math.max(1, Math.round(Number(a.quadros) || 1)),
      fps: Math.max(0.5, Number(a.fps) || 8),
      repetir: a.repetir !== false,
      escala: Number(a.escala) > 0 ? Number(a.escala) : 1,
    };
  }
  return {
    ...base, ...p, versao: 1, animacoes,
    pes: Array.isArray(p.pes) && p.pes.length === 2 ? [Number(p.pes[0]) || 0, Number(p.pes[1]) || 0] : base.pes,
    caixa: { largura: Math.max(2, Number(p.caixa?.largura) || base.caixa.largura), altura: Math.max(2, Number(p.caixa?.altura) || base.caixa.altura) },
    escala: Number(p.escala) > 0 ? Number(p.escala) : 1,
    olhaDireita: p.olhaDireita !== false,
  };
}

/** Animação a usar para um estado (com substitutos quando ela não existe). */
export function animacaoPara(p: Personagem, estado: EstadoAnim): { estado: EstadoAnim; anim: Animacao } | null {
  for (const e of [estado, ...SUBSTITUTOS[estado]]) {
    const a = p.animacoes[e];
    if (a) return { estado: e, anim: a };
  }
  const qualquer = Object.entries(p.animacoes)[0] as [EstadoAnim, Animacao] | undefined;
  return qualquer ? { estado: qualquer[0], anim: qualquer[1] } : null;
}

/** Estado de animação a partir da física do jogador. */
export function estadoDoJogador(j: { noChao: boolean; vx: number; vy: number }, aterrissouHa: number): EstadoAnim {
  if (!j.noChao) return j.vy < 0 ? 'pulando' : 'caindo';
  if (aterrissouHa < 0.12) return 'aterrissando';
  return Math.abs(j.vx) > 12 ? 'andando' : 'parado';
}

/** Quadro atual de uma animação, dado o tempo desde que ela começou. */
export function quadroEm(anim: Animacao, t: number): number {
  const n = Math.floor(t * anim.fps);
  return anim.repetir ? n % anim.quadros : Math.min(n, anim.quadros - 1);
}

/** Retângulo (na folha) de um quadro. */
export function retanguloQuadro(anim: Animacao, larguraFolha: number, i: number) {
  const porLinha = Math.max(1, Math.floor(larguraFolha / anim.larguraQuadro));
  return { x: (i % porLinha) * anim.larguraQuadro, y: Math.floor(i / porLinha) * anim.alturaQuadro, w: anim.larguraQuadro, h: anim.alturaQuadro };
}

/**
 * Palpite para uma folha nova: quadros quadrados (altura = largura do quadro) e FPS pelo nome do arquivo
 * ("..._8fps.png"). Avisa se a largura não for múltipla.
 */
export function palpiteFolha(nomeArquivo: string, larguraFolha: number, alturaFolha: number) {
  const fps = Number(/_(\d+(?:[.,]\d+)?)\s*fps/i.exec(nomeArquivo)?.[1]?.replace(',', '.')) || 8;
  const alturaQuadro = alturaFolha;
  let quadros = Math.max(1, Math.round(larguraFolha / alturaFolha));
  let larguraQuadro = Math.round(larguraFolha / quadros);
  const exato = larguraFolha % alturaFolha === 0;
  if (!exato) {
    // Tenta um número de quadros que divida a largura exatamente, perto do palpite quadrado
    for (let d = 0; d <= 6; d++) {
      for (const q of [quadros + d, quadros - d]) {
        if (q >= 1 && larguraFolha % q === 0) { quadros = q; larguraQuadro = larguraFolha / q; d = 99; break; }
      }
    }
  }
  return { larguraQuadro, alturaQuadro, quadros, fps, exato: larguraFolha % larguraQuadro === 0 };
}

/** Palpite de estado pelo nome do arquivo (idle → parado, andando/walk → andando…). */
export function palpiteEstado(nomeArquivo: string): EstadoAnim | null {
  const n = nomeArquivo.toLowerCase();
  if (/idle|parad/.test(n)) return 'parado';
  if (/andando|caminh|walk|run|corr/.test(n) && !/tiro|carreg/.test(n)) return 'andando';
  if (/pul|jump/.test(n)) return 'pulando';
  if (/cai|fall/.test(n)) return 'caindo';
  if (/morte|morr|death/.test(n)) return 'morte';
  if (/dano|hit|hurt/.test(n)) return 'dano';
  return null;
}

/**
 * Âncora dos pés como fração do quadro (0–1), medida na animação Parado. Vale para todas as animações,
 * mesmo as que têm quadros de outro tamanho (ex.: uma folha desenhada 4× maior).
 */
export function ancoraPes(p: Personagem): { ax: number; ay: number } {
  const ref = animacaoPara(p, 'parado')?.anim;
  if (!ref) return { ax: 0.5, ay: 1 };
  return { ax: p.pes[0] / ref.larguraQuadro, ay: p.pes[1] / ref.alturaQuadro };
}
