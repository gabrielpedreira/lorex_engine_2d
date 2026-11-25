// Ferramenta HUD: edita o que aparece na tela do jogo (vida, munição, rosto, arma, itens, valores do código) e a
// tela de morte. À esquerda os elementos (e "+ Elemento" com predefinições), no centro a prévia da tela do jogador
// (arraste para posicionar), à direita as propriedades. Cada elemento pode usar imagens do projeto ou o desenho
// padrão. Salva sozinho em jogo/projeto.json → "hud".
import {
  ANCORAS, CHAVES_HUD, ESTILOS_HUD, PREDEFINICOES_HUD, deslocamentoHud, elementoBase, faixaHud, fracaoHud, hudPadrao, partesHud, posicaoHud,
  type ConfigHud, type ElementoHud, type TelaMorte,
} from '../core/hud';
import type { ImagensArma } from '../core/inimigos';
import { el, perguntar } from './dom';
import { dica } from './legenda';

/** O que a ferramenta precisa do editor (imagens do projeto). */
export interface AcoesHud {
  /** Imagens do projeto (caminhos relativos à raiz). */
  imagens(): Promise<string[]>;
  /** Garante a imagem em jogo/assets e devolve o caminho relativo a jogo/. */
  garantir(caminhoRaiz: string, categoria: string): Promise<string>;
  /** URL de um caminho relativo a jogo/. */
  url(caminhoJogo: string): string;
  /** Imagens da arma equipada pelo personagem do teste (para a prévia dos elementos "da arma"). */
  imagensArma?(): Promise<ImagensArma | null>;
}

const MORTE = '__morte';

export class EditorHud {
  private raiz: HTMLElement;
  private h: ConfigHud = hudPadrao();
  private sel: string | null = null;
  private res: [number, number] = [640, 360];
  private itens: string[] = [];
  private escala = 1.5;
  private listaImagens: string[] | null = null;
  private imagensArma: ImagensArma | null = null;

  aoMudar: (h: ConfigHud) => void = () => {};

  constructor(private acoes: AcoesHud) {
    this.raiz = el('div', { class: 'tela-personagens tela-hud', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'HUD', tabindex: -1 });
    this.raiz.hidden = true;
    document.body.append(this.raiz);
    this.raiz.addEventListener('keydown', (e) => {
      e.stopPropagation();
      const digitando = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
      if (e.key === 'Escape' && !digitando) this.fechar();
      if ((e.key === 'Delete') && !digitando && this.sel && this.sel !== MORTE) void this.remover(this.sel);
    });
  }

  get aberta() { return !this.raiz.hidden; }

  abrir(h: ConfigHud, resolucao: [number, number], itens: string[]) {
    this.h = structuredClone(h);
    this.res = resolucao;
    this.itens = [...new Set(itens)];
    this.sel = this.h.elementos[0]?.id ?? null;
    this.listaImagens = null;
    this.imagensArma = null;
    void this.acoes.imagensArma?.().then((a) => { this.imagensArma = a; if (this.aberta) this.render(); });
    this.raiz.hidden = false;
    this.render();
    this.raiz.focus();
  }

  fechar() { this.raiz.hidden = true; }

  private mudou() { this.aoMudar(structuredClone(this.h)); this.render(); }

  private elemento(id: string | null) { return this.h.elementos.find((e) => e.id === id); }

