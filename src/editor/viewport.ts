// Área do cenário: desenha a fase com PixiJS e trata mouse (selecionar, mover, redimensionar, zoom, pan).
import 'pixi.js/unsafe-eval';
import { Application, Assets, BlurFilter, ColorMatrixFilter, Container, Graphics, Sprite, Texture, TextureStyle } from 'pixi.js';
import { calcularEfeitos, faseDoId, type EfeitoBrilhar, type ResultadoEfeitos } from '../core/efeitos';
import type { ObjetoFase } from '../core/tipos';
import { desenharInicio, sobreInicio } from './colisoes';
import { FerramentaColisao } from './ferramentaColisao';
import { urlAsset, type Plataforma } from '../plataforma/plataforma';
import type { Estado } from './estado';

// Pixel art: nunca suavizar ao ampliar
TextureStyle.defaultOptions.scaleMode = 'nearest';

/** Arredonda a escala: livre (0,1%) ou "redonda" (25% acima de 100%, 5% abaixo). */
export function arredondarEscala(v: number, redonda: boolean) {
  const min = 0.01;
  if (!redonda) return Math.max(min, Math.round(v * 1000) / 1000);
  const passo = v >= 1 ? 0.25 : 0.05;
  return Math.max(redonda ? 0.05 : min, Math.round(v / passo) * passo);
}

export function formatarPct(escala: number) {
  const p = escala * 100;
  return `${p >= 10 ? Math.round(p) : p.toFixed(1).replace('.', ',')}%`;
}

export const NIVEIS_ZOOM = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16];
const TAM_ALCA = 8;
const COR_SELECAO = 0xa7dd3e; // lima da logo
const COR_TELA_JOGO = 0xf89715; // laranja da logo

type Arraste =
  | { tipo: 'pan'; sx: number; sy: number; cx: number; cy: number }
  | { tipo: 'mover'; id: string; dx: number; dy: number; mexeu: boolean }
  | { tipo: 'escala'; id: string; mexeu: boolean; canto: Canto; ancoraX: number; ancoraY: number }
  | { tipo: 'inicio'; mexeu: boolean; dx: number; dy: number };

/** Halo (efeito Brilhar): cópia da imagem em silhueta colorida e borrada, atrás do objeto. */
interface Halo { sp: Sprite; blur: BlurFilter; chave: string; raio: number }

function filtroSilhueta(cor: string) {
  const n = parseInt(cor.replace('#', ''), 16) || 0xffffff;
  const f = new ColorMatrixFilter();
  f.matrix = [0, 0, 0, 0, ((n >> 16) & 255) / 255, 0, 0, 0, 0, ((n >> 8) & 255) / 255, 0, 0, 0, 0, (n & 255) / 255, 0, 0, 0, 1, 0];
  return f;
}

const SEM_EFEITO: ResultadoEfeitos = { dy: 0, escala: 1, alpha: 1, brilho: 0 };

/** Cantos do retângulo de seleção (alças de redimensionar). */
type Canto = 'no' | 'ne' | 'so' | 'se';

export class Viewport {
  readonly app = new Application();
  private fundoFase = new Graphics();
  private raizCamadas = new Container();
  private grade = new Graphics();
  private overlay = new Graphics();
  private colisoesG = new Graphics();
  private halos = new Map<string, Halo>();
  private fantasma = new Sprite(Texture.EMPTY);
  /** Carimbo armado pela caixa de ferramentas (caminho relativo à raiz do projeto). */
  private carimbo: { caminho: string; tex: Texture | null; escala: number } | null = null;
  private mouseTela: { x: number; y: number } | null = null;
  /** Alt segurado: desliga o encaixe nos outros objetos. */
  private altPressionado = false;
  /** Guias do encaixe entre objetos (no espaço da camada) — linhas laranja enquanto arrasta/carimba. */
  private guias: { camada: string; x1: number; y1: number; x2: number; y2: number }[] = [];
  private conteineres = new Map<string, Container>();
  private sprites = new Map<string, Sprite>();
  private texturas = new Map<string, Texture>();
  private carregando = new Set<string>();
  private arraste: Arraste | null = null;
  private espacoPressionado = false;
  private chaveCamera = '';
  private hover: string | null = null;
  /** Posição do mouse no mundo (parallax 1), para a barra de status. */
  mouseMundo = { x: 0, y: 0 };

  /** Chamado ao clicar no cenário com o carimbo armado. */
  aoCarimbar: (caminhoRaiz: string, sx: number, sy: number, escala: number) => void = () => {};
  /** Chamado quando o carimbo é desligado no cenário (após colocar, Esc ou botão direito). */
  aoCancelarCarimbo: (porColocacao: boolean) => void = () => {};
  /** Chamado ao terminar de redimensionar um objeto pelas alças. */
  aoEscalar: (o: ObjetoFase) => void = () => {};

  /** Chamado a cada quadro (ms desde o anterior), antes de desenhar. Usado pelo ▶ Testar. */
  aoQuadro: ((dtMs: number) => void) | null = null;
  /** Chamado depois de reconstruir a cena (para reinserir o jogador do teste). */
  aposSincronizar: (() => void) | null = null;

  /** Durante o ▶ Testar: visibilidade de cada objeto no jogo (itens pegos e portas abertas somem). */
  visibilidadeTeste: Map<string, boolean> | null = null;
  /** Objetos movidos pelo código durante o ▶ Testar (id → deslocamento). */
  deslocamentoTeste: Map<string, { dx: number; dy: number }> | null = null;

  /** Reconstrói a cena (ex.: depois que algo mudou no jogo de teste). */
  atualizarCena() { this.sincronizar(); }

  /** Container de uma camada (espaço da camada). */
  conteinerCamada(id: string) { return this.conteineres.get(id); }

  /** Legenda ao passar o mouse sobre algo do cenário (null = esconder). (cx, cy) = posição na janela. */
  aoPairar: (info: { titulo: string; texto: string } | null, cx: number, cy: number) => void = () => {};

  /** Ferramenta Colisão (desenhar e editar formas). */
  readonly ferrColisao: FerramentaColisao;

  /** Chamado quando um asset da biblioteca é solto no cenário. */
  aoSoltarAsset: (caminhoRaiz: string, sx: number, sy: number) => void = () => {};

  constructor(private el: HTMLElement, private estado: Estado, private plat: Plataforma) {
    this.ferrColisao = new FerramentaColisao({
      estado,
      telaParaMundo: (sx, sy) => this.telaParaCamada(sx, sy, ''),
      mundoParaTela: (x, y) => this.camadaParaTela(x, y, ''),
      zoom: () => this.estado.camera.zoom,
      legenda: (t, sx, sy) => this.mostrarLegenda(t, sx, sy),
    });
  }

