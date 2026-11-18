// Inimigos: configuração (no arquivo do personagem NPC) e a "cabeça" (IA) de cada tipo. Puro: não desenha nada,
// só decide para onde andar, quando atacar e reage a dano. Quem roda é o ▶ Testar (e, depois, o jogo).

/** Um ataque possível do inimigo (ex.: golpe 60%, mordida 40%). */
export interface AtaqueInimigo {
  /** Animação (chave) do ataque, ex.: "golpe". */
  animacao: string;
  /** Chance relativa (os pesos são somados: 60 e 40 = 60% e 40%). */
  peso: number;
  /** Dano no jogador (sem barra de vida por enquanto: só reação). */
  dano: number;
  /** Segura o jogador durante a animação (agarrão/mordida). */
  agarra: boolean;
}

export type ComportamentoInimigo = 'zumbi' | 'parado';

export const COMPORTAMENTOS_INIMIGO: { id: ComportamentoInimigo; nome: string; texto: string }[] = [
  { id: 'zumbi', nome: 'Zumbi', texto: 'Perambula ao acaso (anda, para, vira). Visão curta: ao ver o jogador, persegue e ataca; se o jogador se afastar, desiste. Tiros chamam a atenção.' },
  { id: 'parado', nome: 'Parado', texto: 'Fica no lugar (útil para testes ou para o código controlar tudo).' },
];

export interface ConfigInimigo {
  comportamento: ComportamentoInimigo;
  /** Tiros para morrer (com dano 1 por tiro). */
  vida: number;
  /** Distância (px) em que ele percebe o jogador. */
  visao: number;
  /** Distância (px) em que ele desiste da perseguição (maior que a visão). */
  perderVisao: number;
  velocidadeAndar: number;
  velocidadePerseguir: number;
  /** Espaço (px) entre os corpos, borda a borda, para atacar. */
  alcanceAtaque: number;
  /** Segundos entre um ataque e outro. */
  intervaloAtaque: number;
  ataques: AtaqueInimigo[];
  /** Segundos andando na direção do jogador depois de levar um tiro (ou ouvir um). */
  alertaTiro: number;
  /** Distância (px) em que ele ouve um tiro (0 = não ouve). */
  audicaoTiro: number;
  /** Momento do ataque em que o dano acontece (0–1 da animação). */
  momentoDano: number;
}

export function inimigoPadrao(): ConfigInimigo {
  return {
    comportamento: 'zumbi', vida: 3, visao: 150, perderVisao: 260, velocidadeAndar: 22, velocidadePerseguir: 40,
    alcanceAtaque: 16, intervaloAtaque: 0.9,
    ataques: [
      { animacao: 'golpe', peso: 60, dano: 1, agarra: false },
      { animacao: 'mordida', peso: 40, dano: 2, agarra: true },
    ],
    alertaTiro: 5, audicaoTiro: 260, momentoDano: 0.55,
  };
}

const num = (v: unknown, padrao: number, min = 0) => (Number.isFinite(Number(v)) && Number(v) >= min ? Number(v) : padrao);

export function normalizarInimigo(d: unknown): ConfigInimigo {
  const b = inimigoPadrao();
  const c = (d ?? {}) as Partial<ConfigInimigo>;
  return {
    comportamento: COMPORTAMENTOS_INIMIGO.some((x) => x.id === c.comportamento) ? c.comportamento! : b.comportamento,
    vida: Math.max(1, Math.round(num(c.vida, b.vida, 1))),
    visao: num(c.visao, b.visao), perderVisao: num(c.perderVisao, b.perderVisao),
    velocidadeAndar: num(c.velocidadeAndar, b.velocidadeAndar), velocidadePerseguir: num(c.velocidadePerseguir, b.velocidadePerseguir),
    alcanceAtaque: num(c.alcanceAtaque, b.alcanceAtaque), intervaloAtaque: num(c.intervaloAtaque, b.intervaloAtaque),
    ataques: Array.isArray(c.ataques) ? c.ataques.filter((a) => a && typeof a.animacao === 'string').map((a) => ({
      animacao: a.animacao, peso: num(a.peso, 50), dano: num(a.dano, 1), agarra: !!a.agarra,
    })) : b.ataques,
    alertaTiro: num(c.alertaTiro, b.alertaTiro), audicaoTiro: num(c.audicaoTiro, b.audicaoTiro),
    momentoDano: Math.min(1, num(c.momentoDano, b.momentoDano)),
  };
}

