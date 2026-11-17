// Estado central do editor: fase aberta, seleção, câmera, opções e histórico (desfazer/refazer).
import { criarFase } from '../core/fase';
import type { Camada, Fase, ObjetoFase } from '../core/tipos';

export type Evento = 'fase' | 'selecao' | 'camera' | 'opcoes' | 'arquivo' | 'mensagem';

const LIMITE_HISTORICO = 200;

export class Estado {
  fase: Fase = criarFase('Fase 01');
  /** Nome do arquivo em jogo/fases (null = ainda não salva). */
  arquivoFase: string | null = null;
  sujo = false;

  selecionado: string | null = null;
  camadaAtiva = 'objetos';

  /** Canto superior esquerdo da visão, em pixels do mundo (camadas com parallax 1). */
  camera = { x: 0, y: 0, zoom: 2 };

  grade = true;
  encaixar = false;
  tamanhoGrade = 16;
  previaParallax = true;

  mensagem = '';

  private desfazerPilha: string[] = [];
  private refazerPilha: string[] = [];
  private ouvintes = new Map<Evento, Set<() => void>>();

  on(evento: Evento, fn: () => void) {
    if (!this.ouvintes.has(evento)) this.ouvintes.set(evento, new Set());
    this.ouvintes.get(evento)!.add(fn);
  }

  emit(evento: Evento) {
    this.ouvintes.get(evento)?.forEach((fn) => fn());
  }

  avisar(msg: string) {
    this.mensagem = msg;
    this.emit('mensagem');
  }

  // ---------- Histórico ----------

  /** Salva o estado atual da fase para poder desfazer. Chamar ANTES de alterar. */
  checkpoint() {
    this.desfazerPilha.push(JSON.stringify(this.fase));
    if (this.desfazerPilha.length > LIMITE_HISTORICO) this.desfazerPilha.shift();
    this.refazerPilha = [];
  }

  /** Altera a fase registrando no histórico. */
  alterar(fn: (f: Fase) => void) {
    this.checkpoint();
    fn(this.fase);
    this.marcarAlterado();
  }

  marcarAlterado() {
    this.sujo = true;
    this.emit('fase');
    this.emit('arquivo');
  }

  desfazer() { this.trocarHistorico(this.desfazerPilha, this.refazerPilha, 'Desfeito'); }
  refazer() { this.trocarHistorico(this.refazerPilha, this.desfazerPilha, 'Refeito'); }

  private trocarHistorico(de: string[], para: string[], msg: string) {
    const anterior = de.pop();
    if (!anterior) return;
    para.push(JSON.stringify(this.fase));
    this.fase = JSON.parse(anterior) as Fase;
    if (this.selecionado && !this.objeto(this.selecionado)) this.selecionado = null;
    this.marcarAlterado();
    this.emit('selecao');
    this.avisar(msg);
  }

  /** Troca a fase inteira (nova ou aberta do disco) e limpa o histórico. */
  carregarFase(fase: Fase, arquivo: string | null) {
    this.fase = fase;
    this.arquivoFase = arquivo;
    this.sujo = false;
    this.selecionado = null;
    this.desfazerPilha = [];
    this.refazerPilha = [];
    if (!fase.camadas.some((c) => c.id === this.camadaAtiva)) {
      this.camadaAtiva = fase.camadas[fase.camadas.length - 1]?.id ?? '';
    }
    this.emit('fase');
    this.emit('selecao');
    this.emit('arquivo');
  }

  // ---------- Consultas ----------

  objeto(id: string): ObjetoFase | undefined {
    return this.fase.objetos.find((o) => o.id === id);
  }

  objetoSelecionado(): ObjetoFase | undefined {
    return this.selecionado ? this.objeto(this.selecionado) : undefined;
  }

  camada(id: string): Camada | undefined {
    return this.fase.camadas.find((c) => c.id === id);
  }

  selecionar(id: string | null) {
    if (this.selecionado === id) return;
    this.selecionado = id;
    this.emit('selecao');
  }

  ativarCamada(id: string) {
    if (this.camadaAtiva === id) return;
    this.camadaAtiva = id;
    this.emit('fase');
  }
}
