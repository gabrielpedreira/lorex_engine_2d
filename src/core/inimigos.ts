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
    comportamento: 'zumbi', vida: 3, visao: 210, perderVisao: 330, velocidadeAndar: 30, velocidadePerseguir: 55,
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

/** Estados da engine; o código do inimigo pode criar outros (ex.: "fugir"). */
export type EstadoIA = 'perambular' | 'perseguir' | 'alerta' | 'atacar' | 'dano' | 'morto' | (string & {});

export type EventoIA =
  | { tipo: 'estado'; de: string; para: string }
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
  /** Tempo livre do perambular (contagem regressiva). */
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
    const de = this.estado;
    if (para === 'perseguir' && de !== 'atacar' && de !== 'dano') this.eventos.push({ tipo: 'viu' });
    if (de === 'perseguir' && (para === 'perambular' || para === 'alerta')) this.eventos.push({ tipo: 'perdeu' });
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

  // ---------- Situação (o que o inimigo percebe neste passo) ----------
  private ctx: ContextoIA | null = null;
  private decisao: DecisaoIA = { mover: 0, velocidade: 0, olhar: null };

  /** Distância horizontal até o jogador (positiva = jogador à direita). */
  get dx() { return this.ctx ? this.ctx.jogadorX - this.ctx.x : 0; }
  /** Espaço entre os corpos (borda a borda). */
  get vao() { return Math.max(0, Math.abs(this.dx) - (this.ctx?.corpos ?? 0)); }
  /** Jogador mais ou menos na mesma altura (não está num andar de cima/baixo). */
  get mesmaAltura() { return this.ctx ? Math.abs(this.ctx.jogadorY - this.ctx.y) <= 96 : false; }
  /** O jogador está dentro da visão? */
  get vendo() { return (Math.abs(this.dx) <= this.cfg.visao && this.mesmaAltura) || this.forcar === 'perseguir'; }
  /** Lado em que o jogador está: -1 esquerda, 1 direita. */
  get ladoJogador(): -1 | 1 { return this.dx >= 0 ? 1 : -1; }
  /** Ocupado com algo que o código não interrompe (atacando, levando dano, morto). */
  get ocupado() { return this.estado === 'atacar' || this.estado === 'dano' || this.estado === 'morto'; }
  /** Pode começar um ataque agora (terminou o intervalo entre ataques)? */
  get podeAtacar() { return this.recarga <= 0 && !this.ocupado; }
  /** Ponto para onde o tiro chamou a atenção (x) e quantos segundos ainda de alerta. */
  get alerta() { return { x: this.alvoX, restante: Math.max(0, this.alertaAte) }; }

  podeAndar(dir: -1 | 1) { return this.ctx ? this.ctx.podeAndar(dir) : false; }

  // ---------- Comandos (usados pela IA pronta e pelo código do inimigo) ----------
  andar(dir: -1 | 1, velocidade = this.cfg.velocidadeAndar) { this.decisao = { mover: dir, velocidade, olhar: dir }; }
  parar() { this.decisao = { mover: 0, velocidade: 0, olhar: this.decisao.olhar }; }
  olhar(dir: -1 | 1) { this.decisao.olhar = dir; }
  /** Muda o estado (ex.: "perambular", "perseguir", "alerta" ou um seu, como "fugir"). */
  irPara(estado: string) { if (!this.ocupado || estado === 'morto') this.mudar(estado as EstadoIA); }
  /** Começa um ataque (sorteado pelos pesos se não disser qual). false = não pode agora. */
  atacar(nome?: string): boolean {
    if (!this.podeAtacar) return false;
    const a = nome ? this.cfg.ataques.find((x) => x.animacao === nome) ?? null : sortearAtaque(this.cfg.ataques, this.rnd);
    if (!a) return false;
    this.ataque = a; this.danoAplicado = false;
    this.mudar('atacar');
    this.eventos.push({ tipo: 'atacou', ataque: a });
    this.decisao = { mover: 0, velocidade: 0, olhar: this.ladoJogador };
    return true;
  }
  /** Número aleatório entre min e max (o mesmo sorteio da IA, útil no código). */
  aleatorio(min: number, max: number) { return min + this.rnd() * (max - min); }

  /**
   * Um passo da IA. A "mecânica" (ataque em andamento, dano, morte, alerta correndo) é sempre da engine;
   * a DECISÃO (perambular, perseguir…) é do código do inimigo (aoPensar) ou, sem código, da IA pronta abaixo.
   */
  passo(dt: number, ctx: ContextoIA, pensarExterno?: (ia: IAInimigo) => void): { decisao: DecisaoIA; eventos: EventoIA[] } {
    this.ctx = ctx;
    this.tempo += dt;
    this.recarga = Math.max(0, this.recarga - dt);
    this.alertaAte = Math.max(0, this.alertaAte - dt);
    this.decisao = { mover: 0, velocidade: 0, olhar: null };
    const c = this.cfg;

    if (this.estado === 'morto') return { decisao: this.decisao, eventos: this.coletar() };
    if (this.estado === 'dano') {
      if (this.tempo >= Math.max(0.15, ctx.duracao('dano'))) this.mudar(this.vendo ? 'perseguir' : this.alertaAte > 0 ? 'alerta' : 'perambular');
      return { decisao: this.decisao, eventos: this.coletar() };
    }
    if (this.estado === 'atacar') {
      const a = this.ataque!;
      const dur = Math.max(0.2, ctx.duracao(a.animacao));
      this.decisao.olhar = this.ladoJogador;
      if (!this.danoAplicado && this.tempo >= dur * c.momentoDano) {
        this.danoAplicado = true;
        if (this.vao <= c.alcanceAtaque + 12 && this.mesmaAltura) this.eventos.push({ tipo: 'acertou', ataque: a, segurar: a.agarra ? Math.max(0, dur - this.tempo) : 0 });
        else this.eventos.push({ tipo: 'errou', ataque: a });
      }
      if (this.tempo >= dur) { this.recarga = c.intervaloAtaque; this.ataque = null; this.mudar(this.vendo ? 'perseguir' : 'perambular'); }
      return { decisao: this.decisao, eventos: this.coletar() };
    }

    if (pensarExterno) pensarExterno(this);
    else if (this.forcar !== 'parar' && c.comportamento !== 'parado') this.pensarZumbi(dt);
    return { decisao: this.decisao, eventos: this.coletar() };
  }

  /** IA pronta "Zumbi" (usada quando o inimigo não tem aoPensar no código). O modelo do script faz o mesmo em JavaScript. */
  private pensarZumbi(dt: number) {
    const c = this.cfg;
    switch (this.estado) {
      case 'perseguir':
        if (!this.vendo && Math.abs(this.dx) > c.perderVisao) { this.irPara('perambular'); this.timer = 1 + this.rnd() * 2; this.dir = 0; break; }
        this.olhar(this.ladoJogador);
        if (this.vao <= c.alcanceAtaque && this.mesmaAltura) this.atacar();
        else if (this.podeAndar(this.ladoJogador)) this.andar(this.ladoJogador, c.velocidadePerseguir);
        break;
      case 'alerta': {
        if (this.vendo) { this.irPara('perseguir'); break; }
        const ax = this.alvoX - (this.ctx?.x ?? 0);
        const dirA = (ax >= 0 ? 1 : -1) as -1 | 1;
        if (this.alertaAte <= 0 || Math.abs(ax) < 8 || !this.podeAndar(dirA)) { this.irPara('perambular'); this.dir = 0; this.timer = 1 + this.rnd() * 2; break; }
        this.andar(dirA, (c.velocidadeAndar + c.velocidadePerseguir) / 2);
        break;
      }
      default:
        if (this.vendo) { this.irPara('perseguir'); break; }
        this.timer -= dt;
        if (this.timer <= 0) {
          if (this.dir === 0) { this.dir = this.rnd() < 0.5 ? -1 : 1; this.timer = 1 + this.rnd() * 2.5; }
          else { this.dir = 0; this.timer = 1.2 + this.rnd() * 3; }
        }
        if (this.dir !== 0 && !this.podeAndar(this.dir)) { this.dir = this.rnd() < 0.5 ? (-this.dir as -1 | 1) : 0; this.timer = 0.8 + this.rnd() * 1.5; }
        if (this.dir !== 0) this.andar(this.dir, c.velocidadeAndar);
        break;
    }
  }
}

