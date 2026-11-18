// Ferramenta HUD: edita o que aparece na tela do jogo (munição, inimigos vivos, itens, valores do código).
// À esquerda a lista de elementos, no centro a prévia da tela do jogador (arraste para posicionar), à direita
// as propriedades. Salva sozinho em jogo/projeto.json → "hud".
import { ANCORAS, CHAVES_HUD, deslocamentoHud, hudPadrao, posicaoHud, type ConfigHud, type ElementoHud } from '../core/hud';
import { el, perguntar } from './dom';
import { dica } from './legenda';

export class EditorHud {
  private raiz: HTMLElement;
  private h: ConfigHud = hudPadrao();
  private sel: string | null = null;
  private res: [number, number] = [640, 360];
  private itens: string[] = [];
  private escala = 1.5;

  aoMudar: (h: ConfigHud) => void = () => {};

  constructor() {
    this.raiz = el('div', { class: 'tela-personagens tela-hud', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'HUD', tabindex: -1 });
    this.raiz.hidden = true;
    document.body.append(this.raiz);
    this.raiz.addEventListener('keydown', (e) => {
      e.stopPropagation();
      const digitando = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
      if (e.key === 'Escape' && !digitando) this.fechar();
      if ((e.key === 'Delete') && !digitando && this.sel) this.remover(this.sel);
    });
  }

  get aberta() { return !this.raiz.hidden; }

  abrir(h: ConfigHud, resolucao: [number, number], itens: string[]) {
    this.h = structuredClone(h);
    this.res = resolucao;
    this.itens = [...new Set(itens)];
    this.sel = this.h.elementos[0]?.id ?? null;
    this.raiz.hidden = false;
    this.render();
    this.raiz.focus();
  }

  fechar() { this.raiz.hidden = true; }

  private mudou() { this.aoMudar(structuredClone(this.h)); this.render(); }

  private elemento(id: string | null) { return this.h.elementos.find((e) => e.id === id); }

  private novo() {
    let n = 1;
    while (this.h.elementos.some((e) => e.id === `elemento_${n}`)) n++;
    const e: ElementoHud = { id: `elemento_${n}`, rotulo: 'Texto', chave: `valor_${n}`, ancora: 'se', x: 8, y: 8 + this.h.elementos.length * 14, tamanho: 10, cor: '#ffffff', mostrarRotulo: true, visivel: true };
    this.h.elementos.push(e);
    this.sel = e.id;
    this.mudou();
  }

  private async remover(id: string) {
    const e = this.elemento(id);
    if (!e) return;
    if ((await perguntar('Remover elemento', `Remover "${e.rotulo || e.id}" do HUD?`, ['Cancelar', 'Remover'])) !== 1) return;
    this.h.elementos = this.h.elementos.filter((x) => x.id !== id);
    this.sel = this.h.elementos[0]?.id ?? null;
    this.mudou();
  }

  /** Valor de exemplo para a prévia. */
  private exemplo(chave: string) {
    return CHAVES_HUD.find((c) => c.chave === chave)?.exemplo ?? (chave.startsWith('item:') ? '1' : '0');
  }

  // ---------- Interface ----------
  private render() {
    const novo = el('button', { type: 'button', class: 'secundario' }, '+ Elemento');
    dica(novo, 'Novo elemento', 'Um texto (rótulo + valor) preso a um canto ou borda da tela do jogo.');
    novo.addEventListener('click', () => this.novo());
    const padrao = el('button', { type: 'button', class: 'secundario' }, 'Restaurar padrão');
    dica(padrao, 'Restaurar padrão', 'Volta ao HUD inicial (só a munição, no canto de baixo à esquerda).');
    padrao.addEventListener('click', async () => {
      if ((await perguntar('Restaurar o HUD', 'Os elementos voltam ao padrão.', ['Cancelar', 'Restaurar'])) !== 1) return;
      this.h = hudPadrao(); this.sel = this.h.elementos[0]?.id ?? null; this.mudou();
    });
    const fechar = el('button', { type: 'button', class: 'primario' }, 'Fechar');
    dica(fechar, 'Fechar', 'As mudanças já ficam salvas no projeto.', 'Esc');
    fechar.addEventListener('click', () => this.fechar());

    const lista = el('section', { class: 'pers-col' }, el('h3', {}, 'Elementos'));
    for (const e of this.h.elementos) {
      const b = el('button', { type: 'button', class: 'pers-estado' + (e.id === this.sel ? ' ativo' : '') + (e.visivel ? ' ok' : '') },
        el('strong', {}, e.rotulo || e.id), el('span', {}, `${e.chave} · ${ANCORAS.find((a) => a.id === e.ancora)?.nome}`));
      dica(b, e.rotulo || e.id, `Chave do valor: ${e.chave}. ${e.visivel ? '' : '(oculto)'}`);
      b.addEventListener('click', () => { this.sel = e.id; this.render(); });
      lista.append(b);
    }
    lista.append(novo, el('p', { class: 'dica-campo' }, 'No código: jogo.hud.definir("chave", valor) atualiza o elemento com essa chave.'));

    this.raiz.replaceChildren(el('div', { class: 'pers-caixa' },
      el('header', { class: 'pers-topo' }, el('h2', {}, 'HUD'), el('span', { class: 'dica-campo' }, `Tela do jogo: ${this.res[0]}×${this.res[1]} px`),
        el('div', { class: 'espaco' }), el('span', { class: 'dica-campo' }, 'Salvo automaticamente em jogo/projeto.json'), padrao, fechar),
      el('div', { class: 'pers-colunas' }, lista, this.previa(), this.propriedades())));
    if (!this.raiz.contains(document.activeElement)) this.raiz.focus();
  }

