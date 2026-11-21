// Ferramenta MAPA (M): diagrama das salas do jogo (fases e áreas) ligadas pelas passagens.
// ▭ vermelho = passagem (objeto com o comportamento Passagem) · ■ verde = sala · ◆ amarelo = o que acontece
// entre uma sala e outra (transição: corte, escurecer, tela cheia animada, som).
// Arraste de uma passagem até outra (ou até o meio de uma sala, para chegar no início dela) para conectar.
// Salva sozinho em jogo/projeto.json → "mapa". O jogador nunca vê este diagrama.
import { duracaoFolha, palpiteAnim, tamanhoQuadro } from '../core/folha';
import {
  EFEITOS_TRANSICAO, conectar, conexaoDaPassagem, resumoTransicao, type Conexao, type EfeitoTransicao, type Mapa, type PontaConexao, type Transicao,
} from '../core/mapa';
import { el, perguntar } from './dom';
import { MODOS_PASSAGEM, type ModoPassagem } from '../core/comportamentos';
import { dica } from './legenda';

export interface PassagemSala { id: string; nome: string; x: number; y: number; w: number; h: number; requer: string; modo: ModoPassagem; /** fora da fase (o jogador não alcança) */ fora: boolean }
export interface InfoSala {
  arquivo: string;
  nome: string;
  tipo: 'fase' | 'area';
  regiao: string;
  tamanho: [number, number];
  spawn: [number, number];
  passagens: PassagemSala[];
  /** A sala não abriu (JSON com erro). */
  erro?: string;
}

export interface AcoesMapa {
  aoMudar(m: Mapa, motivo: string): void;
  aoAbrirSala(arquivo: string): void;
  /** Cria uma sala (área nova, já salva) e devolve o arquivo e a lista atualizada. */
  criarSala(nome: string): Promise<{ arquivo: string; salas: InfoSala[] }>;
  /** Muda o nome mostrado da sala (o arquivo continua o mesmo). */
  renomearSala(arquivo: string, nome: string): Promise<InfoSala[]>;
  /** Cria uma passagem (zona invisível no jogo) na borda da sala. */
  criarPassagem(arquivo: string, lado: Lado, nome: string): Promise<{ id: string; salas: InfoSala[] }>;
  excluirPassagem(arquivo: string, id: string): Promise<InfoSala[]>;
  /** Como a passagem funciona: apertando Interagir (porta) ou ao atravessar (contínua). */
  modoPassagem(arquivo: string, id: string, modo: ModoPassagem): Promise<InfoSala[]>;
  /** Imagens do projeto (relativas à raiz). */
  imagens(): Promise<string[]>;
  /** Sons do projeto (relativos à raiz). */
  sons(): Promise<string[]>;
  /** Copia para jogo/assets/<categoria> e devolve o caminho relativo a jogo/. */
  garantir(caminhoRaiz: string, categoria: string): Promise<string>;
  /** URL de um arquivo relativo a jogo/. */
  url(caminhoJogo: string): string;
  previa(t: Transicao): void;
}

export type Lado = 'esquerda' | 'direita';

type Selecao = { tipo: 'sala'; arquivo: string } | { tipo: 'porta'; fase: string; id: string } | { tipo: 'con'; id: string } | null;

const SVG = 'http://www.w3.org/2000/svg';
const K = 0.1; // px do diagrama por px da fase
const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...filhos: (Node | string)[]) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  e.append(...filhos);
  return e;
};

/** Rótulo curto do losango (o completo aparece no painel). */
function rotuloCurto(t: Transicao) {
  return ({ corte: 'Corte', escurecer: 'Escurecer', tela: 'Tela cheia' } as const)[t.efeito] + (t.som ? ' ♪' : '');
}
function rotuloConexao(c: Conexao) {
  return c.transicaoVolta && !c.mesmoNosDoisSentidos && c.maoDupla ? `→ ${rotuloCurto(c.transicao)} · ← ${rotuloCurto(c.transicaoVolta)}` : rotuloCurto(c.transicao);
}

export class EditorMapa {
  private raiz: HTMLElement;
  private mapa: Mapa = { salas: {}, conexoes: [] };
  private salas: InfoSala[] = [];
  private sel: Selecao = null;
  private vista = { x: 0, y: 0, z: 1 };
  private area!: SVGSVGElement;
  private grupo!: SVGGElement;
  private painel!: HTMLElement;
  private faseAtual = '';
  private listaImagens: string[] | null = null;
  private listaSons: string[] | null = null;

