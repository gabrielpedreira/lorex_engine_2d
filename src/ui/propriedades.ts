// Painel de propriedades: do objeto selecionado ou, sem seleção, da fase.
import type { Estado } from '../editor/estado';
import type { ObjetoFase } from '../core/tipos';
import { el } from './dom';

export interface AcoesObjeto {
  duplicar(): void;
  excluir(): void;
  ordem(direcao: 'frente' | 'tras'): void;
}

export class PainelPropriedades {
  private corpo: HTMLElement;

  constructor(raiz: HTMLElement, private estado: Estado, private acoes: AcoesObjeto) {
    this.corpo = el('div', { class: 'props' });
    raiz.append(el('div', { class: 'painel-titulo' }, 'Propriedades'), this.corpo);
    estado.on('selecao', () => this.render(true));
    estado.on('fase', () => this.render(false));
    this.render(true);
  }

  private render(forcar: boolean) {
    const ativo = document.activeElement;
    const digitando = (ativo instanceof HTMLInputElement && ativo.type !== 'checkbox') || ativo instanceof HTMLSelectElement;
    if (!forcar && digitando && this.corpo.contains(ativo)) return;
    this.corpo.replaceChildren();
    const o = this.estado.objetoSelecionado();
    if (o) this.renderObjeto(o); else this.renderFase();
  }

  private atualizarMantendoFoco(id: string) {
    const tinhaFoco = document.activeElement?.id === id;
    this.render(true);
    if (tinhaFoco) (document.getElementById(id) as HTMLInputElement | null)?.select();
  }

  // Campo numérico que grava ao confirmar (Enter ou sair do campo)
  private num(rotulo: string, valor: number, aplicar: (v: number) => void, opts: { passo?: number; min?: number; max?: number } = {}) {
    const id = 'p-' + rotulo.replace(/\W+/g, '');
    const input = el('input', { type: 'number', id, value: Number(valor.toFixed(3)), step: opts.passo ?? 1 });
    if (opts.min !== undefined) input.min = String(opts.min);
    if (opts.max !== undefined) input.max = String(opts.max);
    input.addEventListener('change', () => {
      let v = Number(input.value);
      if (!Number.isFinite(v)) return;
      if (opts.min !== undefined) v = Math.max(opts.min, v);
      if (opts.max !== undefined) v = Math.min(opts.max, v);
      this.estado.alterar(() => aplicar(v));
      this.atualizarMantendoFoco(id);
    });
    return el('div', { class: 'campo' }, el('label', { for: id }, rotulo), input);
  }

  private texto(rotulo: string, valor: string, aplicar: (v: string) => void) {
    const id = 'p-' + rotulo.replace(/\W+/g, '');
    const input = el('input', { type: 'text', id, value: valor });
    input.addEventListener('change', () => {
      const v = input.value.trim();
      if (v) { this.estado.alterar(() => aplicar(v)); this.atualizarMantendoFoco(id); }
    });
    return el('div', { class: 'campo largo' }, el('label', { for: id }, rotulo), input);
  }

  private check(rotulo: string, valor: boolean, aplicar: (v: boolean) => void) {
    const input = el('input', { type: 'checkbox' });
    input.checked = valor;
    input.addEventListener('change', () => this.estado.alterar(() => aplicar(input.checked)));
    return el('label', { class: 'check' }, input, rotulo);
  }

