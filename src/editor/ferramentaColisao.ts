// Ferramenta Colisão: desenhar (bloco, rampas, polígono, linha, mão livre) e editar (mover, escalar, vértices).
import type { Graphics } from 'pixi.js';
import { novoIdColisao } from '../core/fase';
import type { Colisao } from '../core/tipos';
import {
  NOMES_FORMA, arestaEm, caixa, colisaoEm, corDe, desenharColisoes, fechada, rampa, reescalar, retangulo, simplificar, verticeEm,
} from './colisoes';
import type { Estado } from './estado';

type Ponto = [number, number];
type Caixa = { x: number; y: number; w: number; h: number };
type Canto = 'no' | 'ne' | 'so' | 'se';

export interface ContextoCena {
  estado: Estado;
  /** Tela → mundo, sem encaixe. */
  telaParaMundo(sx: number, sy: number): { x: number; y: number };
  mundoParaTela(x: number, y: number): { x: number; y: number };
  zoom(): number;
  legenda(texto: string | null, sx?: number, sy?: number): void;
}

type Arraste =
  | { t: 'retangulo'; x0: number; y0: number; x1: number; y1: number }
  | { t: 'traco'; pontos: Ponto[] }
  | { t: 'mover'; id: string; inicio: Ponto; pontosIni: Ponto[]; mexeu: boolean }
  | { t: 'escala'; id: string; canto: Canto; caixaIni: Caixa; pontosIni: Ponto[]; mexeu: boolean }
  | { t: 'vertice'; id: string; i: number; mexeu: boolean };

const ALCA = 8;

export class FerramentaColisao {
  private arraste: Arraste | null = null;
  /** Polígono ou linha sendo criado ponto a ponto. */
  private construcao: { forma: 'poligono' | 'linha'; pontos: Ponto[]; mouse: Ponto | null } | null = null;
  /** Muda a cada alteração visual (o cenário usa para saber quando redesenhar). */
  versao = 0;

  constructor(private ctx: ContextoCena) {}

  get ocupado() { return !!this.arraste || !!this.construcao; }

  private get e() { return this.ctx.estado; }
  private tol() { return 6 / this.ctx.zoom(); }

  private encaixar(x: number, y: number): Ponto {
    if (!this.e.encaixar) return [Math.round(x), Math.round(y)];
    const g = this.e.fase.tamanhoGrade;
    return [Math.round(x / g) * g, Math.round(y / g) * g];
  }

  private selecionada(): Colisao | undefined {
    const id = this.e.colisaoSelecionada;
    return id ? this.e.colisao(id) : undefined;
  }

  private caixaTela(c: Colisao) {
    const b = caixa(c);
    const a = this.ctx.mundoParaTela(b.x, b.y);
    const z = this.ctx.zoom();
    return { x: a.x, y: a.y, w: b.w * z, h: b.h * z };
  }

  private cantoEm(sx: number, sy: number): Canto | null {
    const c = this.selecionada();
    if (!c) return null;
    const r = this.caixaTela(c);
    const perto = (ax: number, ay: number) => Math.abs(sx - ax) <= ALCA && Math.abs(sy - ay) <= ALCA;
    if (perto(r.x + r.w, r.y + r.h)) return 'se';
    if (perto(r.x, r.y)) return 'no';
    if (perto(r.x + r.w, r.y)) return 'ne';
    if (perto(r.x, r.y + r.h)) return 'so';
    return null;
  }

  private criar(forma: Colisao['forma'], pontos: Ponto[]) {
    const nova: Colisao = { id: novoIdColisao(this.e.fase), forma, comportamento: this.e.comportamentoNovo, pontos };
    this.e.alterar((f) => { f.colisoes.push(nova); });
    this.e.selecionarColisao(nova.id);
    const fem = forma === 'linha' || forma === 'rampa';
    this.e.avisar(`${NOMES_FORMA[forma]} ${nova.comportamento === 'solido' ? (fem ? 'sólida' : 'sólido') : 'atravessável'} ${fem ? 'criada' : 'criado'}. Arraste para mover, alças para mudar o tamanho.`);
  }

  // ---------- Mouse ----------

