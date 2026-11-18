// Painel de Log: fica embaixo do cenário e mostra, em tempo real, tudo o que o LOG registra
// (teclas, personagem, mundo, código, erros e avisos do editor), com filtros por categoria e busca.
import { CATEGORIAS, LOG, formatarLinha, formatarTempo, type CategoriaLog, type LinhaLog } from '../core/log';
import { el } from './dom';
import { dica } from './legenda';

const PREF = 'lorex.log.prefs';

export class PainelLog {
  readonly raiz: HTMLElement;
  private lista: HTMLElement;
  private chips = new Map<CategoriaLog, HTMLButtonElement>();
  private ativas = new Set<CategoriaLog>(CATEGORIAS.map((c) => c.id));
  private busca = '';
  private altura = 200;
  private grudado = true;
  private pendente = 0;
  private elBusca: HTMLInputElement;

  /** Erro com arquivo de script: abrir no painel de Código. */
  aoAbrirScript: (arquivo: string, linha?: number) => void = () => {};
  /** Abriu/fechou (o cenário muda de tamanho). */
  aoMudarVisibilidade: () => void = () => {};
  /** Último arquivo de log salvo (mostrado no topo). */
  ultimoArquivo = '';

  constructor() {
    this.lerPrefs();
    const alca = el('div', { class: 'log-alca', role: 'separator', 'aria-label': 'Arrastar para mudar a altura do log' });
    dica(alca, 'Altura do log', 'Arraste para cima ou para baixo.');
    alca.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      alca.setPointerCapture(e.pointerId);
      const y0 = e.clientY, h0 = this.altura;
      const mover = (ev: PointerEvent) => { this.altura = Math.min(Math.max(h0 + (y0 - ev.clientY), 90), window.innerHeight * 0.6); this.aplicarAltura(); };
      const soltar = () => { alca.removeEventListener('pointermove', mover); alca.removeEventListener('pointerup', soltar); this.salvarPrefs(); };
      alca.addEventListener('pointermove', mover);
      alca.addEventListener('pointerup', soltar);
    });

    const titulo = el('strong', { class: 'log-titulo' }, 'Log');
    dica(titulo, 'Log', 'Tudo o que acontece no editor e no ▶ Testar. Ao parar um teste, ele é salvo em logs/ na pasta do projeto.', 'L');
    const filtros = el('div', { class: 'log-filtros' });
    for (const c of CATEGORIAS) {
      const b = el('button', { type: 'button', class: `log-chip cat-${c.id}` + (this.ativas.has(c.id) ? ' ligado' : '') }, c.nome, el('span', { class: 'log-cont' }, '0'));
      dica(b, `${c.nome} (liga/desliga)`, c.texto);
      b.addEventListener('click', () => {
        if (this.ativas.has(c.id)) this.ativas.delete(c.id); else this.ativas.add(c.id);
        b.classList.toggle('ligado', this.ativas.has(c.id));
        this.salvarPrefs();
        this.redesenhar();
      });
      this.chips.set(c.id, b);
      filtros.append(b);
    }
    this.elBusca = el('input', { type: 'search', class: 'log-busca', placeholder: 'Filtrar texto', value: this.busca, 'aria-label': 'Filtrar o log' });
    this.elBusca.addEventListener('input', () => { this.busca = this.elBusca.value; this.redesenhar(); });
    const copiar = el('button', { type: 'button', class: 'secundario' }, 'Copiar');
    dica(copiar, 'Copiar', 'Copia as linhas visíveis (com os filtros atuais) para colar onde quiser.');
    copiar.addEventListener('click', () => {
      void navigator.clipboard?.writeText(this.visiveis().map(formatarLinha).join('\n'));
      LOG.add({ cat: 'sistema', texto: 'Log copiado para a área de transferência' });
    });
    const limpar = el('button', { type: 'button', class: 'secundario' }, 'Limpar');
    dica(limpar, 'Limpar', 'Apaga as linhas da tela (os arquivos de testes já salvos em logs/ continuam).');
    limpar.addEventListener('click', () => LOG.limpar());
    const fechar = el('button', { type: 'button', class: 'secundario', 'aria-label': 'Fechar o log' }, '×');
    dica(fechar, 'Fechar o log', 'Esconde o painel (continua registrando).', 'L');
    fechar.addEventListener('click', () => this.alternar(false));
    this.elArquivo = el('span', { class: 'log-arquivo dica-campo' });

    this.lista = el('div', { class: 'log-lista', role: 'log', 'aria-live': 'off', tabindex: 0 });
    this.lista.addEventListener('scroll', () => {
      const l = this.lista;
      this.grudado = l.scrollTop + l.clientHeight >= l.scrollHeight - 8;
    });

    this.raiz = el('section', { class: 'painel-log', 'aria-label': 'Log' }, alca,
      el('div', { class: 'log-topo' }, titulo, filtros, this.elBusca, el('div', { class: 'espaco' }), this.elArquivo, copiar, limpar, fechar),
      this.lista);
    this.raiz.hidden = !this.lerAberto();
    this.aplicarAltura();
    LOG.ouvintes.add((l) => this.chegou(l));
    this.redesenhar();
  }

  private elArquivo: HTMLElement;

  get aberto() { return !this.raiz.hidden; }

  alternar(mostrar = !this.aberto) {
    this.raiz.hidden = !mostrar;
    this.salvarPrefs();
    if (mostrar) { this.grudado = true; this.redesenhar(); }
    this.aoMudarVisibilidade();
  }

  mostrarArquivo(caminho: string) {
    this.ultimoArquivo = caminho;
    this.elArquivo.textContent = caminho ? `Salvo: ${caminho}` : '';
  }

  private aplicarAltura() { this.raiz.style.height = `${Math.round(this.altura)}px`; this.aoMudarVisibilidade(); }

  private visiveis(): LinhaLog[] {
    const b = this.busca.trim().toLowerCase();
    return LOG.linhas.filter((l) => this.ativas.has(l.cat) && (!b || formatarLinha(l).toLowerCase().includes(b)));
  }

  private linhaEl(l: LinhaLog) {
    const d = el('div', { class: `log-linha cat-${l.cat}` },
      el('span', { class: 'log-t' }, formatarTempo(l)),
      el('span', { class: 'log-cat' }, CATEGORIAS.find((c) => c.id === l.cat)!.nome),
      el('span', { class: 'log-txt' }, l.texto),
      l.arquivo ? el('span', { class: 'log-arq' }, `${l.arquivo}${l.linha ? `:${l.linha}` : ''}`) : '');
    if (l.arquivo && /\.js$/.test(l.arquivo)) {
      d.classList.add('clicavel');
      dica(d, 'Abrir no Código', `${l.arquivo}${l.linha ? `, linha ${l.linha}` : ''}`);
      d.addEventListener('click', () => this.aoAbrirScript(l.arquivo!, l.linha));
    }
    return d;
  }

  private contar() {
    const n = new Map<CategoriaLog, number>();
    for (const l of LOG.linhas) n.set(l.cat, (n.get(l.cat) ?? 0) + 1);
    for (const [c, b] of this.chips) b.querySelector('.log-cont')!.textContent = String(n.get(c) ?? 0);
  }

  /** Linha nova: acrescenta sem redesenhar tudo (agrupa no próximo quadro). */
  private chegou(l: LinhaLog | null) {
    if (!l) { this.redesenhar(); return; }
    if (this.pendente) return;
    this.pendente = requestAnimationFrame(() => { this.pendente = 0; this.redesenhar(); });
  }

  private redesenhar() {
    this.contar();
    if (!this.aberto) return;
    const vis = this.visiveis().slice(-800);
    this.lista.replaceChildren(...(vis.length ? vis.map((l) => this.linhaEl(l)) : [el('p', { class: 'dica-campo' }, 'Nada registrado ainda. Teste a fase (F5): teclas, estados do personagem, interações e erros aparecem aqui.')]));
    if (this.grudado) this.lista.scrollTop = this.lista.scrollHeight;
  }

  private lerAberto() {
    try { return JSON.parse(localStorage.getItem(PREF) ?? '{}').aberto !== false; } catch { return true; }
  }

  private lerPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREF) ?? '{}') as { desligadas?: CategoriaLog[]; altura?: number };
      // Guarda as DESLIGADAS: categorias novas (de módulos novos) já aparecem ligadas
      if (Array.isArray(p.desligadas)) this.ativas = new Set(CATEGORIAS.map((c) => c.id).filter((c) => !p.desligadas!.includes(c)));
      if (p.altura) this.altura = p.altura;
    } catch { /* sem preferências */ }
  }

  private salvarPrefs() {
    try { localStorage.setItem(PREF, JSON.stringify({ desligadas: CATEGORIAS.map((c) => c.id).filter((c) => !this.ativas.has(c)), altura: this.altura, aberto: this.aberto })); } catch { /* sem armazenamento */ }
  }
}