/** Sorteia um ataque pelos pesos (60/40 → 60% e 40%). */
export function sortearAtaque(ataques: AtaqueInimigo[], rnd = Math.random): AtaqueInimigo | null {
  const total = ataques.reduce((s, a) => s + Math.max(0, a.peso), 0);
  if (!ataques.length || total <= 0) return ataques[0] ?? null;
  let r = rnd() * total;
  for (const a of ataques) { r -= Math.max(0, a.peso); if (r < 0) return a; }
  return ataques[ataques.length - 1];
}

// ---------- IA ----------

export type EstadoIA = 'perambular' | 'perseguir' | 'alerta' | 'atacar' | 'dano' | 'morto';

export type EventoIA =
  | { tipo: 'estado'; de: EstadoIA; para: EstadoIA }
  | { tipo: 'viu' } | { tipo: 'perdeu' }
  | { tipo: 'atacou'; ataque: AtaqueInimigo }
  | { tipo: 'acertou'; ataque: AtaqueInimigo; segurar: number }
  | { tipo: 'errou'; ataque: AtaqueInimigo }
  | { tipo: 'alerta'; x: number }
  | { tipo: 'morreu' };

export interface ContextoIA {
  x: number; y: number;
  jogadorX: number; jogadorY: number;
  /** Dá para andar nessa direção (tem chão e não tem parede)? */
  podeAndar: (dir: -1 | 1) => boolean;
  /** Duração (s) de uma animação do inimigo (0 se não existir). */
  duracao: (chave: string) => number;
  /** Soma das meias larguras dos dois corpos (o alcance é medido entre as bordas). */
  corpos?: number;
}

export interface DecisaoIA {
  /** -1 esquerda, 0 parado, 1 direita */
  mover: -1 | 0 | 1;
  velocidade: number;
  /** Para onde olhar (null = manter). */
  olhar: -1 | 1 | null;
}

/** Cabeça de um inimigo. Uma instância por inimigo na fase. */
export class IAInimigo {
  estado: EstadoIA = 'perambular';
  vida: number;
  ataque: AtaqueInimigo | null = null;
  /** Tempo no estado atual / da animação do ataque ou dano. */
  tempo = 0;
  private dir: -1 | 0 | 1 = 0;
  private timer = 0;
  private recarga = 0;
  private danoAplicado = false;
  private alvoX = 0;
  private alertaAte = 0;
  private eventos: EventoIA[] = [];
  /** O código pode mandar perseguir (ignora a distância) ou ficar parado. */
  forcar: 'perseguir' | 'parar' | null = null;

  constructor(public cfg: ConfigInimigo, private rnd = Math.random) {
    this.vida = cfg.vida;
    this.timer = 0.5 + rnd() * 1.5;
  }

  get vivo() { return this.estado !== 'morto'; }

  private mudar(para: EstadoIA) {
    if (para === this.estado) return;
    this.eventos.push({ tipo: 'estado', de: this.estado, para });
    this.estado = para;
    this.tempo = 0;
  }

