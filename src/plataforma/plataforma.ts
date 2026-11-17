// Abstrai onde os arquivos do projeto vivem: no disco (Electron) ou na demo do navegador.

export interface InfoProjeto {
  nome: string;
  /** Caminho completo da pasta (só no Electron). */
  caminho?: string;
}

/** Uma ferramenta da caixa de ferramentas = uma pasta do projeto com imagens. */
export interface Ferramenta {
  /** Pasta relativa à raiz do projeto (ex.: "elementos de cenario"). */
  pasta: string;
  nome: string;
  /** Tipo dado aos objetos colocados com esta ferramenta. */
  tipoPadrao: 'estatico' | 'interativo';
}

/** Configuração do projeto inteiro (jogo/projeto.json). Vale para as fases novas. */
export interface ConfigProjeto {
  /** Pastas da caixa de ferramentas. */
  ferramentas?: Ferramenta[];
  /** Ajustes do jogador usados no ▶ Testar (tamanho, velocidade, pulo, gravidade). */
  jogador?: import('../core/fisica').ConfigJogador;
  /** Última escala usada para cada imagem (caminho relativo à raiz) — o carimbo reaproveita. */
  escalas?: Record<string, number>;
  /** Cópias otimizadas (reduzidas) de cada imagem original: origem → asset em jogo/ e tamanho. */
  otimizados?: Record<string, { asset: string; w: number; h: number }>;
  /** Resolução do jogo em pixels de arte (o "formato de pixels"). */
  resolucaoBase: [number, number];
  /** Tamanho da grade/tile em pixels. */
  tamanhoGrade: number;
}

export const CONFIG_PADRAO: ConfigProjeto = { resolucaoBase: [640, 360], tamanhoGrade: 16 };

export interface ResultadoOtimizacao { asset: string; w: number; h: number; bytesAntes: number; bytesDepois: number; pixelsAntes: number }

export interface Plataforma {
  readonly tipo: 'electron' | 'navegador';
  versao(): Promise<string>;
  /** Mensagem de carregamento para a splash. */
  progresso(texto: string): void;
  /** Avisa que a interface está pronta (fecha a splash e mostra o editor). */
  pronto(): void;
  recentes(): Promise<InfoProjeto[]>;
  /** Avisa quando algo em jogo/ muda fora do editor (ex.: o Claude editou uma fase). */
  aoMudarProjeto(fn: (m: { tipo: 'fase' | 'config' | 'assets'; nome: string }) => void): void;
  abrirCaminho(caminho: string): Promise<InfoProjeto | null>;
  lerConfigProjeto(): Promise<ConfigProjeto | null>;
  salvarConfigProjeto(c: ConfigProjeto): Promise<void>;
  /** Abre o seletor de pasta (só no Electron). */
  abrirProjeto(): Promise<InfoProjeto | null>;
  /** Projeto já aberto ou o último usado. */
  projetoAtual(): Promise<InfoProjeto | null>;
  /** Imagens do projeto, caminhos relativos à raiz (ex.: "chaves e itens/chave.png"). */
  listarAssets(): Promise<string[]>;
  /** Garante que o asset esteja em jogo/assets e devolve o caminho relativo a jogo/. */
  garantirEmUso(caminhoRaiz: string): Promise<string>;
  /** Manda para a Lixeira os arquivos de jogo/assets sem uso em nenhuma fase. Retorna os removidos. */
  limparNaoUsados(emUsoAgora: string[]): Promise<string[]>;
  /** Gera cópia reduzida em jogo/assets (só Electron). null = indisponível. */
  otimizarAsset(fonteRaiz: string, largura: number, altura: number): Promise<ResultadoOtimizacao | null>;
  listarFases(): Promise<string[]>;
  lerFase(nome: string): Promise<string>;
  salvarFase(nome: string, conteudo: string): Promise<void>;
  /** URL para exibir um arquivo relativo à raiz do projeto. */
  urlRaiz(caminhoRaiz: string): string;
}

/** URL de um asset usado em fase (caminho relativo a jogo/). */
export function urlAsset(p: Plataforma, caminhoJogo: string): string {
  return p.urlRaiz(normalizarCaminho('jogo/' + caminhoJogo));
}

export function normalizarCaminho(c: string): string {
  const saida: string[] = [];
  for (const parte of c.split('/')) {
    if (parte === '' || parte === '.') continue;
    if (parte === '..') saida.pop();
    else saida.push(parte);
  }
  return saida.join('/');
}

export function codificarCaminho(c: string): string {
  return c.split('/').map(encodeURIComponent).join('/');
}
