// Comportamentos dos objetos interativos e o "mundo interativo" que roda no ▶ Testar (e no jogo).
// Puro (sem PixiJS e sem DOM).
import type { Segmento } from './fisica';
import type { Fase, ObjetoFase } from './tipos';

export interface CompColetavel { tipo: 'coletavel'; /** nome do item no inventário (ex.: "chave vermelha") */ item: string; quantidade: number }
export interface CompPorta { tipo: 'porta'; /** item necessário para abrir ('' = abre sem item) */ requer: string; consome: boolean; abertaNoInicio: boolean }
export interface CompAlavanca { tipo: 'alavanca'; /** id do objeto que a alavanca aciona */ alvo: string; umaVez: boolean }
export interface CompSaida { tipo: 'saida'; /** arquivo da fase/área de destino (ex.: "area_02.json") */ destino: string }
export interface CompMensagem { tipo: 'mensagem'; texto: string }

export type Comportamento = CompColetavel | CompPorta | CompAlavanca | CompSaida | CompMensagem;
export type TipoComportamento = Comportamento['tipo'];

export const NOMES_COMPORTAMENTO: Record<TipoComportamento, { nome: string; texto: string }> = {
  coletavel: { nome: 'Coletável', texto: 'O jogador pega ao encostar (chave, munição, kit médico). Vai para o inventário.' },
  porta: { nome: 'Porta', texto: 'Bloqueia a passagem enquanto fechada. Abre com a tecla E (pode exigir um item) ou por uma alavanca.' },
  alavanca: { nome: 'Alavanca / botão', texto: 'Com a tecla E, aciona outro objeto: abre ou fecha uma porta, mostra ou esconde um objeto.' },
  saida: { nome: 'Saída', texto: 'Leva para outra fase ou área ao apertar E. É assim que as áreas se conectam.' },
  mensagem: { nome: 'Mensagem / nota', texto: 'Mostra um texto ao apertar E (bilhete, placa, documento, pensamento da personagem).' },
};

export function comportamentoPadrao(tipo: TipoComportamento, o: ObjetoFase): Comportamento {
  switch (tipo) {
    case 'coletavel': return { tipo, item: o.nome.replace(/[_-]+/g, ' '), quantidade: 1 };
    case 'porta': return { tipo, requer: '', consome: false, abertaNoInicio: false };
    case 'alavanca': return { tipo, alvo: '', umaVez: false };
    case 'saida': return { tipo, destino: '' };
    case 'mensagem': return { tipo, texto: '' };
  }
}

export function normalizarComportamentos(lista: unknown): Comportamento[] {
  if (!Array.isArray(lista)) return [];
  const saida: Comportamento[] = [];
  for (const b of lista) {
    const c = b as Partial<Comportamento> | null;
    if (!c || typeof c !== 'object' || !c.tipo || !(c.tipo in NOMES_COMPORTAMENTO)) continue;
    const base = comportamentoPadrao(c.tipo, { nome: '' } as ObjetoFase);
    saida.push({ ...base, ...c } as Comportamento);
  }
  return saida.slice(0, 1); // por enquanto, um comportamento por objeto
}

export function comportamentoDe(o: ObjetoFase): Comportamento | undefined {
  return o.tipo === 'interativo' ? (o.comportamentos[0] as Comportamento | undefined) : undefined;
}

/** Caixa do objeto no mundo (camadas com parallax 1; interação só faz sentido nelas). */
export function caixaObjeto(o: ObjetoFase) {
  return { x: o.x, y: o.y, w: o.w * o.escala, h: o.h * o.escala };
}

type Caixa = { x: number; y: number; w: number; h: number };
const toca = (a: Caixa, b: Caixa, folga = 0) =>
  a.x < b.x + b.w + folga && a.x + a.w > b.x - folga && a.y < b.y + b.h + folga && a.y + a.h > b.y - folga;

export interface EstadoObjeto { visivel: boolean; aberta: boolean; usado: boolean }

export interface ResultadoInteracao {
  aviso?: string;
  mensagem?: string;
  irPara?: string;
}

/** Estado do mundo durante o jogo: inventário, portas abertas, itens pegos. */
export class MundoInterativo {
  readonly estados = new Map<string, EstadoObjeto>();
  readonly inventario = new Map<string, number>();
  private mudou = true;
  private segsPortas: Segmento[] = [];

  constructor(private fase: Fase) {
    for (const o of fase.objetos) {
      const c = comportamentoDe(o);
      this.estados.set(o.id, { visivel: o.visivel, aberta: c?.tipo === 'porta' ? c.abertaNoInicio : false, usado: false });
    }
  }

  private objeto(id: string) { return this.fase.objetos.find((o) => o.id === id); }

