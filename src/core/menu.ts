// Menu do jogo (inventário) e catálogo de itens. Puro (sem DOM e sem PixiJS).
//
// O MENU é uma tela montada com painéis (ferramenta Menu): molduras/imagens, o retrato da condição, a barra de vida,
// a arma em uso, a grade de espaços dos itens, a lista de arquivos, a leitura de um arquivo e os botões (sair,
// arquivos, voltar ao menu, mapa). Duas telas: "inventario" e "arquivos". Ao escolher um item abre o submenu
// (Usar / Combinar / Checar).
//
// O CATÁLOGO DE ITENS diz o que cada item é: quantos espaços ocupa (1 ou 2, lado a lado), imagens, legenda do
// Checar, o que acontece ao Usar (curar, equipar arma, usar numa Área de uso) e as combinações (A + B → C).
// O inventário em si continua sendo "nome do item → quantidade" (jogo.inventario no código).

// ---------- Itens ----------

export type UsoItem = 'area' | 'curar' | 'arma' | 'nada';
export const USOS_ITEM: { id: UsoItem; nome: string; texto: string }[] = [
  { id: 'area', nome: 'Numa Área de uso', texto: 'Só funciona em cima de uma Área de uso de item que aceite este item (chave na porta, pendrive no computador, alicate na corrente). Fora dela: "Você não deve usar este item aqui."' },
  { id: 'curar', nome: 'Curar', texto: 'Recupera vida ao usar (remédio, kit). Some ao usar.' },
  { id: 'arma', nome: 'Equipar arma', texto: 'Equipa a arma (arquivo da ferramenta Armas).' },
  { id: 'nada', nome: 'Nada (só checar/combinar)', texto: 'Não tem uso direto: serve para checar ou combinar.' },
];

export interface ConfigItem {
  /** Nome do item: o mesmo do Coletável e de jogo.inventario (ex.: "chave vermelha"). */
  nome: string;
  /** "item" ocupa espaço no menu; "arquivo" (nota, foto, documento) vai para a lista de Arquivos. */
  tipo: 'item' | 'arquivo';
  /** 1 ou 2 espaços (2 = lado a lado). */
  espacos: number;
  /** Ícone no espaço do menu (relativo a jogo/). */
  imagem: string;
  /** Foto grande do Checar/leitura do arquivo ('' = a mesma do ícone). */
  imagemGrande: string;
  /** Legenda do Checar (ou o texto do arquivo). */
  descricao: string;
  uso: UsoItem;
  /** Curar: quanto de vida. */
  cura: number;
  /** Arma: arquivo em jogo/armas/. */
  arma: string;
  /** Some do inventário ao ser usado com sucesso. */
  consome: boolean;
}

export interface ReceitaItem {
  /** Os dois itens (a ordem não importa). */
  a: string;
  b: string;
  /** O item que surge. */
  resultado: string;
  quantidade: number;
}

export interface MensagensItens {
  /** Usar fora de uma Área de uso que aceite o item. */
  aquiNao: string;
  /** Pegar um item sem espaço livre. */
  semEspaco: string;
  /** Combinar dois itens sem receita. */
  naoCombina: string;
}

export interface ConfigItens {
  itens: ConfigItem[];
  receitas: ReceitaItem[];
  mensagens: MensagensItens;
}

export function itemBase(nome: string, d: Partial<ConfigItem> = {}): ConfigItem {
  return { nome, tipo: 'item', espacos: 1, imagem: '', imagemGrande: '', descricao: '', uso: 'area', cura: 0, arma: '', consome: true, ...d };
}

export function itensPadrao(): ConfigItens {
  return {
    itens: [],
    receitas: [],
    mensagens: { aquiNao: 'Você não deve usar este item aqui.', semEspaco: 'Sem espaço para {item}.', naoCombina: 'Esses itens não combinam.' },
  };
}

