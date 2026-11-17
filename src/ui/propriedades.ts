// Painel de propriedades: do objeto selecionado ou, sem seleção, da fase.
import type { Estado } from '../editor/estado';
import type { ObjetoFase } from '../core/tipos';
import { el } from './dom';

export interface AcoesObjeto {
  duplicar(): void;
  excluir(): void;
  ordem(direcao: 'frente' | 'tras'): void;
  /** Multiplica o tamanho do selecionado. */
  escalar(fator: number): void;
  /** Gera cópia reduzida da imagem no tamanho atual (null = indisponível, ex.: navegador). */
  otimizar: (() => void) | null;
  /** Avisar que o tamanho mudou (para lembrar a escala). */
  aoEscalar(o: ObjetoFase): void;
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
      if (v || rotulo === 'Região') { this.estado.alterar(() => aplicar(v)); this.atualizarMantendoFoco(id); }
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

    // Estático x interativo
    const tipos = el('div', { class: 'segmentado', role: 'radiogroup', 'aria-label': 'Tipo no cenário' });
    for (const [valor, rotulo] of [['estatico', 'Estático'], ['interativo', 'Interativo']] as const) {
      const b = el('button', { type: 'button', class: o.tipo === valor ? 'ativo' : '', role: 'radio', 'aria-checked': String(o.tipo === valor) }, rotulo);
      b.addEventListener('click', () => { if (o.tipo !== valor) { this.estado.alterar(() => { o.tipo = valor; }); this.render(true); } });
      tipos.append(b);
    }

    this.corpo.append(
      el('div', { class: 'secao' },
        this.texto('Nome', o.nome, (v) => { o.nome = v; }),
        el('div', { class: 'campo largo' }, el('span', { class: 'rotulo' }, 'Tipo no cenário'), tipos,
          el('span', { class: 'dica-campo' }, o.tipo === 'interativo'
            ? 'O jogador pode interagir. Os comportamentos (coletar, abrir, acionar…) chegam com a ferramenta de interação.'
            : 'Só visual. Não reage ao jogador.')),
        el('div', { class: 'campo largo' }, el('label', { for: 'p-camada' }, 'Camada'), camadaSel),
        el('div', { class: 'asset-info', title: o.asset }, o.asset),
      ),
      el('div', { class: 'secao' },
        el('h3', {}, 'Transformação'),
        el('div', { class: 'linha2' },
          this.num('X', o.x, (v) => { o.x = Math.round(v); }),
          this.num('Y', o.y, (v) => { o.y = Math.round(v); })),
        this.secaoTamanho(o),
        this.num('Rotação °', o.rotacao, (v) => { o.rotacao = v; }, { passo: 1 }),
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

  /** Tamanho: em %, largura ou altura em px (proporcional), atalhos e otimização. */
  private secaoTamanho(o: ObjetoFase) {
    const aplicarMantendoCentro = (novaEscala: number) => {
      const cx = o.x + (o.w * o.escala) / 2, cy = o.y + (o.h * o.escala) / 2;
      o.escala = Math.max(0.01, Math.round(novaEscala * 1000) / 1000);
      o.x = Math.round(cx - (o.w * o.escala) / 2);
      o.y = Math.round(cy - (o.h * o.escala) / 2);
    };
    const depois = () => this.acoes.aoEscalar(o);
    const pct = this.num('Tamanho %', o.escala * 100, (v) => { aplicarMantendoCentro(v / 100); depois(); }, { passo: 5, min: 1 });
    const larg = this.num('Largura px', Math.round(o.w * o.escala), (v) => { aplicarMantendoCentro(v / o.w); depois(); }, { min: 1 });
    const alt = this.num('Altura px', Math.round(o.h * o.escala), (v) => { aplicarMantendoCentro(v / o.h); depois(); }, { min: 1 });
    const atalhos = el('div', { class: 'atalhos-tamanho' });
    for (const [rotulo, fator] of [['−10%', 1 / 1.1], ['+10%', 1.1], ['½', 0.5], ['×2', 2]] as const) {
      const b = el('button', { type: 'button', title: `Multiplicar o tamanho por ${fator.toFixed(2)}` }, rotulo);
      b.addEventListener('click', () => { this.acoes.escalar(fator); this.render(true); });
      atalhos.append(b);
    }
    const original = el('button', { type: 'button', title: 'Voltar ao tamanho da imagem (100%)' }, '100%');
    original.addEventListener('click', () => { this.estado.alterar(() => aplicarMantendoCentro(1)); depois(); this.render(true); });
    atalhos.append(original);

    const pixelsTela = Math.round(o.w * o.escala) * Math.round(o.h * o.escala);
    const desperdicio = o.escala < 0.75 && o.w * o.h > pixelsTela * 2;
    const blocos: HTMLElement[] = [
      pct,
      el('div', { class: 'linha2' }, larg, alt),
      atalhos,
      el('div', { class: 'tamanho-info' }, `Imagem: ${o.w} × ${o.h} px · ${((o.w * o.h * 4) / 1e6).toFixed(1).replace('.', ',')} MB na memória de vídeo`),
    ];
    if (desperdicio) {
      const aviso = el('div', { class: 'aviso-otimizar' },
        el('strong', {}, 'Imagem maior do que o necessário'),
        el('span', {}, `Ela aparece com ${Math.round(o.w * o.escala)} × ${Math.round(o.h * o.escala)} px, mas carrega ${o.w} × ${o.h}. Otimize para gerar uma cópia leve neste tamanho (o original fica intacto).`));
      if (this.acoes.otimizar) {
        const b = el('button', { type: 'button', class: 'primario largo' }, 'Otimizar para este tamanho');
        b.addEventListener('click', () => this.acoes.otimizar?.());
        aviso.append(b);
      } else {
        aviso.append(el('span', { class: 'dica-campo' }, 'Disponível no aplicativo (npm run dev).'));
      }
      blocos.push(aviso);
    }
    return el('div', { class: 'secao-tamanho' }, ...blocos);
  }

  private tipoCena(valor: 'fase' | 'area', aplicar: (v: 'fase' | 'area') => void) {
    const sel = el('select', { id: 'p-tipo-cena' },
      el('option', { value: 'fase' }, 'Fase completa'),
      el('option', { value: 'area' }, 'Área conectável'));
    sel.value = valor;
    sel.addEventListener('change', () => { this.estado.alterar(() => aplicar(sel.value as 'fase' | 'area')); this.render(true); });
    return el('div', { class: 'campo largo' }, el('label', { for: 'p-tipo-cena' }, 'Tipo'), sel);
  }

  private renderFase() {
    const f = this.estado.fase;
    const cor = el('input', { type: 'color', id: 'p-cor', value: f.corFundo });
    cor.addEventListener('change', () => this.estado.alterar(() => { f.corFundo = cor.value; }));
    this.corpo.append(
      el('div', { class: 'secao' },
        el('h3', {}, f.tipo === 'area' ? 'Área' : 'Fase'),
        this.texto(f.tipo === 'area' ? 'Nome da área' : 'Nome da fase', f.nome, (v) => { f.nome = v; }),
        el('div', { class: 'linha2' },
          this.tipoCena(f.tipo, (v) => { f.tipo = v; }),
          this.texto('Região', f.regiao || '', (v) => { f.regiao = v; })),
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
