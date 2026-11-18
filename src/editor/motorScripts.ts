// Executa os scripts (jogo/scripts/*.js) durante o ▶ Testar: compila, chama os ganchos e oferece a API "jogo".
// Erros nunca derrubam o teste: vão para a Saída do painel de Código e o gancho que falhou é desligado.
import type { ObjetoFase } from '../core/tipos';
import { toca, type MundoInterativo } from '../core/comportamentos';
import { compilarScript, linhaDoErro, type DonoScript, type ScriptCompilado } from '../core/scripts';

export interface EntradaLog {
  nivel: 'info' | 'erro';
  arquivo: string;
  texto: string;
  linha?: number;
  hora: number;
}

/** Registro global da Saída (o painel de Código mostra). */
export const SAIDA = {
  linhas: [] as EntradaLog[],
  ouvintes: new Set<() => void>(),
  add(e: Omit<EntradaLog, 'hora'>) {
    this.linhas.push({ ...e, hora: Date.now() });
    if (this.linhas.length > 300) this.linhas.splice(0, this.linhas.length - 300);
    for (const f of this.ouvintes) f();
  },
  limpar() { this.linhas = []; for (const f of this.ouvintes) f(); },
};

/** O que o motor de scripts precisa do modo Teste. */
export interface PonteTeste {
  arquivoFase: string;
  objetos(): ObjetoFase[];
  mundo(): MundoInterativo;
  jogador(): {
    x: number; y: number; vx: number; vy: number; noChao: boolean; olhandoDireita: boolean;
    caixa: { x: number; y: number; w: number; h: number };
  } | null;
  nomeJogador(): string;
  tocarAnimacao(chave: string): boolean;
  acaoAtual(): string | null;
  teleportar(x: number, y: number): void;
  empurrar(vx: number, vy: number): void;
  aviso(t: string): void;
  mensagem(t: string): void;
  irPara(fase: string): void;
  apertou(acao: string): boolean;
  segurando(acao: string): boolean;
  hudDefinir(rotulo: string, valor: string): void;
  hudRemover(rotulo: string): void;
  /** O código mudou visibilidade/posição: redesenhar. */
  mudouCena(): void;
  interagir(o: ObjetoFase): void;
}

interface ScriptAtivo { dono: DonoScript; idDono: string | null; c: ScriptCompilado; desligados: Set<string> }

/** Fontes de script de uma partida: arquivo → código. */
export interface FontesScripts {
  jogo?: { arquivo: string; codigo: string };
  fase?: { arquivo: string; codigo: string };
  personagem?: { arquivo: string; codigo: string };
  objetos: { id: string; arquivo: string; codigo: string }[];
}

export class MotorScripts {
  private scripts: ScriptAtivo[] = [];
  private tempo = 0;
  private timers: { quando: number; fn: () => void; arquivo: string }[] = [];
  private tocando = new Set<string>();
  private handles = new Map<string, unknown>();
  private dadosObjetos = new Map<string, Record<string, unknown>>();
  /** Variáveis livres e dados do jogador seguem de uma fase para outra. */
  variaveis: Record<string, unknown> = {};
  dadosJogador: Record<string, unknown> = {};
  private api: unknown = null;

  constructor(private ponte: PonteTeste) {}

  get vazio() { return !this.scripts.length; }

  /** Compila tudo. Erros de sintaxe vão para a Saída (o resto continua). */
  async carregar(f: FontesScripts) {
    this.scripts = [];
    const lista: { dono: DonoScript; id: string | null; arquivo: string; codigo: string }[] = [
      ...(f.jogo ? [{ dono: 'jogo' as const, id: null, ...f.jogo }] : []),
      ...(f.fase ? [{ dono: 'fase' as const, id: null, ...f.fase }] : []),
      ...(f.personagem ? [{ dono: 'personagem' as const, id: null, ...f.personagem }] : []),
      ...f.objetos.map((o) => ({ dono: 'objeto' as const, id: o.id, arquivo: o.arquivo, codigo: o.codigo })),
    ];
    const cache = new Map<string, Promise<ScriptCompilado>>();
    for (const s of lista) {
      try {
        // Objetos que dividem o mesmo arquivo dividem o módulo (variáveis no topo do arquivo são compartilhadas)
        if (!cache.has(s.arquivo)) cache.set(s.arquivo, compilarScript(s.arquivo, s.codigo));
        const c = await cache.get(s.arquivo)!;
        this.scripts.push({ dono: s.dono, idDono: s.id, c, desligados: new Set() });
      } catch (err) {
        if (!cache.has('!' + s.arquivo)) {
          cache.set('!' + s.arquivo, Promise.reject());
          cache.get('!' + s.arquivo)!.catch(() => {});
          SAIDA.add({ nivel: 'erro', arquivo: s.arquivo, texto: `Erro de sintaxe: ${err instanceof Error ? err.message : String(err)}` });
          this.ponte.aviso(`Erro no código de ${s.arquivo} (veja Código › Saída)`);
        }
      }
    }
  }