  private novo(pre: (typeof PREDEFINICOES_HUD)[number]) {
    const base = pre.id;
    let id = base, n = 2;
    while (this.h.elementos.some((e) => e.id === id)) id = `${base}_${n++}`;
    const e = elementoBase(id, pre.criar());
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
    const novo = el('details', { class: 'hud-novo' }, el('summary', { class: 'secundario' }, '+ Elemento'));
    dica(novo.querySelector('summary')!, 'Novo elemento', 'Escolha uma predefinição (vida em caixas, rosto, munição bala a bala, arma em uso…). Depois troque as imagens e arraste na prévia.');
    for (const p of PREDEFINICOES_HUD) {
      const b = el('button', { type: 'button', class: 'hud-novo-item' }, el('strong', {}, p.nome), el('span', {}, p.texto));
      b.addEventListener('click', () => this.novo(p));
      novo.append(b);
    }
    const padrao = el('button', { type: 'button', class: 'secundario' }, 'Restaurar padrão');
    dica(padrao, 'Restaurar padrão', 'Volta ao HUD inicial (vida em caixas e munição em texto, sem imagens).');
    padrao.addEventListener('click', async () => {
      if ((await perguntar('Restaurar o HUD', 'Os elementos voltam ao padrão.', ['Cancelar', 'Restaurar'])) !== 1) return;
      this.h = hudPadrao(); this.sel = this.h.elementos[0]?.id ?? null; this.mudou();
    });
    const fechar = el('button', { type: 'button', class: 'primario' }, 'Fechar');
    dica(fechar, 'Fechar', 'As mudanças já ficam salvas no projeto.', 'Esc');
    fechar.addEventListener('click', () => this.fechar());

    const lista = el('section', { class: 'pers-col' }, el('h3', {}, 'Elementos'));
    for (const e of this.h.elementos) {
      const estilo = ESTILOS_HUD.find((x) => x.id === e.estilo)?.nome ?? e.estilo;
      const b = el('button', { type: 'button', class: 'pers-estado' + (e.id === this.sel ? ' ativo' : '') + (e.visivel ? ' ok' : '') },
        el('strong', {}, e.rotulo || e.id), el('span', {}, `${e.chave} · ${estilo} · ${ANCORAS.find((a) => a.id === e.ancora)?.nome}`));
      dica(b, e.rotulo || e.id, `Chave do valor: ${e.chave}. Mostrado como ${estilo}. ${e.visivel ? '' : '(oculto)'}`);
      b.addEventListener('click', () => { this.sel = e.id; this.render(); });
      lista.append(b);
    }
    lista.append(novo, el('h3', {}, 'Telas'));
    const bMorte = el('button', { type: 'button', class: 'pers-estado' + (this.sel === MORTE ? ' ativo' : '') + (this.h.morte.imagem ? ' ok' : '') },
      el('strong', {}, 'Tela de morte'), el('span', {}, this.h.morte.imagem ? `animação · ${this.h.morte.quadros} quadros` : 'só o texto'));
    dica(bMorte, 'Tela de morte', 'O que aparece quando o jogador morre (game over): uma animação (spritesheet) ou um texto.');
    bMorte.addEventListener('click', () => { this.sel = MORTE; this.render(); });
    lista.append(bMorte, el('p', { class: 'dica-campo' }, 'O HUD também pode ser todo feito no código: jogo.hud.definir("chave", valor) atualiza o elemento com essa chave (ou cria um texto).'));

    this.raiz.replaceChildren(el('div', { class: 'pers-caixa' },
      el('header', { class: 'pers-topo' }, el('h2', {}, 'HUD'), el('span', { class: 'dica-campo' }, `Tela do jogo: ${this.res[0]}×${this.res[1]} px`),
        el('div', { class: 'espaco' }), el('span', { class: 'dica-campo' }, 'Salvo automaticamente em jogo/projeto.json'), padrao, fechar),
      el('div', { class: 'pers-colunas' }, lista, this.previa(), this.sel === MORTE ? this.propriedadesMorte() : this.propriedades())));
    if (!this.raiz.contains(document.activeElement)) this.raiz.focus();
  }

