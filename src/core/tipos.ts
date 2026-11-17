// Formato de dados de uma fase (salvo como JSON em jogo/fases/). Versão 1.

export interface Camada {
  id: string;
  nome: string;
  /** Quanto a camada acompanha a câmera: 0 = parada, 1 = junto com o jogador, >1 = primeiro plano. */
  parallax: [number, number];
  visivel: boolean;
  travada: boolean;
}

export interface ObjetoFase {
  id: string;
  nome: string;
  /** Caminho relativo a jogo/ (ex.: "assets/itens/chave.png"). */
  asset: string;
  camada: string;
  /** Canto superior esquerdo, em pixels, no espaço da camada. */
  x: number;
  y: number;
  /** Tamanho original da imagem, em pixels. */
  w: number;
  h: number;
  escala: number;
  /** Graus. */
  rotacao: number;
  espelharX: boolean;
  espelharY: boolean;
  opacidade: number;
  visivel: boolean;
  efeitos: unknown[];
  comportamentos: unknown[];
  conexoes: Record<string, string>;
  script: string | null;
}

export interface Fase {
  versao: number;
  nome: string;
  resolucaoBase: [number, number];
  tamanho: [number, number];
  corFundo: string;
  /** Ordem de desenho: índice 0 = mais distante. */
  camadas: Camada[];
  objetos: ObjetoFase[];
  colisoes: unknown[];
  spawnJogador: [number, number];
}
