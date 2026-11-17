// Área do cenário: desenha a fase com PixiJS e trata mouse (selecionar, mover, redimensionar, zoom, pan).
import 'pixi.js/unsafe-eval';
import { Application, Assets, Container, Graphics, Sprite, Texture, TextureStyle } from 'pixi.js';
import type { ObjetoFase } from '../core/tipos';
import { urlAsset, type Plataforma } from '../plataforma/plataforma';
import type { Estado } from './estado';

// Pixel art: nunca suavizar ao ampliar
TextureStyle.defaultOptions.scaleMode = 'nearest';

export const NIVEIS_ZOOM = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16];
const TAM_ALCA = 8;
const COR_SELECAO = 0xa7dd3e; // lima da logo
const COR_TELA_JOGO = 0xf89715; // laranja da logo

type Arraste =
  | { tipo: 'pan'; sx: number; sy: number; cx: number; cy: number }
  | { tipo: 'mover'; id: string; dx: number; dy: number; mexeu: boolean }
  | { tipo: 'escala'; id: string; mexeu: boolean };

export class Viewport {
  readonly app = new Application();
  private fundoFase = new Graphics();
  private raizCamadas = new Container();
  private grade = new Graphics();
  private overlay = new Graphics();
  private conteineres = new Map<string, Container>();
  private sprites = new Map<string, Sprite>();
  private texturas = new Map<string, Texture>();
  private arraste: Arraste | null = null;
  private espacoPressionado = false;
  private chaveCamera = '';
  private hover: string | null = null;
  /** Posição do mouse no mundo (parallax 1), para a barra de status. */
  mouseMundo = { x: 0, y: 0 };

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
    this.app.stage.addChild(this.fundoFase, this.raizCamadas, this.grade, this.overlay);

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

  // ---------- Texturas ----------

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
    const chave = `${x},${y},${zoom},${this.estado.previaParallax},${JSON.stringify(this.estado.fase.camadas)},${this.estado.fase.resolucaoBase},${w},${h},${this.estado.grade},${this.hover},${this.estado.selecionado},${JSON.stringify(this.estado.objetoSelecionado() ?? '')},${this.estado.fase.tamanho},${this.estado.fase.corFundo}`;
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
    const sel = this.estado.objetoSelecionado();
    if (sel && this.estado.camada(sel.camada)?.visivel !== false) {
      const r = this.retanguloTela(sel);
      g.rect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w), Math.round(r.h))
        .stroke({ width: 1, color: COR_SELECAO });
      const ax = r.x + r.w - TAM_ALCA / 2;
      const ay = r.y + r.h - TAM_ALCA / 2;
      g.rect(ax, ay, TAM_ALCA, TAM_ALCA).fill({ color: 0xffffff }).stroke({ width: 1, color: COR_SELECAO });
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

  private sobreAlca(sx: number, sy: number) {
    const sel = this.estado.objetoSelecionado();
    if (!sel) return false;
    const r = this.retanguloTela(sel);
    return Math.abs(sx - (r.x + r.w)) <= TAM_ALCA && Math.abs(sy - (r.y + r.h)) <= TAM_ALCA;
  }

  private posMouse(e: MouseEvent) {
    const r = this.app.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
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
      if (e.button !== 0) return;
      const sel = this.estado.objetoSelecionado();
      if (sel && this.sobreAlca(p.x, p.y)) {
        this.arraste = { tipo: 'escala', id: sel.id, mexeu: false };
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
      this.estado.emit('camera');
      const a = this.arraste;
      if (!a) {
        this.hover = this.objetoEm(p.x, p.y)?.id ?? null;
        cv.style.cursor = this.espacoPressionado ? 'grab' : this.sobreAlca(p.x, p.y) ? 'nwse-resize' : this.hover ? 'move' : '';
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
        // Redimensiona mantendo a proporção. Passos de 0,25 (Shift = livre).
        const bruta = Math.max((lp.x - o.x) / o.w, (lp.y - o.y) / o.h);
        const passo = e.shiftKey ? 0.01 : 0.25;
        o.escala = Math.max(passo, Math.round(bruta / passo) * passo);
      }
      this.estado.marcarAlterado();
    });

    const soltar = () => {
      if (this.arraste?.tipo === 'pan') cv.style.cursor = this.espacoPressionado ? 'grab' : '';
      this.arraste = null;
    };
    cv.addEventListener('pointerup', soltar);
    cv.addEventListener('pointercancel', soltar);
    cv.addEventListener('pointerleave', () => { this.hover = null; });

    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = this.posMouse(e);
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
