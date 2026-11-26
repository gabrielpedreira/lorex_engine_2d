// Controles: qual tecla (ou combinação, ou sequência) dispara cada ação. Puro (sem DOM): o editor e o jogo
// alimentam as teclas com apertar()/soltar() e perguntam segurando()/apertou() a cada quadro.
//
// Teclas são guardadas pelo "code" do teclado (posição física: KeyA, Space, ArrowLeft…), assim funcionam
// igual em teclado ABNT2 ou americano. Shift/Ctrl/Alt da esquerda e da direita contam como a mesma tecla.

export type TipoAtalho = 'tecla' | 'combinacao' | 'sequencia';

export interface Atalho {
  /** tecla = uma tecla; combinacao = todas juntas (ex.: Shift+J); sequencia = uma depois da outra (ex.: ↓ › → › J). */
  tipo: TipoAtalho;
  teclas: string[];
}

export interface Controles {
  /** ação → atalhos (qualquer um deles dispara a ação). */
  acoes: Record<string, Atalho[]>;
  /** Tempo máximo entre as teclas de uma sequência (segundos). */
  janelaSequencia: number;
}

/** Ações fixas do jogo (as do personagem vêm das animações extras dele). */
export const ACOES_SISTEMA: { id: string; nome: string; texto: string; grupo: string }[] = [
  { id: 'esquerda', nome: 'Andar para a esquerda', texto: 'Enquanto segurada, o personagem anda para a esquerda.', grupo: 'Movimento' },
  { id: 'direita', nome: 'Andar para a direita', texto: 'Enquanto segurada, o personagem anda para a direita.', grupo: 'Movimento' },
  { id: 'pular', nome: 'Pular', texto: 'Segurar pula mais alto; soltar cedo faz um pulo curto.', grupo: 'Movimento' },
  { id: 'interagir', nome: 'Interagir', texto: 'Abrir porta, ler nota, puxar alavanca, entrar numa saída. Também fecha mensagens.', grupo: 'Interação' },
  { id: 'menu', nome: 'Menu (inventário)', texto: 'Abre e fecha o menu: itens, Usar / Combinar / Checar, Arquivos. Esc também fecha.', grupo: 'Interação' },
];

const t = (...teclas: string[]): Atalho => ({ tipo: 'tecla', teclas });

/** Base pré-definida (o usuário pode trocar tudo na ferramenta Controles). */
export function controlesPadrao(): Controles {
  return {
    janelaSequencia: 0.4,
    acoes: {
      esquerda: [t('ArrowLeft'), t('KeyA')],
      direita: [t('ArrowRight'), t('KeyD')],
      pular: [t('Space'), t('KeyW'), t('ArrowUp')],
      interagir: [t('KeyE')],
      tiro: [t('KeyJ'), t('KeyX')],
      recarga: [t('KeyR')],
      menu: [t('Tab')],
    },
  };
}

/** Teclas que a engine usa durante o teste e não podem virar atalho. */
export const TECLAS_RESERVADAS = new Set(['Escape', 'F4', 'F5', 'F6']);

/** Junta lados esquerdo/direito dos modificadores. */
export function normalizarCodigo(code: string): string {
  return code.replace(/^(Shift|Control|Alt|Meta)(Left|Right)$/, '$1');
}

const NOMES: Record<string, string> = {
  Space: 'Espaço', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Shift: 'Shift', Control: 'Ctrl',
  Alt: 'Alt', Meta: 'Win', Enter: 'Enter', Backspace: 'Backspace', Tab: 'Tab', CapsLock: 'Caps Lock',
  Semicolon: 'Ç', Quote: '~', BracketLeft: '´', BracketRight: '[', Backslash: ']', IntlBackslash: '\\', Slash: ';',
  IntlRo: '/', Comma: ',', Period: '.', Minus: '-', Equal: '=', Backquote: "'",
  NumpadEnter: 'Enter (num)', NumpadAdd: '+ (num)', NumpadSubtract: '- (num)', NumpadMultiply: '* (num)', NumpadDivide: '/ (num)',
};

/** Nome amigável de uma tecla (KeyA → A, Digit1 → 1, Space → Espaço). */
export function nomeTecla(code: string): string {
  if (NOMES[code]) return NOMES[code];
  let m = /^Key([A-Z])$/.exec(code); if (m) return m[1];
  m = /^Digit(\d)$/.exec(code); if (m) return m[1];
  m = /^Numpad(\d)$/.exec(code); if (m) return `${m[1]} (num)`;
  return code;
}

export function textoAtalho(a: Atalho): string {
  return a.teclas.map(nomeTecla).join(a.tipo === 'sequencia' ? ' › ' : a.tipo === 'combinacao' ? ' + ' : '');
}

export function mesmoAtalho(a: Atalho, b: Atalho) {
  return a.tipo === b.tipo && a.teclas.length === b.teclas.length && a.teclas.every((k, i) => k === b.teclas[i]);
}

