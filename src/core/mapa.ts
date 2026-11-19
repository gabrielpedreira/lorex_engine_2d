// MAPA do jogo: as salas (fases/áreas) ligadas pelas PASSAGENS (objetos com o comportamento Passagem).
// Cada conexão liga uma passagem de uma sala a uma passagem de outra (ou ao início dela) e guarda a TRANSIÇÃO:
// o que acontece entre uma sala e outra (corte seco, escurecer, tela cheia animada estilo Resident Evil, som).
// Salvo em jogo/projeto.json → "mapa". O jogador nunca vê o diagrama: só anda e as portas levam às salas.
// Puro (sem DOM).
import { normalizarAnim, type AnimFolha } from './folha';

export type EfeitoTransicao = 'corte' | 'escurecer' | 'tela';

export const EFEITOS_TRANSICAO: { id: EfeitoTransicao; nome: string; texto: string }[] = [
  { id: 'corte', nome: 'Corte seco', texto: 'Troca de sala na hora, sem efeito (pode ter som).' },
  { id: 'escurecer', nome: 'Escurecer', texto: 'A tela escurece, a sala troca e a imagem volta.' },
  { id: 'tela', nome: 'Tela cheia animada', texto: 'Uma animação em tela cheia (ex.: a porta se abrindo) enquanto a próxima sala carrega, como nos Resident Evil clássicos.' },
];

export interface Transicao {
  efeito: EfeitoTransicao;
  /** Tela cheia: spritesheet da animação (caminho relativo a jogo/), '' = só a cor de fundo. */
  animacao: string;
  /** Quadros da animação (o modo não é usado: toca uma vez e para no último quadro). */
  anim?: AnimFolha;
  /** Tempo mínimo (s) da tela/escuro. Na tela cheia, vale o maior entre isto e a duração da animação. */
  duracao: number;
  /** Cor de fundo da tela de transição. */
  cor: string;
  /** Texto opcional na tela (ex.: o nome da próxima sala). */
  texto: string;
  /** Som tocado ao passar (relativo a jogo/), '' = nenhum. */
  som: string;
  /** 0 a 1. */
  volume: number;
}

/** Uma ponta da conexão: uma passagem (id do objeto) numa sala; passagem '' = o início do jogador da sala. */
export interface PontaConexao { fase: string; passagem: string }

export interface Conexao {
  id: string;
  a: PontaConexao;
  b: PontaConexao;
  /** Voltar de B para A pela mesma conexão (só quando B é uma passagem). */
  maoDupla: boolean;
  transicao: Transicao;
}

export interface Mapa {
  /** Posição de cada sala no diagrama (arquivo da fase → x, y). */
  salas: Record<string, { x: number; y: number }>;
  conexoes: Conexao[];
}

/** Uma viagem durante o jogo: para onde vai, onde chega e com qual transição. */
export interface Viagem {
  fase: string;
  /** Id da passagem onde o jogador aparece na sala de destino ('' = início do jogador). */
  chegada: string;
  transicao: Transicao;
  /** De onde veio. */
  deFase: string;
  dePassagem: string;
  conexao?: string;
}

export function transicaoPadrao(efeito: EfeitoTransicao = 'escurecer'): Transicao {
  return { efeito, animacao: '', duracao: efeito === 'tela' ? 1.2 : 0.35, cor: '#000000', texto: '', som: '', volume: 0.8 };
}

export const mapaVazio = (): Mapa => ({ salas: {}, conexoes: [] });

export function normalizarTransicao(d: unknown): Transicao {
  const t = (d ?? {}) as Partial<Transicao>;
  const efeito = EFEITOS_TRANSICAO.some((e) => e.id === t.efeito) ? t.efeito as EfeitoTransicao : 'escurecer';
  const base = transicaoPadrao(efeito);
  const anim = normalizarAnim(t.anim);
  return {
    efeito,
    animacao: typeof t.animacao === 'string' ? t.animacao : '',
    ...(anim ? { anim } : {}),
    duracao: Number.isFinite(Number(t.duracao)) ? Math.max(0, Math.min(30, Number(t.duracao))) : base.duracao,
    cor: typeof t.cor === 'string' && /^#[0-9a-f]{6}$/i.test(t.cor) ? t.cor : base.cor,
    texto: typeof t.texto === 'string' ? t.texto : '',
    som: typeof t.som === 'string' ? t.som : '',
    volume: Number.isFinite(Number(t.volume)) ? Math.max(0, Math.min(1, Number(t.volume))) : base.volume,
  };
}

