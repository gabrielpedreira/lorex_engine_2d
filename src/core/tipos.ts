// Formato de dados de uma fase (salvo como JSON em jogo/fases/). Versão 1.
import type { Efeito } from './efeitos';
import type { Comportamento } from './comportamentos';
import type { AnimFolha } from './folha';

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
  /** Script do objeto (arquivo em jogo/scripts/, ex.: "fase_01.obj_003.js"), ou null. */
  script: string | null;
  /** Objeto animado: a imagem é um spritesheet (w/h passam a ser o tamanho de UM quadro). */
  anim?: AnimFolha;
  /** Campos do jogo (Definições do jogo). */
  campos?: Record<string, number | string | boolean>;
}

/** Um inimigo colocado na fase. O tipo (animações, IA, vida) vem do personagem NPC. */
export interface InimigoFase {
  id: string;
  /** Arquivo do personagem NPC em jogo/personagens/ (ex.: "zumbi.json"). */
  personagem: string;
  /** Posição dos pés. */
  x: number;
  y: number;
  /** Começa olhando para a direita? */
  olhandoDireita: boolean;
  /** Spawner: só aparece quando o jogador entra neste gatilho (id do objeto). Vazio = desde o início. */
  surge?: string;
}

export type FormaLuz = 'circulo' | 'cone' | 'retangulo';

/** Ponto de luz (ferramenta Iluminação). Só aparece quando a fase está escura. */
export interface LuzFase {
  id: string;
  nome: string;
  /** circulo = lâmpada/fogo; cone = poste, holofote, lanterna; retangulo = janela, luminária tubular, porta aberta. */
  forma: FormaLuz;
  /** Cone: direção (graus; 0 = direita, 90 = para baixo). Retângulo: rotação. */
  angulo: number;
  /** Cone: abertura (graus). */
  abertura: number;
  /** Retângulo: tamanho (px). */
  largura: number;
  altura: number;
  /** Centro, no mundo (camadas com parallax 1). */
  x: number;
  y: number;
  raio: number;
  /** 0 a 1: quanto clareia o centro. */
  intensidade: number;
  /** Cor do brilho (branco = luz neutra). */
  cor: string;
  /** Pisca/tremula como lâmpada com defeito ou fogo. */
  tremular: boolean;
  ligada: boolean;
}

/** Escuridão da fase (ferramenta Iluminação). */
export interface Iluminacao {
  /** A fase é escura? (desligado = tudo iluminado, as luzes não aparecem) */
  escura: boolean;
  /** 0 a 1: quão escuro fica longe das luzes. */
  escuridao: number;
  /** Cor da escuridão (preto, azul-noite…). */
  cor: string;
  /** Raio da luz em volta do jogador (lanterna); 0 = sem. */
  lanterna: number;
  /** Lanterna em volta (círculo) ou apontada para onde o jogador olha (cone). */
  lanternaForma: 'circulo' | 'cone';
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
  /** Script da fase (arquivo em jogo/scripts/), se houver. */
  script?: string;
  /** Inimigos colocados na fase (ferramenta Inimigos). */
  inimigos: InimigoFase[];
  /** Pontos de luz (ferramenta Iluminação). */
  luzes: LuzFase[];
  iluminacao: Iluminacao;
  /** Campos do jogo (Definições do jogo). */
  campos?: Record<string, number | string | boolean>;
}
