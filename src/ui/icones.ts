// Ícones SVG simples (traço 1.5px, 16×16), sem dependências.
const svg = (corpo: string) =>
  `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${corpo}</svg>`;

export const ICONES = {
  olho: svg('<path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="1.8"/>'),
  olhoFechado: svg('<path d="M2 2l12 12"/><path d="M6.3 3.8A6 6 0 0 1 8 3.5c4.1 0 6.5 4.5 6.5 4.5a11 11 0 0 1-1.9 2.4M10.2 12A6 6 0 0 1 8 12.5C3.9 12.5 1.5 8 1.5 8a11 11 0 0 1 2.2-2.7"/>'),
  cadeado: svg('<rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>'),
  cadeadoAberto: svg('<rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.8-1"/>'),
  desfazer: svg('<path d="M5 3L2 6l3 3"/><path d="M2 6h7.5a4 4 0 0 1 0 8H7"/>'),
  refazer: svg('<path d="M11 3l3 3-3 3"/><path d="M14 6H6.5a4 4 0 0 0 0 8H9"/>'),
  grade: svg('<path d="M2 5.5h12M2 10.5h12M5.5 2v12M10.5 2v12"/><rect x="2" y="2" width="12" height="12" rx="1"/>'),
  ima: svg('<path d="M4 2v6a4 4 0 0 0 8 0V2"/><path d="M4 5h2.5M9.5 5H12M6.5 2v6a1.5 1.5 0 0 0 3 0V2"/>'),
  camadas: svg('<path d="M8 2l6 3-6 3-6-3z"/><path d="M2 8l6 3 6-3"/><path d="M2 11l6 3 6-3"/>'),
  enquadrar: svg('<path d="M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3"/>'),
  play: svg('<path d="M5 3l8 5-8 5z"/>'),
  pasta: svg('<path d="M2 4.5V12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3H3a1 1 0 0 0-1 1.5z"/>'),
  novo: svg('<path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6z"/><path d="M9 2v4h4M8 8.5v3M6.5 10h3"/>'),
  cursor: svg('<path d="M3 2l9.5 5.2-4.2 1.1L6.6 12.5z"/><path d="M8.6 8.4l3.4 4.1"/>'),
  colisao: svg('<rect x="2" y="9" width="12" height="5" rx="0.5"/><path d="M4 9l-1 2M7 9l-2 5M10 9l-2 5M13 9l-2 5"/><path d="M8 2v4M6 4.5L8 6.5l2-2"/>'),
  bandeira: svg('<path d="M4 14V2"/><path d="M4 2.5h7.5l-1.8 2.7 1.8 2.8H4"/>'),
  brilho: svg('<path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M3.4 3.4l2 2M10.6 10.6l2 2M3.4 12.6l2-2M10.6 5.4l2-2"/>'),
  verColisao: svg('<rect x="2" y="9" width="12" height="5" rx="0.5"/><path d="M4 9l-1 2M7 9l-2 5M10 9l-2 5M13 9l-2 5"/><circle cx="8" cy="4.5" r="2"/>'),
  salvar: svg('<path d="M3 2h8l3 3v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M5 2v3.5h5V2M5 14V9.5h6V14"/>'),
};

export function icone(nome: keyof typeof ICONES): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = 'ico';
  s.innerHTML = ICONES[nome];
  return s;
}