  private renderObjeto(o: ObjetoFase) {
    const camadaSel = el('select', { id: 'p-camada' });
    for (const c of [...this.estado.fase.camadas].reverse()) {
      const op = el('option', { value: c.id }, c.nome);
      if (c.id === o.camada) op.selected = true;
      camadaSel.append(op);
    }
    camadaSel.addEventListener('change', () => this.estado.alterar(() => { o.camada = camadaSel.value; }));

    const botao = (txt: string, fn: () => void, classe = '') => {
      const b = el('button', { type: 'button', class: classe }, txt);
      b.addEventListener('click', fn);
      return b;
    };

    this.corpo.append(
      el('div', { class: 'secao' },
        this.texto('Nome', o.nome, (v) => { o.nome = v; }),
        el('div', { class: 'campo largo' }, el('label', { for: 'p-camada' }, 'Camada'), camadaSel),
        el('div', { class: 'asset-info', title: o.asset }, o.asset),
      ),
      el('div', { class: 'secao' },
        el('h3', {}, 'Transformação'),
        el('div', { class: 'linha2' },
          this.num('X', o.x, (v) => { o.x = Math.round(v); }),
          this.num('Y', o.y, (v) => { o.y = Math.round(v); })),
        el('div', { class: 'linha2' },
          this.num('Escala', o.escala, (v) => { o.escala = v; }, { passo: 0.25, min: 0.01 }),
          this.num('Rotação °', o.rotacao, (v) => { o.rotacao = v; }, { passo: 1 })),
        el('div', { class: 'tamanho-info' }, `Tamanho final: ${Math.round(o.w * o.escala)} × ${Math.round(o.h * o.escala)} px (original ${o.w} × ${o.h})`),
        el('div', { class: 'linha2' },
          this.check('Espelhar ↔', o.espelharX, (v) => { o.espelharX = v; }),
          this.check('Espelhar ↕', o.espelharY, (v) => { o.espelharY = v; })),
        this.num('Opacidade', o.opacidade, (v) => { o.opacidade = v; }, { passo: 0.1, min: 0, max: 1 }),
      ),
      el('div', { class: 'secao' },
        el('h3', {}, 'Efeitos e comportamento'),
        el('div', { class: 'em-breve' }, 'Pulsar, brilhar, coletável, porta… chegam na etapa 2.'),
      ),
      el('div', { class: 'secao acoes' },
        botao('Trazer p/ frente', () => this.acoes.ordem('frente')),
        botao('Enviar p/ trás', () => this.acoes.ordem('tras')),
        botao('Duplicar', () => this.acoes.duplicar()),
        botao('Excluir', () => this.acoes.excluir(), 'perigo'),
      ),
    );
  }

  private renderFase() {
    const f = this.estado.fase;
    const cor = el('input', { type: 'color', id: 'p-cor', value: f.corFundo });
    cor.addEventListener('change', () => this.estado.alterar(() => { f.corFundo = cor.value; }));
    this.corpo.append(
      el('div', { class: 'secao' },
        el('h3', {}, 'Fase'),
        this.texto('Nome da fase', f.nome, (v) => { f.nome = v; }),
        el('div', { class: 'linha2' },
          this.num('Largura', f.tamanho[0], (v) => { f.tamanho = [Math.round(v), f.tamanho[1]]; }, { min: 64, passo: 16 }),
          this.num('Altura', f.tamanho[1], (v) => { f.tamanho = [f.tamanho[0], Math.round(v)]; }, { min: 64, passo: 16 })),
        el('div', { class: 'linha2' },
          this.num('Resolução X', f.resolucaoBase[0], (v) => { f.resolucaoBase = [Math.round(v), f.resolucaoBase[1]]; }, { min: 64 }),
          this.num('Resolução Y', f.resolucaoBase[1], (v) => { f.resolucaoBase = [f.resolucaoBase[0], Math.round(v)]; }, { min: 64 })),
        el('div', { class: 'linha2' },
          this.num('Grade (px)', f.tamanhoGrade, (v) => { f.tamanhoGrade = Math.max(1, Math.round(v)); }, { min: 1, passo: 8 }),
          el('div', { class: 'campo largo' }, el('label', { for: 'p-cor' }, 'Cor de fundo'), cor)),
        el('div', { class: 'dica' }, `${f.objetos.length} objeto(s). Selecione um objeto no cenário para editar.`),
      ),
    );
  }
}
