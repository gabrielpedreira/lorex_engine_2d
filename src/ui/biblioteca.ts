// Painel esquerdo: assets do projeto agrupados em "Em uso" (jogo/assets) e "Apoio" (resto da pasta).
import { nomeDoArquivo } from '../core/fase';
import type { Plataforma } from '../plataforma/plataforma';
import { el } from './dom';
import { dica } from './legenda';

export class Biblioteca {
  private assets: string[] = [];
  private filtro = '';
  private lista: HTMLElement;
  private abertos = new Set<string>(['Em uso']);

  /** Botão "Limpar sem uso" no grupo Em uso (null = não mostrar). */
  aoLimpar: (() => void) | null = null;

  /** Duplo clique: adicionar no centro da visão, na camada ativa. */
  aoAdicionar: (caminhoRaiz: string) => void = () => {};

  constructor(raiz: HTMLElement, private plat: Plataforma) {
    const busca = el('input', { type: 'search', placeholder: 'Buscar asset…', 'aria-label': 'Buscar asset' });
    busca.addEventListener('input', () => { this.filtro = busca.value.trim().toLowerCase(); this.render(); });
    this.lista = el('div', { class: 'bib-lista' });
    raiz.append(
      el('div', { class: 'painel-titulo' }, 'Biblioteca'),
      el('div', { class: 'bib-busca' }, busca),
      this.lista,
      el('div', { class: 'dica' }, 'Arraste para o cenário ou dê duplo clique para pôr no centro da camada ativa.'),
    );
  }

  get caminhos(): string[] { return this.assets; }

  async recarregar() {
    this.assets = await this.plat.listarAssets();
    this.render();
  }

  private grupos(): Map<string, string[]> {
    const g = new Map<string, string[]>();
    const add = (k: string, v: string) => { if (!g.has(k)) g.set(k, []); g.get(k)!.push(v); };
    for (const a of this.assets) {
      if (this.filtro && !a.toLowerCase().includes(this.filtro)) continue;
      if (a.startsWith('jogo/')) { add('Em uso', a); continue; }
      const partes = a.split('/');
      add(partes.length > 1 ? partes[0] : 'Raiz do projeto', a);
    }
    return g;
  }

  private render() {
    this.lista.replaceChildren();
    const grupos = this.grupos();
    if (!grupos.has('Em uso') && !this.filtro) grupos.set('Em uso', []);
    const ordem = [...grupos.keys()].sort((a, b) =>
      a === 'Em uso' ? -1 : b === 'Em uso' ? 1 : a.localeCompare(b, 'pt-BR'));

    for (const nome of ordem) {
      const itens = grupos.get(nome)!;
      const det = el('details', { class: 'bib-grupo' });
      det.open = this.abertos.has(nome) || !!this.filtro;
      det.addEventListener('toggle', () => { if (det.open) this.abertos.add(nome); else this.abertos.delete(nome); });
      const rotulo = nome === 'Em uso' ? 'Em uso no jogo' : nome;
      det.append(el('summary', {}, el('span', {}, rotulo), el('span', { class: 'contador' }, String(itens.length))));
      const grade = el('div', { class: 'bib-grade' });
      if (!itens.length) grade.append(el('div', { class: 'vazio' }, 'Nada em uso ainda. Ao colocar um asset numa fase, ele é copiado para cá.'));
      for (const caminho of itens) grade.append(this.item(caminho));
      det.append(grade);
      if (nome === 'Em uso' && itens.length && this.aoLimpar) {
        const b = el('button', { type: 'button', class: 'secundario largo', title: 'Manda para a Lixeira as imagens de jogo/assets que nenhuma fase usa' }, 'Limpar cópias sem uso');
        b.addEventListener('click', () => this.aoLimpar?.());
        det.append(el('div', { class: 'bib-acao' }, b));
      }
      this.lista.append(det);
    }
  }

  private item(caminho: string): HTMLElement {
    const nome = nomeDoArquivo(caminho);
    const img = el('img', { src: this.plat.urlRaiz(caminho), alt: '', loading: 'lazy', draggable: 'false' });
    const it = el('div', { class: 'bib-item', draggable: 'true', tabindex: 0, 'data-caminho': caminho },
      el('div', { class: 'bib-miniatura' }, img),
      el('span', {}, nome));
    dica(it, nome, `${caminho}. Arraste para o cenário ou dê duplo clique para pôr no centro da camada ativa.`);
    it.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('application/x-lorex-asset', caminho);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
    });
    it.addEventListener('dblclick', () => this.aoAdicionar(caminho));
    it.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.aoAdicionar(caminho); });
    return it;
  }
}
