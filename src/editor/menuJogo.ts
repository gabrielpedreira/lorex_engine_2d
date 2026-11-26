// Menu do jogo (inventário) durante o ▶ Testar — e a prévia da ferramenta Menu e itens.
// Desenha a tela montada na ferramenta (painéis por cima do jogo, em px do jogo × zoom) e cuida da interação:
// escolher item → submenu Usar / Combinar / Checar; Arquivos (lista + leitura); Sair; Mapa.
import {
  arrumarEspacos, espacosDoMenu, faixaDaVida, itemDe,
  type ConfigItens, type ConfigMenu, type ItemNoMenu, type PainelMenu, type TelaMenu,
} from '../core/menu';
import { el } from '../ui/dom';

/** O que o menu precisa saber do jogo (o modo Teste, ou valores de exemplo na prévia). */
export interface ContextoMenu {
  menu(): ConfigMenu;
  itens(): ConfigItens;
  url(caminhoJogo: string): string;
  inventario(): Map<string, number>;
  vida(): { atual: number; maxima: number };
  arma(): { nome: string; imagem: string; municao: number; pente: number } | null;
  /** Usar: devolve true se o menu deve fechar (ex.: usou numa área; mostra o aviso no jogo). */
  usar(item: string): boolean;
  /** Combinar a + b (o jogo dá o aviso). */
  combinar(a: string, b: string): void;
  aviso(texto: string): void;
  /** Mapa (o jogo diz o que fazer; por enquanto um aviso). */
  mapa(): void;
}

type Botao = 'usar' | 'combinar' | 'checar';

export class MenuJogo {
  readonly raiz: HTMLElement;
  private tela: TelaMenu = 'inventario';
  private sel: string | null = null;
  private submenu = false;
  private subSel: Botao = 'usar';
  private combinando: string | null = null;
  private checando: string | null = null;
  private arquivo: string | null = null;
  private z = 1;
  /** Onde está o foco do teclado/controle: 'conteudo' (itens ou lista de arquivos) ou o id de um botão. */
  private foco = 'conteudo';
  /** Os painéis desenhados ficam aqui dentro (o fundo escuro cobre a área inteira). */
  private telaEl: HTMLElement;
  /** Prévia (ferramenta): sem interação de jogo, painel escolhido em destaque. */
  previa: { selecionado: string | null; aoEscolher: (id: string) => void; aoMover: (id: string, x: number, y: number, w: number, h: number) => void } | null = null;
  aoFechar: () => void = () => {};

  constructor(private ctx: ContextoMenu) {
    this.raiz = el('div', { class: 'menu-jogo', role: 'dialog', 'aria-label': 'Menu' });
    this.telaEl = el('div', { class: 'menu-tela' });
    this.raiz.append(this.telaEl);
    this.raiz.hidden = true;
    window.addEventListener('resize', () => { if (this.aberto && !this.previa) { this.encaixar(); this.render(); } });
  }

  get aberto() { return !this.raiz.hidden; }

  abrir(tela: TelaMenu = 'inventario') {
    this.tela = tela;
    this.submenu = false; this.combinando = null; this.checando = null; this.arquivo = tela === 'arquivos' ? this.arquivos()[0] ?? null : null;
    this.foco = 'conteudo';
    const lista = this.itensNoMenu();
    if (!this.sel || !lista.some((i) => i.nome === this.sel)) this.sel = lista[0]?.nome ?? null;
    this.raiz.hidden = false;
    if (!this.previa) this.encaixar();
    this.render();
  }

