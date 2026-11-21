// Estado central do editor: fase aberta, seleção, câmera, opções e histórico (desfazer/refazer).
import { LOG } from '../core/log';
import { criarFase } from '../core/fase';
import type { Camada, Fase, LuzFase, ObjetoFase } from '../core/tipos';

export type Evento = 'fase' | 'selecao' | 'camera' | 'opcoes' | 'arquivo' | 'mensagem' | 'modo';

/** Ferramenta ativa no cenário. */
export type Modo = 'selecionar' | 'mao' | 'colisao' | 'inicio' | 'inimigo' | 'luz' | 'zona';
/** Forma desenhada pela ferramenta Colisão. */
export type FormaNova = 'bloco' | 'rampa-direita' | 'rampa-esquerda' | 'poligono' | 'linha' | 'maoLivre';

const LIMITE_HISTORICO = 200;

export class Estado {
  fase: Fase = criarFase('Fase 01');
  /** Nome do arquivo em jogo/fases (null = ainda não salva). */
  arquivoFase: string | null = null;
  sujo = false;

  selecionado: string | null = null;
  /** Colisão selecionada (só no modo Colisão). */
  colisaoSelecionada: string | null = null;
  /** Inimigo colocado selecionado (ferramenta Inimigos). */
  inimigoSelecionado: string | null = null;
  /** Luz selecionada (ferramenta Iluminação). */
  luzSelecionada: string | null = null;
  /** Mostra a escuridão no editor (fases escuras). */
  previaLuz = true;
  /** Tipo (personagem NPC) que a ferramenta Inimigos coloca ao clicar. */
  tipoInimigoNovo = '';
  camadaAtiva = 'objetos';

  modo: Modo = 'selecionar';
  formaNova: FormaNova = 'bloco';
  comportamentoNovo: 'solido' | 'atravessavel' = 'solido';
  /** Modo "clique no objeto alvo" (ex.: alvo de uma alavanca). */
  escolhendoAlvo: ((id: string | null) => void) | null = null;
  /** Modo ▶ Testar ativo (edição bloqueada). */
  testando = false;
  mostrarColisoes = true;
  previaEfeitos = true;

  /** Canto superior esquerdo da visão, em pixels do mundo (camadas com parallax 1). */
  camera = { x: 0, y: 0, zoom: 2 };

  grade = true;
  encaixar = false;
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
    LOG.add({ cat: /não consegui|erro|falhou|não achei|não existe/i.test(msg) ? 'erro' : 'sistema', texto: msg });
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
    if (this.colisaoSelecionada && !this.colisao(this.colisaoSelecionada)) this.colisaoSelecionada = null;
    if (this.inimigoSelecionado && !this.inimigo(this.inimigoSelecionado)) this.inimigoSelecionado = null;
    if (this.luzSelecionada && !this.luz(this.luzSelecionada)) this.luzSelecionada = null;
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
    this.colisaoSelecionada = null;
    this.inimigoSelecionado = null;
    this.luzSelecionada = null;
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
    if (this.selecionado === id && !this.colisaoSelecionada && !this.inimigoSelecionado && !this.luzSelecionada) return;
    this.selecionado = id;
    this.colisaoSelecionada = null;
    this.inimigoSelecionado = null;
    this.luzSelecionada = null;
    this.emit('selecao');
  }

  inimigo(id: string) { return this.fase.inimigos.find((i) => i.id === id); }

  selecionarInimigo(id: string | null) {
    if (this.inimigoSelecionado === id && !this.selecionado && !this.colisaoSelecionada) return;
    this.inimigoSelecionado = id;
    this.selecionado = null;
    this.colisaoSelecionada = null;
    this.luzSelecionada = null;
    this.emit('selecao');
  }

  colisao(id: string) {
    return this.fase.colisoes.find((c) => c.id === id);
  }

  selecionarColisao(id: string | null) {
    if (this.colisaoSelecionada === id && !this.selecionado) return;
    this.colisaoSelecionada = id;
    this.selecionado = null;
    this.inimigoSelecionado = null;
    this.luzSelecionada = null;
    this.emit('selecao');
  }

  luz(id: string): LuzFase | undefined { return this.fase.luzes.find((l) => l.id === id); }

  selecionarLuz(id: string | null) {
    if (this.luzSelecionada === id && !this.selecionado) return;
    this.luzSelecionada = id;
    this.selecionado = null;
    this.colisaoSelecionada = null;
    this.inimigoSelecionado = null;
    this.emit('selecao');
  }

  definirModo(m: Modo) {
    if (this.modo === m) return;
    this.modo = m;
    if (m !== 'colisao') this.colisaoSelecionada = null;
    if (m !== 'selecionar') this.selecionado = null;
    if (m !== 'selecionar' && m !== 'inimigo') this.inimigoSelecionado = null;
    if (m !== 'selecionar' && m !== 'luz') this.luzSelecionada = null;
    this.emit('modo');
    this.emit('selecao');
  }

  ativarCamada(id: string) {
    if (this.camadaAtiva === id) return;
    this.camadaAtiva = id;
    this.emit('fase');
  }
}
