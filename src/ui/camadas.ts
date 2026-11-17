// Painel de camadas: a de cima é a mais à frente (como no Photoshop/Krita).
import type { Estado } from '../editor/estado';
import { el } from './dom';
import { icone } from './icones';
import { dica } from './legenda';

export class PainelCamadas {
  private lista: HTMLElement;

  constructor(raiz: HTMLElement, private estado: Estado) {
    this.lista = el('div', { class: 'camadas-lista' });
    const titulo = el('div', { class: 'painel-titulo' }, 'Camadas');
    dica(titulo, 'Camadas', 'A de cima aparece na frente. Clique numa camada para torná-la ativa: é nela que os elementos novos entram. O número é o parallax: 0 = parada no fundo, 1 = anda junto com o jogador, maior que 1 = primeiro plano.');
    raiz.append(titulo, this.lista);
    estado.on('fase', () => this.render());
    this.render();
  }

  private render() {
    const ativo = document.activeElement;
    if (ativo instanceof HTMLInputElement && this.lista.contains(ativo)) return; // não atrapalhar quem está digitando
    this.lista.replaceChildren();
    const camadas = [...this.estado.fase.camadas].reverse();
    for (const c of camadas) {
      const qtd = this.estado.fase.objetos.filter((o) => o.camada === c.id).length;
      const ativa = c.id === this.estado.camadaAtiva;

      const olho = el('button', { class: 'icone' + (c.visivel ? '' : ' desligado'), title: c.visivel ? 'Ocultar camada' : 'Mostrar camada', 'aria-label': c.visivel ? 'Ocultar camada' : 'Mostrar camada' }, icone(c.visivel ? 'olho' : 'olhoFechado'));
      olho.addEventListener('click', (e) => { e.stopPropagation(); this.estado.alterar(() => { c.visivel = !c.visivel; }); });

      const cadeado = el('button', { class: 'icone' + (c.travada ? ' ligado' : ''), title: c.travada ? 'Destravar camada' : 'Travar camada (não seleciona objetos)', 'aria-label': c.travada ? 'Destravar camada' : 'Travar camada' }, icone(c.travada ? 'cadeado' : 'cadeadoAberto'));
      cadeado.addEventListener('click', (e) => { e.stopPropagation(); this.estado.alterar(() => { c.travada = !c.travada; }); });

      const nome = el('span', { class: 'camada-nome', title: 'Duplo clique para renomear' }, c.nome);
      nome.addEventListener('dblclick', (e) => { e.stopPropagation(); this.renomear(nome, c.id); });

      const par = el('input', { type: 'number', step: 0.05, min: 0, max: 3, value: c.parallax[0], class: 'parallax', title: 'Parallax: 0 = parado, 1 = acompanha o jogador, maior que 1 = primeiro plano', 'aria-label': 'Parallax' });
      par.addEventListener('click', (e) => e.stopPropagation());
      par.addEventListener('change', () => {
        const v = Math.max(0, Number(par.value) || 0);
        this.estado.alterar(() => { c.parallax = [v, v]; });
      });

      dica(olho, c.visivel ? 'Ocultar camada' : 'Mostrar camada', 'Só esconde no editor; não apaga nada.');
      dica(cadeado, c.travada ? 'Destravar camada' : 'Travar camada', 'Camada travada não deixa selecionar nem mover os objetos dela (bom para o fundo não sair do lugar sem querer).');
      dica(par, 'Parallax', 'Quanto a camada acompanha a câmera: 0 = parada, 0,5 = metade da velocidade (fundo distante), 1 = junto com o jogador, 1,2 = primeiro plano passando mais rápido.');
      const linha = el('div', { class: 'camada' + (ativa ? ' ativa' : '') },
        olho, cadeado, nome, el('span', { class: 'contador' }, String(qtd)), par);
      linha.addEventListener('click', () => this.estado.ativarCamada(c.id));
      this.lista.append(linha);
    }
  }

  private renomear(alvo: HTMLElement, id: string) {
    const c = this.estado.camada(id);
    if (!c) return;
    const input = el('input', { type: 'text', value: c.nome, class: 'camada-nome-input' });
    alvo.replaceWith(input);
    input.focus(); input.select();
    let feito = false;
    const fim = (salvar: boolean) => {
      if (feito) return; feito = true;
      input.blur();
      const v = input.value.trim();
      if (salvar && v && v !== c.nome) this.estado.alterar(() => { c.nome = v; });
      else this.render();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') fim(true); if (e.key === 'Escape') fim(false); });
    input.addEventListener('blur', () => fim(true));
  }
}
