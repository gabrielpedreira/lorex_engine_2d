// Tela inicial: projeto, recentes, fases do projeto e criação de fase com o "formato de pixels" do jogo.
import { normalizarFase, type OpcoesFase } from '../core/fase';
import { CONFIG_PADRAO, type ConfigProjeto, type InfoProjeto, type Plataforma } from '../plataforma/plataforma';
import { el } from './dom';

export interface AcoesInicio {
  abrirPasta(): Promise<void>;
  abrirRecente(caminho: string): Promise<void>;
  abrirFase(arquivo: string): Promise<boolean>;
  criarFase(nome: string, opcoes: OpcoesFase): Promise<boolean>;
}

interface Preset { res: [number, number]; rotulo: string; dica: string }
const PRESETS: Preset[] = [
  { res: [320, 180], rotulo: '320 × 180', dica: 'Bem retrô · ×6 em Full HD' },
  { res: [480, 270], rotulo: '480 × 270', dica: 'Personagens pequenos · ×4' },
  { res: [640, 360], rotulo: '640 × 360', dica: 'Recomendada p/ sprites de 128 px · ×3' },
  { res: [960, 540], rotulo: '960 × 540', dica: 'Mais detalhe · ×2' },
];
const GRADES = [8, 16, 32];

export class TelaInicio {
  private raiz: HTMLElement;
  private visivel = false;
  private podeVoltar = false;
  aoVoltar: () => void = () => {};