  async iniciar() {
    await this.app.init({
      resizeTo: this.el,
      background: '#101513',
      antialias: false,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      preference: 'webgl',
    });
    this.el.appendChild(this.app.canvas);
    this.fantasma.alpha = 0.6;
    this.fantasma.visible = false;
    this.app.stage.addChild(this.fundoFase, this.raizCamadas, this.grade, this.colisoesG, this.overlay, this.fantasma);

    this.estado.on('fase', () => this.sincronizar());
    this.estado.on('selecao', () => (this.chaveCamera = ''));
    this.estado.on('opcoes', () => { this.chaveCamera = ''; this.sincronizar(); });
    this.app.ticker.add((t) => { this.aoQuadro?.(t.deltaMS); this.quadro(); });
    this.ligarEventos();
    this.sincronizar();
    // O cenário muda de tamanho sem a janela mudar (painel de Log, caixa de ferramentas): ajusta o canvas
    new ResizeObserver(() => { this.app.resize(); this.chaveCamera = ''; }).observe(this.el);
  }

  // ---------- Coordenadas ----------

  /**
   * Câmera que o JOGO teria com a visão do editor centralizada no mesmo ponto
   * (tamanho = resolução base, presa dentro da fase). Usada para a prévia de parallax.
   */
  cameraJogo() {
    const { x, y, zoom } = this.estado.camera;
    const { w, h } = this.tamanhoTela();
    const [rw, rh] = this.estado.fase.resolucaoBase;
    const [fw, fh] = this.estado.fase.tamanho;
    const preso = (v: number, max: number) => Math.min(Math.max(v, 0), Math.max(0, max));
    return {
      x: Math.round(preso(x + w / 2 / zoom - rw / 2, fw - rw)),
      y: Math.round(preso(y + h / 2 / zoom - rh / 2, fh - rh)),
      w: rw, h: rh,
    };
  }

  /** Deslocamento da camada no mundo causado pelo parallax (0 com a prévia desligada). */
  private deslocamento(camadaId: string) {
    const c = this.estado.camada(camadaId);
    if (!this.estado.previaParallax || !c) return { x: 0, y: 0 };
    const g = this.cameraJogo();
    return { x: g.x * (1 - c.parallax[0]), y: g.y * (1 - c.parallax[1]) };
  }

  /** Tela (pixels CSS dentro do canvas) → espaço de uma camada. */
  telaParaCamada(sx: number, sy: number, camadaId: string) {
    const { x, y, zoom } = this.estado.camera;
    const d = this.deslocamento(camadaId);
    return { x: sx / zoom + x - d.x, y: sy / zoom + y - d.y };
  }

  camadaParaTela(lx: number, ly: number, camadaId: string) {
    const { x, y, zoom } = this.estado.camera;
    const d = this.deslocamento(camadaId);
    return { x: (lx + d.x - x) * zoom, y: (ly + d.y - y) * zoom };
  }

  tamanhoTela() {
    return { w: this.el.clientWidth, h: this.el.clientHeight };
  }

  /** Centro da visão no espaço da camada (para adicionar com duplo clique). */
  centroNaCamada(camadaId: string) {
    const { w, h } = this.tamanhoTela();
    return this.telaParaCamada(w / 2, h / 2, camadaId);
  }

  // ---------- Carimbo ----------

  get carimboAtivo() { return !!this.carimbo; }

  /** Posição do mouse sobre o cenário (null = fora). */
  get posicaoMouse() { return this.mouseTela ? { ...this.mouseTela } : null; }

  /** Arma o carimbo. escala = tamanho com que o objeto vai entrar (0 = automático: lembrado ou cabendo na tela). */
  armarCarimbo(caminhoRaiz: string | null, escala = 0) {
    if (!caminhoRaiz) { this.carimbo = null; this.fantasma.visible = false; this.app.canvas.style.cursor = ''; this.guias = []; return; }
    const c = { caminho: caminhoRaiz, tex: null as Texture | null, escala };
    this.carimbo = c;
    this.app.canvas.style.cursor = 'crosshair';
    this.texturaRaiz(caminhoRaiz)
      .then((t) => {
        c.tex = t;
        if (!c.escala) c.escala = this.escalaInicial(t.width, t.height);
        if (this.carimbo === c) this.atualizarFantasma();
      })
      .catch(() => this.estado.avisar(`Não consegui carregar: ${caminhoRaiz}`));
  }

  cancelarCarimbo(porColocacao = false) {
    if (!this.carimbo) return;
    this.armarCarimbo(null);
    this.aoCancelarCarimbo(porColocacao);
  }

  /** Imagens maiores que a tela do jogo entram reduzidas para caber em ~60% da altura da tela. */
  escalaInicial(w: number, h: number) {
    const [rw, rh] = this.estado.fase.resolucaoBase;
    if (w <= rw && h <= rh) return 1;
    return arredondarEscala(Math.min((rh * 0.6) / h, (rw * 0.9) / w), false);
  }

  /** Canto superior esquerdo (no espaço da camada) para um objeto w×h centrado no ponto da tela, com encaixe. */
  posicaoColocacao(sx: number, sy: number, w: number, h: number, camadaId: string) {
    const p = this.telaParaCamada(sx, sy, camadaId);
    let x = p.x - w / 2, y = p.y - h / 2;
    if (this.estado.encaixar) {
      const g = this.estado.fase.tamanhoGrade;
      x = Math.round(x / g) * g; y = Math.round(y / g) * g;
    }
    return this.encaixarEmObjetos(x, y, w, h, camadaId, null);
  }