  /** Portas fechadas viram paredes sólidas (a caixa da imagem). */
  segmentosPortas(): Segmento[] {
    if (!this.mudou) return this.segsPortas;
    this.mudou = false;
    this.segsPortas = [];
    for (const o of this.fase.objetos) {
      const c = comportamentoDe(o);
      const e = this.estados.get(o.id);
      if (c?.tipo !== 'porta' || !e || e.aberta || !e.visivel) continue;
      const b = caixaObjeto(o);
      const [x0, y0, x1, y1] = [b.x, b.y, b.x + b.w, b.y + b.h];
      this.segsPortas.push(
        { ax: x0, ay: y0, bx: x1, by: y0, tipo: 'chao', umaVia: false },
        { ax: x1, ay: y0, bx: x1, by: y1, tipo: 'parede', umaVia: false },
        { ax: x0, ay: y1, bx: x1, by: y1, tipo: 'teto', umaVia: false },
        { ax: x0, ay: y0, bx: x0, by: y1, tipo: 'parede', umaVia: false },
      );
    }
    return this.segsPortas;
  }

  /** Visível no jogo agora (itens pegos e portas abertas somem). */
  visivel(id: string) {
    const e = this.estados.get(id);
    const o = this.objeto(id);
    if (!e || !o) return true;
    const c = comportamentoDe(o);
    if (c?.tipo === 'porta') return e.visivel && !e.aberta;
    return e.visivel;
  }

  /** Pega os coletáveis que o jogador está tocando. Retorna os avisos. */
  coletar(jogador: Caixa): string[] {
    const avisos: string[] = [];
    for (const o of this.fase.objetos) {
      const c = comportamentoDe(o);
      const e = this.estados.get(o.id);
      if (c?.tipo !== 'coletavel' || !e || !e.visivel || !toca(jogador, caixaObjeto(o))) continue;
      e.visivel = false;
      this.inventario.set(c.item, (this.inventario.get(c.item) ?? 0) + c.quantidade);
      avisos.push(`Pegou: ${c.item}${c.quantidade > 1 ? ` ×${c.quantidade}` : ''}`);
    }
    return avisos;
  }

  /** Objeto interagível (tecla E) mais próximo do jogador, com o texto do botão. */
  proximo(jogador: Caixa): { o: ObjetoFase; acao: string } | null {
    let melhor: { o: ObjetoFase; acao: string; d: number } | null = null;
    const cx = jogador.x + jogador.w / 2;
    for (const o of this.fase.objetos) {
      const c = comportamentoDe(o);
      const e = this.estados.get(o.id);
      if (!c || c.tipo === 'coletavel' || !e || !e.visivel) continue;
      const b = caixaObjeto(o);
      if (!toca(jogador, b, 14)) continue;
      if (c.tipo === 'alavanca' && c.umaVez && e.usado) continue;
      if (c.tipo === 'porta' && e.aberta) continue;
      const acao = c.tipo === 'porta' ? (c.requer && !this.inventario.get(c.requer) ? `Abrir (precisa de: ${c.requer})` : 'Abrir')
        : c.tipo === 'alavanca' ? 'Acionar' : c.tipo === 'saida' ? 'Entrar' : 'Ler';
      const d = Math.abs(b.x + b.w / 2 - cx);
      if (!melhor || d < melhor.d) melhor = { o, acao, d };
    }
    return melhor ? { o: melhor.o, acao: melhor.acao } : null;
  }

  interagir(o: ObjetoFase): ResultadoInteracao {
    const c = comportamentoDe(o);
    const e = this.estados.get(o.id);
    if (!c || !e) return {};
    switch (c.tipo) {
      case 'porta': {
        if (c.requer) {
          const tem = this.inventario.get(c.requer) ?? 0;
          if (!tem) return { aviso: `Trancada. Precisa de: ${c.requer}` };
          if (c.consome) this.inventario.set(c.requer, tem - 1);
          if (this.inventario.get(c.requer) === 0) this.inventario.delete(c.requer);
        }
        e.aberta = true; this.mudou = true;
        return { aviso: `${o.nome}: aberta` };
      }
      case 'alavanca': {
        e.usado = true;
        const alvo = c.alvo ? this.objeto(c.alvo) : undefined;
        const ea = alvo ? this.estados.get(alvo.id) : undefined;
        if (!alvo || !ea) return { aviso: 'Esta alavanca não está ligada a nada (escolha um alvo no editor).' };
        const ca = comportamentoDe(alvo);
        if (ca?.tipo === 'porta') { ea.aberta = !ea.aberta; this.mudou = true; return { aviso: `${alvo.nome}: ${ea.aberta ? 'aberta' : 'fechada'}` }; }
        ea.visivel = !ea.visivel; this.mudou = true;
        return { aviso: `${alvo.nome}: ${ea.visivel ? 'apareceu' : 'sumiu'}` };
      }
      case 'saida':
        return c.destino ? { irPara: c.destino } : { aviso: 'Esta saída ainda não tem destino (escolha no editor).' };
      case 'mensagem':
        return { mensagem: c.texto || '(mensagem vazia)' };
      default:
        return {};
    }
  }
}
