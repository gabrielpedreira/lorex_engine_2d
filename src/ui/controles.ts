// Ferramenta Controles: define qual tecla, combinação ou sequência dispara cada ação do jogo.
// As ações vêm de dois lugares: as fixas (andar, pular, interagir) e as animações extras do personagem
// (tiro, recarga, ataque…). Tudo fica em jogo/projeto.json → "controles" e vale para o ▶ Testar.
import {
  ACOES_SISTEMA, EntradaJogo, TECLAS_RESERVADAS, controlesPadrao, mesmoAtalho, nomeTecla, normalizarCodigo, textoAtalho,
  type Atalho, type Controles, type TipoAtalho,
} from '../core/controles';
import { extras, type Personagem } from '../core/personagem';
import { el, perguntar } from './dom';
import { dica } from './legenda';

const NOME_TIPO: Record<TipoAtalho, { nome: string; texto: string }> = {
  tecla: { nome: 'Tecla', texto: 'Uma tecla só. Aperte a tecla desejada.' },
  combinacao: { nome: 'Combinação', texto: 'Teclas apertadas JUNTAS (ex.: Shift + J). Segure todas e solte.' },
  sequencia: { nome: 'Sequência', texto: 'Teclas apertadas UMA DEPOIS DA OUTRA, rápido (ex.: ↓ › → › J, estilo golpe especial). Aperte em ordem e clique em Concluir (ou espere).' },
};

interface Captura { acao: string; tipo: TipoAtalho; teclas: string[]; seguradas: Set<string>; timer: number }

export class EditorControles {
  private raiz: HTMLElement;
  private c: Controles = controlesPadrao();
  private pers: Personagem | null = null;
  private captura: Captura | null = null;
  private provador = new EntradaJogo(controlesPadrao());
  private registro: string[] = [];

  aoAvisar: (msg: string) => void = () => {};
  /** Os controles mudaram (o editor grava em projeto.json). */
  aoMudar: (c: Controles) => void = () => {};

