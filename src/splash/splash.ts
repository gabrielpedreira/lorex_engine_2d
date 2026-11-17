// Splash de inicialização: logo, status de carregamento, créditos e licença.
// O processo principal chama window.definirStatus("...") a cada etapa do carregamento.
import './splash.css';

const PALETA = ['#135f4d', '#2ca782', '#65da67', '#a7dd3e', '#f89715'];

declare global {
  interface Window { definirStatus?: (texto: string) => void }
}

const params = new URLSearchParams(location.search);
document.getElementById('versao')!.textContent = params.get('versao') ?? import.meta.env.VITE_VERSAO ?? '0.0.0';
document.getElementById('ano')!.textContent = String(new Date().getFullYear());

const status = document.getElementById('status')!;
const barra = document.getElementById('progresso-barra')!;
let etapas = 0;
const ETAPAS_ESPERADAS = 5;

window.definirStatus = (texto: string) => {
  status.textContent = texto;
  etapas++;
  barra.style.width = `${Math.min(100, 12 + (etapas / ETAPAS_ESPERADAS) * 88)}%`;
};

// Mosaico de pixels decorativo à direita (determinístico, sempre igual)
function desenharPixels() {
  const cv = document.querySelector<HTMLCanvasElement>('.pixels')!;
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w * dpr; cv.height = h * dpr;
  const g = cv.getContext('2d')!;
  g.scale(dpr, dpr);
  let semente = 20261116;
  const aleatorio = () => ((semente = (semente * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const t = 16;
  const colunas = Math.ceil(w / t), linhas = Math.ceil(h / t);
  for (let cx = 0; cx < colunas; cx++) {
    for (let cy = 0; cy < linhas; cy++) {
      // densidade cresce para a direita e nas bordas superior/inferior
      const fx = cx / colunas;
      const fy = Math.abs(cy / linhas - 0.5) * 2;
      const densidade = Math.pow(fx, 2.2) * (0.55 + 0.45 * fy);
      if (aleatorio() > densidade) continue;
      const cor = PALETA[Math.min(PALETA.length - 1, Math.floor(aleatorio() * (fx > 0.85 ? 5 : 4)))];
      g.globalAlpha = 0.35 + 0.65 * fx;
      g.fillStyle = cor;
      g.fillRect(cx * t + 1, cy * t + 1, t - 2, t - 2);
    }
  }
}
desenharPixels();
