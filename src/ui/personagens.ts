// Editor de Personagens: monta um personagem animado a partir de spritesheets (parado, andando, pulando…),
// marca os pés e a caixa de colisão, e escolhe qual personagem o ▶ Testar usa.
import {
  ESTADOS, ancoraPes, animacaoPara, normalizarPersonagem, palpiteEstado, palpiteFolha, personagemNovo, quadroEm, retanguloQuadro,
  type Animacao, type EstadoAnim, type Personagem,
} from '../core/personagem';
import { nomeArquivoFase, nomeDoArquivo } from '../core/fase';
import type { Plataforma } from '../plataforma/plataforma';
import { urlAsset } from '../plataforma/plataforma';
import { el, pedirTexto, perguntar } from './dom';
import { dica } from './legenda';

/** Carrega uma imagem como bitmap (permite ler os pixels). */
async function carregarBitmap(url: string): Promise<ImageBitmap> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`não consegui abrir ${url}`);
  return createImageBitmap(await r.blob());
}

/** Caixa dos pixels não transparentes, somando todos os quadros. */
function caixaVisivel(img: ImageBitmap, anim: Animacao) {
  const c = new OffscreenCanvas(anim.larguraQuadro, anim.alturaQuadro);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let i = 0; i < anim.quadros; i++) {
    const r = retanguloQuadro(anim, img.width, i);
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    const d = g.getImageData(0, 0, r.w, r.h).data;
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      if (d[(y * r.w + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Conta os desenhos da folha pelas colunas transparentes entre eles. Se a contagem dividir a largura
 * exatamente, esses são os quadros (funciona com quadros não quadrados, ex.: 24×32).
 */
function quadrosPorColunas(img: ImageBitmap): { quadros: number; larguraQuadro: number } | null {
  const c = new OffscreenCanvas(img.width, img.height);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, img.width, img.height).data;
  const cheia = (x: number) => { for (let y = 0; y < img.height; y++) if (d[(y * img.width + x) * 4 + 3] > 20) return true; return false; };
  let blocos = 0, dentro = false;
  for (let x = 0; x < img.width; x++) {
    const ch = cheia(x);
    if (ch && !dentro) blocos++;
    dentro = ch;
  }
  if (blocos < 1 || img.width % blocos !== 0) return null;
  return { quadros: blocos, larguraQuadro: img.width / blocos };
}

export class EditorPersonagens {
  private raiz: HTMLElement;
  private p: Personagem = personagemNovo('Personagem');
  private arquivo: string | null = null;
  private sujo = false;
  private estadoSel: EstadoAnim = 'parado';
  private imagens = new Map<string, ImageBitmap>();
  private tocando = true;
  private quadroManual = 0;
  private inicioAnim = performance.now();
  private zoom = 3;
  private marcandoPes = false;
  private canvas!: HTMLCanvasElement;
  private raf = 0;
  private assets: string[] = [];
  private personagemTeste = '';

  /** Avisos na barra de status do editor. */
  aoAvisar: (msg: string) => void = () => {};
  /** O personagem usado no ▶ Testar mudou. */
  aoDefinirTeste: (arquivo: string) => void = () => {};

  constructor(private plat: Plataforma) {
    this.raiz = el('div', { class: 'tela-personagens', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Personagens' });
    this.raiz.hidden = true;
    document.body.append(this.raiz);
    this.raiz.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) { if (this.marcandoPes) { this.marcandoPes = false; this.render(); } else void this.fechar(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void this.salvar(); }
    });
  }

  get aberta() { return !this.raiz.hidden; }

  async abrir(assets: string[], personagemTeste: string) {
    this.assets = assets;
    this.personagemTeste = personagemTeste;
    this.raiz.hidden = false;
    const lista = await this.plat.listarDados('personagens');
    if (!this.arquivo && lista.length) await this.carregar(personagemTeste && lista.includes(personagemTeste) ? personagemTeste : lista[0]);
    else await this.render();
    this.animar();
  }

  async fechar() {
    if (this.sujo) {
      const r = await perguntar('Personagem não salvo', `"${this.p.nome}" tem alterações não salvas.`, ['Cancelar', 'Descartar', 'Salvar']);
      if (r === 0 || r === -1) return;
      if (r === 2 && !(await this.salvar())) return;
      if (r === 1) { this.sujo = false; if (this.arquivo) await this.carregar(this.arquivo); }
    }
    cancelAnimationFrame(this.raf);
    this.raiz.hidden = true;
  }

  /** Recarrega se o arquivo aberto mudou por fora (ex.: o Claude editou). */
  async mudouPorFora(nome: string) {
    if (!this.aberta || nome !== this.arquivo) return;
    if (this.sujo) { this.aoAvisar(`O personagem ${nome} foi alterado por fora; salve ou descarte as suas alterações para ver a outra versão.`); return; }
    await this.carregar(nome);
    this.aoAvisar(`Personagem ${nome} atualizado por fora.`);
  }

  private async carregar(arquivo: string) {
    try {
      this.p = normalizarPersonagem(JSON.parse(await this.plat.lerDados('personagens', arquivo)));
      this.arquivo = arquivo;
      this.sujo = false;
      this.estadoSel = 'parado';
      await this.carregarImagens();
    } catch (err) {
      this.aoAvisar(`Não consegui abrir o personagem ${arquivo}: ${String(err)}`);
    }
    await this.render();
  }

  private async carregarImagens() {
    for (const a of Object.values(this.p.animacoes)) {
      if (!a || this.imagens.has(a.folha)) continue;
      try { this.imagens.set(a.folha, await carregarBitmap(urlAsset(this.plat, a.folha))); } catch { /* imagem sumiu: mostra vazio */ }
    }
  }

  private mudou() {
    this.sujo = true;
    void this.render();
  }

  private async salvar(): Promise<boolean> {
    if (!this.p.animacoes.parado) { this.aoAvisar('Escolha pelo menos a animação Parado antes de salvar.'); return false; }
    if (!this.arquivo) {
      const existentes = new Set(await this.plat.listarDados('personagens'));
      const base = nomeArquivoFase(this.p.nome).replace(/\.json$/, '');
      let nome = base + '.json';
      for (let i = 2; existentes.has(nome); i++) nome = `${base}_${i}.json`;
      this.arquivo = nome;
    }
    await this.plat.salvarDados('personagens', this.arquivo, JSON.stringify(this.p, null, 2));
    this.sujo = false;
    this.aoAvisar(`Personagem salvo em jogo/personagens/${this.arquivo}`);
    if (!this.personagemTeste) this.usarNoTeste();
    await this.render();
    return true;
  }

  private usarNoTeste() {
    if (!this.arquivo) return;
    this.personagemTeste = this.arquivo;
    this.aoDefinirTeste(this.arquivo);
    this.aoAvisar(`"${this.p.nome}" será o jogador no ▶ Testar.`);
  }

  // ---------- Interface ----------

  private async render() {
    const lista = await this.plat.listarDados('personagens');
    const seletor = el('select', { 'aria-label': 'Personagem' },
      ...(this.arquivo ? [] : [el('option', { value: '' }, `${this.p.nome} (novo)`)]),
      ...lista.map((f) => el('option', { value: f }, f)));
    seletor.value = this.arquivo ?? '';
    seletor.addEventListener('change', async () => {
      if (this.sujo && (await perguntar('Personagem não salvo', 'Trocar de personagem descarta as alterações não salvas.', ['Cancelar', 'Trocar'])) !== 1) { seletor.value = this.arquivo ?? ''; return; }
      if (seletor.value) await this.carregar(seletor.value);
    });
    dica(seletor, 'Personagem', 'Personagens salvos em jogo/personagens/. Cada um junta várias animações (parado, andando, pulando…).');

    const novo = el('button', { type: 'button', class: 'secundario' }, 'Novo');
    dica(novo, 'Novo personagem', 'Começa um personagem do zero (ex.: Lorena, Nicolas, zumbi).');
    novo.addEventListener('click', async () => {
      const nome = await pedirTexto('Novo personagem', 'Nome do personagem', 'Lorena');
      if (!nome) return;
      this.p = personagemNovo(nome); this.arquivo = null; this.sujo = true; this.estadoSel = 'parado';
      await this.render();
    });
    const salvar = el('button', { type: 'button', class: 'primario' }, 'Salvar');
    dica(salvar, 'Salvar personagem', 'Grava em jogo/personagens/. As folhas usadas são copiadas para jogo/assets/personagens/.', 'Ctrl+S');
    salvar.addEventListener('click', () => void this.salvar());
    const ehTeste = !!this.arquivo && this.arquivo === this.personagemTeste;
    const teste = el('button', { type: 'button', class: 'secundario' + (ehTeste ? ' ligado' : '') }, ehTeste ? '✓ Jogador do ▶ Testar' : 'Usar no ▶ Testar');
    dica(teste, 'Usar no ▶ Testar', 'Este personagem passa a ser o jogador quando você testa a fase (F5), no lugar do retângulo provisório.');
    teste.disabled = !this.arquivo;
    teste.addEventListener('click', () => { this.usarNoTeste(); void this.render(); });
    const fechar = el('button', { type: 'button', class: 'secundario' }, 'Fechar');
    dica(fechar, 'Fechar', 'Volta ao editor de fases.', 'Esc');
    fechar.addEventListener('click', () => void this.fechar());

    const topo = el('header', { class: 'pers-topo' },
      el('h2', {}, 'Personagens'), seletor, novo,
      el('span', { class: 'sujo' }, this.sujo ? '● não salvo' : ''),
      el('div', { class: 'espaco' }), teste, salvar, fechar);

    this.canvas = el('canvas', { class: 'pers-previa', width: 560, height: 420 });
    this.canvas.addEventListener('click', (e) => this.cliqueNaPrevia(e));
    dica(this.canvas, 'Prévia', 'Mostra a animação escolhida. A cruz verde marca os pés e o retângulo lima é a caixa de colisão do corpo.');

    this.raiz.replaceChildren(el('div', { class: 'pers-caixa' }, topo,
      el('div', { class: 'pers-colunas' }, this.colunaEstados(), this.colunaPrevia(), this.colunaConfig())));
  }

  private colunaEstados() {
    const col = el('section', { class: 'pers-col' }, el('h3', {}, 'Animações'));
    for (const e of ESTADOS) {
      const a = this.p.animacoes[e.id];
      const sub = !a ? animacaoPara(this.p, e.id) : null;
      const info = a ? `${a.quadros} quadros · ${a.fps} fps${a.repetir ? '' : ' · uma vez'}` : sub ? `usa ${ESTADOS.find((x) => x.id === sub.estado)?.nome}` : 'vazia';
      const b = el('button', { type: 'button', class: 'pers-estado' + (e.id === this.estadoSel ? ' ativo' : '') + (a ? ' ok' : '') },
        el('strong', {}, e.nome + (e.obrigatorio ? ' *' : '')), el('span', {}, info));
      dica(b, e.nome, e.texto);
      b.addEventListener('click', () => { this.estadoSel = e.id; this.quadroManual = 0; this.inicioAnim = performance.now(); void this.render(); });
      col.append(b);
    }
    col.append(el('p', { class: 'dica-campo' }, '* obrigatória. As que faltarem usam outra no lugar (indicado ao lado).'));
    return col;
  }

  private colunaPrevia() {
    const a = this.p.animacoes[this.estadoSel];
    const play = el('button', { type: 'button', class: 'secundario' }, this.tocando ? 'Pausar' : 'Tocar');
    dica(play, this.tocando ? 'Pausar' : 'Tocar', 'Pausado, use o controle ao lado para ver quadro a quadro.');
    play.addEventListener('click', () => { this.tocando = !this.tocando; this.inicioAnim = performance.now(); void this.render(); });
    const quadro = el('input', { type: 'range', min: 0, max: Math.max(0, (a?.quadros ?? 1) - 1), step: 1, value: this.quadroManual, 'aria-label': 'Quadro' });
    quadro.addEventListener('input', () => { this.tocando = false; this.quadroManual = Number(quadro.value); });
    const zoom = el('select', { 'aria-label': 'Zoom da prévia' }, ...[1, 2, 3, 4, 6].map((z) => el('option', { value: z }, `${z}×`)));
    zoom.value = String(this.zoom);
    zoom.addEventListener('change', () => { this.zoom = Number(zoom.value); });
    dica(zoom, 'Zoom da prévia', 'Só muda a visualização aqui; não altera o personagem.');
    const pes = el('button', { type: 'button', class: 'secundario' + (this.marcandoPes ? ' ligado' : '') }, this.marcandoPes ? 'Clique nos pés…' : 'Marcar pés');
    dica(pes, 'Marcar os pés', 'Clique e depois clique na prévia, no ponto entre os pés da personagem (onde ela "pisa"). Esc cancela.');
    pes.addEventListener('click', () => { this.marcandoPes = !this.marcandoPes; void this.render(); });
    return el('section', { class: 'pers-col pers-centro' }, this.canvas,
      el('div', { class: 'pers-controles' }, play, quadro, zoom, pes),
      a ? el('p', { class: 'dica-campo' }, `${nomeDoArquivo(a.folha)} · quadro ${a.larguraQuadro}×${a.alturaQuadro} px`) : el('p', { class: 'dica-campo' }, 'Escolha uma folha (spritesheet) para esta animação no painel à direita.'));
  }

  private num(rotulo: string, valor: number, aplicar: (v: number) => void, texto: string, passo = 1, min = 0) {
    const id = 'pp-' + rotulo.replace(/\W+/g, '');
    const input = el('input', { type: 'number', id, value: Number(valor.toFixed(3)), step: passo, min });
    input.addEventListener('change', () => { const v = Number(input.value); if (Number.isFinite(v)) { aplicar(Math.max(min, v)); this.mudou(); } });
    const lab = el('label', { for: id }, rotulo);
    dica(lab, rotulo, texto);
    return el('div', { class: 'campo largo' }, lab, input);
  }

  private colunaConfig() {
    const col = el('section', { class: 'pers-col pers-config' });
    const nomeEstado = ESTADOS.find((e) => e.id === this.estadoSel)!.nome;
    const a = this.p.animacoes[this.estadoSel];

    // Folha (spritesheet) desta animação
    const imagens = this.assets.filter((x) => /\.(png|jpe?g)$/i.test(x));
    const folha = el('input', { type: 'text', id: 'pp-folha', list: 'pp-folhas', placeholder: 'Digite para buscar (ex.: lorena idle)', value: a?.origem ?? (a ? 'jogo/' + a.folha : '') });
    const lista = el('datalist', { id: 'pp-folhas' }, ...imagens.sort((x, y) => Number(/spritesheet/i.test(y)) - Number(/spritesheet/i.test(x))).map((x) => el('option', { value: x })));
    folha.addEventListener('change', () => void this.escolherFolha(folha.value.trim()));
    const labFolha = el('label', { for: 'pp-folha' }, 'Folha (spritesheet)');
    dica(labFolha, 'Folha', 'A imagem com todos os quadros lado a lado. Ao escolher, a engine adivinha o tamanho do quadro (quadrado) e o FPS pelo nome (ex.: _8fps).');

    col.append(el('h3', {}, `Animação: ${nomeEstado}`), el('div', { class: 'campo largo' }, labFolha, folha, lista));

    if (a) {
      const img = this.imagens.get(a.folha);
      if (img && img.width % a.larguraQuadro !== 0) col.append(el('p', { class: 'aviso-texto' }, `A largura da folha (${img.width} px) não é múltipla da largura do quadro: confira.`));
      const repetir = el('input', { type: 'checkbox' });
      repetir.checked = a.repetir;
      repetir.addEventListener('change', () => { a.repetir = repetir.checked; this.mudou(); });
      const remover = el('button', { type: 'button', class: 'perigo' }, 'Remover animação');
      remover.addEventListener('click', () => { delete this.p.animacoes[this.estadoSel]; this.mudou(); });
      col.append(
        el('div', { class: 'linha2' },
          this.num('Largura do quadro', a.larguraQuadro, (v) => { a.larguraQuadro = Math.max(1, Math.round(v)); }, 'Largura de cada quadro na folha, em px.'),
          this.num('Altura do quadro', a.alturaQuadro, (v) => { a.alturaQuadro = Math.max(1, Math.round(v)); }, 'Altura de cada quadro na folha, em px.')),
        el('div', { class: 'linha2' },
          this.num('Quadros', a.quadros, (v) => { a.quadros = Math.max(1, Math.round(v)); }, 'Quantos quadros a animação tem (da esquerda para a direita).', 1, 1),
          this.num('FPS', a.fps, (v) => { a.fps = Math.max(0.5, v); }, 'Quadros por segundo: quanto maior, mais rápida.', 1, 0.5)),
        el('div', { class: 'linha2' },
          this.num('Escala da animação', a.escala, (v) => { a.escala = Math.max(0.01, v); }, 'Só para esta animação: use 0,25 se a folha foi desenhada 4× maior que as outras.', 0.05, 0.01),
          el('label', { class: 'check' }, repetir, 'Repetir')),
        el('div', { class: 'secao acoes' }, remover));
    }

    // Personagem (vale para todas as animações)
    const nome = el('input', { type: 'text', id: 'pp-nome', value: this.p.nome });
    nome.addEventListener('change', () => { if (nome.value.trim()) { this.p.nome = nome.value.trim(); this.mudou(); } });
    const olha = el('input', { type: 'checkbox' });
    olha.checked = this.p.olhaDireita;
    olha.addEventListener('change', () => { this.p.olhaDireita = olha.checked; this.mudou(); });
    const detectar = el('button', { type: 'button', class: 'secundario largo' }, 'Detectar pés e caixa automaticamente');
    dica(detectar, 'Detectar automaticamente', 'Analisa os pixels da animação Parado: os pés ficam no centro de baixo do desenho, e a caixa de colisão cobre o corpo.');
    detectar.addEventListener('click', () => void this.detectar());
    col.append(
      el('h3', {}, 'Personagem'),
      el('div', { class: 'campo largo' }, el('label', { for: 'pp-nome' }, 'Nome'), nome),
      el('div', { class: 'linha2' },
        this.num('Escala', this.p.escala, (v) => { this.p.escala = Math.max(0.05, v); }, 'Tamanho do desenho no jogo (1 = tamanho real da folha). A caixa de colisão já é medida nesta escala.', 0.05, 0.05),
        el('label', { class: 'check', title: 'Desenho original olha para a direita' }, olha, 'Olha para a direita')),
      el('div', { class: 'linha2' },
        this.num('Pés X', this.p.pes[0], (v) => { this.p.pes = [Math.round(v), this.p.pes[1]]; }, 'Posição dos pés dentro do quadro (px).'),
        this.num('Pés Y', this.p.pes[1], (v) => { this.p.pes = [this.p.pes[0], Math.round(v)]; }, 'Normalmente a base do desenho (altura do quadro).')),
      el('div', { class: 'linha2' },
        this.num('Caixa largura', this.p.caixa.largura, (v) => { this.p.caixa.largura = Math.max(2, Math.round(v)); }, 'Largura do corpo para colisão (mais estreita que o desenho fica mais natural).', 1, 2),
        this.num('Caixa altura', this.p.caixa.altura, (v) => { this.p.caixa.altura = Math.max(2, Math.round(v)); }, 'Altura do corpo para colisão.', 1, 2)),
      detectar);
    return col;
  }

  private async escolherFolha(caminho: string) {
    if (!caminho) return;
    try {
      const pasta = 'personagens/' + nomeArquivoFase(this.p.nome).replace(/\.json$/, '');
      const folha = await this.plat.garantirEmUso(caminho, pasta);
      const img = await carregarBitmap(urlAsset(this.plat, folha));
      this.imagens.set(folha, img);
      const g = palpiteFolha(nomeDoArquivo(caminho), img.width, img.height);
      // Desenhos que se encostam só DIMINUEM a contagem por espaços; então vale a maior contagem exata
      const pelosEspacos = quadrosPorColunas(img);
      const quadradoExato = img.width % img.height === 0;
      if (pelosEspacos && (!quadradoExato || pelosEspacos.quadros > g.quadros)) {
        g.quadros = pelosEspacos.quadros; g.larguraQuadro = pelosEspacos.larguraQuadro; g.exato = true;
      }
      this.p.animacoes[this.estadoSel] = { folha, origem: caminho, larguraQuadro: g.larguraQuadro, alturaQuadro: g.alturaQuadro, quadros: g.quadros, fps: g.fps, repetir: !['aterrissando', 'dano', 'morte'].includes(this.estadoSel), escala: 1 };
      // Primeira animação: já detecta pés e caixa
      if (this.estadoSel === 'parado' || Object.keys(this.p.animacoes).length === 1) await this.detectar(true);
      const sugestao = palpiteEstado(nomeDoArquivo(caminho));
      this.aoAvisar(`Folha carregada: ${g.quadros} quadros de ${g.larguraQuadro}×${g.alturaQuadro} px a ${g.fps} fps${g.exato ? '' : ' (confira a largura do quadro)'}.`
        + (sugestao && sugestao !== this.estadoSel ? ` Pelo nome, parece ser "${ESTADOS.find((e) => e.id === sugestao)?.nome}".` : ''));
      this.quadroManual = 0; this.inicioAnim = performance.now();
      this.mudou();
    } catch (err) {
      this.aoAvisar(`Não consegui usar essa imagem: ${String(err)}`);
    }
  }

  private async detectar(silencioso = false) {
    const ref = animacaoPara(this.p, 'parado');
    const img = ref ? this.imagens.get(ref.anim.folha) : undefined;
    if (!ref || !img) { if (!silencioso) this.aoAvisar('Escolha a folha da animação Parado primeiro.'); return; }
    const c = caixaVisivel(img, ref.anim);
    if (!c) return;
    const esc = ref.anim.escala;
    this.p.pes = [Math.round(c.x + c.w / 2), c.y + c.h];
    // Corpo: mais estreito que o desenho (braços e arma não contam), mas nunca mais fino que ~1/3 da altura
    const larguraCorpo = Math.min(c.w, c.h * 0.4) * 0.85;
    this.p.caixa = { largura: Math.max(4, Math.round(larguraCorpo * esc * this.p.escala)), altura: Math.max(4, Math.round(c.h * 0.95 * esc * this.p.escala)) };
    if (!silencioso) { this.aoAvisar(`Pés em (${this.p.pes[0]}, ${this.p.pes[1]}); caixa ${this.p.caixa.largura}×${this.p.caixa.altura} px.`); this.mudou(); }
  }

  private cliqueNaPrevia(e: MouseEvent) {
    if (!this.marcandoPes) return;
    const a = animacaoPara(this.p, this.estadoSel)?.anim;
    if (!a) return;
    const r = this.canvas.getBoundingClientRect();
    const escTela = this.zoom * a.escala * this.p.escala;
    const ox = this.canvas.width / 2 - (a.larguraQuadro * escTela) / 2;
    const oy = this.canvas.height - 40 - a.alturaQuadro * escTela;
    const x = ((e.clientX - r.left) * (this.canvas.width / r.width) - ox) / escTela;
    const y = ((e.clientY - r.top) * (this.canvas.height / r.height) - oy) / escTela;
    // Os pés são guardados em px do quadro da animação Parado
    const ref = animacaoPara(this.p, 'parado')?.anim ?? a;
    this.p.pes = [Math.round((x / a.larguraQuadro) * ref.larguraQuadro), Math.round((y / a.alturaQuadro) * ref.alturaQuadro)];
    this.marcandoPes = false;
    this.mudou();
  }

  // ---------- Prévia animada ----------
  private animar() {
    cancelAnimationFrame(this.raf);
    const passo = () => {
      if (!this.aberta) return;
      this.desenharPrevia();
      this.raf = requestAnimationFrame(passo);
    };
    passo();
  }

  private desenharPrevia() {
    const cv = this.canvas;
    if (!cv) return;
    const g = cv.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    // Fundo quadriculado
    for (let y = 0; y < cv.height; y += 16) for (let x = 0; x < cv.width; x += 16) {
      g.fillStyle = ((x + y) / 16) % 2 ? '#1e2725' : '#25302d';
      g.fillRect(x, y, 16, 16);
    }
    const r = animacaoPara(this.p, this.estadoSel);
    const img = r ? this.imagens.get(r.anim.folha) : undefined;
    if (!r || !img) {
      g.fillStyle = '#8ea59d'; g.font = '14px Segoe UI, sans-serif'; g.textAlign = 'center';
      g.fillText('Sem folha para esta animação', cv.width / 2, cv.height / 2);
      return;
    }
    const a = r.anim;
    const i = this.tocando ? quadroEm(a, (performance.now() - this.inicioAnim) / 1000) : Math.min(this.quadroManual, a.quadros - 1);
    const q = retanguloQuadro(a, img.width, i);
    const esc = this.zoom * a.escala * this.p.escala;
    const ox = Math.round(cv.width / 2 - (a.larguraQuadro * esc) / 2);
    const oy = Math.round(cv.height - 40 - a.alturaQuadro * esc);
    // Chão
    const chaoY = oy + ancoraPes(this.p).ay * a.alturaQuadro * esc;
    g.fillStyle = 'rgba(167,221,62,0.12)'; g.fillRect(0, chaoY, cv.width, cv.height - chaoY);
    g.strokeStyle = 'rgba(167,221,62,0.5)'; g.beginPath(); g.moveTo(0, chaoY + 0.5); g.lineTo(cv.width, chaoY + 0.5); g.stroke();
    // Quadro
    g.strokeStyle = 'rgba(255,255,255,0.15)'; g.strokeRect(ox + 0.5, oy + 0.5, a.larguraQuadro * esc, a.alturaQuadro * esc);
    g.drawImage(img, q.x, q.y, q.w, q.h, ox, oy, q.w * esc, q.h * esc);
    // Caixa de colisão (em px do jogo → converter para o quadro)
    const anc = ancoraPes(this.p);
    const pesX = ox + anc.ax * a.larguraQuadro * esc, pesY = oy + anc.ay * a.alturaQuadro * esc;
    const fator = this.zoom; // a caixa já está na escala do jogo
    g.strokeStyle = '#a7dd3e'; g.lineWidth = 1.5;
    g.strokeRect(Math.round(pesX - (this.p.caixa.largura * fator) / 2) + 0.5, Math.round(pesY - this.p.caixa.altura * fator) + 0.5, this.p.caixa.largura * fator, this.p.caixa.altura * fator);
    g.lineWidth = 1;
    // Pés
    g.strokeStyle = '#65da67'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(pesX - 8, pesY); g.lineTo(pesX + 8, pesY); g.moveTo(pesX, pesY - 8); g.lineTo(pesX, pesY + 8); g.stroke();
    g.lineWidth = 1;
    g.fillStyle = '#dbe7e2'; g.font = '12px Segoe UI, sans-serif'; g.textAlign = 'left';
    g.fillText(`quadro ${i + 1}/${a.quadros}${r.estado !== this.estadoSel ? `  (usando "${ESTADOS.find((e) => e.id === r.estado)?.nome}")` : ''}`, 10, 18);
    if (this.marcandoPes) { g.fillStyle = '#f89715'; g.fillText('Clique no ponto dos pés', 10, 36); }
  }
}