export function normalizarItens(d: unknown): ConfigItens {
  const b = itensPadrao();
  const x = (d && typeof d === 'object' ? d : {}) as Partial<ConfigItens>;
  const usos = new Set(USOS_ITEM.map((u) => u.id));
  const s = (v: unknown, p = '') => (typeof v === 'string' ? v : p);
  const itens: ConfigItem[] = [];
  for (const i of Array.isArray(x.itens) ? x.itens : []) {
    if (!i || typeof i.nome !== 'string' || !i.nome.trim() || itens.some((o) => o.nome === i.nome.trim())) continue;
    itens.push(itemBase(i.nome.trim(), {
      tipo: i.tipo === 'arquivo' ? 'arquivo' : 'item', espacos: Number(i.espacos) === 2 ? 2 : 1,
      imagem: s(i.imagem), imagemGrande: s(i.imagemGrande), descricao: s(i.descricao),
      uso: usos.has(i.uso as UsoItem) ? i.uso as UsoItem : 'area', cura: Math.max(0, Number(i.cura) || 0), arma: s(i.arma),
      consome: i.consome !== false,
    }));
  }
  const receitas = (Array.isArray(x.receitas) ? x.receitas : [])
    .filter((r) => r && typeof r.a === 'string' && typeof r.b === 'string' && typeof r.resultado === 'string' && r.a && r.b && r.resultado)
    .map((r) => ({ a: r.a, b: r.b, resultado: r.resultado, quantidade: Math.max(1, Math.round(Number(r.quantidade) || 1)) }));
  const m = (x.mensagens ?? {}) as Partial<MensagensItens>;
  return { itens, receitas, mensagens: { aquiNao: s(m.aquiNao, b.mensagens.aquiNao), semEspaco: s(m.semEspaco, b.mensagens.semEspaco), naoCombina: s(m.naoCombina, b.mensagens.naoCombina) } };
}

/** O item do catálogo (sem diferença de maiúsculas); sem cadastro = item comum de 1 espaço. */
export function itemDe(cfg: ConfigItens, nome: string): ConfigItem {
  const k = nome.trim().toLowerCase();
  return cfg.itens.find((i) => i.nome.toLowerCase() === k) ?? itemBase(nome);
}

/** A receita que junta a e b (em qualquer ordem). */
export function receitaDe(cfg: ConfigItens, a: string, b: string): ReceitaItem | undefined {
  const x = a.toLowerCase(), y = b.toLowerCase();
  return cfg.receitas.find((r) => (r.a.toLowerCase() === x && r.b.toLowerCase() === y) || (r.a.toLowerCase() === y && r.b.toLowerCase() === x));
}

/** Um item no menu: onde está e quantos tem. */
export interface ItemNoMenu { nome: string; quantidade: number; item: ConfigItem; slot: number; espacos: number }

/**
 * Arruma os itens (não arquivos) nos espaços, em ordem: item de 2 espaços ocupa dois vizinhos na mesma linha
 * (se só sobrar o último da linha, ele pula para a linha de baixo). Devolve os que couberam e os que sobraram.
 */
export function arrumarEspacos(inventario: Iterable<[string, number]>, cfg: ConfigItens, colunas: number, total: number): { itens: ItemNoMenu[]; sobra: string[]; livres: number } {
  const ocupado = new Array<boolean>(total).fill(false);
  const itens: ItemNoMenu[] = [];
  const sobra: string[] = [];
  for (const [nome, quantidade] of inventario) {
    if (quantidade <= 0) continue;
    const item = itemDe(cfg, nome);
    if (item.tipo === 'arquivo') continue;
    const esp = item.espacos === 2 ? 2 : 1;
    let slot = -1;
    for (let s = 0; s < total; s++) {
      if (ocupado[s]) continue;
      if (esp === 2 && ((s % colunas) === colunas - 1 || s + 1 >= total || ocupado[s + 1])) continue;
      slot = s; break;
    }
    if (slot < 0) { sobra.push(nome); continue; }
    for (let k = 0; k < esp; k++) ocupado[slot + k] = true;
    itens.push({ nome, quantidade, item, slot, espacos: esp });
  }
  return { itens, sobra, livres: ocupado.filter((x) => !x).length };
}

