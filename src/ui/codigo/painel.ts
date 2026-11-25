// Painel de Código (estilo VS Code): à esquerda, tudo o que existe no projeto e pode ter código (o jogo, a fase,
// cada objeto, cada personagem…); à direita, o editor (Monaco) com abas; embaixo, a Saída (logs e erros do teste).
//
// O que aparece no explorador vem de "fontes" registradas pelo editor (main.ts). Módulos novos (menus, HUD,
// inimigos…) registram a fonte deles e o painel passa a mostrá-los, sem mexer aqui.
import { GANCHOS, modeloScript, paramsDe, slugScript, type DonoScript } from '../../core/scripts';
import { SISTEMAS, modeloModulo } from '../../core/sistemaPadrao';
import { LOG, type LinhaLog } from '../../core/log';
import type { Plataforma } from '../../plataforma/plataforma';
import { el, pedirTexto, perguntar } from '../dom';
import { dica } from '../legenda';
import { icone } from '../icones';
import { divisor } from '../divisor';

export interface ElementoCodigo {
  /** Chave única no explorador (ex.: "obj:fase_01.json:obj_003"). */
  chave: string;
  grupo: string;
  nome: string;
  detalhe?: string;
  /** Tipo de dono (decide os ganchos e o modelo). */
  dono: DonoScript;
  /** Script ligado (arquivo em jogo/scripts/), ou null. */
  arquivo: string | null;
  /** Arquivo que será criado se ainda não houver. */
  arquivoNovo: string;
  /** Liga o arquivo ao dono (grava no JSON da fase/personagem). Ausente = o nome do arquivo já basta (jogo.js). */
  ligar?: (arquivo: string) => Promise<boolean>;
  /** Quantos outros elementos usam o mesmo arquivo. */
  compartilhado?: number;
  /** Texto do script novo (ex.: o comportamento pronto escrito em código). Sem ele, o modelo genérico. */
  modelo?: string;
  /** Comportamento que já funciona sem script (explicado no painel antes de criar). */
  pronto?: string;
}

export type FonteCodigo = () => Promise<ElementoCodigo[]>;

/** A Saída do painel mostra só o que é de código: logs, ganchos e erros. */
const linhasSaida = (): LinhaLog[] => LOG.linhas.filter((l) => l.cat === 'codigo' || l.cat === 'erro');

interface Aba {
  arquivo: string; modelo: import('monaco-editor').editor.ITextModel; salvo: number; titulo: string; dono: DonoScript;
  /** Rascunho: o script ainda não existe no disco; o primeiro Ctrl+S cria o arquivo e liga ao dono. */
  novo?: ElementoCodigo;
}

type Monaco = typeof import('monaco-editor');

export class PainelCodigo {
  private raiz: HTMLElement;
  private fontes: FonteCodigo[] = [];
  private elementos: ElementoCodigo[] = [];
  private monaco: Monaco | null = null;
  private definirTipos: ((d: string) => void) | null = null;
  private editor: import('monaco-editor').editor.IStandaloneCodeEditor | null = null;
  private abas: Aba[] = [];
  private atual: string | null = null;
  private selecionado: string | null = null;
  private busca = '';
  private mostrarApi = true;
  private saidaAberta = true;
  private elExplorador!: HTMLElement;
  private elAbas!: HTMLElement;
  private elEditor!: HTMLElement;
  private elVazio!: HTMLElement;
  private elApi!: HTMLElement;
  private elSaida!: HTMLElement;
  private elTitulo!: HTMLElement;

  aoAvisar: (m: string) => void = () => {};
  /** Testar a fase (o painel fecha e o teste começa). */
  aoTestar: () => void = () => {};
  /** Um script foi salvo pelo painel (o editor aplica o bloco config nos dados). */
  aoSalvarScript: (arquivo: string) => void = () => {};
  /** Declarações da API atualizadas com o contexto do projeto (nomes de objetos, ações…). */
  tipos: () => Promise<string> = async () => '';

  /** Em janela própria (Electron): ocupa a janela inteira, pode ir para outro monitor. */
  readonly janela: boolean;
  private elAviso!: HTMLElement;
  private timerAviso = 0;

