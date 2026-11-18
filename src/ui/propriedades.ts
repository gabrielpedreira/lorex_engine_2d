// Painel de propriedades: do objeto selecionado ou, sem seleção, da fase.
import type { Estado } from '../editor/estado';
import type { Colisao, InimigoFase, ObjetoFase } from '../core/tipos';
import { NOMES_FORMA, caixa, reescalar } from '../editor/colisoes';
import { dica } from './legenda';
import { EFEITOS_PADRAO, type Efeito, type TipoEfeito } from '../core/efeitos';
import { NOMES_COMPORTAMENTO, comportamentoPadrao, type Comportamento, type TipoComportamento } from '../core/comportamentos';
import { el } from './dom';

export interface AcoesObjeto {
  duplicar(): void;
  /** Abre o painel de Código no objeto (id) ou na fase (null). */
  abrirCodigo(id: string | null): void;
  /** Tipos de inimigo disponíveis (personagens NPC). */
  tiposInimigo(): { arquivo: string; nome: string; vida?: number; script?: string }[];
  /** Abre o editor de Personagens no tipo do inimigo. */
  abrirPersonagem(arquivo: string): void;
  /** Abre o painel de Código no tipo do inimigo colocado (id da colocação). */
  abrirCodigoInimigo(id: string): void;
  copiar(): void;
  /** Cópia encostada exatamente ao lado (continuação/loop). */
  continuar(lado: 'direita' | 'esquerda' | 'cima' | 'baixo'): void;
  excluir(): void;
  ordem(direcao: 'frente' | 'tras'): void;
  /** Multiplica o tamanho do selecionado. */
  escalar(fator: number): void;
  /** Gera cópia reduzida da imagem no tamanho atual (null = indisponível, ex.: navegador). */
  otimizar: (() => void) | null;
  /** Avisar que o tamanho mudou (para lembrar a escala). */
  aoEscalar(o: ObjetoFase): void;
  /** Fases e áreas do projeto (para o destino das saídas). */
  listarFases(): Promise<string[]>;
  /** Entra no modo "clique no objeto alvo" e devolve o id escolhido (null = cancelou). */
  escolherAlvo(): Promise<string | null>;
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
    const c = this.estado.colisaoSelecionada ? this.estado.colisao(this.estado.colisaoSelecionada) : undefined;
    const ini = this.estado.inimigoSelecionado ? this.estado.inimigo(this.estado.inimigoSelecionado) : undefined;
    if (o) this.renderObjeto(o);
    else if (c) this.renderColisao(c);
    else if (ini) this.renderInimigo(ini);
    else this.renderFase();
  }

  // ---------- Controle deslizante com desfazer de uma vez (registra no histórico só ao começar a arrastar) ----------
  private deslizante(rotulo: string, valor: number, min: number, max: number, passo: number, formatar: (v: number) => string, aplicar: (v: number) => void) {
    const id = 'd-' + rotulo.replace(/\W+/g, '') + Math.random().toString(36).slice(2, 6);
    const input = el('input', { type: 'range', id, min, max, step: passo, value: valor });
    const saida = el('output', { for: id }, formatar(valor));
    let registrado = false;
    input.addEventListener('input', () => {
      if (!registrado) { this.estado.checkpoint(); registrado = true; }
      const v = Number(input.value);
      aplicar(v);
      saida.textContent = formatar(v);
      this.estado.marcarAlterado();
    });
    input.addEventListener('change', () => { registrado = false; });
    return el('div', { class: 'deslizante' }, el('label', { for: id }, rotulo), input, saida);
  }

  // ---------- Comportamento (objetos interativos) ----------
  private secaoComportamento(o: ObjetoFase) {
    const secao = el('div', { class: 'secao' });
    const titulo = el('h3', {}, 'Comportamento');
    dica(titulo, 'Comportamento', 'O que o objeto faz no jogo: ser coletado, abrir como porta, acionar outro objeto, levar para outra área ou mostrar uma mensagem. Teste com ▶ Testar (F5).');
    secao.append(titulo);
    if (o.tipo !== 'interativo') {
      const tornar = el('button', { type: 'button', class: 'secundario largo' }, 'Tornar interativo');
      tornar.addEventListener('click', () => { this.estado.alterar(() => { o.tipo = 'interativo'; }); this.render(true); });
      secao.append(el('p', { class: 'dica-campo' }, 'Objetos estáticos são só cenário. Para ele fazer algo no jogo, torne-o interativo.'), tornar);
      return secao;
    }
    const atual = o.comportamentos[0] as Comportamento | undefined;
    const sel = el('select', { id: 'p-comp', 'aria-label': 'Comportamento' }, el('option', { value: '' }, 'Nenhum'),
      ...(Object.keys(NOMES_COMPORTAMENTO) as TipoComportamento[]).map((t) => el('option', { value: t }, NOMES_COMPORTAMENTO[t].nome)));
    sel.value = atual?.tipo ?? '';
    dica(sel, 'Comportamento', atual ? NOMES_COMPORTAMENTO[atual.tipo].texto : 'Escolha o que este objeto faz no jogo.');
    sel.addEventListener('change', () => {
      this.estado.alterar(() => { o.comportamentos = sel.value ? [comportamentoPadrao(sel.value as TipoComportamento, o)] : []; });
      this.render(true);
    });
    secao.append(sel);
    if (!atual) return secao;
    secao.append(el('p', { class: 'dica-campo' }, NOMES_COMPORTAMENTO[atual.tipo].texto));

    const texto = (rotulo: string, valor: string, aplicar: (v: string) => void, explicacao: string, lista?: string[]) => {
      const id = 'pc-' + rotulo.replace(/\W+/g, '');
      const input = el('input', { type: 'text', id, value: valor, ...(lista ? { list: id + '-l' } : {}) });
      input.addEventListener('change', () => { this.estado.alterar(() => aplicar(input.value.trim())); this.render(true); });
      const lab = el('label', { for: id }, rotulo);
      dica(lab, rotulo, explicacao);
      return el('div', { class: 'campo largo' }, lab, input, lista ? el('datalist', { id: id + '-l' }, ...lista.map((v) => el('option', { value: v }))) : null);
    };
    const marcar = (rotulo: string, valor: boolean, aplicar: (v: boolean) => void, explicacao: string) => {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = valor;
      cb.addEventListener('change', () => { this.estado.alterar(() => aplicar(cb.checked)); });
      const lab = el('label', { class: 'check' }, cb, rotulo);
      dica(lab, rotulo, explicacao);
      return lab;
    };
    const itensDaFase = [...new Set(this.estado.fase.objetos.flatMap((x) => (x.comportamentos[0]?.tipo === 'coletavel' ? [(x.comportamentos[0] as { item: string }).item] : [])))];

    switch (atual.tipo) {
      case 'coletavel':
        secao.append(
          texto('Nome do item', atual.item, (v) => { atual.item = v || o.nome; }, 'Como o item aparece no inventário. Portas que pedem este item usam o mesmo nome.'),
          this.num('Quantidade', atual.quantidade, (v) => { atual.quantidade = Math.max(1, Math.round(v)); }, { min: 1 }));
        break;
      case 'porta':
        secao.append(
          texto('Precisa do item', atual.requer, (v) => { atual.requer = v; }, 'Nome do item que abre esta porta (deixe vazio para abrir sem item). Os itens coletáveis da fase aparecem na lista.', itensDaFase),
          marcar('Gasta o item ao abrir', atual.consome, (v) => { atual.consome = v; }, 'Se marcado, o item sai do inventário quando a porta abre.'),
          marcar('Começa aberta', atual.abertaNoInicio, (v) => { atual.abertaNoInicio = v; }, 'A porta começa aberta (útil quando uma alavanca vai fechá-la).'));
        break;
      case 'alavanca': {
        const alvo = atual.alvo ? this.estado.objeto(atual.alvo) : undefined;
        const escolher = el('button', { type: 'button', class: 'secundario largo' }, alvo ? `Alvo: ${alvo.nome} (trocar)` : 'Escolher alvo no cenário…');
        dica(escolher, 'Escolher alvo', 'Depois de clicar aqui, clique no objeto do cenário que esta alavanca vai acionar (uma porta abre/fecha; outro objeto aparece/some). Esc cancela.');
        escolher.addEventListener('click', async () => {
          const id = await this.acoes.escolherAlvo();
          if (id && id !== o.id) this.estado.alterar(() => { atual.alvo = id; });
          this.render(true);
        });
        secao.append(escolher, marcar('Só funciona uma vez', atual.umaVez, (v) => { atual.umaVez = v; }, 'Depois de acionada, a alavanca não funciona de novo.'));
        if (atual.alvo && !alvo) secao.append(el('p', { class: 'aviso-texto' }, 'O alvo escolhido foi apagado. Escolha outro.'));
        break;
      }
      case 'saida': {
        const destino = el('select', { id: 'pc-destino' }, el('option', { value: '' }, 'Escolha a fase ou área…'));
        const lab = el('label', { for: 'pc-destino' }, 'Leva para');
        dica(lab, 'Destino', 'A fase ou área onde o jogador vai aparecer (na bandeira de início dela).');
        void this.acoes.listarFases().then((fases) => {
          for (const f of fases) if (f !== this.estado.arquivoFase) destino.append(el('option', { value: f }, f));
          destino.value = atual.destino;
        });
        destino.addEventListener('change', () => this.estado.alterar(() => { atual.destino = destino.value; }));
        secao.append(el('div', { class: 'campo largo' }, lab, destino));
        break;
      }
      case 'mensagem': {
        const area = el('textarea', { id: 'pc-texto', rows: 4, placeholder: 'Ex.: "A porta do laboratório está trancada. Preciso achar o cartão de acesso."' });
        area.value = atual.texto;
        area.addEventListener('change', () => this.estado.alterar(() => { atual.texto = area.value; }));
        const lab = el('label', { for: 'pc-texto' }, 'Texto');
        dica(lab, 'Texto da mensagem', 'Aparece na tela quando o jogador aperta E perto do objeto.');
        secao.append(el('div', { class: 'campo largo' }, lab, area));
        break;
      }
    }
    return secao;
  }

  // ---------- Efeitos ----------
  private secaoEfeitos(o: ObjetoFase) {
    const nomes: Record<TipoEfeito, [string, string]> = {
      pulsar: ['Pulsar', 'Cresce e volta, chamando atenção'],
      brilhar: ['Brilhar', 'Halo colorido em volta da imagem'],
      flutuar: ['Flutuar', 'Sobe e desce devagar'],
      piscar: ['Piscar', 'Acende e apaga'],
    };
    const secao = el('div', { class: 'secao' }, el('h3', {}, 'Efeitos'));
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const porSeg = (v: number) => `${v.toFixed(1).replace('.', ',')}/s`;
    for (const tipo of Object.keys(nomes) as TipoEfeito[]) {
      const atual = o.efeitos.find((e) => e.tipo === tipo);
      const cb = el('input', { type: 'checkbox' });
      cb.checked = !!atual;
      cb.addEventListener('change', () => {
        this.estado.alterar(() => {
          if (cb.checked) o.efeitos = [...o.efeitos.filter((e) => e.tipo !== tipo), { ...EFEITOS_PADRAO[tipo] } as Efeito];
          else o.efeitos = o.efeitos.filter((e) => e.tipo !== tipo);
        });
        this.render(true);
      });
      const bloco = el('div', { class: 'efeito' + (atual ? ' ligado' : '') },
        el('label', { class: 'check efeito-titulo', title: nomes[tipo][1] }, cb, el('strong', {}, nomes[tipo][0]), el('span', {}, nomes[tipo][1])));
      if (atual) {
        const params = el('div', { class: 'efeito-params' });
        if (atual.tipo === 'pulsar') {
          params.append(
            this.deslizante('Intensidade', atual.intensidade, 0.02, 0.5, 0.01, pct, (v) => { atual.intensidade = v; }),
            this.deslizante('Velocidade', atual.velocidade, 0.2, 5, 0.1, porSeg, (v) => { atual.velocidade = v; }));
        } else if (atual.tipo === 'brilhar') {
          const cor = el('input', { type: 'color', value: atual.cor, 'aria-label': 'Cor do brilho' });
          cor.addEventListener('change', () => this.estado.alterar(() => { atual.cor = cor.value; }));
          const pulsa = el('input', { type: 'checkbox' });
          pulsa.checked = atual.pulsar;
          pulsa.addEventListener('change', () => { this.estado.alterar(() => { atual.pulsar = pulsa.checked; }); this.render(true); });
          params.append(
            el('div', { class: 'deslizante' }, el('label', {}, 'Cor'), cor, el('span', {})),
            this.deslizante('Tamanho', atual.raio, 1, 32, 1, (v) => `${v} px`, (v) => { atual.raio = v; }),
            this.deslizante('Intensidade', atual.intensidade, 0.1, 1, 0.05, pct, (v) => { atual.intensidade = v; }),
            el('label', { class: 'check' }, pulsa, 'O brilho pulsa'));
          if (atual.pulsar) params.append(this.deslizante('Velocidade', atual.velocidade, 0.2, 4, 0.1, porSeg, (v) => { atual.velocidade = v; }));
        } else if (atual.tipo === 'flutuar') {
          params.append(
            this.deslizante('Altura', atual.amplitude, 1, 32, 1, (v) => `${v} px`, (v) => { atual.amplitude = v; }),
            this.deslizante('Velocidade', atual.velocidade, 0.1, 3, 0.1, porSeg, (v) => { atual.velocidade = v; }));
        } else if (atual.tipo === 'piscar') {
          params.append(
            this.deslizante('Intervalo', atual.intervalo, 0.1, 3, 0.05, (v) => `${v.toFixed(2).replace('.', ',')} s`, (v) => { atual.intervalo = v; }),
            this.deslizante('Apagado', atual.minimo, 0, 0.9, 0.05, pct, (v) => { atual.minimo = v; }));
        }
        bloco.append(params);
      }
      secao.append(bloco);
    }
    if (o.efeitos.length && !this.estado.previaEfeitos) {
      secao.append(el('span', { class: 'dica-campo' }, 'A prévia dos efeitos está desligada (botão ✳ na barra ou Shift+E).'));
    }
    return secao;
  }

  // ---------- Colisão ----------
  private renderColisao(c: Colisao) {
    const b = caixa(c);
    const comp = el('div', { class: 'segmentado', role: 'radiogroup', 'aria-label': 'Comportamento' });
    for (const [v, r, texto] of [
      ['solido', 'Sólido', 'O jogador não atravessa: chão, paredes e teto.'],
      ['atravessavel', 'Atravessável', 'O jogador sobe por baixo e fica em cima; só as bordas de cima seguram.'],
    ] as const) {
      const bt = el('button', { type: 'button', class: c.comportamento === v ? 'ativo' : '', role: 'radio', 'aria-checked': String(c.comportamento === v) }, r);
      dica(bt, r, texto);
      bt.addEventListener('click', () => { this.estado.alterar(() => { c.comportamento = v; }); this.render(true); });
      comp.append(bt);
    }
    // Tamanho/posição pela caixa: alterar escala os pontos
    const aplicarCaixa = (nova: Partial<{ x: number; y: number; w: number; h: number }>) => {
      const atual = caixa(c);
      c.pontos = reescalar(c.pontos, atual, { ...atual, ...nova });
    };
    const excluir = el('button', { type: 'button', class: 'perigo' }, 'Excluir forma');
    dica(excluir, 'Excluir forma', 'Apaga esta forma de colisão (Ctrl+Z desfaz).', 'Del');
    excluir.addEventListener('click', () => this.acoes.excluir());
    this.corpo.append(el('div', { class: 'secao' },
      el('h3', {}, `Colisão · ${NOMES_FORMA[c.forma]}`),
      el('div', { class: 'campo largo' }, el('span', { class: 'rotulo' }, 'Comportamento'), comp),
      el('div', { class: 'linha2' },
        this.num('X', b.x, (v) => aplicarCaixa({ x: Math.round(v) })),
        this.num('Y', b.y, (v) => aplicarCaixa({ y: Math.round(v) }))),
      el('div', { class: 'linha2' },
        this.num('Largura', b.w, (v) => aplicarCaixa({ w: Math.max(2, Math.round(v)) }), { min: 2 }),
        this.num('Altura', b.h, (v) => aplicarCaixa({ h: Math.max(2, Math.round(v)) }), { min: 2 })),
      el('div', { class: 'tamanho-info' }, `${c.pontos.length} vértices · ${c.forma === 'linha' ? 'aberta' : 'fechada'}`),
      el('div', { class: 'secao acoes' }, excluir),
      el('p', { class: 'dica-campo' }, 'Arraste a forma para mover; alças dos cantos mudam o tamanho (Shift mantém a proporção). Bolinhas = vértices: arraste para modelar, duplo clique numa borda cria um vértice, Alt+clique apaga. Setas movem 1 px (Shift: 8).'),
    ));
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
      this.secaoContinuacao(),
      this.secaoComportamento(o),
      this.secaoEfeitos(o),
      el('div', { class: 'secao acoes' },
        botao('Trazer p/ frente', () => this.acoes.ordem('frente')),
        botao('Enviar p/ trás', () => this.acoes.ordem('tras')),
        botao('Duplicar', () => this.acoes.duplicar()),
        botao('Copiar', () => this.acoes.copiar()),
        botao(o.script ? 'Código { }' : 'Código…', () => this.acoes.abrirCodigo(o.id)),
        botao('Excluir', () => this.acoes.excluir(), 'perigo'),
      ),
    );
  }

  /** Botões de continuação: uma cópia encostada exatamente ao lado (cenários em loop). */
  private secaoContinuacao() {
    const lados = [
      { lado: 'esquerda', seta: '←', tecla: '←' }, { lado: 'cima', seta: '↑', tecla: '↑' },
      { lado: 'baixo', seta: '↓', tecla: '↓' }, { lado: 'direita', seta: '→', tecla: '→' },
    ] as const;
    const titulo = el('h3', {}, 'Continuação (loop)');
    dica(titulo, 'Continuação', 'Cria uma cópia encostada exatamente na borda deste objeto, com o mesmo tamanho: ideal para chão, muros e fundos que se repetem. Ao arrastar objetos, eles também grudam nas bordas dos vizinhos (linhas laranja); Alt desliga o ímã.');
    const linha = el('div', { class: 'continuacao' });
    for (const l of lados) {
      const b = el('button', { type: 'button', class: 'secundario' }, l.seta);
      dica(b, `Continuar para ${l.lado === 'cima' || l.lado === 'baixo' ? l.lado : 'a ' + l.lado}`, 'Cópia exatamente encostada deste lado.', `Ctrl+Shift+${l.tecla}`);
      b.addEventListener('click', () => this.acoes.continuar(l.lado));
      linha.append(b);
    }
    return el('div', { class: 'secao' }, titulo, linha);
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

  private renderInimigo(i: InimigoFase) {
    const tipos = this.acoes.tiposInimigo();
    const t = tipos.find((x) => x.arquivo === i.personagem);
    const sel = el('select', { id: 'p-tipoini' }, ...tipos.map((x) => el('option', { value: x.arquivo }, x.nome)),
      ...(t ? [] : [el('option', { value: i.personagem }, `${i.personagem} (não encontrado)`)]));
    sel.value = i.personagem;
    sel.addEventListener('change', () => this.estado.alterar(() => { i.personagem = sel.value; }));
    const labTipo = el('label', { for: 'p-tipoini' }, 'Tipo');
    dica(labTipo, 'Tipo do inimigo', 'Personagem NPC que define animações, vida, visão e ataques. Todos os inimigos do mesmo tipo dividem essas configurações e o código.');
    const olhando = el('input', { type: 'checkbox' });
    olhando.checked = i.olhandoDireita;
    olhando.addEventListener('change', () => this.estado.alterar(() => { i.olhandoDireita = olhando.checked; }));
    const botao = (txt: string, fn: () => void, classe = 'secundario') => { const b = el('button', { type: 'button', class: classe }, txt); b.addEventListener('click', fn); return b; };
    this.corpo.append(el('div', { class: 'secao' },
      el('h3', {}, `Inimigo · ${i.id}`),
      el('div', { class: 'campo largo' }, labTipo, sel),
      el('div', { class: 'linha2' },
        this.num('X', i.x, (v) => { i.x = Math.round(v); }),
        this.num('Y', i.y, (v) => { i.y = Math.round(v); })),
      el('label', { class: 'check' }, olhando, 'Começa olhando para a direita'),
      el('span', { class: 'dica-campo' }, t ? `Vida ${t.vida ?? '?'} tiro(s). Posição = pés. Arraste no cenário (gruda no chão; Alt solta).` : 'Tipo não encontrado: crie o personagem NPC em Personagens (K).')),
      el('div', { class: 'secao acoes' },
        botao('Editar o tipo…', () => this.acoes.abrirPersonagem(i.personagem)),
        botao(t?.script ? 'Código do tipo { }' : 'Código do tipo…', () => this.acoes.abrirCodigoInimigo(i.id)),
        botao('Excluir', () => this.acoes.excluir(), 'perigo')));
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
        el('h3', {}, 'Início do jogador'),
        el('div', { class: 'linha2' },
          this.num('Início X', f.spawnJogador[0], (v) => { f.spawnJogador = [Math.round(v), f.spawnJogador[1]]; }),
          this.num('Início Y', f.spawnJogador[1], (v) => { f.spawnJogador = [f.spawnJogador[0], Math.round(v)]; })),
        el('span', { class: 'dica-campo' }, 'Posição dos pés da personagem. Arraste a bandeira no cenário ou use a ferramenta Início (I).'),
        el('div', { class: 'dica' }, `${f.objetos.length} objeto(s) · ${f.colisoes.length} colisão(ões). Selecione algo no cenário para editar.`),
      ),
      this.secaoCodigoFase(),
    );
  }

  private secaoCodigoFase() {
    const f = this.estado.fase;
    const comCodigo = f.objetos.filter((o) => o.script).length;
    const b = el('button', { type: 'button', class: 'secundario' }, f.script ? 'Abrir código da fase { }' : 'Código da fase…');
    dica(b, 'Código da fase', 'Abre o painel de Código. A fase tem ganchos como aoIniciar e aoAtualizar; cada objeto também pode ter o seu código.', 'O');
    b.addEventListener('click', () => this.acoes.abrirCodigo(null));
    return el('div', { class: 'secao' }, el('h3', {}, 'Código'), b,
      el('span', { class: 'dica-campo' }, `${f.script ? 'A fase tem script. ' : ''}${comCodigo} objeto(s) com código.`));
  }
}
