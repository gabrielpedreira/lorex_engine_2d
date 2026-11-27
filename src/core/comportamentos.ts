// Comportamentos dos objetos interativos e o "mundo interativo" que roda no ▶ Testar (e no jogo).
// Puro (sem PixiJS e sem DOM).
import { montarSegmentos, type Segmento } from './fisica';
import type { Fase, ObjetoFase } from './tipos';
import { quadroDaFolha } from './folha';

export interface CompColetavel {
  tipo: 'coletavel'; /** nome do item no inventário (ex.: "chave vermelha") */ item: string; quantidade: number;
  /** Kit médico: cura esta vida ao pegar (e não vai para o inventário). 0/ausente = item comum. */
  cura?: number;
}
export interface CompPorta { tipo: 'porta'; /** item necessário para abrir ('' = abre sem item) */ requer: string; consome: boolean; abertaNoInicio: boolean }
export interface CompAlavanca { tipo: 'alavanca'; /** id do objeto que a alavanca aciona */ alvo: string; umaVez: boolean }
/** Passagem (porta, escada, saída): para onde leva e o efeito ficam no MAPA (ferramenta Mapa, M).
 *  destino = destino simples, usado só quando a passagem não está conectada no Mapa. */
export interface CompSaida {
  tipo: 'saida'; destino: string; /** item que destranca ('' = livre) */ requer: string; consome: boolean;
  /** interagir = apertar Interagir (porta); tocar = passa sozinho ao atravessar (fim de rua, corredor contínuo). */
  modo: ModoPassagem;
}
export type ModoPassagem = 'interagir' | 'tocar';
export const MODOS_PASSAGEM: { id: ModoPassagem; nome: string; texto: string }[] = [
  { id: 'interagir', nome: 'Apertando Interagir (porta)', texto: 'O jogador para na frente e aperta Interagir (E): portas, escadas, alçapões.' },
  { id: 'tocar', nome: 'Ao atravessar (contínua)', texto: 'Passa sozinho ao encostar: fim de rua, corredor que continua, borda da área.' },
];
/** Gatilho: zona invisível que faz algo quando o jogador entra (e o código recebe aoTocar/aoSair). */
export interface CompGatilho {
  tipo: 'gatilho';
  acao: AcaoGatilho;
  /** mensagem: o texto */
  texto: string;
  /** acionar: id do objeto (como uma alavanca) */
  alvo: string;
  /** luzes: id da luz ('' = todas) e o que fazer */
  luz: string;
  luzAcao: 'ligar' | 'desligar' | 'alternar';
  /** Só dispara na primeira vez. */
  umaVez: boolean;
}
export type AcaoGatilho = 'nada' | 'mensagem' | 'acionar' | 'inimigos' | 'luzes' | 'escurecer' | 'clarear' | 'checkpoint';
export const ACOES_GATILHO: { id: AcaoGatilho; nome: string; texto: string }[] = [
  { id: 'nada', nome: 'Só o código', texto: 'Não faz nada sozinho: o código do objeto recebe aoTocar (entrou) e aoSair (saiu).' },
  { id: 'mensagem', nome: 'Mostrar mensagem', texto: 'Mostra um texto ao entrar (pensamento da personagem, aviso).' },
  { id: 'inimigos', nome: 'Fazer inimigos surgirem', texto: 'Os inimigos marcados com "Surge no gatilho" (Propriedades do inimigo) aparecem quando o jogador entra (spawner / emboscada).' },
  { id: 'acionar', nome: 'Acionar objeto', texto: 'Como uma alavanca: abre/fecha uma porta ou mostra/esconde um objeto.' },
  { id: 'luzes', nome: 'Ligar/desligar luz', texto: 'Liga, desliga ou alterna uma luz (ou todas) da ferramenta Iluminação.' },
  { id: 'escurecer', nome: 'Apagar as luzes da sala', texto: 'A fase fica escura (queda de energia).' },
  { id: 'clarear', nome: 'Acender a sala', texto: 'A fase deixa de ser escura.' },
  { id: 'checkpoint', nome: 'Checkpoint', texto: 'Ao morrer, o jogador volta aqui (com a vida cheia). Entrar numa sala também marca um checkpoint na chegada.' },
];
export interface CompMensagem { tipo: 'mensagem'; texto: string }
/**
 * Área de uso de item: zona (amarela no editor) onde um item do menu funciona. O jogador para em cima, abre o
 * menu e escolhe Usar: se o item é o certo, faz a ação; fora de uma área assim: "Você não deve usar este item aqui".
 */
