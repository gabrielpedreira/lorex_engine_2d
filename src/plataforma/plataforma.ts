// Abstrai onde os arquivos do projeto vivem: no disco (Electron) ou na demo do navegador.

export interface InfoProjeto {
  nome: string;
}

export interface Plataforma {
  readonly tipo: 'electron' | 'navegador';
  /** Abre o seletor de pasta (só no Electron). */
  abrirProjeto(): Promise<InfoProjeto | null>;
  /** Projeto já aberto ou o último usado. */
  projetoAtual(): Promise<InfoProjeto | null>;
  /** Imagens do projeto, caminhos relativos à raiz (ex.: "chaves e itens/chave.png"). */
  listarAssets(): Promise<string[]>;
  /** Garante que o asset esteja em jogo/assets e devolve o caminho relativo a jogo/. */
  garantirEmUso(caminhoRaiz: string): Promise<string>;
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