// ---------- Arma do jogador ----------

export interface ConfigArma {
  /** Nome da arma (HUD: chave "arma"). */
  nome: string;
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
  /** Quantos espaços ocupa no inventário. */
  slots: number;
  /** Dano conforme a distância: até "ate"% do alcance → "dano" (a primeira faixa que cobrir vale; sem faixa, usa "dano"). */
  danoPorDistancia: FaixaDano[];
  /** Linha do tiro na tela. */
  linha: LinhaTiro;
  /** Imagens (caminhos relativos a jogo/): HUD carregada/descarregada, ícone de cada bala, menu/inventário. */
  imagens: ImagensArma;
  /** Script da arma (jogo/scripts/), se houver. */
  script?: string;
}

export interface FaixaDano { ate: number; dano: number }
/** Linha do tiro: opacidade em % (0 = invisível, só o clarão e o acerto; 100 = bem marcada). */
export interface LinhaTiro { opacidade: number; cor: string; espessura: number; duracao: number }
/** Arquivos antigos guardavam "visivel" / "pouco" / "invisivel". */
const OPACIDADE_ANTIGA: Record<string, number> = { visivel: 85, pouco: 30, invisivel: 0 };
export interface ImagensArma { hud: string; hudVazia: string; bala: string; menu: string }

