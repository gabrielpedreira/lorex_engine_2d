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
/** Pastas de dados em jogo/: personagens (.json) e scripts de código (.js). */
export type PastaDados = 'personagens' | 'scripts' | 'armas';

export interface ConfigProjeto {
  /** Pastas da caixa de ferramentas. */
  ferramentas?: Ferramenta[];
  /** Personagem animado usado no ▶ Testar (arquivo em jogo/personagens/). Vazio = retângulo provisório. */
  personagemTeste?: string;
  /** Elementos do HUD (ferramenta HUD). Vazio = padrão (munição). */
  hud?: import('../core/hud').ConfigHud;
  /** Menu do jogo (ferramenta Menu e itens). */
  menu?: import('../core/menu').ConfigMenu;
  /** Catálogo de itens, combinações e mensagens (ferramenta Menu e itens). */
  itens?: import('../core/menu').ConfigItens;
  /** Mapa: salas, passagens e transições (ferramenta Mapa). */
  mapa?: import('../core/mapa').Mapa;
  /** Teclas de cada ação (ferramenta Controles). Vazio = padrão. */
  controles?: import('../core/controles').Controles;
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
  aoMudarProjeto(fn: (m: { tipo: 'fase' | 'config' | 'assets' | 'personagem' | 'script' | 'arma'; nome: string }) => void): void;
  abrirCaminho(caminho: string): Promise<InfoProjeto | null>;
  lerConfigProjeto(): Promise<ConfigProjeto | null>;
  salvarConfigProjeto(c: ConfigProjeto): Promise<void>;
  /** Abre o seletor de pasta (só no Electron). */
  abrirProjeto(): Promise<InfoProjeto | null>;
  /** Projeto já aberto ou o último usado. */
  projetoAtual(): Promise<InfoProjeto | null>;
  /** Imagens do projeto, caminhos relativos à raiz (ex.: "chaves e itens/chave.png"). */
  listarAssets(): Promise<string[]>;
  /** Recopia para jogo/assets as imagens cujo original (apoio) é mais novo que a cópia. Devolve as atualizadas. */
  atualizarCopias(pares: [string, string][]): Promise<string[]>;
  /** Data de modificação (ms) de um arquivo relativo à raiz; 0 = não existe ou indisponível. */
  dataArquivo(caminhoRaiz: string): Promise<number>;
  /** Sons do projeto (.ogg, .mp3, .wav), caminhos relativos à raiz. */
  listarSons(): Promise<string[]>;
  /** Garante que o asset esteja em jogo/assets e devolve o caminho relativo a jogo/. categoria: subpasta (ex.: "personagens/lorena"). */
  garantirEmUso(caminhoRaiz: string, categoria?: string): Promise<string>;
  /** Dados de jogo/<pasta>/: personagens (.json) e scripts (.js). */
  listarDados(pasta: PastaDados): Promise<string[]>;
  lerDados(pasta: PastaDados, nome: string): Promise<string>;
  salvarDados(pasta: PastaDados, nome: string, conteudo: string): Promise<void>;
  /** Salva o log de um teste em logs/ (raiz do projeto). Devolve o caminho ('' = não salvou, ex.: navegador). */
  salvarLog(nome: string, conteudo: string): Promise<string>;
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

/** Muda quando o usuário pede para atualizar as imagens: entra na URL para não usar a versão antiga em cache. */
export let versaoImagens = 0;
export function novaVersaoImagens() { versaoImagens = Date.now(); }
/** Sufixo de URL que força recarregar a imagem depois de "Atualizar". */
export const anticache = () => (versaoImagens ? `?v=${versaoImagens}` : '');

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
