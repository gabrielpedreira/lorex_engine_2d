// Área do cenário: desenha a fase com PixiJS e trata mouse (selecionar, mover, redimensionar, zoom, pan).
import 'pixi.js/unsafe-eval';
import { Application, Assets, Container, Graphics, Sprite, Texture, TextureStyle } from 'pixi.js';
import type { ObjetoFase } from '../core/tipos';
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
  | { tipo: 'escala'; id: string; mexeu: boolean; canto: Canto; ancoraX: number; ancoraY: number };

/** Cantos do retângulo de seleção (alças de redimensionar). */
type Canto = 'no' | 'ne' | 'so' | 'se';

export class Viewport {
  readonly app = new Application();
  private fundoFase = new Graphics();
  private raizCamadas = new Container();
  private grade = new Graphics();
  private overlay = new Graphics();
  private fantasma = new Sprite(Texture.EMPTY);
  /** Carimbo armado pela caixa de ferramentas (caminho relativo à raiz do projeto). */
  private carimbo: { caminho: string; tex: Texture | null; escala: number } | null = null;
  private mouseTela: { x: number; y: number } | null = null;
  private conteineres = new Map<string, Container>();
  private sprites = new Map<string, Sprite>();
  private texturas = new Map<string, Texture>();
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

  /** Chamado quando um asset da biblioteca é solto no cenário. */
  aoSoltarAsset: (caminhoRaiz: string, sx: number, sy: number) => void = () => {};

  constructor(private el: HTMLElement, private estado: Estado, private plat: Plataforma) {}

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
    this.app.stage.addChild(this.fundoFase, this.raizCamadas, this.grade, this.overlay, this.fantasma);

    this.estado.on('fase', () => this.sincronizar());
    this.estado.on('selecao', () => (this.chaveCamera = ''));
    this.estado.on('opcoes', () => { this.chaveCamera = ''; this.sincronizar(); });
    this.app.ticker.add(() => this.quadro());
    this.ligarEventos();
    this.sincronizar();
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

  /** Arma o carimbo. escala = tamanho com que o objeto vai entrar (0 = automático: lembrado ou cabendo na tela). */
  armarCarimbo(caminhoRaiz: string | null, escala = 0) {
    if (!caminhoRaiz) { this.carimbo = null; this.fantasma.visible = false; this.app.canvas.style.cursor = ''; return; }
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
    return { x: Math.round(x), y: Math.round(y) };
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
      this.aplicarObjeto(sp, o);
      this.conteineres.get(o.camada)?.addChild(sp);
    }
    for (const [id, sp] of this.sprites) if (!ids.has(id)) { sp.destroy(); this.sprites.delete(id); }

