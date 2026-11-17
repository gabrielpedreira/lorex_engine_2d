// Efeitos visuais dos objetos. Funções puras: o editor usa para a prévia e o jogo vai usar as mesmas.

export interface EfeitoPulsar { tipo: 'pulsar'; /** 0–0,5: quanto cresce (0,12 = 12%) */ intensidade: number; /** pulsos por segundo */ velocidade: number }
export interface EfeitoBrilhar { tipo: 'brilhar'; cor: string; /** tamanho do halo em px */ raio: number; /** 0–1 */ intensidade: number; /** o brilho pulsa? */ pulsar: boolean; velocidade: number }
export interface EfeitoFlutuar { tipo: 'flutuar'; /** px para cima e para baixo */ amplitude: number; /** ciclos por segundo */ velocidade: number }
export interface EfeitoPiscar { tipo: 'piscar'; /** segundos entre aceso e apagado */ intervalo: number; /** opacidade quando "apagado" (0–1) */ minimo: number }

export type Efeito = EfeitoPulsar | EfeitoBrilhar | EfeitoFlutuar | EfeitoPiscar;
export type TipoEfeito = Efeito['tipo'];

export const EFEITOS_PADRAO: { [K in TipoEfeito]: Extract<Efeito, { tipo: K }> } = {
  pulsar: { tipo: 'pulsar', intensidade: 0.12, velocidade: 1.2 },
  brilhar: { tipo: 'brilhar', cor: '#fff3a0', raio: 6, intensidade: 0.85, pulsar: true, velocidade: 0.8 },
  flutuar: { tipo: 'flutuar', amplitude: 3, velocidade: 0.6 },
  piscar: { tipo: 'piscar', intervalo: 0.6, minimo: 0.25 },
};

export interface ResultadoEfeitos {
  /** deslocamento vertical em px (inteiro, para a pixel art não borrar) */
  dy: number;
  /** multiplicador de escala */
  escala: number;
  /** multiplicador de opacidade */
  alpha: number;
  /** intensidade do halo (0 = sem halo) */
  brilho: number;
}

const NEUTRO: ResultadoEfeitos = { dy: 0, escala: 1, alpha: 1, brilho: 0 };

/** Calcula o efeito combinado no instante t (segundos). fase: deslocamento para objetos não piscarem em sincronia. */
export function calcularEfeitos(efeitos: Efeito[], t: number, fase = 0): ResultadoEfeitos {
  if (!efeitos.length) return NEUTRO;
  const r = { ...NEUTRO };
  const tt = t + fase;
  const onda = (v: number) => 0.5 - 0.5 * Math.cos(2 * Math.PI * v * tt); // 0 → 1 → 0
  for (const e of efeitos) {
    switch (e.tipo) {
      case 'pulsar': r.escala *= 1 + e.intensidade * onda(e.velocidade); break;
      case 'flutuar': r.dy += Math.round(-e.amplitude * Math.sin(2 * Math.PI * e.velocidade * tt)); break;
      case 'piscar': r.alpha *= Math.floor(tt / Math.max(0.05, e.intervalo)) % 2 === 0 ? 1 : e.minimo; break;
      case 'brilhar': r.brilho = Math.max(r.brilho, e.intensidade * (e.pulsar ? 0.45 + 0.55 * onda(e.velocidade) : 1)); break;
    }
  }
  return r;
}

/** Valor estável por objeto (para a fase dos efeitos). */
export function faseDoId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000;
}

export function normalizarEfeitos(lista: unknown): Efeito[] {
  if (!Array.isArray(lista)) return [];
  const saida: Efeito[] = [];
  for (const bruto of lista) {
    const e = bruto as Partial<Efeito> | null;
    if (!e || typeof e !== 'object' || !e.tipo || !(e.tipo in EFEITOS_PADRAO)) continue;
    saida.push({ ...EFEITOS_PADRAO[e.tipo], ...e } as Efeito);
  }
  return saida;
}