  private previa() {
    const [rw, rh] = this.res;
    this.escala = Math.min(1.6, 640 / rw);
    const tela = el('div', { class: 'hud-previa' });
    tela.style.width = `${rw * this.escala}px`;
    tela.style.height = `${rh * this.escala}px`;
    if (this.sel === MORTE) {
      tela.append(telaMorte(this.h.morte, this.escala, this.acoes.url, true));
    } else {
      for (const e of this.h.elementos) {
        const d = elementoHud(e, this.exemplo(e.chave), this.escala, this.acoes.url, this.imagensArma);
        d.classList.add('hud-editavel');
        if (e.id === this.sel) d.classList.add('selecionado');
        if (!e.visivel) d.classList.add('oculto');
        tela.append(d);
        dica(d, e.rotulo || e.id, 'Arraste para posicionar. A posição é medida a partir do canto/borda escolhido em "Preso a".');
        d.addEventListener('pointerdown', (ev) => this.arrastar(ev, e, d, tela));
        posicionarHud(d, e, this.escala, rw, rh);
      }
    }
    return el('section', { class: 'pers-col pers-centro' }, tela,
      el('p', { class: 'dica-campo' }, this.sel === MORTE ? 'Prévia da tela de morte (a animação toca uma vez e para no último quadro).' : 'Prévia da tela do jogador com valores de exemplo. No ▶ Testar aparecem os valores de verdade.'));
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

  // ---------- Campos ----------
  private campo(rotulo: string, input: HTMLElement, texto: string) {
    const id = 'hud-' + rotulo.replace(/\W+/g, '') + Math.random().toString(36).slice(2, 6);
    input.id = id;
    const lab = el('label', { for: id }, rotulo);
    dica(lab, rotulo, texto);
    return el('div', { class: 'campo largo' }, lab, input);
  }
  private texto(v: string, aplicar: (v: string) => void) {
    const i = el('input', { type: 'text', value: v });
    i.addEventListener('change', () => { aplicar(i.value); this.mudou(); });
    return i;
  }
  private numero(v: number, aplicar: (v: number) => void, passo = 1) {
    const i = el('input', { type: 'number', value: v, step: passo });
    i.addEventListener('change', () => { if (Number.isFinite(Number(i.value))) { aplicar(Number(i.value)); this.mudou(); } });
    return i;
  }

  /** Escolher uma imagem do projeto (ou nenhuma = desenho padrão). Guarda o caminho relativo a jogo/. */
  private campoImagem(rotulo: string, valor: string, aplicar: (v: string) => void, texto: string, nenhuma = 'Padrão (sem imagem)') {
    const sel = el('select', {}, el('option', { value: '' }, nenhuma), ...(valor ? [el('option', { value: 'jogo/' + valor }, valor.split('/').pop()!)] : []));
    sel.value = valor ? 'jogo/' + valor : '';
    // A lista completa vem quando o campo ganha foco (são muitas imagens)
    const preencher = async () => {
      if (sel.dataset.cheio) return;
      sel.dataset.cheio = '1';
      if (!this.listaImagens) {
        const todas = await this.acoes.imagens();
        const hud = (x: string) => /(^|\/)hud\//i.test(x);
        this.listaImagens = [...todas.filter(hud), ...todas.filter((x) => !hud(x))];
      }
      const atual = sel.value;
      sel.replaceChildren(el('option', { value: '' }, nenhuma), ...this.listaImagens.map((c) => el('option', { value: c }, c)));
      if (atual && !this.listaImagens.includes(atual)) sel.append(el('option', { value: atual }, atual));
      sel.value = atual;
    };
    sel.addEventListener('focus', () => void preencher());
    sel.addEventListener('pointerdown', () => void preencher());
    sel.addEventListener('change', async () => {
      const v = sel.value;
      const rel = !v ? '' : v.startsWith('jogo/') ? v.slice(5) : await this.acoes.garantir(v, 'hud');
      aplicar(rel);
      this.mudou();
    });
    const mini = el('span', { class: 'hud-mini' });
    if (valor) { const im = el('img', { src: this.acoes.url(valor), alt: '' }); mini.append(im); }
    const c = this.campo(rotulo, sel, texto);
    c.append(mini);
    c.classList.add('hud-campo-imagem');
    return c;
  }

  private propriedades() {
    const col = el('section', { class: 'pers-col pers-config' });
    const e = this.elemento(this.sel);
    if (!e) { col.append(el('p', { class: 'dica-campo' }, 'Nenhum elemento. Clique em "+ Elemento".')); return col; }
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
    const estilo = el('select', {}, ...ESTILOS_HUD.map((x) => el('option', { value: x.id }, x.nome)));
    estilo.value = e.estilo;
    estilo.addEventListener('change', () => { e.estilo = estilo.value as ElementoHud['estilo']; this.mudou(); });
    const cor = el('input', { type: 'color', value: e.cor || '#ffffff' });
    cor.addEventListener('change', () => { e.cor = cor.value; this.mudou(); });
    const rotuloVis = el('input', { type: 'checkbox' }); rotuloVis.checked = e.mostrarRotulo;
    rotuloVis.addEventListener('change', () => { e.mostrarRotulo = rotuloVis.checked; this.mudou(); });
    const vis = el('input', { type: 'checkbox' }); vis.checked = e.visivel;
    vis.addEventListener('change', () => { e.visivel = vis.checked; this.mudou(); });
    const direcao = el('select', {}, el('option', { value: 'horizontal' }, 'Lado a lado'), el('option', { value: 'vertical' }, 'Um embaixo do outro'));
    direcao.value = e.direcao;
    direcao.addEventListener('change', () => { e.direcao = direcao.value === 'vertical' ? 'vertical' : 'horizontal'; this.mudou(); });
    const remover = el('button', { type: 'button', class: 'perigo' }, 'Remover elemento');
    remover.addEventListener('click', () => void this.remover(e.id));
    const info = CHAVES_HUD.find((c) => c.chave === e.chave);
    const ehImagens = e.estilo === 'icones' || e.estilo === 'caixas' || e.estilo === 'imagem';

    col.append(
      el('h3', {}, 'Elemento'),
      this.campo('Rótulo', this.texto(e.rotulo, (v) => { e.rotulo = v; }), 'Nome do elemento (e texto antes do valor, se "Mostrar rótulo" estiver marcado).'),
      this.campo('Valor (chave)', chaves, 'De onde vem o valor: vida, municao, arma, vidas, magia, inimigos, item:<nome do item>, ou uma chave sua que o código define com jogo.hud.definir("chave", valor).'),
      sugestoes,
      el('p', { class: 'dica-campo' }, info ? info.texto : e.chave.startsWith('item:') ? `Quantidade de "${e.chave.slice(5)}" no inventário.` : `Definido pelo código: jogo.hud.definir("${e.chave}", valor).`),
      this.campo('Mostrar como', estilo, ESTILOS_HUD.map((x) => `${x.nome}: ${x.texto}`).join(' ')),
      el('p', { class: 'dica-campo' }, ESTILOS_HUD.find((x) => x.id === e.estilo)?.texto ?? ''),
      this.campo('Preso a', ancora, 'Canto ou borda da tela de onde a posição é medida (assim o HUD se ajusta a qualquer tela).'),
      el('div', { class: 'linha2' },
        this.campo('Distância X', this.numero(e.x, (v) => { e.x = Math.round(v); }), 'Distância horizontal (px do jogo) a partir do canto/borda.'),
        this.campo('Distância Y', this.numero(e.y, (v) => { e.y = Math.round(v); }), 'Distância vertical (px do jogo) a partir do canto/borda.')));

    // Tamanhos e cor, conforme o estilo
    const tamanhoNome = e.estilo === 'texto' ? 'Tamanho da letra' : e.estilo === 'barra' || e.estilo === 'caixas' ? 'Altura' : 'Altura da imagem';
    col.append(el('div', { class: 'linha2' },
      this.campo(tamanhoNome, this.numero(e.tamanho, (v) => { e.tamanho = Math.max(2, v); }), 'Em px do jogo.'),
      ...(e.estilo !== 'imagem' && e.estilo !== 'icones' || !e.imagem ? [this.campo(e.estilo === 'caixas' ? 'Cor das cheias' : 'Cor', cor, 'Cor do texto, da barra ou das caixas cheias (as faixas abaixo podem trocar). Nos ícones sem imagem, a cor do ícone padrão.')] : [])));
    if (e.estilo === 'barra' || e.estilo === 'caixas') {
      col.append(this.campo(e.estilo === 'barra' ? 'Comprimento' : 'Largura de cada caixa', this.numero(e.largura, (v) => { e.largura = Math.max(2, Math.round(v)); }), 'Em px do jogo.'));
    }
    if (e.estilo === 'icones' || e.estilo === 'caixas') {
      col.append(
        el('div', { class: 'linha2' },
          this.campo('Quantos no máximo', this.numero(e.maximo, (v) => { e.maximo = Math.max(0, Math.round(v)); }), '0 = o máximo do valor (pente de 14 → 14 balas; vida cheia 12 → 12 caixas).'),
          this.campo('Espaço entre', this.numero(e.espaco, (v) => { e.espaco = v; }, 0.5), 'Espaço entre um e outro (px do jogo).')),
        this.campo('Direção', direcao, 'Lado a lado (linha) ou um embaixo do outro (coluna).'));
    }
    if (e.estilo === 'icones' || e.estilo === 'imagem') {
      const da = el('input', { type: 'checkbox' }); da.checked = e.daArma;
      da.addEventListener('change', () => { e.daArma = da.checked; this.mudou(); });
      const lab = el('label', { class: 'check' }, da, 'Usar as imagens da arma equipada');
      dica(lab, 'Imagens da arma', 'As imagens vêm da arma que o personagem está usando (ferramenta Armas): ícones = a bala; imagem = a arma carregada e descarregada. Trocou de arma, o HUD troca junto. As imagens abaixo ficam de reserva.');
      col.append(lab);
    }
    if (ehImagens) {
      col.append(el('h3', {}, e.daArma ? 'Imagens de reserva (sem arma)' : 'Imagens'));
      if (e.estilo === 'icones') {
        col.append(
          this.campoImagem('Imagem de cada unidade', e.imagem, (v) => { e.imagem = v; }, 'Uma bala, um coração… Repetida uma vez por unidade do valor. Sem imagem: ícone padrão na cor escolhida.'),
          this.campoImagem('Unidade vazia', e.imagemVazia, (v) => { e.imagemVazia = v; }, 'Opcional: o que mostrar no lugar das unidades gastas (ex.: cápsula vazia). Sem imagem: some.', 'Não mostrar'));
      } else if (e.estilo === 'caixas') {
        col.append(
          this.campoImagem('Caixa cheia', e.imagem, (v) => { e.imagem = v; }, 'Opcional: imagem de uma caixa cheia. Sem imagem: caixa colorida (a cor muda pelas faixas).'),
          this.campoImagem('Caixa vazia', e.imagemVazia, (v) => { e.imagemVazia = v; }, 'Opcional: imagem da caixa vazia. Sem imagem: caixa escura.'));
      } else {
        col.append(this.campoImagem('Imagem normal', e.imagem, (v) => { e.imagem = v; }, 'A imagem quando nenhuma faixa vale (vida boa, arma carregada). Sem imagem: mostra o valor escrito.'));
      }
    }
    // Faixas: valor ≤ "até" troca a cor/imagem
    if (e.estilo !== 'icones') {
      const titulo = el('h3', {}, e.estilo === 'imagem' ? 'Trocar a imagem quando…' : 'Trocar a cor quando…');
      dica(titulo, 'Faixas', 'Quando o valor atual for menor ou igual ao número, usa esta cor/imagem. Vale a faixa de menor número que ainda cobre o valor (ex.: 8 → amarelo, 4 → vermelho).');
      col.append(titulo);
      e.faixas.forEach((f, i) => {
        const ate = el('input', { type: 'number', value: f.ate, step: 1, 'aria-label': 'Até (valor)' });
        ate.addEventListener('change', () => { f.ate = Number(ate.value) || 0; this.mudou(); });
        const tirar = el('button', { type: 'button', class: 'secundario', 'aria-label': 'Remover faixa' }, '×');
        dica(tirar, 'Remover faixa');
        tirar.addEventListener('click', () => { e.faixas.splice(i, 1); this.mudou(); });
        if (e.estilo === 'imagem') {
          const linha = el('div', { class: 'hud-faixa' }, el('span', {}, 'valor ≤'), ate, tirar);
          col.append(linha, this.campoImagem(`Imagem (≤ ${f.ate})`, f.imagem, (v) => { f.imagem = v; }, `Imagem quando o valor for ${f.ate} ou menos (rosto machucado, arma descarregada).`, 'Sem troca'));
        } else {
          const c = el('input', { type: 'color', value: f.cor || '#ffffff', 'aria-label': 'Cor' });
          c.addEventListener('change', () => { f.cor = c.value; this.mudou(); });
          col.append(el('div', { class: 'hud-faixa' }, el('span', {}, 'valor ≤'), ate, c, tirar));
        }
      });
      const mais = el('button', { type: 'button', class: 'secundario largo' }, '+ Faixa');
      dica(mais, 'Nova faixa', 'Troca a cor ou a imagem quando o valor ficar baixo.');
      mais.addEventListener('click', () => { const menor = e.faixas.length ? Math.min(...e.faixas.map((f) => f.ate)) : 0; e.faixas.push({ ate: Math.max(0, Math.floor(menor / 2)), cor: '#e04848', imagem: '' }); this.mudou(); });
      col.append(mais);
    }
    col.append(
      el('label', { class: 'check' }, rotuloVis, 'Mostrar rótulo'),
      el('label', { class: 'check' }, vis, 'Visível'),
      el('div', { class: 'secao acoes' }, remover));
    return col;
  }

  private propriedadesMorte() {
    const m = this.h.morte;
    const col = el('section', { class: 'pers-col pers-config' }, el('h3', {}, 'Tela de morte'));
    const desligar = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: m.escurecer });
    desligar.addEventListener('change', () => { m.escurecer = Number(desligar.value); this.mudou(); });
    col.append(
      this.campoImagem('Animação (spritesheet)', m.imagem, (v) => { m.imagem = v; if (v) this.palpiteQuadros(v); }, 'Quadros lado a lado numa linha (ex.: tela_game_over.png). Toca uma vez e para no último quadro. Sem imagem: só o texto.', 'Só o texto'),
      el('div', { class: 'linha2' },
        this.campo('Quadros', this.numero(m.quadros, (v) => { m.quadros = Math.max(1, Math.round(v)); }), 'Quantos quadros a folha tem (largura ÷ largura de um quadro).'),
        this.campo('FPS', this.numero(m.fps, (v) => { m.fps = Math.max(1, v); }), 'Velocidade da animação.')),
      this.campo('Altura', this.numero(m.tamanho, (v) => { m.tamanho = Math.max(8, v); }), 'Altura da animação na tela do jogo (px do jogo).'),
      this.campo(m.imagem ? 'Legenda' : 'Texto', this.texto(m.texto, (v) => { m.texto = v; }), m.imagem ? 'Texto pequeno embaixo da animação (deixe vazio para não ter).' : 'Texto grande no meio da tela.'),
      this.campo('Escurecer o fundo', desligar, 'Quanto a tela do jogo escurece atrás (0 a 100%).'),
      el('p', { class: 'dica-campo' }, 'O tempo até voltar no checkpoint fica em Personagens › Vida (Enter volta antes).'));
    return col;
  }

  /** Quadros quadrados numa linha: palpite pela proporção da imagem. */
  private palpiteQuadros(caminho: string) {
    const im = new Image();
    im.onload = () => { if (im.naturalHeight > 0) { this.h.morte.quadros = Math.max(1, Math.round(im.naturalWidth / im.naturalHeight)); this.mudou(); } };
    im.src = this.acoes.url(caminho);
  }
}

