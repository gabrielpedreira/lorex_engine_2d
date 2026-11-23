import { normalizarArma, normalizarInimigo, type ConfigArma, type ConfigInimigo } from './inimigos';

// Personagens animados: formato dos dados (jogo/personagens/<nome>.json), detecção automática de spritesheets
// e escolha da animação conforme o estado do jogador. Puro (sem PixiJS e sem DOM).
// Básicas (parado, andando…) a física escolhe; extras (tiro, recarga, ataque…) são ações tocadas por botão ou código.

/** Estados de animação que o jogo usa. Os que faltarem caem num substituto (ver SUBSTITUTOS). */
export type EstadoAnim = 'parado' | 'andando' | 'pulando' | 'caindo' | 'aterrissando' | 'dano' | 'morte';

export const ESTADOS: { id: EstadoAnim; nome: string; texto: string; obrigatorio?: boolean }[] = [
  { id: 'parado', nome: 'Parado', texto: 'Respirando, sem andar (idle). É a animação base: se outra faltar, esta aparece.', obrigatorio: true },
  { id: 'andando', nome: 'Andando', texto: 'Andando para os lados.' },
  { id: 'pulando', nome: 'Pulando', texto: 'Subindo no pulo. Se faltar, usa Parado.' },
  { id: 'caindo', nome: 'Caindo', texto: 'Descendo no ar. Se faltar, usa Pulando (ou Parado).' },
  { id: 'aterrissando', nome: 'Aterrissando', texto: 'Ao tocar o chão depois de cair (toca uma vez). Opcional.' },
  { id: 'dano', nome: 'Dano', texto: 'Ao levar um golpe de inimigo (toca uma vez).' },
  { id: 'morte', nome: 'Morte', texto: 'Ao morrer (vida 0): toca uma vez e fica no último quadro até voltar no checkpoint.' },
];

const SUBSTITUTOS: Record<string, string[]> = {
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
  // ----- Só nas animações extras (ações como tiro, recarga, ataque) -----
  /** Nome mostrado no editor (o código usa a chave, ex.: "tiro"). */
  nome?: string;
  /** Enquanto toca, o personagem não anda (continua caindo normalmente). */
  travaMovimento?: boolean;
  /** Se estiver andando quando a ação começar (ou durante), usa esta outra animação (ex.: tiro → tiro_andando). */
  aoAndar?: string;
}

export type TipoPersonagem = 'jogador' | 'npc';
export const TIPOS_PERSONAGEM: { id: TipoPersonagem; nome: string; texto: string }[] = [
  { id: 'jogador', nome: 'Jogador', texto: 'Controlado pelas teclas (ver ferramenta Controles). Ex.: Lorena, Nicolas.' },
  { id: 'npc', nome: 'NPC', texto: 'Controlado pelo jogo: inimigos, aliados, figurantes. As animações extras são chamadas pelo código/IA (ex.: ataque).' },
];

export interface Personagem {
  versao: number;
  nome: string;
  tipo: TipoPersonagem;
  /** Ponto dos PÉS dentro do quadro (px do quadro): é este ponto que fica na posição do jogador. */
  pes: [number, number];
  /** Caixa de colisão do corpo (px, já na escala do personagem). */
  caixa: { largura: number; altura: number };
  /** Escala geral do desenho. */
  escala: number;
  /** O desenho original olha para a direita? (para espelhar certo) */
  olhaDireita: boolean;
  /**
   * Animações por chave. As básicas usam as chaves de ESTADOS (parado, andando…) e a física escolhe qual tocar;
   * as extras têm chave livre (ex.: "tiro", "recarga", "ataque1") e são tocadas por ação/código: tocar("tiro").
   */
  animacoes: Record<string, Animacao>;
  /** Script do personagem (arquivo em jogo/scripts/), se houver. */
  script?: string;
  /** Jogador: arma (munição, tiro, recarga). */
  arma?: ConfigArma;
  /** Jogador: vida (barra no HUD, dano dos inimigos, morte e volta ao checkpoint). */
  vida?: ConfigVida;
  /** NPC: comportamento de inimigo (IA, vida, ataques). */
  inimigo?: ConfigInimigo;
}