  pointerDown(sx: number, sy: number, botao: number, alt: boolean) {
    const w = this.ctx.telaParaMundo(sx, sy);
    const tol = this.tol();

    if (this.construcao) {
      if (botao === 2) { this.finalizarConstrucao(); return; }
      const p = this.encaixar(w.x, w.y);
      const pts = this.construcao.pontos;
      if (this.construcao.forma === 'poligono' && pts.length >= 3 && Math.hypot(pts[0][0] - w.x, pts[0][1] - w.y) <= tol * 1.5) {
        this.finalizarConstrucao();
        return;
      }
      const ult = pts[pts.length - 1];
      if (!ult || ult[0] !== p[0] || ult[1] !== p[1]) pts.push(p);
      this.versao++;
      return;
    }

    const sel = this.selecionada();
    if (sel) {
      const vi = verticeEm(sel, w.x, w.y, tol);
      if (vi >= 0) {
        if (botao === 2 || alt) { this.apagarVertice(sel, vi); return; }
        this.arraste = { t: 'vertice', id: sel.id, i: vi, mexeu: false };
        return;
      }
      const canto = this.cantoEm(sx, sy);
      if (canto && botao === 0) {
        this.arraste = { t: 'escala', id: sel.id, canto, caixaIni: caixa(sel), pontosIni: sel.pontos.map((p) => [...p] as Ponto), mexeu: false };
        return;
      }
    }
    if (botao !== 0) return;

    const alvo = colisaoEm(this.e.fase, w.x, w.y, tol);
    if (alvo) {
      this.e.selecionarColisao(alvo.id);
      this.arraste = { t: 'mover', id: alvo.id, inicio: [w.x, w.y], pontosIni: alvo.pontos.map((p) => [...p] as Ponto), mexeu: false };
      return;
    }
    this.e.selecionarColisao(null);
    const p0 = this.encaixar(w.x, w.y);
    switch (this.e.formaNova) {
      case 'bloco': case 'rampa-direita': case 'rampa-esquerda':
        this.arraste = { t: 'retangulo', x0: p0[0], y0: p0[1], x1: p0[0], y1: p0[1] };
        break;
      case 'maoLivre':
        this.arraste = { t: 'traco', pontos: [[Math.round(w.x), Math.round(w.y)]] };
        break;
      case 'poligono': case 'linha':
        this.construcao = { forma: this.e.formaNova, pontos: [p0], mouse: p0 };
        this.e.avisar(this.e.formaNova === 'poligono'
          ? 'Polígono: clique para cada vértice. Clique no primeiro ponto, duplo clique ou Enter para fechar. Backspace desfaz o último ponto.'
          : 'Linha: clique para cada ponto. Duplo clique, Enter ou botão direito para terminar. Backspace desfaz o último ponto.');
        break;
    }
    this.versao++;
  }

  pointerMove(sx: number, sy: number, shift: boolean) {
    const w = this.ctx.telaParaMundo(sx, sy);
    if (this.construcao) { this.construcao.mouse = this.encaixar(w.x, w.y); this.versao++; return; }
    const a = this.arraste;
    if (!a) return;
    if (a.t === 'retangulo') {
      [a.x1, a.y1] = this.encaixar(w.x, w.y);
      this.ctx.legenda(`${Math.abs(a.x1 - a.x0)} × ${Math.abs(a.y1 - a.y0)} px`, sx, sy);
      this.versao++;
      return;
    }
    if (a.t === 'traco') {
      const ult = a.pontos[a.pontos.length - 1];
      if (Math.hypot(ult[0] - w.x, ult[1] - w.y) >= 2 / this.ctx.zoom()) a.pontos.push([Math.round(w.x), Math.round(w.y)]);
      this.versao++;
      return;
    }
    const c = this.e.colisao(a.id);
    if (!c) return;
    if (!a.mexeu) { this.e.checkpoint(); a.mexeu = true; }
    if (a.t === 'mover') {
      const alvo = this.encaixar(a.pontosIni[0][0] + (w.x - a.inicio[0]), a.pontosIni[0][1] + (w.y - a.inicio[1]));
      const dx = alvo[0] - a.pontosIni[0][0], dy = alvo[1] - a.pontosIni[0][1];
      c.pontos = a.pontosIni.map(([x, y]) => [x + dx, y + dy]);
    } else if (a.t === 'escala') {
      const b = a.caixaIni;
      const ancX = a.canto === 'no' || a.canto === 'so' ? b.x + b.w : b.x;
      const ancY = a.canto === 'no' || a.canto === 'ne' ? b.y + b.h : b.y;
      const [mx, my] = this.encaixar(w.x, w.y);
      let nw = Math.max(2, Math.abs(mx - ancX)), nh = Math.max(2, Math.abs(my - ancY));
      if (shift && b.w && b.h) { const f = Math.max(nw / b.w, nh / b.h); nw = Math.round(b.w * f); nh = Math.round(b.h * f); }
      const nova = { x: mx < ancX ? ancX - nw : ancX, y: my < ancY ? ancY - nh : ancY, w: nw, h: nh };
      c.pontos = reescalar(a.pontosIni, b, nova);
      this.ctx.legenda(`${nw} × ${nh} px`, sx, sy);
    } else {
      c.pontos[a.i] = this.encaixar(w.x, w.y);
    }
    this.versao++;
    this.e.marcarAlterado();
  }