export function normalizarMapa(d: unknown): Mapa {
  const m = (d ?? {}) as Partial<Mapa>;
  const salas: Mapa['salas'] = {};
  if (m.salas && typeof m.salas === 'object') {
    for (const [k, v] of Object.entries(m.salas)) if (v && typeof v === 'object') salas[k] = { x: Number(v.x) || 0, y: Number(v.y) || 0 };
  }
  const ponta = (p: unknown): PontaConexao | null => {
    const x = p as Partial<PontaConexao> | null;
    return x && typeof x.fase === 'string' && x.fase ? { fase: x.fase, passagem: typeof x.passagem === 'string' ? x.passagem : '' } : null;
  };
  const conexoes: Conexao[] = [];
  for (const c of Array.isArray(m.conexoes) ? m.conexoes : []) {
    const a = ponta(c?.a), b = ponta(c?.b);
    if (!a || !b || !a.passagem) continue; // a origem sempre é uma passagem
    conexoes.push({ id: String(c.id ?? novoIdConexao({ salas, conexoes })), a, b, maoDupla: c.maoDupla !== false && !!b.passagem, transicao: normalizarTransicao(c.transicao) });
  }
  return { salas, conexoes };
}

export function novoIdConexao(m: Mapa): string {
  let maior = 0;
  for (const c of m.conexoes) { const r = /^con_(\d+)$/.exec(c.id); if (r) maior = Math.max(maior, Number(r[1])); }
  return 'con_' + String(maior + 1).padStart(3, '0');
}

const mesma = (p: PontaConexao, fase: string, passagem: string) => p.fase === fase && p.passagem === passagem;

/** A conexão em que esta passagem está (em qualquer ponta). */
export function conexaoDaPassagem(m: Mapa, fase: string, passagem: string): Conexao | undefined {
  return m.conexoes.find((c) => mesma(c.a, fase, passagem) || (c.b.passagem && mesma(c.b, fase, passagem)));
}

/** Para onde a passagem leva (null = não está conectada, ou é a ponta de chegada de uma conexão só de ida). */
export function viagemDe(m: Mapa, fase: string, passagem: string): Viagem | null {
  for (const c of m.conexoes) {
    if (mesma(c.a, fase, passagem)) return { fase: c.b.fase, chegada: c.b.passagem, transicao: c.transicao, deFase: fase, dePassagem: passagem, conexao: c.id };
    if (c.maoDupla && c.b.passagem && mesma(c.b, fase, passagem)) return { fase: c.a.fase, chegada: c.a.passagem, transicao: c.transicao, deFase: fase, dePassagem: passagem, conexao: c.id };
  }
  return null;
}

/** Liga duas pontas. Uma passagem só leva a um lugar: conexões antigas dessas passagens saem. */
export function conectar(m: Mapa, a: PontaConexao, b: PontaConexao, transicao = transicaoPadrao()): { conexao: Conexao; removidas: Conexao[] } {
  const removidas = m.conexoes.filter((c) => [a, b].some((p) => p.passagem && (mesma(c.a, p.fase, p.passagem) || (c.b.passagem && mesma(c.b, p.fase, p.passagem)))));
  m.conexoes = m.conexoes.filter((c) => !removidas.includes(c));
  const conexao: Conexao = { id: novoIdConexao(m), a, b, maoDupla: !!b.passagem, transicao };
  m.conexoes.push(conexao);
  return { conexao, removidas };
}

/** Uma sala foi renomeada/apagada: tira conexões que apontam para arquivos que não existem mais. */
export function limparMapa(m: Mapa, fasesExistentes: string[]): number {
  const ok = new Set(fasesExistentes);
  const antes = m.conexoes.length;
  m.conexoes = m.conexoes.filter((c) => ok.has(c.a.fase) && ok.has(c.b.fase));
  for (const k of Object.keys(m.salas)) if (!ok.has(k)) delete m.salas[k];
  return antes - m.conexoes.length;
}

/** Resumo curto da transição (para o diagrama e o Log). */
export function resumoTransicao(t: Transicao): string {
  const e = EFEITOS_TRANSICAO.find((x) => x.id === t.efeito)?.nome ?? t.efeito;
  const anim = t.efeito === 'tela' && t.animacao ? ` (${t.animacao.split('/').pop()?.replace(/\.[^.]+$/, '')})` : '';
  return `${e}${anim}${t.som ? ' + som' : ''}`;
}

/** Assets usados pelo mapa (para a limpeza de cópias sem uso não apagar). */
export function assetsDoMapa(m: Mapa): string[] {
  return m.conexoes.flatMap((c) => [c.transicao.animacao, c.transicao.som]).filter(Boolean);
}