  /** Leva dano. dx = jogadorX − x (de que lado veio o tiro). */
  levarDano(dano: number, jogadorX: number, ctx: Pick<ContextoIA, 'duracao'>): EventoIA[] {
    if (!this.vivo) return [];
    this.vida -= dano;
    if (this.vida <= 0) {
      this.mudar('morto');
      this.eventos.push({ tipo: 'morreu' });
    } else {
      const perseguia = this.estado === 'perseguir' || this.estado === 'atacar';
      if (ctx.duracao('dano') > 0) this.mudar('dano');
      this.ataque = null;
      this.recarga = Math.max(this.recarga, this.cfg.intervaloAtaque * 0.6); // respira antes de atacar de novo
      // Tiro de longe chama a atenção: vai na direção do jogador por alguns segundos
      if (!perseguia) this.alertar(jogadorX);
    }
    return this.coletar();
  }

  /** Ouviu um tiro (ou levou um): anda na direção dele por cfg.alertaTiro segundos. */
  alertar(x: number) {
    if (!this.vivo || this.cfg.comportamento === 'parado') return;
    this.alvoX = x;
    this.alertaAte = this.cfg.alertaTiro;
    if (this.estado === 'perambular') this.mudar('alerta');
    this.eventos.push({ tipo: 'alerta', x });
  }

  ouvirTiro(x: number, meuX: number) {
    if (this.cfg.audicaoTiro > 0 && Math.abs(x - meuX) <= this.cfg.audicaoTiro && (this.estado === 'perambular' || this.estado === 'alerta')) this.alertar(x);
  }

  private coletar() { const e = this.eventos; this.eventos = []; return e; }

  /** Um passo da IA. Devolve a decisão de movimento e os eventos do passo. */
  passo(dt: number, ctx: ContextoIA): { decisao: DecisaoIA; eventos: EventoIA[] } {
    this.tempo += dt;
    this.recarga = Math.max(0, this.recarga - dt);
    const c = this.cfg;
    const dx = ctx.jogadorX - ctx.x;
    const dy = ctx.jogadorY - ctx.y;
    const dist = Math.abs(dx);
    /** Espaço entre os corpos (borda a borda): é com ele que o alcance do ataque é comparado. */
    const vao = Math.max(0, dist - (ctx.corpos ?? 0));
    const mesmaAltura = Math.abs(dy) <= 96;
    const vendo = (dist <= c.visao && mesmaAltura) || this.forcar === 'perseguir';
    const lado = (dx >= 0 ? 1 : -1) as -1 | 1;
    let d: DecisaoIA = { mover: 0, velocidade: 0, olhar: null };

    if (this.estado === 'morto') return { decisao: d, eventos: this.coletar() };
    if (this.forcar === 'parar' || c.comportamento === 'parado') {
      if (this.estado !== 'atacar' && this.estado !== 'dano') return { decisao: d, eventos: this.coletar() };
    }

    switch (this.estado) {
      case 'dano':
        if (this.tempo >= Math.max(0.15, ctx.duracao('dano'))) this.mudar(vendo ? 'perseguir' : this.alertaAte > 0 ? 'alerta' : 'perambular');
        break;

      case 'atacar': {
        const a = this.ataque!;
        const dur = Math.max(0.2, ctx.duracao(a.animacao));
        d.olhar = lado;
        if (!this.danoAplicado && this.tempo >= dur * c.momentoDano) {
          this.danoAplicado = true;
          if (vao <= c.alcanceAtaque + 12 && mesmaAltura) this.eventos.push({ tipo: 'acertou', ataque: a, segurar: a.agarra ? Math.max(0, dur - this.tempo) : 0 });
          else this.eventos.push({ tipo: 'errou', ataque: a });
        }
        if (this.tempo >= dur) { this.recarga = c.intervaloAtaque; this.ataque = null; this.mudar(vendo ? 'perseguir' : 'perambular'); }
        break;
      }

      case 'perseguir':
        if (!vendo && dist > c.perderVisao) { this.eventos.push({ tipo: 'perdeu' }); this.mudar('perambular'); this.timer = 1 + this.rnd() * 2; this.dir = 0; break; }
        d.olhar = lado;
        if (vao <= c.alcanceAtaque && mesmaAltura) {
          if (this.recarga <= 0) {
            const a = sortearAtaque(c.ataques, this.rnd);
            if (a) { this.ataque = a; this.danoAplicado = false; this.mudar('atacar'); this.eventos.push({ tipo: 'atacou', ataque: a }); }
          }
        } else if (ctx.podeAndar(lado)) d = { mover: lado, velocidade: c.velocidadePerseguir, olhar: lado };
        break;

      case 'alerta': {
        this.alertaAte -= dt;
        if (vendo) { this.eventos.push({ tipo: 'viu' }); this.mudar('perseguir'); break; }
        const ax = this.alvoX - ctx.x;
        const dirA = (ax >= 0 ? 1 : -1) as -1 | 1;
        if (this.alertaAte <= 0 || Math.abs(ax) < 8 || !ctx.podeAndar(dirA)) { this.mudar('perambular'); this.dir = 0; this.timer = 1 + this.rnd() * 2; break; }
        d = { mover: dirA, velocidade: (c.velocidadeAndar + c.velocidadePerseguir) / 2, olhar: dirA };
        break;
      }

      case 'perambular':
      default:
        if (vendo) { this.eventos.push({ tipo: 'viu' }); this.mudar('perseguir'); break; }
        this.timer -= dt;
        if (this.timer <= 0) {
          // Alterna entre parado e andando para um lado aleatório
          if (this.dir === 0) { this.dir = this.rnd() < 0.5 ? -1 : 1; this.timer = 1 + this.rnd() * 2.5; }
          else { this.dir = 0; this.timer = 1.2 + this.rnd() * 3; }
        }
        if (this.dir !== 0 && !ctx.podeAndar(this.dir)) {
          // Beira ou parede: vira (às vezes para antes)
          this.dir = this.rnd() < 0.5 ? (-this.dir as -1 | 1) : 0;
          this.timer = 0.8 + this.rnd() * 1.5;
        }
        if (this.dir !== 0) d = { mover: this.dir, velocidade: c.velocidadeAndar, olhar: this.dir };
        break;
    }
    return { decisao: d, eventos: this.coletar() };
  }
}