/** Cabe mais este item? (já tendo o item, a quantidade só aumenta: não ocupa outro espaço) */
export function cabeNoMenu(inventario: Map<string, number>, cfg: ConfigItens, nome: string, colunas: number, total: number): boolean {
  if (itemDe(cfg, nome).tipo === 'arquivo' || (inventario.get(nome) ?? 0) > 0) return true;
  const teste = new Map(inventario); teste.set(nome, 1);
  return !arrumarEspacos(teste, cfg, colunas, total).sobra.includes(nome);
}

// ---------- Tela do menu ----------

export type TipoPainel = 'imagem' | 'retrato' | 'vida' | 'arma' | 'itens' | 'info' | 'lista' | 'leitura' | 'botao';
export const TIPOS_PAINEL: { id: TipoPainel; nome: string; texto: string }[] = [
  { id: 'imagem', nome: 'Imagem / moldura', texto: 'Só desenho: moldura, fundo, enfeite.' },
  { id: 'retrato', nome: 'Retrato da condição', texto: 'Foto da personagem que muda com a vida (faixas de vida em %).' },
  { id: 'vida', nome: 'Barra de vida (condição)', texto: 'Barra e texto da condição (ex.: BEM / CUIDADO / PERIGO), com cor por faixa.' },
  { id: 'arma', nome: 'Arma em uso', texto: 'Imagem "menu" da arma equipada e a munição.' },
  { id: 'itens', nome: 'Espaços dos itens', texto: 'A grade de espaços (colunas × linhas). Clique num item para Usar / Combinar / Checar.' },
  { id: 'info', nome: 'Informação do item', texto: 'Nome e legenda do item escolhido.' },
  { id: 'lista', nome: 'Lista de arquivos', texto: 'Notas, fotos e documentos pegos no jogo. Clique para ler.' },
  { id: 'leitura', nome: 'Item escolhido / leitura', texto: 'Mostra o item escolhido com a legenda embaixo (tela de itens) ou o arquivo aberto (tela de arquivos).' },
  { id: 'botao', nome: 'Botão', texto: 'Área clicável: Sair, Arquivos, Menu (voltar aos itens) ou Mapa.' },
];

export type AcaoBotao = 'sair' | 'arquivos' | 'menu' | 'mapa';
export const ACOES_BOTAO: { id: AcaoBotao; nome: string }[] = [
  { id: 'sair', nome: 'Sair (fecha o menu)' }, { id: 'arquivos', nome: 'Abrir Arquivos' }, { id: 'menu', nome: 'Voltar aos itens' }, { id: 'mapa', nome: 'Mapa' },
];

/** Faixa de vida (em % da vida cheia): até este valor vale esta imagem/cor/texto. */
export interface FaixaVida { ate: number; imagem: string; cor: string; texto: string }

export interface PainelMenu {
  id: string;
  tipo: TipoPainel;
  /** Posição e tamanho em px da tela do jogo. */
  x: number; y: number; w: number; h: number;
  /** Imagem do painel (moldura); '' = desenho padrão. */
  imagem: string;
  /** Área útil dentro do painel (onde vai o conteúdo), em px relativos ao painel. [x, y, largura, altura]. */
  area: [number, number, number, number];
  /** Botão: o que faz. */
  acao: AcaoBotao;
  /** Retrato/vida: faixas de vida. */
  faixas: FaixaVida[];
  /** Itens: colunas e linhas da grade (colunas × linhas = espaços). */
  colunas: number;
  linhas: number;
  /** Cor do texto/realce. */
  cor: string;
  /** Botão: texto escrito por cima ('' = nenhum, quando a imagem já tem o desenho do botão). */
  texto: string;
  /** Zoom da imagem de dentro (retrato, arma): 1 = cabe inteira; maior = ocupa mais o quadro (corta as bordas vazias). */
  zoom: number;
}

export type TelaMenu = 'inventario' | 'arquivos';

export interface ConfigSubmenu {
  /** Imagem com os 3 botões ('' = desenho padrão). */
  imagem: string;
  w: number; h: number;
  /** Área de cada botão dentro da imagem: [x, y, largura, altura]. */
  usar: [number, number, number, number];
  combinar: [number, number, number, number];
  checar: [number, number, number, number];
}

