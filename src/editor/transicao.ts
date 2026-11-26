// Tela de TRANSIÇÃO entre salas (Mapa › losango): corte seco, escurecer ou tela cheia animada (a porta se
// abrindo enquanto a próxima sala carrega, estilo Resident Evil clássico), com som opcional.
// Cobre a janela inteira enquanto o editor troca de fase por baixo. Também é usada na pré-visualização do Mapa.
import { duracaoFolha, quadroDaFolha, retanguloFolha } from '../core/folha';
import type { Transicao } from '../core/mapa';
import { LOG } from '../core/log';
import { el } from '../ui/dom';

const FADE = 0.3; // s

const esperar = (s: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, s * 1000)));

export class TelaTransicao {
  private raiz: HTMLElement;
  private canvas: HTMLCanvasElement;
  private texto: HTMLElement;
  private inicio = 0;
  private atual: Transicao | null = null;
  private img: HTMLImageElement | null = null;
  private raf = 0;
  private audio: HTMLAudioElement | null = null;

  /** url = endereço de um arquivo relativo a jogo/. */
  constructor(private url: (caminhoJogo: string) => string) {
    this.canvas = el('canvas', { class: 'transicao-anim' }) as HTMLCanvasElement;
    this.texto = el('div', { class: 'transicao-texto' });
    this.raiz = el('div', { class: 'tela-transicao', 'aria-hidden': 'true' }, this.canvas, this.texto);
    this.raiz.hidden = true;
    document.body.append(this.raiz);
  }

  get ativa() { return !this.raiz.hidden; }

  /** Durante o ▶ Testar a transição acontece só no quadro da tela do jogo (dentro do cenário); sem quadro, na janela. */
  noQuadro(pai: HTMLElement | null, r?: { x: number; y: number; w: number; h: number }) {
    if (pai && r) {
      if (this.raiz.parentElement !== pai) pai.append(this.raiz);
      this.raiz.classList.add('no-jogo');
      Object.assign(this.raiz.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    } else {
      if (this.raiz.parentElement !== document.body) document.body.append(this.raiz);
      this.raiz.classList.remove('no-jogo');
      Object.assign(this.raiz.style, { left: '', top: '', width: '', height: '' });
    }
  }

  /** Começa a transição: toca o som e cobre a tela (instantâneo no corte, com fade nos outros). */
  async cobrir(t: Transicao) {
    this.atual = t;
    this.tocarSom(t);
    this.raiz.style.background = t.cor;
    this.texto.textContent = t.efeito === 'tela' ? t.texto : '';
    this.canvas.hidden = true;
    this.raiz.style.transition = 'none';
    this.raiz.style.opacity = t.efeito === 'corte' ? '1' : '0';
    this.raiz.hidden = false;
    if (t.efeito !== 'corte') {
      void this.raiz.offsetWidth; // aplica a opacidade 0 antes do fade
      this.raiz.style.transition = `opacity ${FADE}s ease`;
      this.raiz.style.opacity = '1';
      await esperar(FADE);
    }
    this.inicio = performance.now() / 1000;
    if (t.efeito === 'tela' && t.animacao) await this.iniciarAnimacao(t);
  }

  /** Termina: espera o tempo mínimo (e a animação) e mostra a sala nova. */
  async descobrir() {
    const t = this.atual;
    if (!t) { this.raiz.hidden = true; return; }
    const anim = t.efeito === 'tela' && t.anim && this.img ? duracaoFolha(t.anim) : 0;
    const minimo = t.efeito === 'corte' ? 0 : Math.max(t.duracao, anim);
    await esperar(minimo - (performance.now() / 1000 - this.inicio));
    if (t.efeito !== 'corte') {
      this.raiz.style.transition = `opacity ${FADE}s ease`;
      this.raiz.style.opacity = '0';
      await esperar(FADE);
    }
    cancelAnimationFrame(this.raf);
    this.raiz.hidden = true;
    this.atual = null;
    this.img = null;
  }

  /** Pré-visualização (Mapa): cobre, espera e descobre. */
  async previa(t: Transicao) {
    if (this.ativa) return;
    await this.cobrir(t);
    await this.descobrir();
  }

  private tocarSom(t: Transicao) {
    if (!t.som) return;
    try {
      this.audio?.pause();
      this.audio = new Audio(this.url(t.som));
      this.audio.volume = t.volume;
      void this.audio.play().catch((err) => LOG.add({ cat: 'erro', texto: `Transição: não consegui tocar o som ${t.som} (${String(err)})` }));
    } catch (err) { LOG.add({ cat: 'erro', texto: `Transição: som ${t.som}: ${String(err)}` }); }
  }

  private async iniciarAnimacao(t: Transicao) {
    const img = new Image();
    img.src = this.url(t.animacao);
    try { await img.decode(); } catch { LOG.add({ cat: 'erro', texto: `Transição: não consegui carregar a animação ${t.animacao}` }); return; }
    this.img = img;
    this.canvas.hidden = false;
    this.inicio = performance.now() / 1000;
    const a = t.anim ?? { quadros: 1, colunas: 1, fps: 1, modo: 'umaVez' as const, folha: [img.naturalWidth, img.naturalHeight] as [number, number] };
    const fx = img.naturalWidth / a.folha[0], fy = img.naturalHeight / a.folha[1];
    const desenhar = () => {
      if (!this.img) return;
      const r = retanguloFolha(a, quadroDaFolha(a, performance.now() / 1000 - this.inicio, false));
      const sw = r.w * fx, sh = r.h * fy;
      // Escala inteira quando cabe (pixel art nítida); senão, o que couber
      const W = window.innerWidth, H = window.innerHeight;
      const caber = Math.min(W / sw, H / sh);
      const esc = caber >= 1 ? Math.floor(caber) : caber;
      const dw = Math.round(sw * esc), dh = Math.round(sh * esc);
      if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
      const ctx = this.canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(img, r.x * fx, r.y * fy, sw, sh, Math.round((W - dw) / 2), Math.round((H - dh) / 2), dw, dh);
      this.raf = requestAnimationFrame(desenhar);
    };
    desenhar();
  }
}
