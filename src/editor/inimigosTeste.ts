// Inimigos durante o ▶ Testar: corpo (mesma física do jogador), IA (core/inimigos.ts) e desenho animado.
import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { Jogador, xEm, yEm, type Segmento } from '../core/fisica';
import { IAInimigo, inimigoPadrao, type EventoIA } from '../core/inimigos';
import { ancoraPes, animacaoPara, duracao, quadroEm, retanguloQuadro, type Personagem } from '../core/personagem';
import type { InimigoFase } from '../core/tipos';

export interface TipoInimigo { arquivo: string; p: Personagem; quadros: Map<string, Texture[]> }

/** Carrega as texturas (quadros) de um tipo de inimigo. */
export async function carregarTipo(arquivo: string, p: Personagem, carregar: (folha: string) => Promise<Texture>): Promise<TipoInimigo> {
  const quadros = new Map<string, Texture[]>();
  for (const [chave, anim] of Object.entries(p.animacoes)) {
    const base = await carregar(anim.folha);
    quadros.set(chave, Array.from({ length: anim.quadros }, (_, i) => {
      const r = retanguloQuadro(anim, base.width, i);
      return new Texture({ source: base.source, frame: new Rectangle(r.x, r.y, Math.min(r.w, base.width - r.x), Math.min(r.h, base.height - r.y)) });
    }));
  }
  return { arquivo, p, quadros };
}

export class InimigoVivo {
  readonly corpo: Jogador;
  readonly ia: IAInimigo;
  readonly sprite = new Sprite(Texture.EMPTY);
  /** Dados livres do código (eu.dados). */
  dados: Record<string, unknown> = {};
  private chave = '';
  private tempoAnim = 0;
  private flash = 0;
  private movendo = false;
  /** Caiu para fora da fase. */
  removido = false;

  constructor(readonly def: InimigoFase, readonly tipo: TipoInimigo, gravidade: number) {
    const cfg = tipo.p.inimigo ?? inimigoPadrao();
    this.ia = new IAInimigo(cfg);
    this.corpo = new Jogador({ largura: tipo.p.caixa.largura, altura: tipo.p.caixa.altura, velocidade: 0, alturaPulo: 0, gravidade }, def.x, def.y);
    this.corpo.olhandoDireita = def.olhandoDireita;
  }

  get id() { return this.def.id; }
  get nome() { return this.tipo.p.nome; }
  get vivo() { return this.ia.vivo && !this.removido; }

  caixa() {
    const c = this.corpo;
    return { x: c.x - c.cfg.largura / 2, y: c.y - c.cfg.altura, w: c.cfg.largura, h: c.cfg.altura };
  }

  duracao = (chave: string) => { const a = this.tipo.p.animacoes[chave]; return a ? duracao(a) : 0; };

  /** IA: decide e devolve os eventos. */
  pensar(dt: number, jogador: { x: number; y: number; largura: number }, segs: Segmento[], externo?: () => void): EventoIA[] {
    if (this.removido) return [];
    const c = this.corpo;
    const { decisao, eventos } = this.ia.passo(dt, {
      x: c.x, y: c.y, jogadorX: jogador.x, jogadorY: jogador.y,
      podeAndar: (dir) => podeAndar(segs, c.x, c.y, c.cfg.largura, c.cfg.altura, dir),
      duracao: this.duracao,
      corpos: (c.cfg.largura + jogador.largura) / 2,
    }, externo);
    c.cfg.velocidade = decisao.velocidade;
    this.entrada = { esquerda: decisao.mover < 0, direita: decisao.mover > 0, pulo: false, puloApertado: false };
    if (decisao.olhar) c.olhandoDireita = decisao.olhar > 0;
    this.movendo = decisao.mover !== 0;
    return eventos;
  }

  private entrada = { esquerda: false, direita: false, pulo: false, puloApertado: false };

  /** Física (passo fixo). */
  passoFisica(dt: number, segs: Segmento[], fw: number, fh: number) {
    if (this.removido) return;
    const olhando = this.corpo.olhandoDireita;
    const ent = this.ia.vivo ? this.entrada : { esquerda: false, direita: false, pulo: false, puloApertado: false };
    if (!this.corpo.passo(dt, ent, segs, fw, fh)) this.removido = true;
    // A IA decide para onde olhar (a física vira o corpo pelo movimento)
    if (!this.movendo) this.corpo.olhandoDireita = olhando;
  }

