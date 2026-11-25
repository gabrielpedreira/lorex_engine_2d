// Painel de propriedades: do objeto selecionado ou, sem seleção, da fase.
import type { Estado } from '../editor/estado';
import type { Colisao, FormaLuz, InimigoFase, LuzFase, ObjetoFase } from '../core/tipos';

export const FORMAS_LUZ: { id: FormaLuz; nome: string; texto: string }[] = [
  { id: 'circulo', nome: 'Círculo', texto: 'Lâmpada, vela, fogo: ilumina em volta.' },
  { id: 'cone', nome: 'Cone', texto: 'Poste, holofote, lanterna: um facho numa direção.' },
  { id: 'retangulo', nome: 'Retângulo', texto: 'Janela, luminária tubular, porta aberta, tela de monitor.' },
];
import { NOMES_FORMA, caixa, reescalar } from '../editor/colisoes';
import { dica } from './legenda';
import { secaoCamposJogo } from './camposJogo';
import { AJUSTES_INIMIGO, inimigoPadrao } from '../core/inimigos';
import { aoMudarDefinicoes } from '../core/definicoes';
import { EFEITOS_PADRAO, type Efeito, type TipoEfeito } from '../core/efeitos';
import { ACOES_GATILHO, MODOS_PASSAGEM, NOMES_COMPORTAMENTO, comportamentoPadrao, type AcaoGatilho, type Comportamento, type ModoPassagem, type TipoComportamento } from '../core/comportamentos';
import { el } from './dom';
import { MODOS_ANIM, duracaoFolha, palpiteAnim, tamanhoQuadro, type ModoAnim } from '../core/folha';

export interface AcoesObjeto {
  duplicar(): void;
  /** Abre o painel de Código no objeto (id) ou na fase (null). */
  abrirCodigo(id: string | null): void;
  /** Tipos de inimigo disponíveis (personagens NPC). */
  tiposInimigo(): { arquivo: string; nome: string; vida?: number; script?: string; inimigo?: import('../core/inimigos').ConfigInimigo }[];
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
  /** Para onde a passagem leva pelo Mapa (texto) ou null se não estiver conectada. */
  destinoNoMapa(id: string): string | null;
  abrirMapa(): void;
  /** A passagem mudou o "como passa": se a conexão é igual nos dois sentidos, a outra ponta acompanha. */
  sincronizarModo(id: string, modo: ModoPassagem): void;
  /** Tamanho (px) da imagem do objeto, para recortar o spritesheet. */
  tamanhoImagem(o: ObjetoFase): Promise<{ w: number; h: number }>;
}

export class PainelPropriedades {
  private corpo: HTMLElement;

