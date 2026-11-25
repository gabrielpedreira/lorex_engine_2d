// HUD do jogo: elementos presos a um canto/borda da tela do jogador (texto, barra, caixas, ícones um a um ou imagem
// que muda com o valor). Ficam em jogo/projeto.json → "hud" e são editados na ferramenta HUD (U), que tem
// predefinições (vida em caixas, rosto, munição bala a bala, arma em uso…). O valor vem de uma "chave":
//   vida           vida do jogador / vida cheia
//   municao        balas no pente / tamanho do pente (arma do jogador)
//   arma           nome da arma do jogador
//   inimigos       inimigos vivos na fase
//   item:<nome>    quantidade de um item no inventário (ex.: item:chave)
//   qualquer outra o código define: jogo.hud.definir("pontos", 10)

export type AncoraHud = 'se' | 's' | 'sd' | 'e' | 'c' | 'd' | 'ie' | 'i' | 'id';

export const ANCORAS: { id: AncoraHud; nome: string }[] = [
  { id: 'se', nome: 'Topo, esquerda' }, { id: 's', nome: 'Topo, centro' }, { id: 'sd', nome: 'Topo, direita' },
  { id: 'e', nome: 'Meio, esquerda' }, { id: 'c', nome: 'Centro' }, { id: 'd', nome: 'Meio, direita' },
  { id: 'ie', nome: 'Base, esquerda' }, { id: 'i', nome: 'Base, centro' }, { id: 'id', nome: 'Base, direita' },
];

export interface ElementoHud {
  id: string;
  rotulo: string;
  chave: string;
  ancora: AncoraHud;
  /** Distância (px do jogo) da borda/canto escolhido. */
  x: number;
  y: number;
  /** Texto: tamanho da letra. Barra/caixas: altura. Ícones/imagem: altura de cada imagem (px do jogo). */
  tamanho: number;
  /** Cor do texto, da barra cheia ou das caixas cheias (as faixas podem trocar). */
  cor: string;
  mostrarRotulo: boolean;
  /** Imagem pequena ao lado (caminho relativo a jogo/), opcional. */
  icone?: string;
  visivel: boolean;
  /** Como o valor aparece (ver ESTILOS_HUD). */
  estilo: EstiloHud;
  /** Barra: comprimento. Caixas: largura de cada caixa (px do jogo). */
  largura: number;
  /** Ícones: a imagem de cada unidade (bala, coração). Caixas: imagem da caixa cheia. Imagem: a imagem normal. '' = desenho padrão. */
  imagem: string;
  /** Ícones/caixas: imagem da unidade vazia ('' = ícones: não aparece; caixas: caixa escura). */
  imagemVazia: string;
  /** Ícones/caixas: quantas no máximo (0 = o máximo do valor, ex.: pente 14 → 14 balas). */
  maximo: number;
  direcao: 'horizontal' | 'vertical';
  /** Espaço entre ícones/caixas (px do jogo). */
  espaco: number;
  /** Valor atual ≤ "ate" troca a cor (texto, barra, caixas) ou a imagem (imagem). A primeira faixa que servir vale. */
  faixas: FaixaHud[];
  /** Usa as imagens da arma equipada (ferramenta Armas): imagem = arma carregada/descarregada; ícones = a bala. */
  daArma: boolean;
}

export interface FaixaHud { ate: number; cor: string; imagem: string }

export interface ConfigHud { elementos: ElementoHud[]; morte: TelaMorte }

/** Tela de morte (game over) do ▶ Testar/jogo: animação (spritesheet numa linha) ou só o texto. */
export interface TelaMorte {
  /** Spritesheet (caminho relativo a jogo/), quadros lado a lado. '' = só o texto. */
  imagem: string;
  quadros: number;
  fps: number;
  /** Altura da animação na tela do jogo (px do jogo). */
  tamanho: number;
  /** Texto (sem imagem) ou legenda embaixo da animação. */
  texto: string;
  /** Escurecer o fundo (0 a 1). */
  escurecer: number;
}

export function mortePadrao(): TelaMorte { return { imagem: '', quadros: 1, fps: 12, tamanho: 128, texto: 'VOCÊ MORREU', escurecer: 0.6 }; }