    this.chaveCamera = '';
  }

  private aplicarObjeto(sp: Sprite, o: ObjetoFase) {
    const tex = this.texturas.get(o.asset);
    if (tex) sp.texture = tex;
    else {
      sp.texture = Texture.EMPTY;
      this.textura(o.asset)
        .then(() => this.sincronizar())
        .catch(() => this.estado.avisar(`Não consegui carregar: ${o.asset}`));
    }
    // Sprite com âncora central; o objeto guarda o canto superior esquerdo
    const tw = sp.texture === Texture.EMPTY ? o.w : sp.texture.width;
    const th = sp.texture === Texture.EMPTY ? o.h : sp.texture.height;
    sp.scale.set((o.escala * o.w / tw) * (o.espelharX ? -1 : 1), (o.escala * o.h / th) * (o.espelharY ? -1 : 1));
    sp.position.set(o.x + (o.w * o.escala) / 2, o.y + (o.h * o.escala) / 2);
    sp.angle = o.rotacao;
    sp.alpha = o.opacidade;
    sp.visible = o.visivel;
  }

  // ---------- Quadro a quadro ----------

  private quadro() {
    const { x, y, zoom } = this.estado.camera;
    for (const c of this.estado.fase.camadas) {
      const cont = this.conteineres.get(c.id);
      if (!cont) continue;
      const d = this.deslocamento(c.id);
      cont.position.set(Math.round((d.x - x) * zoom), Math.round((d.y - y) * zoom));
      cont.scale.set(zoom);
    }
    const { w, h } = this.tamanhoTela();
    const chave = `${x},${y},${zoom},${this.estado.fase.objetos.length},${this.estado.fase.objetos.reduce((n, o) => n + (o.tipo === 'interativo' ? o.x + o.y * 7 + o.escala * 13 : 0), 0)},${this.estado.previaParallax},${JSON.stringify(this.estado.fase.camadas)},${this.estado.fase.resolucaoBase},${w},${h},${this.estado.grade},${this.hover},${this.estado.selecionado},${JSON.stringify(this.estado.objetoSelecionado() ?? '')},${this.estado.fase.tamanho},${this.estado.fase.corFundo}`;
    if (this.carimbo) this.atualizarFantasma();
    if (chave === this.chaveCamera) return;
    this.chaveCamera = chave;
    this.desenharFundo();
    this.desenharGrade(w, h);
    this.desenharOverlay();
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
    if (!this.estado.grade) return;
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
    // Marcador dos objetos interativos (losango lima no canto superior esquerdo)
    for (const o of this.estado.fase.objetos) {
      if (o.tipo !== 'interativo' || !o.visivel || this.estado.camada(o.camada)?.visivel === false) continue;
      const r = this.retanguloTela(o);
      const mx = Math.round(r.x), my = Math.round(r.y), t = 4;
      g.poly([mx, my - t, mx + t, my, mx, my + t, mx - t, my]).fill({ color: COR_SELECAO }).stroke({ width: 1, color: 0x083933 });
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

  /** Canto (alça) sob o ponto, se houver objeto selecionado. */
  private sobreAlca(sx: number, sy: number): Canto | null {
    const sel = this.estado.objetoSelecionado();
    if (!sel) return null;
    const r = this.retanguloTela(sel);
    const perto = (ax: number, ay: number) => Math.abs(sx - ax) <= TAM_ALCA && Math.abs(sy - ay) <= TAM_ALCA;
    if (perto(r.x + r.w, r.y + r.h)) return 'se';
    if (perto(r.x, r.y)) return 'no';
    if (perto(r.x + r.w, r.y)) return 'ne';
    if (perto(r.x, r.y + r.h)) return 'so';
    return null;
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

  private ligarEventos() {
    const cv = this.app.canvas;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      const p = this.posMouse(e);
      const cam = this.estado.camera;
      if (e.button === 1 || (e.button === 0 && this.espacoPressionado)) {
        this.arraste = { tipo: 'pan', sx: p.x, sy: p.y, cx: cam.x, cy: cam.y };
        cv.style.cursor = 'grabbing';
        return;
      }
      if (e.button === 2 && this.carimbo) { this.cancelarCarimbo(); return; }
      if (e.button !== 0) return;
      if (this.carimbo) {
        const caminho = this.carimbo.caminho;
        const escala = this.carimbo.escala;
        if (!e.shiftKey) this.cancelarCarimbo(true); // um clique = um objeto (Shift mantém o carimbo)
        this.aoCarimbar(caminho, p.x, p.y, escala);
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

    cv.addEventListener('pointermove', (e) => {
      const p = this.posMouse(e);
      const cam = this.estado.camera;
      this.mouseMundo = { x: Math.floor(p.x / cam.zoom + cam.x), y: Math.floor(p.y / cam.zoom + cam.y) };
      this.mouseTela = p;
      this.estado.emit('camera');
      const a = this.arraste;
      if (this.carimbo && !a) { this.atualizarFantasma(); return; }
      if (!a) {
        this.hover = this.objetoEm(p.x, p.y)?.id ?? null;
        const canto = this.sobreAlca(p.x, p.y);
        cv.style.cursor = this.espacoPressionado ? 'grab' : canto ? (canto === 'se' || canto === 'no' ? 'nwse-resize' : 'nesw-resize') : this.hover ? 'move' : '';
        return;
      }
      if (a.tipo === 'pan') {
        cam.x = a.cx - (p.x - a.sx) / cam.zoom;
        cam.y = a.cy - (p.y - a.sy) / cam.zoom;
        return;
      }
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
        o.x = Math.round(nx);
        o.y = Math.round(ny);
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
      if (a?.tipo === 'pan') cv.style.cursor = this.espacoPressionado ? 'grab' : '';
      if (a?.tipo === 'escala') {
        this.mostrarLegenda(null);
        const o = this.estado.objeto(a.id);
        if (a.mexeu && o) this.aoEscalar(o);
      }
      this.arraste = null;
    };
    cv.addEventListener('pointerup', soltar);
    cv.addEventListener('pointercancel', soltar);
    cv.addEventListener('pointerleave', () => { this.hover = null; this.mouseTela = null; this.fantasma.visible = false; });

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