  constructor(raiz: HTMLElement, private estado: Estado, private acoes: AcoesObjeto) {
    this.corpo = el('div', { class: 'props' });
    raiz.append(el('div', { class: 'painel-titulo' }, 'Propriedades'), this.corpo);
    estado.on('selecao', () => this.render(true));
    estado.on('fase', () => this.render(false));
    aoMudarDefinicoes(() => this.render(true));
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
    const luz = this.estado.luzSelecionada ? this.estado.luz(this.estado.luzSelecionada) : undefined;
    if (luz) this.renderLuz(luz);
    else if (o) this.renderObjeto(o);
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
          this.num('Quantidade', atual.quantidade, (v) => { atual.quantidade = Math.max(1, Math.round(v)); }, { min: 1 }),
          this.num('Cura (vida)', atual.cura ?? 0, (v) => { if (v > 0) atual.cura = v; else delete atual.cura; }, { min: 0 }),
          el('p', { class: 'dica-campo' }, (atual.cura ?? 0) > 0 ? `Kit médico: cura ${atual.cura} de vida ao pegar (não vai para o inventário).` : 'Cura 0 = item comum (vai para o inventário). Acima de 0 vira kit médico: cura ao pegar.'));
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
        const noMapa = this.acoes.destinoNoMapa(o.id);
        const mapa = el('button', { type: 'button', class: 'primario largo' }, noMapa ? 'Ver no Mapa' : 'Conectar no Mapa');
        dica(mapa, 'Mapa', 'Abre o diagrama das salas: arraste desta passagem até a da outra sala e clique no ◆ para escolher a transição (tela de loading, som).', 'M');
        mapa.addEventListener('click', () => this.acoes.abrirMapa());
        const modo = el('select', { id: 'pc-modo' }, ...MODOS_PASSAGEM.map((m) => el('option', { value: m.id }, m.nome)));
        modo.value = atual.modo;
        modo.addEventListener('change', () => { this.estado.alterar(() => { atual.modo = modo.value as ModoPassagem; }); this.acoes.sincronizarModo(o.id, atual.modo); this.render(true); });
        const labModo = el('label', { for: 'pc-modo' }, 'Como passa');
        dica(labModo, 'Como passa', MODOS_PASSAGEM.map((m) => `${m.nome}: ${m.texto}`).join(' '));
        secao.append(
          el('p', { class: noMapa ? 'dica-campo' : 'aviso-texto' }, noMapa ? `Leva para: ${noMapa}` : 'Ainda não está conectada no Mapa.'),
          mapa,
          el('div', { class: 'campo largo' }, labModo, modo),
          texto('Precisa do item', atual.requer, (v) => { atual.requer = v; }, 'Passagem trancada: só abre com este item no inventário (ex.: "cartão de acesso"). Vazio = livre. Depois de destrancada, fica livre.', itensDaFase),
          marcar('Gasta o item ao destrancar', atual.consome, (v) => { atual.consome = v; }, 'Se marcado, o item sai do inventário quando a passagem é destrancada.'));
        if (noMapa && !atual.destino) break;
        const destino = el('select', { id: 'pc-destino' }, el('option', { value: '' }, 'Nenhum (usar o Mapa)'));
        const lab = el('label', { for: 'pc-destino' }, 'Destino simples');
        dica(lab, 'Destino simples', 'Sem conexão no Mapa, leva para o início desta fase/área, sem transição. O Mapa tem prioridade.');
        void this.acoes.listarFases().then((fases) => {
          for (const f of fases) if (f !== this.estado.arquivoFase) destino.append(el('option', { value: f }, f));
          destino.value = atual.destino;
        });
        destino.addEventListener('change', () => this.estado.alterar(() => { atual.destino = destino.value; }));
        secao.append(el('div', { class: 'campo largo' }, lab, destino));
        break;
      }
      case 'gatilho': {
        const acao = el('select', { id: 'pc-acao' }, ...ACOES_GATILHO.map((a) => el('option', { value: a.id }, a.nome)));
        acao.value = atual.acao;
        acao.addEventListener('change', () => { this.estado.alterar(() => { atual.acao = acao.value as AcaoGatilho; }); this.render(true); });
        const labAcao = el('label', { for: 'pc-acao' }, 'Ao entrar');
        dica(labAcao, 'O que o gatilho faz', ACOES_GATILHO.map((a) => `${a.nome}: ${a.texto}`).join(' '));
        secao.append(el('div', { class: 'campo largo' }, labAcao, acao),
          el('p', { class: 'dica-campo' }, ACOES_GATILHO.find((a) => a.id === atual.acao)?.texto ?? ''));
        if (atual.acao === 'mensagem') {
          const area = el('textarea', { id: 'pc-texto', rows: 3, placeholder: 'Ex.: "Está escuro demais aqui… preciso de uma lanterna."' });
          area.value = atual.texto;
          area.addEventListener('change', () => this.estado.alterar(() => { atual.texto = area.value; }));
          secao.append(el('div', { class: 'campo largo' }, el('label', { for: 'pc-texto' }, 'Texto'), area));
        }
        if (atual.acao === 'acionar') {
          const alvo = atual.alvo ? this.estado.objeto(atual.alvo) : undefined;
          const escolher = el('button', { type: 'button', class: 'secundario largo' }, alvo ? `Alvo: ${alvo.nome} (trocar)` : 'Escolher o alvo no cenário…');
          escolher.addEventListener('click', async () => {
            const id = await this.acoes.escolherAlvo();
            if (id && id !== o.id) { this.estado.alterar(() => { atual.alvo = id; }); this.render(true); }
          });
          secao.append(escolher);
        }
        if (atual.acao === 'luzes') {
          const luz = el('select', { id: 'pc-luz' }, el('option', { value: '' }, 'Todas as luzes'), ...this.estado.fase.luzes.map((l) => el('option', { value: l.id }, l.nome)));
          luz.value = atual.luz;
          luz.addEventListener('change', () => this.estado.alterar(() => { atual.luz = luz.value; }));
          const fazer = el('select', { id: 'pc-luzacao' }, el('option', { value: 'ligar' }, 'Ligar'), el('option', { value: 'desligar' }, 'Desligar'), el('option', { value: 'alternar' }, 'Alternar'));
          fazer.value = atual.luzAcao;
          fazer.addEventListener('change', () => this.estado.alterar(() => { atual.luzAcao = fazer.value as 'ligar' | 'desligar' | 'alternar'; }));
          secao.append(el('div', { class: 'linha2' }, el('div', { class: 'campo' }, el('label', { for: 'pc-luz' }, 'Luz'), luz), el('div', { class: 'campo' }, el('label', { for: 'pc-luzacao' }, 'Fazer'), fazer)));
          if (!this.estado.fase.luzes.length) secao.append(el('p', { class: 'aviso-texto' }, 'Esta fase ainda não tem luzes (ferramenta Iluminação, Y).'));
        }
        if (atual.acao === 'inimigos') {
          const marcados = this.estado.fase.inimigos.filter((i) => i.surge === o.id);
          secao.append(el('p', { class: marcados.length ? 'dica-campo' : 'aviso-texto' }, marcados.length
            ? `Surgem aqui: ${marcados.map((i) => i.id).join(', ')}.`
            : 'Nenhum inimigo marcado. Selecione um inimigo e, em "Aparece", escolha este gatilho.'));
        }
        secao.append(marcar('Só na primeira vez', atual.umaVez, (v) => { atual.umaVez = v; }, 'Desmarcado: dispara toda vez que o jogador entra.'),
          el('p', { class: 'dica-campo' }, 'No código do objeto: aoTocar (entrou) e aoSair (saiu).'));
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
        el('div', { class: 'asset-info', title: o.asset || 'zona sem imagem' }, o.asset || 'Zona sem imagem (invisível no jogo): mova e redimensione pelas alças.'),
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
      o.asset ? this.secaoAnimacao(o) : '',
      this.secaoEfeitos(o),
      el('div', { class: 'secao' }, ...secaoCamposJogo('objeto', o.campos, (k, v) => { this.estado.alterar(() => { o.campos = { ...(o.campos ?? {}), [k]: v }; }); })),
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

  /** Objeto animado: a imagem é um spritesheet cortado em quadros (tocha, porta abrindo, ventilador…). */
  private secaoAnimacao(o: ObjetoFase) {
    const secao = el('div', { class: 'secao' });
    const titulo = el('h3', {}, 'Animação');
    dica(titulo, 'Animação (spritesheet)', 'Transforma a imagem num objeto animado: ela é cortada em quadros (da esquerda para a direita, linha por linha) que tocam no jogo. Spritesheets com "spritesheet" ou "_8fps" no nome já entram animados.');
    const ligar = el('input', { type: 'checkbox' });
    ligar.checked = !!o.anim;
    ligar.addEventListener('change', async () => {
      if (ligar.checked) {
        const t = await this.acoes.tamanhoImagem(o);
        const porta = o.comportamentos[0]?.tipo === 'porta';
        const a = palpiteAnim(o.nome, t.w, t.h, porta ? 'parado' : 'loop');
        this.estado.alterar(() => { o.anim = a; const q = tamanhoQuadro(a); o.w = q.w; o.h = q.h; });
      } else if (o.anim) {
        const a = o.anim;
        this.estado.alterar(() => { o.w = a.folha[0]; o.h = a.folha[1]; delete o.anim; });
      }
      this.render(true);
    });
    const lab = el('label', { class: 'check' }, ligar, 'Animado (spritesheet)');
    dica(lab, 'Animado', 'Liga/desliga a animação. Desligado, a imagem aparece inteira.');
    secao.append(titulo, lab);
    const a = o.anim;
    if (!a) return secao;
    const recortar = () => { const q = tamanhoQuadro(a); o.w = q.w; o.h = q.h; };
    const modo = el('select', { id: 'p-anim-modo' }, ...MODOS_ANIM.map((m) => el('option', { value: m.id }, m.nome)));
    modo.value = a.modo;
    modo.addEventListener('change', () => { this.estado.alterar(() => { a.modo = modo.value as ModoAnim; }); this.render(true); });
    const labModo = el('label', { for: 'p-anim-modo' }, 'Toca');
    dica(labModo, 'Quando toca', MODOS_ANIM.map((m) => `${m.nome}: ${m.texto}`).join(' '));
    const q = tamanhoQuadro(a);
    const porta = o.comportamentos[0]?.tipo === 'porta';
    secao.append(
      el('div', { class: 'linha2' },
        this.num('Quadros', a.quadros, (v) => { a.quadros = Math.max(1, Math.round(v)); a.colunas = Math.min(a.colunas, a.quadros) || a.quadros; recortar(); }, { min: 1 }),
        this.num('Por linha', a.colunas, (v) => { a.colunas = Math.max(1, Math.min(a.quadros, Math.round(v))); recortar(); }, { min: 1 })),
      el('div', { class: 'linha2' },
        this.num('FPS', a.fps, (v) => { a.fps = Math.max(0.5, v); }, { min: 0.5, passo: 1 }),
        el('div', { class: 'campo' }, labModo, modo)),
      el('div', { class: 'tamanho-info' }, `Quadro: ${q.w} × ${q.h} px · ${a.quadros} quadros · ${duracaoFolha(a).toFixed(2).replace('.', ',')} s`),
      el('p', { class: 'dica-campo' }, MODOS_ANIM.find((m) => m.id === a.modo)?.texto ?? ''),
      porta ? el('p', { class: 'dica-campo' }, 'Porta animada: ao abrir, toca a animação e fica aberta no último quadro (em vez de sumir). Use "Parado até mandar".') : '',
      el('p', { class: 'dica-campo' }, 'No código: eu.tocar(), eu.tocar(true) repete, eu.parar(), eu.quadro.'),
    );
    return secao;
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
      this.campoSurge(i),
      el('span', { class: 'dica-campo' }, t ? `Vida ${i.ajustes?.vida ?? t.vida ?? '?'} tiro(s). Posição = pés. Arraste no cenário (gruda no chão; Alt solta).` : 'Tipo não encontrado: crie o personagem NPC em Personagens (K).')),
      this.secaoAjustesInimigo(i, t?.inimigo),
      el('div', { class: 'secao acoes' },
        botao('Editar o tipo…', () => this.acoes.abrirPersonagem(i.personagem)),
        botao(t?.script ? 'Código do tipo { }' : 'Código do tipo…', () => this.acoes.abrirCodigoInimigo(i.id)),
        botao('Excluir', () => this.acoes.excluir(), 'perigo')));
  }

  /** Só este inimigo: valores que trocam os do tipo (o resto continua vindo do tipo). */
  private secaoAjustesInimigo(i: InimigoFase, base: import('../core/inimigos').ConfigInimigo | undefined) {
    const titulo = el('h3', {}, 'Só este inimigo');
    dica(titulo, 'Só este inimigo', 'Valores diferentes do tipo apenas para este inimigo (ex.: um zumbi mais forte). Igual ao tipo = segue o tipo. No código: bloco config da fase › inimigos › ajustes; no ▶ Testar: eu.config.');
    const b = base ?? inimigoPadrao();
    const campos = AJUSTES_INIMIGO.map((a) => {
      const proprio = i.ajustes?.[a.chave] !== undefined;
      const caixa = this.num(a.nome + (proprio ? ' •' : ''), i.ajustes?.[a.chave] ?? b[a.chave], (v) => {
        const aj = { ...(i.ajustes ?? {}) };
        if (v === b[a.chave]) delete aj[a.chave]; else aj[a.chave] = v;
        if (Object.keys(aj).length) i.ajustes = aj; else delete i.ajustes;
      }, { passo: a.passo, min: a.min });
      dica(caixa.querySelector('label')!, a.nome, `${a.texto} Tipo: ${b[a.chave]}.${proprio ? ' • = diferente do tipo (volte ao valor do tipo para seguir o tipo de novo).' : ''}`);
      return caixa;
    });
    const linhas: HTMLElement[] = [];
    for (let k = 0; k < campos.length; k += 2) linhas.push(el('div', { class: 'linha2' }, ...campos.slice(k, k + 2)));
    const voltar = el('button', { type: 'button', class: 'secundario largo' }, 'Igual ao tipo (limpar ajustes)');
    voltar.disabled = !i.ajustes;
    voltar.addEventListener('click', () => { this.estado.alterar(() => { delete i.ajustes; }); this.render(true); });
    return el('div', { class: 'secao' }, titulo, ...linhas, voltar);
  }

  /** Spawner: o inimigo só aparece quando o jogador entra num gatilho. */
  private campoSurge(i: InimigoFase) {
    const gatilhos = this.estado.fase.objetos.filter((o) => o.comportamentos[0]?.tipo === 'gatilho');
    const sel = el('select', { id: 'p-surge' }, el('option', { value: '' }, 'Desde o início da fase'),
      ...gatilhos.map((g) => el('option', { value: g.id }, `Quando entrar em: ${g.nome}`)));
    sel.value = i.surge && gatilhos.some((g) => g.id === i.surge) ? i.surge : '';
    sel.addEventListener('change', () => this.estado.alterar(() => { if (sel.value) i.surge = sel.value; else delete i.surge; }));
    const lab = el('label', { for: 'p-surge' }, 'Aparece');
    dica(lab, 'Quando aparece', 'Spawner/emboscada: escolha um gatilho (zona com o comportamento Gatilho e a ação "Fazer inimigos surgirem"). O inimigo fica escondido até o jogador entrar nele.');
    return el('div', { class: 'campo largo' }, lab, sel,
      !gatilhos.length ? el('span', { class: 'dica-campo' }, 'Sem gatilhos na fase: crie uma zona (ferramenta Zona, Z) com o comportamento Gatilho.') : '');
  }

  /** Ponto de luz (ferramenta Iluminação). */
  private renderLuz(l: LuzFase) {
    const cor = el('input', { type: 'color', id: 'p-luzcor', value: l.cor });
    cor.addEventListener('change', () => this.estado.alterar(() => { l.cor = cor.value; }));
    const excluir = el('button', { type: 'button', class: 'perigo' }, 'Excluir luz');
    excluir.addEventListener('click', () => this.acoes.excluir());
    const il = this.estado.fase.iluminacao;
    const forma = el('select', { id: 'p-luzforma' }, ...FORMAS_LUZ.map((f) => el('option', { value: f.id }, f.nome)));
    forma.value = l.forma;
    forma.addEventListener('change', () => {
      this.estado.alterar(() => { l.forma = forma.value as FormaLuz; if (l.forma === 'cone' && l.raio < 120) l.raio = 160; });
      this.render(true);
    });
    const labForma = el('label', { for: 'p-luzforma' }, 'Formato');
    dica(labForma, 'Formato da luz', FORMAS_LUZ.map((f) => `${f.nome}: ${f.texto}`).join(' '));
    const porForma: HTMLElement[] = l.forma === 'cone' ? [
      this.num('Alcance (px)', l.raio, (v) => { l.raio = Math.max(16, Math.round(v)); }, { min: 16, passo: 8 }),
      el('div', { class: 'linha2' },
        this.num('Direção °', l.angulo, (v) => { l.angulo = Math.round(v); }, { passo: 15 }),
        this.num('Abertura °', l.abertura, (v) => { l.abertura = Math.max(5, Math.min(170, Math.round(v))); }, { min: 5, max: 170, passo: 5 })),
      el('span', { class: 'dica-campo' }, 'Direção: 90° = para baixo (poste), 0° = direita, 180° = esquerda, 270° = para cima.'),
    ] : l.forma === 'retangulo' ? [
      el('div', { class: 'linha2' },
        this.num('Largura', l.largura, (v) => { l.largura = Math.max(4, Math.round(v)); }, { min: 4, passo: 8 }),
        this.num('Altura', l.altura, (v) => { l.altura = Math.max(4, Math.round(v)); }, { min: 4, passo: 8 })),
      this.num('Rotação °', l.angulo, (v) => { l.angulo = Math.round(v); }, { passo: 15 }),
    ] : [this.num('Raio (px)', l.raio, (v) => { l.raio = Math.max(8, Math.round(v)); }, { min: 8, passo: 8 })];
    this.corpo.append(el('div', { class: 'secao' },
      el('h3', {}, `Luz · ${l.id}`),
      this.texto('Nome', l.nome, (v) => { l.nome = v; }),
      el('div', { class: 'campo largo' }, labForma, forma),
      el('div', { class: 'linha2' }, this.num('X', l.x, (v) => { l.x = Math.round(v); }), this.num('Y', l.y, (v) => { l.y = Math.round(v); })),
      ...porForma,
      this.num('Intensidade', l.intensidade, (v) => { l.intensidade = v; }, { min: 0, max: 1, passo: 0.1 }),
      el('div', { class: 'campo largo' }, el('label', { for: 'p-luzcor' }, 'Cor do brilho'), cor),
      this.check('Tremular (lâmpada com defeito, fogo)', l.tremular, (v) => { l.tremular = v; }),
      this.check('Começa ligada', l.ligada, (v) => { l.ligada = v; }),
      il.escura ? '' : el('p', { class: 'aviso-texto' }, 'A fase não está escura: as luzes só aparecem com "Fase escura" ligado (propriedades da fase).'),
      el('p', { class: 'dica-campo' }, `No código: jogo.luz("${l.nome}").desligar(), .ligar(), .raio = 120. Arraste o centro para mover e a borda para mudar o raio.`),
      el('div', { class: 'secao acoes' }, excluir)));
  }

  private lanternaForma() {
    const il = this.estado.fase.iluminacao;
    const sel = el('select', { id: 'p-lanternaforma' }, el('option', { value: 'circulo' }, 'Em volta (círculo)'), el('option', { value: 'cone' }, 'Apontada (cone)'));
    sel.value = il.lanternaForma;
    sel.addEventListener('change', () => this.estado.alterar(() => { il.lanternaForma = sel.value as 'circulo' | 'cone'; }));
    return el('div', { class: 'campo largo' }, el('label', { for: 'p-lanternaforma' }, 'Lanterna'), sel);
  }

  private secaoIluminacao() {
    const f = this.estado.fase;
    const il = f.iluminacao;
    const cor = el('input', { type: 'color', id: 'p-escurocor', value: il.cor });
    cor.addEventListener('change', () => this.estado.alterar(() => { il.cor = cor.value; }));
    const titulo = el('h3', {}, 'Iluminação');
    dica(titulo, 'Iluminação', 'Fase escura: tudo fica no escuro e só os pontos de luz (ferramenta Iluminação, Y) e a lanterna do jogador clareiam. Gatilhos e o código podem ligar/desligar luzes e apagar a sala.');
    return el('div', { class: 'secao' }, titulo,
      this.check('Fase escura', il.escura, (v) => { il.escura = v; }),
      ...(il.escura ? [
        this.num('Escuridão', il.escuridao, (v) => { il.escuridao = v; }, { min: 0, max: 1, passo: 0.05 }),
        el('div', { class: 'campo largo' }, el('label', { for: 'p-escurocor' }, 'Cor do escuro'), cor),
        this.num('Lanterna (px)', il.lanterna, (v) => { il.lanterna = Math.max(0, Math.round(v)); }, { min: 0, passo: 8 }),
        this.lanternaForma(),
        el('span', { class: 'dica-campo' }, 'Lanterna = luz do jogador no ▶ Testar (0 = sem). Em cone, aponta para onde ele olha.'),
      ] : []),
      el('span', { class: 'dica-campo' }, `${f.luzes.length} ponto(s) de luz. Ferramenta Iluminação (Y): clique no cenário para criar.`));
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
          this.num('Largura', f.tamanho[0], (v) => {
            // Zonas (passagens/gatilhos) encostadas na borda direita acompanham a borda nova
            const antes = f.tamanho[0], nova = Math.round(v);
            for (const o of f.objetos) if (!o.asset && o.x + o.w * o.escala >= antes - 24) o.x = Math.max(0, o.x + nova - antes);
            f.tamanho = [nova, f.tamanho[1]];
          }, { min: 64, passo: 16 }),
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
      this.secaoIluminacao(),
      el('div', { class: 'secao' }, ...secaoCamposJogo('fase', f.campos, (k, v) => { this.estado.alterar(() => { f.campos = { ...(f.campos ?? {}), [k]: v }; }); })),
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