export interface ConfigMenu {
  /** Tamanho da tela do menu (px). É sempre o mesmo: no jogo ela é ampliada para preencher a tela, seja qual for a sala. */
  tamanho: [number, number];
  /** Cor do fundo atrás dos painéis e quanto escurece o jogo (0 a 1). */
  fundo: string;
  escurecer: number;
  telas: Record<TelaMenu, PainelMenu[]>;
  submenu: ConfigSubmenu;
  /** Som ao abrir/fechar (opcional, relativo a jogo/). */
  som: string;
}

export function painelBase(id: string, tipo: TipoPainel, x: number, y: number, w: number, h: number, d: Partial<PainelMenu> = {}): PainelMenu {
  return { id, tipo, x, y, w, h, imagem: '', area: [4, 4, Math.max(1, w - 8), Math.max(1, h - 8)], acao: 'sair', faixas: [], colunas: 5, linhas: 2, cor: '#e8f0e0', texto: '', zoom: 1, ...d };
}

export function faixasVidaPadrao(): FaixaVida[] {
  return [
    { ate: 25, imagem: '', cor: '#d8402f', texto: 'PERIGO' },
    { ate: 50, imagem: '', cor: '#e8b53a', texto: 'CUIDADO' },
    { ate: 100, imagem: '', cor: '#58c04a', texto: 'BEM' },
  ];
}

/** Menu padrão no layout do Infestação (retrato, condição, arma, itens e a coluna Sair/Arquivos/Mapa). */
export function menuPadrao(): ConfigMenu {
  const comum = (): PainelMenu[] => [
    painelBase('retrato', 'retrato', 14, 11, 103, 90, { area: [6, 6, 91, 78], faixas: faixasVidaPadrao() }),
    painelBase('condicao', 'vida', 129, 11, 181, 90, { area: [6, 33, 168, 51], faixas: faixasVidaPadrao() }),
    painelBase('arma', 'arma', 321, 11, 104, 90, { area: [6, 33, 92, 51] }),
  ];
  return {
    tamanho: [640, 360], fundo: '#2a2d2b', escurecer: 0.85, som: '',
    telas: {
      inventario: [
        ...comum(),
        painelBase('item', 'leitura', 14, 113, 413, 237, { area: [10, 11, 392, 217] }),
        painelBase('coluna', 'imagem', 438, 10, 188, 340),
        painelBase('itens', 'itens', 448, 81, 167, 260, { area: [0, 0, 167, 260], colunas: 2, linhas: 5 }),
        painelBase('sair', 'botao', 438, 10, 188, 28, { acao: 'sair', texto: 'SAIR' }),
        painelBase('arquivos', 'botao', 438, 42, 99, 27, { acao: 'arquivos', texto: 'ARQUIVOS' }),
        painelBase('mapa', 'botao', 542, 42, 84, 27, { acao: 'mapa', texto: 'MAPA' }),
      ],
      arquivos: [
        ...comum(),
        painelBase('leitura', 'leitura', 14, 113, 413, 237, { area: [10, 11, 392, 217] }),
        painelBase('coluna', 'imagem', 438, 10, 188, 340),
        painelBase('lista', 'lista', 448, 81, 167, 260, { area: [0, 0, 167, 260] }),
        painelBase('sair', 'botao', 438, 10, 188, 28, { acao: 'sair', texto: 'SAIR' }),
        painelBase('menu', 'botao', 438, 42, 99, 27, { acao: 'menu', texto: 'MENU' }),
        painelBase('mapa', 'botao', 542, 42, 84, 27, { acao: 'mapa', texto: 'MAPA' }),
      ],
    },
    submenu: { imagem: '', w: 102, h: 83, usar: [2, 2, 99, 27], combinar: [2, 29, 99, 27], checar: [2, 55, 99, 27] },
  };
}

