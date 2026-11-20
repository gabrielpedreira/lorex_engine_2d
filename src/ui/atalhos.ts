// Guia de teclas de atalho (botão no rodapé ou F1). REGRA: ferramenta ou atalho novo entra aqui também.
import { el } from './dom';
import { dica } from './legenda';

interface Grupo { titulo: string; itens: [string, string][] }

/** Atalhos da engine, por área. teclasTeste: teclas atuais do ▶ Testar (ferramenta Controles). */
export function gruposAtalhos(teclasTeste: [string, string][]): Grupo[] {
  return [
    { titulo: 'Geral', itens: [
      ['Ctrl+S', 'Salvar a fase'], ['Ctrl+N', 'Nova fase (tela inicial)'], ['Ctrl+Z / Ctrl+Y', 'Desfazer / refazer'],
      ['Roda do mouse', 'Zoom'], ['+ / −', 'Zoom em passos'], ['Home', 'Enquadrar a fase'],
      ['Espaço + arrastar', 'Mover a visão (também botão do meio)'], ['Shift + roda', 'Rolar na horizontal'],
      ['G', 'Mostrar grade'], ['E', 'Encaixar na grade'], ['P', 'Prévia de parallax'],
      ['Shift+C', 'Mostrar colisões'], ['Shift+E', 'Prévia dos efeitos'], ['T', 'Mostrar/ocultar a caixa de ferramentas'],
      ['L', 'Mostrar/ocultar o Log'], ['F1', 'Este guia'],
    ] },
    { titulo: 'Ferramentas (barra lateral)', itens: [
      ['V', 'Selecionar e mover'], ['H', 'Mover a visão'], ['C', 'Colisão'], ['I', 'Início do jogador'],
      ['N', 'Inimigos'], ['K', 'Personagens'], ['U', 'HUD'], ['M', 'Mapa (salas e passagens)'], ['B', 'Controles'], ['O', 'Código'], ['F5', '▶ Testar / parar'],
    ] },
    { titulo: 'Objetos', itens: [
      ['Clique', 'Selecionar · arrastar move · alças nos cantos mudam o tamanho'],
      ['Shift + clique', 'Carimbar e continuar carimbando'], ['Esc / botão direito', 'Cancelar o carimbo'],
      ['[ / ]', 'Diminuir / aumentar (Shift: 1%)'], ['Alt + roda', 'Mudar o tamanho'],
      ['Setas', 'Mover 1 px (Shift: 8 px)'], ['F', 'Espelhar'], ['Del', 'Excluir'], ['Ctrl+D', 'Duplicar'],
      ['Ctrl+C / Ctrl+X / Ctrl+V', 'Copiar / recortar / colar (no mouse)'], ['Ctrl+Shift+setas', 'Cópia encostada ao lado (loop)'],
      ['Alt ao arrastar', 'Desliga o ímã entre objetos'],
    ] },
    { titulo: 'Colisão', itens: [
      ['1 a 6', 'Bloco, rampa ◢, rampa ◣, polígono, linha, mão livre'], ['X', 'Sólido ↔ atravessável'],
      ['Enter / duplo clique', 'Terminar polígono ou linha'], ['Backspace', 'Desfazer o último ponto'], ['Esc', 'Cancelar'],
      ['Duplo clique na borda', 'Criar vértice'], ['Alt + clique', 'Apagar vértice'], ['Shift ao escalar', 'Manter a proporção'],
    ] },
    { titulo: 'Inimigos (N)', itens: [
      ['Clique no vazio', 'Colocar o tipo escolhido (pisa no chão abaixo)'], ['Arrastar', 'Mover (gruda no chão; Alt solta)'], ['Del', 'Excluir'],
    ] },
    { titulo: 'Mapa (M)', itens: [
      ['+ Sala', 'Adicionar um local (área nova, com chão)'], ['Clique no nome', 'Renomear a sala'],
      ['Arrastar da bolinha azul da borda', 'Conectar a outra sala (cria as passagens nas duas)'],
      ['Arrastar de uma passagem ▭', 'Conectar a outra passagem, ao meio de uma sala (cria a passagem lá) ou ao ▼ início dela'],
      ['Clique no ◆', 'Escolher a transição (corte, escurecer, tela cheia animada, som)'],
      ['Arrastar uma sala', 'Mover no diagrama'], ['Duplo clique na sala', 'Abrir a sala no editor'],
      ['Arrastar o fundo / roda', 'Mover a visão / zoom'], ['Del', 'Excluir a conexão ou a passagem selecionada'], ['Home', 'Enquadrar'], ['Esc', 'Fechar'],
    ] },
    { titulo: '▶ Testar', itens: [
      ...teclasTeste, ['F6', 'Reiniciar a fase'], ['Esc / F5', 'Voltar ao editor'], ['Shift+C', 'Mostrar colisões'],
    ] },
    { titulo: 'Código (O)', itens: [
      ['Ctrl+S', 'Salvar o script'], ['Ctrl+Shift+S', 'Salvar todos'], ['F5', 'Salvar e testar'],
      ['Ctrl+Espaço', 'Sugestões (objetos, ações, animações…)'], ['Ctrl+F / Ctrl+H', 'Buscar / substituir'],
      ['Ctrl+/', 'Comentar ou descomentar a linha'], ['Alt+↑ / Alt+↓', 'Mover a linha'], ['F12', 'Ir para a definição'],
    ] },
    { titulo: 'Personagens (K) e outras telas', itens: [
      ['Ctrl+S', 'Salvar o personagem'], ['Esc', 'Fechar a tela'],
    ] },
  ];
}