  /** Objetos que viram interagíveis/acionáveis por causa do código. */
  prepararMundo(m: MundoInterativo) {
    m.interagiveisPorCodigo.clear();
    m.acionadosPorCodigo.clear();
    for (const s of this.scripts) {
      if (s.dono !== 'objeto' || !s.idDono) continue;
      if (s.c.ganchos.aoInteragir) m.interagiveisPorCodigo.set(s.idDono, 'Usar');
      if (s.c.ganchos.aoAcionado) m.acionadosPorCodigo.add(s.idDono);
    }
    m.podeColetar = (o) => this.chamarObjeto(o.id, 'aoColetar') !== false;
  }

  // ---------- Ganchos ----------

  iniciar() {
    this.tempo = 0;
    this.timers = [];
    this.tocando.clear();
    for (const s of this.scripts) this.chamar(s, 'aoIniciar');
  }

  atualizar(dt: number) {
    this.tempo += dt;
    // Temporizadores (jogo.esperar)
    const prontos = this.timers.filter((t) => t.quando <= this.tempo);
    if (prontos.length) {
      this.timers = this.timers.filter((t) => t.quando > this.tempo);
      for (const t of prontos) this.protegido(t.arquivo, 'esperar', () => t.fn());
    }
    for (const s of this.scripts) if (s.c.ganchos.aoAtualizar) this.chamar(s, 'aoAtualizar', dt);
    // Encostar no objeto (borda: só quando começa a tocar)
    const j = this.ponte.jogador();
    if (!j) return;
    const m = this.ponte.mundo();
    for (const s of this.scripts) {
      if (s.dono !== 'objeto' || !s.idDono || !s.c.ganchos.aoTocar) continue;
      const o = this.objeto(s.idDono);
      if (!o) continue;
      const agora = m.visivel(o.id) && toca(j.caixa, m.caixa(o));
      if (agora && !this.tocando.has(o.id)) { this.tocando.add(o.id); this.chamar(s, 'aoTocar'); }
      if (!agora) this.tocando.delete(o.id);
    }
  }

  /** aoInteragir do objeto. false = cancelar o comportamento pronto. */
  interagir(o: ObjetoFase): boolean {
    return this.chamarObjeto(o.id, 'aoInteragir') !== false;
  }

  acionado(alvo: string, origem: ObjetoFase) {
    this.chamarObjeto(alvo, 'aoAcionado', this.handle(origem));
  }

  /** aoAcao do personagem. false = cancelar a animação. */
  acao(acao: string): boolean {
    let ok = true;
    for (const s of this.scripts) if (s.dono === 'personagem' && this.chamar(s, 'aoAcao', acao) === false) ok = false;
    return ok;
  }

  trocouFase(fase: string) {
    for (const s of this.scripts) if (s.dono === 'jogo') this.chamar(s, 'aoTrocarFase', fase);
  }

  private chamarObjeto(id: string, nome: string, ...args: unknown[]) {
    let r: unknown;
    for (const s of this.scripts) if (s.dono === 'objeto' && s.idDono === id) r = this.chamar(s, nome, ...args) ?? r;
    return r;
  }

  private chamar(s: ScriptAtivo, nome: string, ...args: unknown[]): unknown {
    const fn = s.c.ganchos[nome];
    if (!fn || s.desligados.has(nome)) return undefined;
    const api = this.apiJogo();
    const eu = s.dono === 'objeto' && s.idDono ? this.handle(this.objeto(s.idDono)!) : s.dono === 'personagem' ? (api as { jogador: unknown }).jogador : null;
    const todos = s.dono === 'jogo' || s.dono === 'fase' ? [api, ...args] : [eu, api, ...args];
    return this.protegido(s.c.arquivo, nome, () => fn(...todos), s);
  }

  private protegido(arquivo: string, nome: string, fn: () => unknown, s?: ScriptAtivo) {
    try {
      return fn();
    } catch (err) {
      const l = s ? linhaDoErro(err, s.c.url) : null;
      SAIDA.add({ nivel: 'erro', arquivo, texto: `${nome}: ${err instanceof Error ? err.message : String(err)}`, ...(l ? { linha: l.linha } : {}) });
      this.ponte.aviso(`Erro no código de ${arquivo}${l ? ` (linha ${l.linha})` : ''}: veja Código › Saída`);
      s?.desligados.add(nome); // não repete o mesmo erro a cada quadro
      return undefined;
    }
  }

  private objeto(id: string) { return this.ponte.objetos().find((o) => o.id === id); }

  // ---------- API ----------