  pointerUp() {
    const a = this.arraste;
    this.arraste = null;
    this.ctx.legenda(null);
    if (!a) return;
    if (a.t === 'retangulo') {
      const x = Math.min(a.x0, a.x1), y = Math.min(a.y0, a.y1), w = Math.abs(a.x1 - a.x0), h = Math.abs(a.y1 - a.y0);
      if (w >= 2 && h >= 2) {
        const f = this.e.formaNova;
        if (f === 'bloco') this.criar('bloco', retangulo(x, y, w, h));
        else this.criar('rampa', rampa(x, y, w, h, f === 'rampa-esquerda' ? 'esquerda' : 'direita'));
      }
    } else if (a.t === 'traco') {
      const pts = simplificar(a.pontos, Math.max(1.5, 1.5 / this.ctx.zoom()));
      const comprimento = pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
      if (pts.length >= 2 && comprimento >= 4) this.criar('linha', pts);
    }
    this.versao++;
  }

  duploClique(sx: number, sy: number) {
    if (this.construcao) { this.finalizarConstrucao(); return; }
    const sel = this.selecionada();
    if (!sel) return;
    const w = this.ctx.telaParaMundo(sx, sy);
    const i = arestaEm(sel, w.x, w.y, this.tol());
    if (i < 0 || verticeEm(sel, w.x, w.y, this.tol()) >= 0) return;
    this.e.alterar(() => { sel.pontos.splice(i + 1, 0, this.encaixar(w.x, w.y)); });
    this.versao++;
    this.e.avisar('Vértice adicionado. Arraste para modelar; Alt+clique ou botão direito apaga.');
  }

  /** Teclas da ferramenta. Retorna true se consumiu a tecla. */
  tecla(k: string): boolean {
    if (!this.construcao) return false;
    if (k === 'Enter') { this.finalizarConstrucao(); return true; }
    if (k === 'Escape') { this.construcao = null; this.versao++; this.e.avisar('Desenho cancelado'); return true; }
    if (k === 'Backspace') {
      this.construcao.pontos.pop();
      if (!this.construcao.pontos.length) this.construcao = null;
      this.versao++;
      return true;
    }
    return false;
  }

  cancelar() { this.construcao = null; this.arraste = null; this.ctx.legenda(null); this.versao++; }

  private finalizarConstrucao() {
    const c = this.construcao;
    this.construcao = null;
    this.versao++;
    if (!c) return;
    // Duplo clique adiciona pontos repetidos: remove os consecutivos iguais
    const pts = c.pontos.filter((p, i) => i === 0 || p[0] !== c.pontos[i - 1][0] || p[1] !== c.pontos[i - 1][1]);
    if (c.forma === 'poligono' && pts.length >= 3) this.criar('poligono', pts);
    else if (c.forma === 'linha' && pts.length >= 2) this.criar('linha', pts);
    else this.e.avisar(c.forma === 'poligono' ? 'Um polígono precisa de pelo menos 3 pontos.' : 'Uma linha precisa de pelo menos 2 pontos.');
  }

  private apagarVertice(c: Colisao, i: number) {
    const minimo = fechada(c) ? 3 : 2;
    if (c.pontos.length <= minimo) { this.e.avisar(`Esta forma precisa de pelo menos ${minimo} vértices. Para apagar a forma, use Del.`); return; }
    this.e.alterar(() => { c.pontos.splice(i, 1); });
    this.versao++;
  }