export function normalizarMorte(d: unknown): TelaMorte {
  const b = mortePadrao();
  const m = (d && typeof d === 'object' ? d : {}) as Partial<TelaMorte>;
  const n = (x: unknown, p: number) => (Number.isFinite(Number(x)) ? Number(x) : p);
  return {
    imagem: typeof m.imagem === 'string' ? m.imagem : b.imagem,
    quadros: Math.max(1, Math.round(n(m.quadros, b.quadros))), fps: Math.max(1, n(m.fps, b.fps)),
    tamanho: Math.max(8, n(m.tamanho, b.tamanho)), texto: typeof m.texto === 'string' ? m.texto : b.texto,
    escurecer: Math.max(0, Math.min(1, n(m.escurecer, b.escurecer))),
  };
}

export type EstiloHud = 'texto' | 'barra' | 'icones' | 'caixas' | 'imagem';
export const ESTILOS_HUD: { id: EstiloHud; nome: string; texto: string }[] = [
  { id: 'texto', nome: 'Texto', texto: 'Mostra o valor escrito (ex.: 8/10).' },
  { id: 'barra', nome: 'Barra', texto: 'Barra que esvazia: para valores "atual/máximo" (vida, munição, magia).' },
  { id: 'caixas', nome: 'Caixas', texto: 'Uma caixa por ponto (vida em blocos): as cheias coloridas, as vazias escuras. Cor por faixa (ex.: amarela com 8 ou menos, vermelha com 4 ou menos).' },
  { id: 'icones', nome: 'Ícones um a um', texto: 'Uma imagem por unidade (bala a bala, corações, vidas restantes). Sem imagem, desenha um ícone padrão.' },
  { id: 'imagem', nome: 'Imagem que muda', texto: 'Uma imagem que troca conforme o valor (rosto que se machuca com a vida, arma descarregada com o pente vazio).' },
];

/** Valor "atual/máximo" (ou só "atual") separado em números. */
export function partesHud(valor: string): { atual: number; max: number | null } | null {
  const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*(?:\/\s*(\d+(?:[.,]\d+)?))?/.exec(valor);
  if (!m) return null;
  return { atual: Number(m[1].replace(',', '.')), max: m[2] !== undefined ? Number(m[2].replace(',', '.')) : null };
}

/** Fração (0..1) de um valor "atual/máximo" (ou de um número entre 0 e 1). null = não dá para virar barra. */
export function fracaoHud(valor: string): number | null {
  const p = partesHud(valor);
  if (!p) return null;
  if (p.max !== null) return p.max > 0 ? Math.max(0, Math.min(1, p.atual / p.max)) : 0;
  return p.atual >= 0 && p.atual <= 1 ? p.atual : null;
}

/** Faixa que vale para o valor (a de menor "ate" que ainda cobre o valor). */
export function faixaHud(e: ElementoHud, valor: string): FaixaHud | null {
  const p = partesHud(valor);
  if (!p) return null;
  return [...e.faixas].sort((a, b) => a.ate - b.ate).find((f) => p.atual <= f.ate) ?? null;
}

export const CHAVES_HUD: { chave: string; nome: string; texto: string; exemplo: string }[] = [
  { chave: 'vida', nome: 'Vida', texto: 'Vida do jogador / vida cheia (seção Vida em Personagens).', exemplo: '9/12' },
  { chave: 'municao', nome: 'Munição', texto: 'Balas no pente / tamanho do pente (arma do jogador, editor de Personagens).', exemplo: '9/14' },
  { chave: 'arma', nome: 'Arma em uso', texto: 'Nome da arma do jogador (por enquanto uma só). Com "Imagem que muda" e a chave municao, mostra a arma e troca para descarregada com o pente vazio.', exemplo: 'Pistola' },
  { chave: 'vidas', nome: 'Vidas restantes', texto: 'Definido pelo código: jogo.hud.definir("vidas", "3/3").', exemplo: '3/3' },
  { chave: 'magia', nome: 'Magia / energia', texto: 'Definido pelo código: jogo.hud.definir("magia", "5/10").', exemplo: '6/10' },
  { chave: 'inimigos', nome: 'Inimigos vivos', texto: 'Quantos inimigos ainda estão vivos na fase.', exemplo: '3' },
];

