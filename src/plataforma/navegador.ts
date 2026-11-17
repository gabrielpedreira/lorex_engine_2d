// Modo navegador: usa o projeto de demonstração em public/demo-projeto (assets genéricos).
// Fases salvas ficam no armazenamento do navegador. Serve para testar a engine sem o Electron.
import { codificarCaminho, normalizarCaminho, type InfoProjeto, type Plataforma } from './plataforma';

interface Manifesto { nome: string; arquivos: string[]; fases: string[] }

const BASE = './demo-projeto/';
const CHAVE = 'lorex.demo.fases';

export class PlataformaNavegador implements Plataforma {
  readonly tipo = 'navegador' as const;
  private manifesto: Manifesto | null = null;

  private async carregarManifesto(): Promise<Manifesto> {
    if (!this.manifesto) {
      const r = await fetch(BASE + 'manifest.json');
      this.manifesto = (await r.json()) as Manifesto;
    }
    return this.manifesto;
  }

  private salvas(): Record<string, string> {
    try { return JSON.parse(localStorage.getItem(CHAVE) ?? '{}'); } catch { return {}; }
  }

  async abrirProjeto(): Promise<InfoProjeto | null> { return this.projetoAtual(); }
  async projetoAtual(): Promise<InfoProjeto | null> {
    const m = await this.carregarManifesto();
    return { nome: m.nome };
  }
  async listarAssets() { return (await this.carregarManifesto()).arquivos; }

  async garantirEmUso(c: string) {
    // Sem acesso ao disco: aponta para o arquivo de apoio a partir de jogo/
    return c.startsWith('jogo/') ? c.slice(5) : '../' + c;
  }

  async listarFases() {
    const m = await this.carregarManifesto();
    return [...new Set([...m.fases, ...Object.keys(this.salvas())])].sort();
  }

  async lerFase(nome: string) {
    const s = this.salvas()[nome];
    if (s) return s;
    const r = await fetch(BASE + 'jogo/fases/' + encodeURIComponent(nome));
    return r.text();
  }

  async salvarFase(nome: string, conteudo: string) {
    const s = this.salvas();
    s[nome] = conteudo;
    try { localStorage.setItem(CHAVE, JSON.stringify(s)); } catch { /* armazenamento indisponível */ }
  }

  urlRaiz(c: string) { return BASE + codificarCaminho(normalizarCaminho(c)); }
}