  // ---------- Aparência ----------

  cursor(sx: number, sy: number): string {
    if (this.construcao) return 'crosshair';
    const w = this.ctx.telaParaMundo(sx, sy);
    const sel = this.selecionada();
    if (sel && verticeEm(sel, w.x, w.y, this.tol()) >= 0) return 'pointer';
    const canto = this.cantoEm(sx, sy);
    if (canto) return canto === 'se' || canto === 'no' ? 'nwse-resize' : 'nesw-resize';
    return colisaoEm(this.e.fase, w.x, w.y, this.tol()) ? 'move' : 'crosshair';
  }

  /** Texto da legenda ao passar o mouse. */
  legendaEm(sx: number, sy: number): { titulo: string; texto: string } | null {
    if (this.construcao || this.arraste) return null;
    const w = this.ctx.telaParaMundo(sx, sy);
    const sel = this.selecionada();
    if (sel && verticeEm(sel, w.x, w.y, this.tol()) >= 0) {
      return { titulo: 'Vértice', texto: 'Arraste para modelar a forma. Alt+clique ou botão direito apaga o vértice.' };
    }
    const c = colisaoEm(this.e.fase, w.x, w.y, this.tol());
    if (!c) return null;
    const tipo = c.comportamento === 'solido' ? 'sólido: o jogador não atravessa' : 'atravessável: o jogador sobe por baixo e fica em cima';
    return {
      titulo: `${NOMES_FORMA[c.forma]} de colisão`,
      texto: `${tipo[0].toUpperCase()}${tipo.slice(1)}. Clique para selecionar, arraste para mover, alças para mudar o tamanho, duplo clique numa borda para criar um vértice.`,
    };
  }

  desenhar(g: Graphics, destaque: boolean) {
    const paraTela = (x: number, y: number) => this.ctx.mundoParaTela(x, y);
    desenharColisoes(g, this.e.fase.colisoes, paraTela, this.e.colisaoSelecionada, destaque);
    const prov = (forma: Colisao['forma'], pontos: Ponto[]): Colisao => ({ id: '', forma, comportamento: this.e.comportamentoNovo, pontos });

    const a = this.arraste;
    if (a?.t === 'retangulo') {
      const x = Math.min(a.x0, a.x1), y = Math.min(a.y0, a.y1), w = Math.abs(a.x1 - a.x0), h = Math.abs(a.y1 - a.y0);
      if (w > 0 && h > 0) {
        const f = this.e.formaNova;
        desenharColisoes(g, [f === 'bloco' ? prov('bloco', retangulo(x, y, w, h)) : prov('rampa', rampa(x, y, w, h, f === 'rampa-esquerda' ? 'esquerda' : 'direita'))], paraTela, null, true);
      }
    }
    if (a?.t === 'traco' && a.pontos.length > 1) desenharColisoes(g, [prov('linha', a.pontos)], paraTela, null, true);
    if (this.construcao) {
      const c = this.construcao;
      const pts = c.mouse ? [...c.pontos, c.mouse] : c.pontos;
      if (pts.length > 1) desenharColisoes(g, [prov('linha', pts)], paraTela, null, true);
      for (const [i, [x, y]] of c.pontos.entries()) {
        const p = paraTela(x, y);
        g.circle(p.x, p.y, i === 0 && c.forma === 'poligono' && c.pontos.length >= 3 ? 6 : 3.5).fill({ color: 0xffffff }).stroke({ width: 1, color: 0x083933 });
      }
    }

    // Alças da forma selecionada: cantos (tamanho) e vértices (modelar)
    const sel = this.selecionada();
    if (sel && destaque) {
      const r = this.caixaTela(sel);
      const cor = corDe(sel);
      g.rect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w), Math.round(r.h)).stroke({ width: 1, color: cor, alpha: 0.6 });
      for (const [cx, cy] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
        g.rect(Math.round(cx - ALCA / 2), Math.round(cy - ALCA / 2), ALCA, ALCA).fill({ color: 0xffffff }).stroke({ width: 1, color: cor });
      }
      for (const [x, y] of sel.pontos) {
        const p = paraTela(x, y);
        g.circle(p.x, p.y, 4).fill({ color: cor }).stroke({ width: 1.5, color: 0x083933 });
      }
    }
  }
}