/** Vida do jogador. */
export interface ConfigVida {
  /** Vida cheia. */
  maxima: number;
  /** Segundos invulnerável depois de levar um golpe (o personagem pisca). */
  invulneravel: number;
  /** Segundos entre morrer e voltar no último checkpoint. */
  renascer: number;
}

export function vidaPadrao(): ConfigVida { return { maxima: 10, invulneravel: 1.2, renascer: 2.5 }; }

export function normalizarVida(d: unknown): ConfigVida {
  const b = vidaPadrao();
  const v = (d && typeof d === 'object' ? d : {}) as Partial<ConfigVida>;
  const n = (x: unknown, p: number, min: number) => (Number.isFinite(Number(x)) ? Math.max(min, Number(x)) : p);
  return { maxima: Math.max(1, Math.round(n(v.maxima, b.maxima, 1))), invulneravel: n(v.invulneravel, b.invulneravel, 0), renascer: n(v.renascer, b.renascer, 0.5) };
}

const IDS_BASICOS = new Set<string>(ESTADOS.map((e) => e.id));
export const ehBasica = (chave: string) => IDS_BASICOS.has(chave);

/** Chave usada pelo código a partir de um nome ("Tiro andando" → "tiro_andando"). */
export function chaveAnimacao(nome: string): string {
  return nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

/** Animações extras (ações), na ordem em que estão no arquivo. */
export function extras(p: Personagem): [string, Animacao][] {
  return Object.entries(p.animacoes).filter(([k]) => !ehBasica(k));
}

export function personagemNovo(nome: string): Personagem {
  return { versao: 1, nome, tipo: 'jogador', pes: [64, 128], caixa: { largura: 40, altura: 110 }, escala: 1, olhaDireita: true, animacoes: {} };
}

export function normalizarPersonagem(d: unknown): Personagem {
  const p = (d ?? {}) as Partial<Personagem>;
  const base = personagemNovo(typeof p.nome === 'string' ? p.nome : 'Personagem');
  const animacoes: Personagem['animacoes'] = {};
  const chaves = Object.keys(p.animacoes ?? {});
  // Básicas primeiro (na ordem de ESTADOS), depois as extras na ordem do arquivo
  const ordem = [...ESTADOS.map((e) => e.id as string).filter((k) => chaves.includes(k)), ...chaves.filter((k) => !ehBasica(k))];
  for (const chave of ordem) {
    const a = p.animacoes?.[chave];
    if (!a || typeof a.folha !== 'string' || !a.folha) continue;
    if (!ehBasica(chave) && chaveAnimacao(chave) !== chave) continue;
    animacoes[chave] = {
      folha: a.folha, ...(a.origem ? { origem: String(a.origem) } : {}),
      larguraQuadro: Math.max(1, Math.round(Number(a.larguraQuadro) || 1)),
      alturaQuadro: Math.max(1, Math.round(Number(a.alturaQuadro) || 1)),
      quadros: Math.max(1, Math.round(Number(a.quadros) || 1)),
      fps: Math.max(0.5, Number(a.fps) || 8),
      repetir: a.repetir !== false,
      escala: Number(a.escala) > 0 ? Number(a.escala) : 1,
      ...(!ehBasica(chave) ? {
        ...(typeof a.nome === 'string' && a.nome.trim() ? { nome: a.nome.trim() } : {}),
        travaMovimento: a.travaMovimento === true,
        ...(typeof a.aoAndar === 'string' && a.aoAndar ? { aoAndar: a.aoAndar } : {}),
      } : {}),
    };
  }
  return {
    ...base, ...p, versao: 1, animacoes,
    tipo: p.tipo === 'npc' ? 'npc' : 'jogador',
    arma: p.tipo === 'npc' ? undefined : normalizarArma(p.arma),
    vida: p.tipo === 'npc' ? undefined : normalizarVida(p.vida),
    inimigo: p.tipo === 'npc' && p.inimigo ? normalizarInimigo(p.inimigo) : undefined,
    pes: Array.isArray(p.pes) && p.pes.length === 2 ? [Number(p.pes[0]) || 0, Number(p.pes[1]) || 0] : base.pes,
    caixa: { largura: Math.max(2, Number(p.caixa?.largura) || base.caixa.largura), altura: Math.max(2, Number(p.caixa?.altura) || base.caixa.altura) },
    escala: Number(p.escala) > 0 ? Number(p.escala) : 1,
    olhaDireita: p.olhaDireita !== false,
  };
}

/** Animação a usar para um estado (com substitutos quando ela não existe). */
export function animacaoPara(p: Personagem, estado: string): { estado: string; anim: Animacao } | null {
  for (const e of [estado, ...(SUBSTITUTOS[estado] ?? ['parado'])]) {
    const a = p.animacoes[e];
    if (a) return { estado: e, anim: a };
  }
  const qualquer = Object.entries(p.animacoes)[0];
  return qualquer ? { estado: qualquer[0], anim: qualquer[1] } : null;
}

/** Duração (s) de uma animação tocada uma vez. */
export const duracao = (a: Animacao) => a.quadros / a.fps;

/**
 * Escolhe a animação de um personagem a cada quadro: a básica vem do estado (física ou IA) e uma ação
 * (animação extra) pode tocar por cima. Serve para o jogador e para NPCs; o código só chama tocar("nome").
 */
export class Animador {
  private chave = 'parado';
  private tempo = 0;
  private acao: { chave: string; segurar: boolean } | null = null;
  private tempoAcao = 0;

  constructor(public p: Personagem) {}

  /** Toca uma animação extra. segurar = continua enquanto a ação estiver segurada (animações que repetem). */
  tocar(chave: string, segurar = false): boolean {
    if (!this.p.animacoes[chave]) return false;
    if (this.acao?.chave === chave && !segurar) return false; // já tocando: não recomeça a cada aperto
    this.acao = { chave, segurar };
    this.tempoAcao = 0;
    return true;
  }

  /** Para a ação atual (ex.: soltou o botão de uma ação que repete). */
  parar() { this.acao = null; }

  /** Ação tocando agora (chave), ou null. */
  get acaoAtual() { return this.acao?.chave ?? null; }

  /** A ação atual impede de andar? (depende de estar andando: ver aoAndar) */
  travaMovimento(querAndar: boolean): boolean {
    const a = this.acao && this.p.animacoes[this.acao.chave];
    if (!a) return false;
    if (querAndar && a.aoAndar && this.p.animacoes[a.aoAndar]) return false;
    return !!a.travaMovimento;
  }

  /**
   * Avança o tempo e devolve o que desenhar. estadoBase = estado da física/IA; andando = está se movendo;
   * segurando = a ação atual continua segurada (para as que repetem).
   */
  atualizar(dt: number, estadoBase: string, andando: boolean, segurando = false): { chave: string; anim: Animacao; quadro: number } | null {
    if (this.acao) {
      const base = this.p.animacoes[this.acao.chave];
      const usar = andando && base?.aoAndar && this.p.animacoes[base.aoAndar] ? base.aoAndar : this.acao.chave;
      const anim = this.p.animacoes[usar];
      this.tempoAcao += dt;
      const acabou = !anim || (anim.repetir ? this.acao.segurar && !segurando : this.tempoAcao >= duracao(anim));
      if (!acabou && anim) return { chave: usar, anim, quadro: quadroEm(anim, this.tempoAcao) };
      this.acao = null;
      this.chave = ''; // volta à básica do começo
    }
    const r = animacaoPara(this.p, estadoBase);
    if (!r) return null;
    if (r.estado !== this.chave) { this.chave = r.estado; this.tempo = 0; } else this.tempo += dt;
    return { chave: r.estado, anim: r.anim, quadro: quadroEm(r.anim, this.tempo) };
  }
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
export function palpiteEstado(nomeArquivo: string): string | null {
  const n = nomeArquivo.toLowerCase();
  if (/idle|parad/.test(n)) return 'parado';
  if (/andando|caminh|walk|run|corr/.test(n) && !/tiro|carreg/.test(n)) return 'andando';
  if (/pul|jump/.test(n)) return 'pulando';
  if (/cai|fall/.test(n)) return 'caindo';
  if (/morte|morr|death/.test(n)) return 'morte';
  if (/dano|hit|hurt/.test(n)) return 'dano';
  if (/tiro|shoot/.test(n)) return /andando|walk/.test(n) ? 'tiro_andando' : 'tiro';
  if (/recarg|reload/.test(n)) return 'recarga';
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
