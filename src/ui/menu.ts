// Ferramenta Menu e itens: monta o menu do jogo (inventário) e cadastra os itens.
//   Telas: Inventário e Arquivos — painéis (molduras, retrato da condição, vida, arma, espaços dos itens, informação,
//          lista de arquivos, leitura, botões) arrastáveis na prévia, com imagens do projeto.
//   Submenu: a caixa Usar / Combinar / Checar.
//   Itens: o que cada item é (espaços 1 ou 2, ícone, foto grande, legenda, uso: área / curar / arma).
//   Combinações: A + B → C.  Mensagens: "Você não deve usar este item aqui" etc.
// Salva sozinho em jogo/projeto.json ("menu" e "itens"); no Código: menu.js e itens.js (grupo Jogo).
import {
  ACOES_BOTAO, TIPOS_PAINEL, USOS_ITEM, faixasVidaPadrao, itemBase, itensPadrao, menuPadrao, painelBase,
  type ConfigItem, type ConfigItens, type ConfigMenu, type PainelMenu, type TelaMenu, type TipoPainel, type UsoItem,
} from '../core/menu';
import { MenuJogo } from '../editor/menuJogo';
import { el, perguntar } from './dom';
import { dica } from './legenda';

export interface AcoesMenu {
  imagens(): Promise<string[]>;
  garantir(caminhoRaiz: string, categoria: string): Promise<string>;
  url(caminhoJogo: string): string;
  /** Nomes de itens que já existem no projeto (coletáveis, portas que pedem item…). */
  nomesItens(): Promise<string[]>;
  /** Armas (ferramenta Armas). */
  armas(): Promise<{ arquivo: string; nome: string; imagem: string; slots: number }[]>;
}

type Aba = TelaMenu | 'submenu' | 'itens' | 'combinacoes' | 'mensagens';
const ABAS: { id: Aba; nome: string; texto: string }[] = [
  { id: 'inventario', nome: 'Tela: Itens', texto: 'A tela que abre com a tecla do menu: retrato, condição, arma, espaços dos itens e a coluna Sair/Arquivos/Mapa.' },
  { id: 'arquivos', nome: 'Tela: Arquivos', texto: 'A tela de Arquivos: lista de notas, fotos e documentos pegos, e a leitura do escolhido.' },
  { id: 'submenu', nome: 'Submenu', texto: 'A caixa Usar / Combinar / Checar que aparece ao escolher um item.' },
  { id: 'itens', nome: 'Itens', texto: 'O que cada item é: espaços, imagens, legenda do Checar, o que faz ao Usar.' },
  { id: 'combinacoes', nome: 'Combinações', texto: 'Quais dois itens viram outro (ex.: remédio P + remédio P → remédio M).' },
  { id: 'mensagens', nome: 'Mensagens e inspeção', texto: 'Textos do menu (usar no lugar errado, sem espaço, não combina) e a aparência da inspeção (olho e foco).' },
];

export class EditorMenu {
  private raiz: HTMLElement;
  private m: ConfigMenu = menuPadrao();
  private it: ConfigItens = itensPadrao();
  private aba: Aba = 'inventario';
  private sel: string | null = null;
  private itemSel: string | null = null;
  private res: [number, number] = [640, 360];
  private listaImagens: string[] | null = null;
  private nomes: string[] = [];
  private armas: { arquivo: string; nome: string; imagem: string; slots: number }[] = [];
  private previa: MenuJogo;
  private exemplo = new Map<string, number>();

  aoMudar: (m: ConfigMenu, itens: ConfigItens) => void = () => {};