/** Elemento com tudo no padrão (as predefinições mudam só o que precisam). */
export function elementoBase(id: string, parcial: Partial<ElementoHud> = {}): ElementoHud {
  return {
    id, rotulo: '', chave: id, ancora: 'se', x: 8, y: 8, tamanho: 10, cor: '#ffffff', mostrarRotulo: true, visivel: true,
    estilo: 'texto', largura: 60, imagem: '', imagemVazia: '', maximo: 0, direcao: 'horizontal', espaco: 2, faixas: [], daArma: false,
    ...parcial,
  };
}

/** Predefinições da ferramenta HUD: o usuário escolhe e só posiciona/troca as imagens. */
export const PREDEFINICOES_HUD: { id: string; nome: string; texto: string; criar: () => Partial<ElementoHud> }[] = [
  { id: 'vida_caixas', nome: 'Vida em caixas', texto: 'Uma caixa por ponto de vida; amarelas com pouca vida e vermelhas quase no fim.', criar: () => ({ rotulo: 'Vida', chave: 'vida', estilo: 'caixas', mostrarRotulo: false, tamanho: 9, largura: 7, espaco: 2, cor: '#4cc94c', faixas: [{ ate: 8, cor: '#e8c234', imagem: '' }, { ate: 4, cor: '#e04848', imagem: '' }] }) },
  { id: 'vida_barra', nome: 'Vida em barra', texto: 'Barra que esvazia com o dano.', criar: () => ({ rotulo: 'Vida', chave: 'vida', estilo: 'barra', mostrarRotulo: false, tamanho: 8, largura: 70, cor: '#ef6461' }) },
  { id: 'rosto', nome: 'Rosto que muda com a vida', texto: 'Retrato do personagem: uma imagem para cada faixa de vida (bem, machucado, quase morto).', criar: () => ({ rotulo: 'Rosto', chave: 'vida', estilo: 'imagem', mostrarRotulo: false, tamanho: 40, faixas: [{ ate: 8, cor: '', imagem: '' }, { ate: 4, cor: '', imagem: '' }] }) },
  { id: 'balas', nome: 'Munição bala a bala', texto: 'Uma imagem por bala do pente (a bala da arma equipada, da ferramenta Armas).', criar: () => ({ rotulo: 'Munição', chave: 'municao', estilo: 'icones', mostrarRotulo: false, tamanho: 14, espaco: 1, ancora: 'ie', daArma: true }) },
  { id: 'arma', nome: 'Arma em uso', texto: 'Desenho da arma equipada (ferramenta Armas); troca para a imagem "descarregada" com o pente vazio.', criar: () => ({ rotulo: 'Arma', chave: 'municao', estilo: 'imagem', mostrarRotulo: false, tamanho: 22, ancora: 'ie', y: 24, daArma: true }) },
  { id: 'municao_texto', nome: 'Munição em texto', texto: 'Balas no pente / pente (ex.: 7/14).', criar: () => ({ rotulo: 'Munição', chave: 'municao', ancora: 'ie', cor: '#a7dd3e' }) },
  { id: 'vidas', nome: 'Vidas restantes', texto: 'Um ícone por vida (o código define: jogo.hud.definir("vidas", "3/3")).', criar: () => ({ rotulo: 'Vidas', chave: 'vidas', estilo: 'icones', mostrarRotulo: false, tamanho: 10, espaco: 2, ancora: 'sd' }) },
  { id: 'magia', nome: 'Magia / energia', texto: 'Barra azul (o código define: jogo.hud.definir("magia", "5/10")).', criar: () => ({ rotulo: 'Magia', chave: 'magia', estilo: 'barra', mostrarRotulo: false, tamanho: 6, largura: 60, cor: '#4a8cf0', y: 20 }) },
  { id: 'item', nome: 'Contador de item', texto: 'Quantidade de um item do inventário (ex.: item:chave).', criar: () => ({ rotulo: 'Chaves', chave: 'item:chave', ancora: 'sd' }) },
  { id: 'texto', nome: 'Texto livre (código)', texto: 'Um valor que o código define: jogo.hud.definir("pontos", 10).', criar: () => ({ rotulo: 'Pontos', chave: 'pontos' }) },
];

