// Bloco "Salas" (abaixo de Camadas): todas as fases/áreas do jogo numa lista com busca; clicar abre a sala.
import { normalizarFase } from '../core/fase';
import type { Plataforma } from '../plataforma/plataforma';
import { el } from './dom';
import { dica } from './legenda';

interface ItemSala { arquivo: string; nome: string; tipo: 'fase' | 'area'; regiao: string; passagens: number }

export class PainelSalas {
  private lista: HTMLElement;
  private busca: HTMLInputElement;
  private itens: ItemSala[] = [];
  private atual = '';
  /** Clique numa sala: abrir no editor. */
  aoAbrir: (arquivo: string) => void = () => {};

  constructor(raiz: HTMLElement, private plat: Plataforma) {
    const titulo = el('div', { class: 'painel-titulo salas-titulo' }, el('span', {}, 'Salas'), el('span', { class: 'contador' }));
    dica(titulo, 'Salas', 'Todas as fases e áreas do jogo. Clique numa para abrir no editor (pergunta antes se a atual tiver alterações não salvas). Ctrl+P vai direto à busca; Enter abre a primeira encontrada. As ligações entre elas ficam no Mapa (M).', 'Ctrl+P');
    this.busca = el('input', { type: 'search', placeholder: 'Buscar sala…', 'aria-label': 'Buscar sala' }) as HTMLInputElement;
    this.busca.addEventListener('input', () => this.render());
    this.busca.addEventListener('keydown', (e) => {
      e.stopPropagation(); // digitar não aciona atalhos do editor
      if (e.key === 'Enter') { const primeiro = this.filtrados()[0]; if (primeiro) this.aoAbrir(primeiro.arquivo); }
      if (e.key === 'Escape') { this.busca.value = ''; this.render(); this.busca.blur(); }
    });
    this.lista = el('div', { class: 'salas-lista', role: 'list' });
    raiz.append(titulo, el('div', { class: 'salas-busca' }, this.busca), this.lista);
  }

  /** Relê as salas do projeto (nomes, tipo, região) e marca a aberta. */
  async atualizar(atual: string, emMemoria?: { arquivo: string; nome: string; tipo: 'fase' | 'area'; regiao: string; passagens: number }) {
    this.atual = atual;
    const arquivos = await this.plat.listarFases();
    this.itens = await Promise.all(arquivos.map(async (arquivo): Promise<ItemSala> => {
      if (emMemoria && emMemoria.arquivo === arquivo) return emMemoria;
      try {
        const f = normalizarFase(JSON.parse(await this.plat.lerFase(arquivo)));
        return { arquivo, nome: f.nome, tipo: f.tipo, regiao: f.regiao, passagens: f.objetos.filter((o) => o.comportamentos[0]?.tipo === 'saida').length };
      } catch { return { arquivo, nome: arquivo, tipo: 'fase', regiao: '', passagens: 0 }; }
    }));
    this.itens.sort((a, b) => (Number(!a.regiao) - Number(!b.regiao)) || a.regiao.localeCompare(b.regiao, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR')); // sem região por último
    this.render();
  }

  /** Leva o foco à busca (Ctrl+P), garantindo o bloco visível. */
  focarBusca() { this.busca.scrollIntoView({ block: 'nearest' }); this.busca.focus(); this.busca.select(); }

  /** Só troca qual está aberta (sem reler os arquivos). */
  marcarAtual(atual: string) { this.atual = atual; this.render(); }

  private filtrados() {
    const q = this.busca.value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return q ? this.itens.filter((s) => norm(`${s.nome} ${s.arquivo} ${s.regiao}`).includes(q)) : this.itens;
  }

  private render() {
    const lista = this.filtrados();
    const cont = this.lista.parentElement?.querySelector('.salas-titulo .contador');
    if (cont) cont.textContent = this.busca.value ? `${lista.length}/${this.itens.length}` : String(this.itens.length);
    if (!lista.length) {
      this.lista.replaceChildren(el('div', { class: 'vazio' }, this.itens.length ? 'Nenhuma sala com esse nome.' : 'Nenhuma sala salva ainda.'));
      return;
    }
    this.lista.replaceChildren(...lista.map((s) => {
      const b = el('button', { type: 'button', class: 'sala-item' + (s.arquivo === this.atual ? ' atual' : ''), role: 'listitem' },
        el('span', { class: 'sala-nome' }, s.nome),
        el('span', { class: 'sala-det' }, `${s.tipo === 'area' ? 'área' : 'fase'}${s.regiao ? ` · ${s.regiao}` : ''}${s.passagens ? ` · ${s.passagens} passagem(ns)` : ''} · ${s.arquivo}`));
      dica(b, s.nome, s.arquivo === this.atual ? 'Esta é a sala aberta no editor.' : `Abrir ${s.arquivo} no editor.`);
      b.addEventListener('click', () => { if (s.arquivo !== this.atual) this.aoAbrir(s.arquivo); });
      return b;
    }));
  }
}