  /**
   * Encaixe magnético nas bordas e centros dos objetos vizinhos da mesma camada: ao chegar perto (8 px de tela),
   * o objeto gruda exatamente na continuação do outro (lado a lado, em cima, embaixo) ou alinhado com ele.
   * Alt desliga. Atualiza as guias laranja.
   */
  encaixarEmObjetos(x: number, y: number, w: number, h: number, camadaId: string, ignorar: string | null) {
    this.guias = [];
    if (this.altPressionado) return { x: Math.round(x), y: Math.round(y) };
    const tol = 8 / this.estado.camera.zoom;
    type Encaixe = { d: number; alvo: number; o: { x: number; y: number; w: number; h: number } };
    let melhorX = null as Encaixe | null;
    let melhorY = null as Encaixe | null;
    for (const o of this.estado.fase.objetos) {
      if (o.id === ignorar || o.camada !== camadaId || !o.visivel) continue;
      const r = { x: o.x, y: o.y, w: o.w * o.escala, h: o.h * o.escala };
      // Só vizinhos: precisam estar perto no outro eixo (evita grudar em algo do outro lado da fase)
      const pertoY = y < r.y + r.h + tol && y + h > r.y - tol;
      const pertoX = x < r.x + r.w + tol && x + w > r.x - tol;
      if (pertoY) {
        // minhas bordas (esq., dir., centro) × bordas dele → deslocamento que encaixa
        for (const [meu, dele] of [[x, r.x + r.w], [x + w, r.x], [x, r.x], [x + w, r.x + r.w], [x + w / 2, r.x + r.w / 2]]) {
          const d = dele - meu;
          if (Math.abs(d) <= tol && (!melhorX || Math.abs(d) < Math.abs(melhorX.d))) melhorX = { d, alvo: dele, o: r };
        }
      }
      if (pertoX) {
        for (const [meu, dele] of [[y, r.y + r.h], [y + h, r.y], [y, r.y], [y + h, r.y + r.h], [y + h / 2, r.y + r.h / 2]]) {
          const d = dele - meu;
          if (Math.abs(d) <= tol && (!melhorY || Math.abs(d) < Math.abs(melhorY.d))) melhorY = { d, alvo: dele, o: r };
        }
      }
    }
    if (melhorX) {
      x += melhorX.d;
      const o = melhorX.o;
      this.guias.push({ camada: camadaId, x1: melhorX.alvo, y1: Math.min(y, o.y), x2: melhorX.alvo, y2: Math.max(y + h, o.y + o.h) });
    }
    if (melhorY) {
      y += melhorY.d;
      const o = melhorY.o;
      this.guias.push({ camada: camadaId, x1: Math.min(x, o.x), y1: melhorY.alvo, x2: Math.max(x + w, o.x + o.w), y2: melhorY.alvo });
    }
    // Encaixado: posição exata (pode ser fracionária se o vizinho tiver tamanho fracionário); senão, pixel inteiro
    return { x: melhorX ? x : Math.round(x), y: melhorY ? y : Math.round(y) };
  }

  private atualizarFantasma() {
    const c = this.carimbo;
    const camada = this.estado.camada(this.estado.camadaAtiva);
    if (!c || !c.tex || !this.mouseTela || !camada) { this.fantasma.visible = false; return; }
    const esc = c.escala || 1;
    const pos = this.posicaoColocacao(this.mouseTela.x, this.mouseTela.y, c.tex.width * esc, c.tex.height * esc, camada.id);
    const t = this.camadaParaTela(pos.x, pos.y, camada.id);
    this.fantasma.texture = c.tex;
    this.fantasma.position.set(Math.round(t.x), Math.round(t.y));
    this.fantasma.scale.set(this.estado.camera.zoom * esc);
    this.fantasma.tint = camada.travada || !camada.visivel ? 0xff6060 : 0xffffff;
    this.fantasma.visible = true;
  }

  // ---------- Texturas ----------

  private texturasRaiz = new Map<string, Texture>();

  /** Textura de um arquivo pelo caminho relativo à raiz do projeto (ex.: o original de apoio). */
  async texturaRaiz(caminhoRaiz: string): Promise<Texture> {
    const cache = this.texturasRaiz.get(caminhoRaiz);
    if (cache) return cache;
    const tex = await Assets.load<Texture>({ src: this.plat.urlRaiz(caminhoRaiz), parser: 'texture' });
    tex.source.scaleMode = 'nearest';
    this.texturasRaiz.set(caminhoRaiz, tex);
    return tex;
  }

  /** Tamanho da imagem original, se já carregada. */
  tamanhoOriginal(caminhoRaiz: string) {
    const t = this.texturasRaiz.get(caminhoRaiz);
    return t ? { w: t.width, h: t.height } : undefined;
  }

  async textura(asset: string): Promise<Texture> {
    const cache = this.texturas.get(asset);
    if (cache) return cache;
    const tex = await Assets.load<Texture>({ src: urlAsset(this.plat, asset), parser: 'texture' });
    tex.source.scaleMode = 'nearest';
    this.texturas.set(asset, tex);
    return tex;
  }

  // ---------- Sincronização fase → cena ----------

  private sincronizar() {
    const fase = this.estado.fase;

    // Camadas na ordem de desenho
    const vistas = new Set<string>();
    this.raizCamadas.removeChildren();
    for (const c of fase.camadas) {
      let cont = this.conteineres.get(c.id);
      if (!cont) { cont = new Container(); this.conteineres.set(c.id, cont); }
      cont.visible = c.visivel;
      cont.removeChildren();
      this.raizCamadas.addChild(cont);
      vistas.add(c.id);
    }
    for (const [id, cont] of this.conteineres) if (!vistas.has(id)) { cont.destroy(); this.conteineres.delete(id); }

    // Objetos
    const ids = new Set<string>();
    for (const o of fase.objetos) {
      ids.add(o.id);
      let sp = this.sprites.get(o.id);
      if (!sp) {
        sp = new Sprite(Texture.EMPTY);
        sp.anchor.set(0.5);
        this.sprites.set(o.id, sp);
      }
      const cont = this.conteineres.get(o.camada);
      const halo = this.sincronizarHalo(o);
      if (halo) cont?.addChild(halo.sp);
      this.aplicarObjeto(sp, o);
      cont?.addChild(sp);
    }
    for (const [id, sp] of this.sprites) if (!ids.has(id)) { sp.destroy(); this.sprites.delete(id); }
    for (const [id, h] of this.halos) if (!ids.has(id)) { h.sp.destroy(); this.halos.delete(id); }
    this.aposSincronizar?.();

    this.chaveCamera = '';
  }

  private sincronizarHalo(o: ObjetoFase): Halo | undefined {
    const brilho = o.efeitos.find((e): e is EfeitoBrilhar => e.tipo === 'brilhar');
    let halo = this.halos.get(o.id);
    if (!brilho) {
      if (halo) { halo.sp.destroy(); this.halos.delete(o.id); }
      return undefined;
    }
    if (!halo) {
      const sp = new Sprite(Texture.EMPTY);
      sp.anchor.set(0.5);
      halo = { sp, blur: new BlurFilter({ strength: 4, quality: 4 }), chave: '', raio: brilho.raio };
      this.halos.set(o.id, halo);
    }
    if (halo.chave !== brilho.cor) {
      halo.chave = brilho.cor;
      halo.sp.filters = [filtroSilhueta(brilho.cor), halo.blur];
    }
    halo.raio = brilho.raio;
    return halo;
  }

  /** Efeito estático (prévia de efeitos desligada): só o brilho aparece, parado. */
  private efeitoEstatico(o: ObjetoFase): ResultadoEfeitos {
    const b = o.efeitos.find((e): e is EfeitoBrilhar => e.tipo === 'brilhar');
    return b ? { ...SEM_EFEITO, brilho: b.intensidade } : SEM_EFEITO;
  }