export function hudPadrao(): ConfigHud {
  return { elementos: [
    elementoBase('vida', { ...PREDEFINICOES_HUD[0].criar() }),
    elementoBase('municao', { ...PREDEFINICOES_HUD[5].criar(), x: 8, y: 8 }),
  ], morte: mortePadrao() };
}

export function normalizarHud(d: unknown): ConfigHud {
  const h = (d ?? {}) as Partial<ConfigHud>;
  if (!Array.isArray(h.elementos)) return { ...hudPadrao(), morte: normalizarMorte(h.morte) };
  const estilos = new Set(ESTILOS_HUD.map((x) => x.id));
  return {
    elementos: h.elementos.filter((e) => e && typeof e.id === 'string').map((e) => elementoBase(e.id, {
      rotulo: String(e.rotulo ?? ''), chave: String(e.chave ?? e.id),
      ancora: ANCORAS.some((a) => a.id === e.ancora) ? e.ancora : 'se',
      x: Number(e.x) || 0, y: Number(e.y) || 0, tamanho: Math.max(2, Number(e.tamanho) || 10),
      cor: typeof e.cor === 'string' ? e.cor : '#ffffff', mostrarRotulo: e.mostrarRotulo !== false,
      ...(e.icone ? { icone: String(e.icone) } : {}), visivel: e.visivel !== false,
      estilo: estilos.has(e.estilo) ? e.estilo : 'texto', largura: Math.max(2, Number(e.largura) || 60),
      imagem: typeof e.imagem === 'string' ? e.imagem : '', imagemVazia: typeof e.imagemVazia === 'string' ? e.imagemVazia : '',
      maximo: Math.max(0, Math.round(Number(e.maximo) || 0)), direcao: e.direcao === 'vertical' ? 'vertical' : 'horizontal',
      espaco: Number.isFinite(Number(e.espaco)) ? Number(e.espaco) : 2,
      daArma: e.daArma === true,
      faixas: Array.isArray(e.faixas) ? e.faixas.filter((f) => f && Number.isFinite(Number(f.ate))).map((f) => ({ ate: Number(f.ate), cor: typeof f.cor === 'string' ? f.cor : '', imagem: typeof f.imagem === 'string' ? f.imagem : '' })) : [],
    })),
    morte: normalizarMorte(h.morte),
  };
}

/** Posição (px do jogo) do canto superior esquerdo de um elemento w×h, numa tela rw×rh. */
export function posicaoHud(e: ElementoHud, w: number, h: number, rw: number, rh: number) {
  const horiz = e.ancora === 'se' || e.ancora === 'e' || e.ancora === 'ie' ? 'esq' : e.ancora === 'sd' || e.ancora === 'd' || e.ancora === 'id' ? 'dir' : 'meio';
  const vert = e.ancora.startsWith('s') ? 'topo' : e.ancora.startsWith('i') ? 'base' : 'meio';
  const x = horiz === 'esq' ? e.x : horiz === 'dir' ? rw - w - e.x : (rw - w) / 2 + e.x;
  const y = vert === 'topo' ? e.y : vert === 'base' ? rh - h - e.y : (rh - h) / 2 + e.y;
  return { x, y };
}

/** Converte uma posição arrastada (canto superior esquerdo) de volta para x/y relativos à âncora. */
export function deslocamentoHud(e: ElementoHud, px: number, py: number, w: number, h: number, rw: number, rh: number) {
  const horiz = e.ancora === 'se' || e.ancora === 'e' || e.ancora === 'ie' ? 'esq' : e.ancora === 'sd' || e.ancora === 'd' || e.ancora === 'id' ? 'dir' : 'meio';
  const vert = e.ancora.startsWith('s') ? 'topo' : e.ancora.startsWith('i') ? 'base' : 'meio';
  return {
    x: Math.round(horiz === 'esq' ? px : horiz === 'dir' ? rw - w - px : px - (rw - w) / 2),
    y: Math.round(vert === 'topo' ? py : vert === 'base' ? rh - h - py : py - (rh - h) / 2),
  };
}