  constructor(private acoes: AcoesMenu) {
    this.raiz = el('div', { class: 'tela-personagens tela-hud tela-menu', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Menu e itens', tabindex: -1 });
    this.raiz.hidden = true;
    document.body.append(this.raiz);
    this.raiz.addEventListener('keydown', (e) => {
      e.stopPropagation();
      const digitando = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === 'Escape' && !digitando) this.fechar();
      if (e.key === 'Delete' && !digitando && this.sel && (this.aba === 'inventario' || this.aba === 'arquivos')) void this.removerPainel(this.sel);
    });
    this.previa = new MenuJogo({
      menu: () => this.m, url: (c) => this.acoes.url(c),
      // Na prévia, as armas ainda não cadastradas aparecem como no jogo (imagem e espaços da ferramenta Armas)
      itens: () => ({ ...this.it, itens: [...this.it.itens, ...this.armas.filter((a) => !this.it.itens.some((i) => i.nome === a.nome))
        .map((a) => itemBase(a.nome, { uso: 'arma', arma: a.arquivo, espacos: a.slots >= 2 ? 2 : 1, imagem: a.imagem, consome: false }))] }),
      inventario: () => this.exemplo, vida: () => ({ atual: 7, maxima: 12 }),
      arma: () => { const a = this.armas[0]; return a ? { nome: a.nome, imagem: a.imagem, municao: 9, pente: 14 } : { nome: 'Arma', imagem: '', municao: 9, pente: 14 }; },
      usar: () => false, combinar: () => {}, aviso: () => {}, mapa: () => {},
    });
  }

  get aberta() { return !this.raiz.hidden; }

  abrir(m: ConfigMenu, itens: ConfigItens, _resolucao?: [number, number]) {
    this.m = structuredClone(m);
    this.it = structuredClone(itens);
    this.res = this.m.tamanho;
    this.listaImagens = null;
    this.raiz.hidden = false;
    void Promise.all([this.acoes.nomesItens(), this.acoes.armas()]).then(([n, a]) => { this.nomes = n; this.armas = a; this.montarExemplo(); if (this.aberta) this.render(); });
    this.montarExemplo();
    this.render();
    this.raiz.focus();
  }

  fechar() { this.raiz.hidden = true; }

  private mudou(redesenhar = true) { this.montarExemplo(); this.aoMudar(structuredClone(this.m), structuredClone(this.it)); if (redesenhar) this.render(); }

  /** Inventário de exemplo para a prévia: a arma, os itens cadastrados e um arquivo. */
  private montarExemplo() {
    this.exemplo = new Map();
    if (this.armas[0]) this.exemplo.set(this.armas[0].nome, 1);
    for (const i of this.it.itens) this.exemplo.set(i.nome, 1);
    for (const n of this.nomes) if (!this.exemplo.has(n) && this.exemplo.size < 8) this.exemplo.set(n, 1);
  }

  private painel(id: string | null) { return this.aba === 'inventario' || this.aba === 'arquivos' ? this.m.telas[this.aba].find((p) => p.id === id) : undefined; }

  private async removerPainel(id: string) {
    const t = this.aba as TelaMenu;
    if ((await perguntar('Remover painel', `Remover "${id}" desta tela?`, ['Cancelar', 'Remover'])) !== 1) return;
    this.m.telas[t] = this.m.telas[t].filter((p) => p.id !== id);
    this.sel = null;
    this.mudou();
  }

  // ---------- Interface ----------
  private render() {
    const abas = el('nav', { class: 'menu-abas' }, ...ABAS.map((a) => {
      const b = el('button', { type: 'button', class: 'secundario' + (a.id === this.aba ? ' ativo' : '') }, a.nome);
      dica(b, a.nome, a.texto);
      b.addEventListener('click', () => { this.aba = a.id; this.sel = null; this.render(); });
      return b;
    }));
    const padrao = el('button', { type: 'button', class: 'secundario' }, 'Restaurar layout');
    dica(padrao, 'Restaurar layout', 'Volta as telas e o submenu ao layout inicial (as imagens escolhidas saem). Os itens e combinações ficam.');
    padrao.addEventListener('click', async () => {
      if ((await perguntar('Restaurar o layout do menu', 'As telas e o submenu voltam ao padrão.', ['Cancelar', 'Restaurar'])) !== 1) return;
      this.m = menuPadrao(); this.sel = null; this.mudou();
    });
    const fechar = el('button', { type: 'button', class: 'primario' }, 'Fechar');
    dica(fechar, 'Fechar', 'As mudanças já ficam salvas no projeto.', 'Esc');
    fechar.addEventListener('click', () => this.fechar());
    const telas = this.aba === 'inventario' || this.aba === 'arquivos';
    const colunas = telas ? [this.listaPaineis(), this.desenharPrevia(), this.propriedadesPainel()]
      : this.aba === 'submenu' ? [this.listaSubmenu(), this.desenharPrevia(), this.propriedadesSubmenu()]
      : this.aba === 'itens' ? [this.listaItens(), this.propriedadesItem()]
      : this.aba === 'combinacoes' ? [this.combinacoes()]
      : [this.mensagens()];
    this.raiz.replaceChildren(el('div', { class: 'pers-caixa' },
      el('header', { class: 'pers-topo' }, el('h2', {}, 'Menu e itens'), abas, el('div', { class: 'espaco' }),
        el('span', { class: 'dica-campo' }, 'Salvo em jogo/projeto.json · Código: menu.js e itens.js'), padrao, fechar),
      el('div', { class: 'pers-colunas' }, ...colunas)));
    if (!this.raiz.contains(document.activeElement)) this.raiz.focus();
  }

  private desenharPrevia() {
    const [rw, rh] = this.res;
    const z = Math.min(1.6, 640 / rw);
    const caixa = el('div', { class: 'menu-previa-caixa' });
    caixa.style.width = `${rw * z}px`; caixa.style.height = `${rh * z}px`;
    this.previa.tamanho = () => this.res;
    this.previa.posicionar(0, 0, z);
    this.previa.previa = this.aba === 'submenu' ? null : {
      selecionado: this.sel,
      aoEscolher: (id) => { this.sel = id; this.render(); },
      aoMover: (id, x, y, w, h) => { const p = this.painel(id); if (p) { Object.assign(p, { x, y, w, h }); this.mudou(); } },
    };
    this.previa.abrir(this.aba === 'arquivos' ? 'arquivos' : 'inventario');
    if (this.aba === 'submenu') this.previa.tecla(new KeyboardEvent('keydown', { key: 'Enter' }));
    caixa.append(this.previa.raiz);
    return el('section', { class: 'pers-col pers-centro' }, caixa,
      el('p', { class: 'dica-campo' }, this.aba === 'submenu'
        ? 'Prévia do submenu sobre o primeiro item. No jogo ele aparece ao lado do item escolhido.'
        : 'Clique num painel para escolher; arraste para mover; o quadradinho no canto muda o tamanho. Valores de exemplo (vida 7/12). Del remove o painel.'));
  }

  // ---------- Painéis ----------
  private listaPaineis() {
    const t = this.aba as TelaMenu;
    const col = el('section', { class: 'pers-col' }, el('h3', {}, 'Painéis'));
    for (const p of this.m.telas[t]) {
      const tipo = TIPOS_PAINEL.find((x) => x.id === p.tipo)!;
      const b = el('button', { type: 'button', class: 'pers-estado' + (p.id === this.sel ? ' ativo' : '') + (p.imagem ? ' ok' : '') },
        el('strong', {}, p.id), el('span', {}, `${tipo.nome}${p.tipo === 'botao' ? ` · ${ACOES_BOTAO.find((a) => a.id === p.acao)?.nome}` : ''}`));
      dica(b, p.id, `${tipo.texto} Posição ${p.x}, ${p.y} · ${p.w}×${p.h} px.`);
      b.addEventListener('click', () => { this.sel = p.id; this.render(); });
      col.append(b);
    }
    const novo = el('details', { class: 'hud-novo' }, el('summary', { class: 'secundario' }, '+ Painel'));
    dica(novo.querySelector('summary')!, 'Novo painel', 'Escolha o tipo; depois arraste na prévia e escolha a imagem da moldura.');
    for (const tp of TIPOS_PAINEL) {
      const b = el('button', { type: 'button', class: 'hud-novo-item' }, el('strong', {}, tp.nome), el('span', {}, tp.texto));
      b.addEventListener('click', () => {
        let id = tp.id as string, n = 2;
        while (this.m.telas[t].some((p) => p.id === id)) id = `${tp.id}_${n++}`;
        const p = painelBase(id, tp.id, 40, 40, tp.id === 'botao' ? 80 : 120, tp.id === 'botao' ? 24 : 80,
          tp.id === 'retrato' || tp.id === 'vida' ? { faixas: faixasVidaPadrao() } : {});
        this.m.telas[t].push(p);
        this.sel = id;
        this.mudou();
      });
      novo.append(b);
    }
    const tam = this.m.tamanho;
    col.append(novo, el('h3', {}, 'Tela do menu'),
      el('div', { class: 'linha2' },
        this.campo('Largura', this.numero(tam[0], (v) => { tam[0] = Math.max(64, Math.round(v)); this.res = tam; }), 'Tamanho fixo da tela do menu (px). No jogo ela é ampliada para preencher a tela, seja qual for o tamanho da sala.'),
        this.campo('Altura', this.numero(tam[1], (v) => { tam[1] = Math.max(64, Math.round(v)); this.res = tam; }), 'Tamanho fixo da tela do menu (px).')),
      el('p', { class: 'dica-campo' }, 'A ordem da lista é a ordem de desenho: os de baixo ficam por cima. Botões podem ficar por cima de uma imagem que já tem o desenho do botão.'));
    return col;
  }

  private propriedadesPainel() {
    const col = el('section', { class: 'pers-col pers-config' });
    const p = this.painel(this.sel);
    if (!p) { col.append(el('p', { class: 'dica-campo' }, 'Escolha um painel na lista ou na prévia.')); return col; }
    const t = this.aba as TelaMenu;
    const tipo = el('select', {}, ...TIPOS_PAINEL.map((x) => el('option', { value: x.id }, x.nome)));
    tipo.value = p.tipo;
    tipo.addEventListener('change', () => { p.tipo = tipo.value as TipoPainel; if ((p.tipo === 'retrato' || p.tipo === 'vida') && !p.faixas.length) p.faixas = faixasVidaPadrao(); this.mudou(); });
    const lista = this.m.telas[t];
    const i = lista.indexOf(p);
    const subir = el('button', { type: 'button', class: 'secundario' }, 'Para trás');
    dica(subir, 'Para trás', 'Desenha este painel antes (fica atrás dos outros).');
    subir.disabled = i <= 0;
    subir.addEventListener('click', () => { lista.splice(i, 1); lista.splice(i - 1, 0, p); this.mudou(); });
    const descer = el('button', { type: 'button', class: 'secundario' }, 'Para frente');
    dica(descer, 'Para frente', 'Desenha este painel depois (fica por cima).');
    descer.disabled = i >= lista.length - 1;
    descer.addEventListener('click', () => { lista.splice(i, 1); lista.splice(i + 1, 0, p); this.mudou(); });
    const remover = el('button', { type: 'button', class: 'perigo' }, 'Remover');
    remover.addEventListener('click', () => void this.removerPainel(p.id));
    col.append(el('h3', {}, `Painel · ${p.id}`),
      this.campo('Tipo', tipo, TIPOS_PAINEL.map((x) => `${x.nome}: ${x.texto}`).join(' ')),
      el('p', { class: 'dica-campo' }, TIPOS_PAINEL.find((x) => x.id === p.tipo)!.texto),
      el('div', { class: 'linha2' }, this.campo('X', this.numero(p.x, (v) => { p.x = Math.round(v); }), 'px da tela do jogo'), this.campo('Y', this.numero(p.y, (v) => { p.y = Math.round(v); }), 'px da tela do jogo')),
      el('div', { class: 'linha2' }, this.campo('Largura', this.numero(p.w, (v) => { p.w = Math.max(2, Math.round(v)); }), 'px'), this.campo('Altura', this.numero(p.h, (v) => { p.h = Math.max(2, Math.round(v)); }), 'px')),
      this.campoImagem('Imagem (moldura)', p.imagem, (v) => { p.imagem = v; }, 'A arte do painel, esticada no tamanho dele. Sem imagem: moldura padrão (cinza e verde).', p.tipo === 'botao' ? 'Nenhuma (área invisível)' : 'Moldura padrão'),
      el('h3', {}, 'Área do conteúdo'),
      el('p', { class: 'dica-campo' }, 'Onde o conteúdo fica dentro da moldura (a parte verde): distância do canto e tamanho, em px.'),
      el('div', { class: 'linha2' }, this.campo('Área X', this.numero(p.area[0], (v) => { p.area[0] = Math.round(v); }), 'px a partir da esquerda do painel'), this.campo('Área Y', this.numero(p.area[1], (v) => { p.area[1] = Math.round(v); }), 'px a partir do topo do painel')),
      el('div', { class: 'linha2' }, this.campo('Área largura', this.numero(p.area[2], (v) => { p.area[2] = Math.max(1, Math.round(v)); }), 'px'), this.campo('Área altura', this.numero(p.area[3], (v) => { p.area[3] = Math.max(1, Math.round(v)); }), 'px')),
      this.campo('Cor do texto', this.cor(p.cor, (v) => { p.cor = v; }), 'Cor dos textos dentro do painel.'));
    if (p.tipo === 'retrato' || p.tipo === 'arma') {
      col.append(this.campo('Zoom da imagem', this.numero(p.zoom, (v) => { p.zoom = Math.max(0.2, Math.min(5, v)); }, 0.05), 'Aumenta a imagem dentro do quadro (1 = cabe inteira). Útil quando a arte tem muita borda vazia: o que passar da borda é cortado.'));
    }
    if (p.tipo === 'botao') {
      const acao = el('select', {}, ...ACOES_BOTAO.map((a) => el('option', { value: a.id }, a.nome)));
      acao.value = p.acao;
      acao.addEventListener('change', () => { p.acao = acao.value as PainelMenu['acao']; this.mudou(); });
      col.append(this.campo('Ao clicar', acao, 'Sair fecha o menu; Arquivos abre a tela de arquivos; Voltar aos itens volta à tela de itens; Mapa (em breve).'),
        this.campo('Texto escrito', this.texto(p.texto, (v) => { p.texto = v; }), 'Texto por cima do botão. Deixe vazio quando a imagem (moldura ou a coluna atrás) já tem o nome desenhado, para não sobrepor.'));
    }
    if (p.tipo === 'itens') {
      col.append(el('div', { class: 'linha2' },
        this.campo('Colunas', this.numero(p.colunas, (v) => { p.colunas = Math.max(1, Math.min(12, Math.round(v))); }), 'Espaços por linha.'),
        this.campo('Linhas', this.numero(p.linhas, (v) => { p.linhas = Math.max(1, Math.min(8, Math.round(v))); }), 'Linhas de espaços.')),
        el('p', { class: 'dica-campo' }, `Total: ${p.colunas * p.linhas} espaços. Item de 2 espaços ocupa dois vizinhos na mesma linha.`));
    }
    if (p.tipo === 'retrato' || p.tipo === 'vida') {
      col.append(el('h3', {}, 'Faixas de vida (%)'), el('p', { class: 'dica-campo' }, 'Vida em % da vida cheia: até este valor vale a faixa (a menor que servir).'));
      p.faixas.forEach((f, k) => {
        const tirar = el('button', { type: 'button', class: 'perigo' }, '×');
        dica(tirar, 'Tirar faixa', 'Remove esta faixa.');
        tirar.addEventListener('click', () => { p.faixas.splice(k, 1); this.mudou(); });
        col.append(el('div', { class: 'linha2' },
          this.campo(`Até %`, this.numero(f.ate, (v) => { f.ate = Math.max(0, Math.min(100, v)); }), 'Vida até este % (ex.: 25 = perigo).'),
          p.tipo === 'vida' ? this.campo('Texto', this.texto(f.texto, (v) => { f.texto = v; }), 'Ex.: BEM, CUIDADO, PERIGO.') : el('span'), tirar));
        if (p.tipo === 'vida') col.append(this.campo('Cor', this.cor(f.cor || '#58c04a', (v) => { f.cor = v; }), 'Cor da barra e do texto nesta faixa.'));
        else col.append(this.campoImagem(`Imagem (até ${f.ate}%)`, f.imagem, (v) => { f.imagem = v; }, 'Foto da personagem nesta condição.', 'Sem imagem'));
      });
      const mais = el('button', { type: 'button', class: 'secundario largo' }, '+ Faixa');
      mais.addEventListener('click', () => { p.faixas.push({ ate: 100, imagem: '', cor: '#58c04a', texto: '' }); this.mudou(); });
      col.append(mais);
    }
    col.append(el('div', { class: 'linha-botoes' }, subir, descer, remover));
    return col;
  }

  // ---------- Submenu ----------
  private listaSubmenu() {
    return el('section', { class: 'pers-col' }, el('h3', {}, 'Submenu'),
      el('p', { class: 'dica-campo' }, 'Aparece ao escolher um item. Usar: no lugar certo (Área de uso), cura ou equipa. Combinar: escolhe o segundo item. Checar: foto grande e legenda.'));
  }
  private propriedadesSubmenu() {
    const s = this.m.submenu;
    const col = el('section', { class: 'pers-col pers-config' }, el('h3', {}, 'Caixa'),
      this.campoImagem('Imagem', s.imagem, (v) => { s.imagem = v; }, 'A arte com os 3 botões (USAR, COMBINAR, CHECAR). Sem imagem: botões padrão.', 'Botões padrão'),
      el('div', { class: 'linha2' }, this.campo('Largura', this.numero(s.w, (v) => { s.w = Math.max(10, Math.round(v)); }), 'px'), this.campo('Altura', this.numero(s.h, (v) => { s.h = Math.max(10, Math.round(v)); }), 'px')));
    for (const b of ['usar', 'combinar', 'checar'] as const) {
      const r = s[b];
      col.append(el('h3', {}, `Botão ${b.toUpperCase()}`),
        el('div', { class: 'linha2' }, this.campo('X', this.numero(r[0], (v) => { r[0] = Math.round(v); }), 'px dentro da caixa'), this.campo('Y', this.numero(r[1], (v) => { r[1] = Math.round(v); }), 'px dentro da caixa')),
        el('div', { class: 'linha2' }, this.campo('Largura', this.numero(r[2], (v) => { r[2] = Math.max(1, Math.round(v)); }), 'px'), this.campo('Altura', this.numero(r[3], (v) => { r[3] = Math.max(1, Math.round(v)); }), 'px')));
    }
    return col;
  }

  // ---------- Itens ----------
  private listaItens() {
    const col = el('section', { class: 'pers-col' }, el('h3', {}, 'Itens'));
    for (const i of this.it.itens) {
      const b = el('button', { type: 'button', class: 'pers-estado' + (i.nome === this.itemSel ? ' ativo' : '') + (i.imagem ? ' ok' : '') },
        el('strong', {}, i.nome), el('span', {}, i.tipo === 'arquivo' ? 'arquivo' : `${i.espacos} espaço(s) · ${USOS_ITEM.find((u) => u.id === i.uso)?.nome}`));
      b.addEventListener('click', () => { this.itemSel = i.nome; this.render(); });
      col.append(b);
    }
    const novo = el('input', { type: 'text', placeholder: 'Nome do item novo', list: 'menu-nomes' });
    const sug = el('datalist', { id: 'menu-nomes' }, ...[...this.nomes, ...this.armas.map((a) => a.nome)].filter((n) => !this.it.itens.some((i) => i.nome === n)).map((n) => el('option', { value: n })));
    const criar = el('button', { type: 'button', class: 'secundario largo' }, '+ Item');
    dica(criar, 'Novo item', 'O nome tem de ser o mesmo do Coletável (Propriedades › Comportamento › Nome do item). A lista sugere os que já existem no projeto e as armas.');
    criar.addEventListener('click', () => {
      const n = novo.value.trim();
      if (!n || this.it.itens.some((i) => i.nome.toLowerCase() === n.toLowerCase())) return;
      const arma = this.armas.find((a) => a.nome === n);
      this.it.itens.push(itemBase(n, arma ? { uso: 'arma', arma: arma.arquivo, espacos: arma.slots === 2 ? 2 : 1, imagem: arma.imagem, consome: false } : {}));
      this.itemSel = n;
      this.mudou();
    });
    col.append(el('h3', {}, 'Novo'), novo, sug, criar,
      el('p', { class: 'dica-campo' }, 'Itens sem cadastro também funcionam: ocupam 1 espaço e aparecem pelo nome. As armas entram sozinhas (espaços e imagem "menu" da ferramenta Armas) até você cadastrá-las aqui.'));
    return col;
  }

  private propriedadesItem() {
    const col = el('section', { class: 'pers-col pers-config' });
    const i = this.it.itens.find((x) => x.nome === this.itemSel);
    if (!i) { col.append(el('p', { class: 'dica-campo' }, 'Escolha um item na lista ou crie um.')); return col; }
    const tipo = el('select', {}, el('option', { value: 'item' }, 'Item (ocupa espaço)'), el('option', { value: 'arquivo' }, 'Arquivo (nota, foto, documento)'));
    tipo.value = i.tipo;
    tipo.addEventListener('change', () => { i.tipo = tipo.value as ConfigItem['tipo']; this.mudou(); });
    const esp = el('select', {}, el('option', { value: '1' }, '1 espaço'), el('option', { value: '2' }, '2 espaços (lado a lado)'));
    esp.value = String(i.espacos);
    esp.addEventListener('change', () => { i.espacos = Number(esp.value); this.mudou(); });
    const uso = el('select', {}, ...USOS_ITEM.map((u) => el('option', { value: u.id }, u.nome)));
    uso.value = i.uso;
    uso.addEventListener('change', () => { i.uso = uso.value as UsoItem; this.mudou(); });
    const descr = el('textarea', { rows: 4, placeholder: 'Ex.: Pistola 9mm do batalhão de polícia em que Lorena está alocada.' }) as HTMLTextAreaElement;
    descr.value = i.descricao;
    descr.addEventListener('change', () => { i.descricao = descr.value; this.mudou(false); });
    const renomear = this.texto(i.nome, (v) => {
      const n = v.trim();
      if (!n || this.it.itens.some((x) => x !== i && x.nome === n)) return;
      for (const r of this.it.receitas) { if (r.a === i.nome) r.a = n; if (r.b === i.nome) r.b = n; if (r.resultado === i.nome) r.resultado = n; }
      i.nome = n; this.itemSel = n;
    });
    const remover = el('button', { type: 'button', class: 'perigo' }, 'Remover item');
    remover.addEventListener('click', async () => {
      if ((await perguntar('Remover item', `Tirar "${i.nome}" do cadastro? (no jogo ele volta a ser um item comum de 1 espaço)`, ['Cancelar', 'Remover'])) !== 1) return;
      this.it.itens = this.it.itens.filter((x) => x !== i); this.itemSel = null; this.mudou();
    });
    col.append(el('h3', {}, i.nome),
      this.campo('Nome', renomear, 'O mesmo nome do Coletável e de jogo.inventario no código.'),
      this.campo('Tipo', tipo, 'Item: ocupa espaço no menu. Arquivo: vai para a lista de Arquivos (não ocupa espaço) e pode ser lido a qualquer momento.'),
      i.tipo === 'item' ? this.campo('Espaços', esp, 'Quantos espaços do menu ocupa.') : el('span'),
      this.campoImagem(i.tipo === 'arquivo' ? 'Ícone (opcional)' : 'Ícone no menu', i.imagem, (v) => { i.imagem = v; }, 'Imagem pequena no espaço do menu. Sem imagem: o nome escrito.', 'Só o nome'),
      this.campoImagem('Foto grande (Checar)', i.imagemGrande, (v) => { i.imagemGrande = v; }, 'Aparece ao Checar o item (ou ao ler o arquivo). Sem ela: o ícone em tamanho maior.', 'Usar o ícone'),
      this.campo(i.tipo === 'arquivo' ? 'Texto do arquivo' : 'Legenda (Checar)', descr, 'Texto embaixo da foto ao Checar (ou o conteúdo do arquivo).'));
    if (i.tipo === 'item') {
      col.append(this.campo('Ao Usar', uso, USOS_ITEM.map((u) => `${u.nome}: ${u.texto}`).join(' ')),
        el('p', { class: 'dica-campo' }, USOS_ITEM.find((u) => u.id === i.uso)!.texto));
      if (i.uso === 'curar') col.append(this.campo('Cura (vida)', this.numero(i.cura, (v) => { i.cura = Math.max(0, v); }), 'Quanto de vida recupera.'));
      if (i.uso === 'arma') {
        const arma = el('select', {}, el('option', { value: '' }, '—'), ...this.armas.map((a) => el('option', { value: a.arquivo }, `${a.nome} (${a.arquivo})`)));
        arma.value = i.arma;
        arma.addEventListener('change', () => { i.arma = arma.value; this.mudou(); });
        col.append(this.campo('Arma', arma, 'Arquivo da ferramenta Armas (A).'));
      }
      if (i.uso !== 'arma') col.append(this.marcar('Some ao usar', i.consome, (v) => { i.consome = v; }, 'Desmarcado: continua no menu depois de usado (ex.: alicate reutilizável). A Área de uso também decide se gasta.'));
      if (i.uso === 'area') col.append(el('p', { class: 'dica-campo' }, 'Crie a área com a ferramenta Zona (Z) e, em Propriedades › Comportamento, escolha "Área de uso de item" com este nome.'));
    }
    col.append(remover);
    return col;
  }

  private combinacoes() {
    const col = el('section', { class: 'pers-col pers-config menu-col-larga' }, el('h3', {}, 'Combinações'),
      el('p', { class: 'dica-campo' }, 'No jogo: escolha um item › Combinar › clique no outro. A ordem não importa. O código também pode decidir (gancho aoCombinar no jogo.js).'));
    const nomes = [...new Set([...this.it.itens.map((i) => i.nome), ...this.nomes])];
    const lista = el('datalist', { id: 'menu-comb-nomes' }, ...nomes.map((n) => el('option', { value: n })));
    col.append(lista);
    this.it.receitas.forEach((r, k) => {
      const inp = (v: string, aplicar: (v: string) => void) => { const i = el('input', { type: 'text', value: v, list: 'menu-comb-nomes' }); i.addEventListener('change', () => { aplicar(i.value.trim()); this.mudou(); }); return i; };
      const tirar = el('button', { type: 'button', class: 'perigo' }, '×');
      tirar.addEventListener('click', () => { this.it.receitas.splice(k, 1); this.mudou(); });
      col.append(el('div', { class: 'menu-receita' }, inp(r.a, (v) => { r.a = v; }), el('span', {}, '+'), inp(r.b, (v) => { r.b = v; }), el('span', {}, '→'),
        inp(r.resultado, (v) => { r.resultado = v; }), this.numero(r.quantidade, (v) => { r.quantidade = Math.max(1, Math.round(v)); }), tirar));
    });
    const mais = el('button', { type: 'button', class: 'secundario' }, '+ Combinação');
    mais.addEventListener('click', () => { this.it.receitas.push({ a: '', b: '', resultado: '', quantidade: 1 }); this.render(); });
    col.append(mais);
    return col;
  }

  private mensagens() {
    const ms = this.it.mensagens;
    return el('section', { class: 'pers-col pers-config menu-col-larga' }, el('h3', {}, 'Mensagens'),
      this.campo('Usar no lugar errado', this.texto(ms.aquiNao, (v) => { ms.aquiNao = v; }), 'Quando o jogador usa um item fora de uma Área de uso que o aceite.'),
      this.campo('Sem espaço', this.texto(ms.semEspaco, (v) => { ms.semEspaco = v; }), 'Ao encostar num item sem espaço livre no menu. {item} = nome do item.'),
      this.campo('Não combinam', this.texto(ms.naoCombina, (v) => { ms.naoCombina = v; }), 'Ao combinar dois itens sem combinação cadastrada.'),
      el('h3', {}, 'Inspeção'),
      el('p', { class: 'dica-campo' }, 'Perto de qualquer coisa com interação aparece um olho acima da personagem e, no canto de baixo à direita, o botão a apertar. Perto de um ponto de inspeção a tela ganha um leve foco.'),
      this.campoImagem('Imagem do olho', this.it.inspecao.olho, (v) => { this.it.inspecao.olho = v; }, 'Ícone acima da personagem. Sem imagem: o olho padrão.', 'Olho padrão'),
      this.campo('Força do foco', this.numero(this.it.inspecao.foco, (v) => { this.it.inspecao.foco = Math.max(0, Math.min(1, v)); }, 0.05), '0 = sem foco; 1 = bordas bem escuras. Sugestão: 0,3 a 0,4 (sutil).'));
  }

  // ---------- Campos ----------
  private campo(rotulo: string, input: HTMLElement, texto: string) {
    const id = 'mn-' + rotulo.replace(/\W+/g, '') + Math.random().toString(36).slice(2, 6);
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
  private cor(v: string, aplicar: (v: string) => void) {
    const i = el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(v) ? v : '#ffffff' });
    i.addEventListener('change', () => { aplicar(i.value); this.mudou(); });
    return i;
  }
  private marcar(rotulo: string, v: boolean, aplicar: (v: boolean) => void, texto: string) {
    const cb = el('input', { type: 'checkbox' }) as HTMLInputElement;
    cb.checked = v;
    cb.addEventListener('change', () => { aplicar(cb.checked); this.mudou(); });
    const lab = el('label', { class: 'check' }, cb, rotulo);
    dica(lab, rotulo, texto);
    return lab;
  }
  private campoImagem(rotulo: string, valor: string, aplicar: (v: string) => void, texto: string, nenhuma: string) {
    const sel = el('select', {}, el('option', { value: '' }, nenhuma), ...(valor ? [el('option', { value: 'jogo/' + valor }, valor.split('/').pop()!)] : []));
    sel.value = valor ? 'jogo/' + valor : '';
    const preencher = async () => {
      if (sel.dataset.cheio) return;
      sel.dataset.cheio = '1';
      if (!this.listaImagens) {
        const todas = await this.acoes.imagens();
        const pref = (x: string) => /(^|\/)(menu|hud|itens)\//i.test(x);
        this.listaImagens = [...todas.filter(pref), ...todas.filter((x) => !pref(x))];
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
      aplicar(!v ? '' : v.startsWith('jogo/') ? v.slice(5) : await this.acoes.garantir(v, 'menu'));
      this.mudou();
    });
    const mini = el('span', { class: 'hud-mini' });
    if (valor) mini.append(el('img', { src: this.acoes.url(valor), alt: '' }));
    const c = this.campo(rotulo, sel, texto);
    c.append(mini);
    c.classList.add('hud-campo-imagem');
    return c;
  }
}