// ---------- Arma do jogador ----------

export interface ConfigArma {
  /** Ação (animação extra) que atira. */
  acaoTiro: string;
  /** Ação que recarrega (o pente enche quando a animação termina). */
  acaoRecarga: string;
  /** Animação tocada ao tentar atirar sem bala. */
  animacaoSemBala: string;
  /** Balas por pente. */
  pente: number;
  /** Dano por tiro. */
  dano: number;
  /** Alcance (px). */
  alcance: number;
  /** Altura do tiro, como fração da altura do corpo, a partir dos pés (0,6 = no peito). */
  alturaTiro: number;
}

export function armaPadrao(): ConfigArma {
  return { acaoTiro: 'tiro', acaoRecarga: 'recarga', animacaoSemBala: 'tiro_sem_bala', pente: 7, dano: 1, alcance: 420, alturaTiro: 0.62 };
}

export function normalizarArma(d: unknown): ConfigArma | undefined {
  if (!d || typeof d !== 'object') return undefined;
  const b = armaPadrao();
  const a = d as Partial<ConfigArma>;
  return {
    acaoTiro: typeof a.acaoTiro === 'string' ? a.acaoTiro : b.acaoTiro,
    acaoRecarga: typeof a.acaoRecarga === 'string' ? a.acaoRecarga : b.acaoRecarga,
    animacaoSemBala: typeof a.animacaoSemBala === 'string' ? a.animacaoSemBala : b.animacaoSemBala,
    pente: Math.max(1, Math.round(num(a.pente, b.pente, 1))),
    dano: num(a.dano, b.dano), alcance: num(a.alcance, b.alcance), alturaTiro: Math.min(1, num(a.alturaTiro, b.alturaTiro)),
  };
}
