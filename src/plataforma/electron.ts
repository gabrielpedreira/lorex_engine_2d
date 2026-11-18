import { codificarCaminho, type ConfigProjeto, type InfoProjeto, type Plataforma, type ResultadoOtimizacao, type PastaDados } from './plataforma';

interface ApiLorex {
  versao(): Promise<string>;
  progresso(texto: string): void;
  pronto(): void;
  recentes(): Promise<InfoProjeto[]>;
  aoMudarProjeto(fn: (m: { tipo: 'fase' | 'config' | 'assets' | 'personagem' | 'script'; nome: string }) => void): void;
  abrirCaminho(caminho: string): Promise<InfoProjeto | null>;
  lerConfigProjeto(): Promise<ConfigProjeto | null>;
  salvarConfigProjeto(c: ConfigProjeto): Promise<boolean>;
  abrirProjeto(): Promise<InfoProjeto | null>;
  projetoAtual(): Promise<InfoProjeto | null>;
  listarAssets(): Promise<string[]>;
  garantirEmUso(relRaiz: string, categoria?: string): Promise<string>;
  listarDados(pasta: string): Promise<string[]>;
  lerDados(pasta: string, nome: string): Promise<string>;
  salvarDados(pasta: string, nome: string, conteudo: string): Promise<boolean>;
  salvarLog(nome: string, conteudo: string): Promise<string>;
  otimizarAsset(fonteRaiz: string, largura: number, altura: number): Promise<ResultadoOtimizacao>;
  limparNaoUsados(emUsoAgora: string[]): Promise<string[]>;
  listarFases(): Promise<string[]>;
  lerFase(nome: string): Promise<string>;
  salvarFase(nome: string, conteudo: string): Promise<boolean>;
}

declare global {
  interface Window { lorex?: ApiLorex }
}

export function temElectron(): boolean {
  return typeof window !== 'undefined' && !!window.lorex;
}

export class PlataformaElectron implements Plataforma {
  readonly tipo = 'electron' as const;
  private api = window.lorex!;

  versao() { return this.api.versao(); }
  progresso(t: string) { this.api.progresso(t); }
  pronto() { this.api.pronto(); }
  recentes() { return this.api.recentes(); }
  aoMudarProjeto(fn: (m: { tipo: 'fase' | 'config' | 'assets' | 'personagem' | 'script'; nome: string }) => void) { this.api.aoMudarProjeto(fn); }
  abrirCaminho(c: string) { return this.api.abrirCaminho(c); }
  lerConfigProjeto() { return this.api.lerConfigProjeto(); }
  async salvarConfigProjeto(c: ConfigProjeto) { await this.api.salvarConfigProjeto(c); }
  abrirProjeto() { return this.api.abrirProjeto(); }
  projetoAtual() { return this.api.projetoAtual(); }
  listarAssets() { return this.api.listarAssets(); }
  garantirEmUso(c: string, categoria?: string) { return this.api.garantirEmUso(c, categoria); }
  listarDados(p: PastaDados) { return this.api.listarDados(p); }
  lerDados(p: PastaDados, n: string) { return this.api.lerDados(p, n); }
  async salvarDados(p: PastaDados, n: string, c: string) { await this.api.salvarDados(p, n, c); }
  salvarLog(n: string, c: string) { return this.api.salvarLog(n, c); }
  otimizarAsset(f: string, w: number, h: number) { return this.api.otimizarAsset(f, w, h); }
  limparNaoUsados(u: string[]) { return this.api.limparNaoUsados(u); }
  listarFases() { return this.api.listarFases(); }
  lerFase(n: string) { return this.api.lerFase(n); }
  async salvarFase(n: string, c: string) { await this.api.salvarFase(n, c); }
  urlRaiz(c: string) { return 'projeto://raiz/' + codificarCaminho(c); }
}