  constructor(private plat: Plataforma, private acoes: AcoesInicio) {
    this.raiz = el('div', { class: 'inicio', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Tela inicial' });
    this.raiz.hidden = true;
    document.body.append(this.raiz);
    this.raiz.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.podeVoltar && !(e.target instanceof HTMLInputElement)) this.voltar();
    });
  }

  get aberta() { return this.visivel; }

  async mostrar(podeVoltar: boolean) {
    this.podeVoltar = podeVoltar;
    this.visivel = true;
    this.raiz.hidden = false;
    await this.render();
  }

  esconder() {
    this.visivel = false;
    this.raiz.hidden = true;
  }

  private voltar() {
    this.esconder();
    this.aoVoltar();
  }

  async render() {
    const [versao, projeto, recentes] = await Promise.all([
      this.plat.versao(), this.plat.projetoAtual(), this.plat.recentes(),
    ]);
    const config = projeto ? (await this.plat.lerConfigProjeto()) : null;
    const fases = projeto ? await this.lerFases() : [];

    const cabecalho = el('header', { class: 'inicio-topo' },
      el('img', { src: './marca/logo-fundo-escuro.png', alt: 'Lorex Engine', class: 'inicio-logo' }),
      el('div', { class: 'espaco' }),
      this.podeVoltar ? this.botao('Voltar ao editor', () => this.voltar(), 'secundario') : null,
    );

    const colunas = el('div', { class: 'inicio-colunas' },
      this.colunaProjeto(projeto, recentes),
      this.colunaFases(projeto, fases),
      this.colunaNovaFase(projeto, config, fases.length),
    );

    const rodape = el('footer', { class: 'inicio-rodape' },
      el('span', {}, `Lorex Engine 2D · versão ${versao}`),
      el('span', {}, `© ${new Date().getFullYear()} Gabriel Pedreira. Todos os direitos reservados.`),
    );

    this.raiz.replaceChildren(el('div', { class: 'inicio-caixa' }, cabecalho, colunas, rodape));
    (this.raiz.querySelector('.inicio-foco') as HTMLElement | null)?.focus();
  }

  private botao(texto: string, fn: () => void, classe = '') {
    const b = el('button', { type: 'button', class: classe }, texto);
    b.addEventListener('click', fn);
    return b;
  }

  private async lerFases() {
    const arquivos = await this.plat.listarFases();
    return Promise.all(arquivos.map(async (arquivo) => {
      try {
        const f = normalizarFase(JSON.parse(await this.plat.lerFase(arquivo)));
        return { arquivo, nome: f.nome, info: `${f.tamanho[0]} × ${f.tamanho[1]} px · ${f.objetos.length} objeto(s)` };
      } catch {
        return { arquivo, nome: arquivo, info: 'não consegui ler este arquivo' };
      }
    }));
  }

  // ---------- Coluna 1: projeto ----------
  private colunaProjeto(projeto: InfoProjeto | null, recentes: InfoProjeto[]) {
    const col = el('section', { class: 'inicio-coluna' }, el('h2', {}, 'Projeto'));
    if (projeto) {
      col.append(el('div', { class: 'cartao-projeto' },
        el('strong', {}, projeto.nome),
        projeto.caminho ? el('span', { class: 'caminho', title: projeto.caminho }, projeto.caminho) : el('span', { class: 'caminho' }, 'Assets genéricos para testar a engine'),
      ));
    } else {
      col.append(el('p', { class: 'texto-suave' }, 'Abra a pasta do seu jogo. A engine cria as pastas jogo/assets e jogo/fases dentro dela, se ainda não existirem.'));
    }
    if (this.plat.tipo === 'electron') {
      col.append(this.botao(projeto ? 'Abrir outra pasta…' : 'Abrir pasta do projeto…', () => void this.acoes.abrirPasta(), projeto ? 'secundario largo' : 'primario largo inicio-foco'));
    }
    const outros = recentes.filter((r) => r.caminho !== projeto?.caminho);
    if (outros.length) {
      col.append(el('h3', {}, 'Recentes'));
      const lista = el('div', { class: 'lista' });
      for (const r of outros) {
        const b = el('button', { type: 'button', class: 'item-lista', title: r.caminho ?? r.nome },
          el('strong', {}, r.nome), el('span', {}, r.caminho ?? ''));
        b.addEventListener('click', () => void this.acoes.abrirRecente(r.caminho ?? ''));
        lista.append(b);
      }
      col.append(lista);
    }
    return col;
  }

  // ---------- Coluna 2: fases ----------
  private colunaFases(projeto: InfoProjeto | null, fases: { arquivo: string; nome: string; info: string }[]) {
    const col = el('section', { class: 'inicio-coluna' }, el('h2', {}, 'Fases do projeto'));
    if (!projeto) {
      col.append(el('p', { class: 'texto-suave' }, 'Abra um projeto para ver as fases.'));
      return col;
    }
    if (!fases.length) {
      col.append(el('p', { class: 'texto-suave' }, 'Nenhuma fase ainda. Crie a primeira ao lado.'));
      return col;
    }
    const lista = el('div', { class: 'lista' });
    fases.forEach((f, i) => {
      const b = el('button', { type: 'button', class: 'item-lista' + (i === 0 && !this.podeVoltar ? ' inicio-foco' : ''), title: `jogo/fases/${f.arquivo}` },
        el('strong', {}, f.nome), el('span', {}, `${f.arquivo} · ${f.info}`));
      b.addEventListener('click', async () => { if (await this.acoes.abrirFase(f.arquivo)) this.esconder(); });
      lista.append(b);
    });
    col.append(lista);
    return col;
  }

  // ---------- Coluna 3: nova fase + formato de pixels ----------
  private colunaNovaFase(projeto: InfoProjeto | null, config: ConfigProjeto | null, qtdFases: number) {
    const col = el('section', { class: 'inicio-coluna nova-fase' }, el('h2', {}, 'Nova fase'));
    if (!projeto) {
      col.append(el('p', { class: 'texto-suave' }, 'Abra um projeto para criar fases.'));
      return col;
    }
    const cfg: ConfigProjeto = config ?? CONFIG_PADRAO;
    let res: [number, number] = [...cfg.resolucaoBase] as [number, number];
    let grade = cfg.tamanhoGrade;

    const nome = el('input', { type: 'text', id: 'nf-nome', value: `Fase ${String(qtdFases + 1).padStart(2, '0')}` });
    const larguraTelas = el('input', { type: 'number', id: 'nf-lt', value: 4, min: 1, max: 50, step: 1 });
    const alturaTelas = el('input', { type: 'number', id: 'nf-at', value: 1, min: 1, max: 20, step: 1 });
    const cor = el('input', { type: 'color', id: 'nf-cor', value: '#0e0f13' });
    const resumo = el('p', { class: 'resumo' });
    const resX = el('input', { type: 'number', id: 'nf-rx', min: 64, max: 3840, step: 1, value: res[0], 'aria-label': 'Largura personalizada' });
    const resY = el('input', { type: 'number', id: 'nf-ry', min: 64, max: 2160, step: 1, value: res[1], 'aria-label': 'Altura personalizada' });

    const atualizarResumo = () => {
      const lt = Math.max(1, Number(larguraTelas.value) || 1);
      const at = Math.max(1, Number(alturaTelas.value) || 1);
      const escala = 1920 / res[0];
      const escalaTxt = Number.isInteger(escala) && 1080 / res[1] === escala ? `escala ×${escala} em Full HD` : 'não escala inteiro em Full HD (pode borrar)';
      resumo.textContent = `Fase de ${res[0] * lt} × ${res[1] * at} px · tela ${res[0]} × ${res[1]} (${escalaTxt}) · grade ${grade} px`;
    };

    // Presets de resolução
    const presets = el('div', { class: 'presets', role: 'radiogroup', 'aria-label': 'Resolução do jogo' });
    const personalizada = el('div', { class: 'personalizada' }, resX, el('span', {}, '×'), resY);
    const marcar = (alvo: HTMLElement) => {
      presets.querySelectorAll('.preset').forEach((p) => { p.classList.remove('ativo'); p.setAttribute('aria-checked', 'false'); });
      alvo.classList.add('ativo'); alvo.setAttribute('aria-checked', 'true');
    };
    let algumAtivo = false;
    for (const p of PRESETS) {
      const ativo = p.res[0] === res[0] && p.res[1] === res[1];
      algumAtivo ||= ativo;
      const b = el('button', { type: 'button', class: 'preset' + (ativo ? ' ativo' : ''), role: 'radio', 'aria-checked': String(ativo) },
        el('strong', {}, p.rotulo), el('span', {}, p.dica));
      b.addEventListener('click', () => { res = [...p.res] as [number, number]; resX.value = String(res[0]); resY.value = String(res[1]); marcar(b); atualizarResumo(); });
      presets.append(b);
    }
    const bPers = el('button', { type: 'button', class: 'preset' + (algumAtivo ? '' : ' ativo'), role: 'radio', 'aria-checked': String(!algumAtivo) },
      el('strong', {}, 'Personalizada'), el('span', {}, 'Defina largura e altura'));
    bPers.addEventListener('click', () => { marcar(bPers); resX.focus(); });
    presets.append(bPers);
    const lerPers = () => {
      res = [Math.max(64, Math.round(Number(resX.value) || 64)), Math.max(64, Math.round(Number(resY.value) || 64))];
      marcar(bPers); atualizarResumo();
    };
    resX.addEventListener('change', lerPers);
    resY.addEventListener('change', lerPers);

    // Grade
    const grades = el('div', { class: 'segmentado', role: 'radiogroup', 'aria-label': 'Tamanho da grade' });
    for (const g of GRADES) {
      const b = el('button', { type: 'button', class: g === grade ? 'ativo' : '', role: 'radio', 'aria-checked': String(g === grade) }, `${g} px`);
      b.addEventListener('click', () => {
        grade = g;
        grades.querySelectorAll('button').forEach((x) => { x.classList.remove('ativo'); x.setAttribute('aria-checked', 'false'); });
        b.classList.add('ativo'); b.setAttribute('aria-checked', 'true');
        atualizarResumo();
      });
      grades.append(b);
    }

    larguraTelas.addEventListener('input', atualizarResumo);
    alturaTelas.addEventListener('input', atualizarResumo);
    atualizarResumo();

    const criar = el('button', { type: 'submit', class: 'primario largo' }, 'Criar fase');
    const form = el('form', { class: 'form-nova' },
      el('div', { class: 'campo largo' }, el('label', { for: 'nf-nome' }, 'Nome da fase'), nome),
      el('div', { class: 'campo largo' },
        el('span', { class: 'rotulo' }, 'Resolução do jogo (formato de pixels)'),
        el('p', { class: 'dica-campo' }, qtdFases && config
          ? 'Quantos pixels de arte cabem na tela. Vale para o projeto inteiro; as fases já criadas mantêm a resolução delas.'
          : 'Quantos pixels de arte cabem na tela. Vale para o projeto inteiro.'),
        presets, personalizada),
      el('div', { class: 'linha2' },
        el('div', { class: 'campo largo' }, el('span', { class: 'rotulo' }, 'Grade (tile)'), grades),
        el('div', { class: 'campo largo' }, el('label', { for: 'nf-cor' }, 'Cor de fundo'), cor)),
      el('div', { class: 'linha2' },
        el('div', { class: 'campo largo' }, el('label', { for: 'nf-lt' }, 'Largura (em telas)'), larguraTelas),
        el('div', { class: 'campo largo' }, el('label', { for: 'nf-at' }, 'Altura (em telas)'), alturaTelas)),
      resumo,
      criar,
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const n = nome.value.trim();
      if (!n) { nome.focus(); return; }
      criar.disabled = true;
      await this.plat.salvarConfigProjeto({ resolucaoBase: res, tamanhoGrade: grade });
      const ok = await this.acoes.criarFase(n, {
        resolucaoBase: res,
        tamanhoGrade: grade,
        telas: [Math.max(1, Number(larguraTelas.value) || 1), Math.max(1, Number(alturaTelas.value) || 1)],
        corFundo: cor.value,
      });
      criar.disabled = false;
      if (ok) this.esconder();
    });
    col.append(form);
    return col;
  }
}