  constructor(private acoes: AcoesMapa) {
    this.raiz = el('div', { class: 'tela-personagens tela-mapa', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Mapa', tabindex: -1 });
    this.raiz.hidden = true;
    document.body.append(this.raiz);
    this.raiz.addEventListener('keydown', (e) => {
      e.stopPropagation();
      const t = e.target as HTMLElement;
      const digitando = (t instanceof HTMLInputElement && !['checkbox', 'range', 'color'].includes(t.type)) || t instanceof HTMLTextAreaElement;
      if (e.key === 'Escape' && !digitando) { this.fechar(); return; }
      if (digitando || t instanceof HTMLSelectElement) return;
      else if (e.key === 'Delete' || e.key === 'Backspace') void this.excluirSelecionado();
      else if (e.key === 'Home') this.enquadrar();
    });
  }

  get aberta() { return !this.raiz.hidden; }

  abrir(mapa: Mapa, salas: InfoSala[], faseAtual: string) {
    this.mapa = structuredClone(mapa);
    this.salas = salas;
    this.faseAtual = faseAtual;
    this.listaImagens = null; this.listaSons = null;
    // Salas novas ganham um lugar livre no diagrama
    let i = Object.keys(this.mapa.salas).length;
    for (const s of salas) if (!this.mapa.salas[s.arquivo]) this.mapa.salas[s.arquivo] = this.lugarLivre(i++);
    if (this.sel?.tipo === 'sala' && !salas.some((s) => s.arquivo === (this.sel as { arquivo: string }).arquivo)) this.sel = null;
    this.raiz.hidden = false;
    this.montar();
    this.enquadrar();
    this.raiz.focus();
  }

  /** Atualiza as salas (ex.: uma fase mudou) sem fechar. */
  atualizarSalas(salas: InfoSala[]) {
    if (!this.aberta) return;
    this.salas = salas;
    let i = Object.keys(this.mapa.salas).length;
    for (const s of salas) if (!this.mapa.salas[s.arquivo]) this.mapa.salas[s.arquivo] = this.lugarLivre(i++);
    this.desenhar();
    this.renderPainel();
  }

  fechar() { this.raiz.hidden = true; }

  /** Grade em zigue-zague (as linhas não atravessam as salas do meio). */
  private lugarLivre(i: number) { return { x: 40 + (i % 3) * 380, y: 60 + Math.floor(i / 3) * 240 + (i % 3 === 1 ? 120 : 0) }; }

  private mudou(motivo: string) {
    this.acoes.aoMudar(structuredClone(this.mapa), motivo);
    this.desenhar();
    this.renderPainel();
    // O painel foi refeito: o foco não pode se perder (senão Esc/Del deixam de funcionar)
    if (!this.raiz.contains(document.activeElement)) this.raiz.focus();
  }

  private sala(arquivo: string) { return this.salas.find((s) => s.arquivo === arquivo); }
  private conexao(id: string) { return this.mapa.conexoes.find((c) => c.id === id); }

  // ---------- Geometria ----------
  private caixaSala(s: InfoSala) {
    const p = this.mapa.salas[s.arquivo] ?? { x: 0, y: 0 };
    return { x: p.x, y: p.y, w: Math.max(110, Math.round(s.tamanho[0] * K)), h: Math.max(46, Math.round(s.tamanho[1] * K)) };
  }

  /** Centro do marcador de uma ponta (passagem, ou a bandeira de início quando passagem = ''). */
  private pontoDe(p: PontaConexao): { x: number; y: number; lado: -1 | 1 } | null {
    const s = this.sala(p.fase);
    if (!s) return null;
    const b = this.caixaSala(s);
    const [fw, fh] = s.tamanho;
    const rel = (vx: number, vy: number) => {
      let rx = Math.max(0, Math.min(1, vx / fw)), ry = Math.max(0, Math.min(1, vy / fh));
      if (rx < 0.06) rx = 0; if (rx > 0.94) rx = 1; // perto da borda = na borda (como no desenho de planta)
      if (ry < 0.08) ry = 0;
      return { x: b.x + rx * b.w, y: b.y + ry * b.h, lado: (rx < 0.5 ? -1 : 1) as -1 | 1 };
    };
    if (!p.passagem) return rel(s.spawn[0], s.spawn[1] - 4);
    const g = s.passagens.find((x) => x.id === p.passagem);
    return g ? rel(g.x + g.w / 2, g.y + g.h / 2) : null;
  }

  private caminho(c: Conexao) {
    const a = this.pontoDe(c.a), b = this.pontoDe(c.b);
    if (!a || !b) return null;
    const d = Math.max(50, Math.abs(b.x - a.x) * 0.45);
    const p1 = { x: a.x + a.lado * d, y: a.y }, p2 = { x: b.x + b.lado * d, y: b.y };
    const meio = { x: (a.x + 3 * p1.x + 3 * p2.x + b.x) / 8, y: (a.y + 3 * p1.y + 3 * p2.y + b.y) / 8 };
    return { d: `M${a.x},${a.y} C${p1.x},${p1.y} ${p2.x},${p2.y} ${b.x},${b.y}`, meio };
  }

  // ---------- Interface ----------
  private montar() {
    const nova = el('button', { type: 'button', class: 'secundario' }, '+ Sala');
    dica(nova, 'Adicionar sala', 'Adiciona um local ao mapa (uma área nova, já com chão e salva em jogo/fases). Digite o nome e conecte arrastando das bolinhas azuis das bordas.');
    nova.addEventListener('click', () => void this.novaSala());
    const organizar = el('button', { type: 'button', class: 'secundario' }, 'Organizar');
    dica(organizar, 'Organizar', 'Põe as salas em grade, na ordem dos arquivos. As conexões continuam.');
    organizar.addEventListener('click', () => {
      this.salas.forEach((s, i) => { this.mapa.salas[s.arquivo] = this.lugarLivre(i); });
      this.mudou('salas organizadas');
      this.enquadrar();
    });
    const enq = el('button', { type: 'button', class: 'secundario' }, 'Enquadrar');
    dica(enq, 'Enquadrar', 'Mostra todas as salas.', 'Home');
    enq.addEventListener('click', () => this.enquadrar());
    const fechar = el('button', { type: 'button', class: 'primario' }, 'Fechar');
    dica(fechar, 'Fechar', 'As mudanças já ficam salvas no projeto.', 'Esc');
    fechar.addEventListener('click', () => this.fechar());
    const legenda = el('div', { class: 'mapa-legenda' },
      el('span', {}, el('i', { class: 'lg-porta' }), 'Passagem'), el('span', {}, el('i', { class: 'lg-sala' }), 'Sala'),
      el('span', {}, el('i', { class: 'lg-acao' }), 'Transição'), el('span', {}, el('i', { class: 'lg-inicio' }), 'Início'));
    dica(legenda, 'Legenda', 'Passagem = objeto com o comportamento Passagem (porta, escada, saída). Sala = uma fase ou área. Transição (losango) = o que acontece ao passar: clique para escolher. Início = onde o jogador aparece quando a conexão chega no meio da sala.');

    this.area = svg('svg', { class: 'mapa-area', tabindex: 0 }) as SVGSVGElement;
    this.grupo = svg('g');
    this.area.append(svg('defs', {},
      svg('pattern', { id: 'mapa-grade', width: 20, height: 20, patternUnits: 'userSpaceOnUse' }, svg('path', { d: 'M20 0H0V20', fill: 'none', stroke: 'rgba(255,255,255,0.04)' }))),
    svg('rect', { class: 'mapa-fundo', x: -50000, y: -50000, width: 100000, height: 100000, fill: 'url(#mapa-grade)' }));
    this.area.append(this.grupo);
    this.ligarEventos();
    this.painel = el('section', { class: 'pers-col pers-config mapa-painel' });

    this.raiz.replaceChildren(el('div', { class: 'pers-caixa mapa-caixa' },
      el('header', { class: 'pers-topo' }, el('h2', {}, 'Mapa'), legenda, el('div', { class: 'espaco' }),
        el('span', { class: 'dica-campo' }, 'Salvo automaticamente em jogo/projeto.json'), nova, organizar, enq, fechar),
      el('div', { class: 'mapa-colunas' }, el('div', { class: 'mapa-palco' }, this.area,
        el('div', { class: 'mapa-ajuda' }, 'Arraste de uma passagem ▭ até outra · clique no ◆ para a transição · arraste das bolinhas azuis até outra sala para conectar · clique no nome para renomear · arraste as salas · roda = zoom · arraste o fundo = mover · duplo clique na sala = abrir')),
      this.painel)));
    this.desenhar();
    this.renderPainel();
  }

  private aplicarVista() { this.grupo.setAttribute('transform', `translate(${this.vista.x},${this.vista.y}) scale(${this.vista.z})`); }

  private enquadrar() {
    if (!this.salas.length || !this.area) return;
    const caixas = this.salas.map((s) => this.caixaSala(s));
    const x0 = Math.min(...caixas.map((b) => b.x)) - 60, y0 = Math.min(...caixas.map((b) => b.y)) - 60;
    const x1 = Math.max(...caixas.map((b) => b.x + b.w)) + 60, y1 = Math.max(...caixas.map((b) => b.y + b.h)) + 60;
    const r = this.area.getBoundingClientRect();
    const W = r.width || 800, H = r.height || 500;
    const z = Math.max(0.3, Math.min(2, Math.min(W / (x1 - x0), H / (y1 - y0))));
    this.vista = { z, x: (W - (x1 - x0) * z) / 2 - x0 * z, y: (H - (y1 - y0) * z) / 2 - y0 * z };
    this.aplicarVista();
  }

  private desenhar() {
    if (!this.grupo) return;
    this.aplicarVista();
    const camadaLinhas = svg('g'), camadaSalas = svg('g'), camadaAcoes = svg('g');
    for (const s of this.salas) {
      const b = this.caixaSala(s);
      const selSala = this.sel?.tipo === 'sala' && this.sel.arquivo === s.arquivo;
      const g = svg('g', { class: 'mapa-sala' + (selSala ? ' sel' : '') + (s.arquivo === this.faseAtual ? ' atual' : '') + (s.erro ? ' erro' : ''), 'data-sala': s.arquivo });
      g.append(
        svg('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 3 }),
        svg('text', { x: b.x + 2, y: b.y - 8, class: 'mapa-nome', 'data-nome': s.arquivo }, s.nome, svg('title', {}, 'Clique para renomear')),
        svg('text', { x: b.x + 2, y: b.y + b.h + 14, class: 'mapa-sub' }, `${s.arquivo}${s.tipo === 'area' ? ' · área' : ''}${s.regiao ? ' · ' + s.regiao : ''}${s.arquivo === this.faseAtual ? ' · aberta no editor' : ''}`),
      );
      // Início do jogador (alvo para chegar "no meio" da sala)
      const ini = this.pontoDe({ fase: s.arquivo, passagem: '' });
      if (ini) g.append(svg('path', { class: 'mapa-inicio', 'data-inicio': s.arquivo, d: `M${ini.x - 5},${ini.y - 9} L${ini.x + 5},${ini.y - 9} L${ini.x},${ini.y} Z` }));
      // Bolinhas de conexão nas bordas: arraste até outra sala e as passagens são criadas sozinhas
      for (const lado of ['esquerda', 'direita'] as const) {
        const cx = lado === 'esquerda' ? b.x - 9 : b.x + b.w + 9, cy = b.y + b.h / 2;
        const c = svg('circle', { class: 'mapa-conector', 'data-conector': `${s.arquivo}|${lado}`, cx, cy, r: 6 });
        c.append(svg('title', {}, `Arraste até outra sala para conectar (cria uma passagem ${lado === 'esquerda' ? 'à esquerda' : 'à direita'} desta sala e outra na sala de destino)`));
        g.append(c);
      }
      for (const p of s.passagens) {
        const pt = this.pontoDe({ fase: s.arquivo, passagem: p.id })!;
        const ligada = !!conexaoDaPassagem(this.mapa, s.arquivo, p.id);
        const selP = this.sel?.tipo === 'porta' && this.sel.fase === s.arquivo && this.sel.id === p.id;
        const r = svg('rect', {
          class: 'mapa-porta' + (ligada ? ' ligada' : '') + (selP ? ' sel' : '') + (p.modo === 'tocar' ? ' continua' : '') + (p.fora ? ' fora' : ''), 'data-porta': `${s.arquivo}|${p.id}`,
          x: pt.x - 5, y: pt.y - 8, width: 10, height: 16, rx: 1,
        });
        r.append(svg('title', {}, `${p.nome} · ${p.modo === 'tocar' ? 'passa ao atravessar' : 'apertando Interagir'}${p.requer ? ` (precisa de: ${p.requer})` : ''}${p.fora ? ' · FORA DA FASE: o jogador não alcança' : ''} — arraste até outra passagem para conectar`));
        g.append(r);
      }
      camadaSalas.append(g);
    }
    for (const c of this.mapa.conexoes) {
      const cam = this.caminho(c);
      if (!cam) continue;
      const selC = this.sel?.tipo === 'con' && this.sel.id === c.id;
      camadaLinhas.append(svg('path', { class: 'mapa-linha' + (selC ? ' sel' : '') + (c.maoDupla ? '' : ' ida'), d: cam.d, 'data-con': c.id }));
      const { x, y } = cam.meio;
      const vazio = c.transicao.efeito === 'corte' && !c.transicao.som && (!c.transicaoVolta || c.mesmoNosDoisSentidos || (c.transicaoVolta.efeito === 'corte' && !c.transicaoVolta.som));
      const g = svg('g', { class: 'mapa-acao' + (selC ? ' sel' : '') + (vazio ? ' vazia' : ''), 'data-con': c.id });
      g.append(svg('polygon', { points: `${x},${y - 11} ${x + 11},${y} ${x},${y + 11} ${x - 11},${y}` }),
        svg('text', { x, y: y + 24, class: 'mapa-acao-texto' }, rotuloConexao(c)),
        svg('title', {}, `${resumoTransicao(c.transicao)} — clique para escolher o que acontece ao passar (tela de loading, som…)`));
      camadaAcoes.append(g);
    }
    const temp = svg('path', { class: 'mapa-linha temp', d: '' });
    this.grupo.replaceChildren(camadaLinhas, camadaSalas, camadaAcoes, temp);
  }

  private ponto(ev: { clientX: number; clientY: number }) {
    const r = this.area.getBoundingClientRect();
    return { x: (ev.clientX - r.left - this.vista.x) / this.vista.z, y: (ev.clientY - r.top - this.vista.y) / this.vista.z };
  }

  private ligarEventos() {
    const a = this.area;
    a.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const r = a.getBoundingClientRect();
      const mx = ev.clientX - r.left, my = ev.clientY - r.top;
      const z = Math.max(0.25, Math.min(3, this.vista.z * (ev.deltaY < 0 ? 1.12 : 1 / 1.12)));
      this.vista.x = mx - ((mx - this.vista.x) * z) / this.vista.z;
      this.vista.y = my - ((my - this.vista.y) * z) / this.vista.z;
      this.vista.z = z;
      this.aplicarVista();
    }, { passive: false });
    a.addEventListener('dblclick', (ev) => {
      const s = (ev.target as Element).closest('[data-sala]')?.getAttribute('data-sala');
      if (s) { this.fechar(); this.acoes.aoAbrirSala(s); }
    });
    a.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 && ev.button !== 1) return;
      a.focus();
      const alvo = ev.target as Element;
      const porta = alvo.closest('[data-porta]')?.getAttribute('data-porta');
      const con = alvo.closest('[data-con]')?.getAttribute('data-con');
      const sala = alvo.closest('[data-sala]')?.getAttribute('data-sala');
      const nome = alvo.closest('[data-nome]')?.getAttribute('data-nome');
      const conector = alvo.closest('[data-conector]')?.getAttribute('data-conector');
      if (ev.button === 0 && nome) { ev.preventDefault(); this.editarNome(nome); return; }
      a.setPointerCapture(ev.pointerId);
      const p0 = this.ponto(ev);
      const c0 = { x: ev.clientX, y: ev.clientY };
      let moveu = false;
      const fim = (fn: (m: PointerEvent) => void, solto: (m: PointerEvent) => void) => {
        const up = (m: PointerEvent) => { a.removeEventListener('pointermove', fn); a.removeEventListener('pointerup', up); solto(m); };
        a.addEventListener('pointermove', fn);
        a.addEventListener('pointerup', up);
      };
      if (ev.button === 0 && (porta || conector)) {
        // Arrastar de uma passagem (ou da bolinha da borda): linha provisória até soltar em outra passagem ou sala
        const [fase, id] = (porta ?? conector)!.split('|');
        const origemSala = this.sala(fase)!;
        const bo = this.caixaSala(origemSala);
        const ini = porta ? this.pontoDe({ fase, passagem: id })! : { x: id === 'esquerda' ? bo.x - 9 : bo.x + bo.w + 9, y: bo.y + bo.h / 2 };
        const temp = this.grupo.querySelector<SVGPathElement>('.temp')!;
        fim((m) => {
          moveu ||= Math.hypot(m.clientX - c0.x, m.clientY - c0.y) > 4;
          const p = this.ponto(m);
          temp.setAttribute('d', `M${ini.x},${ini.y} L${p.x},${p.y}`);
        }, (m) => {
          temp.setAttribute('d', '');
          if (!moveu) { if (porta) { this.sel = { tipo: 'porta', fase, id }; this.desenhar(); this.renderPainel(); } return; }
          const sob = document.elementFromPoint(m.clientX, m.clientY);
          const destPorta = sob?.closest('[data-porta]')?.getAttribute('data-porta');
          const destInicio = sob?.closest('[data-inicio]')?.getAttribute('data-inicio');
          const destSala = sob?.closest('[data-sala]')?.getAttribute('data-sala');
          if (porta && destPorta === porta) return;
          void this.conectarArrasto(porta ? { fase, passagem: id } : { fase, lado: id as Lado }, destPorta, destInicio, destSala);
        });
        return;
      }
      if (ev.button === 0 && con) {
        this.sel = { tipo: 'con', id: con };
        this.desenhar(); this.renderPainel();
        return;
      }
      if (ev.button === 0 && sala) {
        const pos = this.mapa.salas[sala];
        const orig = { ...pos };
        fim((m) => {
          const p = this.ponto(m);
          moveu ||= Math.hypot(m.clientX - c0.x, m.clientY - c0.y) > 3;
          if (!moveu) return;
          pos.x = Math.round((orig.x + p.x - p0.x) / 10) * 10;
          pos.y = Math.round((orig.y + p.y - p0.y) / 10) * 10;
          this.desenhar();
        }, () => {
          this.sel = { tipo: 'sala', arquivo: sala };
          if (moveu) this.mudou(''); else { this.desenhar(); this.renderPainel(); }
        });
        return;
      }
      // Fundo: mover a visão (clique simples tira a seleção)
      const v0 = { ...this.vista };
      fim((m) => {
        moveu ||= Math.hypot(m.clientX - c0.x, m.clientY - c0.y) > 3;
        this.vista.x = v0.x + m.clientX - c0.x; this.vista.y = v0.y + m.clientY - c0.y;
        this.aplicarVista();
      }, () => { if (!moveu && this.sel) { this.sel = null; this.desenhar(); this.renderPainel(); } });
    });
  }

  private nomePonta(p: PontaConexao) {
    const s = this.sala(p.fase);
    const nomeSala = s?.nome ?? p.fase;
    if (!p.passagem) return `${nomeSala} · início`;
    return `${nomeSala} · ${s?.passagens.find((x) => x.id === p.passagem)?.nome ?? p.passagem}`;
  }

  private ligar(a: PontaConexao, b: PontaConexao) {
    // Passagem que já estava ligada: a conexão antiga sai (uma passagem leva a um lugar só); mantém a transição
    const antiga = conexaoDaPassagem(this.mapa, a.fase, a.passagem);
    const { conexao, removidas } = conectar(this.mapa, a, b, antiga ? structuredClone(antiga.transicao) : undefined);
    this.sel = { tipo: 'con', id: conexao.id };
    this.mudou(`conectou ${this.nomePonta(a)} ${conexao.maoDupla ? '⇄' : '→'} ${this.nomePonta(b)}${removidas.length ? ` (substituiu ${removidas.length} conexão antiga)` : ''}`);
  }

  /** Termina um arrasto de conexão. Soltar no meio de uma sala cria lá uma passagem na borda virada para a origem. */
  private async conectarArrasto(origem: PontaConexao | { fase: string; lado: Lado }, destPorta?: string | null, destInicio?: string | null, destSala?: string | null) {
    const destino = destPorta ? destPorta.split('|')[0] : destInicio ?? destSala;
    if (!destino) return;
    if (!('passagem' in origem) && destino === origem.fase) return; // da sala para ela mesma: nada
    const so = this.sala(origem.fase), sd = this.sala(destino);
    if (!so || !sd) return;
    const bo = this.caixaSala(so), bd = this.caixaSala(sd);
    const destinoADireita = bd.x + bd.w / 2 >= bo.x + bo.w / 2;
    try {
      let a: PontaConexao;
      if ('passagem' in origem) a = origem;
      else {
        const r = await this.acoes.criarPassagem(origem.fase, origem.lado, `Passagem → ${sd.nome}`);
        this.salas = r.salas;
        a = { fase: origem.fase, passagem: r.id };
      }
      let b: PontaConexao;
      if (destPorta) b = { fase: destino, passagem: destPorta.split('|')[1] };
      else if (destInicio) b = { fase: destino, passagem: '' };
      else {
        const r = await this.acoes.criarPassagem(destino, destinoADireita ? 'esquerda' : 'direita', `Passagem → ${so.nome}`);
        this.salas = r.salas;
        b = { fase: destino, passagem: r.id };
      }
      this.ligar(a, b);
    } catch (err) {
      this.painel.prepend(el('p', { class: 'aviso-texto' }, `Não consegui criar a passagem: ${String(err)}`));
    }
  }

  /** Adiciona um local ao mapa: área nova já salva, no centro da visão, com o nome em edição. */
  private async novaSala() {
    let n = this.salas.length + 1;
    while (this.salas.some((s) => s.nome === `Sala ${String(n).padStart(2, '0')}`)) n++;
    try {
      const r = await this.acoes.criarSala(`Sala ${String(n).padStart(2, '0')}`);
      this.salas = r.salas;
      // Lugar livre perto do centro da visão (sem cobrir outra sala)
      const ret = this.area.getBoundingClientRect();
      const nova = this.sala(r.arquivo)!;
      const base = { x: Math.round(((ret.width / 2 - this.vista.x) / this.vista.z - 100) / 10) * 10, y: Math.round(((ret.height / 2 - this.vista.y) / this.vista.z - 20) / 10) * 10 };
      const ocupado = (x: number, y: number) => {
        this.mapa.salas[r.arquivo] = { x, y };
        const b = this.caixaSala(nova);
        return this.salas.some((o) => o.arquivo !== r.arquivo && this.mapa.salas[o.arquivo] && (() => {
          const c = this.caixaSala(o);
          return b.x < c.x + c.w + 40 && b.x + b.w + 40 > c.x && b.y < c.y + c.h + 60 && b.y + b.h + 60 > c.y;
        })());
      };
      let pos = base;
      for (let i = 0; i < 60; i++) {
        const cand = { x: base.x + ((i % 5) - 2) * 160 * (i % 2 ? 1 : -1), y: base.y + Math.floor(i / 5) * 110 * (i % 2 ? -1 : 1) };
        if (!ocupado(cand.x, cand.y)) { pos = cand; break; }
      }
      this.mapa.salas[r.arquivo] = pos;
      this.sel = { tipo: 'sala', arquivo: r.arquivo };
      this.mudou(`sala adicionada: ${r.arquivo}`);
      this.editarNome(r.arquivo);
    } catch (err) { this.painel.prepend(el('p', { class: 'aviso-texto' }, `Não consegui criar a sala: ${String(err)}`)); }
  }

  /** Campo de texto por cima do nome da sala (Enter salva, Esc cancela). */
  private editarNome(arquivo: string) {
    const s = this.sala(arquivo);
    const texto = this.grupo.querySelector<SVGTextElement>(`[data-nome="${CSS.escape(arquivo)}"]`);
    if (!s || !texto) return;
    const palco = this.area.parentElement!;
    const r = texto.getBoundingClientRect(), rp = palco.getBoundingClientRect();
    const input = el('input', { type: 'text', class: 'mapa-nome-edicao', value: s.nome, 'aria-label': 'Nome da sala' }) as HTMLInputElement;
    // Dentro do palco (sem passar da borda: o foco num campo fora da área rolaria o palco e "quebraria" o diagrama)
    input.style.left = `${Math.max(8, Math.min(rp.width - 248, r.left - rp.left - 4))}px`;
    input.style.top = `${Math.max(8, Math.min(rp.height - 40, r.top - rp.top - 4))}px`;
    palco.append(input);
    input.focus({ preventScroll: true }); input.select();
    palco.scrollTo(0, 0);
    let feito = false;
    const terminar = async (salvar: boolean) => {
      if (feito) return;
      feito = true;
      const nome = input.value.trim();
      input.remove();
      palco.scrollTo(0, 0);
      this.raiz.focus({ preventScroll: true });
      if (!salvar || !nome || nome === s.nome) return;
      try {
        this.salas = await this.acoes.renomearSala(arquivo, nome);
        this.mudou(`sala ${arquivo} renomeada para "${nome}"`);
      } catch (err) { this.painel.prepend(el('p', { class: 'aviso-texto' }, `Não consegui renomear: ${String(err)}`)); }
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') void terminar(true);
      if (e.key === 'Escape') void terminar(false);
    });
    input.addEventListener('blur', () => void terminar(true));
  }

  private async novaPassagem(arquivo: string, lado: Lado) {
    const s = this.sala(arquivo);
    if (!s) return;
    try {
      const r = await this.acoes.criarPassagem(arquivo, lado, `Passagem ${s.passagens.length + 1}`);
      this.salas = r.salas;
      this.sel = { tipo: 'porta', fase: arquivo, id: r.id };
      this.mudou(`passagem criada em ${s.nome} (${lado})`);
    } catch (err) { this.painel.prepend(el('p', { class: 'aviso-texto' }, `Não consegui criar a passagem: ${String(err)}`)); }
  }

  /** Seletor "como passa" de uma passagem (muda o arquivo da sala). */
  private seletorModo(arquivo: string, id: string, rotulo: string) {
    const g = this.sala(arquivo)?.passagens.find((x) => x.id === id);
    const sel = el('select', {}, ...MODOS_PASSAGEM.map((m) => el('option', { value: m.id }, m.nome)));
    sel.value = g?.modo ?? 'interagir';
    sel.addEventListener('change', async () => {
      const modo = sel.value as ModoPassagem;
      this.salas = await this.acoes.modoPassagem(arquivo, id, modo);
      // Conexão com o mesmo comportamento na ida e na volta: a outra ponta acompanha
      const c = conexaoDaPassagem(this.mapa, arquivo, id);
      const outra = c && c.mesmoNosDoisSentidos && c.maoDupla && c.b.passagem ? (c.a.fase === arquivo && c.a.passagem === id ? c.b : c.a) : null;
      if (outra) this.salas = await this.acoes.modoPassagem(outra.fase, outra.passagem, modo);
      this.mudou(`passagem ${g?.nome ?? id}: ${MODOS_PASSAGEM.find((m) => m.id === modo)?.nome}${outra ? ' (e a do outro lado)' : ''}`);
    });
    const lab = el('label', {}, rotulo);
    dica(lab, 'Como passa', MODOS_PASSAGEM.map((m) => `${m.nome}: ${m.texto}`).join(' '));
    lab.append(sel);
    return el('div', { class: 'campo largo mapa-modo' }, lab);
  }

  private async apagarPassagem(arquivo: string, id: string) {
    const s = this.sala(arquivo);
    const g = s?.passagens.find((x) => x.id === id);
    if (!s || !g) return;
    if ((await perguntar('Excluir passagem', `Excluir "${g.nome}" de ${s.nome}? O objeto sai da fase e a conexão dele também.`, ['Cancelar', 'Excluir'])) !== 1) { this.raiz.focus(); return; }
    this.salas = await this.acoes.excluirPassagem(arquivo, id);
    this.mapa.conexoes = this.mapa.conexoes.filter((c) => !((c.a.fase === arquivo && c.a.passagem === id) || (c.b.fase === arquivo && c.b.passagem === id)));
    this.sel = { tipo: 'sala', arquivo };
    this.mudou(`passagem ${g.nome} excluída de ${s.nome}`);
  }

  private async excluirSelecionado() {
    if (this.sel?.tipo === 'porta') { await this.apagarPassagem(this.sel.fase, this.sel.id); return; }
    if (this.sel?.tipo !== 'con') return;
    const c = this.conexao(this.sel.id);
    if (!c) return;
    if ((await perguntar('Excluir conexão', `Desligar ${this.nomePonta(c.a)} de ${this.nomePonta(c.b)}?`, ['Cancelar', 'Excluir'])) !== 1) { this.raiz.focus(); return; }
    this.mapa.conexoes = this.mapa.conexoes.filter((x) => x !== c);
    this.sel = null;
    this.mudou(`conexão excluída: ${this.nomePonta(c.a)} — ${this.nomePonta(c.b)}`);
    this.raiz.focus();
  }

  // ---------- Painel da direita ----------
  private renderPainel() {
    const p = this.painel;
    if (!p) return;
    const sel = this.sel;
    if (sel?.tipo === 'con' && this.conexao(sel.id)) { this.painelConexao(this.conexao(sel.id)!); return; }
    if (sel?.tipo === 'porta') { this.painelPorta(sel.fase, sel.id); return; }
    if (sel?.tipo === 'sala' && this.sala(sel.arquivo)) { this.painelSala(this.sala(sel.arquivo)!); return; }
    const semPassagem = this.salas.filter((s) => !s.passagens.length);
    p.replaceChildren(
      el('h3', {}, 'Como usar'),
      el('p', { class: 'dica-campo' }, '1. "+ Sala" adiciona um local ao mapa. Clique no nome para renomear.'),
      el('p', { class: 'dica-campo' }, '2. Para conectar duas salas, arraste da bolinha azul da borda de uma até a outra: as passagens ▭ são criadas nas duas (zonas invisíveis no jogo). Também dá para arrastar de uma passagem que já existe (ex.: o objeto de uma porta com o comportamento Passagem) até outra passagem, até o meio de uma sala ou até o ▼ início dela.'),
      el('p', { class: 'dica-campo' }, '3. Clique no ◆ amarelo para escolher o que acontece entre as salas: nada, escurecer ou uma tela cheia animada com som (a porta se abrindo).'),
      el('p', { class: 'dica-campo' }, 'No ▶ Testar, a passagem leva o jogador para a outra sala com o inventário, a munição e as variáveis do código. Salas já visitadas lembram portas abertas, itens pegos e inimigos mortos.'),
      el('h3', {}, 'Resumo'),
      el('p', { class: 'dica-campo' }, `${this.salas.length} sala(s) · ${this.salas.reduce((n, s) => n + s.passagens.length, 0)} passagem(ns) · ${this.mapa.conexoes.length} conexão(ões)`),
      semPassagem.length ? el('p', { class: 'aviso-texto' }, `Sem passagens: ${semPassagem.map((s) => s.nome).join(', ')}`) : '',
    );
  }

  private painelSala(s: InfoSala) {
    const abrir = el('button', { type: 'button', class: 'primario largo' }, 'Abrir esta sala no editor');
    dica(abrir, 'Abrir no editor', 'Fecha o Mapa e abre a fase/área para editar (ou duplo clique na sala).');
    abrir.addEventListener('click', () => { this.fechar(); this.acoes.aoAbrirSala(s.arquivo); });
    const lista = el('div', { class: 'mapa-lista' });
    for (const g of s.passagens) {
      const v = conexaoDaPassagem(this.mapa, s.arquivo, g.id);
      const outra = v ? (v.a.fase === s.arquivo && v.a.passagem === g.id ? v.b : v.a) : null;
      const b = el('button', { type: 'button', class: 'pers-estado' + (v ? ' ok' : '') },
        el('strong', {}, g.nome), el('span', {}, outra ? `leva para ${this.nomePonta(outra)}` : 'sem conexão'));
      b.addEventListener('click', () => { this.sel = v ? { tipo: 'con', id: v.id } : { tipo: 'porta', fase: s.arquivo, id: g.id }; this.desenhar(); this.renderPainel(); });
      lista.append(b);
    }
    const nome = el('input', { type: 'text', id: 'mapa-nome-sala', value: s.nome }) as HTMLInputElement;
    nome.addEventListener('change', async () => {
      const v = nome.value.trim();
      if (!v || v === s.nome) return;
      this.salas = await this.acoes.renomearSala(s.arquivo, v);
      this.mudou(`sala ${s.arquivo} renomeada para "${v}"`);
    });
    const labNome = el('label', { for: 'mapa-nome-sala' }, 'Nome');
    dica(labNome, 'Nome da sala', 'Nome mostrado no mapa e no editor (também dá para clicar no nome no diagrama). O arquivo continua o mesmo, então as conexões não quebram.');
    const addPass = (lado: Lado, texto: string) => {
      const b = el('button', { type: 'button', class: 'secundario' }, texto);
      dica(b, 'Nova passagem', `Cria uma passagem na borda ${lado} da sala: uma zona invisível no jogo (vermelha no editor) com o comportamento Passagem. Depois é só arrastar dela até outra sala. Para usar a arte de uma porta, dê o comportamento Passagem ao objeto da porta no editor.`);
      b.addEventListener('click', () => void this.novaPassagem(s.arquivo, lado));
      return b;
    };
    this.painel.replaceChildren(
      el('h3', {}, 'Sala'),
      el('div', { class: 'campo largo' }, labNome, nome),
      el('p', { class: 'dica-campo' }, `${s.arquivo} · ${s.tipo === 'area' ? 'área conectável' : 'fase completa'}${s.regiao ? ` · região ${s.regiao}` : ''} · ${s.tamanho[0]}×${s.tamanho[1]} px`),
      s.erro ? el('p', { class: 'aviso-texto' }, s.erro) : '',
      abrir,
      el('h3', {}, `Passagens (${s.passagens.length})`),
      s.passagens.length ? lista : el('p', { class: 'dica-campo' }, 'Nenhuma ainda. Crie aqui, arraste das bolinhas azuis das bordas até outra sala, ou dê o comportamento "Passagem" ao objeto de uma porta no editor.'),
      el('div', { class: 'linha2' }, addPass('esquerda', '+ Passagem à esquerda'), addPass('direita', '+ Passagem à direita')),
    );
  }

  private painelPorta(fase: string, id: string) {
    const s = this.sala(fase);
    const g = s?.passagens.find((x) => x.id === id);
    const c = conexaoDaPassagem(this.mapa, fase, id);
    const ir = el('button', { type: 'button', class: 'secundario largo' }, 'Ver a transição');
    ir.addEventListener('click', () => { if (c) { this.sel = { tipo: 'con', id: c.id }; this.desenhar(); this.renderPainel(); } });
    const del = el('button', { type: 'button', class: 'perigo' }, 'Excluir passagem');
    dica(del, 'Excluir passagem', 'Tira o objeto da passagem da fase e a conexão dele.', 'Del');
    del.addEventListener('click', () => void this.apagarPassagem(fase, id));
    this.painel.replaceChildren(
      el('h3', {}, 'Passagem'),
      el('p', {}, el('strong', {}, g?.nome ?? id)),
      el('p', { class: 'dica-campo' }, `${s?.nome ?? fase} · objeto ${id}${g?.requer ? ` · precisa de: ${g.requer}` : ''}`),
      g?.fora ? el('p', { class: 'aviso-texto' }, 'Esta passagem está FORA da fase (a fase ficou menor que a posição dela): o jogador não alcança. Abra a sala e arraste a zona para dentro.') : '',
      this.seletorModo(fase, id, 'Como passa'),
      c ? el('p', { class: 'dica-campo' }, `Conectada: ${this.nomePonta(c.a)} ${c.maoDupla ? '⇄' : '→'} ${this.nomePonta(c.b)}`) : el('p', { class: 'aviso-texto' }, 'Sem conexão: arraste desta passagem até outra.'),
      c ? ir : '',
      del,
    );
  }

  private painelConexao(c: Conexao) {
    const mudar = (motivo: string, fn: () => void) => { fn(); this.mudou(motivo); };
    const campoCom = (sufixo: string) => (rotulo: string, input: HTMLElement, texto: string) => {
      const id = 'mapa-' + sufixo + rotulo.replace(/\W+/g, '');
      input.id = id;
      const lab = el('label', { for: id }, rotulo);
      dica(lab, rotulo, texto);
      return el('div', { class: 'campo largo' }, lab, input);
    };
    const volta = el('input', { type: 'checkbox' });
    volta.checked = c.maoDupla;
    volta.disabled = !c.b.passagem;
    volta.addEventListener('change', () => mudar(`conexão ${c.id}: ${volta.checked ? 'mão dupla' : 'só ida'}`, () => { c.maoDupla = volta.checked; }));
    const labVolta = el('label', { class: 'check' }, volta, 'Mão dupla (dá para voltar por ela)');
    dica(labVolta, 'Mão dupla', c.b.passagem ? 'Marcado: a passagem de chegada também leva de volta.' : 'A chegada é o início da sala (não é uma passagem), então só vai.');
    const doisLados = c.maoDupla && !!c.b.passagem;
    const igual = el('input', { type: 'checkbox' });
    igual.checked = c.mesmoNosDoisSentidos;
    igual.addEventListener('change', async () => {
      const ligar = igual.checked;
      if (ligar) {
        // A volta passa a ser igual à ida: mesma transição e mesmo "como passa"
        delete c.transicaoVolta;
        const modoIda = this.sala(c.a.fase)?.passagens.find((x) => x.id === c.a.passagem)?.modo;
        if (modoIda && c.b.passagem) this.salas = await this.acoes.modoPassagem(c.b.fase, c.b.passagem, modoIda);
      } else c.transicaoVolta = structuredClone(c.transicao);
      c.mesmoNosDoisSentidos = ligar;
      this.mudou(`conexão ${c.id}: ${ligar ? 'mesmo comportamento na ida e na volta' : 'ida e volta diferentes'}`);
    });
    const labIgual = el('label', { class: 'check destaque' }, igual, 'Mesmo comportamento na ida e na volta');
    dica(labIgual, 'Ida e volta', 'Marcado: o que você escolher (como passa, efeito, som) vale para os dois sentidos, e as duas passagens mudam juntas. Desmarcado: a ida e a volta têm cada uma a sua configuração.');
    const excluir = el('button', { type: 'button', class: 'perigo' }, 'Excluir conexão');
    dica(excluir, 'Excluir conexão', 'Desliga as duas passagens.', 'Del');
    excluir.addEventListener('click', () => void this.excluirSelecionado());
    const inverter = el('button', { type: 'button', class: 'secundario' }, 'Inverter sentido');
    dica(inverter, 'Inverter', 'Troca origem e chegada (só faz diferença sem mão dupla ou com ida e volta diferentes).');
    inverter.disabled = !c.b.passagem;
    inverter.addEventListener('click', () => mudar(`conexão ${c.id} invertida`, () => {
      const x = c.a; c.a = c.b; c.b = x;
      if (c.transicaoVolta) { const t = c.transicao; c.transicao = c.transicaoVolta; c.transicaoVolta = t; }
    }));

    const blocos: (HTMLElement | string)[] = [
      el('h3', {}, 'Conexão'),
      el('p', { class: 'mapa-rota' }, el('strong', {}, this.nomePonta(c.a)), el('span', {}, c.maoDupla ? ' ⇄ ' : ' → '), el('strong', {}, this.nomePonta(c.b))),
      labVolta,
      doisLados ? labIgual : '',
    ];
    if (!doisLados || c.mesmoNosDoisSentidos) {
      blocos.push(el('h3', {}, doisLados ? 'Ida e volta' : 'Ida'),
        doisLados ? this.seletorModoAmbos(c) : this.seletorModo(c.a.fase, c.a.passagem, `Como passa em ${this.nomePonta(c.a)}`),
        ...this.blocoTransicao(c, c.transicao, 'i', campoCom('i'), mudar));
    } else {
      blocos.push(el('div', { class: 'mapa-sentido' }, el('h3', {}, `Ida: ${this.nomePonta(c.a)} → ${this.nomePonta(c.b)}`),
        this.seletorModo(c.a.fase, c.a.passagem, 'Como passa'),
        ...this.blocoTransicao(c, c.transicao, 'i', campoCom('i'), mudar)));
      const tv = c.transicaoVolta ?? (c.transicaoVolta = structuredClone(c.transicao));
      blocos.push(el('div', { class: 'mapa-sentido' }, el('h3', {}, `Volta: ${this.nomePonta(c.b)} → ${this.nomePonta(c.a)}`),
        this.seletorModo(c.b.fase, c.b.passagem, 'Como passa'),
        ...this.blocoTransicao(c, tv, 'v', campoCom('v'), mudar)));
    }
    blocos.push(el('div', { class: 'secao acoes' }, inverter, excluir),
      el('p', { class: 'dica-campo' }, 'No código (jogo.js ou script da fase): aoPassar(jogo, passagem, destino) roda antes de passar e pode mudar destino.transicao ou cancelar (return false).'));
    this.painel.replaceChildren(...blocos);
  }

  /** "Como passa" valendo para as duas passagens da conexão de uma vez. */
  private seletorModoAmbos(c: Conexao) {
    const ga = this.sala(c.a.fase)?.passagens.find((x) => x.id === c.a.passagem);
    const gb = this.sala(c.b.fase)?.passagens.find((x) => x.id === c.b.passagem);
    const sel = el('select', {}, ...MODOS_PASSAGEM.map((m) => el('option', { value: m.id }, m.nome)));
    sel.value = ga?.modo ?? 'interagir';
    sel.addEventListener('change', async () => {
      const modo = sel.value as ModoPassagem;
      this.salas = await this.acoes.modoPassagem(c.a.fase, c.a.passagem, modo);
      this.salas = await this.acoes.modoPassagem(c.b.fase, c.b.passagem, modo);
      this.mudou(`conexão ${c.id}: ${MODOS_PASSAGEM.find((m) => m.id === modo)?.nome} na ida e na volta`);
    });
    const lab = el('label', {}, 'Como passa (nas duas passagens)');
    dica(lab, 'Como passa', MODOS_PASSAGEM.map((m) => `${m.nome}: ${m.texto}`).join(' '));
    lab.append(sel);
    const aviso = ga && gb && ga.modo !== gb.modo ? el('p', { class: 'aviso-texto' }, `Hoje as passagens estão diferentes (${ga.modo === 'tocar' ? 'ida ao atravessar' : 'ida com Interagir'}, ${gb.modo === 'tocar' ? 'volta ao atravessar' : 'volta com Interagir'}). Escolha acima para igualar.`) : '';
    return el('div', { class: 'campo largo mapa-modo' }, lab, aviso);
  }

  /** Efeito, tempo, cor, animação, som e pré-visualização de UMA transição (ida ou volta). */
  private blocoTransicao(c: Conexao, t: Transicao, sufixo: string, campo: (r: string, i: HTMLElement, t: string) => HTMLElement, mudar: (m: string, fn: () => void) => void): (HTMLElement | string)[] {
    const nomeSentido = sufixo === 'v' ? ' (volta)' : '';
    const efeitos = el('div', { class: 'segmentado', role: 'radiogroup', 'aria-label': 'Efeito' });
    for (const e of EFEITOS_TRANSICAO) {
      const b = el('button', { type: 'button', class: t.efeito === e.id ? 'ativo' : '', role: 'radio', 'aria-checked': String(t.efeito === e.id) }, e.nome);
      dica(b, e.nome, e.texto);
      b.addEventListener('click', () => mudar(`transição ${c.id}${nomeSentido}: ${e.nome}`, () => {
        t.efeito = e.id as EfeitoTransicao;
        if (e.id === 'tela' && t.duracao < 0.8) t.duracao = 1.2;
        if (e.id === 'escurecer' && t.duracao > 1) t.duracao = 0.35;
      }));
      efeitos.append(b);
    }
    const blocos: (HTMLElement | string)[] = [el('span', { class: 'rotulo-mini' }, 'Ao passar (◆)'), efeitos,
      el('p', { class: 'dica-campo' }, EFEITOS_TRANSICAO.find((e) => e.id === t.efeito)?.texto ?? '')];
    if (t.efeito !== 'corte') {
      const cor = el('input', { type: 'color', value: t.cor });
      cor.addEventListener('change', () => mudar(`transição ${c.id}${nomeSentido}: cor`, () => { t.cor = cor.value; }));
      const dur = el('input', { type: 'number', value: t.duracao, step: 0.1, min: 0 });
      dur.addEventListener('change', () => { const v = Number(dur.value); if (Number.isFinite(v)) mudar(`transição ${c.id}${nomeSentido}: ${v}s`, () => { t.duracao = Math.max(0, Math.min(30, v)); }); });
      blocos.push(el('div', { class: 'linha2' },
        campo('Tempo mínimo (s)', dur, t.efeito === 'tela' ? 'Quanto a tela fica, no mínimo. Se a animação for mais longa, espera ela terminar.' : 'Quanto a tela fica escura antes de mostrar a sala nova.'),
        campo('Cor de fundo', cor, 'Cor da tela durante a transição (preto é o clássico).')));
    }
    if (t.efeito === 'tela') blocos.push(...this.camposAnimacao(c, t, campo, mudar));
    const prev = el('button', { type: 'button', class: 'primario largo' }, `▶ Pré-visualizar${nomeSentido}`);
    dica(prev, 'Pré-visualizar', 'Mostra a transição em tela cheia, com o som, como no jogo.');
    prev.addEventListener('click', () => this.acoes.previa(structuredClone(t)));
    blocos.push(...this.camposSom(c, t, campo, mudar), prev);
    return blocos;
  }

  private camposAnimacao(c: Conexao, t: Transicao, campo: (r: string, i: HTMLElement, t: string) => HTMLElement, mudar: (m: string, fn: () => void) => void): HTMLElement[] {
    const sel = el('select', {}, el('option', { value: '' }, t.animacao ? 'Carregando lista…' : 'Nenhuma (só a cor de fundo)'));
    if (t.animacao) sel.append(el('option', { value: 'jogo/' + t.animacao }, t.animacao));
    sel.value = t.animacao ? 'jogo/' + t.animacao : '';
    void this.carregarImagens().then((lista) => {
      const atual = sel.value;
      sel.replaceChildren(el('option', { value: '' }, 'Nenhuma (só a cor de fundo)'),
        ...lista.map((i) => el('option', { value: i }, i)));
      if (atual && !lista.includes(atual)) sel.append(el('option', { value: atual }, atual));
      sel.value = atual;
    });
    sel.addEventListener('change', async () => {
      const v = sel.value;
      if (!v) { mudar(`transição ${c.id}: sem animação`, () => { t.animacao = ''; delete t.anim; }); return; }
      try {
        const rel = await this.acoes.garantir(v, 'transicoes');
        const img = new Image();
        img.src = this.acoes.url(rel);
        await img.decode();
        const nome = v.split('/').pop() ?? v;
        mudar(`transição ${c.id}: animação ${nome}`, () => { t.animacao = rel; t.anim = palpiteAnim(nome, img.naturalWidth, img.naturalHeight, 'umaVez'); });
      } catch (err) { this.painel.append(el('p', { class: 'aviso-texto' }, `Não consegui usar a imagem: ${String(err)}`)); }
    });
    const blocos = [campo('Animação (spritesheet)', sel, 'Folha de quadros da tela cheia (ex.: a porta de madeira se abrindo). Toca uma vez, centralizada e ampliada sem borrar. Desenhe no tamanho da tela do jogo (ex.: 640×360 por quadro).')];
    const a = t.anim;
    if (t.animacao && a) {
      const num = (rotulo: string, v: number, aplicar: (n: number) => void, texto: string) => {
        const i = el('input', { type: 'number', value: v, min: 1, step: 1 });
        i.addEventListener('change', () => { const n = Number(i.value); if (Number.isFinite(n) && n > 0) mudar(`transição ${c.id}: ${rotulo}`, () => aplicar(n)); });
        return campo(rotulo, i, texto);
      };
      const q = tamanhoQuadro(a);
      blocos.push(
        el('div', { class: 'linha3' },
          num('Quadros', a.quadros, (n) => { a.quadros = Math.round(n); a.colunas = Math.min(a.colunas, a.quadros); }, 'Quantos quadros a folha tem.'),
          num('Por linha', a.colunas, (n) => { a.colunas = Math.max(1, Math.min(a.quadros, Math.round(n))); }, 'Quadros em cada linha da folha.'),
          num('FPS', a.fps, (n) => { a.fps = n; }, 'Quadros por segundo.')),
        el('div', { class: 'tamanho-info' }, `Quadro: ${q.w} × ${q.h} px · animação de ${duracaoFolha(a).toFixed(2).replace('.', ',')} s, toca uma vez`));
    }
    const texto = el('input', { type: 'text', value: t.texto, placeholder: 'Ex.: Sala de controle' });
    texto.addEventListener('change', () => mudar(`transição ${c.id}: texto`, () => { t.texto = texto.value; }));
    blocos.push(campo('Texto na tela', texto, 'Opcional: aparece embaixo da animação (nome da sala, "Carregando…").'));
    return blocos;
  }

  private camposSom(c: Conexao, t: Transicao, campo: (r: string, i: HTMLElement, t: string) => HTMLElement, mudar: (m: string, fn: () => void) => void): HTMLElement[] {
    const sel = el('select', {}, el('option', { value: '' }, 'Nenhum'));
    if (t.som) sel.append(el('option', { value: 'jogo/' + t.som }, t.som));
    sel.value = t.som ? 'jogo/' + t.som : '';
    void this.carregarSons().then((lista) => {
      const atual = sel.value;
      sel.replaceChildren(el('option', { value: '' }, lista.length ? 'Nenhum' : 'Nenhum (não há sons .ogg/.mp3/.wav no projeto)'), ...lista.map((i) => el('option', { value: i }, i)));
      if (atual && !lista.includes(atual)) sel.append(el('option', { value: atual }, atual));
      sel.value = atual;
    });
    sel.addEventListener('change', async () => {
      const v = sel.value;
      if (!v) { mudar(`transição ${c.id}: sem som`, () => { t.som = ''; }); return; }
      const rel = await this.acoes.garantir(v, 'sons');
      mudar(`transição ${c.id}: som ${v.split('/').pop()}`, () => { t.som = rel; });
    });
    const vol = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: t.volume });
    vol.addEventListener('change', () => mudar(`transição ${c.id}: volume`, () => { t.volume = Number(vol.value); }));
    return [el('h3', {}, 'Som'), campo('Som ao passar', sel, 'Toca quando o jogador passa (porta de madeira rangendo, porta eletrônica abrindo). Coloque os arquivos .ogg, .mp3 ou .wav em qualquer pasta do projeto.'),
      ...(t.som ? [campo('Volume', vol, 'Volume do som (0 a 100%).')] : [])];
  }

  private async carregarImagens() {
    if (!this.listaImagens) {
      const todas = await this.acoes.imagens();
      const folha = (x: string) => /sprite\s*sheet|spritesheet|_\d+\s*fps|transic/i.test(x);
      this.listaImagens = [...todas.filter(folha), ...todas.filter((x) => !folha(x))];
    }
    return this.listaImagens;
  }
  private async carregarSons() {
    if (!this.listaSons) this.listaSons = await this.acoes.sons();
    return this.listaSons;
  }
}