export function armaPadrao(): ConfigArma {
  return {
    nome: 'Pistola', acaoTiro: 'tiro', acaoRecarga: 'recarga', animacaoSemBala: 'tiro_sem_bala', pente: 7, dano: 1, alcance: 420, alturaTiro: 0.62,
    slots: 1, danoPorDistancia: [{ ate: 50, dano: 2 }, { ate: 100, dano: 1 }],
    linha: { opacidade: 85, cor: '#fff2a8', espessura: 1, duracao: 0.07 },
    imagens: { hud: '', hudVazia: '', bala: '', menu: '' },
  };
}

/** Dano de um tiro que acertou a "distancia" px (pelas faixas de dano por distância). */
export function danoNaDistancia(a: ConfigArma, distancia: number): number {
  const pct = a.alcance > 0 ? (distancia / a.alcance) * 100 : 0;
  const f = [...a.danoPorDistancia].sort((x, y) => x.ate - y.ate).find((x) => pct <= x.ate);
  return f ? f.dano : a.dano;
}

export function normalizarArma(d: unknown): ConfigArma | undefined {
  if (!d || typeof d !== 'object') return undefined;
  const b = armaPadrao();
  const a = d as Partial<ConfigArma>;
  return {
    nome: typeof a.nome === 'string' && a.nome.trim() ? a.nome.trim() : b.nome,
    acaoTiro: typeof a.acaoTiro === 'string' ? a.acaoTiro : b.acaoTiro,
    acaoRecarga: typeof a.acaoRecarga === 'string' ? a.acaoRecarga : b.acaoRecarga,
    animacaoSemBala: typeof a.animacaoSemBala === 'string' ? a.animacaoSemBala : b.animacaoSemBala,
    pente: Math.max(1, Math.round(num(a.pente, b.pente, 1))),
    dano: num(a.dano, b.dano), alcance: num(a.alcance, b.alcance), alturaTiro: Math.min(1, num(a.alturaTiro, b.alturaTiro)),
    slots: Math.max(0, Math.round(num(a.slots, b.slots))),
    // Arma antiga (sem faixas): o dano de sempre em toda a distância
    danoPorDistancia: Array.isArray(a.danoPorDistancia)
      ? a.danoPorDistancia.filter((f) => f && Number.isFinite(Number(f.ate))).map((f) => ({ ate: Math.max(0, Number(f.ate)), dano: Math.max(0, Number(f.dano) || 0) }))
      : [{ ate: 100, dano: num(a.dano, b.dano) }],
    linha: {
      opacidade: Math.max(0, Math.min(100, num(a.linha?.opacidade, OPACIDADE_ANTIGA[(a.linha as { visibilidade?: string } | undefined)?.visibilidade ?? ''] ?? b.linha.opacidade))),
      cor: typeof a.linha?.cor === 'string' ? a.linha.cor : b.linha.cor,
      espessura: Math.max(0.5, num(a.linha?.espessura, b.linha.espessura)),
      duracao: Math.max(0.01, num(a.linha?.duracao, b.linha.duracao)),
    },
    imagens: {
      hud: typeof a.imagens?.hud === 'string' ? a.imagens.hud : '', hudVazia: typeof a.imagens?.hudVazia === 'string' ? a.imagens.hudVazia : '',
      bala: typeof a.imagens?.bala === 'string' ? a.imagens.bala : '', menu: typeof a.imagens?.menu === 'string' ? a.imagens.menu : '',
    },
    ...(typeof a.script === 'string' && a.script ? { script: a.script } : {}),
  };
}
