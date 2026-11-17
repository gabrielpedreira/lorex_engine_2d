// ▶ Testar: joga a fase dentro do editor, com o jogador correndo e pulando sobre as colisões desenhadas.
import { Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { Animador, ancoraPes, estadoDoJogador, extras, retanguloQuadro, type Personagem } from '../core/personagem';
import { EntradaJogo, TECLAS_RESERVADAS, controlesPadrao, normalizarCodigo, textoAtalho, type Controles } from '../core/controles';
import { Jogador, JOGADOR_PADRAO, montarSegmentos, type ConfigJogador, type Entrada, type Segmento } from '../core/fisica';
import { MundoInterativo, type ResultadoInteracao } from '../core/comportamentos';
import { el } from '../ui/dom';
import { dica } from '../ui/legenda';
import type { Estado } from './estado';
import type { Viewport } from './viewport';

const PASSO = 1 / 120; // física em passo fixo (estável em qualquer taxa de quadros)

export class ModoTeste {
  private jogador: Jogador | null = null;
  private segs: Segmento[] = [];
  private entradaJogo = new EntradaJogo(controlesPadrao());
  private puloApertado = false;
  private acumulado = 0;
  private cameraAntes = { x: 0, y: 0, zoom: 1 };
  private colisoesAntes = true;
  private grafico = new Graphics();
  private hud: HTMLElement;
  private camAlvo = { x: 0, y: 0 };
  private mundo: MundoInterativo | null = null;
  private interagirApertado = false;
  private mensagemAberta = false;
  private elPrompt: HTMLElement;
  private elInventario: HTMLElement;
  private elToast: HTMLElement;
  private elMensagem: HTMLElement;
  private timerToast = 0;
  /** Inventário levado para a próxima área ao passar por uma saída. */
  private inventarioLevado: Map<string, number> | null = null;

  /** Personagem animado (null = retângulo provisório). */
  private pers: { dados: Personagem; quadros: Map<string, Texture[]>; animador: Animador } | null = null;
  private spritePers = new Sprite(Texture.EMPTY);
  private aterrissouHa = 9;
  private elAcao: HTMLElement | null = null;
  private estavaNoChao = false;

  /** Prepara o personagem animado do teste. carregar = textura de uma folha (caminho relativo a jogo/). */
  async definirPersonagem(dados: Personagem | null, carregar: (folha: string) => Promise<Texture>) {
    if (!dados || !dados.animacoes.parado) { this.pers = null; return; }
    const quadros = new Map<string, Texture[]>();
    for (const [estado, anim] of Object.entries(dados.animacoes)) {
      const base = await carregar(anim.folha);
      quadros.set(estado, Array.from({ length: anim.quadros }, (_, i) => {
        const r = retanguloQuadro(anim, base.width, i);
        return new Texture({ source: base.source, frame: new Rectangle(r.x, r.y, Math.min(r.w, base.width - r.x), Math.min(r.h, base.height - r.y)) });
      }));
    }
    this.pers = { dados, quadros, animador: new Animador(dados) };
  }

  /** Teclas de cada ação (ferramenta Controles; salvas no projeto). */
  set controles(c: Controles) { this.entradaJogo.controles = c; if (this.ativo) this.montarHud(); }
  get controles() { return this.entradaJogo.controles; }

  /** Saída para outra fase/área: o editor abre o destino e recomeça o teste lá. */
  aoIrPara: (destino: string) => void = () => {};

  /** Configuração do jogador (lida/salva no projeto). */
  config: ConfigJogador = { ...JOGADOR_PADRAO };
  aoMudarConfig: (c: ConfigJogador) => void = () => {};
  aoMudarEstado: () => void = () => {};

  constructor(private viewport: Viewport, private estado: Estado, centro: HTMLElement) {
    this.hud = el('div', { class: 'hud-teste' });
    this.hud.hidden = true;
    this.elPrompt = el('div', { class: 'teste-prompt' });
    this.elInventario = el('div', { class: 'teste-inventario' });
    this.elToast = el('div', { class: 'teste-toast', role: 'status' });
    this.elMensagem = el('div', { class: 'teste-mensagem', role: 'dialog' });
    for (const x of [this.elPrompt, this.elInventario, this.elToast, this.elMensagem]) { x.hidden = true; centro.append(x); }
    centro.append(this.hud);
  }

  get ativo() { return this.estado.testando; }

  iniciar() {
    if (this.ativo) return;
    const e = this.estado;
    e.selecionar(null);
    e.testando = true;
    this.colisoesAntes = e.mostrarColisoes;
    e.mostrarColisoes = false;
    this.cameraAntes = { ...e.camera };
    this.segs = montarSegmentos(e.fase.colisoes);
    this.reiniciarJogador();
    this.reiniciarMundo();
    this.entradaJogo.limpar();

    // Zoom para a tela do jogo caber inteira (inteiro, para a pixel art ficar nítida)
    const { w, h } = this.viewport.tamanhoTela();
    const [rw, rh] = e.fase.resolucaoBase;
    const caber = Math.min(w / rw, h / rh);
    // Zoom inteiro deixa a pixel art nítida; em telas pequenas usa o que couber
    e.camera.zoom = caber >= 2 ? Math.floor(caber) : caber;
    this.posicionarCamera(true);

    this.inserirGrafico();
    this.viewport.aposSincronizar = () => this.inserirGrafico();
    this.viewport.aoQuadro = (ms) => this.quadro(ms);
    window.addEventListener('keydown', this.tecla, true);
    window.addEventListener('keyup', this.soltarTecla, true);
    window.addEventListener('blur', this.perderFoco);
    this.montarHud();
    this.hud.hidden = false;
    if (!e.fase.colisoes.length) e.avisar('Esta fase ainda não tem colisão: o jogador vai cair. Desenhe o chão com a ferramenta Colisão (C).');
    else e.avisar('Testando a fase. Esc volta ao editor.');
    e.emit('opcoes');
    this.aoMudarEstado();
  }

  parar() {
    if (!this.ativo) return;
    const e = this.estado;
    e.testando = false;
    e.mostrarColisoes = this.colisoesAntes;
    Object.assign(e.camera, this.cameraAntes);
    this.viewport.aoQuadro = null;
    this.viewport.aposSincronizar = null;
    this.grafico.removeFromParent();
    this.grafico.clear();
    this.spritePers.removeFromParent();
    window.removeEventListener('keydown', this.tecla, true);
    window.removeEventListener('keyup', this.soltarTecla, true);
    window.removeEventListener('blur', this.perderFoco);
    this.hud.hidden = true;
    for (const x of [this.elPrompt, this.elInventario, this.elToast, this.elMensagem]) x.hidden = true;
    this.mensagemAberta = false;
    this.jogador = null;
    this.mundo = null;
    this.viewport.visibilidadeTeste = null;
    this.viewport.atualizarCena();
    e.emit('camera');
    e.emit('opcoes');
    e.avisar('De volta ao editor.');
    this.aoMudarEstado();
  }

  /** Itens, portas e alavancas voltam ao estado inicial (o inventário vem da área anterior, se houver). */
  private reiniciarMundo() {
    this.mundo = new MundoInterativo(this.estado.fase);
    if (this.inventarioLevado) for (const [k, v] of this.inventarioLevado) this.mundo.inventario.set(k, v);
    this.inventarioLevado = null;
    this.aplicarVisibilidade();
    this.atualizarInventario();
  }

  private aplicarVisibilidade() {
    const m = this.mundo;
    if (!m) return;
    this.viewport.visibilidadeTeste = new Map(this.estado.fase.objetos.map((o) => [o.id, m.visivel(o.id)]));
    this.viewport.atualizarCena();
  }

  private atualizarInventario() {
    const m = this.mundo;
    if (!m || !m.inventario.size) { this.elInventario.hidden = true; return; }
    this.elInventario.replaceChildren(el('strong', {}, 'Inventário'),
      ...[...m.inventario].map(([item, n]) => el('span', {}, n > 1 ? `${item} ×${n}` : item)));
    this.elInventario.hidden = false;
  }

  private toast(texto: string) {
    this.elToast.textContent = texto;
    this.elToast.hidden = false;
    clearTimeout(this.timerToast);
    this.timerToast = window.setTimeout(() => { this.elToast.hidden = true; }, 2600);
  }

  private tratar(r: ResultadoInteracao) {
    if (r.aviso) this.toast(r.aviso);
    if (r.mensagem) {
      this.mensagemAberta = true;
      this.elMensagem.replaceChildren(el('p', {}, r.mensagem), el('span', { class: 'teste-fechar' }, 'E ou Enter para fechar'));
      this.elMensagem.hidden = false;
    }
    if (r.irPara) {
      this.inventarioLevado = this.mundo ? new Map(this.mundo.inventario) : null;
      const destino = r.irPara;
      setTimeout(() => this.aoIrPara(destino));
    }
    this.aplicarVisibilidade();
    this.atualizarInventario();
  }

  /** Inventário que deve seguir para a próxima área (usado pelo editor ao trocar de fase). */
  levarInventario(inv: Map<string, number> | null) { this.inventarioLevado = inv; }
  get inventarioParaLevar() { return this.inventarioLevado; }

  private reiniciarJogador() {
    const [sx, sy] = this.estado.fase.spawnJogador;
    const cfg = { ...this.config };
    if (this.pers) { cfg.largura = this.pers.dados.caixa.largura; cfg.altura = this.pers.dados.caixa.altura; }
    this.jogador = new Jogador(cfg, sx, sy);
    this.aterrissouHa = 9;
    this.pers?.animador.parar();
  }

  /** O jogador é desenhado dentro da camada "Objetos" (atrás do primeiro plano, na frente do cenário). */
  private inserirGrafico() {
    const fase = this.estado.fase;
    const camada = fase.camadas.find((c) => c.id === 'objetos') ?? [...fase.camadas].reverse().find((c) => c.parallax[0] === 1) ?? fase.camadas[fase.camadas.length - 1];
    const cont = camada ? this.viewport.conteinerCamada(camada.id) : undefined;
    if (cont && this.grafico.parent !== cont) cont.addChild(this.grafico);
    if (cont && this.pers && this.spritePers.parent !== cont) cont.addChild(this.spritePers);
  }

  private tecla = (ev: KeyboardEvent) => {
    if (document.querySelector('.modal-fundo')) return;
    const alvo = ev.target as HTMLElement | null;
    if (alvo && this.hud.contains(alvo) && alvo.tagName === 'INPUT') return; // ajustando um controle do HUD
    if (ev.key === 'Escape' || ev.key === 'F5') { ev.preventDefault(); this.parar(); return; }
    if (ev.key === 'F6') { ev.preventDefault(); this.reiniciarJogador(); this.reiniciarMundo(); this.posicionarCamera(true); this.toast('Fase reiniciada'); return; }
    if (ev.code === 'KeyC' && ev.shiftKey && !this.usada('KeyC')) { this.estado.mostrarColisoes = !this.estado.mostrarColisoes; this.estado.emit('opcoes'); return; }
    if (this.mensagemAberta && (ev.key === 'Enter' || this.ehDaAcao(ev.code, 'interagir'))) {
      ev.preventDefault();
      this.mensagemAberta = false; this.elMensagem.hidden = true;
      return;
    }
    if (TECLAS_RESERVADAS.has(ev.code)) return;
    // Nada de rolar a página, digitar ou acionar atalhos do editor enquanto joga
    ev.preventDefault();
    ev.stopPropagation();
    this.entradaJogo.apertar(ev.code, performance.now() / 1000);
  };

  /** A tecla faz parte de algum atalho dos controles? */
  private usada(code: string) {
    return Object.values(this.controles.acoes).some((l) => l.some((a) => a.teclas.includes(normalizarCodigo(code))));
  }
  private ehDaAcao(code: string, acao: string) {
    return (this.controles.acoes[acao] ?? []).some((a) => a.teclas.includes(normalizarCodigo(code)));
  }

  private soltarTecla = (ev: KeyboardEvent) => { this.entradaJogo.soltar(ev.code); };
  private perderFoco = () => { this.entradaJogo.limpar(); };

  private entrada(): Entrada {
    const e = this.entradaJogo;
    const esquerda = e.segurando('esquerda'), direita = e.segurando('direita');
    const trava = this.pers?.animador.travaMovimento(esquerda !== direita) ?? false;
    return {
      esquerda: esquerda && !trava,
      direita: direita && !trava,
      pulo: e.segurando('pular'),
      puloApertado: this.puloApertado,
    };
  }

  private caixaJogador() {
    const j = this.jogador!;
    return { x: j.x - j.cfg.largura / 2, y: j.y - j.cfg.altura, w: j.cfg.largura, h: j.cfg.altura };
  }

  private quadro(ms: number) {
    const j = this.jogador;
    const m = this.mundo;
    if (!j || !m) return;
    if (this.mensagemAberta) { this.desenharJogador(0); return; } // jogo pausado lendo a mensagem
    const ent = this.entradaJogo;
    ent.atualizar(performance.now() / 1000);
    if (ent.apertou('pular')) this.puloApertado = true;
    if (ent.apertou('interagir')) this.interagirApertado = true;
    // Ações do personagem (animações extras): tiro, recarga…
    if (this.pers) {
      for (const [chave, anim] of extras(this.pers.dados)) {
        if (ent.apertou(chave) && this.pers.animador.tocar(chave, anim.repetir)) this.mostrarAcao(anim.nome ?? chave);
      }
    }
    const [fw, fh] = this.estado.fase.tamanho;
    this.acumulado = Math.min(this.acumulado + ms / 1000, 0.25);
    while (this.acumulado >= PASSO) {
      const segs = m.segmentosPortas().length ? this.segs.concat(m.segmentosPortas()) : this.segs;
      const vivo = j.passo(PASSO, this.entrada(), segs, fw, fh);
      this.puloApertado = false;
      this.acumulado -= PASSO;
      if (!vivo) {
        this.estado.avisar('Caiu para fora da fase: voltando ao início.');
        this.reiniciarJogador();
        this.posicionarCamera(true);
        return;
      }
    }
    // Coletáveis tocados
    const pegos = m.coletar(this.caixaJogador());
    if (pegos.length) { this.toast(pegos.join(' · ')); this.aplicarVisibilidade(); this.atualizarInventario(); }
    // Objeto interagível por perto (tecla E)
    const prox = m.proximo(this.caixaJogador());
    if (this.interagirApertado) {
      this.interagirApertado = false;
      if (prox) this.tratar(m.interagir(prox.o));
    }
    this.posicionarCamera(false, ms / 1000);
    this.desenharJogador(ms / 1000);
    this.mostrarPrompt(prox);
  }

  private mostrarPrompt(prox: { o: { x: number; y: number; w: number; escala: number; camada: string }; acao: string } | null) {
    if (!prox || this.mensagemAberta) { this.elPrompt.hidden = true; return; }
    const o = prox.o;
    const p = this.viewport.camadaParaTela(o.x + (o.w * o.escala) / 2, o.y, o.camada);
    this.elPrompt.replaceChildren(el('kbd', {}, 'E'), el('span', {}, prox.acao));
    this.elPrompt.style.left = `${Math.round(p.x)}px`;
    this.elPrompt.style.top = `${Math.round(p.y - 10)}px`;
    this.elPrompt.hidden = false;
  }

  /** Câmera do jogo seguindo o jogador (presa dentro da fase), com suavização. */
  private posicionarCamera(imediato: boolean, dt = 0) {
    const j = this.jogador;
    if (!j) return;
    const e = this.estado;
    const [rw, rh] = e.fase.resolucaoBase;
    const [fw, fh] = e.fase.tamanho;
    const preso = (v: number, max: number) => Math.min(Math.max(v, 0), Math.max(0, max));
    const alvoX = preso(j.x - rw / 2, fw - rw);
    const alvoY = preso(j.y - j.cfg.altura / 2 - rh / 2, fh - rh);
    if (imediato) this.camAlvo = { x: alvoX, y: alvoY };
    else {
      const k = 1 - Math.exp(-dt * 8);
      this.camAlvo.x += (alvoX - this.camAlvo.x) * k;
      this.camAlvo.y += (alvoY - this.camAlvo.y) * k;
    }
    // A visão do editor fica centrada na câmera do jogo (assim parallax e quadro batem com o jogo)
    const { w, h } = this.viewport.tamanhoTela();
    const z = e.camera.zoom;
    e.camera.x = Math.round(this.camAlvo.x) + rw / 2 - w / 2 / z;
    e.camera.y = Math.round(this.camAlvo.y) + rh / 2 - h / 2 / z;
  }

  private desenharJogador(dt = 0) {
    const j = this.jogador!;
    const g = this.grafico.clear();
    if (this.pers) {
      // Personagem animado: estado pela física (parado, andando, pulando, caindo, aterrissando)
      if (j.noChao && !this.estavaNoChao) this.aterrissouHa = 0; else this.aterrissouHa += dt;
      this.estavaNoChao = j.noChao;
      const p = this.pers.dados;
      const animador = this.pers.animador;
      const estado = estadoDoJogador(j, p.animacoes.aterrissando ? this.aterrissouHa : 9);
      const acao = animador.acaoAtual;
      const andando = j.noChao && Math.abs(j.vx) > 12;
      const r = animador.atualizar(dt, estado, andando, acao ? this.entradaJogo.segurando(acao) : false);
      if (acao && !animador.acaoAtual) this.mostrarAcao(null);
      const frames = r ? this.pers.quadros.get(r.chave) : undefined;
      if (r && frames?.length) {
        const sp = this.spritePers;
        sp.texture = frames[Math.min(r.quadro, frames.length - 1)];
        const anc = ancoraPes(p);
        sp.anchor.set(anc.ax, anc.ay);
        const esc = p.escala * r.anim.escala;
        const espelhar = j.olhandoDireita !== p.olhaDireita;
        sp.scale.set(espelhar ? -esc : esc, esc);
        sp.position.set(Math.round(j.x), Math.round(j.y));
        sp.visible = true;
      }
      if (this.estado.mostrarColisoes) {
        const w = j.cfg.largura, h = j.cfg.altura;
        g.rect(Math.round(j.x - w / 2) + 0.5, Math.round(j.y - h) + 0.5, w, h).stroke({ width: 1, color: 0xa7dd3e });
      }
      return;
    }
    const w = j.cfg.largura, h = j.cfg.altura;
    const x = Math.round(j.x - w / 2), y = Math.round(j.y - h);
    // Corpo provisório (a Lorena animada entra com o módulo de animação)
    g.rect(x, y, w, h).fill({ color: 0xa7dd3e, alpha: 0.9 }).stroke({ width: 1, color: 0x083933 });
    const olhoX = j.olhandoDireita ? x + w - 10 : x + 4;
    g.rect(olhoX, y + 12, 6, 6).fill({ color: 0x083933 });
    g.rect(x, y + h - 3, w, 3).fill({ color: 0x083933, alpha: 0.6 });
  }

  /** Mostra no HUD a ação tocando (ajuda a conferir os botões). */
  private mostrarAcao(nome: string | null) {
    if (!this.elAcao) return;
    this.elAcao.textContent = nome ? `Ação: ${nome}` : '';
    this.elAcao.hidden = !nome;
  }

  private textoDica() {
    const partes = [
      `${this.teclasDe('esquerda')} / ${this.teclasDe('direita')} andar`,
      `${this.teclasDe('pular')} pular`,
      `${this.teclasDe('interagir')} interagir`,
      ...(this.pers ? extras(this.pers.dados).filter(([k]) => this.controles.acoes[k]?.length).map(([k, a]) => `${this.teclasDe(k)} ${(a.nome ?? k).toLowerCase()}`) : []),
      'F6 reinicia · Esc volta',
    ];
    return partes.join(' · ');
  }

  /** "← → ou A D" etc., a partir dos controles atuais. */
  private teclasDe(acao: string) {
    const l = this.controles.acoes[acao] ?? [];
    return l.length ? l.map(textoAtalho).join(' ou ') : 'sem tecla';
  }

  // ---------- HUD ----------
  private montarHud() {
    const parar = el('button', { type: 'button', class: 'primario' }, 'Voltar ao editor');
    dica(parar, 'Voltar ao editor', 'Para o teste e volta para onde você estava.', 'Esc');
    parar.addEventListener('click', () => this.parar());
    const reiniciar = el('button', { type: 'button', class: 'secundario' }, 'Reiniciar');
    dica(reiniciar, 'Reiniciar', 'Volta o jogador para a bandeira de início.', 'F6');
    reiniciar.addEventListener('click', () => { this.reiniciarJogador(); this.reiniciarMundo(); this.posicionarCamera(true); });

    const ajustes = el('details', { class: 'hud-ajustes' }, el('summary', {}, 'Ajustes do jogador'));
    const campo = (rotulo: string, chave: keyof ConfigJogador, min: number, max: number, passo: number, un: string, texto: string) => {
      const id = 'hud-' + chave;
      const input = el('input', { type: 'range', id, min, max, step: passo, value: this.config[chave] });
      const saida = el('output', { for: id }, `${this.config[chave]} ${un}`);
      input.addEventListener('input', () => {
        this.config = { ...this.config, [chave]: Number(input.value) };
        if (this.jogador) this.jogador.cfg = { ...this.config, ...(this.pers ? { largura: this.pers.dados.caixa.largura, altura: this.pers.dados.caixa.altura } : {}) };
        saida.textContent = `${input.value} ${un}`;
      });
      input.addEventListener('change', () => { this.aoMudarConfig(this.config); input.blur(); });
      const lab = el('label', { for: id }, rotulo);
      dica(lab, rotulo, texto);
      return el('div', { class: 'deslizante' }, lab, input, saida);
    };
    ajustes.append(
      campo('Velocidade', 'velocidade', 60, 500, 10, 'px/s', 'Quão rápido o jogador anda.'),
      campo('Altura do pulo', 'alturaPulo', 20, 300, 5, 'px', 'Altura máxima do pulo segurando o botão. Soltando cedo, o pulo fica mais baixo.'),
      campo('Gravidade', 'gravidade', 400, 4000, 50, 'px/s²', 'Quanto mais alta, mais rápido o jogador cai (pulo mais "pesado").'),
      ...(this.pers ? [] : [
        campo('Largura', 'largura', 8, 120, 1, 'px', 'Largura da caixa de colisão do jogador.'),
        campo('Altura', 'altura', 16, 240, 1, 'px', 'Altura da caixa de colisão do jogador.')]),
    );
    if (this.pers) ajustes.append(el('p', { class: 'dica-campo' }, `Jogador: ${this.pers.dados.nome}. A caixa de colisão vem do personagem (editor de Personagens).`));
    this.hud.replaceChildren(
      el('div', { class: 'hud-topo' },
        el('span', { class: 'hud-titulo' }, '▶ Testando'),
        el('span', { class: 'hud-dica' }, this.textoDica()),
        this.elAcao = el('span', { class: 'hud-acao' }),
        reiniciar, parar),
      ajustes,
    );
  }
}