  constructor(private plat: Plataforma, opcoes: { janela?: boolean } = {}) {
    this.janela = !!opcoes.janela;
    this.raiz = el('div', { class: 'tela-codigo' + (this.janela ? ' janela' : ''), role: this.janela ? 'main' : 'dialog', 'aria-modal': this.janela ? 'false' : 'true', 'aria-label': 'Código' });
    this.raiz.hidden = true;
    // Janela própria: avisa antes de fechar com algo não salvo
    if (this.janela) window.addEventListener('beforeunload', (e) => { if (this.abas.some((a) => a.modelo.getAlternativeVersionId() !== a.salvo)) e.preventDefault(); });
    document.body.append(this.raiz);
    this.montar();
    LOG.ouvintes.add((l) => { if (this.aberta && (!l || l.cat === 'codigo' || l.cat === 'erro')) this.desenharSaida(); });
    this.raiz.addEventListener('keydown', (e) => {
      e.stopPropagation(); // os atalhos do editor de fases não valem aqui
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); void (e.shiftKey ? this.salvarTudo() : this.salvarAtual()); }
      else if (e.key === 'F5') { e.preventDefault(); void this.testar(); }
      else if (e.key === 'Escape' && !this.janela && !this.raiz.querySelector('.suggest-widget.visible, .find-widget.visible')) {
        if (!(e.target as HTMLElement).closest('.monaco-editor')) { e.preventDefault(); void this.fechar(); }
      }
    });
  }

  get aberta() { return !this.raiz.hidden; }

  /** Registra uma fonte de elementos (o jogo, a fase, personagens; no futuro: menus, HUD…). */
  registrarFonte(f: FonteCodigo) { this.fontes.push(f); }

  // ---------- Abrir / fechar ----------

  /** Abre o painel; com "foco", seleciona aquele elemento (ex.: "obj:…" vindo do painel de propriedades). */
  async abrir(foco?: string) {
    this.raiz.hidden = false;
    if (!this.monaco) await this.carregarMonaco();
    await this.atualizarElementos();
    if (foco) await this.selecionar(foco);
    else if (!this.atual && this.elementos.length) this.desenharExplorador();
    this.desenharSaida();
    this.editor?.layout();
    this.editor?.focus();
  }

  async fechar(): Promise<boolean> {
    const sujos = this.abas.filter((a) => a.modelo.getAlternativeVersionId() !== a.salvo);
    if (sujos.length) {
      const r = await perguntar('Código não salvo', `${sujos.map((a) => a.arquivo).join(', ')} tem alterações não salvas.`, ['Cancelar', 'Descartar', 'Salvar tudo']);
      if (r === 0 || r === -1) return false;
      if (r === 2) await this.salvarTudo();
      if (r === 1) for (const a of sujos) {
        if (a.novo) { this.abas = this.abas.filter((x) => x !== a); if (this.atual === a.arquivo) { this.atual = null; this.editor?.setModel(null); } a.modelo.dispose(); continue; }
        a.modelo.setValue(await this.ler(a.arquivo) ?? ''); a.salvo = a.modelo.getAlternativeVersionId();
      }
    }
    this.raiz.hidden = true;
    return true;
  }

  private async carregarMonaco() {
    this.elVazio.replaceChildren(el('p', {}, 'Carregando o editor de código…'));
    const m = await import('./monaco');
    this.monaco = m.monaco;
    this.definirTipos = m.definirTipos;
    this.editor = m.monaco.editor.create(this.elEditor, {
      theme: 'lorex', automaticLayout: true, fontSize: 14, fontFamily: "Consolas, 'Cascadia Code', monospace",
      minimap: { enabled: false }, tabSize: 2, scrollBeyondLastLine: false, renderWhitespace: 'selection',
      fixedOverflowWidgets: true, model: null,
      quickSuggestions: { other: true, strings: true, comments: false }, suggestOnTriggerCharacters: true,
    });
    this.editor.onDidChangeModelContent(() => this.desenharAbas());
    this.desenharEditor();
  }

  // ---------- Elementos (explorador) ----------

  /** Tudo o que as fontes listam agora (o editor também usa para mandar à janela do Código). */
  async coletarElementos(): Promise<ElementoCodigo[]> {
    const listas = await Promise.all(this.fontes.map((f) => f().catch(() => [] as ElementoCodigo[])));
    const lista = listas.flat();
    // Quantos usam o mesmo arquivo
    const usos = new Map<string, number>();
    for (const e of lista) if (e.arquivo) usos.set(e.arquivo, (usos.get(e.arquivo) ?? 0) + 1);
    for (const e of lista) e.compartilhado = e.arquivo ? (usos.get(e.arquivo) ?? 1) - 1 : 0;
    return lista;
  }

  /** Atualiza a lista da esquerda (chamado sozinho quando a fase muda: objeto ou inimigo novo aparece na hora). */
  async atualizarElementos() {
    this.elementos = await this.coletarElementos();
    if (this.definirTipos) this.definirTipos(await this.tipos());
    // Rascunhos não mexidos acompanham os dados (ex.: mudou a vida em Personagens → o bloco config do rascunho muda)
    for (const a of [...this.abas]) {
      if (!a.novo || a.modelo.getAlternativeVersionId() !== a.salvo) continue;
      const e = this.elemento(a.novo.chave);
      if (!e) continue;
      if (e.arquivo) { // ganhou um script por fora: o rascunho sai
        this.abas = this.abas.filter((x) => x !== a);
        if (this.atual === a.arquivo) { this.atual = null; this.editor?.setModel(null); }
        a.modelo.dispose();
        continue;
      }
      const texto = e.modelo ?? modeloScript(e.dono, e.nome, e.detalhe);
      if (texto !== a.modelo.getValue()) { a.modelo.setValue(texto); a.salvo = a.modelo.getAlternativeVersionId(); }
      a.novo = e;
    }
    // O elemento selecionado pode ter ganhado um script por fora
    const sel = this.selecionado ? this.elemento(this.selecionado) : undefined;
    if (sel?.arquivo && !this.atual) await this.abrirArquivo(sel.arquivo, sel.dono, sel.nome);
    this.desenharExplorador();
    if (!this.atual) this.desenharEditor();
  }

  /** Mensagem curta no topo do painel (janela própria, onde não há a barra de status do editor). */
  avisar(texto: string) {
    if (!this.elAviso) return;
    this.elAviso.textContent = texto;
    clearTimeout(this.timerAviso);
    this.timerAviso = window.setTimeout(() => { this.elAviso.textContent = ''; }, 6000);
  }

  private elemento(chave: string) { return this.elementos.find((e) => e.chave === chave); }

  private async selecionar(chave: string) {
    const e = this.elemento(chave);
    if (!e) return;
    this.selecionado = chave;
    if (e.arquivo) await this.abrirArquivo(e.arquivo, e.dono, e.nome);
    else this.abrirRascunho(e);
    this.desenharExplorador();
  }

  /**
   * Sem script ainda: abre o código já escrito (valores do bloco config + ganchos/comportamento pronto) para editar
   * direto. Nada vai para o disco até salvar (Ctrl+S): aí o arquivo é criado e ligado ao dono.
   */
  private abrirRascunho(e: ElementoCodigo) {
    if (!this.monaco || !this.editor) return;
    const chave = `novo:${e.chave}`;
    let aba = this.abas.find((a) => a.arquivo === chave);
    if (!aba) {
      const uri = this.monaco.Uri.parse(`file:///scripts/novo/${encodeURIComponent(e.chave)}/${e.arquivoNovo}`);
      const texto = e.modelo ?? modeloScript(e.dono, e.nome, e.detalhe);
      const modelo = this.monaco.editor.getModel(uri) ?? this.monaco.editor.createModel(texto, 'javascript', uri);
      aba = { arquivo: chave, modelo, salvo: modelo.getAlternativeVersionId(), titulo: e.nome, dono: e.dono, novo: e };
      this.abas.push(aba);
    }
    this.atual = chave;
    this.editor.setModel(aba.modelo);
    this.desenharEditor();
  }

  /** Cria um módulo seu (classes/funções para importar) e abre. */
  private async novoModulo() {
    const nome = await pedirTexto('Novo módulo', 'Nome do arquivo (sem .js)', 'meu_modulo');
    if (!nome) return;
    const base = slugScript(nome) || 'modulo';
    const existentes = new Set(await this.plat.listarDados('scripts'));
    let arquivo = `${base}.js`;
    for (let i = 2; existentes.has(arquivo); i++) arquivo = `${base}_${i}.js`;
    await this.plat.salvarDados('scripts', arquivo, modeloModulo(arquivo.replace(/\.js$/, '')));
    this.aoAvisar(`Módulo criado: jogo/scripts/${arquivo}`);
    this.aoSalvarScript(arquivo);
    await this.atualizarElementos();
    await this.irPara(arquivo);
  }

  /** Cria o script de um elemento a partir do modelo e liga ao dono. */
  private async criarScript(e: ElementoCodigo, texto?: string): Promise<string | null> {
    const existentes = new Set(await this.plat.listarDados('scripts'));
    let arquivo = e.arquivoNovo;
    if (existentes.has(arquivo) && !e.ligar) { /* jogo.js já existe: só abre */ }
    else for (let i = 2; existentes.has(arquivo); i++) arquivo = e.arquivoNovo.replace(/\.js$/, `_${i}.js`);
    if (!existentes.has(arquivo)) await this.plat.salvarDados('scripts', arquivo, texto ?? e.modelo ?? modeloScript(e.dono, e.nome, e.detalhe));
    if (e.ligar && !(await e.ligar(arquivo))) return null;
    this.aoAvisar(`Script criado: jogo/scripts/${arquivo}`);
    return arquivo;
  }

  // ---------- Arquivos e abas ----------

  private async ler(arquivo: string): Promise<string | null> {
    try { return await this.plat.lerDados('scripts', arquivo); } catch { return null; }
  }

  private async abrirArquivo(arquivo: string, dono: DonoScript, titulo: string, linha?: number) {
    const m = this.monaco!;
    let aba = this.abas.find((a) => a.arquivo === arquivo);
    if (!aba) {
      const texto = await this.ler(arquivo);
      if (texto === null) { this.aoAvisar(`Não achei jogo/scripts/${arquivo}.`); return; }
      const uri = m.Uri.parse(`file:///scripts/${arquivo}`);
      const modelo = m.editor.getModel(uri) ?? m.editor.createModel(texto, 'javascript', uri);
      if (modelo.getValue() !== texto) modelo.setValue(texto);
      aba = { arquivo, modelo, salvo: modelo.getAlternativeVersionId(), titulo, dono };
      this.abas.push(aba);
    }
    this.atual = arquivo;
    this.editor!.setModel(aba.modelo);
    if (linha) { this.editor!.revealLineInCenter(linha); this.editor!.setPosition({ lineNumber: linha, column: 1 }); }
    this.desenharEditor();
    this.editor!.focus();
  }

  private async fecharAba(arquivo: string) {
    const aba = this.abas.find((a) => a.arquivo === arquivo);
    if (!aba) return;
    if (aba.modelo.getAlternativeVersionId() !== aba.salvo) {
      const r = await perguntar('Fechar sem salvar?', `${arquivo} tem alterações não salvas.`, ['Cancelar', 'Descartar', 'Salvar']);
      if (r === 0 || r === -1) return;
      if (r === 2) await this.salvar(aba);
    }
    this.abas = this.abas.filter((a) => a !== aba);
    aba.modelo.dispose();
    if (this.atual === arquivo) {
      const outra = this.abas[this.abas.length - 1];
      this.atual = outra?.arquivo ?? null;
      this.editor!.setModel(outra?.modelo ?? null);
    }
    this.desenharEditor();
  }

  private async salvar(aba: Aba) {
    if (aba.novo) {
      // Rascunho: cria o arquivo com o texto atual e liga ao dono; a aba passa a ser do arquivo de verdade
      const e = aba.novo;
      const arquivo = await this.criarScript(e, aba.modelo.getValue());
      if (!arquivo) return;
      const m = this.monaco!;
      const texto = aba.modelo.getValue();
      const uri = m.Uri.parse(`file:///scripts/${arquivo}`);
      const modelo = m.editor.getModel(uri) ?? m.editor.createModel(texto, 'javascript', uri);
      if (modelo.getValue() !== texto) modelo.setValue(texto);
      const eraAtual = this.atual === aba.arquivo;
      aba.modelo.dispose();
      Object.assign(aba, { arquivo, modelo, salvo: modelo.getAlternativeVersionId(), novo: undefined });
      if (eraAtual) { this.atual = arquivo; this.editor?.setModel(modelo); }
      await this.atualizarElementos();
      this.aoSalvarScript(arquivo);
      this.desenharEditor();
      return;
    }
    await this.plat.salvarDados('scripts', aba.arquivo, aba.modelo.getValue());
    aba.salvo = aba.modelo.getAlternativeVersionId();
    this.desenharAbas();
    this.aoSalvarScript(aba.arquivo);
  }

  private async salvarAtual() {
    const aba = this.abas.find((a) => a.arquivo === this.atual);
    if (!aba) return;
    await this.salvar(aba);
    this.aoAvisar(`Salvo: jogo/scripts/${aba.arquivo}`);
  }

  async salvarTudo() {
    const sujos = this.abas.filter((a) => a.modelo.getAlternativeVersionId() !== a.salvo);
    for (const a of sujos) await this.salvar(a);
    if (sujos.length) this.aoAvisar(`${sujos.length} script(s) salvo(s).`);
  }

  private async testar() {
    await this.salvarTudo();
    if (!this.janela) this.raiz.hidden = true;
    this.aoTestar();
  }

  /** Um script mudou fora do painel (ex.: o Claude editou): recarrega se não houver alteração aqui. */
  async mudouPorFora(arquivo: string) {
    const aba = this.abas.find((a) => a.arquivo === arquivo);
    if (!aba) { if (this.aberta) await this.atualizarElementos(); return; }
    if (aba.modelo.getAlternativeVersionId() !== aba.salvo) { this.aoAvisar(`${arquivo} mudou fora do painel; salve ou feche a aba para ver a outra versão.`); return; }
    const texto = await this.ler(arquivo);
    if (texto !== null && texto !== aba.modelo.getValue()) {
      aba.modelo.setValue(texto);
      aba.salvo = aba.modelo.getAlternativeVersionId();
      this.aoAvisar(`Script ${arquivo} atualizado por fora.`);
    }
    this.desenharAbas();
  }

  /** Abre um script numa linha (usado pela Saída e pelo painel de Log). */
  async irPara(arquivo: string, linha?: number) {
    if (!this.aberta) await this.abrir();
    const e = this.elementos.find((x) => x.arquivo === arquivo);
    if (e) this.selecionado = e.chave;
    await this.abrirArquivo(arquivo, e?.dono ?? 'objeto', e?.nome ?? arquivo, linha);
    this.desenharExplorador();
  }

  /** Insere um gancho no fim do arquivo atual. */
  private inserirGancho(nome: string) {
    const aba = this.abas.find((a) => a.arquivo === this.atual);
    if (!aba || !this.editor) return;
    const texto0 = aba.modelo.getValue();
    if (new RegExp(`^\\s*export\\s+function\\s+${nome}\\b`, 'm').test(texto0)) { this.aoAvisar(`${nome} já existe neste script.`); return; }
    // Se o modelo deixou o gancho comentado, descomenta (com o comentário de ajuda) em vez de duplicar
    const linhas = texto0.split('\n');
    const k = linhas.findIndex((l) => l.startsWith(`// export function ${nome}(`));
    if (k >= 0) {
      let ini = k, fim = k;
      while (ini > 0 && /^\/\/ (\/\*\*| \*)/.test(linhas[ini - 1])) ini--;
      while (fim < linhas.length - 1 && linhas[fim] !== '// }') fim++;
      const novo = linhas.slice(ini, fim + 1).map((l) => l.replace(/^\/\/ ?/, '')).join('\n');
      this.editor.executeEdits('lorex', [{ range: new this.monaco!.Range(ini + 1, 1, fim + 1, linhas[fim].length + 1), text: novo }]);
      this.editor.setPosition({ lineNumber: fim, column: aba.modelo.getLineMaxColumn(fim) });
      this.editor.revealLineInCenter(fim);
      this.editor.focus();
      return;
    }
    const g = GANCHOS.find((x) => x.nome === nome)!;
    const params = paramsDe(g, aba.dono);
    const texto = `\n/** ${g.texto} */\nexport function ${nome}(${params}) {\n  \n}\n`;
    const fim = aba.modelo.getFullModelRange().getEndPosition();
    this.editor.executeEdits('lorex', [{ range: new this.monaco!.Range(fim.lineNumber, fim.column, fim.lineNumber, fim.column), text: texto }]);
    const linha = aba.modelo.getLineCount() - 1;
    this.editor.setPosition({ lineNumber: linha, column: 3 });
    this.editor.revealLineInCenter(linha);
    this.editor.focus();
  }

  // ---------- Interface ----------

  private montar() {
    const fechar = el('button', { type: 'button', class: 'secundario' }, 'Fechar');
    dica(fechar, 'Fechar', 'Volta ao editor de fases.', 'Esc');
    fechar.addEventListener('click', () => void this.fechar());
    const salvar = el('button', { type: 'button', class: 'secundario' }, 'Salvar');
    dica(salvar, 'Salvar', 'Salva o script aberto em jogo/scripts/.', 'Ctrl+S');
    salvar.addEventListener('click', () => void this.salvarAtual());
    const salvarTudo = el('button', { type: 'button', class: 'secundario' }, 'Salvar tudo');
    dica(salvarTudo, 'Salvar tudo', 'Salva todas as abas.', 'Ctrl+Shift+S');
    salvarTudo.addEventListener('click', () => void this.salvarTudo());
    const api = el('button', { type: 'button', class: 'secundario ligado' }, 'API');
    dica(api, 'Referência (API)', 'Mostra os ganchos e tudo o que o código pode usar. Clique num gancho para inseri-lo no script.');
    api.addEventListener('click', () => { this.mostrarApi = !this.mostrarApi; api.classList.toggle('ligado', this.mostrarApi); this.elApi.hidden = !this.mostrarApi; this.editor?.layout(); });
    const testar = el('button', { type: 'button', class: 'primario' }, icone('play'), el('span', {}, 'Testar'));
    dica(testar, 'Salvar e testar', 'Salva tudo e joga a fase com o código.', 'F5');
    testar.addEventListener('click', () => void this.testar());
    this.elTitulo = el('span', { class: 'cod-titulo-arquivo' });
    this.elAviso = el('span', { class: 'cod-aviso', role: 'status' });
    if (this.janela) fechar.hidden = true;
    if (this.janela) dica(testar, 'Salvar e testar', 'Salva tudo e começa o ▶ Testar na janela do editor (a outra tela).', 'F5');

    this.elExplorador = el('nav', { class: 'cod-explorador', 'aria-label': 'Elementos do projeto' });
    this.elAbas = el('div', { class: 'cod-abas', role: 'tablist' });
    this.elEditor = el('div', { class: 'cod-monaco' });
    this.elVazio = el('div', { class: 'cod-vazio' });
    this.elApi = el('aside', { class: 'cod-api' });
    this.elSaida = el('section', { class: 'cod-saida' });

    // Divisores: largura do explorador e da API (ganchos), altura da Saída
    const layout = () => this.editor?.layout();
    const dExp = divisor({ id: 'codigo-explorador', eixo: 'x', alvo: this.raiz, variavel: '--cod-exp', padrao: 250, min: 160, max: () => window.innerWidth * 0.45, sentido: 1, lado: 'fim', titulo: 'Largura da lista de elementos', aoMudar: layout });
    const dApi = divisor({ id: 'codigo-api', eixo: 'x', alvo: this.raiz, variavel: '--cod-api', padrao: 290, min: 200, max: () => window.innerWidth * 0.5, sentido: -1, lado: 'inicio', titulo: 'Largura da caixa de ganchos e API', aoMudar: layout });
    const dSaida = divisor({ id: 'codigo-saida', eixo: 'y', alvo: this.raiz, variavel: '--cod-saida', padrao: 170, min: 70, max: () => window.innerHeight * 0.7, sentido: -1, lado: 'inicio', titulo: 'Altura da Saída', aoMudar: layout });
    this.raiz.append(el('div', { class: 'cod-caixa' },
      el('header', { class: 'pers-topo' }, el('h2', {}, 'Código'), this.elTitulo, el('div', { class: 'espaco' }), this.elAviso, api, salvar, salvarTudo, testar, fechar),
      el('div', { class: 'cod-corpo' },
        el('div', { class: 'cod-lado' }, this.elExplorador, dExp),
        el('div', { class: 'cod-centro' }, this.elAbas, el('div', { class: 'cod-area' }, this.elEditor, this.elVazio)),
        el('div', { class: 'cod-lado cod-lado-api' }, this.elApi, dApi)),
      el('div', { class: 'cod-lado cod-lado-saida' }, this.elSaida, dSaida)));
  }

  private desenharExplorador() {
    const busca = el('input', { type: 'search', class: 'cod-busca', placeholder: 'Buscar (ex.: porta)', value: this.busca, 'aria-label': 'Buscar elemento' });
    busca.addEventListener('input', () => { this.busca = busca.value; const pos = busca.selectionStart; this.desenharExplorador(); const b = this.elExplorador.querySelector('input'); if (b) { b.focus(); b.setSelectionRange(pos, pos); } });
    const filtro = this.busca.trim().toLowerCase();
    const grupos = new Map<string, ElementoCodigo[]>();
    for (const e of this.elementos) {
      if (filtro && !`${e.nome} ${e.detalhe ?? ''} ${e.arquivo ?? ''}`.toLowerCase().includes(filtro)) continue;
      if (!grupos.has(e.grupo)) grupos.set(e.grupo, []);
      grupos.get(e.grupo)!.push(e);
    }
    const novoMod = el('button', { type: 'button', class: 'secundario cod-novo-modulo' }, '+ Novo módulo');
    dica(novoMod, 'Novo módulo', 'Um arquivo seu em jogo/scripts/ para classes e funções do jogo. Use em qualquer script com: import { MinhaClasse } from "./meu_modulo.js".');
    novoMod.addEventListener('click', () => void this.novoModulo());
    const filhos: HTMLElement[] = [busca, novoMod];
    for (const [g, lista] of grupos) {
      filhos.push(el('h3', {}, g));
      for (const e of lista) {
        const b = el('button', { type: 'button', class: 'cod-item' + (e.chave === this.selecionado ? ' ativo' : '') + (e.arquivo ? ' tem' : '') },
          el('span', { class: 'cod-ico' }, e.arquivo ? '{ }' : e.pronto ? '⚙' : '+'),
          el('span', { class: 'cod-nome' }, e.nome),
          e.detalhe ? el('span', { class: 'cod-det' }, e.detalhe) : null);
        dica(b, e.nome, e.arquivo
          ? `Script: jogo/scripts/${e.arquivo}${e.compartilhado ? ` (compartilhado com mais ${e.compartilhado})` : ''}.`
          : e.pronto ? `Comportamento pronto (${e.pronto}). Clique para ver e editar em código (Ctrl+S cria o arquivo).` : 'Clique para ver e editar o código (valores e ganchos já escritos). Ctrl+S cria o arquivo.');
        b.addEventListener('click', () => void this.selecionar(e.chave));
        filhos.push(b);
      }
    }
    if (!this.elementos.length) filhos.push(el('p', { class: 'dica-campo' }, 'Abra uma fase para ver os elementos.'));
    this.elExplorador.replaceChildren(...filhos);
  }

  private desenharAbas() {
    this.elAbas.replaceChildren(...this.abas.map((a) => {
      const sujo = a.modelo.getAlternativeVersionId() !== a.salvo;
      const x = el('button', { type: 'button', class: 'cod-aba-fechar', 'aria-label': `Fechar ${a.arquivo}` }, sujo ? '●' : '×');
      x.addEventListener('click', (ev) => { ev.stopPropagation(); void this.fecharAba(a.arquivo); });
      const nome = a.novo ? `${a.novo.arquivoNovo} (novo)` : a.arquivo;
      const t = el('div', { class: 'cod-aba' + (a.arquivo === this.atual ? ' ativa' : '') + (a.novo ? ' nova' : ''), role: 'tab' }, el('span', {}, nome), x);
      dica(t, a.titulo, a.novo ? `Ainda não existe no disco: Ctrl+S cria jogo/scripts/${a.novo.arquivoNovo}.` : `jogo/scripts/${a.arquivo}${sujo ? ' · não salvo' : ''}`);
      t.addEventListener('click', () => {
        if (a.novo) { this.selecionado = a.novo.chave; this.abrirRascunho(a.novo); this.desenharExplorador(); return; }
        const e = this.elementos.find((x) => x.arquivo === a.arquivo); if (e) this.selecionado = e.chave; void this.abrirArquivo(a.arquivo, a.dono, a.titulo); this.desenharExplorador();
      });
      return t;
    }));
    const aba = this.abas.find((a) => a.arquivo === this.atual);
    this.elTitulo.textContent = !aba ? '' : aba.novo
      ? `${aba.titulo} — ainda sem arquivo: ${aba.novo.pronto ? 'o comportamento pronto continua valendo até' : 'nada muda no jogo até'} salvar (Ctrl+S cria jogo/scripts/${aba.novo.arquivoNovo})`
      : `${aba.titulo} — jogo/scripts/${aba.arquivo}${aba.modelo.getAlternativeVersionId() !== aba.salvo ? ' ●' : ''}`;
  }

  private desenharEditor() {
    this.desenharAbas();
    const temArquivo = !!this.atual;
    this.elEditor.hidden = !temArquivo;
    this.elVazio.hidden = temArquivo;
    if (!temArquivo) {
      const e = this.selecionado ? this.elemento(this.selecionado) : null;
      if (e && !e.arquivo) {
        const criar = el('button', { type: 'button', class: 'primario' }, e.pronto ? `Mostrar o comportamento de ${e.nome} em código` : `Criar script de ${e.nome}`);
        dica(criar, 'Criar script', e.pronto
          ? `Cria jogo/scripts/${e.arquivoNovo} com o comportamento atual escrito em JavaScript. A partir daí, é esse código que manda.`
          : `Cria jogo/scripts/${e.arquivoNovo} com os ganchos de ${e.nome} prontos para preencher.`);
        criar.addEventListener('click', () => void this.criarScript(e));
        const ganchos = GANCHOS.filter((g) => g.donos.includes(e.dono));
        this.elVazio.replaceChildren(
          el('h3', {}, e.nome), e.detalhe ? el('p', { class: 'dica-campo' }, e.detalhe) : '',
          e.pronto ? el('p', { class: 'cod-pronto' }, `Já funciona com o comportamento pronto da engine: ${e.pronto}. Clique no botão abaixo para ver e editar esse comportamento em código.`) : '',
          el('p', {}, e.pronto ? 'Ganchos disponíveis:' : 'Ainda sem código. Ganchos disponíveis:'),
          el('ul', {}, ...ganchos.map((g) => el('li', {}, el('code', {}, `${g.nome}(${paramsDe(g, e.dono)})`), ' — ', g.texto))),
          criar);
      } else {
        this.elVazio.replaceChildren(el('h3', {}, 'Código do jogo'),
          el('p', {}, 'Escolha à esquerda o que quer programar: o jogo, a fase, um objeto (chave, porta…) ou um personagem.'),
          el('p', { class: 'dica-campo' }, 'Os scripts ficam em jogo/scripts/ como JavaScript. Dentro do editor, Ctrl+Espaço sugere nomes de objetos, ações e animações do projeto.'));
      }
    }
    this.desenharApi();
    this.editor?.layout();
  }

  private desenharApi() {
    const aba = this.abas.find((a) => a.arquivo === this.atual);
    const dono = aba?.dono ?? (this.selecionado ? this.elemento(this.selecionado)?.dono : undefined);
    const ganchos = dono ? GANCHOS.filter((g) => g.donos.includes(dono)) : GANCHOS;
    const blocos: (HTMLElement | string)[] = [el('h3', {}, 'Ganchos'), el('p', { class: 'dica-campo' }, aba ? 'Clique para inserir no script.' : 'Funções que a engine chama sozinha.')];
    if (dono === 'sistema') {
      const arq = aba?.novo?.arquivoNovo ?? aba?.arquivo;
      const s = SISTEMAS.find((x) => x.arquivo === arq) ?? SISTEMAS[0];
      blocos.splice(0, 2, el('h3', {}, 'Sistema do jogo'),
        el('p', { class: 'dica-campo' }, `${s.descricao} Estas são as regras do JOGO, não da engine: a engine só chama as funções abaixo. Salvar cria jogo/scripts/${s.arquivo}, que passa a valer no lugar do padrão.`),
        ...s.funcoes.map((f) => el('div', { class: 'cod-ref' }, el('code', {}, f))));
    }
    if (dono === 'modulo') {
      blocos.splice(0, 2, el('h3', {}, 'Módulo'),
        el('p', { class: 'dica-campo' }, 'Arquivo seu: classes, funções e valores. Use em qualquer script com import { Nome } from "./arquivo.js". Quem importa o mesmo módulo divide as mesmas variáveis.'));
    }
    for (const g of ganchos) {
      const b = el('button', { type: 'button', class: 'cod-gancho' }, el('code', {}, `${g.nome}(${dono ? paramsDe(g, dono) : g.params})`), el('span', {}, g.texto));
      b.disabled = !aba;
      b.addEventListener('click', () => this.inserirGancho(g.nome));
      blocos.push(b);
    }
    const ref: [string, string][] = [
      ['config.vida', 'Os valores do topo do script (bloco config): vida, velocidade, dano, tamanho… Salvar aplica no editor'],
      ['jogo.objeto("porta")', 'Pega um objeto da fase pelo nome. Ex.: .abrir(), .esconder(), .x += 10'],
      ['jogo.jogador', 'x, y, vx, vy, noChao, tocar("tiro"), teleportar(x, y), empurrar(vx, vy), dados'],
      ['jogo.inventario', 'tem("chave"), dar("moeda", 1), tirar("chave"), quantidade("moeda")'],
      ['jogo.hud.definir("Munição", "7/7")', 'Linha de texto no canto da tela'],
      ['jogo.aviso("…") / jogo.mensagem("…")', 'Aviso rápido / caixa de mensagem'],
      ['jogo.apertou("tiro") / segurando("pular")', 'Teclas da ferramenta Controles'],
      ['jogo.esperar(2, () => …)', 'Agenda algo para daqui a 2 s'],
      ['jogo.irPara("area_02.json")', 'Troca de fase/área'],
      ['jogo.variaveis', 'Guarde valores que seguem entre fases'],
      ['eu.dados', 'Guarde valores deste objeto/personagem'],
      ['jogo.log(…)', 'Escreve na Saída (embaixo)'],
    ];
    blocos.push(el('h3', {}, 'API'), ...ref.map(([c, t]) => el('div', { class: 'cod-ref' }, el('code', {}, c), el('span', {}, t))));
    this.elApi.replaceChildren(...blocos);
    this.elApi.hidden = !this.mostrarApi;
  }

  private desenharSaida() {
    const titulo = el('button', { type: 'button', class: 'cod-saida-titulo' }, `${this.saidaAberta ? '▾' : '▸'} Saída`,
      el('span', { class: 'dica-campo' }, linhasSaida().some((l) => l.cat === 'erro') ? ` · ${linhasSaida().filter((l) => l.cat === 'erro').length} erro(s)` : ''));
    dica(titulo, 'Saída', 'Mensagens de jogo.log(), ganchos que rodaram e erros dos scripts (o mesmo registro do painel de Log, só a parte do código). Clique num erro para ir à linha.');
    titulo.addEventListener('click', () => { this.saidaAberta = !this.saidaAberta; this.desenharSaida(); this.editor?.layout(); });
    const limpar = el('button', { type: 'button', class: 'secundario' }, 'Limpar');
    limpar.addEventListener('click', () => LOG.limpar());
    const linhas = el('div', { class: 'cod-saida-linhas' });
    if (!linhasSaida().length) linhas.append(el('span', { class: 'dica-campo' }, 'Nada ainda. Use jogo.log("…") no código e teste a fase (F5).'));
    for (const l of [...linhasSaida()].reverse().slice(0, 150)) {
      const d = el('div', { class: 'cod-log ' + (l.cat === 'erro' ? 'erro' : 'info') },
        el('span', { class: 'cod-log-arq' }, `${l.arquivo ?? ''}${l.linha ? `:${l.linha}` : ''}`), el('span', {}, l.texto));
      if (l.cat === 'erro' && l.arquivo && /\.js$/.test(l.arquivo)) {
        const arquivo = l.arquivo;
        d.classList.add('clicavel');
        d.addEventListener('click', () => {
          void this.irPara(arquivo, l.linha);
          this.desenharExplorador();
        });
      }
      linhas.append(d);
    }
    this.elSaida.classList.toggle('fechada', !this.saidaAberta);
    this.elSaida.replaceChildren(el('div', { class: 'cod-saida-topo' }, titulo, el('div', { class: 'espaco' }), limpar), ...(this.saidaAberta ? [linhas] : []));
  }
}
