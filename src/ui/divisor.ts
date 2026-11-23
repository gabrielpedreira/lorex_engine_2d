// Divisores arrastáveis entre áreas (editor, Código, Mapa, Personagens…). Passar o mouse na linha mostra a seta de
// redimensionar; arrastar muda o tamanho da área (guardado numa variável CSS) e o tamanho fica salvo no computador.
// Duplo clique volta ao tamanho padrão.
import { dica } from './legenda';

const CHAVE = 'lorex.divisores';

function lerTamanhos(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(CHAVE) ?? '{}') as Record<string, number>; } catch { return {}; }
}
function salvarTamanho(id: string, v: number | null) {
  try {
    const t = lerTamanhos();
    if (v === null) delete t[id]; else t[id] = Math.round(v);
    localStorage.setItem(CHAVE, JSON.stringify(t));
  } catch { /* sem armazenamento */ }
}

export interface OpcoesDivisor {
  /** Nome para salvar o tamanho (único). */
  id: string;
  /** x = divisor vertical (muda largura); y = divisor horizontal (muda altura). */
  eixo: 'x' | 'y';
  /** Elemento que recebe a variável CSS. */
  alvo: HTMLElement;
  /** Variável CSS (ex.: "--larg-esq"). */
  variavel: string;
  padrao: number;
  min: number;
  /** Máximo (pode depender do tamanho da janela). */
  max: () => number;
  /** 1 = arrastar para a direita/baixo aumenta; -1 = arrastar para a esquerda/cima aumenta. */
  sentido: 1 | -1;
  /** Onde fica a linha dentro do elemento pai: 'fim' (direita/baixo) ou 'inicio' (esquerda/cima). */
  lado: 'inicio' | 'fim';
  titulo: string;
  /** Avisar depois de mudar (ex.: o editor de código refaz o layout). */
  aoMudar?: () => void;
}

/** Cria a alça (o pai precisa de position: relative) e aplica o tamanho salvo. */
export function divisor(o: OpcoesDivisor): HTMLElement {
  const alca = document.createElement('div');
  alca.className = `divisor divisor-${o.eixo} divisor-${o.lado}`;
  alca.setAttribute('role', 'separator');
  alca.setAttribute('aria-orientation', o.eixo === 'x' ? 'vertical' : 'horizontal');
  alca.setAttribute('aria-label', o.titulo);
  dica(alca, o.titulo, 'Arraste para mudar o tamanho. Duplo clique volta ao tamanho padrão.');
  const aplicar = (v: number) => {
    const n = Math.max(o.min, Math.min(o.max(), v));
    o.alvo.style.setProperty(o.variavel, `${Math.round(n)}px`);
    return n;
  };
  let atual = aplicar(lerTamanhos()[o.id] ?? o.padrao);
  alca.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    alca.setPointerCapture(e.pointerId);
    alca.classList.add('arrastando');
    document.body.classList.add(o.eixo === 'x' ? 'redimensionando-x' : 'redimensionando-y');
    const p0 = o.eixo === 'x' ? e.clientX : e.clientY, v0 = atual;
    const mover = (m: PointerEvent) => {
      const d = (o.eixo === 'x' ? m.clientX : m.clientY) - p0;
      atual = aplicar(v0 + d * o.sentido);
      o.aoMudar?.();
    };
    const soltar = () => {
      alca.removeEventListener('pointermove', mover);
      alca.removeEventListener('pointerup', soltar);
      alca.classList.remove('arrastando');
      document.body.classList.remove('redimensionando-x', 'redimensionando-y');
      salvarTamanho(o.id, atual);
      o.aoMudar?.();
    };
    alca.addEventListener('pointermove', mover);
    alca.addEventListener('pointerup', soltar);
  });
  alca.addEventListener('dblclick', () => { atual = aplicar(o.padrao); salvarTamanho(o.id, null); o.aoMudar?.(); });
  // A janela diminuiu: respeita o máximo novo
  window.addEventListener('resize', () => { atual = aplicar(atual); });
  return alca;
}

/**
 * Telas em colunas (Personagens, HUD…: .pers-colunas com 3 colunas) são refeitas a cada mudança; um observador põe as
 * alças nas colunas da esquerda e da direita sempre que uma tela dessas aparece.
 */
export function ligarDivisoresAutomaticos() {
  const ligar = (cont: HTMLElement) => {
    if (cont.dataset.divisores) return;
    const cols = [...cont.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.classList.contains('pers-col'));
    if (cols.length !== 3) return;
    cont.dataset.divisores = '1';
    const tela = cont.closest('[aria-label]')?.getAttribute('aria-label') ?? 'tela';
    const esq = divisor({ id: `${tela}-esquerda`, eixo: 'x', alvo: cont, variavel: '--pers-esq', padrao: 230, min: 160, max: () => window.innerWidth * 0.4, sentido: 1, lado: 'fim', titulo: 'Largura da coluna da esquerda' });
    const dir = divisor({ id: `${tela}-direita`, eixo: 'x', alvo: cont, variavel: '--pers-dir', padrao: 340, min: 220, max: () => window.innerWidth * 0.5, sentido: -1, lado: 'inicio', titulo: 'Largura da coluna da direita' });
    esq.classList.add('divisor-esq'); dir.classList.add('divisor-dir');
    cont.append(esq, dir);
  };
  const varrer = (raiz: ParentNode) => raiz.querySelectorAll<HTMLElement>('.pers-colunas').forEach(ligar);
  varrer(document);
  new MutationObserver((ms) => {
    for (const m of ms) for (const n of m.addedNodes) {
      if (!(n instanceof HTMLElement)) continue;
      if (n.classList.contains('pers-colunas')) ligar(n);
      varrer(n);
    }
  }).observe(document.body, { childList: true, subtree: true });
}