export interface CompUsoItem {
  tipo: 'usoItem';
  /** Item aceito (nome do inventário). */
  item: string;
  acao: AcaoUsoItem;
  /** abrir/acionar/mostrar/esconder: id do objeto. */
  alvo: string;
  /** Texto mostrado ao usar certo (opcional). */
  texto: string;
  /** Texto ao usar outro item aqui ('' = "Isso não funciona aqui."). */
  textoErrado: string;
  /** O item some ao usar. */
  consome: boolean;
  /** Só funciona uma vez. */
  umaVez: boolean;
}
export type AcaoUsoItem = 'abrir' | 'acionar' | 'mostrar' | 'esconder' | 'mensagem' | 'nada';
export const ACOES_USO_ITEM: { id: AcaoUsoItem; nome: string; texto: string }[] = [
  { id: 'abrir', nome: 'Abrir porta', texto: 'Destranca e abre a porta escolhida (ex.: chave na fechadura).' },
  { id: 'acionar', nome: 'Acionar objeto', texto: 'Como uma alavanca: abre/fecha uma porta ou mostra/esconde um objeto (ex.: pendrive no computador liga algo).' },
  { id: 'mostrar', nome: 'Mostrar objeto', texto: 'Faz um objeto aparecer (ex.: a corrente cortada some e aparece a passagem).' },
  { id: 'esconder', nome: 'Esconder objeto', texto: 'Faz um objeto sumir (ex.: alicate na corrente → a corrente some).' },
  { id: 'mensagem', nome: 'Só mensagem', texto: 'Só mostra o texto.' },
  { id: 'nada', nome: 'Só o código', texto: 'Nada sozinho: o código da área recebe aoUsarItem(eu, jogo, item).' },
];

/** Uma etapa de um ponto de inspeção: cada vez que o jogador interage, acontece a próxima. */
export interface EtapaInspecao {
  tipo: TipoEtapa;
  /** legenda: o texto; ver: a legenda embaixo da imagem; item/arquivo: o texto do aviso (opcional). */
  texto: string;
  /** item/arquivo: o nome (o mesmo de Menu e itens). */
  item: string;
  quantidade: number;
  /** ver: a imagem ampliada; arquivo: a foto do arquivo (relativo a jogo/). */
  imagem: string;
}
export type TipoEtapa = 'legenda' | 'item' | 'arquivo' | 'ver';
export const TIPOS_ETAPA: { id: TipoEtapa; nome: string; texto: string }[] = [
  { id: 'legenda', nome: 'Legenda', texto: 'Mostra um texto na tela (pensamento da personagem, descrição do que ela vê).' },
  { id: 'item', nome: 'Pegar item', texto: 'Dá um item para o menu (ex.: o celular, a chave). Sem espaço livre, a etapa espera.' },
  { id: 'arquivo', nome: 'Pegar arquivo', texto: 'Guarda um arquivo (nota, foto, documento) na lista de Arquivos do menu, com a foto e o texto daqui.' },
  { id: 'ver', nome: 'Ver de perto', texto: 'Mostra uma imagem ampliada com legenda (mensagens no celular, tela do computador, cartaz, uma cena).' },
];
/**
 * Ponto de inspeção: quando o jogador passa por ele aparece o olho acima da personagem (e um leve foco na tela);
 * cada interação faz a próxima etapa (ex.: 1ª ver as mensagens do celular do cadáver, 2ª pegar a chave).
 */
export interface CompInspecionar {
  tipo: 'inspecionar';
  etapas: EtapaInspecao[];
  /** Brilho para achar mais fácil (itens importantes); desligado = sutil. */
  destaque: boolean;
  /** Depois da última etapa, ainda dá para inspecionar (repete a última); desligado = o ponto se apaga. */
  repetir: boolean;
  /** Texto do botão (ex.: "Inspecionar", "Revistar", "Ler"). */
  rotulo: string;
}
/** Objeto empurrável (lixeira, caixote, escada): passa-se na frente; dá para subir em cima; empurra-se pelos pontos de empurrar. */
export interface CompEmpurravel { tipo: 'empurravel'; /** px/s enquanto empurra */ velocidade: number }
/** Ponto de empurrar: zona (azul) ao lado do empurrável; parado nela, a interação começa a empurrar. */
export interface CompPontoEmpurrar { tipo: 'pontoEmpurrar'; /** id do objeto empurrável */ alvo: string }