export function normalizarControles(d: unknown): Controles {
  const base = controlesPadrao();
  const c = (d ?? {}) as Partial<Controles>;
  if (!c.acoes || typeof c.acoes !== 'object') return base;
  const acoes: Controles['acoes'] = {};
  for (const [acao, lista] of Object.entries(c.acoes)) {
    if (!Array.isArray(lista)) continue;
    acoes[acao] = lista
      .filter((a): a is Atalho => !!a && Array.isArray(a.teclas) && a.teclas.length > 0)
      .map((a) => ({
        tipo: (['tecla', 'combinacao', 'sequencia'] as const).includes(a.tipo) ? a.tipo : 'tecla',
        teclas: a.teclas.map((k) => normalizarCodigo(String(k))),
      }));
  }
  // Ações da engine que surgiram depois (ex.: menu) entram com a tecla padrão
  for (const a of ACOES_SISTEMA) if (!acoes[a.id] && base.acoes[a.id]) acoes[a.id] = base.acoes[a.id];
  return { acoes, janelaSequencia: Number(c.janelaSequencia) > 0 ? Number(c.janelaSequencia) : base.janelaSequencia };
}

/** Quanto mais teclas, mais específico: Shift+J tem prioridade sobre J sozinho. */
function especificidade(a: Atalho) { return a.teclas.length * (a.tipo === 'sequencia' ? 2 : 1); }

/**
 * Estado das teclas durante o jogo. Uso por quadro:
 *   entrada.apertar(code, t) / soltar(code)   (eventos do teclado)
 *   entrada.atualizar(t)                      (uma vez por quadro: calcula o que disparou)
 *   entrada.segurando('esquerda'), entrada.apertou('tiro')
 */
export class EntradaJogo {
  private seguradas = new Set<string>();
  /** Teclas apertadas desde o último atualizar() (bordas de subida). */
  private bordas: string[] = [];
  private historico: { code: string; t: number }[] = [];
  private disparadas = new Set<string>();
  /** Ações de sequência/combinação disparadas e ainda "seguradas" (a última tecla continua apertada). */
  private ativasPorTecla = new Map<string, Set<string>>();

  constructor(public controles: Controles) {}

  apertar(code: string, t: number) {
    const k = normalizarCodigo(code);
    if (this.seguradas.has(k)) return; // repetição automática do teclado
    this.seguradas.add(k);
    this.bordas.push(k);
    this.historico.push({ code: k, t });
    if (this.historico.length > 12) this.historico.shift();
  }

  soltar(code: string) {
    const k = normalizarCodigo(code);
    this.seguradas.delete(k);
    this.ativasPorTecla.delete(k);
  }

  limpar() { this.seguradas.clear(); this.bordas = []; this.historico = []; this.disparadas.clear(); this.ativasPorTecla.clear(); }

  /** Atalhos ordenados do mais específico para o menos (uma tecla não dispara duas coisas ao mesmo tempo). */
  private atalhosOrdenados() {
    const lista: { acao: string; a: Atalho }[] = [];
    for (const [acao, atalhos] of Object.entries(this.controles.acoes)) for (const a of atalhos) lista.push({ acao, a });
    return lista.sort((x, y) => especificidade(y.a) - especificidade(x.a));
  }

  /** Calcula as ações disparadas neste quadro. */
  atualizar(t: number) {
    this.disparadas.clear();
    const consumidas = new Set<string>();
    for (const borda of this.bordas) {
      for (const { acao, a } of this.atalhosOrdenados()) {
        if (consumidas.has(borda)) break;
        const ultima = a.teclas[a.teclas.length - 1];
        let ok = false;
        if (a.tipo === 'tecla') ok = a.teclas.includes(borda);
        else if (a.tipo === 'combinacao') ok = a.teclas.includes(borda) && a.teclas.every((k) => this.seguradas.has(k));
        else if (a.tipo === 'sequencia' && borda === ultima) ok = this.sequenciaBate(a.teclas, t);
        if (!ok) continue;
        this.disparadas.add(acao);
        if (a.tipo !== 'tecla') {
          const s = this.ativasPorTecla.get(borda) ?? new Set<string>();
          s.add(acao);
          this.ativasPorTecla.set(borda, s);
        }
        consumidas.add(borda);
      }
    }
    this.bordas = [];
  }

  private sequenciaBate(teclas: string[], t: number) {
    const h = this.historico;
    if (h.length < teclas.length) return false;
    const fim = h.slice(h.length - teclas.length);
    if (!fim.every((x, i) => x.code === teclas[i])) return false;
    const janela = this.controles.janelaSequencia;
    for (let i = 1; i < fim.length; i++) if (fim[i].t - fim[i - 1].t > janela) return false;
    return t - fim[fim.length - 1].t <= janela;
  }

  /** Ações disparadas neste quadro (para o log). */
  get disparadasAgora(): string[] { return [...this.disparadas]; }

  /** A ação foi disparada neste quadro? */
  apertou(acao: string) { return this.disparadas.has(acao); }

  /** A ação está sendo segurada? (tecla segurada; combinação com todas seguradas; sequência com a última segurada) */
  segurando(acao: string) {
    for (const a of this.controles.acoes[acao] ?? []) {
      if (a.tipo === 'tecla' && a.teclas.some((k) => this.seguradas.has(k))) {
        // Não conta se essa tecla está servindo a uma combinação/sequência de outra ação
        if (a.teclas.some((k) => this.seguradas.has(k) && !this.ativasPorTecla.get(k)?.size)) return true;
      }
      if (a.tipo === 'combinacao' && a.teclas.every((k) => this.seguradas.has(k))) return true;
    }
    for (const s of this.ativasPorTecla.values()) if (s.has(acao)) return true;
    return false;
  }
}
