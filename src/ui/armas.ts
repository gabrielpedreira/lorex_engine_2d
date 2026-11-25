// Ferramenta Armas (A): cada arma do jogo é um arquivo em jogo/armas/<nome>.json com pente, espaços no inventário,
// alcance, dano por distância (faixas do alcance), a linha do tiro (visível, pouco visível, invisível) e as imagens
// (HUD carregada/descarregada, cada bala, menu). O personagem escolhe qual usa (Personagens › Arma) e o HUD pode
// pegar as imagens da arma equipada. Cada arma também aparece no painel de Código com estes valores no bloco config.
import { armaPadrao, danoNaDistancia, normalizarArma, type ConfigArma } from '../core/inimigos';
import { nomeArquivoFase } from '../core/fase';
import type { Plataforma } from '../plataforma/plataforma';
import { el, pedirTexto } from './dom';
import { dica } from './legenda';

export interface AcoesArmas {
  imagens(): Promise<string[]>;
  garantir(caminhoRaiz: string, categoria: string): Promise<string>;
  url(caminhoJogo: string): string;
  /** Animações extras dos personagens jogadores (para tiro/recarga/sem bala). */
  animacoes(): Promise<string[]>;
}

export class EditorArmas {
  private raiz: HTMLElement;
  private arquivos: string[] = [];
  private armas = new Map<string, ConfigArma>();
  private sel: string | null = null;
  private listaImagens: string[] | null = null;
  private animacoes: string[] = [];
  private timerSalvar = 0;

  aoAvisar: (m: string) => void = () => {};
  /** Uma arma foi salva (o editor sincroniza o código e o personagem do teste). */
  aoSalvar: (arquivo: string) => void = () => {};
  aoAbrirCodigo: (arquivo: string) => void = () => {};