  /** No jogo: o menu ocupa exatamente o quadro da tela do jogo (rect em px do contêiner). */
  areaJogo(r: { x: number; y: number; w: number; h: number }) {
    Object.assign(this.raiz.style, { inset: 'auto', left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    if (this.aberto) { this.encaixar(); this.render(); }
  }

  /** A tela do menu ocupa o maior tamanho que cabe na área dela (mantendo a proporção), centralizada. */
  encaixar() {
    const r = this.raiz.getBoundingClientRect();
    const [w, h] = this.tamanho();
    if (!r.width || !r.height) return;
    const z = Math.min(r.width / w, r.height / h);
    this.posicionar((r.width - w * z) / 2, (r.height - h * z) / 2, z);
  }

  fechar() {
    if (!this.aberto) return;
    this.raiz.hidden = true;
    this.aoFechar();
  }

  /** Posição/tamanho na tela (px CSS) e zoom (px do jogo → px da tela). */
  posicionar(left: number, top: number, z: number) {
    this.z = z;
    const [w, h] = this.tamanho();
    Object.assign(this.telaEl.style, { left: `${left}px`, top: `${top}px`, width: `${w * z}px`, height: `${h * z}px` });
  }
  tamanho: () => [number, number] = () => [640, 360];

  mostrarTela(t: TelaMenu) { this.tela = t; this.submenu = false; this.combinando = null; this.checando = null; this.foco = 'conteudo'; this.render(); }

  /** Botões da tela atual (Sair, Arquivos, Menu, Mapa…). */
  private botoes() { return this.ctx.menu().telas[this.tela].filter((p) => p.tipo === 'botao'); }

  /** O botão mais perto na direção (dx, dy), a partir de um ponto. */
  private botaoNaDirecao(cx: number, cy: number, dx: number, dy: number, menos?: string): PainelMenu | undefined {
    let melhor: { p: PainelMenu; d: number } | undefined;
    for (const p of this.botoes()) {
      if (p.id === menos) continue;
      const px = p.x + p.w / 2, py = p.y + p.h / 2;
      const ax = px - cx, ay = py - cy;
      if (dx && Math.sign(ax) !== dx) continue;
      if (dy && (Math.sign(ay) !== dy || Math.abs(ay) < 4)) continue;
      const d = dx ? Math.abs(ax) + Math.abs(ay) * 3 : Math.abs(ay) + Math.abs(ax) * 0.5;
      if (!melhor || d < melhor.d) melhor = { p, d };
    }
    return melhor?.p;
  }

  private teclaBotao(k: string): void {
    const atual = this.botoes().find((p) => p.id === this.foco);
    if (!atual) { this.foco = 'conteudo'; this.render(); return; }
    const cx = atual.x + atual.w / 2, cy = atual.y + atual.h / 2;
    const dir: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (dir[k]) {
      const prox = this.botaoNaDirecao(cx, cy, dir[k][0], dir[k][1], atual.id);
      if (prox) this.foco = prox.id;
      else if (k === 'ArrowDown') this.foco = 'conteudo';
      this.render();
      return;
    }
    if (ehConfirmar(k)) this.botaoPainel(atual);
  }

  /** Do conteúdo (itens/lista) para o botão acima, o mais perto na horizontal. */
  private subirParaBotoes(cx: number, cy: number) {
    const b = this.botaoNaDirecao(cx, cy, 0, -1);
    if (b) { this.foco = b.id; this.render(); }
  }

  private itensNoMenu(): ItemNoMenu[] {
    const { colunas, total } = espacosDoMenu(this.ctx.menu());
    return arrumarEspacos(this.ctx.inventario(), this.ctx.itens(), colunas, total).itens;
  }
  private arquivos(): string[] {
    const cfg = this.ctx.itens();
    return [...this.ctx.inventario()].filter(([n, q]) => q > 0 && itemDe(cfg, n).tipo === 'arquivo').map(([n]) => n);
  }

  // ---------- Teclado (o modo Teste repassa as teclas enquanto o menu está aberto) ----------
  tecla(ev: KeyboardEvent): void {
    const k = ev.key;
    if (k === 'Escape') {
      if (this.submenu) this.submenu = false;
      else if (this.checando) this.checando = null;
      else if (this.combinando) { this.combinando = null; }
      else if (this.foco !== 'conteudo') this.foco = 'conteudo';
      else if (this.tela === 'arquivos') this.tela = 'inventario';
      else { this.fechar(); return; }
      this.render(); return;
    }
    if (this.checando) { if (ehConfirmar(k)) { this.checando = null; this.render(); } return; }
    if (this.foco !== 'conteudo' && !this.submenu && !this.combinando) { this.teclaBotao(k); return; }
    if (this.tela === 'arquivos') {
      const l = this.arquivos();
      const i = this.arquivo ? l.indexOf(this.arquivo) : -1;
      const lista = this.ctx.menu().telas.arquivos.find((p) => p.tipo === 'lista');
      if (k === 'ArrowUp' && i <= 0) { this.subirParaBotoes(lista ? lista.x + lista.w / 2 : 0, lista ? lista.y : 0); return; }
      if (k === 'ArrowLeft' || k === 'ArrowRight') { this.subirParaBotoes(lista ? lista.x + lista.w / 2 : 0, lista ? lista.y : 0); return; }
      if (k === 'ArrowDown' || k === 'ArrowUp') { const n = l[Math.max(0, Math.min(l.length - 1, i + (k === 'ArrowDown' ? 1 : -1)))]; if (n) { this.arquivo = n; this.render(); } }
      return;
    }
    if (this.submenu) {
      const ordem: Botao[] = ['usar', 'combinar', 'checar'];
      const i = ordem.indexOf(this.subSel);
      if (k === 'ArrowDown') { this.subSel = ordem[(i + 1) % 3]; this.render(); }
      else if (k === 'ArrowUp') { this.subSel = ordem[(i + 2) % 3]; this.render(); }
      else if (ehConfirmar(k)) this.apertarSubmenu(this.subSel);
      return;
    }
    const lista = this.itensNoMenu();
    const grade = this.ctx.menu().telas.inventario.find((p) => p.tipo === 'itens');
    const { colunas } = espacosDoMenu(this.ctx.menu());
    const atual = lista.find((x) => x.nome === this.sel) ?? lista[0];
    // Sem item (ou na primeira linha subindo): vai para os botões de cima
    const centroSlot = (slot: number) => {
      if (!grade) return { x: 320, y: 0 };
      const cw = grade.area[2] / grade.colunas;
      return { x: grade.x + grade.area[0] + ((slot % grade.colunas) + 0.5) * cw, y: grade.y + grade.area[1] };
    };
    if (!atual) { if (k.startsWith('Arrow')) { const c = centroSlot(0); this.subirParaBotoes(c.x, c.y); } return; }
    const mover = (alvoSlot: (s: number) => number) => {
      const s = alvoSlot(atual.slot);
      const achado = lista.find((x) => s >= x.slot && s < x.slot + x.espacos);
      if (achado) { this.sel = achado.nome; this.render(); return true; }
      return false;
    };
    if (k === 'ArrowRight') mover((s) => s + atual.espacos);
    else if (k === 'ArrowLeft') mover((s) => s - 1);
    else if (k === 'ArrowDown') mover((s) => s + colunas);
    else if (k === 'ArrowUp') { if (!mover((s) => s - colunas)) { const c = centroSlot(atual.slot); this.subirParaBotoes(c.x, c.y); } }
    else if (ehConfirmar(k)) this.escolherItem(atual.nome);
  }

  private escolherItem(nome: string) {
    if (this.combinando) {
      const a = this.combinando;
      this.combinando = null;
      // O mesmo item só combina consigo se houver 2 ou mais (ex.: remédio P + remédio P)
      if (a !== nome || (this.ctx.inventario().get(nome) ?? 0) >= 2) this.ctx.combinar(a, nome);
      else this.ctx.aviso('Escolha outro item para combinar.');
      this.sel = this.ctx.inventario().has(nome) ? nome : this.itensNoMenu()[0]?.nome ?? null;
      this.render();
      return;
    }
    this.sel = nome;
    this.submenu = true;
    this.subSel = 'usar';
    this.checando = null;
    this.render();
  }

  private apertarSubmenu(b: Botao) {
    const nome = this.sel;
    this.submenu = false;
    if (!nome) { this.render(); return; }
    if (b === 'usar') { if (this.ctx.usar(nome)) { this.fechar(); return; } }
    else if (b === 'combinar') { this.combinando = nome; this.ctx.aviso(`Combinar ${nome} com…`); }
    else this.checando = nome;
    this.render();
  }

  private botaoPainel(p: PainelMenu) {
    if (p.acao === 'sair') this.fechar();
    else if (p.acao === 'arquivos') { this.tela = 'arquivos'; this.arquivo = this.arquivos()[0] ?? null; this.foco = 'conteudo'; this.render(); }
    else if (p.acao === 'menu') { this.tela = 'inventario'; this.foco = 'conteudo'; this.render(); }
    else this.ctx.mapa();
  }

  // ---------- Desenho ----------
  render() {
    const m = this.ctx.menu();
    const z = this.z;
    this.raiz.style.setProperty('--z', String(z));
    this.raiz.style.background = this.previa ? m.fundo : hexAlfa(m.fundo, Math.max(m.escurecer, 0.92));
    const filhos: HTMLElement[] = [];
    for (const p of m.telas[this.tela]) filhos.push(this.painel(p));
    if (this.submenu && this.sel && !this.previa) filhos.push(this.desenharSubmenu());
    // Checar sem painel de leitura na tela: a foto grande e a legenda por cima de tudo
    if (this.checando && !this.previa && !m.telas[this.tela].some((p) => p.tipo === 'leitura')) { const [tw, th] = this.tamanho(); const c = this.caixa(0, 0, tw, th, 'menu-checar'); c.append(this.leitura(this.checando, tw, th, true)); filhos.push(c); }
    if (this.combinando && !this.previa) filhos.push(el('div', { class: 'menu-faixa' }, `Combinar ${this.combinando} com… (Esc cancela)`));
    this.telaEl.replaceChildren(...filhos);
  }

  private caixa(x: number, y: number, w: number, h: number, classe = '') {
    const z = this.z;
    const d = el('div', { class: classe });
    Object.assign(d.style, { left: `${x * z}px`, top: `${y * z}px`, width: `${w * z}px`, height: `${h * z}px` });
    return d;
  }

  private painel(p: PainelMenu): HTMLElement {
    const d = this.caixa(p.x, p.y, p.w, p.h, `menu-painel menu-${p.tipo}` + (p.imagem ? '' : p.tipo === 'botao' ? '' : ' menu-padrao'));
    if (p.imagem) d.append(el('img', { class: 'menu-moldura', src: this.ctx.url(p.imagem), alt: '', draggable: 'false' }));
    const [ax, ay, aw, ah] = p.area;
    const area = this.caixa(ax, ay, aw, ah, 'menu-area');
    area.style.color = p.cor;
    d.append(area);
    this.conteudo(p, area, aw, ah);
    if (p.tipo === 'botao') {
      if (p.texto) area.append(el('span', { class: 'menu-botao-texto' }, p.texto));
      if (!this.previa && this.foco === p.id) d.classList.add('foco');
      if (!this.previa) d.addEventListener('click', () => this.botaoPainel(p));
    }
    if (this.previa) this.editavel(d, p);
    return d;
  }

  private conteudo(p: PainelMenu, area: HTMLElement, aw: number, ah: number) {
    const z = this.z;
    const { atual, maxima } = this.ctx.vida();
    const pct = maxima > 0 ? Math.round((atual / maxima) * 100) : 0;
    const cfgItens = this.ctx.itens();
    switch (p.tipo) {
      case 'retrato': {
        const f = faixaDaVida(p.faixas, pct);
        if (f?.imagem) area.append(comZoom(el('img', { class: 'menu-cheio', src: this.ctx.url(f.imagem), alt: '' }), p.zoom));
        else area.append(el('span', { class: 'menu-vazio' }, `${pct}%`));
        break;
      }
      case 'vida': {
        const f = faixaDaVida(p.faixas, pct);
        const cor = f?.cor || '#58c04a';
        const barra = el('div', { class: 'menu-barra' }, el('div', { class: 'menu-barra-cheia' }));
        (barra.firstChild as HTMLElement).style.width = `${pct}%`;
        (barra.firstChild as HTMLElement).style.background = cor;
        const texto = el('span', { class: 'menu-condicao' }, f?.texto || `${atual}/${maxima}`);
        texto.style.color = cor;
        texto.style.fontSize = `${Math.max(6, Math.min(ah * 0.38, 16)) * z}px`;
        area.append(texto, barra);
        break;
      }
      case 'arma': {
        const a = this.ctx.arma();
        if (!a) { area.append(el('span', { class: 'menu-vazio' }, 'sem arma')); break; }
        if (a.imagem) area.append(comZoom(el('img', { class: 'menu-cheio', src: this.ctx.url(a.imagem), alt: a.nome }), p.zoom));
        else area.append(el('span', { class: 'menu-nome' }, a.nome));
        area.append(el('span', { class: 'menu-qtd' }, `${a.municao}/${a.pente}`));
        break;
      }
      case 'itens': {
        const lista = this.itensNoMenu();
        const cw = aw / p.colunas, ch = ah / p.linhas;
        for (let s = 0; s < p.colunas * p.linhas; s++) {
          area.append(this.caixa((s % p.colunas) * cw + 1, Math.floor(s / p.colunas) * ch + 1, cw - 2, ch - 2, 'menu-slot'));
        }
        for (const it of lista) {
          const c = this.caixa((it.slot % p.colunas) * cw + 1, Math.floor(it.slot / p.colunas) * ch + 1, cw * it.espacos - 2, ch - 2,
            'menu-item' + (it.nome === this.sel ? ' sel' : '') + (it.nome === this.combinando ? ' combinando' : ''));
          if (it.item.imagem) c.append(el('img', { src: this.ctx.url(it.item.imagem), alt: it.nome, draggable: 'false' }));
          else c.append(el('span', { class: 'menu-nome' }, it.nome));
          if (it.quantidade > 1) c.append(el('span', { class: 'menu-qtd' }, `×${it.quantidade}`));
          c.title = it.nome;
          if (!this.previa) c.addEventListener('click', (ev) => { ev.stopPropagation(); this.escolherItem(it.nome); });
          area.append(c);
        }
        break;
      }
      case 'info': {
        const nome = this.checando ?? this.sel;
        if (!nome || this.tela !== 'inventario') break;
        const it = itemDe(cfgItens, nome);
        const q = this.ctx.inventario().get(nome) ?? 0;
        area.append(el('strong', { class: 'menu-info-nome' }, nome + (q > 1 ? ` ×${q}` : '')), el('p', { class: 'menu-info-texto' }, it.descricao || ''));
        break;
      }
      case 'lista': {
        const l = this.arquivos();
        if (!l.length) area.append(el('span', { class: 'menu-vazio' }, 'Nenhum arquivo ainda.'));
        for (const n of l) {
          const b = el('button', { type: 'button', class: 'menu-arquivo' + (n === this.arquivo ? ' sel' : '') }, n);
          if (!this.previa) b.addEventListener('click', () => { this.arquivo = n; this.render(); });
          area.append(b);
        }
        break;
      }
      case 'leitura': {
        // Tela de itens: vazia até Checar (aí a foto grande e a legenda); tela de arquivos: o arquivo aberto
        if (this.tela === 'arquivos') {
          if (this.arquivo) area.append(this.leitura(this.arquivo, aw, ah, false));
          else area.append(el('span', { class: 'menu-vazio' }, 'Escolha um arquivo na lista.'));
        } else if (this.checando) area.append(this.leitura(this.checando, aw, ah, !this.previa));
        else if (this.previa && this.sel) area.append(this.leitura(this.sel, aw, ah, false));
        break;
      }
      default: break;
    }
  }

  /** Foto grande + legenda (Checar um item ou ler um arquivo). */
  private leitura(nome: string, aw: number, ah: number, fechavel: boolean, comTexto = true) {
    const it = itemDe(this.ctx.itens(), nome);
    const d = this.caixa(0, 0, aw, ah, 'menu-ler' + (comTexto ? '' : ' so-imagem'));
    const img = it.imagemGrande || it.imagem;
    if (img) d.append(el('img', { src: this.ctx.url(img), alt: nome }));
    d.append(el('strong', {}, nome));
    if (comTexto) d.append(el('p', {}, it.descricao || (this.previa ? '(sem legenda: escreva em Menu e itens › Itens)' : '')));
    if (fechavel) { d.append(el('span', { class: 'menu-dica' }, 'Esc ou clique para voltar')); d.addEventListener('click', () => { this.checando = null; this.render(); }); }
    return d;
  }

  private desenharSubmenu() {
    const m = this.ctx.menu();
    const s = m.submenu;
    const itensP = m.telas.inventario.find((p) => p.tipo === 'itens');
    const it = this.itensNoMenu().find((x) => x.nome === this.sel);
    let x = 200, y = 150;
    if (itensP && it) {
      const cw = itensP.area[2] / itensP.colunas, ch = itensP.area[3] / itensP.linhas;
      x = itensP.x + itensP.area[0] + ((it.slot % itensP.colunas) + it.espacos) * cw - 4;
      y = itensP.y + itensP.area[1] + Math.floor(it.slot / itensP.colunas) * ch + 4;
      const [tw, th] = this.tamanho();
      if (x + s.w > tw) x = itensP.x + itensP.area[0] + (it.slot % itensP.colunas) * cw - s.w + 4;
      y = Math.min(y, th - s.h - 2);
    }
    const d = this.caixa(x, y, s.w, s.h, 'menu-submenu' + (s.imagem ? '' : ' menu-padrao'));
    if (s.imagem) d.append(el('img', { class: 'menu-moldura', src: this.ctx.url(s.imagem), alt: '', draggable: 'false' }));
    for (const b of ['usar', 'combinar', 'checar'] as Botao[]) {
      const [bx, by, bw, bh] = s[b];
      const c = this.caixa(bx, by, bw, bh, 'menu-sub-botao' + (this.subSel === b ? ' sel' : ''));
      if (!s.imagem) c.append(el('span', {}, b.toUpperCase()));
      c.addEventListener('click', (ev) => { ev.stopPropagation(); this.apertarSubmenu(b); });
      c.addEventListener('pointerenter', () => { if (this.subSel !== b) { this.subSel = b; for (const o of d.querySelectorAll('.menu-sub-botao')) o.classList.remove('sel'); c.classList.add('sel'); } });
      d.append(c);
    }
    return d;
  }

  // ---------- Prévia (ferramenta): arrastar e redimensionar painéis ----------
  private editavel(d: HTMLElement, p: PainelMenu) {
    const pv = this.previa!;
    d.classList.add('menu-editavel');
    if (pv.selecionado === p.id) d.classList.add('selecionado');
    const alca = el('span', { class: 'menu-alca', title: 'Arraste para mudar o tamanho' });
    d.append(alca);
    const z = this.z;
    const arrastar = (ev: PointerEvent, redim: boolean) => {
      ev.preventDefault(); ev.stopPropagation();
      if (pv.selecionado !== p.id) { pv.aoEscolher(p.id); return; }
      const x0 = ev.clientX, y0 = ev.clientY;
      const ini = { x: p.x, y: p.y, w: p.w, h: p.h };
      const alvo = ev.currentTarget as HTMLElement;
      alvo.setPointerCapture(ev.pointerId);
      let ult = ini;
      const mover = (e: PointerEvent) => {
        const dx = Math.round((e.clientX - x0) / z), dy = Math.round((e.clientY - y0) / z);
        ult = redim ? { ...ini, w: Math.max(4, ini.w + dx), h: Math.max(4, ini.h + dy) } : { ...ini, x: ini.x + dx, y: ini.y + dy };
        Object.assign(d.style, { left: `${ult.x * z}px`, top: `${ult.y * z}px`, width: `${ult.w * z}px`, height: `${ult.h * z}px` });
      };
      const soltar = () => { alvo.removeEventListener('pointermove', mover); alvo.removeEventListener('pointerup', soltar); pv.aoMover(p.id, ult.x, ult.y, ult.w, ult.h); };
      alvo.addEventListener('pointermove', mover);
      alvo.addEventListener('pointerup', soltar);
    };
    d.addEventListener('pointerdown', (ev) => arrastar(ev, false));
    alca.addEventListener('pointerdown', (ev) => arrastar(ev, true));
  }
}

/** Aumenta a imagem dentro do quadro (o que passar da borda é cortado). */
function comZoom(img: HTMLElement, zoom: number) { if (zoom !== 1) img.style.transform = `scale(${zoom})`; return img; }

/** Teclas de confirmar (Enter, Espaço ou E de Interagir). */
function ehConfirmar(k: string) { return k === 'Enter' || k === ' ' || k === 'e' || k === 'E'; }

/** Cor #rrggbb com transparência (0–1). */
function hexAlfa(hex: string, a: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(0,0,0,${a})`;
  const n = Number.parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