export function normalizarMenu(d: unknown): ConfigMenu {
  const b = menuPadrao();
  const m = (d && typeof d === 'object' ? d : {}) as Partial<ConfigMenu>;
  const tipos = new Set(TIPOS_PAINEL.map((t) => t.id));
  const acoes = new Set(ACOES_BOTAO.map((a) => a.id));
  const n = (v: unknown, p: number) => (Number.isFinite(Number(v)) ? Number(v) : p);
  const ret = (v: unknown, p: [number, number, number, number]): [number, number, number, number] =>
    Array.isArray(v) && v.length === 4 ? [n(v[0], p[0]), n(v[1], p[1]), Math.max(1, n(v[2], p[2])), Math.max(1, n(v[3], p[3]))] : p;
  const painel = (p: Partial<PainelMenu>): PainelMenu | null => {
    if (!p || typeof p.id !== 'string' || !tipos.has(p.tipo as TipoPainel)) return null;
    const w = Math.max(1, n(p.w, 40)), h = Math.max(1, n(p.h, 30));
    const base = painelBase(p.id, p.tipo as TipoPainel, n(p.x, 0), n(p.y, 0), w, h);
    return {
      ...base, imagem: typeof p.imagem === 'string' ? p.imagem : '', area: ret(p.area, base.area),
      acao: acoes.has(p.acao as AcaoBotao) ? p.acao as AcaoBotao : 'sair',
      faixas: Array.isArray(p.faixas) ? p.faixas.filter((f) => f && Number.isFinite(Number(f.ate))).map((f) => ({
        ate: Number(f.ate), imagem: typeof f.imagem === 'string' ? f.imagem : '', cor: typeof f.cor === 'string' ? f.cor : '', texto: typeof f.texto === 'string' ? f.texto : '',
      })).sort((x, y) => x.ate - y.ate) : [],
      colunas: Math.max(1, Math.min(12, Math.round(n(p.colunas, 5)))), linhas: Math.max(1, Math.min(8, Math.round(n(p.linhas, 2)))),
      cor: typeof p.cor === 'string' ? p.cor : base.cor,
      texto: typeof p.texto === 'string' ? p.texto : '',
      zoom: Math.max(0.2, Math.min(5, n(p.zoom, 1))),
    };
  };
  const tela = (v: unknown, p: PainelMenu[]) => (Array.isArray(v) ? v.map(painel).filter((x): x is PainelMenu => !!x) : p);
  const s = (m.submenu ?? {}) as Partial<ConfigSubmenu>;
  return {
    tamanho: Array.isArray(m.tamanho) && m.tamanho.length === 2 ? [Math.max(64, n(m.tamanho[0], 640)), Math.max(64, n(m.tamanho[1], 360))] : b.tamanho,
    fundo: typeof m.fundo === 'string' ? m.fundo : b.fundo,
    escurecer: Math.max(0, Math.min(1, n(m.escurecer, b.escurecer))),
    som: typeof m.som === 'string' ? m.som : '',
    telas: { inventario: tela(m.telas?.inventario, b.telas.inventario), arquivos: tela(m.telas?.arquivos, b.telas.arquivos) },
    submenu: {
      imagem: typeof s.imagem === 'string' ? s.imagem : '', w: Math.max(10, n(s.w, b.submenu.w)), h: Math.max(10, n(s.h, b.submenu.h)),
      usar: ret(s.usar, b.submenu.usar), combinar: ret(s.combinar, b.submenu.combinar), checar: ret(s.checar, b.submenu.checar),
    },
  };
}

/** Quantos espaços o menu tem (a grade do painel "itens" da tela inventário; sem grade = 10). */
export function espacosDoMenu(m: ConfigMenu): { colunas: number; total: number } {
  const p = m.telas.inventario.find((x) => x.tipo === 'itens');
  return p ? { colunas: p.colunas, total: p.colunas * p.linhas } : { colunas: 5, total: 10 };
}

/** A faixa de vida que vale agora (pct = 0–100). */
export function faixaDaVida(faixas: FaixaVida[], pct: number): FaixaVida | undefined {
  return [...faixas].sort((a, b) => a.ate - b.ate).find((f) => pct <= f.ate);
}
