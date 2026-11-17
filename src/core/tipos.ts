// Formato de dados de uma fase (salvo como JSON em jogo/fases/). Versão 1.

export interface Camada {
  id: string;
  nome: string;
  /** Quanto a camada acompanha a câmera: 0 = parada, 1 = junto com o jogador, >1 = primeiro plano. */
  parallax: [number, number];
  visivel: boolean;
  travada: boolean;
}

/** Estático = só visual/colisão. Interativo = o jogador pode interagir (comportamentos na ferramenta de interação). */
export type TipoObjeto = 'estatico' | 'interativo';

/** Fase = nível completo. Área = trecho que se conecta a outras áreas (estilo metroidvania). */
export type TipoCena = 'fase' | 'area';

export interface ObjetoFase {
  id: string;
  tipo: TipoObjeto;
  nome: string;
  /** Caminho relativo a jogo/ (ex.: "assets/itens/chave.png"). */
  asset: string;
  /** Imagem original de onde o objeto veio (relativo à raiz do projeto), usada para otimizar com qualidade. */
  origem?: string;
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
  tipo: TipoCena;
  /** Agrupa áreas e fases (ex.: "Laboratório", "Cidade"). Vazio = sem região. */
  regiao: string;
  resolucaoBase: [number, number];
  /** Tamanho da grade/tile em pixels. */
  tamanhoGrade: number;
  tamanho: [number, number];
  corFundo: string;
  /** Ordem de desenho: índice 0 = mais distante. */
  camadas: Camada[];
  objetos: ObjetoFase[];
  colisoes: unknown[];
  spawnJogador: [number, number];
}
