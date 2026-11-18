// HUD do jogo: elementos de texto (rótulo + valor) presos a um canto/borda da tela do jogador. Ficam em
// jogo/projeto.json → "hud" e são editados na ferramenta HUD. O valor vem de uma "chave":
//   municao        balas no pente / tamanho do pente (arma do jogador)
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
  /** Tamanho da letra (px do jogo). */
  tamanho: number;
  cor: string;
  mostrarRotulo: boolean;
  /** Imagem pequena ao lado (caminho relativo a jogo/), opcional. */
  icone?: string;
  visivel: boolean;
}

export interface ConfigHud { elementos: ElementoHud[] }

export const CHAVES_HUD: { chave: string; nome: string; texto: string; exemplo: string }[] = [
  { chave: 'municao', nome: 'Munição', texto: 'Balas no pente / tamanho do pente (arma do jogador, editor de Personagens).', exemplo: '7/7' },
  { chave: 'inimigos', nome: 'Inimigos vivos', texto: 'Quantos inimigos ainda estão vivos na fase.', exemplo: '3' },
];

export function hudPadrao(): ConfigHud {
  return { elementos: [{ id: 'municao', rotulo: 'Munição', chave: 'municao', ancora: 'ie', x: 8, y: 8, tamanho: 10, cor: '#a7dd3e', mostrarRotulo: true, visivel: true }] };
}

export function normalizarHud(d: unknown): ConfigHud {
  const h = (d ?? {}) as Partial<ConfigHud>;
  if (!Array.isArray(h.elementos)) return hudPadrao();
  return {
    elementos: h.elementos.filter((e) => e && typeof e.id === 'string').map((e) => ({
      id: e.id, rotulo: String(e.rotulo ?? ''), chave: String(e.chave ?? e.id),
      ancora: ANCORAS.some((a) => a.id === e.ancora) ? e.ancora : 'se',
      x: Number(e.x) || 0, y: Number(e.y) || 0, tamanho: Math.max(4, Number(e.tamanho) || 10),
      cor: typeof e.cor === 'string' ? e.cor : '#ffffff', mostrarRotulo: e.mostrarRotulo !== false,
      ...(e.icone ? { icone: String(e.icone) } : {}), visivel: e.visivel !== false,
    })),
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
