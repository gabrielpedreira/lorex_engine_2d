// Caixa de ferramentas: cada pasta escolhida vira uma ferramenta com as miniaturas das suas imagens.
// Clique numa miniatura para "armar" o carimbo; clique no cenário para colocar (repete até Esc ou botão direito).
import { nomeDoArquivo } from '../core/fase';
import type { Ferramenta, Plataforma } from '../plataforma/plataforma';
import { el, escolherPastas, perguntar } from './dom';

export class CaixaFerramentas {
  private corpo: HTMLElement;
  private ferramentas: Ferramenta[] = [];
  private assets: string[] = [];
  private ativo: string | null = null;
  private fechadas = new Set<string>();

  /** Arma (ou desarma, com null) o carimbo com um asset. */
  aoArmar: (caminhoRaiz: string | null, ferramenta: Ferramenta | null) => void = () => {};
  /** Lista de ferramentas mudou: salvar em jogo/projeto.json. */
  aoMudar: (lista: Ferramenta[]) => void = () => {};

  constructor(raiz: HTMLElement, private plat: Plataforma) {
    this.corpo = el('div', { class: 'ferr-lista' });
    const adicionar = el('button', { type: 'button', class: 'secundario largo' }, '+ Adicionar pastas');
    adicionar.addEventListener('click', () => void this.adicionarPastas());
    raiz.append(this.corpo, el('div', { class: 'ferr-rodape' }, adicionar));
  }

  definir(ferramentas: Ferramenta[], assets: string[]) {
    this.ferramentas = ferramentas;
    this.assets = assets;
    this.render();
  }

  /** Desmarca a miniatura ativa (quando o carimbo é cancelado no cenário). */
  desarmar() {
    this.ativo = null;
    this.corpo.querySelectorAll('.ferr-item.ativo').forEach((e) => e.classList.remove('ativo'));
  }

  private imagensDe(pasta: string) {
    return this.assets.filter((a) => a.startsWith(pasta + '/'));
  }

  private render() {
    this.corpo.replaceChildren();
    if (!this.ferramentas.length) {
      this.corpo.append(el('div', { class: 'vazio ferr-vazio' },
        el('strong', {}, 'Monte sua caixa de ferramentas'),
        el('p', {}, 'Escolha pastas do projeto (ex.: "elementos de cenario", "chaves e itens"). Cada pasta vira uma ferramenta com as miniaturas das imagens dela.'),
        el('p', {}, 'Clique numa miniatura e depois no cenário para colocar o elemento na camada ativa. Continue clicando para colocar mais; Esc ou botão direito para parar.')));
      return;
    }
    for (const f of this.ferramentas) {
      const imagens = this.imagensDe(f.pasta);
      const det = el('details', { class: 'bib-grupo ferr' });
      det.open = !this.fechadas.has(f.pasta);
      det.addEventListener('toggle', () => { if (det.open) this.fechadas.delete(f.pasta); else this.fechadas.add(f.pasta); });

      const tipo = el('button', { type: 'button', class: 'chip-tipo ' + f.tipoPadrao, title: 'Tipo dos objetos colocados com esta ferramenta. Clique para trocar.' },
        f.tipoPadrao === 'interativo' ? 'Interativo' : 'Estático');
      tipo.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        f.tipoPadrao = f.tipoPadrao === 'interativo' ? 'estatico' : 'interativo';
        this.aoMudar(this.ferramentas); this.render();
      });
      const remover = el('button', { type: 'button', class: 'icone-x', title: 'Remover ferramenta (a pasta não é apagada)', 'aria-label': `Remover ferramenta ${f.nome}` }, '×');
      remover.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        const r = await perguntar('Remover ferramenta', `Remover "${f.nome}" da caixa de ferramentas? A pasta e as imagens continuam no projeto.`, ['Cancelar', 'Remover']);
        if (r !== 1) return;
        this.ferramentas = this.ferramentas.filter((x) => x !== f);
        this.aoMudar(this.ferramentas); this.render();
      });

      det.append(el('summary', { title: f.pasta },
        el('span', {}, f.nome), tipo, el('span', { class: 'contador' }, String(imagens.length)), remover));
      const grade = el('div', { class: 'bib-grade' });
      if (!imagens.length) grade.append(el('div', { class: 'vazio' }, 'Nenhuma imagem .png/.jpg nesta pasta.'));
      for (const caminho of imagens) {
        const it = el('button', { type: 'button', class: 'ferr-item' + (this.ativo === caminho ? ' ativo' : ''), title: `${nomeDoArquivo(caminho)}: clique e depois clique no cenário` },
          el('div', { class: 'bib-miniatura' }, el('img', { src: this.plat.urlRaiz(caminho), alt: '', loading: 'lazy', draggable: 'false' })),
          el('span', {}, nomeDoArquivo(caminho)));
        it.addEventListener('click', () => {
          const armar = this.ativo !== caminho;
          this.desarmar();
          if (armar) { this.ativo = caminho; it.classList.add('ativo'); }
          this.aoArmar(armar ? caminho : null, armar ? f : null);
        });
        grade.append(it);
      }
      det.append(grade);
      this.corpo.append(det);
    }
  }

  private async adicionarPastas() {
    // Pastas que contêm imagens (inclui as pastas-mãe), fora de jogo/
    const contagem = new Map<string, number>();
    for (const a of this.assets) {
      if (a.startsWith('jogo/')) continue;
      const partes = a.split('/');
      for (let i = 1; i < partes.length; i++) {
        const p = partes.slice(0, i).join('/');
        contagem.set(p, (contagem.get(p) ?? 0) + 1);
      }
    }
    const usadas = new Set(this.ferramentas.map((f) => f.pasta));
    const opcoes = [...contagem.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
      .map(([pasta, qtd]) => ({ pasta, qtd, jaUsada: usadas.has(pasta) }));
    const escolhidas = await escolherPastas('Adicionar pastas à caixa de ferramentas',
      'Cada pasta vira uma ferramenta. Itens e chaves costumam ser interativos; móveis e entulho, estáticos (dá para trocar depois).', opcoes);
    if (!escolhidas?.length) return;
    for (const pasta of escolhidas) {
      const nome = pasta.split('/').pop() ?? pasta;
      const interativo = /chave|ite[mn]|arma|porta|alavanca|interat|colet/i.test(nome);
      this.ferramentas.push({ pasta, nome: nome.charAt(0).toUpperCase() + nome.slice(1), tipoPadrao: interativo ? 'interativo' : 'estatico' });
    }
    this.aoMudar(this.ferramentas);
    this.render();
  }
}
