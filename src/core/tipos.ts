// Formato de dados de uma fase (salvo como JSON em jogo/fases/). Versão 1.
import type { Efeito } from './efeitos';
import type { Comportamento } from './comportamentos';

/** Forma de colisão desenhada no cenário (espaço do mundo, parallax 1). */
export interface Colisao {
  id: string;
  /** solido = chão/parede/teto; atravessavel = só as bordas de cima seguram (sobe-se por baixo) */
  comportamento: 'solido' | 'atravessavel';
  /** Como foi criada (rótulo). bloco/rampa/poligono são fechadas; linha é aberta (inclui mão livre). */
  forma: 'bloco' | 'rampa' | 'poligono' | 'linha';
  /** Vértices em pixels do mundo. */
  pontos: [number, number][];
}

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
  efeitos: Efeito[];
  /** Comportamento do objeto interativo (por enquanto, um só). */
  comportamentos: Comportamento[];
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
  colisoes: Colisao[];
  /** Onde ficam os PÉS do jogador ao começar (espaço do mundo). */
  spawnJogador: [number, number];
}