  atingido() { this.piscar(0.12, '#ff7070'); }
  private corFlash = 0xff7070;
  /** Fica com a cor (vermelho) por um tempo: tiro levado ou eu.piscar(segundos, cor) no código. */
  piscar(segundos: number, cor: string) { this.flash = Math.max(0, segundos); this.corFlash = Number.parseInt(cor.replace('#', ''), 16) || 0xff7070; }

  /** Animação conforme o estado da IA. */
  desenhar(dt: number) {
    const p = this.tipo.p;
    const sp = this.sprite;
    if (this.removido) { sp.visible = false; return; }
    const est = this.ia.estado;
    const quer = est === 'morto' ? 'morte' : est === 'atacar' && this.ia.ataque ? this.ia.ataque.animacao
      : est === 'dano' ? 'dano' : this.movendo && Math.abs(this.corpo.vx) > 2 ? 'andando' : 'parado';
    const r = animacaoPara(p, quer);
    if (!r) return;
    if (r.estado !== this.chave) { this.chave = r.estado; this.tempoAnim = 0; } else this.tempoAnim += dt;
    const frames = this.tipo.quadros.get(r.estado);
    if (!frames?.length) return;
    // Morte e ataques não repetem: param no último quadro
    const anim = est === 'morto' || est === 'atacar' || est === 'dano' ? { ...r.anim, repetir: false } : r.anim;
    sp.texture = frames[Math.min(quadroEm(anim, this.tempoAnim), frames.length - 1)];
    const anc = ancoraPes(p);
    sp.anchor.set(anc.ax, anc.ay);
    const esc = p.escala * r.anim.escala;
    const espelhar = this.corpo.olhandoDireita !== p.olhaDireita;
    sp.scale.set(espelhar ? -esc : esc, esc);
    sp.position.set(Math.round(this.corpo.x), Math.round(this.corpo.y));
    this.flash = Math.max(0, this.flash - dt);
    sp.tint = this.flash > 0 ? this.corFlash : 0xffffff;
    sp.visible = true;
  }

  inserir(cont: Container) { if (this.sprite.parent !== cont) cont.addChild(this.sprite); }
  remover() { this.sprite.removeFromParent(); }
}

/** Há chão logo à frente e nenhuma parede no caminho? (para o inimigo não cair da beirada) */
export function podeAndar(segs: Segmento[], x: number, y: number, largura: number, altura: number, dir: -1 | 1): boolean {
  const frente = x + dir * (largura / 2 + 6);
  let chao = false;
  for (const s of segs) {
    if (s.tipo === 'chao') {
      const yi = yEm(s, frente);
      if (yi !== null && yi > y - 20 && yi < y + 28) chao = true;
    } else if (s.tipo === 'parede') {
      for (const hy of [y - altura * 0.5, y - 12]) {
        const xi = xEm(s, hy);
        if (xi !== null && (xi - x) * dir > 0 && Math.abs(xi - x) < largura / 2 + 8) return false;
      }
    }
  }
  return chao;
}

/** Tiro instantâneo: devolve o primeiro inimigo vivo na linha e onde o tiro parou (parede ou alcance). */
export function raioTiro(segs: Segmento[], inimigos: InimigoVivo[], ox: number, oy: number, dir: -1 | 1, alcance: number) {
  let fim = alcance;
  for (const s of segs) {
    if (s.umaVia) continue;
    const xi = xEm(s, oy);
    if (xi === null) continue;
    const d = (xi - ox) * dir;
    if (d > 0 && d < fim) fim = d;
  }
  let alvo: InimigoVivo | null = null;
  for (const i of inimigos) {
    if (!i.vivo) continue;
    const b = i.caixa();
    if (oy < b.y || oy > b.y + b.h) continue;
    const d = dir > 0 ? b.x - ox : ox - (b.x + b.w);
    const dentro = ox >= b.x && ox <= b.x + b.w;
    const dist = dentro ? 0 : d;
    if (dist >= 0 && dist < fim) { fim = dist; alvo = i; }
  }
  return { alvo, fimX: ox + dir * fim };
}