export class GuiaAtalhos {
  private raiz: HTMLElement;
  private busca = '';
  teclasTeste: () => [string, string][] = () => [];

  constructor() {
    this.raiz = el('div', { class: 'tela-personagens tela-atalhos', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Teclas de atalho', tabindex: -1 });
    this.raiz.hidden = true;
    document.body.append(this.raiz);
    this.raiz.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape' || e.key === 'F1') { e.preventDefault(); this.fechar(); } });
    this.raiz.addEventListener('pointerdown', (e) => { if (e.target === this.raiz) this.fechar(); });
  }

  get aberta() { return !this.raiz.hidden; }
  abrir() { this.raiz.hidden = false; this.render(); (this.raiz.querySelector('input') as HTMLInputElement | null)?.focus(); }
  fechar() { this.raiz.hidden = true; }
  alternar() { if (this.aberta) this.fechar(); else this.abrir(); }

  private render() {
    const busca = el('input', { type: 'search', placeholder: 'Buscar (ex.: copiar, zoom, tiro)', value: this.busca, 'aria-label': 'Buscar atalho' });
    busca.addEventListener('input', () => { this.busca = busca.value; this.desenharLista(lista); });
    const fechar = el('button', { type: 'button', class: 'primario' }, 'Fechar');
    dica(fechar, 'Fechar', '', 'Esc');
    fechar.addEventListener('click', () => this.fechar());
    const lista = el('div', { class: 'atalhos-grade' });
    this.raiz.replaceChildren(el('div', { class: 'pers-caixa atalhos-caixa' },
      el('header', { class: 'pers-topo' }, el('h2', {}, 'Teclas de atalho'), busca, el('div', { class: 'espaco' }), fechar),
      lista));
    this.desenharLista(lista);
  }

  private desenharLista(lista: HTMLElement) {
    const f = this.busca.trim().toLowerCase();
    const blocos: HTMLElement[] = [];
    for (const g of gruposAtalhos(this.teclasTeste())) {
      const itens = g.itens.filter(([t, d]) => !f || `${t} ${d} ${g.titulo}`.toLowerCase().includes(f));
      if (!itens.length) continue;
      blocos.push(el('section', { class: 'atalhos-grupo' }, el('h3', {}, g.titulo),
        ...itens.map(([t, d]) => el('div', { class: 'atalho-linha' },
          el('span', { class: 'atalho-teclas' }, ...t.split(' / ').flatMap((parte, i) => [i ? el('span', { class: 'sep' }, ' · ') : '', el('kbd', {}, parte)])),
          el('span', {}, d)))));
    }
    lista.replaceChildren(...(blocos.length ? blocos : [el('p', { class: 'dica-campo' }, 'Nenhum atalho com esse texto.')]));
  }
}
