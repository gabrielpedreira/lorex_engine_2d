// Legendas (tooltips) ricas: título, explicação e atalho, ao passar o mouse.
// Uso: dica(elemento, 'Título', 'Explicação de como usar', 'Atalho').
// Elementos que só têm o atributo title também ganham a legenda (o title é convertido).

export function dica(el: HTMLElement, titulo: string, texto?: string, atalho?: string) {
  el.dataset.legTitulo = titulo;
  if (texto) el.dataset.legTexto = texto; else delete el.dataset.legTexto;
  if (atalho) el.dataset.legAtalho = atalho; else delete el.dataset.legAtalho;
  if (!el.getAttribute('aria-label') && !el.textContent?.trim()) el.setAttribute('aria-label', titulo);
  el.removeAttribute('title');
  return el;
}

const ATRASO_MS = 450;

export class Legendas {
  private caixa: HTMLDivElement;
  private timer = 0;
  private alvo: HTMLElement | null = null;
  private chaveCena = '';

  constructor() {
    this.caixa = document.createElement('div');
    this.caixa.className = 'legenda';
    this.caixa.setAttribute('role', 'tooltip');
    this.caixa.hidden = true;
    document.body.append(this.caixa);

    document.addEventListener('mouseover', (e) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-leg-titulo], [title]');
      if (!el || el === this.alvo) return;
      if (el.hasAttribute('title')) {
        // Converte o title nativo para a legenda da engine (evita as duas aparecerem)
        const t = el.getAttribute('title') ?? '';
        el.removeAttribute('title');
        if (!el.dataset.legTitulo) {
          const m = /^(.*?)\s*\(([^()]{1,24})\)\s*(?::\s*(.*))?$/.exec(t);
          if (m && !m[3]) { el.dataset.legTitulo = m[1]; el.dataset.legAtalho = m[2]; }
          else el.dataset.legTitulo = t;
        }
      }
      this.alvo = el;
      this.agendar(() => this.mostrarElemento(el));
    });
    document.addEventListener('mouseout', (e) => {
      if (!this.alvo) return;
      const para = e.relatedTarget as Node | null;
      if (para && this.alvo.contains(para)) return;
      this.alvo = null;
      this.esconder();
    });
    for (const ev of ['mousedown', 'keydown', 'wheel', 'scroll'] as const) {
      document.addEventListener(ev, () => { this.alvo = null; this.chaveCena = ''; this.esconder(); }, { capture: true, passive: true });
    }
  }

  /** Legenda de algo do cenário (canvas). info null = esconder. (cx, cy) = posição do mouse na janela. */
  mostrarNaCena(info: { titulo: string; texto: string } | null, cx: number, cy: number) {
    if (!info) { if (this.chaveCena) { this.chaveCena = ''; this.esconder(); } return; }
    const chave = info.titulo + info.texto;
    if (chave === this.chaveCena) { if (!this.caixa.hidden) this.posicionar(cx + 16, cy + 18); return; }
    this.chaveCena = chave;
    this.esconder();
    this.agendar(() => { this.preencher(info.titulo, info.texto); this.posicionar(cx + 16, cy + 18); });
  }

  private agendar(fn: () => void) {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(fn, ATRASO_MS);
  }

  private esconder() {
    clearTimeout(this.timer);
    this.caixa.hidden = true;
  }

  private preencher(titulo: string, texto?: string, atalho?: string) {
    this.caixa.replaceChildren();
    const cab = document.createElement('div');
    cab.className = 'legenda-cab';
    const t = document.createElement('strong');
    t.textContent = titulo;
    cab.append(t);
    if (atalho) {
      const k = document.createElement('kbd');
      k.textContent = atalho;
      cab.append(k);
    }
    this.caixa.append(cab);
    if (texto) {
      const p = document.createElement('p');
      p.textContent = texto;
      this.caixa.append(p);
    }
    this.caixa.hidden = false;
  }

  private mostrarElemento(el: HTMLElement) {
    if (!el.isConnected || !el.dataset.legTitulo) return;
    this.preencher(el.dataset.legTitulo, el.dataset.legTexto, el.dataset.legAtalho);
    const r = el.getBoundingClientRect();
    // Barra lateral de ferramentas: legenda à direita; demais: abaixo
    if (el.closest('.trilho-ferramentas')) this.posicionar(r.right + 10, r.top);
    else this.posicionar(r.left, r.bottom + 8);
  }

  private posicionar(x: number, y: number) {
    const c = this.caixa;
    const w = c.offsetWidth, h = c.offsetHeight;
    const nx = Math.max(8, Math.min(x, window.innerWidth - w - 8));
    const ny = y + h > window.innerHeight - 8 ? Math.max(8, y - h - 30) : y;
    c.style.left = `${Math.round(nx)}px`;
    c.style.top = `${Math.round(ny)}px`;
  }
}