export function etapaBase(tipo: TipoEtapa = 'legenda'): EtapaInspecao { return { tipo, texto: '', item: '', quantidade: 1, imagem: '' }; }

export type Comportamento = CompColetavel | CompPorta | CompAlavanca | CompSaida | CompMensagem | CompGatilho | CompUsoItem | CompInspecionar | CompEmpurravel | CompPontoEmpurrar;
export type TipoComportamento = Comportamento['tipo'];

export const NOMES_COMPORTAMENTO: Record<TipoComportamento, { nome: string; texto: string }> = {
  coletavel: { nome: 'Coletável', texto: 'O jogador pega ao encostar (chave, munição, kit médico). Vai para o inventário.' },
  porta: { nome: 'Porta', texto: 'Bloqueia a passagem enquanto fechada. Abre com a tecla E (pode exigir um item) ou por uma alavanca.' },
  alavanca: { nome: 'Alavanca / botão', texto: 'Com a tecla E, aciona outro objeto: abre ou fecha uma porta, mostra ou esconde um objeto.' },
  saida: { nome: 'Passagem (porta/saída)', texto: 'Leva para outra sala ao apertar E. Para onde leva e o que acontece no caminho (tela de loading, som) são definidos no Mapa (M).' },
  mensagem: { nome: 'Mensagem / nota', texto: 'Mostra um texto ao apertar E (bilhete, placa, documento, pensamento da personagem).' },
  gatilho: { nome: 'Gatilho (zona)', texto: 'Dispara quando o jogador entra na área: mensagem, inimigos surgindo, luzes, acionar objeto. Use com uma zona (ferramenta Zona, Z).' },
  inspecionar: { nome: 'Ponto de inspeção', texto: 'O jogador vê um olho acima da personagem ao passar; cada interação faz a próxima etapa: legenda, pegar item, pegar arquivo ou ver de perto (ex.: cadáver com celular e depois uma chave; computador; cartaz). Pode brilhar para itens importantes.' },
  empurravel: { nome: 'Empurrável', texto: 'Lixeira, caixote, escada: a personagem passa na frente, pode subir em cima (a colisão de cima segura) e empurra parada num ponto de empurrar (zona azul) apertando Interagir.' },
  pontoEmpurrar: { nome: 'Ponto de empurrar', texto: 'Zona ao lado de um empurrável: no chão aqui, SEGURE Interagir para empurrar (soltar a tecla ou pular solta; em cima do objeto não empurra).' },
  usoItem: { nome: 'Área de uso de item', texto: 'Zona amarela onde um item do menu funciona (chave na porta, pendrive no computador, alicate na corrente). Fora dela, usar o item dá "Você não deve usar este item aqui". Crie com a ferramenta Zona (Z).' },
};

export function comportamentoPadrao(tipo: TipoComportamento, o: ObjetoFase): Comportamento {
  switch (tipo) {
    case 'coletavel': return { tipo, item: o.nome.replace(/[_-]+/g, ' '), quantidade: 1 };
    case 'porta': return { tipo, requer: '', consome: false, abertaNoInicio: false };
    case 'alavanca': return { tipo, alvo: '', umaVez: false };
    case 'saida': return { tipo, destino: '', requer: '', consome: false, modo: 'interagir' };
    case 'gatilho': return { tipo, acao: 'mensagem', texto: '', alvo: '', luz: '', luzAcao: 'alternar', umaVez: true };
    case 'mensagem': return { tipo, texto: '' };
    case 'usoItem': return { tipo, item: '', acao: 'abrir', alvo: '', texto: '', textoErrado: '', consome: true, umaVez: true };
    case 'inspecionar': return { tipo, etapas: [etapaBase('legenda')], destaque: false, repetir: true, rotulo: 'Inspecionar' };
    case 'empurravel': return { tipo, velocidade: 60 };
    case 'pontoEmpurrar': return { tipo, alvo: '' };
  }
}

