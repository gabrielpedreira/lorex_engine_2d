// ▶ Testar: joga a fase dentro do editor, com o jogador correndo e pulando sobre as colisões desenhadas.
import { Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { Animador, animacaoPara, ancoraPes, estadoDoJogador, extras, retanguloQuadro, vidaPadrao, type ConfigVida, type Personagem } from '../core/personagem';
import { EntradaJogo, TECLAS_RESERVADAS, controlesPadrao, nomeTecla, normalizarCodigo, textoAtalho, type Controles } from '../core/controles';
import { LOG } from '../core/log';
import { Jogador, JOGADOR_PADRAO, montarSegmentos, xEm, yEm, type ConfigJogador, type Entrada, type Segmento } from '../core/fisica';
import { MundoInterativo, type EstadoObjeto, type EtapaInspecao, type ResultadoInteracao } from '../core/comportamentos';
import { mapaVazio, resumoTransicao, transicaoPadrao, viagemDe, type Mapa, type Transicao, type Viagem } from '../core/mapa';
import { MotorScripts, type FontesScripts } from './motorScripts';
import type { ObjetoFase } from '../core/tipos';
import { InimigoVivo, raioTiro, type TipoInimigo } from './inimigosTeste';
import { danoNaDistancia, type AtaqueInimigo, type ConfigArma, type EventoIA } from '../core/inimigos';
import { normalizarHud, type ConfigHud } from '../core/hud';
import { elementoHud, posicionarHud, telaMorte } from '../ui/hud';
import { el } from '../ui/dom';
import { MenuJogo } from './menuJogo';
import { arrumarEspacos, cabeNoMenu, espacosDoMenu, itemBase, itemDe, itensPadrao, menuPadrao, receitaDe, type ConfigItens, type ConfigMenu } from '../core/menu';
import { dica } from '../ui/legenda';
import type { Estado } from './estado';
import type { Viewport } from './viewport';

const PASSO = 1 / 120;

/** Um objeto empurrado pode ir para o lado dir? (sem parede na frente e com chão embaixo da frente) */
function objetoPodeIr(segs: Segmento[], b: { x: number; y: number; w: number; h: number }, dir: number): boolean {
  const frente = dir > 0 ? b.x + b.w + 3 : b.x - 3;
  const base = b.y + b.h;
  let chao = false;
  for (const s of segs) {
    if (s.tipo === 'chao') {
      const yi = yEm(s, frente);
      if (yi !== null && yi > base - 40 && yi < base + 60) chao = true;
    } else if (s.tipo === 'parede') {
      for (const hy of [b.y + b.h * 0.4, base - 8]) {
        const xi = xEm(s, hy);
        if (xi !== null && Math.abs(xi - frente) < 6) return false;
      }
    }
  }
  return chao;
}

/** O olho padrão (pixel art) acima da personagem quando há algo com interação por perto. */
function olhoPadrao(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 14 10'); s.setAttribute('shape-rendering', 'crispEdges'); s.setAttribute('width', '100%'); s.setAttribute('height', '100%');
  s.innerHTML = '<path fill="#111" d="M4 1h6v1h2v1h1v1h1v2h-1v1h-1v1h-2v1H4v-1H2V7H1V6H0V4h1V3h1V2h2z"/>'
    + '<path fill="#f2f2e8" d="M4 2h6v1h2v1h1v2h-1v1h-2v1H4V7H2V6H1V4h1V3h2z"/>'
    + '<path fill="#2b8f6c" d="M5 3h4v4H5z"/><path fill="#0b0b0b" d="M6 4h2v2H6z"/><path fill="#fff" d="M6 4h1v1H6z"/>';
  return s;
}

/** Inimigo ouve o tiro dado em x (se estiver perto o bastante). */
function ouvir(i: InimigoVivo, x: number): EventoIA[] {
  i.ia.ouvirTiro(x, i.corpo.x);
  return []; // o evento "alerta" sai no próximo passo da IA
} // física em passo fixo (estável em qualquer taxa de quadros)

export class ModoTeste {
  private jogador: Jogador | null = null;
  private segs: Segmento[] = [];
  private entradaJogo = new EntradaJogo(controlesPadrao());
  private puloApertado = false;
  private acumulado = 0;
  private cameraAntes = { x: 0, y: 0, zoom: 1 };
  private colisoesAntes = true;
  private grafico = new Graphics();
  /** Brilho dos pontos de inspeção marcados como importantes. */
  private brilhos = new Graphics();
  private elOlho!: HTMLElement;
  private elFoco!: HTMLElement;
  private elVer!: HTMLElement;
  /** Empurrando um objeto: id, distância do jogador até ele e a velocidade normal (para devolver ao soltar). */
  private empurrando: { id: string; offset: number; velocidadeAntes: number } | null = null;
  /** Arquivos achados em pontos de inspeção nesta partida (entram no catálogo para a lista de Arquivos do menu). */
  private descobertos = new Map<string, import('../core/menu').ConfigItem>();
  private hud: HTMLElement;
  private camAlvo = { x: 0, y: 0 };
  private mundo: MundoInterativo | null = null;
  private interagirApertado = false;
  private mensagemAberta = false;
  private elPrompt: HTMLElement;
  private elInventario: HTMLElement;
  private elToast: HTMLElement;
  private elMensagem: HTMLElement;
  private timerToast = 0;
  /** Inventário levado para a próxima área ao passar por uma saída. */
  private inventarioLevado: Map<string, number> | null = null;

  /** Personagem animado (null = retângulo provisório). */
  private pers: { dados: Personagem; quadros: Map<string, Texture[]>; animador: Animador } | null = null;
  private spritePers = new Sprite(Texture.EMPTY);
  private aterrissouHa = 9;
  private elAcao: HTMLElement | null = null;
  private estavaNoChao = false;

  /** Prepara o personagem animado do teste. carregar = textura de uma folha (caminho relativo a jogo/). */
  async definirPersonagem(dados: Personagem | null, carregar: (folha: string) => Promise<Texture>) {
    if (!dados || !dados.animacoes.parado) { this.pers = null; return; }
    const quadros = new Map<string, Texture[]>();
    for (const [estado, anim] of Object.entries(dados.animacoes)) {
      const base = await carregar(anim.folha);
      quadros.set(estado, Array.from({ length: anim.quadros }, (_, i) => {
        const r = retanguloQuadro(anim, base.width, i);
        return new Texture({ source: base.source, frame: new Rectangle(r.x, r.y, Math.min(r.w, base.width - r.x), Math.min(r.h, base.height - r.y)) });
      }));
    }
    this.pers = { dados, quadros, animador: new Animador(dados) };
  }

  /** Teclas de cada ação (ferramenta Controles; salvas no projeto). */
  set controles(c: Controles) { this.entradaJogo.controles = c; if (this.ativo) this.montarHud(); }
  get controles() { return this.entradaJogo.controles; }

  // ---------- Inimigos, arma e HUD ----------
  private tiposInimigo = new Map<string, TipoInimigo>();
  private inimigos: InimigoVivo[] = [];
  private municao = 0;
  private recargaAte = 0;
  private agarradoAte = 0;
  private agarradoPor = '';
  private tempoJogo = 0;
  // ---------- Vida, morte e checkpoint ----------
  private vida = 10;
  private invulAte = 0;
  /** Momento (tempoJogo) da morte; null = vivo. */
  private mortoEm: number | null = null;
  /** Onde o jogador volta ao morrer (na sala atual): chegada na sala ou gatilho de checkpoint. */
  private checkpoint: { x: number; y: number; direita: boolean; nome: string } | null = null;
  private elMorte: HTMLElement;
  private get cfgVida(): ConfigVida { return this.pers?.dados.vida ?? vidaPadrao(); }
  private get morto() { return this.mortoEm !== null; }
  private renascendo = false;
  private rastro: { x0: number; y0: number; x1: number; y1: number; t: number; total: number; acertou: boolean; linha: import('../core/inimigos').LinhaTiro; arma: ConfigArma } | null = null;
  /** Munição levada para a próxima área. */
  private municaoLevada: number | null = null;
  /** Elementos do HUD (ferramenta HUD, projeto.json). */
  hudConfig: ConfigHud = normalizarHud(null);
  /** Menu e itens (ferramenta Menu e itens); o catálogo já inclui as armas. */
  menuConfig: ConfigMenu = menuPadrao();
  itensConfig: ConfigItens = itensPadrao();
  /** Troca a arma (Usar uma arma no menu): o editor lê o arquivo. */
  carregarArma: (arquivo: string) => Promise<ConfigArma | null> = async () => null;
  private menu!: MenuJogo;
  /** URL de uma imagem (caminho relativo a jogo/), para o HUD. */
  urlImagem: (c: string) => string = (c) => c;
  /** Piscar depois de um golpe (reação pronta ou eu.piscar() no código). */
  private piscarDe = 0;
  private piscarAte = 0;
  private piscarCor = 0xff6060;
  private piscarVezes = 4;
  private elHudTela: HTMLElement;
  private valoresHud = new Map<string, string>();

  /** Tipos de inimigo (personagens NPC) usados na fase, já com as texturas. */
  definirTiposInimigo(tipos: Map<string, TipoInimigo>) { this.tiposInimigo = tipos; }

  /** Código (jogo/scripts). null = sem scripts. */
  private motor: MotorScripts | null = null;
  private elHudJogo: HTMLElement;
  private hudJogo = new Map<string, string>();
  /** Variáveis do código levadas para a próxima área. */
  private levarCodigo: { variaveis: Record<string, unknown>; jogador: Record<string, unknown> } | null = null;

  /** Compila os scripts desta partida (chame antes de iniciar). */
  async prepararScripts(fontes: FontesScripts | null) {
    if (!fontes || (!fontes.jogo && !fontes.fase && !fontes.personagem && !fontes.arma && !fontes.objetos.length && !fontes.inimigos?.length && !fontes.sistemas?.length)) { this.motor = null; return; }
    const motor = new MotorScripts(this.ponte());
    await motor.carregar(fontes);
    if (this.levarCodigo) { motor.variaveis = this.levarCodigo.variaveis; motor.dadosJogador = this.levarCodigo.jogador; }
    this.levarCodigo = null;
    this.motor = motor;
  }

  /** O que o código pode mexer no teste. */
  private ponte() {
    const t = this;
    return {
      get arquivoFase() { return t.estado.arquivoFase ?? ''; },
      objetos: () => t.estado.fase.objetos,
      mundo: () => t.mundo!,
      jogador: () => (t.jogador ? { x: t.jogador.x, y: t.jogador.y, vx: t.jogador.vx, vy: t.jogador.vy, noChao: t.jogador.noChao, olhandoDireita: t.jogador.olhandoDireita, caixa: t.caixaJogador() } : null),
      nomeJogador: () => t.pers?.dados.nome ?? 'Jogador',
      tocarAnimacao: (chave: string) => {
        const a = t.pers?.dados.animacoes[chave];
        if (!t.pers || !a) return false;
        const ok = t.pers.animador.tocar(chave, a.repetir);
        if (ok) t.mostrarAcao(a.nome ?? chave);
        return ok;
      },
      acaoAtual: () => t.pers?.animador.acaoAtual ?? null,
      teleportar: (x: number, y: number) => { if (t.jogador) { t.jogador.x = x; t.jogador.y = y; t.jogador.vx = 0; t.jogador.vy = 0; } },
      empurrar: (vx: number, vy: number) => { if (t.jogador) { t.jogador.vx += vx; t.jogador.vy += vy; } },
      aviso: (x: string) => { LOG.add({ cat: 'mundo', texto: `aviso (código): ${x}` }); t.toast(x); },
      mensagem: (x: string) => t.tratar({ mensagem: x }),
      irPara: (f: string, op?: { chegada?: string; transicao?: Partial<Transicao> | string }) => t.viajar(t.viagemDoCodigo(f, op)),
      passar: (o: ObjetoFase) => {
        const v = viagemDe(t.mapa, t.estado.arquivoFase ?? '', o.id);
        if (v) t.viajar(v, o); else t.toast(`${o.nome} não está conectada no Mapa (M).`);
      },
      destinoDe: (o: ObjetoFase) => viagemDe(t.mapa, t.estado.arquivoFase ?? '', o.id),
      apertou: (a: string) => t.entradaJogo.apertou(a),
      segurando: (a: string) => t.entradaJogo.segurando(a),
      hudDefinir: (r: string, v: string) => {
        if (t.hudConfig.elementos.some((e) => e.chave === r)) { t.valoresHud.set(r, v); return; } // elemento da ferramenta HUD
        t.hudJogo.set(r, v); t.desenharHudJogo();
      },
      hudRemover: (r: string) => { t.valoresHud.delete(r); t.hudJogo.delete(r); t.desenharHudJogo(); },
      inimigos: () => t.inimigos,
      municao: () => t.municao,
      definirMunicao: (n: number) => { const a = t.pers?.dados.arma; if (a) t.municao = Math.max(0, Math.min(a.pente, Math.round(n))); },
      pente: () => t.pers?.dados.arma?.pente ?? 0,
      recarregar: () => { const a = t.pers?.dados.arma; if (a) t.tratarArma(a.acaoRecarga); },
      disparar: () => { const a = t.pers?.dados.arma; return a && t.jogador ? t.disparar(a) : null; },
      arma: () => t.pers?.dados.arma ?? null,
      camposPersonagem: () => t.pers?.dados.campos,
      camposFase: () => t.estado.fase.campos,
      duracaoAnim: (nome: string) => t.duracaoAnim(nome),
      agarrado: () => t.tempoJogo < t.agarradoAte,
      danoInimigo: (ini: InimigoVivo, n: number) => { ini.atingido(); t.tratarEventosInimigo(ini, ini.ia.levarDano(n, t.jogador?.x ?? ini.corpo.x, { duracao: ini.duracao })); },
      mudouCena: () => { t.cenaMudou = true; },
      interagir: (o: ObjetoFase) => t.interagirCom(o),
      luzesFase: () => t.estado.fase.luzes,
      vida: () => t.vida,
      vidaMax: () => t.cfgVida.maxima,
      definirVida: (n: number) => t.definirVida(n, 'código'),
      ferir: (n: number) => t.ferir(n, 'código'),
      piscar: (seg?: number, cor?: string, vezes?: number) => t.piscar(seg ?? t.cfgVida.piscar, cor ? Number.parseInt(cor.replace('#', ''), 16) || 0xff6060 : 0xff6060, vezes ?? t.cfgVida.piscadas),
      invulneravelPor: (seg?: number) => t.invulneravelPor(seg ?? t.cfgVida.invulneravel),
      tocarDano: () => { t.pers?.animador.tocar('dano'); },
      morto: () => t.morto,
      invulneravel: () => t.tempoJogo < t.invulAte,
      morrer: () => t.morrer('código'),
      espacosLivres: () => { const e = espacosDoMenu(t.menuConfig); return t.mundo ? arrumarEspacos(t.mundo.inventario, t.itensConfig, e.colunas, e.total).livres : e.total; },
      cabe: (item: string) => { const e = espacosDoMenu(t.menuConfig); return !t.mundo || cabeNoMenu(t.mundo.inventario, t.itensConfig, item, e.colunas, e.total); },
      menuAbrir: (tela?: string) => t.abrirMenu(tela === 'arquivos' ? 'arquivos' : 'inventario'),
      menuFechar: () => t.menu.fechar(),
      menuAberto: () => t.menu.aberto,
      checkpoint: (x?: number, y?: number) => { if (t.jogador) t.marcarCheckpoint(x ?? t.jogador.x, y ?? t.jogador.y, 'código'); },
    };
  }
  private cenaMudou = false;

  private desenharHudJogo() {
    this.elHudJogo.replaceChildren(...[...this.hudJogo].map(([r, v]) => el('div', {}, el('span', {}, r), el('strong', {}, v))));
    this.elHudJogo.hidden = !this.hudJogo.size;
  }

  /** Interagir com um objeto: primeiro o código (aoInteragir), depois o comportamento pronto. */
  private interagirCom(o: ObjetoFase) {
    const m = this.mundo;
    if (!m) return;
    LOG.add({ cat: 'mundo', texto: `interagiu com ${o.nome}` });
    if (this.motor && !this.motor.interagir(o)) { this.aplicarVisibilidade(); this.atualizarInventario(); return; }
    this.tratar(m.interagir(o), o);
  }

  /** O teste acabou: texto completo do log dele (o editor salva em logs/). */
  aoTerminarLog: (texto: string) => void = () => {};
  private ultimoEstado = '';
  private ultimoProx = '';

  /** Passagem para outra sala: o editor faz a transição, abre o destino e continua o teste lá. */
  aoIrPara: (v: Viagem) => void = () => {};
  /** Mapa do projeto (ferramenta Mapa): para onde cada passagem leva. */
  mapa: Mapa = mapaVazio();
  /** Trocando de sala: o teste continua (mesmo log, mesma memória das salas). */
  private viajando = false;
  /** Já passou por uma passagem e está esperando o editor trocar de sala (o jogo congela). */
  private saindo = false;
  private chegadaPendente = '';
  /** O que mudou em cada sala já visitada nesta partida (portas, itens pegos, inimigos mortos). */
  private memoriaSalas = new Map<string, { estados: Map<string, EstadoObjeto>; mortos: Set<string>; luzes: Map<string, boolean>; escura: boolean; desloc?: Map<string, { dx: number; dy: number }> }>();
  /** Inimigos que só surgem por um gatilho (spawner). */
  private aguardando: import('../core/tipos').InimigoFase[] = [];

  /** Configuração do jogador (lida/salva no projeto). */
  config: ConfigJogador = { ...JOGADOR_PADRAO };
  aoMudarConfig: (c: ConfigJogador) => void = () => {};
  aoMudarEstado: () => void = () => {};

  constructor(private viewport: Viewport, private estado: Estado, private centro: HTMLElement) {
    this.hud = el('div', { class: 'hud-teste' });
    this.hud.hidden = true;
    this.elPrompt = el('div', { class: 'teste-prompt' });
    this.elInventario = el('div', { class: 'teste-inventario' });
    this.elToast = el('div', { class: 'teste-toast', role: 'status' });
    this.elMensagem = el('div', { class: 'teste-mensagem', role: 'dialog' });
    this.elHudJogo = el('div', { class: 'teste-hud-jogo' });
    this.elHudTela = el('div', { class: 'teste-hud-tela' });
    this.elMorte = el('div', { class: 'teste-morte', role: 'status' });
    this.elMorte.hidden = true;
    centro.append(this.elMorte);
    centro.append(this.elHudTela);
    this.elHudTela.hidden = true;
    this.elOlho = el('div', { class: 'teste-olho', 'aria-hidden': 'true' });
    this.elFoco = el('div', { class: 'teste-foco', 'aria-hidden': 'true' });
    this.elVer = el('div', { class: 'teste-ver', role: 'dialog' });
    this.elVer.hidden = true;
    this.elOlho.hidden = true;
    centro.append(this.elFoco, this.elVer, this.elOlho);
    for (const x of [this.elPrompt, this.elInventario, this.elMensagem, this.elHudJogo]) { x.hidden = true; centro.append(x); }
    this.menu = new MenuJogo({
      menu: () => this.menuConfig, itens: () => this.itensConfig, url: (c) => this.urlImagem(c),
      inventario: () => this.mundo?.inventario ?? new Map(),
      vida: () => ({ atual: this.vida, maxima: this.cfgVida.maxima }),
      arma: () => { const a = this.pers?.dados.arma; return a ? { nome: a.nome, imagem: a.imagens.menu || a.imagens.hud, municao: this.municao, pente: a.pente } : null; },
      usar: (item) => this.usarItem(item),
      combinar: (a, b) => this.combinarItens(a, b),
      aviso: (t) => this.toast(t),
      mapa: () => { LOG.add({ cat: 'mundo', texto: 'menu: Mapa (ainda sem tela de mapa)' }); this.toast('Mapa: em breve.'); },
    });
    this.menu.tamanho = () => this.menuConfig.tamanho; // a tela do menu é fixa; é ampliada para preencher o quadro do jogo
    this.menu.aoFechar = () => { LOG.add({ cat: 'mundo', texto: 'menu fechado' }); this.entradaJogo.limpar(); };
    centro.append(this.menu.raiz);
    this.elToast.hidden = true;
    centro.append(this.elToast);
    centro.append(this.hud);
  }

  /** Abre o menu (inventário) sobre a tela do jogo; o jogo fica pausado enquanto ele estiver aberto. */
  /** O quadro da tela do jogo (px relativos ao cenário): menu, tela de morte e transições acontecem só nele. */
  retanguloTela() {
    const cj = this.viewport.cameraJogo();
    const a = this.viewport.camadaParaTela(cj.x, cj.y, '');
    const z = this.estado.camera.zoom;
    const [rw, rh] = this.estado.fase.resolucaoBase;
    return { x: a.x, y: a.y, w: rw * z, h: rh * z };
  }

  // ---------- Tela cheia (só durante o ▶ Testar) ----------
  private saiuTelaCheiaEm = 0;
  get telaCheia() { return !!document.fullscreenElement; }
  alternarTelaCheia() {
    if (!this.ativo) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void this.centro.requestFullscreen().catch((err) => this.toast(`Tela cheia indisponível: ${String(err)}`));
  }
  private aoTelaCheia = () => {
    if (!document.fullscreenElement) this.saiuTelaCheiaEm = performance.now();
    LOG.add({ cat: 'sistema', texto: document.fullscreenElement ? 'tela cheia (Esc ou F4 volta)' : 'saiu da tela cheia' });
    // Espera o cenário mudar de tamanho e reencaixa o jogo, o menu e a tela de morte
    setTimeout(() => {
      if (!this.ativo) return;
      this.ajustarZoom();
      if (this.menu.aberto) this.menu.areaJogo(this.retanguloTela());
      if (this.mortoEm !== null) this.mostrarTelaMorte();
    }, 120);
  };

  private abrirMenu(tela: 'inventario' | 'arquivos' = 'inventario') {
    if (!this.mundo || this.morto || this.saindo) return;
    this.menu.areaJogo(this.retanguloTela());
    this.menu.abrir(tela); // tela cheia: ocupa a área do jogo inteira, centralizado
    this.entradaJogo.limpar();
    this.elPrompt.hidden = true;
    const e = espacosDoMenu(this.menuConfig);
    LOG.add({ cat: 'mundo', texto: `menu aberto (${tela}) · espaços livres: ${arrumarEspacos(this.mundo.inventario, this.itensConfig, e.colunas, e.total).livres}/${e.total}` });
  }

  /** Usar (menu). Devolve true para fechar o menu. */
  private usarItem(nome: string): boolean {
    const m = this.mundo;
    if (!m || !this.jogador) return true;
    const it = itemDe(this.itensConfig, nome);
    const caixa = this.caixaJogador();
    const areas = m.areasDeUso(caixa);
    const area = areas.find((o) => (o.comportamentos[0] as { item?: string }).item?.toLowerCase() === nome.toLowerCase()) ?? null;
    if (this.motor && !this.motor.usarItem(nome, area ?? areas[0] ?? null)) { LOG.add({ cat: 'mundo', texto: `usar ${nome}: cancelado pelo código (aoUsarItem)` }); return true; }
    const tirar = () => { const q = m.inventario.get(nome) ?? 0; if (q > 1) m.inventario.set(nome, q - 1); else m.inventario.delete(nome); };
    if (area || it.uso === 'area') {
      const r = m.usarItem(nome, caixa, this.itensConfig.mensagens.aquiNao);
      LOG.add({ cat: 'mundo', texto: `usar ${nome}: ${r.usou ? `funcionou em ${area?.nome ?? '?'}` : r.aviso}` });
      if (!r.usou) { this.toast(r.aviso ?? this.itensConfig.mensagens.aquiNao); return false; }
      if (r.consome) tirar();
      this.tratar(r, area ?? undefined);
      return true;
    }
    if (it.uso === 'curar') {
      if (this.vida >= this.cfgVida.maxima) { this.toast('A vida já está cheia.'); return false; }
      this.definirVida(this.vida + Math.max(1, it.cura), `usou ${nome}`);
      if (it.consome) tirar();
      this.toast(`Usou: ${nome} (+${Math.max(1, it.cura)})`);
      this.atualizarInventario();
      return true;
    }
    if (it.uso === 'arma') {
      if (!it.arma) { this.toast(`${nome}: escolha o arquivo da arma em Menu e itens.`); return false; }
      const atual = this.pers?.dados.arma;
      if (atual && (atual.nome === nome || it.arma === this.arquivoArma)) { this.toast(`${nome} já está em uso.`); return false; }
      void this.carregarArma(it.arma).then((a) => {
        if (!a || !this.pers) { this.toast(`Não consegui carregar a arma ${it.arma}.`); return; }
        this.pers.dados.arma = a; this.arquivoArma = it.arma; this.municao = a.pente; this.recargaAte = 0;
        LOG.add({ cat: 'personagem', texto: `equipou ${a.nome} (${a.pente}/${a.pente})` });
        this.toast(`Equipou: ${a.nome}`);
      });
      return true;
    }
    this.toast(`Não dá para usar ${nome}.`);
    return false;
  }
  private arquivoArma = '';

  /** Combinar (menu): pela tabela de combinações; o código (aoCombinar) pode cancelar. */
  private combinarItens(a: string, b: string) {
    const m = this.mundo;
    if (!m) return;
    const r = receitaDe(this.itensConfig, a, b);
    if (this.motor && !this.motor.combinar(a, b, r?.resultado ?? null)) { LOG.add({ cat: 'mundo', texto: `combinar ${a} + ${b}: cancelado pelo código (aoCombinar)` }); return; }
    if (!r) { LOG.add({ cat: 'mundo', texto: `combinar ${a} + ${b}: não combinam` }); this.toast(this.itensConfig.mensagens.naoCombina); return; }
    for (const n of [a, b]) { const q = m.inventario.get(n) ?? 0; if (q > 1) m.inventario.set(n, q - 1); else m.inventario.delete(n); }
    m.inventario.set(r.resultado, (m.inventario.get(r.resultado) ?? 0) + r.quantidade);
    LOG.add({ cat: 'mundo', texto: `combinou ${a} + ${b} → ${r.resultado}${r.quantidade > 1 ? ` ×${r.quantidade}` : ''}` });
    this.toast(`${a} + ${b} → ${r.resultado}`);
    this.atualizarInventario();
  }

  get ativo() { return this.estado.testando; }

  iniciar() {
    if (this.ativo) return;
    const e = this.estado;
    e.selecionar(null);
    e.testando = true;
    this.colisoesAntes = e.mostrarColisoes;
    e.mostrarColisoes = false;
    this.cameraAntes = { ...e.camera };
    this.segs = montarSegmentos(e.fase.colisoes.filter((c) => !c.objeto)); // as presas a objetos (empurráveis) andam com eles
    const continuando = this.viajando;
    if (continuando) LOG.add({ cat: 'mundo', texto: `chegou em ${e.fase.nome}${e.arquivoFase ? ` (${e.arquivoFase})` : ''}${this.chegadaPendente ? ` · na passagem ${e.objeto(this.chegadaPendente)?.nome ?? this.chegadaPendente}` : ' · no início do jogador'}` });
    else {
      LOG.iniciarTeste(`${e.fase.nome}${e.arquivoFase ? ` (${e.arquivoFase})` : ''} · jogador: ${this.pers?.dados.nome ?? 'retângulo provisório'}${this.motor ? ' · com código' : ''}`);
      this.memoriaSalas.clear();
    }
    this.ultimoEstado = ''; this.ultimoProx = '';
    // Arquivos achados em inspeções de outras salas continuam na lista de Arquivos
    if (!continuando) this.descobertos.clear();
    for (const [n, it] of this.descobertos) if (!this.itensConfig.itens.some((i) => i.nome === n)) this.itensConfig = { ...this.itensConfig, itens: [...this.itensConfig.itens, it] };
    this.saindo = false;
    this.reiniciarJogador();
    this.reiniciarMundo(continuando);
    this.posicionarChegada();
    if (!continuando) { this.vida = this.cfgVida.maxima; LOG.add({ cat: 'personagem', texto: `vida: ${this.vida}/${this.cfgVida.maxima}` }); }
    this.mortoEm = null; this.invulAte = 0; this.elMorte.hidden = true;
    // Entrar numa sala marca um checkpoint na chegada
    if (this.jogador) this.marcarCheckpoint(this.jogador.x, this.jogador.y, continuando ? 'chegada na sala' : 'início do teste', true);
    this.viajando = false;
    this.entradaJogo.limpar();


    this.inserirGrafico();
    this.viewport.aposSincronizar = () => this.inserirGrafico();
    this.viewport.aoQuadro = (ms) => this.quadro(ms);
    window.addEventListener('keydown', this.tecla, true);
    window.addEventListener('keyup', this.soltarTecla, true);
    window.addEventListener('blur', this.perderFoco);
    document.addEventListener('fullscreenchange', this.aoTelaCheia);
    this.montarHud();
    this.hud.hidden = false;
    this.ajustarZoom();
    if (!e.fase.colisoes.length) e.avisar('Esta fase ainda não tem colisão: o jogador vai cair. Desenhe o chão com a ferramenta Colisão (C).');
    else e.avisar('Testando a fase. Esc volta ao editor.');
    e.emit('opcoes');
    this.aoMudarEstado();
  }

  parar() {
    if (!this.ativo) return;
    const e = this.estado;
    e.testando = false;
    e.mostrarColisoes = this.colisoesAntes;
    if (!this.viajando) this.aoTerminarLog(LOG.terminarTeste());
    Object.assign(e.camera, this.cameraAntes);
    this.viewport.aoQuadro = null;
    this.viewport.aposSincronizar = null;
    this.grafico.removeFromParent();
    this.grafico.clear();
    this.spritePers.removeFromParent();
    window.removeEventListener('keydown', this.tecla, true);
    window.removeEventListener('keyup', this.soltarTecla, true);
    window.removeEventListener('blur', this.perderFoco);
    document.removeEventListener('fullscreenchange', this.aoTelaCheia);
    if (document.fullscreenElement && !this.viajando) void document.exitFullscreen();
    this.hud.hidden = true;
    for (const x of [this.elPrompt, this.elInventario, this.elToast, this.elMensagem, this.elHudJogo, this.elMorte, this.elOlho, this.elVer]) x.hidden = true;
    this.elFoco.classList.remove('ativo');
    this.soltarEmpurrar(false);
    this.brilhos.removeFromParent(); this.brilhos.clear();
    if (this.menu.aberto) { this.menu.aoFechar = () => {}; this.menu.fechar(); this.menu.aoFechar = () => { LOG.add({ cat: 'mundo', texto: 'menu fechado' }); this.entradaJogo.limpar(); }; }
    this.mortoEm = null;
    this.spritePers.alpha = 1;
    this.spritePers.tint = 0xffffff;
    this.hudJogo.clear();
    this.viewport.deslocamentoTeste = null;
    for (const i of this.inimigos) i.remover();
    this.inimigos = [];
    this.viewport.ocultarInimigosEditor = false;
    this.elHudTela.hidden = true;
    this.mensagemAberta = false;
    this.jogador = null;
    this.mundo = null;
    this.viewport.visibilidadeTeste = null;
    this.viewport.quadroTeste = null;
    this.viewport.luzTeste = null;
    this.viewport.atualizarCena();
    e.emit('camera');
    e.emit('opcoes');
    if (!this.viajando) e.avisar('De volta ao editor.');
    this.aoMudarEstado();
  }

  /** O editor vai trocar de sala: o próximo parar/iniciar continua a mesma partida. */
  prepararViagem(v: Viagem) { this.viajando = true; this.chegadaPendente = v.chegada; }
  /** A troca de sala não aconteceu (ex.: cancelou o "salvar alterações"): o jogo segue. */
  cancelarViagem() { this.viajando = false; this.saindo = false; this.chegadaPendente = ''; }

  /** Itens, portas e alavancas voltam ao estado inicial (o inventário vem da área anterior, se houver). */
  private reiniciarMundo(lembrar = false) {
    this.mundo = new MundoInterativo(this.estado.fase);
    const mundo = this.mundo;
    // Voltando a uma sala já visitada: portas, itens e inimigos mortos ficam como estavam
    const arquivo = this.estado.arquivoFase ?? '';
    const mem = lembrar ? this.memoriaSalas.get(arquivo) : undefined;
    if (!lembrar) this.memoriaSalas.delete(arquivo);
    if (mem) {
      for (const [id, est] of mem.estados) {
        mundo.estados.set(id, { ...est });
        const o = this.estado.objeto(id);
        if (o?.anim && est.aberta) mundo.definirQuadro(id, o.anim.quadros - 1);
      }
      for (const [id, v] of mem.luzes) mundo.luzes.set(id, v);
      for (const [id, d] of mem.desloc ?? []) mundo.deslocamentos.set(id, { ...d });
      mundo.escura = mem.escura;
      mundo.marcarMudanca();
      LOG.add({ cat: 'mundo', texto: `${this.renascendo ? 'sala recomeça do checkpoint (portas e itens como estavam)' : 'sala já visitada: estado anterior restaurado'}${mem.mortos.size ? ` (${mem.mortos.size} inimigo(s) continuam mortos)` : ''}` });
    }
    this.viewport.quadroTeste = (o) => mundo.quadroAnim(o);
    mundo.podeCurar = () => !this.morto && this.vida < this.cfgVida.maxima;
    const esp = espacosDoMenu(this.menuConfig);
    mundo.cabe = (item) => cabeNoMenu(mundo.inventario, this.itensConfig, item, esp.colunas, esp.total);
    mundo.textoSemEspaco = this.itensConfig.mensagens.semEspaco;
    this.viewport.luzTeste = {
      escura: () => mundo.escura,
      luz: (l) => ({ ligada: mundo.luzes.get(l.id) ?? l.ligada, raio: mundo.ajusteLuz.get(l.id)?.raio ?? l.raio, intensidade: mundo.ajusteLuz.get(l.id)?.intensidade ?? l.intensidade, angulo: mundo.ajusteLuz.get(l.id)?.angulo ?? l.angulo }),
      jogador: () => (this.jogador ? { x: this.jogador.x, y: this.jogador.y - this.jogador.cfg.altura * 0.62, direita: this.jogador.olhandoDireita } : null),
    };
    this.tempoJogo = 0;
    this.agarradoAte = 0;
    this.recargaAte = 0;
    for (const i of this.inimigos) i.remover();
    this.inimigos = [];
    this.aguardando = [];
    for (const def of this.estado.fase.inimigos) {
      if (mem?.mortos.has(def.id)) continue;
      // Spawner: espera o gatilho (a não ser que ele já tenha disparado nesta partida)
      if (def.surge && this.estado.objeto(def.surge) && !mundo.estados.get(def.surge)?.usado) { this.aguardando.push(def); continue; }
      const tipo = this.tiposInimigo.get(def.personagem);
      if (!tipo) { LOG.add({ cat: 'erro', texto: `Inimigo ${def.id}: o personagem ${def.personagem} não existe ou não carregou` }); continue; }
      this.inimigos.push(new InimigoVivo(def, tipo, this.config.gravidade));
    }
    if (this.aguardando.length) LOG.add({ cat: 'inimigo', texto: `${this.aguardando.length} inimigo(s) esperando gatilho: ${this.aguardando.map((d) => `${d.id} (gatilho ${this.estado.objeto(d.surge!)?.nome ?? d.surge})`).join(', ')}` });
    const il = this.estado.fase.iluminacao;
    if (il.escura || this.estado.fase.luzes.length) LOG.add({ cat: 'mundo', texto: `iluminação: ${mundo.escura ? `sala escura (${Math.round(il.escuridao * 100)}%)` : 'sala clara'} · ${this.estado.fase.luzes.length} luz(es)${il.lanterna ? ` · lanterna ${il.lanterna} px` : ''}` });
    const [fwA] = this.estado.fase.tamanho;
    for (const o of this.estado.fase.objetos) {
      const b = mundo.caixa(o);
      if (o.comportamentos[0]?.tipo === 'saida' && (b.x + b.w < 0 || b.x > fwA)) LOG.add({ cat: 'erro', texto: `Passagem ${o.nome} está fora da fase (x ${Math.round(b.x)}, largura da fase ${fwA}): o jogador não alcança. Mova-a para dentro.` });
    }
    if (this.inimigos.length) LOG.add({ cat: 'inimigo', texto: `${this.inimigos.length} inimigo(s) na fase: ${this.inimigos.map((i) => `${i.nome} (${i.id})`).join(', ')}` });
    this.viewport.ocultarInimigosEditor = true;
    const arma = this.pers?.dados.arma;
    this.municao = arma ? (this.municaoLevada ?? arma.pente) : 0;
    this.municaoLevada = null;
    this.inserirGrafico();
    const levou = !!this.inventarioLevado;
    if (this.inventarioLevado) for (const [k, v] of this.inventarioLevado) this.mundo.inventario.set(k, v);
    this.inventarioLevado = null;
    // Começo da partida: a arma equipada já está no menu (ocupa os espaços dela)
    if (!levou && arma && !this.mundo.inventario.has(arma.nome)) this.mundo.inventario.set(arma.nome, 1);
    this.hudJogo.clear();
    this.valoresHud.clear();
    this.chaveHudTela = '';
    this.desenharHudJogo();
    if (this.motor) {
      this.motor.prepararMundo(this.mundo);
      this.motor.iniciar();
      if (!this.renascendo) this.motor.trocouFase(this.estado.arquivoFase ?? '');
    }
    this.aplicarVisibilidade();
    this.atualizarInventario();
  }

  private aplicarVisibilidade() {
    const m = this.mundo;
    if (!m) return;
    this.viewport.visibilidadeTeste = new Map(this.estado.fase.objetos.map((o) => [o.id, m.visivel(o.id)]));
    this.viewport.deslocamentoTeste = m.deslocamentos;
    this.viewport.atualizarCena();
  }

  private atualizarInventario() {
    const m = this.mundo;
    if (!m || !m.inventario.size) { this.elInventario.hidden = true; return; }
    this.elInventario.replaceChildren(el('strong', {}, 'Inventário'),
      ...[...m.inventario].map(([item, n]) => el('span', {}, n > 1 ? `${item} ×${n}` : item)));
    this.elInventario.hidden = false;
  }

  private toast(texto: string) {
    this.elToast.textContent = texto;
    this.elToast.hidden = false;
    clearTimeout(this.timerToast);
    this.timerToast = window.setTimeout(() => { this.elToast.hidden = true; }, 2600);
  }

  private tratar(r: ResultadoInteracao, origem?: ObjetoFase) {
    if (r.acionado && origem) LOG.add({ cat: 'mundo', texto: `${origem.nome} acionou ${this.estado.objeto(r.acionado)?.nome ?? r.acionado}` });
    if (r.aviso) LOG.add({ cat: 'mundo', texto: `aviso: ${r.aviso}` });
    if (r.mensagem) LOG.add({ cat: 'mundo', texto: `mensagem: ${r.mensagem}` });
    if (r.acionado && origem && this.motor) this.motor.acionado(r.acionado, origem);
    if (r.surgir) this.surgirInimigos(r.surgir);
    if (r.checkpoint && this.jogador) { this.marcarCheckpoint(this.jogador.x, this.jogador.y, origem?.nome ?? 'gatilho'); this.toast('Checkpoint'); }
    if (r.luz && this.mundo) LOG.add({ cat: 'mundo', texto: `iluminação: ${this.mundo.escura ? 'sala escura' : 'sala clara'} · luzes ligadas: ${[...this.mundo.luzes].filter(([, v]) => v).map(([id]) => this.estado.luz(id)?.nome ?? id).join(', ') || 'nenhuma'}` });
    if (r.aviso) this.toast(r.aviso);
    if (r.inspecao) this.executarEtapa(r.inspecao, origem);
    if (r.empurrar) this.comecarEmpurrar(r.empurrar);
    if (r.mensagem) {
      this.mensagemAberta = true;
      this.elMensagem.replaceChildren(el('p', {}, r.mensagem), el('span', { class: 'teste-fechar' }, 'E ou Enter para fechar'));
      this.elMensagem.hidden = false;
    }
    if (r.passagem || r.irPara) {
      const arquivo = this.estado.arquivoFase ?? '';
      const v = (r.passagem ? viagemDe(this.mapa, arquivo, r.passagem) : null)
        ?? (r.irPara ? { fase: r.irPara, chegada: '', transicao: transicaoPadrao('corte'), deFase: arquivo, dePassagem: r.passagem ?? '' } : null);
      if (v) this.viajar(v, origem);
      else { LOG.add({ cat: 'mundo', texto: `${origem?.nome ?? 'passagem'}: não leva a lugar nenhum (sem conexão no Mapa)` }); this.toast('Esta passagem ainda não leva a lugar nenhum: conecte-a no Mapa (M).'); }
    }
    this.aplicarVisibilidade();
    this.atualizarInventario();
  }

  /** Spawner: os inimigos marcados com este gatilho aparecem. */
  private surgirInimigos(gatilho: string) {
    const vem = this.aguardando.filter((d) => d.surge === gatilho);
    if (!vem.length) { LOG.add({ cat: 'inimigo', texto: `gatilho ${this.estado.objeto(gatilho)?.nome ?? gatilho}: nenhum inimigo marcado para surgir` }); return; }
    this.aguardando = this.aguardando.filter((d) => d.surge !== gatilho);
    for (const def of vem) {
      const tipo = this.tiposInimigo.get(def.personagem);
      if (!tipo) continue;
      this.inimigos.push(new InimigoVivo(def, tipo, this.config.gravidade));
    }
    this.inserirGrafico();
    LOG.add({ cat: 'inimigo', texto: `surgiram ${vem.length} inimigo(s): ${vem.map((d) => d.id).join(', ')}` });
  }

  /** Vai para outra sala (passagem, jogo.irPara ou jogo.passar). O código (aoPassar) pode mudar ou cancelar. */
  private viajar(v: Viagem, origem?: ObjetoFase) {
    if (this.saindo) return;
    if (this.motor && !this.motor.passar(origem, v)) { LOG.add({ cat: 'mundo', texto: `passagem para ${v.fase} cancelada pelo código (aoPassar)` }); return; }
    LOG.add({ cat: 'mundo', texto: `passagem${origem ? ` ${origem.nome}` : ''} → ${v.fase}${v.chegada ? ` (chega em ${v.chegada})` : ''} · ${resumoTransicao(v.transicao)}` });
    this.saindo = true;
    // Memória da sala que fica para trás (portas abertas, itens pegos, inimigos mortos)
    this.guardarMemoriaSala(v.deFase || (this.estado.arquivoFase ?? ''));
    this.inventarioLevado = this.mundo ? new Map(this.mundo.inventario) : null;
    this.municaoLevada = this.pers?.dados.arma ? this.municao : null;
    this.levarCodigo = this.motor ? { variaveis: this.motor.variaveis, jogador: this.motor.dadosJogador } : null;
    setTimeout(() => this.aoIrPara(v));
  }

  private guardarMemoriaSala(arquivo: string) {
    if (!this.mundo) return;
    this.memoriaSalas.set(arquivo, {
      estados: new Map([...this.mundo.estados].map(([id, e]) => [id, { ...e }])),
      mortos: new Set([...this.estado.fase.inimigos.map((d) => d.id)].filter((id) => !this.aguardando.some((d) => d.id === id) && !this.inimigos.some((i) => i.id === id && i.vivo))),
      luzes: new Map(this.mundo.luzes),
      escura: this.mundo.escura,
      // Objetos empurrados ficam onde foram deixados
      desloc: new Map([...this.mundo.deslocamentos].map(([id, d]) => [id, { ...d }])),
    });
  }

  /** Viagem pedida pelo código: jogo.irPara(fase, { chegada, transicao }). */
  private viagemDoCodigo(fase: string, op?: { chegada?: string; transicao?: Partial<Transicao> | string }): Viagem {
    const arquivo = this.estado.arquivoFase ?? '';
    const tr = typeof op?.transicao === 'string' ? transicaoPadrao(op.transicao as Transicao['efeito']) : { ...transicaoPadrao('corte'), ...(op?.transicao ?? {}) };
    return { fase: fase.endsWith('.json') ? fase : fase + '.json', chegada: op?.chegada ?? '', transicao: tr, deFase: arquivo, dePassagem: '' };
  }

  /** Inventário que deve seguir para a próxima área (usado pelo editor ao trocar de fase). */
  levarInventario(inv: Map<string, number> | null) { this.inventarioLevado = inv; }
  get inventarioParaLevar() { return this.inventarioLevado; }

  private reiniciarJogador() {
    const [sx, sy] = this.estado.fase.spawnJogador;
    const cfg = { ...this.config };
    if (this.pers) { cfg.largura = this.pers.dados.caixa.largura; cfg.altura = this.pers.dados.caixa.altura; }
    this.jogador = new Jogador(cfg, sx, sy);
    this.aterrissouHa = 9;
    this.pers?.animador.parar();
  }

  /** Chegando por uma passagem: o jogador aparece nela (pés na base), olhando para o meio da sala. */
  private posicionarChegada() {
    const id = this.chegadaPendente;
    this.chegadaPendente = '';
    if (!id || !this.jogador || !this.mundo) return;
    const o = this.estado.objeto(id);
    if (!o) { LOG.add({ cat: 'erro', texto: `Mapa: a passagem de chegada ${id} não existe em ${this.estado.arquivoFase} (o jogador foi para o início)` }); return; }
    const b = this.mundo.caixa(o);
    this.mundo.desarmadas.add(o.id); // passagem contínua: só vale de novo depois que o jogador sair dela
    this.jogador.x = b.x + b.w / 2;
    this.jogador.y = b.y + b.h;
    this.jogador.vx = 0; this.jogador.vy = 0;
    this.jogador.olhandoDireita = this.jogador.x < this.estado.fase.tamanho[0] / 2;
  }

  /** O jogador é desenhado dentro da camada "Objetos" (atrás do primeiro plano, na frente do cenário). */
  private inserirGrafico() {
    const fase = this.estado.fase;
    const camada = fase.camadas.find((c) => c.id === 'objetos') ?? [...fase.camadas].reverse().find((c) => c.parallax[0] === 1) ?? fase.camadas[fase.camadas.length - 1];
    const cont = camada ? this.viewport.conteinerCamada(camada.id) : undefined;
    if (!cont) return;
    for (const i of this.inimigos) i.inserir(cont);
    // Jogador e o rastro do tiro sempre por cima dos inimigos (o brilho dos pontos importantes fica atrás)
    cont.addChild(this.brilhos);
    if (this.pers) cont.addChild(this.spritePers);
    cont.addChild(this.grafico);
  }

  private tecla = (ev: KeyboardEvent) => {
    if (document.querySelector('.modal-fundo')) return;
    const alvo = ev.target as HTMLElement | null;
    if (alvo && this.hud.contains(alvo) && alvo.tagName === 'INPUT') return; // ajustando um controle do HUD
    // Tela cheia: F4 alterna; Esc sai da tela cheia (sem parar o teste)
    if (ev.key === 'F4') { ev.preventDefault(); ev.stopPropagation(); this.alternarTelaCheia(); return; }
    if (ev.key === 'Escape' && !this.menu.aberto && (document.fullscreenElement || performance.now() - this.saiuTelaCheiaEm < 400)) {
      ev.preventDefault(); ev.stopPropagation();
      if (document.fullscreenElement) void document.exitFullscreen();
      return;
    }
    // Menu aberto: as teclas são dele (Esc volta/fecha; a tecla do menu fecha)
    if (this.menu.aberto && ev.key !== 'F5') {
      ev.preventDefault(); ev.stopPropagation();
      if (this.ehDaAcao(ev.code, 'menu') && !ev.repeat) this.menu.fechar();
      else this.menu.tecla(ev);
      return;
    }
    if (this.mensagemAberta && ev.key === 'Escape') { ev.preventDefault(); this.mensagemAberta = false; this.elMensagem.hidden = true; this.elVer.hidden = true; return; }
    if (ev.key === 'Escape' || ev.key === 'F5') { ev.preventDefault(); this.parar(); return; }
    if (ev.key === 'F6') { ev.preventDefault(); LOG.add({ cat: 'sistema', texto: 'Fase reiniciada (F6)' }); this.reiniciarTudo(); this.toast('Fase reiniciada'); return; }
    // Morto: Enter (ou Interagir) volta logo no checkpoint
    if (this.mortoEm !== null && (ev.key === 'Enter' || this.ehDaAcao(ev.code, 'interagir'))) {
      ev.preventDefault(); ev.stopPropagation();
      if (this.tempoJogo - this.mortoEm > 0.8) this.renascer();
      return;
    }
    if (ev.code === 'KeyC' && ev.shiftKey && !this.usada('KeyC')) { this.estado.mostrarColisoes = !this.estado.mostrarColisoes; this.estado.emit('opcoes'); return; }
    if (this.mensagemAberta && (ev.key === 'Enter' || ev.key === 'Escape' || this.ehDaAcao(ev.code, 'interagir'))) {
      ev.preventDefault(); ev.stopPropagation();
      this.mensagemAberta = false; this.elMensagem.hidden = true; this.elVer.hidden = true;
      return;
    }
    if (TECLAS_RESERVADAS.has(ev.code)) return;
    if (this.ehDaAcao(ev.code, 'menu') && !ev.repeat && this.mortoEm === null && !this.mensagemAberta) { ev.preventDefault(); ev.stopPropagation(); this.abrirMenu(); return; }
    // Nada de rolar a página, digitar ou acionar atalhos do editor enquanto joga
    ev.preventDefault();
    ev.stopPropagation();
    if (!ev.repeat) LOG.add({ cat: 'entrada', texto: `[${nomeTecla(normalizarCodigo(ev.code))}] apertada` });
    this.entradaJogo.apertar(ev.code, performance.now() / 1000);
  };

  /** A tecla faz parte de algum atalho dos controles? */
  private usada(code: string) {
    return Object.values(this.controles.acoes).some((l) => l.some((a) => a.teclas.includes(normalizarCodigo(code))));
  }
  private ehDaAcao(code: string, acao: string) {
    return (this.controles.acoes[acao] ?? []).some((a) => a.teclas.includes(normalizarCodigo(code)));
  }

  private soltarTecla = (ev: KeyboardEvent) => {
    if (TECLAS_RESERVADAS.has(ev.code)) return;
    LOG.add({ cat: 'entrada', texto: `[${nomeTecla(normalizarCodigo(ev.code))}] solta` });
    this.entradaJogo.soltar(ev.code);
  };
  private perderFoco = () => { this.entradaJogo.limpar(); };

  private entrada(): Entrada {
    const e = this.entradaJogo;
    const esquerda = e.segurando('esquerda'), direita = e.segurando('direita');
    const agarrado = this.tempoJogo < this.agarradoAte || this.morto;
    const trava = agarrado || (this.pers?.animador.travaMovimento(esquerda !== direita) ?? false);
    return {
      esquerda: esquerda && !trava,
      direita: direita && !trava,
      pulo: !agarrado && e.segurando('pular'),
      puloApertado: !agarrado && this.puloApertado,
    };
  }

  private caixaJogador() {
    const j = this.jogador!;
    return { x: j.x - j.cfg.largura / 2, y: j.y - j.cfg.altura, w: j.cfg.largura, h: j.cfg.altura };
  }

  private quadro(ms: number) {
    const j = this.jogador;
    const m = this.mundo;
    if (!j || !m) return;
    if (this.mensagemAberta || this.saindo || this.menu.aberto) { this.desenharJogador(0); return; } // pausado: mensagem, menu ou trocando de sala
    const ent = this.entradaJogo;
    ent.atualizar(performance.now() / 1000);
    for (const a of ent.disparadasAgora) LOG.add({ cat: 'entrada', texto: `dispara a ação "${a}"` });
    if (ent.apertou('pular')) this.puloApertado = true;
    if (ent.apertou('interagir')) this.interagirApertado = true;
    if (this.morto) { this.puloApertado = false; this.interagirApertado = false; }
    // Ações do personagem (animações extras): tiro, recarga…
    if (this.pers && !this.morto) {
      for (const [chave, anim] of extras(this.pers.dados)) {
        if (!ent.apertou(chave)) continue;
        if (this.tratarArma(chave)) continue;
        if (this.motor && !this.motor.acao(chave)) { LOG.add({ cat: 'personagem', texto: `ação "${chave}" cancelada pelo código (aoAcao)` }); continue; }
        if (this.pers.animador.tocar(chave, anim.repetir)) { this.mostrarAcao(anim.nome ?? chave); LOG.add({ cat: 'personagem', texto: `animação: ${anim.nome ?? chave}` }); }
        else LOG.add({ cat: 'personagem', texto: `ação "${chave}" ignorada: ${this.pers.animador.acaoAtual ? `já tocando "${this.pers.animador.acaoAtual}"` : 'sem animação'}` });
      }
    }
    const [fw, fh] = this.estado.fase.tamanho;
    const dtQ = Math.min(ms / 1000, 0.1);
    this.tempoJogo += dtQ;
    m.tempo = this.tempoJogo; // relógio das animações dos objetos
    // Morto: depois do tempo de "renascer" (seção Vida em Personagens), volta no checkpoint
    if (this.mortoEm !== null && this.tempoJogo - this.mortoEm >= this.cfgVida.renascer) { this.renascer(); return; }
    // Recarga termina quando a animação acaba: pente cheio
    if (this.recargaAte && this.tempoJogo >= this.recargaAte) {
      this.recargaAte = 0;
      const arma = this.pers?.dados.arma;
      if (arma) { this.municao = arma.pente; LOG.add({ cat: 'personagem', texto: `pente cheio: ${this.municao}/${arma.pente}` }); }
    }
    // Inimigos: IA (uma vez por quadro)
    const segsInimigos = m.segmentosPortas().length ? this.segs.concat(m.segmentosPortas()) : this.segs;
    for (const ini of this.inimigos) {
      // Com aoPensar no código do tipo, é o código que decide (perambular, perseguir…); sem ele, a IA pronta
      const motor = this.motor;
      const externo = motor?.pensaPorCodigo(ini) ? () => motor.pensar(ini, dtQ) : undefined;
      // Morto: os inimigos deixam de enxergar o jogador (alvo longe)
      const alvo = this.morto ? { x: j.x, y: j.y - 100000, largura: 0 } : { x: j.x, y: j.y, largura: j.cfg.largura };
      this.tratarEventosInimigo(ini, ini.pensar(dtQ, alvo, segsInimigos, externo));
    }
    this.acumulado = Math.min(this.acumulado + ms / 1000, 0.25);
    // Pular solta o objeto empurrado
    // Empurrar só enquanto Interagir estiver segurado: soltou a tecla (ou pulou/morreu), solta o objeto
    if (this.empurrando && (this.puloApertado || this.morto || !ent.segurando('interagir'))) this.soltarEmpurrar(true);
    while (this.acumulado >= PASSO) {
      const segs = m.segmentosPortas().length ? this.segs.concat(m.segmentosPortas()) : this.segs;
      const xAntes = j.x;
      const vivo = j.passo(PASSO, this.entrada(), segs, fw, fh);
      if (this.empurrando) this.passoEmpurrar(j.x - xAntes);
      for (const ini of this.inimigos) ini.passoFisica(PASSO, segs, fw, fh);
      this.puloApertado = false;
      this.acumulado -= PASSO;
      if (!vivo) {
        LOG.add({ cat: 'mundo', texto: `caiu para fora da fase em (${Math.round(j.x)}, ${Math.round(j.y)}); voltando ao checkpoint` });
        this.estado.avisar('Caiu para fora da fase: voltando ao checkpoint.');
        this.irAoCheckpoint();
        return;
      }
    }
    // Código: aoAtualizar, aoTocar, temporizadores
    if (this.motor) this.motor.atualizar(ms / 1000);
    // Zonas: passagens contínuas (passam sozinhas) e gatilhos
    const zonas = m.areas(this.caixaJogador());
    for (const o of zonas.saiu) if (o.comportamentos[0]?.tipo === 'gatilho') LOG.add({ cat: 'mundo', texto: `saiu do gatilho ${o.nome}` });
    for (const o of zonas.entrou) {
      const c = o.comportamentos[0];
      if (c?.tipo === 'saida') {
        if (m.desarmadas.has(o.id) || this.saindo) continue;
        LOG.add({ cat: 'mundo', texto: `atravessou a passagem contínua ${o.nome}` });
        this.interagirCom(o);
      } else if (c?.tipo === 'gatilho') {
        LOG.add({ cat: 'mundo', texto: `entrou no gatilho ${o.nome}` });
        this.tratar(m.dispararGatilho(o), o);
      }
      if (this.saindo) break;
    }
    if (this.saindo) return;
    // Coletáveis tocados
    const pegos = this.morto ? [] : m.coletar(this.caixaJogador());
    if (m.curaPendente) { const c = m.curaPendente; m.curaPendente = 0; this.definirVida(this.vida + c, `kit (+${c})`); }
    if (pegos.length) { LOG.add({ cat: 'mundo', texto: pegos.join(' · ') }); this.toast(pegos.join(' · ')); this.aplicarVisibilidade(); this.atualizarInventario(); }
    // Objeto interagível por perto (tecla E)
    const prox = m.proximo(this.caixaJogador());
    const chaveProx = prox ? `${prox.o.id}:${prox.acao}` : '';
    if (chaveProx !== this.ultimoProx) {
      this.ultimoProx = chaveProx;
      if (prox) LOG.add({ cat: 'mundo', texto: `perto de ${prox.o.nome} (pode: ${prox.acao})` });
    }
    if (this.interagirApertado) {
      this.interagirApertado = false;
      if (!this.empurrando && prox) this.interagirCom(prox.o);
    }
    if (this.cenaMudou) { this.cenaMudou = false; this.aplicarVisibilidade(); this.atualizarInventario(); }
    this.posicionarCamera(false, ms / 1000);
    this.desenharJogador(ms / 1000);
    for (const ini of this.inimigos) ini.desenhar(dtQ);
    this.ordenarAgarrao();
    this.desenharRastro(dtQ);
    this.atualizarHudTela();
    this.mostrarPrompt(prox);
    this.desenharBrilhos();
  }

  /**
   * Algo com interação por perto: o olho acima da personagem e, no canto de baixo à direita da tela do jogo, a tecla e a
   * ação. Perto de um ponto de inspeção a tela ganha um leve foco (bordas mais escuras).
   */
  private mostrarPrompt(prox: { o: ObjetoFase; acao: string } | null) {
    const j = this.jogador;
    const r = this.retanguloTela();
    const empurrando = !!this.empurrando;
    if ((!prox && !empurrando) || this.mensagemAberta || !this.mundo || !j || this.morto) {
      this.elPrompt.hidden = true; this.elOlho.hidden = true; this.elFoco.classList.remove('ativo');
      return;
    }
    const tecla = this.controles.acoes.interagir?.[0];
    this.elPrompt.classList.add('canto');
    this.elPrompt.replaceChildren(el('kbd', {}, tecla ? textoAtalho(tecla) : 'E'), el('span', {}, empurrando ? 'Segure para empurrar' : prox!.acao));
    this.elPrompt.style.left = `${Math.round(r.x + r.w - 12)}px`;
    this.elPrompt.style.top = `${Math.round(r.y + r.h - 12)}px`;
    this.elPrompt.hidden = false;
    // Olho acima da cabeça
    const cab = this.viewport.camadaParaTela(j.x, j.y - j.cfg.altura - 6, '');
    const olho = this.itensConfig.inspecao.olho;
    if (this.elOlho.dataset.img !== olho) {
      this.elOlho.dataset.img = olho;
      this.elOlho.replaceChildren(olho ? el('img', { src: this.urlImagem(olho), alt: '' }) : olhoPadrao());
    }
    const z = this.estado.camera.zoom;
    Object.assign(this.elOlho.style, { left: `${Math.round(cab.x)}px`, top: `${Math.round(cab.y)}px`, width: `${Math.max(14, 14 * z)}px`, height: `${Math.max(10, 10 * z)}px` });
    this.elOlho.hidden = empurrando;
    // Foco sutil perto de um ponto de inspeção
    const foco = !empurrando && prox?.o.comportamentos[0]?.tipo === 'inspecionar' ? this.itensConfig.inspecao.foco : 0;
    if (foco > 0) {
      Object.assign(this.elFoco.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px`,
        background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,${(foco * 0.85).toFixed(2)}) 100%)` });
      this.elFoco.classList.add('ativo');
    } else this.elFoco.classList.remove('ativo');
  }

  /** Pontos de inspeção importantes: brilho suave pulsando no lugar (até serem inspecionados por completo). */
  private desenharBrilhos() {
    const m = this.mundo;
    const g = this.brilhos.clear();
    if (!m) return;
    const t = this.tempoJogo;
    for (const o of this.estado.fase.objetos) {
      const c = o.comportamentos[0];
      if (c?.tipo !== 'inspecionar' || !c.destaque) continue;
      const e = m.estados.get(o.id);
      if (!e || !e.visivel || (e.etapa ?? 0) >= c.etapas.length) continue;
      const b = m.caixa(o);
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const p = 0.5 + 0.5 * Math.sin(t * 3 + cx * 0.01);
      const raio = Math.max(10, Math.min(b.w, b.h) * 0.35);
      g.circle(cx, cy, raio * (0.9 + p * 0.25)).fill({ color: 0xfff1a8, alpha: 0.10 + p * 0.12 });
      g.circle(cx, cy, raio * 0.35).fill({ color: 0xffffff, alpha: 0.18 + p * 0.25 });
      const s = 3 + p * 3; // estrelinha
      g.moveTo(cx - s, cy - raio * 0.6).lineTo(cx + s, cy - raio * 0.6).moveTo(cx, cy - raio * 0.6 - s).lineTo(cx, cy - raio * 0.6 + s).stroke({ width: 1, color: 0xffffff, alpha: 0.5 + p * 0.4 });
    }
  }

  /** Ponto de inspeção: faz a etapa (legenda, pegar item, pegar arquivo, ver de perto). */
  private executarEtapa(et: EtapaInspecao, origem?: ObjetoFase) {
    const quem = origem?.nome ?? 'ponto';
    switch (et.tipo) {
      case 'legenda':
        LOG.add({ cat: 'mundo', texto: `inspecionou ${quem}: legenda` });
        this.mensagemAberta = true;
        this.elMensagem.replaceChildren(el('p', {}, et.texto || '…'), el('span', { class: 'teste-fechar' }, 'E ou Enter para fechar'));
        this.elMensagem.hidden = false;
        break;
      case 'item':
        LOG.add({ cat: 'mundo', texto: `inspecionou ${quem}: pegou ${et.item || '(sem nome)'}${et.quantidade > 1 ? ` ×${et.quantidade}` : ''}` });
        this.toast(et.texto || `Pegou: ${et.item}${et.quantidade > 1 ? ` ×${et.quantidade}` : ''}`);
        break;
      case 'arquivo': {
        const nome = et.item || 'Arquivo';
        if (!itemDe(this.itensConfig, nome).nome || !this.itensConfig.itens.some((i) => i.nome.toLowerCase() === nome.toLowerCase())) {
          const novo = itemBase(nome, { tipo: 'arquivo', descricao: et.texto, imagem: et.imagem, imagemGrande: et.imagem, uso: 'nada', consome: false });
          this.descobertos.set(nome, novo);
          this.itensConfig = { ...this.itensConfig, itens: [...this.itensConfig.itens, novo] };
        }
        LOG.add({ cat: 'mundo', texto: `inspecionou ${quem}: arquivo "${nome}"` });
        this.toast(`Novo arquivo: ${nome} (Menu › Arquivos)`);
        break;
      }
      case 'ver': {
        LOG.add({ cat: 'mundo', texto: `inspecionou ${quem}: viu de perto` });
        const r = this.retanguloTela();
        Object.assign(this.elVer.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
        this.elVer.replaceChildren(...(et.imagem ? [el('img', { src: this.urlImagem(et.imagem), alt: '' })] : []),
          ...(et.texto ? [el('p', {}, et.texto)] : []), el('span', { class: 'teste-fechar' }, 'E, Enter ou Esc para voltar'));
        this.elVer.hidden = false;
        this.mensagemAberta = true;
        break;
      }
    }
    this.atualizarInventario();
  }

  // ---------- Empurrar ----------
  private comecarEmpurrar(id: string) {
    const m = this.mundo, j = this.jogador;
    const o = this.estado.objeto(id);
    if (!m || !j || !o) return;
    if (!j.noChao) { this.toast('Fique no chão para empurrar.'); return; }
    if (!m.noChaoAoLado(this.caixaJogador(), o)) return; // em cima do objeto: não empurra
    const c = o.comportamentos[0];
    const vel = c?.tipo === 'empurravel' ? c.velocidade : 60;
    const b = m.caixa(o);
    this.empurrando = { id, offset: b.x - j.x, velocidadeAntes: j.cfg.velocidade };
    j.cfg = { ...j.cfg, velocidade: Math.min(j.cfg.velocidade, vel) };
    j.olhandoDireita = b.x + b.w / 2 > j.x;
    m.empurrando = id; m.marcarMudanca();
    LOG.add({ cat: 'personagem', texto: `empurrando ${o.nome}` });
    this.toast(`Empurrando ${o.nome} · segure Interagir e use ← → · soltar a tecla ou pular solta`);
    if (this.pers?.dados.animacoes.empurrar) this.pers.animador.tocar('empurrar', true);
  }

  private soltarEmpurrar(avisar: boolean) {
    const e = this.empurrando;
    if (!e) return;
    this.empurrando = null;
    if (this.mundo) { this.mundo.empurrando = null; this.mundo.marcarMudanca(); }
    if (this.jogador) this.jogador.cfg = { ...this.jogador.cfg, velocidade: e.velocidadeAntes };
    if (this.pers?.animador.acaoAtual === 'empurrar') this.pers.animador.parar();
    if (avisar) LOG.add({ cat: 'personagem', texto: `soltou ${this.estado.objeto(e.id)?.nome ?? e.id}` });
  }

  /** A cada passo da física: o objeto vai junto com o jogador; parede ou beirada na frente dele, o jogador para. */
  private passoEmpurrar(dx: number) {
    const e = this.empurrando, m = this.mundo, j = this.jogador;
    if (!e || !m || !j || !dx) return;
    if (!j.noChao) { this.soltarEmpurrar(true); return; }
    const o = this.estado.objeto(e.id);
    if (!o) { this.soltarEmpurrar(false); return; }
    const b = m.caixa(o);
    const alvoX = j.x + e.offset;
    const mover = alvoX - b.x;
    if (!mover) return;
    const dir = mover > 0 ? 1 : -1;
    // Só testa o lado para onde o objeto vai (a colisão dele mesmo fica de fora)
    const segs = this.segs.concat(m.segmentosPortas().filter((s) => !this.segDoObjeto(s, b)));
    if (Math.sign(mover) === Math.sign(b.x + b.w / 2 - j.x) && !objetoPodeIr(segs, b, dir)) {
      j.x -= dx; // empurrando contra parede/beirada: não anda
      return;
    }
    m.deslocar(o.id, mover, 0);
    for (const z of this.estado.fase.objetos) {
      const c = z.comportamentos[0];
      if (c?.tipo === 'pontoEmpurrar' && c.alvo === o.id) m.deslocar(z.id, mover, 0);
    }
    this.cenaMudou = true; // redesenha o objeto no lugar novo (uma vez por quadro)
  }
  /** O segmento é da colisão do próprio objeto (dentro da caixa dele)? */
  private segDoObjeto(s: Segmento, b: { x: number; y: number; w: number; h: number }) {
    const dentro = (x: number, y: number) => x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.y - 2 && y <= b.y + b.h + 2;
    return dentro(s.ax, s.ay) && dentro(s.bx, s.by);
  }

  /** Espaço ocupado no topo pelo painel "Testando" (a tela do jogo fica abaixo dele, sem nada do HUD escondido). */
  private margemTopo = 0;

  /** Zoom para a tela do jogo caber inteira abaixo do painel (inteiro, para a pixel art ficar nítida). */
  private ajustarZoom() {
    const e = this.estado;
    const { w, h } = this.viewport.tamanhoTela();
    const topo = this.hud.querySelector<HTMLElement>('.hud-topo');
    const ajustes = this.hud.querySelector<HTMLElement>('.hud-ajustes');
    const fundo = Math.max(topo ? topo.offsetTop + topo.offsetHeight : 0, ajustes && !ajustes.hasAttribute('open') ? ajustes.offsetTop + ajustes.offsetHeight : 0);
    this.margemTopo = Math.min(h * 0.4, fundo + this.hud.offsetTop + 6);
    const [rw, rh] = e.fase.resolucaoBase;
    const caber = Math.min(w / rw, (h - this.margemTopo) / rh);
    e.camera.zoom = caber >= 2 ? Math.floor(caber) : caber;
    this.posicionarCamera(true);
  }

  /** Câmera do jogo seguindo o jogador (presa dentro da fase), com suavização. */
  private posicionarCamera(imediato: boolean, dt = 0) {
    const j = this.jogador;
    if (!j) return;
    const e = this.estado;
    const [rw, rh] = e.fase.resolucaoBase;
    const [fw, fh] = e.fase.tamanho;
    const preso = (v: number, max: number) => Math.min(Math.max(v, 0), Math.max(0, max));
    const alvoX = preso(j.x - rw / 2, fw - rw);
    const alvoY = preso(j.y - j.cfg.altura / 2 - rh / 2, fh - rh);
    if (imediato) this.camAlvo = { x: alvoX, y: alvoY };
    else {
      const k = 1 - Math.exp(-dt * 8);
      this.camAlvo.x += (alvoX - this.camAlvo.x) * k;
      this.camAlvo.y += (alvoY - this.camAlvo.y) * k;
    }
    // A visão do editor fica centrada na câmera do jogo (assim parallax e quadro batem com o jogo)
    const { w, h } = this.viewport.tamanhoTela();
    const z = e.camera.zoom;
    e.camera.x = Math.round(this.camAlvo.x) + rw / 2 - w / 2 / z;
    // Topo da tela do jogo logo abaixo do painel "Testando", centrada no espaço que sobra
    e.camera.y = Math.round(this.camAlvo.y) - (this.margemTopo + Math.max(0, h - this.margemTopo - rh * z) / 2) / z;
  }

  private desenharJogador(dt = 0) {
    const j = this.jogador!;
    const g = this.grafico.clear();
    if (this.pers) {
      // Personagem animado: estado pela física (parado, andando, pulando, caindo, aterrissando)
      if (j.noChao && !this.estavaNoChao) this.aterrissouHa = 0; else this.aterrissouHa += dt;
      this.estavaNoChao = j.noChao;
      const p = this.pers.dados;
      const animador = this.pers.animador;
      const estado = this.morto ? 'morte' : estadoDoJogador(j, p.animacoes.aterrissando ? this.aterrissouHa : 9);
      const acao = animador.acaoAtual;
      const andando = j.noChao && Math.abs(j.vx) > 12;
      let r = animador.atualizar(dt, estado, andando, acao ? this.entradaJogo.segurando(acao) : false);
      // Morte: toca uma vez e fica no último quadro (mesmo que a animação esteja marcada para repetir)
      if (this.mortoEm !== null) {
        const m = p.animacoes.morte ? animacaoPara(p, 'morte') : null;
        if (m) r = { chave: m.estado, anim: m.anim, quadro: Math.min(m.anim.quadros - 1, Math.floor((this.tempoJogo - this.mortoEm) * m.anim.fps)) };
      }
      if (acao && !animador.acaoAtual) { this.mostrarAcao(null); LOG.add({ cat: 'personagem', texto: `fim da animação: ${p.animacoes[acao]?.nome ?? acao}` }); }
      this.registrarEstado(estado);
      const frames = r ? this.pers.quadros.get(r.chave) : undefined;
      if (r && frames?.length) {
        const sp = this.spritePers;
        sp.texture = frames[Math.min(r.quadro, frames.length - 1)];
        const anc = ancoraPes(p);
        sp.anchor.set(anc.ax, anc.ay);
        const esc = p.escala * r.anim.escala;
        const espelhar = j.olhandoDireita !== p.olhaDireita;
        sp.scale.set(espelhar ? -esc : esc, esc);
        sp.position.set(Math.round(j.x), Math.round(j.y));
        sp.visible = true;
        // Golpe: o tempo do piscar é dividido em "piscadas" iguais; cada uma = metade na cor, metade normal
        const tp = this.tempoJogo - this.piscarDe, dur = this.piscarAte - this.piscarDe;
        const piscando = !this.morto && dur > 0 && tp >= 0 && tp < dur && Math.floor((tp / dur) * this.piscarVezes * 2) % 2 === 0;
        sp.tint = piscando ? this.piscarCor : 0xffffff;
        sp.alpha = 1;
      }
      if (this.estado.mostrarColisoes) {
        const w = j.cfg.largura, h = j.cfg.altura;
        g.rect(Math.round(j.x - w / 2) + 0.5, Math.round(j.y - h) + 0.5, w, h).stroke({ width: 1, color: 0xa7dd3e });
      }
      return;
    }
    this.registrarEstado(estadoDoJogador(j, 9));
    const w = j.cfg.largura, h = j.cfg.altura;
    const x = Math.round(j.x - w / 2), y = Math.round(j.y - h);
    // Corpo provisório (a Lorena animada entra com o módulo de animação)
    g.rect(x, y, w, h).fill({ color: 0xa7dd3e, alpha: 0.9 }).stroke({ width: 1, color: 0x083933 });
    const olhoX = j.olhandoDireita ? x + w - 10 : x + 4;
    g.rect(olhoX, y + 12, 6, 6).fill({ color: 0x083933 });
    g.rect(x, y + h - 3, w, 3).fill({ color: 0x083933, alpha: 0.6 });
  }

  // ---------- Arma ----------

  /** Tiro e recarga da arma do jogador. true = a ação foi tratada aqui. */
  private tratarArma(chave: string): boolean {
    const pers = this.pers;
    const arma = pers?.dados.arma;
    if (!pers || !arma || (chave !== arma.acaoTiro && chave !== arma.acaoRecarga)) return false;
    const animador = pers.animador;
    // Com aoUsarArma no código do personagem, as regras da arma são do código (pente, sem bala, recarga)
    if (this.motor?.usaArmaPorCodigo()) { this.motor.usarArma(chave); return true; }
    // Regras do jogo em JS (Código › Sistema do jogo › sistema.armas.js → usarArma)
    if (this.motor?.temSistema('armas', 'usarArma')) {
      if (this.motor.acao(chave)) this.motor.usarArmaSistema(chave, arma);
      else LOG.add({ cat: 'personagem', texto: `ação "${chave}" cancelada pelo código (aoAcao)` });
      return true;
    }
    if (animador.acaoAtual || this.tempoJogo < this.agarradoAte) {
      LOG.add({ cat: 'personagem', texto: `"${chave}" ignorada: ${animador.acaoAtual ? `ainda em "${animador.acaoAtual}"` : 'agarrada'}` });
      return true;
    }
    if (this.motor && !this.motor.acao(chave)) { LOG.add({ cat: 'personagem', texto: `ação "${chave}" cancelada pelo código (aoAcao)` }); return true; }
    if (chave === arma.acaoRecarga) {
      if (this.municao >= arma.pente) { LOG.add({ cat: 'personagem', texto: 'recarga ignorada: pente cheio' }); return true; }
      if (animador.tocar(chave)) {
        this.recargaAte = this.tempoJogo + this.duracaoAnim(chave);
        this.mostrarAcao(pers.dados.animacoes[chave]?.nome ?? chave);
        LOG.add({ cat: 'personagem', texto: `recarregando (${this.municao}/${arma.pente})` });
      }
      return true;
    }
    // Tiro
    if (this.municao <= 0) {
      if (animador.tocar(arma.animacaoSemBala)) this.mostrarAcao(pers.dados.animacoes[arma.animacaoSemBala]?.nome ?? arma.animacaoSemBala);
      LOG.add({ cat: 'personagem', texto: 'clique: pente vazio (recarregue)' });
      this.toast('Sem munição! Recarregue.');
      return true;
    }
    if (!animador.tocar(chave)) return true;
    this.municao--;
    this.mostrarAcao(pers.dados.animacoes[chave]?.nome ?? chave);
    this.disparar(arma);
    return true;
  }

  private duracaoAnim(chave: string) {
    const a = this.pers?.dados.animacoes[chave];
    return a ? a.quadros / a.fps : 0;
  }

  /** Tiro instantâneo na direção em que o jogador olha. Devolve o inimigo acertado. */
  private disparar(arma: ConfigArma): InimigoVivo | null {
    const j = this.jogador!;
    const dir = (j.olhandoDireita ? 1 : -1) as -1 | 1;
    const ox = j.x + dir * (j.cfg.largura / 2);
    const oy = j.y - j.cfg.altura * arma.alturaTiro;
    const segs = this.mundo!.segmentosPortas().length ? this.segs.concat(this.mundo!.segmentosPortas()) : this.segs;
    const { alvo, fimX } = raioTiro(segs, this.inimigos, ox, oy, dir, arma.alcance);
    this.rastro = { x0: ox, y0: oy, x1: fimX, y1: oy, t: arma.linha.duracao, total: arma.linha.duracao, acertou: !!alvo, linha: arma.linha, arma };
    // Dano pela distância (tabela da arma); o código da arma (aoCalcularDano) pode decidir outro
    const distancia = Math.abs(fimX - ox);
    // Regra do jogo (Código › Sistema do jogo › sistema.armas.js); a interna só se o módulo falhar
    const doSistema = this.motor?.sistema('armas', 'danoNaDistancia', structuredClone(arma), distancia);
    const pelaTabela = typeof doSistema === 'number' && Number.isFinite(doSistema) ? doSistema : danoNaDistancia(arma, distancia);
    const dano = alvo && this.motor ? this.motor.calcularDano(distancia, alvo, pelaTabela) : pelaTabela;
    LOG.add({ cat: 'personagem', texto: `tiro ${arma.nome} ${dir > 0 ? '→' : '←'} (${this.municao}/${arma.pente}): ${alvo ? `acertou ${alvo.nome} (${alvo.id}) a ${Math.round(distancia)} px (${Math.round((distancia / Math.max(1, arma.alcance)) * 100)}% do alcance) · dano ${dano}${dano !== pelaTabela ? ` (código; tabela ${pelaTabela})` : ''}` : 'errou'}` });
    // O barulho do tiro chama a atenção de quem estiver perto
    for (const i of this.inimigos) if (i !== alvo && i.vivo) this.tratarEventosInimigo(i, ouvir(i, j.x));
    if (alvo) {
      if (this.motor && !this.motor.inimigoLevouDano(alvo, dano)) { LOG.add({ cat: 'inimigo', texto: `${alvo.nome}: dano cancelado pelo código (aoLevarDano)` }); this.motor.atirou(alvo); return alvo; }
      alvo.atingido();
      this.tratarEventosInimigo(alvo, alvo.ia.levarDano(dano, j.x, { duracao: alvo.duracao }));
    }
    this.motor?.atirou(alvo);
    return alvo;
  }

  // ---------- Inimigos ----------

  private tratarEventosInimigo(ini: InimigoVivo, eventos: EventoIA[]) {
    for (const ev of eventos) {
      const quem = `${ini.nome} (${ini.id})`;
      switch (ev.tipo) {
        case 'estado':
          LOG.add({ cat: 'inimigo', texto: `${quem}: ${ev.de} → ${ev.para}` });
          // Levou tiro ou morreu no meio do agarrão: solta o jogador
          if (ev.de === 'atacar' && this.agarradoPor === ini.id && this.tempoJogo < this.agarradoAte) {
            this.agarradoAte = 0; this.agarradoPor = '';
            LOG.add({ cat: 'personagem', texto: `${this.pers?.dados.nome ?? 'Jogador'} se soltou de ${ini.nome}` });
          }
          break;
        case 'viu': LOG.add({ cat: 'inimigo', texto: `${quem} viu o jogador` }); this.motor?.inimigo(ini, 'aoVer'); break;
        case 'perdeu': LOG.add({ cat: 'inimigo', texto: `${quem} perdeu o jogador de vista` }); this.motor?.inimigo(ini, 'aoPerder'); break;
        case 'alerta': LOG.add({ cat: 'inimigo', texto: `${quem} foi atraído pelo tiro (vai na direção x=${Math.round(ev.x)})` }); break;
        case 'atacou':
          if (this.motor && this.motor.inimigo(ini, 'aoAtacar', ev.ataque.animacao) === false) {
            LOG.add({ cat: 'inimigo', texto: `${quem}: ataque "${ev.ataque.animacao}" cancelado pelo código` });
            ini.ia.estado = 'perseguir';
          } else LOG.add({ cat: 'inimigo', texto: `${quem} ataca: ${ev.ataque.animacao}` });
          break;
        case 'errou': LOG.add({ cat: 'inimigo', texto: `${quem}: ${ev.ataque.animacao} errou (jogador saiu do alcance)` }); break;
        case 'acertou': this.jogadorAtingido(ini, ev.ataque, ev.segurar); break;
        case 'morreu':
          LOG.add({ cat: 'inimigo', texto: `${quem} morreu` });
          this.motor?.inimigo(ini, 'aoMorrer');
          break;
      }
    }
  }

  /** Um inimigo acertou o jogador: tira vida (com tempo invulnerável depois), empurra ou prende, e pode matar. */
  private jogadorAtingido(ini: InimigoVivo, ataque: AtaqueInimigo, segurar: number) {
    const j = this.jogador;
    if (!j || this.morto) return;
    if (this.tempoJogo < this.invulAte) { LOG.add({ cat: 'personagem', texto: `golpe de ${ini.nome} não pegou (invulnerável por mais ${(this.invulAte - this.tempoJogo).toFixed(1)} s)` }); return; }
    if (this.motor && !this.motor.jogadorAtingido(ini, ataque.animacao, ataque.dano)) {
      LOG.add({ cat: 'personagem', texto: `golpe de ${ini.nome} ignorado pelo código (aoSerAtingido)` });
      return;
    }
    const nome = this.pers?.dados.nome ?? 'Jogador';
    if (ataque.agarra && segurar > 0) {
      this.agarradoAte = this.tempoJogo + segurar;
      this.agarradoPor = ini.id;
      j.vx = 0;
      LOG.add({ cat: 'personagem', texto: `${nome} foi agarrada por ${ini.nome} (${ataque.animacao}, presa por ${segurar.toFixed(1)} s)` });
    }
    this.ferir(ataque.dano, `${ataque.animacao} de ${ini.nome}`, ini);
  }

  /**
   * Reação ao dano: com aoReagirAoDano no código do personagem, quem decide é o código (piscar, invulnerável,
   * empurrão, animação); sem ele, a reação pronta abaixo (a mesma que o modelo do código mostra).
   */
  private reagirAoDano(dano: number, ini: InimigoVivo | null) {
    if (this.motor?.reageAoDanoPorCodigo()) { this.motor.reagirAoDano(dano, ini); return; }
    const j = this.jogador;
    this.invulneravelPor(this.cfgVida.invulneravel);
    this.piscar(this.cfgVida.piscar, 0xff6060, this.cfgVida.piscadas);
    if (j && ini && this.tempoJogo >= this.agarradoAte) { const lado = j.x >= ini.corpo.x ? 1 : -1; j.vx = 140 * lado; j.vy = -140; }
    this.pers?.animador.tocar('dano');
  }

  private piscar(segundos: number, cor: number, vezes: number) {
    this.piscarDe = this.tempoJogo;
    this.piscarAte = this.tempoJogo + Math.max(0, Number(segundos) || 0);
    this.piscarCor = cor;
    this.piscarVezes = Math.min(30, Math.max(1, Math.round(Number(vezes) || 1)));
  }
  private invulneravelPor(segundos: number) { this.invulAte = Math.max(this.invulAte, this.tempoJogo + Math.max(0, segundos)); }

  // ---------- Vida, morte e checkpoint ----------

  /** Muda a vida (limitada entre 0 e a vida cheia); chegando a 0, morre. */
  private definirVida(n: number, motivo: string) {
    if (this.morto) return;
    const max = this.cfgVida.maxima;
    const antes = this.vida;
    this.vida = Math.max(0, Math.min(max, Math.round(n * 10) / 10));
    if (this.vida !== antes) LOG.add({ cat: 'personagem', texto: `vida ${antes} → ${this.vida}/${max} (${motivo})` });
    if (this.vida > antes) this.toast(`+${Math.round((this.vida - antes) * 10) / 10} de vida`);
    if (this.vida <= 0) this.morrer(motivo);
  }

  /** Tira vida e deixa o jogador invulnerável por um instante (seção Vida em Personagens). */
  private ferir(dano: number, motivo: string, ini: InimigoVivo | null = null) {
    if (this.morto || dano <= 0) return;
    this.definirVida(this.vida - dano, motivo);
    if (!this.morto) this.reagirAoDano(dano, ini);
  }

  /** Vida chegou a 0: animação de morte, controles travados e, depois de um tempo, volta ao checkpoint. */
  private morrer(motivo: string) {
    if (this.morto) return;
    if (this.motor && !this.motor.jogadorMorreu(motivo)) {
      this.vida = Math.max(this.vida, 1);
      LOG.add({ cat: 'personagem', texto: `morte cancelada pelo código (aoMorrer): vida ${this.vida}` });
      return;
    }
    this.vida = 0;
    this.mortoEm = this.tempoJogo;
    this.agarradoAte = 0; this.agarradoPor = '';
    this.recargaAte = 0;
    this.pers?.animador.parar();
    this.mostrarAcao(null);
    const nome = this.pers?.dados.nome ?? 'Jogador';
    LOG.add({ cat: 'personagem', texto: `${nome} morreu (${motivo}); volta ${this.checkpoint ? `no checkpoint "${this.checkpoint.nome}"` : 'no início'} em ${this.cfgVida.renascer.toFixed(1)} s` });
    this.mostrarTelaMorte();
    this.elPrompt.hidden = true;
  }

  /** Tela de morte (ferramenta HUD › Tela de morte) sobre a tela do jogo. */
  private mostrarTelaMorte() {
    const r = this.retanguloTela();
    const z = this.estado.camera.zoom;
    Object.assign(this.elMorte.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    this.elMorte.replaceChildren(telaMorte(this.hudConfig.morte, z, this.urlImagem), el('span', { class: 'teste-morte-dica' }, 'Enter volta já ao checkpoint'));
    this.elMorte.hidden = false;
  }

  /** Volta no checkpoint com a vida cheia. Os inimigos vivos da sala voltam aos lugares; portas e itens ficam como estão. */
  private renascer() {
    if (!this.morto) return;
    this.mortoEm = null;
    this.elMorte.hidden = true;
    this.vida = this.cfgVida.maxima;
    // Recomeça a sala lembrando o que já mudou (como ao voltar a uma sala visitada)
    this.guardarMemoriaSala(this.estado.arquivoFase ?? '');
    this.inventarioLevado = this.mundo ? new Map(this.mundo.inventario) : null;
    this.municaoLevada = this.pers?.dados.arma ? this.pers.dados.arma.pente : null;
    this.reiniciarJogador();
    this.renascendo = true;
    this.reiniciarMundo(true);
    this.renascendo = false;
    this.irAoCheckpoint();
    this.invulAte = this.tempoJogo + 1.5;
    LOG.add({ cat: 'personagem', texto: `voltou no checkpoint "${this.checkpoint?.nome ?? 'início'}" com vida ${this.vida}/${this.cfgVida.maxima}` });
    this.motor?.jogadorRenasceu();
  }

  /** Leva o jogador ao checkpoint (ou ao início da sala, se não houver). */
  private irAoCheckpoint() {
    const j = this.jogador;
    if (!j) return;
    const cp = this.checkpoint;
    if (cp) { j.x = cp.x; j.y = cp.y; j.olhandoDireita = cp.direita; } else { [j.x, j.y] = this.estado.fase.spawnJogador; }
    j.vx = 0; j.vy = 0;
    this.posicionarCamera(true);
  }

  private marcarCheckpoint(x: number, y: number, nome: string, silencioso = false) {
    this.checkpoint = { x, y, direita: this.jogador?.olhandoDireita ?? true, nome };
    if (!silencioso || nome !== 'início do teste') LOG.add({ cat: 'personagem', texto: `checkpoint: ${nome} (${Math.round(x)}, ${Math.round(y)})` });
  }

  /** F6: a sala volta ao começo, com vida cheia. */
  private reiniciarTudo() {
    this.mortoEm = null; this.elMorte.hidden = true; this.invulAte = 0;
    this.vida = this.cfgVida.maxima;
    this.reiniciarJogador(); this.reiniciarMundo();
    if (this.jogador) this.marcarCheckpoint(this.jogador.x, this.jogador.y, 'início da sala', true);
    this.posicionarCamera(true);
  }

  /** Inimigos no agarrão (ataque que agarra) ficam NA FRENTE do jogador, para o braço aparecer por cima. */
  private ordenarAgarrao() {
    const cont = this.spritePers.parent;
    if (!cont) return;
    for (const ini of this.inimigos) {
      const frente = ini.ia.estado === 'atacar' && !!ini.ia.ataque?.agarra;
      if (ini.sprite.parent !== cont) continue;
      const idxIni = cont.getChildIndex(ini.sprite), idxJog = cont.getChildIndex(this.spritePers);
      if (frente && idxIni < idxJog) cont.addChildAt(ini.sprite, idxJog);
      else if (!frente && idxIni > idxJog) cont.addChildAt(ini.sprite, idxJog);
    }
  }

  private desenharRastro(dt: number) {
    const r = this.rastro;
    if (!r) return;
    r.t -= dt;
    if (r.t <= 0) { this.rastro = null; return; }
    // Linha do tiro conforme a arma: visível, pouco visível (fraca, some rápido) ou invisível (só o clarão)
    const k = Math.max(0, r.t / Math.max(0.001, r.total));
    // Como a linha aparece vem do jogo: sistema.armas.js → linhaDoTiro(arma, restante)
    const s = this.motor?.sistema('armas', 'linhaDoTiro', r.arma, k) as { opacidade?: number; espessura?: number; cor?: string } | undefined;
    const l = r.linha;
    const op = typeof s?.opacidade === 'number' ? s.opacidade : (l.opacidade / 100) * (0.4 + 0.6 * k);
    const esp = typeof s?.espessura === 'number' ? s.espessura : l.espessura;
    const cor = Number.parseInt(String(s?.cor ?? l.cor).replace('#', ''), 16) || 0xfff2a8;
    if (op > 0) this.grafico.moveTo(r.x0, r.y0).lineTo(r.x1, r.y1).stroke({ width: esp, color: cor, alpha: Math.min(1, op) });
    this.grafico.circle(r.x0, r.y0, 2.5).fill({ color: 0xffe066, alpha: 0.9 });
    if (r.acertou) this.grafico.circle(r.x1, r.y1, 3).fill({ color: 0xff5050, alpha: 0.9 });
  }

  // ---------- HUD (ferramenta HUD) ----------

  /** Valor de uma chave do HUD (munição, inimigos, item:…, ou o que o código definiu). */
  private valorHud(chave: string): string | null {
    const arma = this.pers?.dados.arma;
    if (chave === 'municao') return arma ? `${this.municao}/${arma.pente}` : null;
    if (chave === 'vida') return `${this.vida}/${this.cfgVida.maxima}`;
    if (chave === 'arma') return arma ? arma.nome : null;
    if (chave === 'inimigos') return String(this.inimigos.filter((i) => i.vivo).length);
    if (chave.startsWith('item:')) return String(this.mundo?.inventario.get(chave.slice(5)) ?? 0);
    return this.valoresHud.get(chave) ?? null;
  }

  private chaveHudTela = '';
  private atualizarHudTela() {
    const els = this.hudConfig.elementos.filter((e) => e.visivel);
    if (!els.length) { this.elHudTela.hidden = true; return; }
    const cj = this.viewport.cameraJogo();
    const a = this.viewport.camadaParaTela(cj.x, cj.y, '');
    const z = this.estado.camera.zoom;
    const valores = els.map((e) => this.valorHud(e.chave));
    const chave = `${Math.round(a.x)},${Math.round(a.y)},${z},${valores.join('|')},${els.length}`;
    if (chave === this.chaveHudTela) return;
    this.chaveHudTela = chave;
    const [rw, rh] = this.estado.fase.resolucaoBase;
    Object.assign(this.elHudTela.style, { left: `${a.x}px`, top: `${a.y}px`, width: `${rw * z}px`, height: `${rh * z}px` });
    this.elHudTela.replaceChildren();
    els.forEach((e, k) => {
      const v = valores[k];
      if (v === null) return;
      const d = elementoHud(e, v, z, this.urlImagem, this.pers?.dados.arma?.imagens);
      this.elHudTela.append(d);
      posicionarHud(d, e, z, rw, rh);
    });
    this.elHudTela.hidden = false;
  }

  /** Estado da física mudou (parado → andando…): registra no log. */
  private registrarEstado(estado: string) {
    if (estado === this.ultimoEstado) return;
    const j = this.jogador;
    LOG.add({ cat: 'personagem', texto: `estado: ${this.ultimoEstado || 'início'} → ${estado}${j ? ` em (${Math.round(j.x)}, ${Math.round(j.y)})` : ''}` });
    this.ultimoEstado = estado;
  }

  /** Mostra no HUD a ação tocando (ajuda a conferir os botões). */
  private mostrarAcao(nome: string | null) {
    if (!this.elAcao) return;
    this.elAcao.textContent = nome ? `Ação: ${nome}` : '';
    this.elAcao.hidden = !nome;
  }

  private textoDica() {
    const partes = [
      `${this.teclasDe('esquerda')} / ${this.teclasDe('direita')} andar`,
      `${this.teclasDe('pular')} pular`,
      `${this.teclasDe('interagir')} interagir`,
      ...(this.pers ? extras(this.pers.dados).filter(([k]) => this.controles.acoes[k]?.length).map(([k, a]) => `${this.teclasDe(k)} ${(a.nome ?? k).toLowerCase()}`) : []),
      'F6 reinicia · Esc volta',
    ];
    return partes.join(' · ');
  }

  /** "← → ou A D" etc., a partir dos controles atuais. */
  private teclasDe(acao: string) {
    const l = this.controles.acoes[acao] ?? [];
    return l.length ? l.map(textoAtalho).join(' ou ') : 'sem tecla';
  }

  // ---------- HUD ----------
  private montarHud() {
    const parar = el('button', { type: 'button', class: 'primario' }, 'Voltar ao editor');
    dica(parar, 'Voltar ao editor', 'Para o teste e volta para onde você estava.', 'Esc');
    parar.addEventListener('click', () => this.parar());
    const cheia = el('button', { type: 'button', class: 'secundario' }, 'Tela cheia');
    dica(cheia, 'Tela cheia', 'Joga em tela cheia (só o jogo, sem o editor). Esc ou F4 volta.', 'F4');
    cheia.addEventListener('click', () => this.alternarTelaCheia());
    const reiniciar = el('button', { type: 'button', class: 'secundario' }, 'Reiniciar');
    dica(reiniciar, 'Reiniciar', 'Volta o jogador para a bandeira de início.', 'F6');
    reiniciar.addEventListener('click', () => this.reiniciarTudo());

    const ajustes = el('details', { class: 'hud-ajustes' }, el('summary', {}, 'Ajustes do jogador'));
    const campo = (rotulo: string, chave: keyof ConfigJogador, min: number, max: number, passo: number, un: string, texto: string) => {
      const id = 'hud-' + chave;
      const input = el('input', { type: 'range', id, min, max, step: passo, value: this.config[chave] });
      const saida = el('output', { for: id }, `${this.config[chave]} ${un}`);
      input.addEventListener('input', () => {
        this.config = { ...this.config, [chave]: Number(input.value) };
        if (this.jogador) this.jogador.cfg = { ...this.config, ...(this.pers ? { largura: this.pers.dados.caixa.largura, altura: this.pers.dados.caixa.altura } : {}) };
        saida.textContent = `${input.value} ${un}`;
      });
      input.addEventListener('change', () => { this.aoMudarConfig(this.config); input.blur(); });
      const lab = el('label', { for: id }, rotulo);
      dica(lab, rotulo, texto);
      return el('div', { class: 'deslizante' }, lab, input, saida);
    };
    ajustes.append(
      campo('Velocidade', 'velocidade', 60, 500, 10, 'px/s', 'Quão rápido o jogador anda.'),
      campo('Altura do pulo', 'alturaPulo', 20, 300, 5, 'px', 'Altura máxima do pulo segurando o botão. Soltando cedo, o pulo fica mais baixo.'),
      campo('Gravidade', 'gravidade', 400, 4000, 50, 'px/s²', 'Quanto mais alta, mais rápido o jogador cai (pulo mais "pesado").'),
      ...(this.pers ? [] : [
        campo('Largura', 'largura', 8, 120, 1, 'px', 'Largura da caixa de colisão do jogador.'),
        campo('Altura', 'altura', 16, 240, 1, 'px', 'Altura da caixa de colisão do jogador.')]),
    );
    if (this.pers) ajustes.append(el('p', { class: 'dica-campo' }, `Jogador: ${this.pers.dados.nome}. A caixa de colisão vem do personagem (editor de Personagens).`));
    this.hud.replaceChildren(
      el('div', { class: 'hud-topo' },
        el('span', { class: 'hud-titulo' }, '▶ Testando'),
        el('span', { class: 'hud-dica' }, this.textoDica()),
        this.elAcao = el('span', { class: 'hud-acao' }),
        cheia, reiniciar, parar),
      ajustes,
    );
  }
}
