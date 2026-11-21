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
  parar: svg('<rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor"/>'),
  inimigo: svg('<path d="M8 2.5c-3 0-5 2-5 4.6 0 1.6.8 2.8 2 3.5V13h6v-2.4c1.2-.7 2-1.9 2-3.5 0-2.6-2-4.6-5-4.6z"/><circle cx="6" cy="7.5" r="1" fill="currentColor"/><circle cx="10" cy="7.5" r="1" fill="currentColor"/><path d="M7 13v-1.5M9 13v-1.5"/>'),
  hud: svg('<rect x="1.5" y="3" width="13" height="10" rx="1.5"/><path d="M3.5 11h3M3.5 5.5h2M11 5.5h1.5"/>'),
  pasta: svg('<path d="M2 4.5V12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3H3a1 1 0 0 0-1 1.5z"/>'),
  novo: svg('<path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6z"/><path d="M9 2v4h4M8 8.5v3M6.5 10h3"/>'),
  cursor: svg('<path d="M3 2l9.5 5.2-4.2 1.1L6.6 12.5z"/><path d="M8.6 8.4l3.4 4.1"/>'),
  colisao: svg('<rect x="2" y="9" width="12" height="5" rx="0.5"/><path d="M4 9l-1 2M7 9l-2 5M10 9l-2 5M13 9l-2 5"/><path d="M8 2v4M6 4.5L8 6.5l2-2"/>'),
  bandeira: svg('<path d="M4 14V2"/><path d="M4 2.5h7.5l-1.8 2.7 1.8 2.8H4"/>'),
  brilho: svg('<path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M3.4 3.4l2 2M10.6 10.6l2 2M3.4 12.6l2-2M10.6 5.4l2-2"/>'),
  verColisao: svg('<rect x="2" y="9" width="12" height="5" rx="0.5"/><path d="M4 9l-1 2M7 9l-2 5M10 9l-2 5M13 9l-2 5"/><circle cx="8" cy="4.5" r="2"/>'),
  mao: svg('<path d="M5.5 8V3.8a1 1 0 0 1 2 0V7.5M7.5 7V2.8a1 1 0 0 1 2 0V7.2M9.5 7.2V3.6a1 1 0 0 1 2 0V9c0 3-1.8 5-4.4 5-2 0-3-1-4.2-3L1.7 9a1 1 0 0 1 1.6-1.1L5.5 10"/>'),
  elementos: svg('<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><path d="M11.5 9v5M9 11.5h5"/>'),
  bloco: svg('<rect x="2.5" y="4" width="11" height="8" rx="0.5"/>'),
  rampaDireita: svg('<path d="M2.5 13h11V3.5z"/>'),
  rampaEsquerda: svg('<path d="M13.5 13h-11V3.5z"/>'),
  poligono: svg('<path d="M8 2l5.5 4-2 7h-7l-2-7z"/>'),
  linha: svg('<path d="M2 12l4-5 3 3 5-6"/><circle cx="2" cy="12" r="1"/><circle cx="6" cy="7" r="1"/><circle cx="9" cy="10" r="1"/><circle cx="14" cy="4" r="1"/>'),
  maoLivre: svg('<path d="M2 11c1.5-3 3-4 4-2s1.5 3 3 1 2-5 5-4"/>'),
  personagem: svg('<circle cx="8" cy="3.8" r="2"/><path d="M8 6v4.5M8 10.5l-2.5 3.5M8 10.5l2.5 3.5M4.5 8l3.5-1.5 3.5 1.5"/>'),
  zona: svg('<rect x="2.5" y="3.5" width="11" height="9" rx="1" stroke-dasharray="2 1.6"/><path d="M8 6v4M6 8h4"/>'),
  luz: svg('<circle cx="8" cy="7" r="3"/><path d="M8 1.5v1.5M8 11v1.5M2.5 7H4M12 7h1.5M4.1 3.1l1 1M10.9 3.1l-1 1M6.5 14h3"/>'),
  mapa: svg('<rect x="1.5" y="2" width="5.5" height="3.5" rx=".5"/><rect x="9" y="10.5" width="5.5" height="3.5" rx=".5"/><path d="M7 3.75h1.5a1.5 1.5 0 0 1 1.5 1.5v1.25M10 9.5v1"/><path d="M10 6.5l1.25 1.5L10 9.5 8.75 8z"/>'),
  codigo: svg('<path d="M5.5 4L2 8l3.5 4M10.5 4L14 8l-3.5 4M9 2.5l-2 11"/>'),
  controle: svg('<path d="M4.5 4.5h7a3 3 0 0 1 3 3v1.5a2.5 2.5 0 0 1-4.4 1.6l-.6-.6H6.5l-.6.6A2.5 2.5 0 0 1 1.5 9V7.5a3 3 0 0 1 3-3z"/><path d="M4.5 6.5v2.5M3.25 7.75h2.5"/><circle cx="10.5" cy="7" r=".4"/><circle cx="12" cy="8.5" r=".4"/>'),
  salvar: svg('<path d="M3 2h8l3 3v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M5 2v3.5h5V2M5 14V9.5h6V14"/>'),
};

export function icone(nome: keyof typeof ICONES): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = 'ico';
  s.innerHTML = ICONES[nome];
  return s;
}