  private aplicarObjeto(sp: Sprite, o: ObjetoFase, r: ResultadoEfeitos = this.efeitoEstatico(o)) {
    const tex = this.texturas.get(o.asset);
    if (tex) sp.texture = tex;
    else {
      sp.texture = Texture.EMPTY;
      // Carrega uma vez só (antes, a animação dos efeitos pedia a mesma imagem a cada quadro)
      if (!this.carregando.has(o.asset)) {
        this.carregando.add(o.asset);
        this.textura(o.asset)
          .then(() => this.sincronizar())
          .catch(() => this.estado.avisar(`Não consegui carregar: ${o.asset}`))
          .finally(() => this.carregando.delete(o.asset));
      }
    }
    // Sprite com âncora central; o objeto guarda o canto superior esquerdo
    const tw = sp.texture === Texture.EMPTY ? o.w : sp.texture.width;
    const th = sp.texture === Texture.EMPTY ? o.h : sp.texture.height;
    const ex = (o.escala * o.w / tw) * r.escala, ey = (o.escala * o.h / th) * r.escala;
    sp.scale.set(ex * (o.espelharX ? -1 : 1), ey * (o.espelharY ? -1 : 1));
    const desl = this.deslocamentoTeste?.get(o.id);
    sp.position.set(o.x + (o.w * o.escala) / 2 + (desl?.dx ?? 0), o.y + (o.h * o.escala) / 2 + r.dy + (desl?.dy ?? 0));
    sp.angle = o.rotacao;
    sp.alpha = o.opacidade * r.alpha;
    sp.visible = o.visivel && (this.visibilidadeTeste?.get(o.id) ?? true);

    const halo = this.halos.get(o.id);
    if (halo) {
      const larguraFinal = Math.max(1, o.w * o.escala * r.escala);
      const cresce = (larguraFinal + halo.raio) / larguraFinal;
      halo.sp.texture = sp.texture;
      halo.sp.position.copyFrom(sp.position);
      halo.sp.scale.set(sp.scale.x * cresce, sp.scale.y * cresce);
      halo.sp.angle = sp.angle;
      halo.sp.alpha = Math.min(1, r.brilho) * o.opacidade * r.alpha;
      halo.sp.visible = sp.visible && r.brilho > 0;
      const forca = Math.max(1, halo.raio * this.estado.camera.zoom * 0.6);
      if (Math.abs(halo.blur.strength - forca) > 0.01) halo.blur.strength = forca;
    }
  }

  /** Efeitos animados (pulsar, brilhar, flutuar, piscar) aplicados a cada quadro. */
  private animarEfeitos() {
    const t = performance.now() / 1000;
    const a = this.arraste;
    const arrastando = a && (a.tipo === 'mover' || a.tipo === 'escala') ? a.id : null;
    for (const o of this.estado.fase.objetos) {
      if (!o.efeitos.length) continue;
      const sp = this.sprites.get(o.id);
      if (!sp) continue;
      const r = this.estado.previaEfeitos && o.id !== arrastando ? calcularEfeitos(o.efeitos, t, faseDoId(o.id)) : this.efeitoEstatico(o);
      this.aplicarObjeto(sp, o, r);
    }
  }

  // ---------- Quadro a quadro ----------

  // ---------- Barras de rolagem ----------
  private rolagem: { h: HTMLElement; v: HTMLElement; hPolegar: HTMLElement; vPolegar: HTMLElement; chave: string } | null = null;

  /** Faixa navegável num eixo (mundo): a fase inteira mais meia tela de folga em cada lado. */
  private faixa(eixo: 0 | 1) {
    const { w, h } = this.tamanhoTela();
    const z = this.estado.camera.zoom;
    const vista = (eixo === 0 ? w : h) / z;
    const tam = this.estado.fase.tamanho[eixo];
    const folga = vista / 2;
    return { min: -folga, max: Math.max(tam + folga, -folga + vista), vista };
  }