  constructor() {
    this.raiz = el('div', { class: 'tela-personagens tela-controles', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Controles', tabindex: -1 });
    this.raiz.hidden = true;
    document.body.append(this.raiz);
    this.raiz.addEventListener('keydown', (e) => this.teclaBaixo(e));
    this.raiz.addEventListener('keyup', (e) => this.teclaCima(e));
  }

  get aberta() { return !this.raiz.hidden; }

  abrir(controles: Controles, personagem: Personagem | null) {
    this.c = structuredClone(controles);
    this.pers = personagem;
    this.registro = [];
    this.raiz.hidden = false;
    this.render();
    this.raiz.focus();
  }

  fechar() {
    this.cancelarCaptura();
    this.raiz.hidden = true;
  }

  private mudou() {
    this.aoMudar(structuredClone(this.c));
    this.render();
  }

  /** Ações mostradas: fixas + extras do personagem + as que só existem no arquivo (de outro personagem). */
  private grupos() {
    const grupos: { titulo: string; acoes: { id: string; nome: string; texto: string; variante?: string }[] }[] = [];
    for (const a of ACOES_SISTEMA) {
      let g = grupos.find((x) => x.titulo === a.grupo);
      if (!g) grupos.push(g = { titulo: a.grupo, acoes: [] });
      g.acoes.push(a);
    }
    const conhecidas = new Set(ACOES_SISTEMA.map((a) => a.id));
    if (this.pers) {
      const ex = extras(this.pers);
      const variantes = new Map(ex.filter(([, a]) => a.aoAndar).map(([k, a]) => [a.aoAndar!, k]));
      grupos.push({
        titulo: `Ações de ${this.pers.nome}`,
        acoes: ex.map(([k, a]) => {
          conhecidas.add(k);
          const de = variantes.get(k);
          const nomeDe = de ? this.pers!.animacoes[de]?.nome ?? de : '';
          return {
            id: k, nome: a.nome ?? k,
            texto: de ? `Toca sozinha no lugar de "${nomeDe}" quando o personagem está andando; não precisa de tecla.`
              : `Animação extra "${k}" do personagem${a.repetir ? ' (repete enquanto a tecla estiver segurada)' : ' (toca uma vez)'}${a.travaMovimento ? '; trava o movimento enquanto toca' : ''}.`,
            ...(de ? { variante: nomeDe } : {}),
          };
        }),
      });
    }
    const outras = Object.keys(this.c.acoes).filter((k) => !conhecidas.has(k));
    if (outras.length) grupos.push({
      titulo: 'Outras ações (de outros personagens)',
      acoes: outras.map((k) => ({ id: k, nome: k, texto: `"${k}" não é uma animação de ${this.pers?.nome ?? 'nenhum personagem do teste'}. Fica guardada para quando um personagem tiver uma animação com essa chave.` })),
    });
    return grupos;
  }

  /** Outras ações que usam exatamente o mesmo atalho. */
  private conflitos(acao: string, a: Atalho) {
    return Object.entries(this.c.acoes).filter(([k, l]) => k !== acao && l.some((b) => mesmoAtalho(a, b))).map(([k]) => k);
  }

  // ---------- Interface ----------
  private render() {
    const padrao = el('button', { type: 'button', class: 'secundario' }, 'Restaurar padrão');
    dica(padrao, 'Restaurar padrão', 'Volta às teclas pré-definidas: setas/A D andam, Espaço/W/↑ pulam, E interage, J ou X atira, R recarrega.');
    padrao.addEventListener('click', async () => {
      if ((await perguntar('Restaurar os controles', 'Todas as teclas voltam ao padrão. As que você definiu serão perdidas.', ['Cancelar', 'Restaurar'])) !== 1) return;
      this.c = controlesPadrao();
      this.mudou();
      this.aoAvisar('Controles restaurados para o padrão.');
    });
    const fechar = el('button', { type: 'button', class: 'primario' }, 'Fechar');
    dica(fechar, 'Fechar', 'As mudanças já ficam salvas no projeto.', 'Esc');
    fechar.addEventListener('click', () => this.fechar());
    const topo = el('header', { class: 'pers-topo' },
      el('h2', {}, 'Controles'),
      el('span', { class: 'dica-campo' }, this.pers ? `Ações de ${this.pers.nome} (personagem do ▶ Testar)` : 'Sem personagem no ▶ Testar: só as ações fixas'),
      el('div', { class: 'espaco' }),
      el('span', { class: 'dica-campo' }, 'Salvo automaticamente em jogo/projeto.json'),
      padrao, fechar);

    const lista = el('section', { class: 'pers-col ctrl-lista' });
    for (const g of this.grupos()) {
      lista.append(el('h3', {}, g.titulo));
      for (const a of g.acoes) lista.append(this.linha(a));
    }
    if (this.pers && !extras(this.pers).length) {
      lista.append(el('p', { class: 'dica-campo' }, `${this.pers.nome} ainda não tem animações extras. Crie em Personagens (K) → "+ Nova animação" (ex.: tiro) e ela aparece aqui para receber uma tecla.`));
    }

    this.raiz.replaceChildren(el('div', { class: 'pers-caixa ctrl-caixa' }, topo,
      el('div', { class: 'ctrl-colunas' }, lista, this.colunaLateral())));
    // O botão clicado some ao redesenhar: o foco volta para a tela, para as teclas continuarem chegando aqui
    if (!this.raiz.contains(document.activeElement)) this.raiz.focus();
  }

  private linha(a: { id: string; nome: string; texto: string; variante?: string }) {
    const atalhos = this.c.acoes[a.id] ?? [];
    const nome = el('div', { class: 'ctrl-nome' }, el('strong', {}, a.nome), el('code', {}, a.id));
    dica(nome, a.nome, a.texto);
    const linha = el('div', { class: 'ctrl-linha' + (this.captura?.acao === a.id ? ' capturando' : '') }, nome);
    if (a.variante && !atalhos.length) {
      linha.append(el('span', { class: 'dica-campo' }, `automática ao andar com ${a.variante}`));
      return linha;
    }
    const chips = el('div', { class: 'ctrl-chips' });
    atalhos.forEach((at, i) => {
      const conf = this.conflitos(a.id, at);
      const chip = el('span', { class: 'ctrl-chip' + (conf.length ? ' conflito' : '') }, el('span', { class: 'ctrl-tipo' }, NOME_TIPO[at.tipo].nome[0]), ...this.kbds(at));
      dica(chip, `${NOME_TIPO[at.tipo].nome}: ${textoAtalho(at)}`, conf.length ? `Também usado em: ${conf.join(', ')}. As duas ações disparam juntas.` : NOME_TIPO[at.tipo].texto);
      const x = el('button', { type: 'button', class: 'ctrl-remover', 'aria-label': `Remover ${textoAtalho(at)}` }, '×');
      dica(x, 'Remover este atalho');
      x.addEventListener('click', () => { atalhos.splice(i, 1); this.c.acoes[a.id] = atalhos; this.mudou(); });
      chip.append(x);
      chips.append(chip);
    });
    if (!atalhos.length) chips.append(el('span', { class: 'dica-campo' }, 'sem tecla'));
    linha.append(chips);

    if (this.captura?.acao === a.id) {
      const cap = this.captura;
      const texto = cap.teclas.length ? cap.teclas.map(nomeTecla).join(cap.tipo === 'sequencia' ? ' › ' : ' + ') : '';
      const msg = cap.tipo === 'tecla' ? 'Aperte a tecla…' : cap.tipo === 'combinacao' ? 'Segure as teclas juntas e solte…' : 'Aperte as teclas em ordem…';
      const area = el('div', { class: 'ctrl-captura' }, el('span', {}, texto || msg), el('span', { class: 'dica-campo' }, 'Esc cancela'));
      if (cap.tipo === 'sequencia') {
        const ok = el('button', { type: 'button', class: 'primario' }, 'Concluir');
        ok.disabled = cap.teclas.length < 2;
        ok.addEventListener('click', () => this.concluirCaptura());
        area.append(ok);
      }
      linha.append(area);
    } else {
      const botoes = el('div', { class: 'ctrl-add' });
      for (const tipo of ['tecla', 'combinacao', 'sequencia'] as TipoAtalho[]) {
        const b = el('button', { type: 'button', class: 'secundario' }, `+ ${NOME_TIPO[tipo].nome}`);
        dica(b, `Adicionar ${NOME_TIPO[tipo].nome.toLowerCase()}`, NOME_TIPO[tipo].texto);
        b.addEventListener('click', () => this.iniciarCaptura(a.id, tipo));
        botoes.append(b);
      }
      linha.append(botoes);
    }
    return linha;
  }

  private kbds(a: Atalho) {
    const sep = a.tipo === 'sequencia' ? '›' : '+';
    const r: (Node | string)[] = [];
    a.teclas.forEach((k, i) => { if (i) r.push(el('span', { class: 'ctrl-sep' }, sep)); r.push(el('kbd', {}, nomeTecla(k))); });
    return r;
  }

  private colunaLateral() {
    const col = el('section', { class: 'pers-col ctrl-lateral' });
    const id = 'ctrl-janela';
    const janela = el('input', { type: 'range', id, min: 0.15, max: 1, step: 0.05, value: this.c.janelaSequencia });
    const saida = el('output', { for: id }, `${this.c.janelaSequencia.toFixed(2)} s`);
    janela.addEventListener('input', () => { saida.textContent = `${Number(janela.value).toFixed(2)} s`; });
    janela.addEventListener('change', () => { this.c.janelaSequencia = Number(janela.value); this.mudou(); });
    const lab = el('label', { for: id }, 'Tempo entre teclas da sequência');
    dica(lab, 'Tempo da sequência', 'Intervalo máximo entre uma tecla e a próxima numa sequência. Menor = exige mais rapidez.');

    this.provador.controles = this.c;
    const registro = el('div', { class: 'ctrl-registro', 'aria-live': 'polite' },
      ...(this.registro.length ? this.registro.map((r) => el('div', {}, r)) : [el('span', { class: 'dica-campo' }, 'Aperte as teclas aqui para ver quais ações disparam.')]));
    dica(registro, 'Experimentar', 'Com esta tela aberta (e sem estar adicionando um atalho), aperte teclas: aparece qual ação cada uma dispara, inclusive combinações e sequências.');

    col.append(
      el('h3', {}, 'Experimentar'), registro,
      el('h3', {}, 'Ajustes'), el('div', { class: 'deslizante' }, lab, janela, saida),
      el('h3', {}, 'Como funciona'),
      el('p', { class: 'dica-campo' }, 'Cada ação pode ter vários atalhos; qualquer um dispara. Tipos: T = tecla, C = combinação (juntas), S = sequência (em ordem).'),
      el('p', { class: 'dica-campo' }, 'Quando uma tecla serve a uma combinação ou sequência e também sozinha, a mais específica vence (Shift + J não dispara o J sozinho).'),
      el('p', { class: 'dica-campo' }, 'As ações do personagem são as animações extras dele (Personagens, K). No código, a mesma chave toca a animação: tocar("tiro").'),
      el('p', { class: 'dica-campo' }, 'Reservadas pela engine no teste: Esc e F5 (voltar), F6 (reiniciar).'),
    );
    return col;
  }

  // ---------- Captura de teclas ----------
  private iniciarCaptura(acao: string, tipo: TipoAtalho) {
    this.cancelarCaptura();
    this.captura = { acao, tipo, teclas: [], seguradas: new Set(), timer: 0 };
    this.render();
    this.raiz.focus();
  }

  private cancelarCaptura() {
    if (this.captura) clearTimeout(this.captura.timer);
    const tinha = !!this.captura;
    this.captura = null;
    if (tinha && this.aberta) this.render();
  }

  private concluirCaptura() {
    const cap = this.captura;
    if (!cap) return;
    clearTimeout(cap.timer);
    this.captura = null;
    if (!cap.teclas.length) { this.render(); return; }
    let tipo = cap.tipo;
    if (cap.teclas.length === 1) tipo = 'tecla'; // combinação/sequência de uma tecla só é uma tecla
    const novo: Atalho = { tipo, teclas: cap.teclas };
    const lista = this.c.acoes[cap.acao] ?? [];
    if (lista.some((a) => mesmoAtalho(a, novo))) { this.aoAvisar('Esse atalho já está nesta ação.'); this.render(); return; }
    lista.push(novo);
    this.c.acoes[cap.acao] = lista;
    const conf = this.conflitos(cap.acao, novo);
    this.aoAvisar(`${textoAtalho(novo)} → ${cap.acao}` + (conf.length ? `. Atenção: também usado em ${conf.join(', ')}.` : ''));
    this.mudou();
  }

  private teclaBaixo(e: KeyboardEvent) {
    e.stopPropagation(); // nada vaza para os atalhos do editor
    const cap = this.captura;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (cap) this.cancelarCaptura(); else this.fechar();
      return;
    }
    if (!cap) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement && (e.key === 'Enter' || e.key === ' ')) return;
      this.experimentar(e);
      return;
    }
    e.preventDefault();
    if (e.repeat) return;
    const code = normalizarCodigo(e.code);
    if (TECLAS_RESERVADAS.has(code)) { this.aoAvisar(`${e.key} é reservada pela engine durante o teste.`); return; }
    if (cap.tipo === 'tecla') { cap.teclas = [code]; this.concluirCaptura(); return; }
    if (cap.tipo === 'combinacao') {
      cap.seguradas.add(code);
      if (!cap.teclas.includes(code)) cap.teclas.push(code);
    } else {
      cap.teclas.push(code);
      clearTimeout(cap.timer);
      cap.timer = window.setTimeout(() => { if (this.captura === cap && cap.teclas.length >= 2) this.concluirCaptura(); }, 1500);
    }
    this.render();
  }

  private teclaCima(e: KeyboardEvent) {
    e.stopPropagation();
    const cap = this.captura;
    if (!cap) { this.provador.soltar(e.code); return; }
    if (cap.tipo !== 'combinacao') return;
    cap.seguradas.delete(normalizarCodigo(e.code));
    if (!cap.seguradas.size && cap.teclas.length) this.concluirCaptura();
  }

  private experimentar(e: KeyboardEvent) {
    if (TECLAS_RESERVADAS.has(e.code)) return;
    e.preventDefault();
    if (e.repeat) return;
    if (/^(Shift|Control|Alt|Meta)/.test(e.code)) { this.provador.apertar(e.code, performance.now() / 1000); return; } // modificador sozinho não dispara nada
    const t = performance.now() / 1000;
    this.provador.apertar(e.code, t);
    this.provador.atualizar(t);
    const todas = [...ACOES_SISTEMA.map((a) => a.id), ...Object.keys(this.c.acoes)];
    const disparou = [...new Set(todas)].filter((a) => this.provador.apertou(a));
    this.registro.unshift(`${nomeTecla(normalizarCodigo(e.code))} → ${disparou.length ? disparou.join(', ') : '(nada)'}`);
    this.registro = this.registro.slice(0, 8);
    this.render();
  }
}