  private previa() {
    const [rw, rh] = this.res;
    this.escala = Math.min(1.6, 640 / rw);
    const tela = el('div', { class: 'hud-previa' });
    tela.style.width = `${rw * this.escala}px`;
    tela.style.height = `${rh * this.escala}px`;
    for (const e of this.h.elementos) {
      const d = el('div', { class: 'hud-elemento hud-editavel' + (e.id === this.sel ? ' selecionado' : '') + (e.visivel ? '' : ' oculto') },
        e.mostrarRotulo && e.rotulo ? el('span', { class: 'hud-rotulo' }, e.rotulo) : '', el('strong', {}, this.exemplo(e.chave)));
      d.style.fontSize = `${e.tamanho * this.escala}px`;
      d.style.color = e.cor;
      tela.append(d);
      dica(d, e.rotulo || e.id, 'Arraste para posicionar. A posição é medida a partir do canto/borda escolhido em "Preso a".');
      d.addEventListener('pointerdown', (ev) => this.arrastar(ev, e, d, tela));
      requestAnimationFrame(() => {
        const w = d.offsetWidth / this.escala, h = d.offsetHeight / this.escala;
        const p = posicaoHud(e, w, h, rw, rh);
        d.style.left = `${p.x * this.escala}px`;
        d.style.top = `${p.y * this.escala}px`;
      });
    }
    return el('section', { class: 'pers-col pers-centro' }, tela,
      el('p', { class: 'dica-campo' }, 'Prévia da tela do jogador com valores de exemplo. No ▶ Testar aparecem os valores de verdade.'));
  }

  private arrastar(ev: PointerEvent, e: ElementoHud, d: HTMLElement, tela: HTMLElement) {
    ev.preventDefault();
    if (this.sel !== e.id) { this.sel = e.id; this.render(); return; }
    d.setPointerCapture(ev.pointerId);
    const r0 = tela.getBoundingClientRect();
    const ox = ev.clientX - d.getBoundingClientRect().left, oy = ev.clientY - d.getBoundingClientRect().top;
    const [rw, rh] = this.res;
    const w = d.offsetWidth / this.escala, h = d.offsetHeight / this.escala;
    const mover = (m: PointerEvent) => {
      const px = Math.max(0, Math.min(rw - w, (m.clientX - r0.left - ox) / this.escala));
      const py = Math.max(0, Math.min(rh - h, (m.clientY - r0.top - oy) / this.escala));
      d.style.left = `${px * this.escala}px`;
      d.style.top = `${py * this.escala}px`;
      const n = deslocamentoHud(e, px, py, w, h, rw, rh);
      e.x = n.x; e.y = n.y;
    };
    const soltar = () => { d.removeEventListener('pointermove', mover); d.removeEventListener('pointerup', soltar); this.mudou(); };
    d.addEventListener('pointermove', mover);
    d.addEventListener('pointerup', soltar);
  }