  /** Objeto do jogo como o código enxerga. */
  private handle(o: ObjetoFase): unknown {
    const h = this.handles.get(o.id);
    if (h) return h;
    const ponte = this.ponte;
    const motor = this;
    const m = () => ponte.mundo();
    const est = () => m().estados.get(o.id);
    const novo = {
      get id() { return o.id; },
      get nome() { return o.nome; },
      get x() { return m().caixa(o).x; },
      set x(v: number) { m().deslocar(o.id, v - m().caixa(o).x, 0); ponte.mudouCena(); },
      get y() { return m().caixa(o).y; },
      set y(v: number) { m().deslocar(o.id, 0, v - m().caixa(o).y); ponte.mudouCena(); },
      get largura() { return o.w * o.escala; },
      get altura() { return o.h * o.escala; },
      get visivel() { return m().visivel(o.id); },
      set visivel(v: boolean) { const e = est(); if (e) { e.visivel = v; m().marcarMudanca(); ponte.mudouCena(); } },
      get aberta() { return !!est()?.aberta; },
      set aberta(v: boolean) { const e = est(); if (e) { e.aberta = v; m().marcarMudanca(); ponte.mudouCena(); } },
      get dados() { let d = motor.dadosObjetos.get(o.id); if (!d) motor.dadosObjetos.set(o.id, d = {}); return d; },
      mostrar() { novo.visivel = true; },
      esconder() { novo.visivel = false; },
      abrir() { novo.aberta = true; },
      fechar() { novo.aberta = false; },
      mover(dx: number, dy: number) { m().deslocar(o.id, dx, dy); ponte.mudouCena(); },
      get tocandoJogador() { const j = ponte.jogador(); return !!j && toca(j.caixa, m().caixa(o)); },
      distanciaDoJogador() {
        const j = ponte.jogador(); if (!j) return Infinity;
        const b = m().caixa(o);
        return Math.hypot(b.x + b.w / 2 - j.x, b.y + b.h / 2 - (j.y - j.caixa.h / 2));
      },
      interagir() { ponte.interagir(o); },
    };
    this.handles.set(o.id, novo);
    return novo;
  }

  private apiJogo(): unknown {
    if (this.api) return this.api;
    const ponte = this.ponte;
    const motor = this;
    const inv = () => ponte.mundo().inventario;
    const jogador = {
      get x() { return ponte.jogador()?.x ?? 0; },
      set x(v: number) { ponte.teleportar(v, ponte.jogador()?.y ?? 0); },
      get y() { return ponte.jogador()?.y ?? 0; },
      set y(v: number) { ponte.teleportar(ponte.jogador()?.x ?? 0, v); },
      get vx() { return ponte.jogador()?.vx ?? 0; },
      set vx(v: number) { const j = ponte.jogador(); if (j) ponte.empurrar(v - j.vx, 0); },
      get vy() { return ponte.jogador()?.vy ?? 0; },
      set vy(v: number) { const j = ponte.jogador(); if (j) ponte.empurrar(0, v - j.vy); },
      get noChao() { return !!ponte.jogador()?.noChao; },
      get olhandoDireita() { return !!ponte.jogador()?.olhandoDireita; },
      get nome() { return ponte.nomeJogador(); },
      tocar: (a: string) => ponte.tocarAnimacao(a),
      get acaoAtual() { return ponte.acaoAtual(); },
      teleportar: (x: number, y: number) => ponte.teleportar(x, y),
      empurrar: (vx: number, vy: number) => ponte.empurrar(vx, vy),
      get dados() { return motor.dadosJogador; },
    };
    this.api = {
      jogador,
      inventario: {
        tem: (item: string, n = 1) => (inv().get(item) ?? 0) >= n,
        quantidade: (item: string) => inv().get(item) ?? 0,
        dar: (item: string, n = 1) => { inv().set(item, (inv().get(item) ?? 0) + n); ponte.mudouCena(); },
        tirar: (item: string, n = 1) => {
          const t = inv().get(item) ?? 0;
          if (t < n) return false;
          if (t - n) inv().set(item, t - n); else inv().delete(item);
          ponte.mudouCena();
          return true;
        },
        lista: () => Object.fromEntries(inv()),
      },
      hud: {
        definir: (r: string, v: string | number) => ponte.hudDefinir(String(r), String(v)),
        remover: (r: string) => ponte.hudRemover(String(r)),
      },
      get variaveis() { return motor.variaveis; },
      set variaveis(v: Record<string, unknown>) { motor.variaveis = v ?? {}; },
      get fase() { return ponte.arquivoFase; },
      get tempo() { return motor.tempo; },
      objeto: (nome: string) => {
        const o = ponte.objetos().find((x) => x.id === nome) ?? ponte.objetos().find((x) => x.nome === nome)
          ?? ponte.objetos().find((x) => x.nome.toLowerCase() === String(nome).toLowerCase());
        return o ? motor.handle(o) : null;
      },
      objetos: (contem = '') => ponte.objetos().filter((o) => o.nome.toLowerCase().includes(contem.toLowerCase())).map((o) => motor.handle(o)),
      aviso: (t: string) => ponte.aviso(String(t)),
      mensagem: (t: string) => ponte.mensagem(String(t)),
      irPara: (f: string) => ponte.irPara(String(f)),
      apertou: (a: string) => ponte.apertou(a),
      segurando: (a: string) => ponte.segurando(a),
      esperar: (seg: number, fn: () => void) => { motor.timers.push({ quando: motor.tempo + Math.max(0, Number(seg) || 0), fn, arquivo: 'esperar' }); },
      log: (...v: unknown[]) => SAIDA.add({ nivel: 'info', arquivo: ponte.arquivoFase, texto: v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') }),
    };
    return this.api;
  }
}
