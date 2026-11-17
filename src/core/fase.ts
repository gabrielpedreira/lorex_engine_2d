import type { Camada, Fase, ObjetoFase, TipoCena } from './tipos';

export const VERSAO_FASE = 1;

export function camadasPadrao(): Camada[] {
  const c = (id: string, nome: string, p: number): Camada =>
    ({ id, nome, parallax: [p, p], visivel: true, travada: false });
  return [
    c('fundo3', 'Fundo 3 (mais distante)', 0.2),
    c('fundo2', 'Fundo 2', 0.5),
    c('fundo1', 'Fundo 1', 0.8),
    c('decoracao', 'Decoração de trás', 1),
    c('terreno', 'Terreno', 1),
    c('objetos', 'Objetos', 1),
    c('frente', 'Primeiro plano', 1.2),
  ];
}

export interface OpcoesFase {
  tipo?: TipoCena;
  regiao?: string;
  resolucaoBase?: [number, number];
  tamanhoGrade?: number;
  /** Tamanho da fase medido em telas (resolução base). */
  telas?: [number, number];
  corFundo?: string;
}

export function criarFase(nome: string, o: OpcoesFase = {}): Fase {
  const res = o.resolucaoBase ?? [640, 360];
  const telas = o.telas ?? [4, 1];
  return {
    versao: VERSAO_FASE,
    nome,
    tipo: o.tipo ?? 'fase',
    regiao: o.regiao ?? '',
    resolucaoBase: [res[0], res[1]],
    tamanhoGrade: o.tamanhoGrade ?? 16,
    tamanho: [res[0] * telas[0], res[1] * telas[1]],
    corFundo: o.corFundo ?? '#0e0f13',
    camadas: camadasPadrao(),
    objetos: [],
    colisoes: [],
    spawnJogador: [64, Math.round(res[1] * telas[1] * 0.7)],
  };
}

/** Lê um JSON de fase e completa campos que faltarem (fases antigas continuam abrindo). */
export function normalizarFase(dados: unknown): Fase {
  const d = (dados ?? {}) as Partial<Fase>;
  const base = criarFase(typeof d.nome === 'string' ? d.nome : 'Sem nome');
  const camadas = Array.isArray(d.camadas) && d.camadas.length ? d.camadas.map((c) => ({
    id: String(c.id), nome: String(c.nome ?? c.id),
    parallax: (Array.isArray(c.parallax) ? c.parallax : [1, 1]) as [number, number],
    visivel: c.visivel !== false, travada: !!c.travada,
  })) : base.camadas;
  const idsCamadas = new Set(camadas.map((c) => c.id));
  const objetos = (Array.isArray(d.objetos) ? d.objetos : []).map((o) => normalizarObjeto(o, camadas[camadas.length - 1].id))
    .map((o) => (idsCamadas.has(o.camada) ? o : { ...o, camada: camadas[camadas.length - 1].id }));
  return {
    ...base,
    ...d,
    versao: VERSAO_FASE,
    camadas,
    objetos,
    colisoes: Array.isArray(d.colisoes) ? d.colisoes : [],
    tamanhoGrade: typeof d.tamanhoGrade === 'number' && d.tamanhoGrade > 0 ? d.tamanhoGrade : 16,
    tipo: d.tipo === 'area' ? 'area' : 'fase',
    regiao: typeof d.regiao === 'string' ? d.regiao : '',
  } as Fase;
}

function normalizarObjeto(o: Partial<ObjetoFase>, camadaPadrao: string): ObjetoFase {
  return {
    id: String(o.id ?? 'obj_sem_id'),
    tipo: o.tipo === 'interativo' ? 'interativo' : 'estatico',
    nome: String(o.nome ?? o.id ?? 'objeto'),
    asset: String(o.asset ?? ''),
    ...(o.origem ? { origem: String(o.origem) } : {}),
    camada: String(o.camada ?? camadaPadrao),
    x: Number(o.x ?? 0), y: Number(o.y ?? 0),
    w: Number(o.w ?? 16), h: Number(o.h ?? 16),
    escala: Number(o.escala ?? 1),
    rotacao: Number(o.rotacao ?? 0),
    espelharX: !!o.espelharX, espelharY: !!o.espelharY,
    opacidade: o.opacidade === undefined ? 1 : Number(o.opacidade),
    visivel: o.visivel !== false,
    efeitos: o.efeitos ?? [], comportamentos: o.comportamentos ?? [],
    conexoes: o.conexoes ?? {}, script: o.script ?? null,
  };
}

export function novoIdObjeto(fase: Fase): string {
  let maior = 0;
  for (const o of fase.objetos) {
    const m = /^obj_(\d+)$/.exec(o.id);
    if (m) maior = Math.max(maior, Number(m[1]));
  }
  return 'obj_' + String(maior + 1).padStart(3, '0');
}

export function nomeDoArquivo(caminho: string): string {
  const base = caminho.split('/').pop() ?? caminho;
  return base.replace(/\.[^.]+$/, '');
}

export function nomeArquivoFase(nome: string): string {
  const slug = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return (slug || 'fase') + '.json';
}
