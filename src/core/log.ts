// Log da engine: um registro único do que acontece (teclas, personagem, mundo, código, erros e avisos do editor).
// O painel de Log (embaixo do cenário) e a Saída do painel de Código leem daqui. Durante o ▶ Testar, cada linha
// leva o tempo do teste; ao parar, o editor salva o teste inteiro em logs/ (raiz do projeto).
//
// REGRA DA ENGINE: todo módulo novo registra os próprios eventos aqui (LOG.add) na categoria certa,
// só quando algo MUDA (nunca a cada quadro), para o log continuar legível.

export type CategoriaLog = 'entrada' | 'personagem' | 'mundo' | 'codigo' | 'erro' | 'sistema';

export const CATEGORIAS: { id: CategoriaLog; nome: string; texto: string }[] = [
  { id: 'entrada', nome: 'Entrada', texto: 'Teclas apertadas e soltas, e qual ação cada uma disparou (ferramenta Controles).' },
  { id: 'personagem', nome: 'Personagem', texto: 'Mudanças de estado (parado, andando, pulando, caindo…) e animações das ações.' },
  { id: 'mundo', nome: 'Mundo', texto: 'Itens coletados, interações, portas, alavancas, troca de fase, quedas.' },
  { id: 'codigo', nome: 'Código', texto: 'jogo.log() e os ganchos que rodaram (menos aoAtualizar, que roda a cada quadro).' },
  { id: 'erro', nome: 'Erros', texto: 'Erros dos scripts e da engine (imagem que não carregou, falhas inesperadas).' },
  { id: 'sistema', nome: 'Editor', texto: 'Avisos do editor: salvou, abriu, começou/parou o teste.' },
];

export interface LinhaLog {
  cat: CategoriaLog;
  texto: string;
  /** Segundos desde o início do teste (null = fora do teste). */
  t: number | null;
  hora: number;
  /** Script e linha (erros e logs de código). */
  arquivo?: string;
  linha?: number;
}

const MAXIMO = 5000;

class RegistroLog {
  linhas: LinhaLog[] = [];
  readonly ouvintes = new Set<(nova: LinhaLog | null) => void>();
  private inicio: number | null = null;
  /** Linhas do teste atual (para salvar em arquivo ao parar). */
  private doTeste: LinhaLog[] = [];

  get testando() { return this.inicio !== null; }

  add(l: { cat: CategoriaLog; texto: string; arquivo?: string; linha?: number }) {
    const agora = performance.now();
    const linha: LinhaLog = { ...l, t: this.inicio === null ? null : (agora - this.inicio) / 1000, hora: Date.now() };
    this.linhas.push(linha);
    if (this.linhas.length > MAXIMO) this.linhas.splice(0, this.linhas.length - MAXIMO);
    if (this.inicio !== null && this.doTeste.length < MAXIMO * 4) this.doTeste.push(linha);
    for (const f of this.ouvintes) f(linha);
  }

  limpar() {
    this.linhas = [];
    for (const f of this.ouvintes) f(null);
  }

  iniciarTeste(descricao: string) {
    this.inicio = performance.now();
    this.doTeste = [];
    this.add({ cat: 'sistema', texto: `▶ Teste iniciado: ${descricao}` });
  }

  /** Encerra o teste e devolve o texto completo dele (para salvar). */
  terminarTeste(): string {
    this.add({ cat: 'sistema', texto: '■ Teste encerrado' });
    const texto = this.doTeste.map(formatarLinha).join('\n');
    this.inicio = null;
    this.doTeste = [];
    return texto;
  }
}

export const LOG = new RegistroLog();

const ROTULO: Record<CategoriaLog, string> = { entrada: 'ENTRADA', personagem: 'PERSON.', mundo: 'MUNDO', codigo: 'CÓDIGO', erro: 'ERRO', sistema: 'EDITOR' };

export function formatarTempo(l: LinhaLog) {
  if (l.t !== null) return `${l.t.toFixed(2).padStart(7)} s`;
  const d = new Date(l.hora);
  return d.toTimeString().slice(0, 8).padStart(9);
}

export function formatarLinha(l: LinhaLog) {
  return `${formatarTempo(l)}  ${ROTULO[l.cat].padEnd(7)}  ${l.texto}${l.arquivo ? `  [${l.arquivo}${l.linha ? `:${l.linha}` : ''}]` : ''}`;
}

/** Erros não tratados da página também vão para o log (qualquer falha da engine fica registrada). */
export function capturarErrosGlobais() {
  window.addEventListener('error', (e) => {
    LOG.add({ cat: 'erro', texto: `Erro inesperado: ${e.message}`, ...(e.filename ? { arquivo: e.filename.split('/').pop()!, linha: e.lineno } : {}) });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    LOG.add({ cat: 'erro', texto: `Falha não tratada: ${r instanceof Error ? r.message : String(r)}` });
  });
}
