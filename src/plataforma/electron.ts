import { codificarCaminho, type InfoProjeto, type Plataforma } from './plataforma';

interface ApiLorex {
  abrirProjeto(): Promise<InfoProjeto | null>;
  projetoAtual(): Promise<InfoProjeto | null>;
  listarAssets(): Promise<string[]>;
  garantirEmUso(relRaiz: string): Promise<string>;
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

  abrirProjeto() { return this.api.abrirProjeto(); }
  projetoAtual() { return this.api.projetoAtual(); }
  listarAssets() { return this.api.listarAssets(); }
  garantirEmUso(c: string) { return this.api.garantirEmUso(c); }
  listarFases() { return this.api.listarFases(); }
  lerFase(n: string) { return this.api.lerFase(n); }
  async salvarFase(n: string, c: string) { await this.api.salvarFase(n, c); }
  urlRaiz(c: string) { return 'projeto://raiz/' + codificarCaminho(c); }
}
