// ▶ Testar: joga a fase dentro do editor, com o jogador correndo e pulando sobre as colisões desenhadas.
import { Graphics } from 'pixi.js';
import { Jogador, JOGADOR_PADRAO, montarSegmentos, type ConfigJogador, type Entrada, type Segmento } from '../core/fisica';
import { el } from '../ui/dom';
import { dica } from '../ui/legenda';
import type { Estado } from './estado';
import type { Viewport } from './viewport';

const PASSO = 1 / 120; // física em passo fixo (estável em qualquer taxa de quadros)

export class ModoTeste {
  private jogador: Jogador | null = null;
  private segs: Segmento[] = [];
  private teclas = new Set<string>();
  private puloApertado = false;
  private acumulado = 0;
  private cameraAntes = { x: 0, y: 0, zoom: 1 };
  private colisoesAntes = true;
  private grafico = new Graphics();
  private hud: HTMLElement;
  private camAlvo = { x: 0, y: 0 };

  /** Configuração do jogador (lida/salva no projeto). */
  config: ConfigJogador = { ...JOGADOR_PADRAO };
  aoMudarConfig: (c: ConfigJogador) => void = () => {};
  aoMudarEstado: () => void = () => {};

  constructor(private viewport: Viewport, private estado: Estado, centro: HTMLElement) {
    this.hud = el('div', { class: 'hud-teste' });
    this.hud.hidden = true;
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
    this.teclas.clear();

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
    window.removeEventListener('keydown', this.tecla, true);
    window.removeEventListener('keyup', this.soltarTecla, true);
    window.removeEventListener('blur', this.perderFoco);
    this.hud.hidden = true;
    this.jogador = null;
    e.emit('camera');
    e.emit('opcoes');
    e.avisar('De volta ao editor.');
    this.aoMudarEstado();
  }

  private reiniciarJogador() {
    const [sx, sy] = this.estado.fase.spawnJogador;
    this.jogador = new Jogador({ ...this.config }, sx, sy);
  }

  /** O jogador é desenhado dentro da camada "Objetos" (atrás do primeiro plano, na frente do cenário). */
  private inserirGrafico() {
    const fase = this.estado.fase;
    const camada = fase.camadas.find((c) => c.id === 'objetos') ?? [...fase.camadas].reverse().find((c) => c.parallax[0] === 1) ?? fase.camadas[fase.camadas.length - 1];
    const cont = camada ? this.viewport.conteinerCamada(camada.id) : undefined;
    if (cont && this.grafico.parent !== cont) cont.addChild(this.grafico);
  }

  private tecla = (ev: KeyboardEvent) => {
    if (document.querySelector('.modal-fundo')) return;
    const alvo = ev.target as HTMLElement | null;
    if (alvo && this.hud.contains(alvo) && alvo.tagName === 'INPUT') return; // ajustando um controle do HUD
    const k = ev.key.toLowerCase();
    if (k === 'escape' || ev.key === 'F5') { ev.preventDefault(); this.parar(); return; }
    if (k === 'r') { this.reiniciarJogador(); this.posicionarCamera(true); return; }
    if (k === 'c' && ev.shiftKey) { this.estado.mostrarColisoes = !this.estado.mostrarColisoes; this.estado.emit('opcoes'); return; }
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k)) ev.preventDefault();
    if (!this.teclas.has(k) && [' ', 'w', 'arrowup', 'z'].includes(k)) this.puloApertado = true;
    this.teclas.add(k);
    ev.stopPropagation();
  };

  private soltarTecla = (ev: KeyboardEvent) => { this.teclas.delete(ev.key.toLowerCase()); };
  private perderFoco = () => { this.teclas.clear(); };

  private entrada(): Entrada {
    const t = this.teclas;
    return {
      esquerda: t.has('arrowleft') || t.has('a'),
      direita: t.has('arrowright') || t.has('d'),
      pulo: t.has(' ') || t.has('w') || t.has('arrowup') || t.has('z'),
      puloApertado: this.puloApertado,
    };
  }

  private quadro(ms: number) {
    const j = this.jogador;
    if (!j) return;
    const [fw, fh] = this.estado.fase.tamanho;
    this.acumulado = Math.min(this.acumulado + ms / 1000, 0.25);
    while (this.acumulado >= PASSO) {
      const vivo = j.passo(PASSO, this.entrada(), this.segs, fw, fh);
      this.puloApertado = false;
      this.acumulado -= PASSO;
      if (!vivo) {
        this.estado.avisar('Caiu para fora da fase: voltando ao início.');
        this.reiniciarJogador();
        this.posicionarCamera(true);
        return;
      }
    }
    this.posicionarCamera(false, ms / 1000);
    this.desenharJogador();
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

  private desenharJogador() {
    const j = this.jogador!;
    const g = this.grafico.clear();
    const w = j.cfg.largura, h = j.cfg.altura;
    const x = Math.round(j.x - w / 2), y = Math.round(j.y - h);
    // Corpo provisório (a Lorena animada entra com o módulo de animação)
    g.rect(x, y, w, h).fill({ color: 0xa7dd3e, alpha: 0.9 }).stroke({ width: 1, color: 0x083933 });
    const olhoX = j.olhandoDireita ? x + w - 10 : x + 4;
    g.rect(olhoX, y + 12, 6, 6).fill({ color: 0x083933 });
    g.rect(x, y + h - 3, w, 3).fill({ color: 0x083933, alpha: 0.6 });
  }

  // ---------- HUD ----------
  private montarHud() {
    const parar = el('button', { type: 'button', class: 'primario' }, 'Voltar ao editor');
    dica(parar, 'Voltar ao editor', 'Para o teste e volta para onde você estava.', 'Esc');
    parar.addEventListener('click', () => this.parar());
    const reiniciar = el('button', { type: 'button', class: 'secundario' }, 'Reiniciar');
    dica(reiniciar, 'Reiniciar', 'Volta o jogador para a bandeira de início.', 'R');
    reiniciar.addEventListener('click', () => { this.reiniciarJogador(); this.posicionarCamera(true); });

    const ajustes = el('details', { class: 'hud-ajustes' }, el('summary', {}, 'Ajustes do jogador'));
    const campo = (rotulo: string, chave: keyof ConfigJogador, min: number, max: number, passo: number, un: string, texto: string) => {
      const id = 'hud-' + chave;
      const input = el('input', { type: 'range', id, min, max, step: passo, value: this.config[chave] });
      const saida = el('output', { for: id }, `${this.config[chave]} ${un}`);
      input.addEventListener('input', () => {
        this.config = { ...this.config, [chave]: Number(input.value) };
        if (this.jogador) this.jogador.cfg = { ...this.config };
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
      campo('Largura', 'largura', 8, 120, 1, 'px', 'Largura da caixa de colisão do jogador.'),
      campo('Altura', 'altura', 16, 240, 1, 'px', 'Altura da caixa de colisão do jogador (Lorena: frames de 128 px).'),
    );
    this.hud.replaceChildren(
      el('div', { class: 'hud-topo' },
        el('span', { class: 'hud-titulo' }, '▶ Testando'),
        el('span', { class: 'hud-dica' }, '← → ou A D andar · Espaço, W ou ↑ pular · R reinicia · Shift+C colisões · Esc volta'),
        reiniciar, parar),
      ajustes,
    );
  }
}