  constructor(private plat: Plataforma, private acoes: AcoesArmas) {
    this.raiz = el('div', { class: 'tela-personagens tela-armas', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Armas', tabindex: -1 });
    this.raiz.hidden = true;
    document.body.append(this.raiz);
    this.raiz.addEventListener('keydown', (e) => {
      e.stopPropagation();
      const digitando = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
      if (e.key === 'Escape' && !digitando) this.fechar();
    });
  }

  get aberta() { return !this.raiz.hidden; }

  async abrir(arquivo?: string) {
    await this.recarregar();
    this.animacoes = await this.acoes.animacoes().catch(() => []);
    this.listaImagens = null;
    this.sel = arquivo && this.armas.has(arquivo) ? arquivo : this.sel && this.armas.has(this.sel) ? this.sel : this.arquivos[0] ?? null;
    this.raiz.hidden = false;
    this.render();
    this.raiz.focus();
  }

  fechar() { this.salvarAgora(); this.raiz.hidden = true; }

  /** Relê jogo/armas (ex.: o script da arma mudou um valor). */
  async recarregar() {
    this.arquivos = await this.plat.listarDados('armas');
    this.armas.clear();
    for (const a of this.arquivos) {
      try { const c = normalizarArma(JSON.parse(await this.plat.lerDados('armas', a))); if (c) this.armas.set(a, c); } catch { /* ilegível */ }
    }
    if (this.aberta) this.render();
  }

  private atual() { return this.sel ? this.armas.get(this.sel) ?? null : null; }

  private mudou() { clearTimeout(this.timerSalvar); this.timerSalvar = window.setTimeout(() => this.salvarAgora(), 400); this.render(); }

  private salvarAgora() {
    clearTimeout(this.timerSalvar);
    const a = this.atual();
    if (!a || !this.sel) return;
    const arquivo = this.sel;
    void this.plat.salvarDados('armas', arquivo, JSON.stringify(a, null, 2)).then(() => this.aoSalvar(arquivo));
  }

  private async nova(base?: ConfigArma) {
    const nome = await pedirTexto(base ? 'Duplicar arma' : 'Nova arma', 'Nome da arma', base ? `${base.nome} 2` : 'Espingarda');
    if (!nome) return;
    let arquivo = nomeArquivoFase(nome);
    for (let i = 2; this.arquivos.includes(arquivo); i++) arquivo = nomeArquivoFase(`${nome} ${i}`);
    const a: ConfigArma = { ...(base ? structuredClone(base) : armaPadrao()), nome };
    delete a.script;
    await this.plat.salvarDados('armas', arquivo, JSON.stringify(a, null, 2));
    this.aoAvisar(`Arma criada: jogo/armas/${arquivo}`);
    await this.recarregar();
    this.sel = arquivo;
    this.render();
    this.aoSalvar(arquivo);
  }

  // ---------- Interface ----------
  private render() {
    const a = this.atual();
    const nova = el('button', { type: 'button', class: 'secundario' }, '+ Nova arma');
    dica(nova, 'Nova arma', 'Cria jogo/armas/<nome>.json com os valores de uma pistola, para você ajustar.');
    nova.addEventListener('click', () => void this.nova());
    const duplicar = el('button', { type: 'button', class: 'secundario' }, 'Duplicar');
    dica(duplicar, 'Duplicar', 'Cria uma arma nova a partir desta (ex.: pistola → pistola com silenciador).');
    duplicar.disabled = !a;
    duplicar.addEventListener('click', () => { if (a) void this.nova(a); });
    const codigo = el('button', { type: 'button', class: 'secundario' }, 'Código { }');
    dica(codigo, 'Código da arma', 'Abre esta arma no painel de Código: os mesmos valores no bloco config e o gancho aoCalcularDano para regras próprias.');
    codigo.disabled = !a;
    codigo.addEventListener('click', () => { if (this.sel) { this.salvarAgora(); this.aoAbrirCodigo(this.sel); } });
    const fechar = el('button', { type: 'button', class: 'primario' }, 'Fechar');
    dica(fechar, 'Fechar', 'As mudanças já ficam salvas em jogo/armas/.', 'Esc');
    fechar.addEventListener('click', () => this.fechar());

    const lista = el('section', { class: 'pers-col' }, el('h3', {}, 'Armas'));
    for (const arq of this.arquivos) {
      const x = this.armas.get(arq);
      if (!x) continue;
      const b = el('button', { type: 'button', class: 'pers-estado ok' + (arq === this.sel ? ' ativo' : '') },
        el('strong', {}, x.nome), el('span', {}, `${arq} · pente ${x.pente} · ${x.slots} espaço(s)`));
      dica(b, x.nome, `jogo/armas/${arq}`);
      b.addEventListener('click', () => { this.salvarAgora(); this.sel = arq; this.render(); });
      lista.append(b);
    }
    if (!this.arquivos.length) lista.append(el('p', { class: 'dica-campo' }, 'Nenhuma arma ainda. Clique em "+ Nova arma".'));
    lista.append(el('div', { class: 'secao acoes' }, nova, duplicar),
      el('p', { class: 'dica-campo' }, 'Quem usa qual arma: Personagens (K) › Arma. Cada arma aparece no painel de Código com estes valores no bloco config.'));

    this.raiz.replaceChildren(el('div', { class: 'pers-caixa' },
      el('header', { class: 'pers-topo' }, el('h2', {}, 'Armas'), el('span', { class: 'dica-campo' }, a && this.sel ? `jogo/armas/${this.sel}` : ''),
        el('div', { class: 'espaco' }), el('span', { class: 'dica-campo' }, 'Salvo automaticamente'), codigo, fechar),
      el('div', { class: 'pers-colunas' }, lista, a ? this.previa(a) : el('section', { class: 'pers-col pers-centro' }), a ? this.propriedades(a) : el('section', { class: 'pers-col pers-config' }))));
    if (!this.raiz.contains(document.activeElement)) this.raiz.focus();
  }

  /** Prévia: a linha do tiro com as faixas de dano por distância, e as imagens da arma. */
  private previa(a: ConfigArma) {
    const faixas = [...a.danoPorDistancia].sort((x, y) => x.ate - y.ate);
    const barra = el('div', { class: 'arma-alcance' });
    let ini = 0;
    faixas.forEach((f, i) => {
      const fim = Math.min(100, f.ate);
      if (fim <= ini) return;
      const seg = el('div', { class: `arma-faixa f${i % 4}` }, el('strong', {}, `dano ${f.dano}`), el('span', {}, `${Math.round((ini / 100) * a.alcance)}–${Math.round((fim / 100) * a.alcance)} px`));
      seg.style.left = `${ini}%`; seg.style.width = `${fim - ini}%`;
      dica(seg, `Dano ${f.dano}`, `Alvo entre ${ini}% e ${fim}% do alcance (${Math.round((ini / 100) * a.alcance)} a ${Math.round((fim / 100) * a.alcance)} px).`);
      barra.append(seg);
      ini = fim;
    });
    if (ini < 100) {
      const seg = el('div', { class: 'arma-faixa resto' }, el('strong', {}, `dano ${a.dano}`), el('span', {}, 'resto'));
      seg.style.left = `${ini}%`; seg.style.width = `${100 - ini}%`;
      barra.append(seg);
    }
    // Linha do tiro como fica no jogo
    const tiro = el('div', { class: 'arma-tiro' });
    const linha = el('div', { class: 'arma-linha' });
    linha.style.height = `${Math.max(1, a.linha.espessura * 2)}px`;
    linha.style.background = a.linha.cor;
    linha.style.opacity = String(a.linha.opacidade / 100);
    tiro.append(el('div', { class: 'arma-boca' }), linha, el('div', { class: 'arma-acerto' }));
    const img = (rotulo: string, c: string, texto: string) => {
      const caixa = el('div', { class: 'arma-img' }, c ? el('img', { src: this.acoes.url(c), alt: rotulo }) : el('span', { class: 'dica-campo' }, '—'), el('small', {}, rotulo));
      dica(caixa, rotulo, texto);
      return caixa;
    };
    const balas = el('div', { class: 'arma-balas' });
    for (let i = 0; i < Math.min(a.pente, 30); i++) balas.append(a.imagens.bala ? el('img', { src: this.acoes.url(a.imagens.bala), alt: '' }) : el('span', { class: 'hud-icone-padrao' }));
    return el('section', { class: 'pers-col pers-centro' },
      el('h3', {}, `Alcance: ${a.alcance} px`), barra,
      el('p', { class: 'dica-campo' }, `Exemplo: alvo a ${Math.round(a.alcance * 0.3)} px → dano ${danoNaDistancia(a, a.alcance * 0.3)}; a ${Math.round(a.alcance * 0.8)} px → dano ${danoNaDistancia(a, a.alcance * 0.8)}.`),
      el('h3', {}, `Linha do tiro: ${a.linha.opacidade}% visível`), tiro,
      el('h3', {}, 'Imagens'),
      el('div', { class: 'arma-imgs' },
        img('HUD carregada', a.imagens.hud, 'Aparece no HUD (elemento "Arma em uso" com "Usar as imagens da arma").'),
        img('HUD descarregada', a.imagens.hudVazia, 'No HUD quando o pente está vazio.'),
        img('Menu / inventário', a.imagens.menu, 'Para o menu e o inventário (ainda não criados).')),
      el('h3', {}, `Pente: ${a.pente} bala(s)`), balas);
  }

  private propriedades(a: ConfigArma) {
    const col = el('section', { class: 'pers-col pers-config' });
    const campo = (rotulo: string, input: HTMLElement, texto: string) => {
      const id = 'arma-' + rotulo.replace(/\W+/g, '');
      input.id = id;
      const lab = el('label', { for: id }, rotulo);
      dica(lab, rotulo, texto);
      return el('div', { class: 'campo largo' }, lab, input);
    };
    const numero = (v: number, aplicar: (v: number) => void, passo = 1, min = 0) => {
      const i = el('input', { type: 'number', value: Number(v.toFixed(3)), step: passo, min });
      i.addEventListener('change', () => { const n = Number(i.value); if (Number.isFinite(n)) { aplicar(Math.max(min, n)); this.mudou(); } });
      return i;
    };
    const textoAnim = (v: string, aplicar: (v: string) => void) => {
      const i = el('input', { type: 'text', value: v, list: 'arma-anims' });
      i.addEventListener('change', () => { aplicar(i.value.trim()); this.mudou(); });
      return i;
    };
    const nome = el('input', { type: 'text', value: a.nome });
    nome.addEventListener('change', () => { a.nome = nome.value.trim() || a.nome; this.mudou(); });
    const vis = el('input', { type: 'range', min: 0, max: 100, step: 5, value: a.linha.opacidade });
    const visTxt = el('output', {}, `${a.linha.opacidade}%`);
    vis.addEventListener('input', () => { visTxt.textContent = `${vis.value}%`; });
    vis.addEventListener('change', () => { a.linha.opacidade = Number(vis.value); this.mudou(); });
    const cor = el('input', { type: 'color', value: a.linha.cor });
    cor.addEventListener('change', () => { a.linha.cor = cor.value; this.mudou(); });

    col.append(
      el('h3', {}, 'Arma'),
      campo('Nome', nome, 'Nome mostrado no HUD (chave "arma") e no código (eu.nome).'),
      el('div', { class: 'linha2' },
        campo('Balas no pente', numero(a.pente, (v) => { a.pente = Math.max(1, Math.round(v)); }, 1, 1), 'Tiros antes de recarregar.'),
        campo('Espaços no inventário', numero(a.slots, (v) => { a.slots = Math.round(v); }), 'Quantos espaços a arma ocupa no inventário (usado quando o inventário com espaços existir).')),
      el('div', { class: 'linha2' },
        campo('Alcance (px)', numero(a.alcance, (v) => { a.alcance = Math.max(1, v); }, 10, 1), 'Até onde a linha do tiro vai (paredes param antes).'),
        campo('Altura do tiro', numero(a.alturaTiro, (v) => { a.alturaTiro = Math.min(1, v); }, 0.05), 'Fração da altura do corpo, a partir dos pés (0,6 ≈ peito).')));

    // Dano por distância
    const tDano = el('h3', {}, 'Dano por distância');
    dica(tDano, 'Dano por distância', 'O alcance é dividido em faixas: até X% do alcance o tiro tira Y de vida. Ex.: até 50% → 2, até 100% → 1 (de perto dói mais).');
    col.append(tDano);
    [...a.danoPorDistancia].sort((x, y) => x.ate - y.ate).forEach((f) => {
      const ate = el('input', { type: 'number', value: f.ate, step: 5, min: 0, max: 100, 'aria-label': 'Até (% do alcance)' });
      ate.addEventListener('change', () => { f.ate = Math.max(0, Math.min(100, Number(ate.value) || 0)); this.mudou(); });
      const dano = el('input', { type: 'number', value: f.dano, step: 0.5, min: 0, 'aria-label': 'Dano' });
      dano.addEventListener('change', () => { f.dano = Math.max(0, Number(dano.value) || 0); this.mudou(); });
      const tirar = el('button', { type: 'button', class: 'secundario', 'aria-label': 'Remover faixa' }, '×');
      dica(tirar, 'Remover faixa');
      tirar.addEventListener('click', () => { a.danoPorDistancia = a.danoPorDistancia.filter((x) => x !== f); this.mudou(); });
      col.append(el('div', { class: 'arma-faixa-linha' }, el('span', {}, 'até'), ate, el('span', { class: 'arma-faixa-px' }, `% (${Math.round((f.ate / 100) * a.alcance)} px) → dano`), dano, tirar));
    });
    const mais = el('button', { type: 'button', class: 'secundario largo' }, '+ Faixa de dano');
    dica(mais, 'Nova faixa', 'Divide o alcance em mais uma parte com dano próprio.');
    mais.addEventListener('click', () => { const maior = Math.max(0, ...a.danoPorDistancia.map((f) => f.ate)); a.danoPorDistancia.push({ ate: Math.min(100, maior + 25), dano: 1 }); this.mudou(); });
    col.append(mais, campo('Dano além das faixas', numero(a.dano, (v) => { a.dano = v; }, 0.5), 'Usado quando nenhuma faixa cobre a distância.'));

    // Linha do tiro
    col.append(el('h3', {}, 'Linha do tiro'),
      el('div', { class: 'deslizante' }, (() => { const l = el('label', { for: 'arma-vis' }, 'Visibilidade'); dica(l, 'Visibilidade da linha', 'Opacidade da linha do tiro em %: 0 = invisível (só o clarão na boca e o acerto), 30 ≈ pouco visível, 100 = bem marcada. A regra que desenha fica no código do jogo: Código › Sistema do jogo › sistema.armas.js.'); vis.id = 'arma-vis'; return l; })(), vis, visTxt),
      el('div', { class: 'linha2' },
        campo('Cor', cor, 'Cor da linha.'),
        campo('Espessura', numero(a.linha.espessura, (v) => { a.linha.espessura = Math.max(0.5, v); }, 0.5, 0.5), 'Em px do jogo.')),
      campo('Duração (s)', numero(a.linha.duracao, (v) => { a.linha.duracao = Math.max(0.01, v); }, 0.01, 0.01), 'Quanto tempo a linha fica na tela.'));

    // Imagens
    col.append(el('h3', {}, 'Imagens'),
      this.campoImagem('HUD carregada', a.imagens.hud, (v) => { a.imagens.hud = v; }, 'A arma no HUD.'),
      this.campoImagem('HUD descarregada', a.imagens.hudVazia, (v) => { a.imagens.hudVazia = v; }, 'A arma no HUD com o pente vazio (sem imagem: usa a carregada).'),
      this.campoImagem('Bala', a.imagens.bala, (v) => { a.imagens.bala = v; }, 'Cada bala no HUD (elemento "Munição bala a bala" com "Usar as imagens da arma").'),
      this.campoImagem('Menu / inventário', a.imagens.menu, (v) => { a.imagens.menu = v; }, 'Para o menu e o inventário (quando existirem).'));

    // Animações do personagem
    col.append(el('h3', {}, 'Animações do personagem'),
      el('datalist', { id: 'arma-anims' }, ...this.animacoes.map((x) => el('option', { value: x }))),
      el('div', { class: 'linha2' },
        campo('Atirar', textoAnim(a.acaoTiro, (v) => { a.acaoTiro = v; }), 'Ação/animação do personagem que atira (ex.: tiro). A tecla vem da ferramenta Controles.'),
        campo('Recarregar', textoAnim(a.acaoRecarga, (v) => { a.acaoRecarga = v; }), 'Ação que recarrega; o pente enche quando a animação termina.')),
      campo('Sem bala', textoAnim(a.animacaoSemBala, (v) => { a.animacaoSemBala = v; }), 'Animação ao tentar atirar com o pente vazio.'));
    return col;
  }

  private campoImagem(rotulo: string, valor: string, aplicar: (v: string) => void, texto: string) {
    const sel = el('select', {}, el('option', { value: '' }, 'Nenhuma'), ...(valor ? [el('option', { value: 'jogo/' + valor }, valor.split('/').pop()!)] : []));
    sel.value = valor ? 'jogo/' + valor : '';
    const preencher = async () => {
      if (sel.dataset.cheio) return;
      sel.dataset.cheio = '1';
      if (!this.listaImagens) {
        const todas = await this.acoes.imagens();
        const pri = (x: string) => /(^|\/)(hud|armas?)\//i.test(x);
        this.listaImagens = [...todas.filter(pri), ...todas.filter((x) => !pri(x))];
      }
      const atual = sel.value;
      sel.replaceChildren(el('option', { value: '' }, 'Nenhuma'), ...this.listaImagens.map((c) => el('option', { value: c }, c)));
      if (atual && !this.listaImagens.includes(atual)) sel.append(el('option', { value: atual }, atual));
      sel.value = atual;
    };
    sel.addEventListener('focus', () => void preencher());
    sel.addEventListener('pointerdown', () => void preencher());
    sel.addEventListener('change', async () => {
      const v = sel.value;
      aplicar(!v ? '' : v.startsWith('jogo/') ? v.slice(5) : await this.acoes.garantir(v, 'armas'));
      this.mudou();
    });
    const id = 'arma-img-' + rotulo.replace(/\W+/g, '');
    sel.id = id;
    const lab = el('label', { for: id }, rotulo);
    dica(lab, rotulo, texto);
    const mini = el('span', { class: 'hud-mini' });
    if (valor) mini.append(el('img', { src: this.acoes.url(valor), alt: '' }));
    return el('div', { class: 'campo largo hud-campo-imagem' }, lab, sel, mini);
  }
}
