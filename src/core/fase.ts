import type { Camada, Colisao, Fase, Iluminacao, LuzFase, ObjetoFase, TipoCena } from './tipos';
import { normalizarEfeitos } from './efeitos';
import { normalizarComportamentos } from './comportamentos';
import { normalizarAnim } from './folha';

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
    inimigos: [],
    luzes: [],
    iluminacao: iluminacaoPadrao(),
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
    colisoes: normalizarColisoes(d.colisoes),
    spawnJogador: Array.isArray(d.spawnJogador) && d.spawnJogador.length === 2 ? [Number(d.spawnJogador[0]) || 0, Number(d.spawnJogador[1]) || 0] : base.spawnJogador,
    tamanhoGrade: typeof d.tamanhoGrade === 'number' && d.tamanhoGrade > 0 ? d.tamanhoGrade : 16,
    tipo: d.tipo === 'area' ? 'area' : 'fase',
    regiao: typeof d.regiao === 'string' ? d.regiao : '',
    inimigos: (Array.isArray(d.inimigos) ? d.inimigos : []).filter((i) => i && typeof i.personagem === 'string').map((i) => ({
      id: String(i.id), personagem: i.personagem, x: Number(i.x) || 0, y: Number(i.y) || 0, olhandoDireita: !!i.olhandoDireita,
      ...(typeof i.surge === 'string' && i.surge ? { surge: i.surge } : {}),
    })),
    luzes: (Array.isArray(d.luzes) ? d.luzes : []).filter((l) => l && typeof l === 'object').map(normalizarLuz),
    iluminacao: { ...iluminacaoPadrao(), ...(d.iluminacao ?? {}) },
  } as Fase;
}

function normalizarObjeto(o: Partial<ObjetoFase>, camadaPadrao: string): ObjetoFase {
  const anim = normalizarAnim(o.anim);
  return {
    ...(anim ? { anim } : {}),
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
    efeitos: normalizarEfeitos(o.efeitos), comportamentos: normalizarComportamentos(o.comportamentos),
    conexoes: o.conexoes ?? {}, script: o.script ?? null,
    ...(o.campos && typeof o.campos === 'object' ? { campos: { ...o.campos } } : {}),
  };
}

export const iluminacaoPadrao = (): Iluminacao => ({ escura: false, escuridao: 0.85, cor: '#05070d', lanterna: 0, lanternaForma: 'circulo' });

export function normalizarLuz(l: Partial<LuzFase>): LuzFase {
  return {
    id: String(l.id ?? 'luz_001'), nome: String(l.nome ?? l.id ?? 'Luz'),
    forma: l.forma === 'cone' || l.forma === 'retangulo' ? l.forma : 'circulo',
    angulo: Number.isFinite(Number(l.angulo)) ? Number(l.angulo) : 90,
    abertura: Math.max(5, Math.min(170, Number(l.abertura) || 50)),
    largura: Math.max(4, Number(l.largura) || 64),
    altura: Math.max(4, Number(l.altura) || 96),
    x: Number(l.x) || 0, y: Number(l.y) || 0,
    raio: Math.max(8, Number(l.raio) || 96),
    intensidade: Math.max(0, Math.min(1, l.intensidade === undefined ? 1 : Number(l.intensidade))),
    cor: typeof l.cor === 'string' && /^#[0-9a-f]{6}$/i.test(l.cor) ? l.cor : '#ffe8b0',
    tremular: !!l.tremular, ligada: l.ligada !== false,
  };
}

export function novoIdLuz(fase: Fase): string {
  let maior = 0;
  for (const l of fase.luzes) { const m = /^luz_(\d+)$/.exec(l.id); if (m) maior = Math.max(maior, Number(m[1])); }
  return 'luz_' + String(maior + 1).padStart(3, '0');
}

export function novoIdInimigo(fase: Fase): string {
  let maior = 0;
  for (const i of fase.inimigos) { const m = /^ini_(\d+)$/.exec(i.id); if (m) maior = Math.max(maior, Number(m[1])); }
  return 'ini_' + String(maior + 1).padStart(3, '0');
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

/** Lê colisões; converte o formato antigo (tipo/x/y/w/h/sobe) para pontos. */
function normalizarColisoes(lista: unknown): Colisao[] {
  if (!Array.isArray(lista)) return [];
  const saida: Colisao[] = [];
  lista.forEach((bruto, i) => {
    if (!bruto || typeof bruto !== 'object') return;
    const b = bruto as Record<string, unknown>;
    const id = String(b.id ?? `col_${String(i + 1).padStart(3, '0')}`);
    if (Array.isArray(b.pontos)) {
      const pontos = (b.pontos as unknown[]).filter((p): p is [number, number] => Array.isArray(p) && p.length === 2)
        .map(([x, y]) => [Math.round(Number(x) || 0), Math.round(Number(y) || 0)] as [number, number]);
      const forma = (['bloco', 'rampa', 'poligono', 'linha'] as const).find((f) => f === b.forma) ?? 'poligono';
      if (pontos.length >= (forma === 'linha' ? 2 : 3)) {
        saida.push({ id, forma, comportamento: b.comportamento === 'atravessavel' ? 'atravessavel' : 'solido', pontos });
      }
      return;
    }
    // Formato antigo (etapa 2): retângulo ou rampa
    const x = Math.round(Number(b.x) || 0), y = Math.round(Number(b.y) || 0);
    const w = Math.max(1, Math.round(Number(b.w) || 1)), h = Math.max(1, Math.round(Number(b.h) || 1));
    if (b.tipo === 'rampa') {
      const pontos: [number, number][] = b.sobe === 'esquerda' ? [[x, y], [x + w, y + h], [x, y + h]] : [[x + w, y], [x + w, y + h], [x, y + h]];
      saida.push({ id, forma: 'rampa', comportamento: 'solido', pontos });
    } else {
      saida.push({ id, forma: 'bloco', comportamento: b.tipo === 'atravessavel' ? 'atravessavel' : 'solido', pontos: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] });
    }
  });
  return saida;
}

export function novoIdColisao(fase: Fase): string {
  let maior = 0;
  for (const c of fase.colisoes) {
    const m = /^col_(\d+)$/.exec(c.id);
    if (m) maior = Math.max(maior, Number(m[1]));
  }
  return 'col_' + String(maior + 1).padStart(3, '0');
}