  private propriedades() {
    const col = el('section', { class: 'pers-col pers-config' });
    const e = this.elemento(this.sel);
    if (!e) { col.append(el('p', { class: 'dica-campo' }, 'Nenhum elemento. Clique em "+ Elemento".')); return col; }
    const campo = (rotulo: string, input: HTMLElement, texto: string) => {
      const id = 'hud-' + rotulo.replace(/\W+/g, '');
      input.id = id;
      const lab = el('label', { for: id }, rotulo);
      dica(lab, rotulo, texto);
      return el('div', { class: 'campo largo' }, lab, input);
    };
    const texto = (v: string, aplicar: (v: string) => void) => {
      const i = el('input', { type: 'text', value: v });
      i.addEventListener('change', () => { aplicar(i.value); this.mudou(); });
      return i;
    };
    const numero = (v: number, aplicar: (v: number) => void, passo = 1) => {
      const i = el('input', { type: 'number', value: v, step: passo });
      i.addEventListener('change', () => { if (Number.isFinite(Number(i.value))) { aplicar(Number(i.value)); this.mudou(); } });
      return i;
    };
    // Chave: as prontas, itens da fase e uma livre
    const chaves = el('input', { type: 'text', value: e.chave, list: 'hud-chaves' });
    chaves.addEventListener('change', () => { e.chave = chaves.value.trim() || e.id; this.mudou(); });
    const sugestoes = el('datalist', { id: 'hud-chaves' },
      ...CHAVES_HUD.map((c) => el('option', { value: c.chave }, c.nome)),
      ...this.itens.map((i) => el('option', { value: `item:${i}` }, `Item: ${i}`)));
    const ancora = el('select', {}, ...ANCORAS.map((a) => el('option', { value: a.id }, a.nome)));
    ancora.value = e.ancora;
    ancora.addEventListener('change', () => {
      // Mantém o elemento no mesmo lugar ao trocar a âncora
      const [rw, rh] = this.res;
      const d = this.raiz.querySelector<HTMLElement>('.hud-editavel.selecionado');
      const w = d ? d.offsetWidth / this.escala : 40, h = d ? d.offsetHeight / this.escala : 12;
      const p = posicaoHud(e, w, h, rw, rh);
      e.ancora = ancora.value as ElementoHud['ancora'];
      const n = deslocamentoHud(e, p.x, p.y, w, h, rw, rh);
      e.x = n.x; e.y = n.y;
      this.mudou();
    });
    const cor = el('input', { type: 'color', value: e.cor });
    cor.addEventListener('change', () => { e.cor = cor.value; this.mudou(); });
    const rotuloVis = el('input', { type: 'checkbox' }); rotuloVis.checked = e.mostrarRotulo;
    rotuloVis.addEventListener('change', () => { e.mostrarRotulo = rotuloVis.checked; this.mudou(); });
    const vis = el('input', { type: 'checkbox' }); vis.checked = e.visivel;
    vis.addEventListener('change', () => { e.visivel = vis.checked; this.mudou(); });
    const remover = el('button', { type: 'button', class: 'perigo' }, 'Remover elemento');
    remover.addEventListener('click', () => void this.remover(e.id));
    const info = CHAVES_HUD.find((c) => c.chave === e.chave);
    col.append(
      el('h3', {}, 'Elemento'),
      campo('Rótulo', texto(e.rotulo, (v) => { e.rotulo = v; }), 'Texto antes do valor (ex.: Munição).'),
      campo('Valor (chave)', chaves, 'De onde vem o valor: municao, inimigos, item:<nome do item>, ou uma chave sua que o código define com jogo.hud.definir("chave", valor).'),
      sugestoes,
      el('p', { class: 'dica-campo' }, info ? info.texto : e.chave.startsWith('item:') ? `Quantidade de "${e.chave.slice(5)}" no inventário.` : `Definido pelo código: jogo.hud.definir("${e.chave}", valor).`),
      campo('Preso a', ancora, 'Canto ou borda da tela de onde a posição é medida (assim o HUD se ajusta a qualquer tela).'),
      el('div', { class: 'linha2' },
        campo('Distância X', numero(e.x, (v) => { e.x = Math.round(v); }), 'Distância horizontal (px do jogo) a partir do canto/borda.'),
        campo('Distância Y', numero(e.y, (v) => { e.y = Math.round(v); }), 'Distância vertical (px do jogo) a partir do canto/borda.')),
      el('div', { class: 'linha2' },
        campo('Tamanho', numero(e.tamanho, (v) => { e.tamanho = Math.max(4, v); }), 'Tamanho da letra em px do jogo.'),
        campo('Cor', cor, 'Cor do valor.')),
      el('label', { class: 'check' }, rotuloVis, 'Mostrar rótulo'),
      el('label', { class: 'check' }, vis, 'Visível'),
      el('div', { class: 'secao acoes' }, remover));
    return col;
  }
}