export function normalizarComportamentos(lista: unknown): Comportamento[] {
  if (!Array.isArray(lista)) return [];
  const saida: Comportamento[] = [];
  for (const b of lista) {
    const c = b as Partial<Comportamento> | null;
    if (!c || typeof c !== 'object' || !c.tipo || !(c.tipo in NOMES_COMPORTAMENTO)) continue;
    const base = comportamentoPadrao(c.tipo, { nome: '' } as ObjetoFase);
    const n = { ...base, ...c } as Comportamento;
    if (n.tipo === 'inspecionar') n.etapas = (Array.isArray(n.etapas) ? n.etapas : []).filter((e) => e && typeof e === 'object').map((e) => ({ ...etapaBase(), ...e, quantidade: Math.max(1, Math.round(Number(e.quantidade) || 1)) }));
    saida.push(n);
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
export const toca = (a: Caixa, b: Caixa, folga = 0) =>
  a.x < b.x + b.w + folga && a.x + a.w > b.x - folga && a.y < b.y + b.h + folga && a.y + a.h > b.y - folga;

export interface EstadoObjeto { visivel: boolean; aberta: boolean; usado: boolean; /** ponto de inspeção: a próxima etapa */ etapa?: number }

export interface ResultadoInteracao {
  aviso?: string;
  mensagem?: string;
  irPara?: string;
  /** Uma alavanca acionou este objeto (o código dele recebe aoAcionado). */
  acionado?: string;
  /** O jogador usou esta passagem (id do objeto): o Mapa diz para onde ela leva. */
  passagem?: string;
  /** Gatilho de inimigos: os inimigos com "surge" = este id aparecem. */
  surgir?: string;
  /** As luzes mudaram (redesenhar a iluminação). */
  luz?: boolean;
  /** Gatilho de checkpoint: o jogador volta aqui ao morrer. */
  checkpoint?: boolean;
  /** Usar item: deu certo (o item deve sair do inventário se consome). */
  usou?: boolean;
  /** Usar item numa área: id da área (o código dela recebe aoUsarItem). */
  area?: string;
  /** Ponto de inspeção: a etapa a mostrar/fazer agora. */
  inspecao?: EtapaInspecao;
  /** Ponto de empurrar: começa a empurrar este objeto. */
  empurrar?: string;
}

/** Estado do mundo durante o jogo: inventário, portas abertas, itens pegos. */
export class MundoInterativo {
  readonly estados = new Map<string, EstadoObjeto>();
  readonly inventario = new Map<string, number>();
  /** Deslocamento de cada objeto movido pelo código durante o jogo. */
  readonly deslocamentos = new Map<string, { dx: number; dy: number }>();
  /** Objetos sem comportamento que viram interagíveis porque o código deles tem aoInteragir (id → texto do botão). */
  readonly interagiveisPorCodigo = new Map<string, string>();
  /** Objetos cujo código tem aoAcionado: a alavanca não mostra/esconde sozinha, quem decide é o código. */
  readonly acionadosPorCodigo = new Set<string>();
  /** Pergunta ao código se pode coletar (aoColetar retornando false impede). */
  podeColetar: (o: ObjetoFase) => boolean = () => true;
  /** Cabe no menu? (espaços livres; o modo Teste liga ao catálogo de itens) */
  cabe: (item: string) => boolean = () => true;
  /** Mensagem quando não cabe ({item} = o nome). */
  textoSemEspaco = 'Sem espaço para {item}.';
  /** Coletáveis que já avisaram "sem espaço" (até o jogador sair de cima). */
  private avisouSemEspaco = new Set<string>();
  private mudou = true;
  private segsPortas: Segmento[] = [];

  /** Tempo do jogo (s), atualizado pelo modo Teste: base das animações dos objetos. */
  tempo = 0;
  /** Zonas (gatilhos e passagens contínuas) em que o jogador está agora. */
  private dentro = new Set<string>();
  /** Passagens contínuas desarmadas até o jogador sair delas (quem chega por uma não volta na hora). */
  readonly desarmadas = new Set<string>();
  /** Iluminação no jogo: a sala está escura? e cada luz ligada/desligada. */
  escura = false;
  readonly luzes = new Map<string, boolean>();
  /** Raio/intensidade mudados pelo código durante o jogo. */
  readonly ajusteLuz = new Map<string, { raio?: number; intensidade?: number; angulo?: number }>();
  /** Animação de cada objeto animado: tocando desde "inicio" ou parada num quadro fixo. */
  private anims = new Map<string, { inicio: number; repetir: boolean } | { fixo: number }>();

  constructor(private fase: Fase) {
    this.escura = fase.iluminacao.escura;
    for (const l of fase.luzes) this.luzes.set(l.id, l.ligada);
    for (const o of fase.objetos) {
      const c = comportamentoDe(o);
      const aberta = c?.tipo === 'porta' ? c.abertaNoInicio : false;
      this.estados.set(o.id, { visivel: o.visivel, aberta, usado: false });
      if (o.anim) {
        if (c?.tipo === 'porta') this.anims.set(o.id, { fixo: aberta ? o.anim.quadros - 1 : 0 });
        else if (o.anim.modo === 'loop') this.anims.set(o.id, { inicio: 0, repetir: true });
        else if (o.anim.modo === 'umaVez') this.anims.set(o.id, { inicio: 0, repetir: false });
        else this.anims.set(o.id, { fixo: 0 });
      }
    }
  }

  // ---------- Animação dos objetos ----------
  tocarAnim(id: string, repetir = false) { this.anims.set(id, { inicio: this.tempo, repetir }); }
  pararAnim(id: string) { const o = this.objeto(id); if (o) this.anims.set(id, { fixo: this.quadroAnim(o) }); }
  definirQuadro(id: string, q: number) {
    const o = this.objeto(id);
    if (o?.anim) this.anims.set(id, { fixo: Math.max(0, Math.min(o.anim.quadros - 1, Math.round(q))) });
  }
  quadroAnim(o: ObjetoFase): number {
    const s = this.anims.get(o.id);
    if (!o.anim || !s) return 0;
    if ('fixo' in s) return s.fixo;
    return quadroDaFolha(o.anim, this.tempo - s.inicio, s.repetir);
  }
  tocandoAnim(o: ObjetoFase): boolean {
    const s = this.anims.get(o.id);
    if (!o.anim || !s || 'fixo' in s) return false;
    return s.repetir || (this.tempo - s.inicio) * o.anim.fps < o.anim.quadros;
  }

  /** Abre/fecha uma porta. Porta animada toca a animação ao abrir e volta ao 1º quadro ao fechar. */
  definirAberta(id: string, aberta: boolean) {
    const e = this.estados.get(id);
    const o = this.objeto(id);
    if (!e || !o || e.aberta === aberta) { if (e) e.aberta = aberta; return; }
    e.aberta = aberta;
    this.mudou = true;
    if (o.anim) { if (aberta) this.tocarAnim(id, false); else this.anims.set(id, { fixo: 0 }); }
  }

  private objeto(id: string) { return this.fase.objetos.find((o) => o.id === id); }

  /** Caixa do objeto no jogo (com o deslocamento feito pelo código). */
  caixa(o: ObjetoFase) {
    const b = caixaObjeto(o);
    const d = this.deslocamentos.get(o.id);
    return d ? { ...b, x: b.x + d.dx, y: b.y + d.dy } : b;
  }

  /** O código moveu ou mudou algo que afeta as portas. */
  marcarMudanca() { this.mudou = true; }

  deslocar(id: string, dx: number, dy: number) {
    const d = this.deslocamentos.get(id) ?? { dx: 0, dy: 0 };
    d.dx += dx; d.dy += dy;
    this.deslocamentos.set(id, d);
    this.mudou = true;
  }

  /** Empurrável que o jogador está empurrando agora (o ponto dele não mostra "Empurrar"). */
  empurrando: string | null = null;

  /** Portas fechadas viram paredes sólidas (a caixa da imagem); colisões presas a objetos (empurráveis) andam com eles. */
  segmentosPortas(): Segmento[] {
    if (!this.mudou) return this.segsPortas;
    this.mudou = false;
    this.segsPortas = [];
    const presas = this.fase.colisoes.filter((c) => c.objeto);
    if (presas.length) {
      const visiveis = presas.filter((c) => this.estados.get(c.objeto!)?.visivel !== false);
      const movidas = visiveis.map((c) => { const d = this.deslocamentos.get(c.objeto!); return d ? { ...c, pontos: c.pontos.map(([x, y]) => [x + d.dx, y + d.dy] as [number, number]) } : c; });
      this.segsPortas.push(...montarSegmentos(movidas));
    }
    for (const o of this.fase.objetos) {
      const c = comportamentoDe(o);
      const e = this.estados.get(o.id);
      if (c?.tipo !== 'porta' || !e || e.aberta || !e.visivel) continue;
      const b = this.caixa(o);
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
    // Porta animada continua aparecendo aberta (no último quadro); a comum some
    if (c?.tipo === 'porta' && !o.anim) return e.visivel && !e.aberta;
    return e.visivel;
  }

  /** Vida curada por kits pegos (o modo Teste aplica e zera). */
  curaPendente = 0;
  /** O jogador pode ser curado agora? (com a vida cheia, o kit fica no chão) */
  podeCurar: () => boolean = () => true;

  /** Pega os coletáveis que o jogador está tocando. Retorna os avisos. */
  coletar(jogador: Caixa): string[] {
    const avisos: string[] = [];
    for (const id of [...this.avisouSemEspaco]) { const o = this.objeto(id); if (!o || !toca(jogador, this.caixa(o))) this.avisouSemEspaco.delete(id); }
    for (const o of this.fase.objetos) {
      const c = comportamentoDe(o);
      const e = this.estados.get(o.id);
      if (c?.tipo !== 'coletavel' || !e || !e.visivel || !toca(jogador, this.caixa(o))) continue;
      if (c.cura && c.cura > 0 && !this.podeCurar()) continue;
      if (!(c.cura && c.cura > 0) && !this.cabe(c.item)) {
        if (!this.avisouSemEspaco.has(o.id)) { this.avisouSemEspaco.add(o.id); avisos.push(this.textoSemEspaco.replace('{item}', c.item)); }
        continue;
      }
      if (!this.podeColetar(o)) continue;
      if (!e.visivel) continue; // o código escondeu ao coletar
      e.visivel = false;
      if (c.cura && c.cura > 0) { this.curaPendente += c.cura * c.quantidade; avisos.push(`Usou: ${c.item} (+${c.cura * c.quantidade} de vida)`); continue; }
      this.inventario.set(c.item, (this.inventario.get(c.item) ?? 0) + c.quantidade);
      avisos.push(`Pegou: ${c.item}${c.quantidade > 1 ? ` ×${c.quantidade}` : ''}`);
    }
    return avisos;
  }

  /** Os pés do jogador estão na altura da base do objeto (no chão ao lado, não em cima dele)? */
  noChaoAoLado(jogador: Caixa, alvo: ObjetoFase): boolean {
    const b = this.caixa(alvo);
    return jogador.y + jogador.h > b.y + b.h * 0.6;
  }

  /** Objeto interagível (tecla E) mais próximo do jogador, com o texto do botão. */
  proximo(jogador: Caixa): { o: ObjetoFase; acao: string } | null {
    let melhor: { o: ObjetoFase; acao: string; d: number } | null = null;
    const cx = jogador.x + jogador.w / 2;
    for (const o of this.fase.objetos) {
      const c = comportamentoDe(o);
      const e = this.estados.get(o.id);
      const porCodigo = this.interagiveisPorCodigo.get(o.id);
      if ((!c || c.tipo === 'coletavel') && !porCodigo) continue;
      if (!e || !e.visivel) continue;
      const b = this.caixa(o);
      if (!toca(jogador, b, 14)) continue;
      if (c?.tipo === 'gatilho' || c?.tipo === 'usoItem' || c?.tipo === 'empurravel' || (c?.tipo === 'saida' && c.modo === 'tocar')) continue; // zonas: passam sozinhas
      if (c?.tipo === 'inspecionar' && (e.etapa ?? 0) >= c.etapas.length && !c.repetir) continue; // já inspecionado
      if (c?.tipo === 'pontoEmpurrar') {
        const alvo = this.objeto(c.alvo);
        if (!alvo || !this.estados.get(alvo.id)?.visivel || this.empurrando === alvo.id) continue;
        if (!this.noChaoAoLado(jogador, alvo)) continue; // em cima do objeto não empurra
      }
      if (!c || c.tipo === 'coletavel') {
        const d = Math.abs(b.x + b.w / 2 - cx);
        if (!melhor || d < melhor.d) melhor = { o, acao: porCodigo!, d };
        continue;
      }
      if (c.tipo === 'alavanca' && c.umaVez && e.usado) continue;
      if (c.tipo === 'porta' && e.aberta) continue;
      const acao = c.tipo === 'inspecionar' ? (c.rotulo || 'Inspecionar') : c.tipo === 'pontoEmpurrar' ? 'Empurrar' : c.tipo === 'porta' ? (c.requer && !this.inventario.get(c.requer) ? `Abrir (precisa de: ${c.requer})` : 'Abrir')
        : c.tipo === 'alavanca' ? 'Acionar'
        : c.tipo === 'saida' ? (c.requer && !e.usado && !this.inventario.get(c.requer) ? `Entrar (precisa de: ${c.requer})` : 'Entrar') : 'Ler';
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
        this.definirAberta(o.id, true);
        return { aviso: `${o.nome}: aberta` };
      }
      case 'alavanca': {
        e.usado = true;
        const alvo = c.alvo ? this.objeto(c.alvo) : undefined;
        const ea = alvo ? this.estados.get(alvo.id) : undefined;
        if (!alvo || !ea) return { aviso: 'Esta alavanca não está ligada a nada (escolha um alvo no editor).' };
        const ca = comportamentoDe(alvo);
        if (ca?.tipo === 'porta') { this.definirAberta(alvo.id, !ea.aberta); return { aviso: `${alvo.nome}: ${ea.aberta ? 'aberta' : 'fechada'}`, acionado: alvo.id }; }
        if (this.acionadosPorCodigo.has(alvo.id)) return { acionado: alvo.id }; // o código do alvo (aoAcionado) decide
        ea.visivel = !ea.visivel; this.mudou = true;
        return { aviso: `${alvo.nome}: ${ea.visivel ? 'apareceu' : 'sumiu'}`, acionado: alvo.id };
      }
      case 'saida': {
        if (c.requer && !e.usado) {
          const tem = this.inventario.get(c.requer) ?? 0;
          if (!tem) return { aviso: `Trancada. Precisa de: ${c.requer}` };
          if (c.consome) { if (tem > 1) this.inventario.set(c.requer, tem - 1); else this.inventario.delete(c.requer); }
          e.usado = true; // destrancada de vez
        }
        return { passagem: o.id, ...(c.destino ? { irPara: c.destino } : {}) };
      }
      case 'mensagem':
        return { mensagem: c.texto || '(mensagem vazia)' };
      case 'inspecionar': {
        if (!c.etapas.length) return { aviso: 'Este ponto de inspeção ainda não tem etapas (Propriedades).' };
        const i = e.etapa ?? 0;
        const etapa = c.etapas[Math.min(i, c.etapas.length - 1)];
        if (i >= c.etapas.length && (etapa.tipo === 'item' || etapa.tipo === 'arquivo')) return { aviso: 'Não há mais nada aqui.' };
        // Item sem espaço: a etapa espera (o jogador volta depois)
        if (etapa.tipo === 'item' && etapa.item && !this.cabe(etapa.item)) return { aviso: this.textoSemEspaco.replace('{item}', etapa.item) };
        if (etapa.tipo === 'item' || etapa.tipo === 'arquivo') {
          if (etapa.item) this.inventario.set(etapa.item, (this.inventario.get(etapa.item) ?? 0) + (etapa.tipo === 'item' ? etapa.quantidade : 1));
        }
        e.etapa = Math.min(i + 1, c.etapas.length);
        return { inspecao: etapa };
      }
      case 'pontoEmpurrar':
        return c.alvo ? { empurrar: c.alvo } : { aviso: 'Este ponto de empurrar não está ligado a nenhum objeto.' };
      default:
        return {};
    }
  }

  /** Áreas de uso de item em que o jogador está agora (visíveis e ainda ativas). */
  areasDeUso(jogador: Caixa): ObjetoFase[] {
    return this.fase.objetos.filter((o) => {
      const c = comportamentoDe(o);
      const e = this.estados.get(o.id);
      return c?.tipo === 'usoItem' && !!e && e.visivel && !(c.umaVez && e.usado) && toca(jogador, this.caixa(o));
    });
  }

  /**
   * Usar um item (Usar no menu) onde o jogador está. Numa Área de uso que aceita o item: faz a ação. Em outra área:
   * o texto "errado" dela. Fora: msgFora. Não tira o item do inventário: quem chama tira se "usou" e consome.
   */
  usarItem(item: string, jogador: Caixa, msgFora: string): ResultadoInteracao & { consome?: boolean } {
    const areas = this.areasDeUso(jogador);
    const certa = areas.find((o) => (comportamentoDe(o) as CompUsoItem).item.toLowerCase() === item.toLowerCase());
    if (!certa) {
      const outra = areas[0] ? comportamentoDe(areas[0]) as CompUsoItem : null;
      return { aviso: outra ? (outra.textoErrado || 'Isso não funciona aqui.') : msgFora };
    }
    const c = comportamentoDe(certa) as CompUsoItem;
    this.estados.get(certa.id)!.usado = true;
    const r: ResultadoInteracao & { consome?: boolean } = { usou: true, area: certa.id, consome: c.consome };
    if (c.texto) r.mensagem = c.texto;
    const alvo = c.alvo ? this.objeto(c.alvo) : undefined;
    const ea = alvo ? this.estados.get(alvo.id) : undefined;
    if (['abrir', 'acionar', 'mostrar', 'esconder'].includes(c.acao) && (!alvo || !ea)) { r.aviso = `Usou ${item}, mas a área não tem alvo (escolha no editor).`; return r; }
    switch (c.acao) {
      case 'abrir': this.definirAberta(alvo!.id, true); r.acionado = alvo!.id; if (!r.mensagem) r.aviso = `${alvo!.nome}: aberta`; break;
      case 'acionar':
        r.acionado = alvo!.id;
        if (comportamentoDe(alvo!)?.tipo === 'porta') this.definirAberta(alvo!.id, !ea!.aberta);
        else if (!this.acionadosPorCodigo.has(alvo!.id)) { ea!.visivel = !ea!.visivel; this.mudou = true; }
        break;
      case 'mostrar': ea!.visivel = true; this.mudou = true; break;
      case 'esconder': ea!.visivel = false; this.mudou = true; break;
      default: break;
    }
    if (!r.mensagem && !r.aviso) r.aviso = `Usou: ${item}`;
    return r;
  }

  /** Zonas que o jogador acabou de entrar ou sair (gatilhos e passagens contínuas). */
  areas(jogador: Caixa): { entrou: ObjetoFase[]; saiu: ObjetoFase[] } {
    const entrou: ObjetoFase[] = [], saiu: ObjetoFase[] = [];
    for (const o of this.fase.objetos) {
      const c = comportamentoDe(o);
      if (c?.tipo !== 'gatilho' && !(c?.tipo === 'saida' && c.modo === 'tocar')) continue;
      const e = this.estados.get(o.id);
      const agora = !!e && e.visivel && toca(jogador, this.caixa(o));
      if (agora && !this.dentro.has(o.id)) { this.dentro.add(o.id); entrou.push(o); }
      if (!agora && this.dentro.has(o.id)) { this.dentro.delete(o.id); saiu.push(o); this.desarmadas.delete(o.id); }
    }
    return { entrou, saiu };
  }

  /** O jogador entrou num gatilho: faz a ação dele. */
  dispararGatilho(o: ObjetoFase): ResultadoInteracao {
    const c = comportamentoDe(o);
    const e = this.estados.get(o.id);
    if (c?.tipo !== 'gatilho' || !e) return {};
    if (c.umaVez && e.usado) return {};
    e.usado = true;
    switch (c.acao) {
      case 'mensagem': return c.texto ? { mensagem: c.texto } : {};
      case 'inimigos': return { surgir: o.id };
      case 'acionar': {
        const alvo = c.alvo ? this.objeto(c.alvo) : undefined;
        const ea = alvo ? this.estados.get(alvo.id) : undefined;
        if (!alvo || !ea) return { aviso: 'Este gatilho não tem alvo (escolha no editor).' };
        if (comportamentoDe(alvo)?.tipo === 'porta') { this.definirAberta(alvo.id, !ea.aberta); return { acionado: alvo.id }; }
        if (this.acionadosPorCodigo.has(alvo.id)) return { acionado: alvo.id };
        ea.visivel = !ea.visivel; this.mudou = true;
        return { acionado: alvo.id };
      }
      case 'luzes': {
        const ids = c.luz ? [c.luz] : [...this.luzes.keys()];
        for (const id of ids) this.luzes.set(id, c.luzAcao === 'ligar' ? true : c.luzAcao === 'desligar' ? false : !this.luzes.get(id));
        return { luz: true };
      }
      case 'escurecer': this.escura = true; return { luz: true };
      case 'clarear': this.escura = false; return { luz: true };
      case 'checkpoint': return { checkpoint: true };
      default: return {};
    }
  }
}