// ---------- Desenho (prévia e ▶ Testar) ----------

/** Um elemento do HUD na tela, na escala dada. url = caminho relativo a jogo/ → URL. Usado na prévia e no ▶ Testar. */
export function elementoHud(e0: ElementoHud, valor: string, escala: number, url: (c: string) => string, arma?: ImagensArma | null): HTMLElement {
  // Imagens da arma equipada (ferramenta Armas) no lugar das do elemento
  let e = e0;
  if (e0.daArma && arma) {
    const vazia = (partesHud(valor)?.atual ?? 1) <= 0;
    e = e0.estilo === 'icones' ? { ...e0, imagem: arma.bala || e0.imagem }
      : e0.estilo === 'imagem' ? { ...e0, imagem: (vazia && arma.hudVazia) || arma.hud || e0.imagem, faixas: arma.hud ? [] : e0.faixas } : e0;
  }
  const rotulo = e.mostrarRotulo && e.rotulo ? el('span', { class: 'hud-rotulo' }, e.rotulo) : '';
  const faixa = faixaHud(e, valor);
  const cor = faixa?.cor || e.cor;
  const img = (c: string, extra = '') => {
    const i = el('img', { src: url(c), alt: '', class: 'hud-img' + extra, draggable: 'false' }) as HTMLImageElement;
    i.style.height = `${e.tamanho * escala}px`;
    return i;
  };
  const caixa = (classe: string, filhos: (HTMLElement | string)[]) => {
    const d = el('div', { class: `hud-elemento ${classe}`, title: valor }, rotulo, ...filhos);
    d.style.fontSize = `${Math.max(6, e.estilo === 'texto' ? e.tamanho : 8) * escala}px`;
    d.style.color = cor;
    return d;
  };
  const p = partesHud(valor);

  if (e.estilo === 'barra') {
    const f = fracaoHud(valor);
    if (f !== null) {
      const cheio = el('span', { class: 'hud-barra-cheio' });
      cheio.style.width = `${f * 100}%`;
      cheio.style.background = cor;
      const fundo = el('span', { class: 'hud-barra-fundo' }, cheio);
      fundo.style.width = `${e.largura * escala}px`;
      fundo.style.height = `${e.tamanho * escala}px`;
      fundo.style.borderWidth = `${Math.max(1, Math.round(escala))}px`;
      return caixa('hud-barra', [fundo]);
    }
  }
  if ((e.estilo === 'caixas' || e.estilo === 'icones') && p) {
    const total = Math.max(0, Math.min(200, Math.round(e.maximo || p.max || p.atual)));
    const cheias = Math.max(0, Math.min(total, Math.floor(p.atual)));
    const fila = el('span', { class: 'hud-fila' + (e.direcao === 'vertical' ? ' vertical' : '') });
    fila.style.gap = `${e.espaco * escala}px`;
    for (let i = 0; i < total; i++) {
      const cheia = i < cheias;
      if (e.estilo === 'caixas') {
        const im = cheia ? e.imagem : e.imagemVazia;
        if (im) { const x = img(im); x.style.width = `${e.largura * escala}px`; fila.append(x); continue; }
        const b = el('span', { class: 'hud-caixa' + (cheia ? '' : ' vazia') });
        b.style.width = `${e.largura * escala}px`;
        b.style.height = `${e.tamanho * escala}px`;
        if (cheia) b.style.background = cor;
        b.style.borderWidth = `${Math.max(1, Math.round(escala * 0.75))}px`;
        fila.append(b);
      } else {
        if (cheia) {
          if (e.imagem) fila.append(img(e.imagem));
          else { const b = el('span', { class: 'hud-icone-padrao' }); b.style.height = `${e.tamanho * escala}px`; b.style.width = `${Math.max(2, e.tamanho * 0.35) * escala}px`; b.style.background = cor; fila.append(b); }
        } else if (e.imagemVazia) fila.append(img(e.imagemVazia, ' vazia'));
        else if (!e.imagem) { const b = el('span', { class: 'hud-icone-padrao vazia' }); b.style.height = `${e.tamanho * escala}px`; b.style.width = `${Math.max(2, e.tamanho * 0.35) * escala}px`; fila.append(b); }
      }
    }
    return caixa('hud-imagens', [fila]);
  }
  if (e.estilo === 'imagem') {
    const im = faixa?.imagem || e.imagem;
    if (im) return caixa('hud-imagens', [img(im)]);
  }
  return caixa('', [el('strong', {}, valor)]);
}