  private criarRolagem() {
    const criar = (eixo: 0 | 1) => {
      const barra = document.createElement('div');
      barra.className = 'barra-rolagem ' + (eixo === 0 ? 'horizontal' : 'vertical');
      const polegar = document.createElement('div');
      polegar.className = 'polegar';
      barra.append(polegar);
      barra.dataset.legTitulo = eixo === 0 ? 'Rolar na horizontal' : 'Rolar na vertical';
      barra.dataset.legTexto = 'Arraste a barra ou clique no trilho. Também: Espaço + arrastar, botão do meio, Shift + roda (horizontal).';
      const prop = eixo === 0 ? 'x' : 'y';
      // Clicar no trilho: pula uma tela naquela direção
      barra.addEventListener('pointerdown', (e) => {
        if (e.target !== barra) return;
        const r = polegar.getBoundingClientRect();
        const antes = eixo === 0 ? e.clientX < r.left : e.clientY < r.top;
        const f = this.faixa(eixo);
        this.estado.camera[prop] += (antes ? -1 : 1) * f.vista * 0.9;
        this.prenderCamera();
        this.estado.emit('camera');
      });
      // Arrastar o polegar
      polegar.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        polegar.setPointerCapture(e.pointerId);
        const inicio = eixo === 0 ? e.clientX : e.clientY;
        const camInicio = this.estado.camera[prop];
        const f = this.faixa(eixo);
        const trilho = eixo === 0 ? barra.clientWidth : barra.clientHeight;
        const mover = (ev: PointerEvent) => {
          const d = (eixo === 0 ? ev.clientX : ev.clientY) - inicio;
          this.estado.camera[prop] = camInicio + (d / trilho) * (f.max - f.min);
          this.prenderCamera();
          this.estado.emit('camera');
        };
        const soltar = () => { polegar.removeEventListener('pointermove', mover); polegar.removeEventListener('pointerup', soltar); polegar.classList.remove('arrastando'); };
        polegar.classList.add('arrastando');
        polegar.addEventListener('pointermove', mover);
        polegar.addEventListener('pointerup', soltar);
      });
      this.el.append(barra);
      return { barra, polegar };
    };
    const h = criar(0), v = criar(1);
    this.rolagem = { h: h.barra, v: v.barra, hPolegar: h.polegar, vPolegar: v.polegar, chave: '' };
  }

  /** Mantém a visão dentro da faixa navegável. */
  private prenderCamera() {
    const c = this.estado.camera;
    for (const [eixo, prop] of [[0, 'x'], [1, 'y']] as const) {
      const f = this.faixa(eixo);
      c[prop] = Math.min(Math.max(c[prop], f.min), Math.max(f.min, f.max - f.vista));
    }
  }

  private atualizarRolagem() {
    if (!this.rolagem) this.criarRolagem();
    const r = this.rolagem!;
    const { w, h } = this.tamanhoTela();
    const { x, y, zoom } = this.estado.camera;
    const chave = `${x},${y},${zoom},${w},${h},${this.estado.fase.tamanho},${this.estado.testando}`;
    if (chave === r.chave) return;
    r.chave = chave;
    const ocultar = this.estado.testando;
    for (const [eixo, barra, polegar, pos] of [[0, r.h, r.hPolegar, x], [1, r.v, r.vPolegar, y]] as const) {
      const f = this.faixa(eixo);
      const total = f.max - f.min;
      const frac = Math.min(1, f.vista / total);
      // Tudo à vista: a barra some
      barra.hidden = ocultar || frac >= 0.999;
      const ini = Math.min(Math.max((pos - f.min) / total, 0), 1 - frac);
      if (eixo === 0) { polegar.style.left = `${ini * 100}%`; polegar.style.width = `${Math.max(frac * 100, 4)}%`; }
      else { polegar.style.top = `${ini * 100}%`; polegar.style.height = `${Math.max(frac * 100, 4)}%`; }
    }
  }

  private quadro() {
    this.atualizarRolagem();
    this.animarEfeitos();
    const { x, y, zoom } = this.estado.camera;
    for (const c of this.estado.fase.camadas) {
      const cont = this.conteineres.get(c.id);
      if (!cont) continue;
      const d = this.deslocamento(c.id);
      cont.position.set(Math.round((d.x - x) * zoom), Math.round((d.y - y) * zoom));
      cont.scale.set(zoom);
    }
    const { w, h } = this.tamanhoTela();
    const chave = `${x},${y},${zoom},${this.estado.fase.objetos.length},${this.estado.fase.objetos.reduce((n, o) => n + (o.tipo === 'interativo' ? o.x + o.y * 7 + o.escala * 13 : 0), 0)},${this.estado.previaParallax},${JSON.stringify(this.estado.fase.camadas)},${this.estado.fase.resolucaoBase},${w},${h},${this.estado.grade},${this.hover},${this.estado.selecionado},${JSON.stringify(this.estado.objetoSelecionado() ?? '')},${this.estado.fase.tamanho},${this.estado.fase.corFundo},${this.estado.modo},${this.estado.mostrarColisoes},${this.estado.colisaoSelecionada},${JSON.stringify(this.estado.fase.colisoes)},${this.ferrColisao.versao},${this.estado.testando},${this.estado.fase.spawnJogador},${JSON.stringify(this.guias)}`;
    if (this.carimbo) this.atualizarFantasma();
    if (chave === this.chaveCamera) return;
    this.chaveCamera = chave;
    this.desenharFundo();
    this.desenharGrade(w, h);
    this.desenharColisoesEInicio();
    this.desenharOverlay();
  }

  private desenharColisoesEInicio() {
    const g = this.colisoesG.clear();
    if (this.estado.testando && !this.estado.mostrarColisoes) return;
    const modoCol = this.estado.modo === 'colisao' && !this.estado.testando;
    if (this.estado.mostrarColisoes || modoCol) this.ferrColisao.desenhar(g, modoCol);
    if (this.estado.testando) return;
    // Início do jogador (sempre visível no editor)
    const [ix, iy] = this.estado.fase.spawnJogador;
    const pi = this.camadaParaTela(ix, iy, '');
    desenharInicio(g, pi.x, pi.y, this.estado.modo === 'inicio' || this.arraste?.tipo === 'inicio');
  }

  /** Ponto da tela → mundo (parallax 1), com encaixe na grade se ativo. */
  private mundoEncaixado(sx: number, sy: number) {
    const p = this.telaParaCamada(sx, sy, '');
    if (!this.estado.encaixar) return { x: Math.round(p.x), y: Math.round(p.y) };
    const g = this.estado.fase.tamanhoGrade;
    return { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g };
  }

  private desenharFundo() {
    const [fw, fh] = this.estado.fase.tamanho;
    const { x, y, zoom: z } = this.estado.camera;
    const a = { x: -x * z, y: -y * z };
    this.fundoFase.clear()
      .rect(Math.round(a.x), Math.round(a.y), fw * z, fh * z)
      .fill({ color: this.estado.fase.corFundo })
      .stroke({ width: 1, color: 0x2b3835, alignment: 1 });
  }

  private desenharGrade(w: number, h: number) {
    this.grade.clear();
    if (!this.estado.grade || this.estado.testando) return;
    const { x, y, zoom } = this.estado.camera;
    const passo = this.estado.fase.tamanhoGrade;
    if (passo * zoom < 6) return;
    const [fw, fh] = this.estado.fase.tamanho;
    const x0 = Math.max(0, Math.floor(x / passo) * passo);
    const x1 = Math.min(fw, x + w / zoom);
    const y0 = Math.max(0, Math.floor(y / passo) * passo);
    const y1 = Math.min(fh, y + h / zoom);
    for (let gx = x0; gx <= x1; gx += passo) {
      const sx = Math.round((gx - x) * zoom) + 0.5;
      this.grade.moveTo(sx, (Math.max(0, y) - y) * zoom).lineTo(sx, (y1 - y) * zoom);
    }
    for (let gy = y0; gy <= y1; gy += passo) {
      const sy = Math.round((gy - y) * zoom) + 0.5;
      this.grade.moveTo((Math.max(0, x) - x) * zoom, sy).lineTo((x1 - x) * zoom, sy);
    }
    this.grade.stroke({ width: 1, color: 0xffffff, alpha: 0.07 });
  }

  /** Retângulo do objeto na tela. */
  retanguloTela(o: ObjetoFase) {
    const a = this.camadaParaTela(o.x, o.y, o.camada);
    const z = this.estado.camera.zoom;
    return { x: a.x, y: a.y, w: o.w * o.escala * z, h: o.h * o.escala * z };
  }

  private desenharOverlay() {
    const g = this.overlay.clear();
    if (this.estado.testando) {
      // Só a tela do jogador fica visível: escurece em volta (como o jogo vai aparecer)
      const cj = this.cameraJogo();
      const a = this.camadaParaTela(cj.x, cj.y, '');
      const z = this.estado.camera.zoom;
      const { w, h } = this.tamanhoTela();
      const x0 = Math.round(a.x), y0 = Math.round(a.y), x1 = Math.round(a.x + cj.w * z), y1 = Math.round(a.y + cj.h * z);
      const cor = { color: 0x0b0f0e, alpha: 0.92 };
      g.rect(0, 0, w, y0).fill(cor).rect(0, y1, w, h - y1).fill(cor).rect(0, y0, x0, y1 - y0).fill(cor).rect(x1, y0, w - x1, y1 - y0).fill(cor);
      g.rect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0).stroke({ width: 1, color: COR_TELA_JOGO, alpha: 0.4 });
      return;
    }
    // Quadro da tela do jogador (resolução base) na posição que a câmera do jogo teria
    const cj = this.cameraJogo();
    const a = this.camadaParaTela(cj.x, cj.y, '');
    const z = this.estado.camera.zoom;
    g.rect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(cj.w * z), Math.round(cj.h * z))
      .stroke({ width: 1, color: COR_TELA_JOGO, alpha: 0.6 });
    if (this.hover && this.hover !== this.estado.selecionado) {
      const o = this.estado.objeto(this.hover);
      if (o) {
        const r = this.retanguloTela(o);
        g.rect(r.x, r.y, r.w, r.h).stroke({ width: 1, color: COR_SELECAO, alpha: 0.45 });
      }
    }
    // Conexões: alavanca → alvo (forte se uma das pontas estiver selecionada)
    for (const o of this.estado.fase.objetos) {
      const c = o.comportamentos[0];
      if (o.tipo !== 'interativo' || c?.tipo !== 'alavanca' || !c.alvo) continue;
      const alvo = this.estado.objeto(c.alvo);
      if (!alvo) continue;
      const ra = this.retanguloTela(o), rb = this.retanguloTela(alvo);
      const forte = this.estado.selecionado === o.id || this.estado.selecionado === alvo.id;
      const ax = ra.x + ra.w / 2, ay = ra.y + ra.h / 2, bx = rb.x + rb.w / 2, by = rb.y + rb.h / 2;
      const passos = Math.max(1, Math.floor(Math.hypot(bx - ax, by - ay) / 8));
      for (let i = 0; i < passos; i += 2) {
        const t0 = i / passos, t1 = Math.min(1, (i + 1) / passos);
        g.moveTo(ax + (bx - ax) * t0, ay + (by - ay) * t0).lineTo(ax + (bx - ax) * t1, ay + (by - ay) * t1);
      }
      g.stroke({ width: forte ? 2 : 1, color: COR_SELECAO, alpha: forte ? 0.95 : 0.35 });
      g.circle(bx, by, forte ? 4 : 3).fill({ color: COR_SELECAO, alpha: forte ? 1 : 0.5 });
    }
    // Marcador dos objetos interativos (losango lima no canto superior esquerdo)
    for (const o of this.estado.fase.objetos) {
      if (o.tipo !== 'interativo' || !o.visivel || this.estado.camada(o.camada)?.visivel === false) continue;
      const r = this.retanguloTela(o);
      const mx = Math.round(r.x), my = Math.round(r.y), t = 4;
      g.poly([mx, my - t, mx + t, my, mx, my + t, mx - t, my]).fill({ color: COR_SELECAO }).stroke({ width: 1, color: 0x083933 });
    }
    // Guias do encaixe entre objetos
    for (const gu of this.guias) {
      const a1 = this.camadaParaTela(gu.x1, gu.y1, gu.camada), a2 = this.camadaParaTela(gu.x2, gu.y2, gu.camada);
      const vert = gu.x1 === gu.x2;
      const fx = (v: number) => Math.round(v) + (vert ? 0.5 : 0), fy = (v: number) => Math.round(v) + (vert ? 0 : 0.5);
      g.moveTo(fx(a1.x), fy(a1.y) - (vert ? 12 : 0)).lineTo(fx(a2.x), fy(a2.y) + (vert ? 12 : 0)).stroke({ width: 1, color: 0xf89715 });
    }
    const sel = this.estado.objetoSelecionado();
    if (sel && this.estado.camada(sel.camada)?.visivel !== false) {
      const r = this.retanguloTela(sel);
      g.rect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w), Math.round(r.h))
        .stroke({ width: 1, color: COR_SELECAO });
      for (const [cx, cy] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
        g.rect(Math.round(cx - TAM_ALCA / 2), Math.round(cy - TAM_ALCA / 2), TAM_ALCA, TAM_ALCA)
          .fill({ color: 0xffffff }).stroke({ width: 1, color: COR_SELECAO });
      }
    }
  }

  // ---------- Mouse ----------

  /** Objeto mais à frente sob o ponto, ignorando camadas ocultas ou travadas. */
  objetoEm(sx: number, sy: number): ObjetoFase | undefined {
    const fase = this.estado.fase;
    for (let ci = fase.camadas.length - 1; ci >= 0; ci--) {
      const c = fase.camadas[ci];
      if (!c.visivel || c.travada) continue;
      const p = this.telaParaCamada(sx, sy, c.id);
      for (let i = fase.objetos.length - 1; i >= 0; i--) {
        const o = fase.objetos[i];
        if (o.camada !== c.id || !o.visivel) continue;
        if (p.x >= o.x && p.x <= o.x + o.w * o.escala && p.y >= o.y && p.y <= o.y + o.h * o.escala) return o;
      }
    }
    return undefined;
  }

  /** Canto (alça) de um retângulo da tela sob o ponto. */
  private cantoEm(r: { x: number; y: number; w: number; h: number }, sx: number, sy: number): Canto | null {
    const perto = (ax: number, ay: number) => Math.abs(sx - ax) <= TAM_ALCA && Math.abs(sy - ay) <= TAM_ALCA;
    if (perto(r.x + r.w, r.y + r.h)) return 'se';
    if (perto(r.x, r.y)) return 'no';
    if (perto(r.x + r.w, r.y)) return 'ne';
    if (perto(r.x, r.y + r.h)) return 'so';
    return null;
  }

  /** Canto (alça) sob o ponto, se houver objeto selecionado. */
  private sobreAlca(sx: number, sy: number): Canto | null {
    const sel = this.estado.objetoSelecionado();
    return sel ? this.cantoEm(this.retanguloTela(sel), sx, sy) : null;
  }

  private sobreMarcadorInicio(sx: number, sy: number) {
    const [ix, iy] = this.estado.fase.spawnJogador;
    const p = this.camadaParaTela(ix, iy, '');
    return sobreInicio(p.x, p.y, sx, sy);
  }

  /** Legenda flutuante com o tamanho durante o redimensionamento. */
  private legenda: HTMLDivElement | null = null;
  private mostrarLegenda(texto: string | null, sx = 0, sy = 0) {
    if (!texto) { this.legenda?.remove(); this.legenda = null; return; }
    if (!this.legenda) {
      this.legenda = document.createElement('div');
      this.legenda.className = 'legenda-tamanho';
      this.el.append(this.legenda);
    }
    this.legenda.textContent = texto;
    this.legenda.style.left = `${Math.round(sx + 14)}px`;
    this.legenda.style.top = `${Math.round(sy + 14)}px`;
  }

  private posMouse(e: MouseEvent) {
    const r = this.app.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** Multiplica a escala do selecionado mantendo o centro no lugar. */
  escalarSelecionado(fator: number) {
    const o = this.estado.objetoSelecionado();
    if (!o) return;
    this.estado.alterar(() => {
      const cx = o.x + (o.w * o.escala) / 2, cy = o.y + (o.h * o.escala) / 2;
      o.escala = arredondarEscala(o.escala * fator, false);
      o.x = Math.round(cx - (o.w * o.escala) / 2);
      o.y = Math.round(cy - (o.h * o.escala) / 2);
    });
    this.aoEscalar(o);
  }

  zoomEm(sx: number, sy: number, novoZoom: number) {
    const cam = this.estado.camera;
    const mx = sx / cam.zoom + cam.x;
    const my = sy / cam.zoom + cam.y;
    cam.zoom = novoZoom;
    cam.x = mx - sx / novoZoom;
    cam.y = my - sy / novoZoom;
    this.estado.emit('camera');
  }

  passoZoom(direcao: 1 | -1, sx?: number, sy?: number) {
    const z = this.estado.camera.zoom;
    let i = NIVEIS_ZOOM.findIndex((n) => n >= z - 1e-6);
    if (i < 0) i = NIVEIS_ZOOM.length - 1;
    if (direcao > 0 && NIVEIS_ZOOM[i] <= z + 1e-6) i++;
    if (direcao < 0) i--;
    i = Math.max(0, Math.min(NIVEIS_ZOOM.length - 1, i));
    const { w, h } = this.tamanhoTela();
    this.zoomEm(sx ?? w / 2, sy ?? h / 2, NIVEIS_ZOOM[i]);
  }

  /** Enquadra a fase inteira na tela. */
  enquadrar() {
    const { w, h } = this.tamanhoTela();
    const [fw, fh] = this.estado.fase.tamanho;
    const zAlvo = Math.min((w - 40) / fw, (h - 40) / fh);
    const z = [...NIVEIS_ZOOM].reverse().find((n) => n <= zAlvo) ?? NIVEIS_ZOOM[0];
    const cam = this.estado.camera;
    cam.zoom = z;
    cam.x = fw / 2 - w / 2 / z;
    cam.y = fh / 2 - h / 2 / z;
    this.estado.emit('camera');
  }

  setEspaco(pressionado: boolean) {
    this.espacoPressionado = pressionado;
    this.app.canvas.style.cursor = pressionado ? 'grab' : '';
  }

  // ---------- Início do jogador (arrastar a bandeira) ----------

  private moverInicio(a: Extract<Arraste, { tipo: 'inicio' }>, sx: number, sy: number) {
    if (!a.mexeu) { this.estado.checkpoint(); a.mexeu = true; }
    const livre = this.telaParaCamada(sx, sy, '');
    let nx = livre.x - a.dx, ny = livre.y - a.dy;
    if (this.estado.encaixar) {
      const g = this.estado.fase.tamanhoGrade;
      nx = Math.round(nx / g) * g; ny = Math.round(ny / g) * g;
    }
    this.estado.fase.spawnJogador = [Math.round(nx), Math.round(ny)];
    this.estado.marcarAlterado();
  }

  private ligarEventos() {
    const cv = this.app.canvas;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    cv.addEventListener('pointerdown', (e) => {
      if (this.estado.testando) return;
      cv.setPointerCapture(e.pointerId);
      const p = this.posMouse(e);
      const cam = this.estado.camera;
      this.aoPairar(null, 0, 0);
      if (e.button === 1 || (e.button === 0 && (this.espacoPressionado || this.estado.modo === 'mao'))) {
        this.arraste = { tipo: 'pan', sx: p.x, sy: p.y, cx: cam.x, cy: cam.y };
        cv.style.cursor = 'grabbing';
        return;
      }
      if (e.button === 2 && this.carimbo) { this.cancelarCarimbo(); return; }
      if (this.estado.modo === 'colisao' && !this.carimbo) {
        this.ferrColisao.pointerDown(p.x, p.y, e.button, e.altKey);
        return;
      }
      if (e.button !== 0) return;
      if (this.carimbo) {
        const caminho = this.carimbo.caminho;
        const escala = this.carimbo.escala;
        if (!e.shiftKey) this.cancelarCarimbo(true); // um clique = um objeto (Shift mantém o carimbo)
        this.aoCarimbar(caminho, p.x, p.y, escala);
        return;
      }
      if (this.estado.modo === 'inicio') {
        const w = this.mundoEncaixado(p.x, p.y);
        this.estado.alterar((f) => { f.spawnJogador = [w.x, w.y]; });
        this.estado.definirModo('selecionar');
        this.estado.avisar(`Início do jogador em x ${w.x}, y ${w.y} (posição dos pés).`);
        return;
      }
      if (this.estado.escolhendoAlvo) {
        const fn = this.estado.escolhendoAlvo;
        this.estado.escolhendoAlvo = null;
        cv.style.cursor = '';
        fn(this.objetoEm(p.x, p.y)?.id ?? null);
        return;
      }
      if (this.sobreMarcadorInicio(p.x, p.y)) {
        const w = this.telaParaCamada(p.x, p.y, '');
        const [ix, iy] = this.estado.fase.spawnJogador;
        this.arraste = { tipo: 'inicio', mexeu: false, dx: w.x - ix, dy: w.y - iy };
        return;
      }
      const sel = this.estado.objetoSelecionado();
      const canto = sel ? this.sobreAlca(p.x, p.y) : null;
      if (sel && canto) {
        // A âncora é o canto oposto, que fica parado
        const w = sel.w * sel.escala, h = sel.h * sel.escala;
        const ancoraX = canto === 'no' || canto === 'so' ? sel.x + w : sel.x;
        const ancoraY = canto === 'no' || canto === 'ne' ? sel.y + h : sel.y;
        this.arraste = { tipo: 'escala', id: sel.id, mexeu: false, canto, ancoraX, ancoraY };
        return;
      }
      const alvo = this.objetoEm(p.x, p.y);
      if (alvo) {
        this.estado.selecionar(alvo.id);
        const lp = this.telaParaCamada(p.x, p.y, alvo.camada);
        this.arraste = { tipo: 'mover', id: alvo.id, dx: lp.x - alvo.x, dy: lp.y - alvo.y, mexeu: false };
      } else {
        this.estado.selecionar(null);
      }
    });

    cv.addEventListener('dblclick', (e) => {
      if (this.estado.testando || this.estado.modo !== 'colisao') return;
      const p = this.posMouse(e);
      this.ferrColisao.duploClique(p.x, p.y);
    });

    cv.addEventListener('pointermove', (e) => {
      const p = this.posMouse(e);
      const cam = this.estado.camera;
      this.mouseMundo = { x: Math.floor(p.x / cam.zoom + cam.x), y: Math.floor(p.y / cam.zoom + cam.y) };
      this.mouseTela = p;
      this.altPressionado = e.altKey;
      this.estado.emit('camera');
      if (this.estado.testando) return;
      const a = this.arraste;
      if (this.carimbo && !a) { this.atualizarFantasma(); return; }
      if (a?.tipo === 'pan') {
        cam.x = a.cx - (p.x - a.sx) / cam.zoom;
        cam.y = a.cy - (p.y - a.sy) / cam.zoom;
        return;
      }
      if (this.estado.modo === 'colisao') {
        this.ferrColisao.pointerMove(p.x, p.y, e.shiftKey);
        this.hover = null;
        if (!this.ferrColisao.ocupado) {
          cv.style.cursor = this.espacoPressionado ? 'grab' : this.ferrColisao.cursor(p.x, p.y);
          const info = this.ferrColisao.legendaEm(p.x, p.y);
          this.aoPairar(info, e.clientX, e.clientY);
        } else this.aoPairar(null, 0, 0);
        return;
      }
      const cursorCanto = (c: Canto | null) => (c ? (c === 'se' || c === 'no' ? 'nwse-resize' : 'nesw-resize') : null);
      if (!a) {
        if (this.espacoPressionado || this.estado.modo === 'mao') { cv.style.cursor = 'grab'; this.aoPairar(null, 0, 0); return; }
        if (this.estado.modo === 'inicio') { cv.style.cursor = 'crosshair'; this.aoPairar(null, 0, 0); return; }
        this.hover = this.objetoEm(p.x, p.y)?.id ?? null;
        if (this.estado.escolhendoAlvo) { cv.style.cursor = this.hover ? 'pointer' : 'crosshair'; this.aoPairar(null, 0, 0); return; }
        const naBandeira = this.sobreMarcadorInicio(p.x, p.y);
        cv.style.cursor = cursorCanto(this.sobreAlca(p.x, p.y)) ?? (naBandeira || this.hover ? 'move' : '');
        if (naBandeira) {
          this.aoPairar({ titulo: 'Início do jogador', texto: 'Onde ficam os pés da personagem quando a fase começa. Arraste para mover, ou use a ferramenta Início (I) e clique no lugar.' }, e.clientX, e.clientY);
        } else if (this.hover) {
          const o = this.estado.objeto(this.hover)!;
          const camada = this.estado.camada(o.camada)?.nome ?? o.camada;
          this.aoPairar({
            titulo: `${o.nome} · ${o.tipo === 'interativo' ? 'interativo' : 'estático'}`,
            texto: `Camada ${camada} · ${Math.round(o.w * o.escala)} × ${Math.round(o.h * o.escala)} px${o.efeitos.length ? ' · efeitos: ' + o.efeitos.map((x) => x.tipo).join(', ') : ''}. Clique para selecionar, arraste para mover.`,
          }, e.clientX, e.clientY);
        } else this.aoPairar(null, 0, 0);
        return;
      }
      this.aoPairar(null, 0, 0);
      if (a.tipo === 'inicio') { this.moverInicio(a, p.x, p.y); return; }
      const o = this.estado.objeto(a.id);
      if (!o) return;
      if (!a.mexeu) { this.estado.checkpoint(); a.mexeu = true; }
      const lp = this.telaParaCamada(p.x, p.y, o.camada);
      if (a.tipo === 'mover') {
        let nx = lp.x - a.dx;
        let ny = lp.y - a.dy;
        if (this.estado.encaixar) {
          const g = this.estado.fase.tamanhoGrade;
          nx = Math.round(nx / g) * g;
          ny = Math.round(ny / g) * g;
        }
        this.altPressionado = e.altKey;
        const enc = this.encaixarEmObjetos(nx, ny, o.w * o.escala, o.h * o.escala, o.camada, o.id);
        o.x = enc.x;
        o.y = enc.y;
      } else {
        // Redimensiona livremente mantendo a proporção; Shift = valores redondos.
        const bruta = Math.max(Math.abs(lp.x - a.ancoraX) / o.w, Math.abs(lp.y - a.ancoraY) / o.h);
        o.escala = arredondarEscala(bruta, e.shiftKey);
        const w = o.w * o.escala, h = o.h * o.escala;
        o.x = Math.round(a.canto === 'no' || a.canto === 'so' ? a.ancoraX - w : a.ancoraX);
        o.y = Math.round(a.canto === 'no' || a.canto === 'ne' ? a.ancoraY - h : a.ancoraY);
        this.mostrarLegenda(`${Math.round(w)} × ${Math.round(h)} px · ${formatarPct(o.escala)}`, p.x, p.y);
      }
      this.estado.marcarAlterado();
    });

    const soltar = () => {
      const a = this.arraste;
      if (a?.tipo === 'pan') cv.style.cursor = this.espacoPressionado || this.estado.modo === 'mao' ? 'grab' : '';
      if (a?.tipo === 'escala') {
        this.mostrarLegenda(null);
        const o = this.estado.objeto(a.id);
        if (a.mexeu && o) this.aoEscalar(o);
      }
      if (!a && this.estado.modo === 'colisao') this.ferrColisao.pointerUp();
      this.arraste = null;
      if (this.guias.length && !this.carimbo) { this.guias = []; this.chaveCamera = ''; }
      this.chaveCamera = '';
    };
    cv.addEventListener('pointerup', soltar);
    cv.addEventListener('pointercancel', soltar);
    cv.addEventListener('pointerleave', () => { this.hover = null; this.mouseTela = null; this.fantasma.visible = false; this.guias = []; this.aoPairar(null, 0, 0); });

    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = this.posMouse(e);
      const sel = this.estado.objetoSelecionado();
      if (e.altKey && sel) {
        // Alt + roda = aumentar/diminuir o objeto selecionado (10% por passo)
        this.escalarSelecionado(e.deltaY < 0 ? 1.1 : 1 / 1.1);
        return;
      }
      if (e.ctrlKey || !e.shiftKey) this.passoZoom(e.deltaY < 0 ? 1 : -1, p.x, p.y);
      else {
        // Shift + roda = rolar na horizontal
        this.estado.camera.x += (e.deltaY / this.estado.camera.zoom);
        this.estado.emit('camera');
      }
    }, { passive: false });

    // Arrastar da biblioteca para o cenário
    this.el.addEventListener('dragover', (e) => {
      if (e.dataTransfer?.types.includes('application/x-lorex-asset')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    this.el.addEventListener('drop', (e) => {
      const caminho = e.dataTransfer?.getData('application/x-lorex-asset');
      if (!caminho) return;
      e.preventDefault();
      const p = this.posMouse(e);
      this.aoSoltarAsset(caminho, p.x, p.y);
    });
  }
}