/** Põe o elemento no lugar (âncora + distância) e reposiciona quando as imagens carregarem (largura muda). */
export function posicionarHud(d: HTMLElement, e: ElementoHud, escala: number, rw: number, rh: number) {
  const pos = () => {
    const w = d.offsetWidth / escala, h = d.offsetHeight / escala;
    const p = posicaoHud(e, w, h, rw, rh);
    d.style.left = `${p.x * escala}px`;
    d.style.top = `${p.y * escala}px`;
  };
  pos();
  requestAnimationFrame(pos);
  for (const im of d.querySelectorAll('img')) if (!im.complete) im.addEventListener('load', pos, { once: true });
}

/** Tela de morte: animação (toca uma vez e para no último quadro) ou texto, sobre a tela do jogo. */
export function telaMorte(m: TelaMorte, escala: number, url: (c: string) => string, previa = false): HTMLElement {
  const d = el('div', { class: 'hud-morte' + (previa ? ' previa' : '') });
  d.style.background = `rgba(0, 0, 0, ${m.escurecer})`;
  if (m.imagem) {
    const anim = el('div', { class: 'hud-morte-anim', role: 'img', 'aria-label': m.texto || 'Você morreu' });
    const im = new Image();
    im.onload = () => {
      const n = Math.max(1, m.quadros);
      const qw = im.naturalWidth / n, qh = im.naturalHeight;
      const h = m.tamanho * escala, w = (qw / qh) * h;
      Object.assign(anim.style, { width: `${w}px`, height: `${h}px`, backgroundImage: `url("${im.src}")`, backgroundSize: `${w * n}px ${h}px` });
      if (n > 1) anim.animate([{ backgroundPosition: '0 0' }, { backgroundPosition: `-${w * (n - 1)}px 0` }], { duration: ((n - 1) / m.fps) * 1000, easing: `steps(${n - 1}, jump-end)`, fill: 'forwards' });
      if (n > 1) setTimeout(() => { anim.style.backgroundPosition = `-${w * (n - 1)}px 0`; }, ((n - 1) / m.fps) * 1000);
    };
    im.src = url(m.imagem);
    d.append(anim);
    if (m.texto) { const s = el('span', { class: 'hud-morte-legenda' }, m.texto); s.style.fontSize = `${Math.max(10, 8 * escala)}px`; d.append(s); }
  } else {
    const s = el('strong', { class: 'hud-morte-texto' }, m.texto || 'VOCÊ MORREU');
    s.style.fontSize = `${Math.max(16, 24 * escala)}px`;
    d.append(s);
  }
  return d;
}
