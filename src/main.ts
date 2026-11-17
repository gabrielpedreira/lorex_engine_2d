// Lorex Engine 2D: Construtor de Fases (etapa 1)
import './estilo.css';
import { criarFase, nomeArquivoFase, nomeDoArquivo, normalizarFase, novoIdObjeto, type OpcoesFase } from './core/fase';
import type { ObjetoFase } from './core/tipos';
import { Estado } from './editor/estado';
import { Viewport, formatarPct } from './editor/viewport';
import { PlataformaElectron, temElectron } from './plataforma/electron';
import { PlataformaNavegador } from './plataforma/navegador';
import type { Plataforma } from './plataforma/plataforma';
import { Biblioteca } from './ui/biblioteca';
import { CaixaFerramentas } from './ui/ferramentas';
import type { ConfigProjeto, Ferramenta } from './plataforma/plataforma';
import type { TipoObjeto } from './core/tipos';
import { PainelCamadas } from './ui/camadas';
import { el, perguntar } from './ui/dom';
import { icone, type ICONES } from './ui/icones';
import { PainelPropriedades } from './ui/propriedades';
import { TelaInicio } from './ui/inicio';
import { CONFIG_PADRAO } from './plataforma/plataforma';

const plat: Plataforma = temElectron() ? new PlataformaElectron() : new PlataformaNavegador();
const estado = new Estado();

// ---------- Estrutura da tela ----------
const app = document.getElementById('app')!;
const barra = el('header', { class: 'barra' });
const esquerda = el('aside', { class: 'painel esquerda' });
const centro = el('main', { class: 'cenario', 'aria-label': 'Cenário' });
const direita = el('aside', { class: 'painel direita' });
const painelProps = el('section', { class: 'bloco props-bloco' });
const painelCamadas = el('section', { class: 'bloco camadas-bloco' });
direita.append(painelProps, painelCamadas);
const status = el('footer', { class: 'status' });
app.append(barra, esquerda, centro, direita, status);

// Painel lateral esquerdo: abas Ferramentas / Biblioteca, recolhível
const abaFerr = el('button', { type: 'button', class: 'aba ativa', role: 'tab', 'aria-selected': 'true' }, 'Ferramentas');
const abaBib = el('button', { type: 'button', class: 'aba', role: 'tab', 'aria-selected': 'false' }, 'Biblioteca');
const recolher = el('button', { type: 'button', class: 'aba-recolher', title: 'Ocultar painel (T)', 'aria-label': 'Ocultar painel' }, '«');
const conteudoFerr = el('div', { class: 'aba-conteudo', role: 'tabpanel' });
const conteudoBib = el('div', { class: 'aba-conteudo', role: 'tabpanel' });
conteudoBib.hidden = true;
const trilho = el('button', { type: 'button', class: 'trilho', title: 'Mostrar caixa de ferramentas (T)', 'aria-label': 'Mostrar caixa de ferramentas' }, el('span', {}, '»'), el('span', { class: 'trilho-texto' }, 'Ferramentas'));
esquerda.append(el('div', { class: 'abas', role: 'tablist' }, abaFerr, abaBib, recolher), conteudoFerr, conteudoBib, trilho);

function mostrarAba(qual: 'ferr' | 'bib') {
  conteudoFerr.hidden = qual !== 'ferr'; conteudoBib.hidden = qual !== 'bib';
  abaFerr.classList.toggle('ativa', qual === 'ferr'); abaBib.classList.toggle('ativa', qual === 'bib');
  abaFerr.setAttribute('aria-selected', String(qual === 'ferr')); abaBib.setAttribute('aria-selected', String(qual === 'bib'));
}
function alternarLateral(mostrar?: boolean) {
  const oculta = mostrar === undefined ? !app.classList.contains('lateral-oculta') : !mostrar;
  app.classList.toggle('lateral-oculta', oculta);
}
abaFerr.addEventListener('click', () => mostrarAba('ferr'));
abaBib.addEventListener('click', () => mostrarAba('bib'));
recolher.addEventListener('click', () => alternarLateral(false));
trilho.addEventListener('click', () => alternarLateral(true));

const viewport = new Viewport(centro, estado, plat);
const ferramentas = new CaixaFerramentas(conteudoFerr, plat);
const biblioteca = new Biblioteca(conteudoBib, plat);

// ---------- Ações sobre objetos ----------
function excluirSelecionado() {
  const idCol = estado.colisaoSelecionada;
  if (idCol) {
    estado.alterar((f) => { f.colisoes = f.colisoes.filter((c) => c.id !== idCol); });
    estado.selecionarColisao(null);
    return;
  }
  const id = estado.selecionado;
  if (!id) return;
  estado.alterar((f) => { f.objetos = f.objetos.filter((o) => o.id !== id); });
  estado.selecionar(null);
}

function duplicarSelecionado() {
  const o = estado.objetoSelecionado();
  if (!o) return;
  const copia: ObjetoFase = JSON.parse(JSON.stringify(o));
  copia.id = novoIdObjeto(estado.fase);
  copia.x += 16; copia.y += 16;
  estado.alterar((f) => { f.objetos.splice(f.objetos.indexOf(o) + 1, 0, copia); });
  estado.selecionar(copia.id);
}

function mudarOrdem(direcao: 'frente' | 'tras') {
  const o = estado.objetoSelecionado();
  if (!o) return;
  estado.alterar((f) => {
    f.objetos = f.objetos.filter((x) => x !== o);
    if (direcao === 'frente') f.objetos.push(o); else f.objetos.unshift(o);
  });
}

function moverSelecionado(dx: number, dy: number) {
  const c = estado.colisaoSelecionada ? estado.colisao(estado.colisaoSelecionada) : undefined;
  if (c) { estado.alterar(() => { c.x += dx; c.y += dy; }); return; }
  const o = estado.objetoSelecionado();
  if (!o) return;
  estado.alterar(() => { o.x += dx; o.y += dy; });
}

new PainelPropriedades(painelProps, estado, {
  duplicar: duplicarSelecionado,
  excluir: excluirSelecionado,
  ordem: mudarOrdem,
  escalar: (f) => viewport.escalarSelecionado(f),
  otimizar: plat.tipo === 'electron' ? () => void otimizarSelecionado() : null,
  aoEscalar: (o) => viewport.aoEscalar(o),
});
new PainelCamadas(painelCamadas, estado);

// ---------- Configuração do projeto em memória (ferramentas, escalas lembradas, cópias otimizadas) ----------
let config: ConfigProjeto = { ...CONFIG_PADRAO };
let timerConfig = 0;
function salvarConfigDepois() {
  clearTimeout(timerConfig);
  timerConfig = window.setTimeout(() => void plat.salvarConfigProjeto(config), 400);
}

/** Coloca um asset na camada ativa. (sx, sy) = posição na tela; sem posição = centro da visão.
 *  escala: 0/undefined = automática (a última usada para esta imagem, ou reduzida para caber na tela). */
async function adicionarAsset(caminhoRaiz: string, sx?: number, sy?: number, tipo: TipoObjeto = 'estatico', escala?: number) {
  const camada = estado.camada(estado.camadaAtiva);
  if (!camada) return;
  if (camada.travada || !camada.visivel) {
    estado.avisar(`A camada "${camada.nome}" está ${camada.travada ? 'travada' : 'oculta'}. Escolha outra camada.`);
    return;
  }
  try {
    // Tamanho original (pela imagem de origem) e escala desejada
    const original = await viewport.texturaRaiz(caminhoRaiz);
    let esc = escala || config.escalas?.[caminhoRaiz] || viewport.escalaInicial(original.width, original.height);
    const reduzidaAuto = !escala && !config.escalas?.[caminhoRaiz] && esc < 1;

    // Se já existe uma cópia otimizada exatamente nesse tamanho, usa ela (leve) em vez do original
    let asset: string, w: number, h: number;
    const otim = config.otimizados?.[caminhoRaiz];
    if (otim && otim.w === Math.round(original.width * esc) && otim.h === Math.round(original.height * esc)) {
      asset = otim.asset; w = otim.w; h = otim.h; esc = 1;
    } else {
      asset = await plat.garantirEmUso(caminhoRaiz);
      w = original.width; h = original.height;
    }
    await viewport.textura(asset);

    const tela = viewport.tamanhoTela();
    const pos = viewport.posicaoColocacao(sx ?? tela.w / 2, sy ?? tela.h / 2, w * esc, h * esc, camada.id);
    const obj: ObjetoFase = {
      id: novoIdObjeto(estado.fase),
      tipo,
      nome: nomeDoArquivo(caminhoRaiz),
      asset,
      origem: caminhoRaiz,
      camada: camada.id,
      x: pos.x,
      y: pos.y,
      w, h,
      escala: esc, rotacao: 0, espelharX: false, espelharY: false, opacidade: 1, visivel: true,
      efeitos: [], comportamentos: [], conexoes: {}, script: null,
    };
    estado.alterar((f) => { f.objetos.push(obj); });
    estado.selecionar(obj.id);
    estado.avisar(`"${obj.nome}" (${tipo === 'interativo' ? 'interativo' : 'estático'}) adicionado em ${camada.nome}`
      + (reduzidaAuto ? `: a imagem era maior que a tela do jogo e entrou com ${formatarPct(esc)}. Ajuste pelas alças.` : ''));
    if (!asset.startsWith('../') && plat.tipo === 'electron') {
      await biblioteca.recarregar();
      ferramentas.definir(ferramentasAtuais, biblioteca.caminhos);
    }
  } catch (err) {
    estado.avisar(`Erro ao adicionar asset: ${String(err)}`);
  }
}
viewport.aoSoltarAsset = (c, sx, sy) => { void adicionarAsset(c, sx, sy); };
biblioteca.aoAdicionar = (c) => { void adicionarAsset(c); };
if (plat.tipo === 'electron') {
  biblioteca.aoLimpar = async () => {
    const r = await perguntar('Limpar cópias sem uso', 'As imagens de jogo/assets que nenhuma fase usa vão para a Lixeira (dá para recuperar de lá). Os originais do material de apoio não são tocados.', ['Cancelar', 'Limpar']);
    if (r !== 1) return;
    const removidos = await plat.limparNaoUsados(estado.fase.objetos.map((x) => x.asset));
    estado.avisar(removidos.length ? `${removidos.length} cópia(s) sem uso foram para a Lixeira.` : 'Nenhuma cópia sem uso.');
    await biblioteca.recarregar();
    ferramentas.definir(ferramentasAtuais, biblioteca.caminhos);
  };
}

/** Lembra o tamanho escolhido para a imagem (relativo ao original): o próximo carimbo dela já entra assim. */
viewport.aoEscalar = (o) => {
  if (!o.origem) return;
  const base = viewport.tamanhoOriginal(o.origem);
  config.escalas = { ...(config.escalas ?? {}), [o.origem]: base ? (o.w * o.escala) / base.w : o.escala };
  salvarConfigDepois();
};

// ---------- Caixa de ferramentas ----------
let ferramentasAtuais: Ferramenta[] = [];
let ferramentaArmada: Ferramenta | null = null;
ferramentas.aoArmar = (caminho, f) => {
  ferramentaArmada = f;
  viewport.armarCarimbo(caminho, caminho ? config.escalas?.[caminho] ?? 0 : 0);
  if (caminho) estado.avisar(`Carimbo: ${nomeDoArquivo(caminho)}. Clique no cenário para colocar em "${estado.camada(estado.camadaAtiva)?.nome}" (Shift+clique coloca e continua). Esc para cancelar.`);
};
viewport.aoCarimbar = (c, sx, sy, escala) => { void adicionarAsset(c, sx, sy, ferramentaArmada?.tipoPadrao ?? 'estatico', escala); };
viewport.aoCancelarCarimbo = (porColocacao) => {
  if (!porColocacao) ferramentaArmada = null;
  ferramentas.desarmar();
  if (!porColocacao) estado.avisar('Carimbo cancelado');
};
ferramentas.aoMudar = (lista) => {
  ferramentasAtuais = lista;
  config.ferramentas = lista;
  salvarConfigDepois();
};

// ---------- Otimizar imagem (cópia reduzida no tamanho usado) ----------
async function otimizarSelecionado() {
  const o = estado.objetoSelecionado();
  if (!o) return;
  const fonte = o.origem ?? 'jogo/' + o.asset;
  const original = await viewport.texturaRaiz(fonte);
  const w = Math.round(o.w * o.escala), h = Math.round(o.h * o.escala);
  if (w >= original.width) { estado.avisar('Esta imagem já está no tamanho original (ou maior): não há o que reduzir.'); return; }
  estado.avisar('Otimizando…');
  try {
    const r = await plat.otimizarAsset(fonte, w, h);
    if (!r) { estado.avisar('Otimizar só está disponível no aplicativo (Electron).'); return; }
    await viewport.textura(r.asset);
    // Troca todos os objetos da fase que usam a mesma imagem no mesmo tamanho
    let n = 0;
    estado.alterar((f) => {
      for (const x of f.objetos) {
        if (x.asset === o.asset && Math.round(x.w * x.escala) === w && Math.round(x.h * x.escala) === h) {
          x.asset = r.asset; x.w = r.w; x.h = r.h; x.escala = 1; x.origem = x.origem ?? fonte; n++;
        }
      }
    });
    config.otimizados = { ...(config.otimizados ?? {}), [fonte]: { asset: r.asset, w: r.w, h: r.h } };
    config.escalas = { ...(config.escalas ?? {}), [fonte]: w / original.width };
    salvarConfigDepois();
    const mbAntes = (r.pixelsAntes * 4) / 1e6, mbDepois = (r.w * r.h * 4) / 1e6;
    // Salva a fase (para as outras fases verem o novo arquivo) e tira de jogo/assets a cópia grande que ficou sem uso
    const salvou = estado.arquivoFase ? await salvar() : false;
    const removidos = salvou ? await plat.limparNaoUsados(estado.fase.objetos.map((x) => x.asset)) : [];
    estado.avisar(`Otimizado: ${r.w}×${r.h} px (${n} objeto(s)). Memória de vídeo: ${mbAntes.toFixed(1)} MB → ${mbDepois < 0.1 ? mbDepois.toFixed(3) : mbDepois.toFixed(1)} MB.`
      + (removidos.length ? ` ${removidos.length} cópia(s) sem uso foram para a Lixeira.` : ''));
    await biblioteca.recarregar();
    ferramentas.definir(ferramentasAtuais, biblioteca.caminhos);
  } catch (err) {
    estado.avisar(`Erro ao otimizar: ${String(err)}`);
  }
}

// ---------- Arquivo: novo, abrir, salvar ----------
async function podeDescartar(): Promise<boolean> {
  if (!estado.sujo) return true;
  const r = await perguntar('Alterações não salvas', `A fase "${estado.fase.nome}" tem alterações não salvas.`, ['Cancelar', 'Descartar', 'Salvar']);
  if (r === 2) return salvar();
  return r === 1;
}

async function novaFase() {
  await inicio.mostrar(true);
}

async function criarNovaFase(nome: string, opcoes: OpcoesFase): Promise<boolean> {
  if (!(await podeDescartar())) return false;
  estado.carregarFase(criarFase(nome, opcoes), null);
  const ok = await salvar();
  viewport.enquadrar();
  return ok;
}

async function abrirFase(arquivo: string): Promise<boolean> {
  if (arquivo === estado.arquivoFase) return true;
  if (!(await podeDescartar())) { void atualizarListaFases(); return false; }
  try {
    const fase = normalizarFase(JSON.parse(await plat.lerFase(arquivo)));
    estado.carregarFase(fase, arquivo);
    viewport.enquadrar();
    estado.avisar(`Fase aberta: ${arquivo}`);
    await atualizarListaFases();
    return true;
  } catch (err) {
    estado.avisar(`Não consegui abrir ${arquivo}: ${String(err)}`);
    return false;
  }
}

async function salvar(): Promise<boolean> {
  const arquivo = estado.arquivoFase ?? nomeArquivoFase(estado.fase.nome);
  try {
    await plat.salvarFase(arquivo, JSON.stringify(estado.fase, null, 2));
    estado.arquivoFase = arquivo;
    estado.sujo = false;
    estado.emit('arquivo');
    estado.avisar(`Salvo em jogo/fases/${arquivo}`);
    await atualizarListaFases();
    return true;
  } catch (err) {
    estado.avisar(`Erro ao salvar: ${String(err)}`);
    return false;
  }
}

/** Troca de projeto: carrega a biblioteca e começa com uma fase em branco (a tela inicial pede a escolha). */
async function trocarProjeto(p: { nome: string } | null) {
  if (!p) return;
  await carregarProjeto(p.nome);
  const cfg = (await plat.lerConfigProjeto()) ?? CONFIG_PADRAO;
  estado.carregarFase(criarFase('Fase 01', { resolucaoBase: cfg.resolucaoBase, tamanhoGrade: cfg.tamanhoGrade }), null);
  viewport.enquadrar();
  await atualizarListaFases();
  await inicio.mostrar(false);
}

const inicio = new TelaInicio(plat, {
  abrirPasta: async () => { if (await podeDescartar()) await trocarProjeto(await plat.abrirProjeto()); },
  abrirRecente: async (c) => { if (await podeDescartar()) await trocarProjeto(await plat.abrirCaminho(c)); },
  abrirFase: (a) => abrirFase(a),
  criarFase: (n, o) => criarNovaFase(n, o),
});

// ---------- Barra superior ----------
const botaoBarra = (ico: keyof typeof ICONES, texto: string, dica: string, fn: () => void, classe = '') => {
  const b = el('button', { type: 'button', class: 'bt ' + classe, title: dica, 'aria-label': dica }, icone(ico), texto ? el('span', {}, texto) : null);
  b.addEventListener('click', fn);
  return b;
};
const alternar = (ico: keyof typeof ICONES, dica: string, ler: () => boolean, fn: () => void) => {
  const b = el('button', { type: 'button', class: 'bt alternar', title: dica, 'aria-label': dica }, icone(ico));
  const atualizar = () => { b.classList.toggle('ligado', ler()); b.setAttribute('aria-pressed', String(ler())); };
  b.addEventListener('click', () => { fn(); atualizar(); estado.emit('opcoes'); });
  atualizar();
  return b;
};

const nomeProjeto = el('span', { class: 'nome-projeto' }, '…');
const botaoMarca = el('button', { type: 'button', class: 'marca', title: 'Tela inicial (projetos e fases)', 'aria-label': 'Tela inicial' },
  el('img', { src: './marca/icone-256.png', alt: '' }), el('strong', {}, 'Lorex'), el('span', {}, 'Engine 2D'));
botaoMarca.addEventListener('click', () => void inicio.mostrar(true));
const seletorFases = el('select', { class: 'seletor-fases', 'aria-label': 'Abrir fase' });
seletorFases.addEventListener('change', () => { if (seletorFases.value) void abrirFase(seletorFases.value); });
const indicadorSujo = el('span', { class: 'sujo', title: 'Alterações não salvas' });
const rotuloZoom = el('button', { type: 'button', class: 'bt zoom', title: 'Zoom: clique para voltar a 100%' }, '200%');
rotuloZoom.addEventListener('click', () => { const { w, h } = viewport.tamanhoTela(); viewport.zoomEm(w / 2, h / 2, 1); });
const botaoTestar = botaoBarra('play', 'Testar', 'Testar a fase (chega na etapa 3)', () => estado.avisar('O ▶ Testar chega na etapa 3 do construtor de fases.'), 'testar');
botaoTestar.setAttribute('aria-disabled', 'true');

async function atualizarListaFases() {
  const fases = await plat.listarFases();
  seletorFases.replaceChildren();
  if (!estado.arquivoFase) seletorFases.append(el('option', { value: '' }, `${estado.fase.nome} (não salva)`));
  for (const f of fases) {
    const op = el('option', { value: f }, f);
    if (f === estado.arquivoFase) op.selected = true;
    seletorFases.append(op);
  }
}

// Modos de ferramenta do cenário
const modos: { modo: 'selecionar' | 'colisao' | 'inicio'; ico: keyof typeof ICONES; dica: string }[] = [
  { modo: 'selecionar', ico: 'cursor', dica: 'Selecionar e mover objetos (V)' },
  { modo: 'colisao', ico: 'colisao', dica: 'Colisão: desenhar chão, paredes, plataformas e rampas (C)' },
  { modo: 'inicio', ico: 'bandeira', dica: 'Início do jogador: clique onde a personagem começa (I)' },
];
const grupoModos = el('div', { class: 'grupo modos', role: 'radiogroup', 'aria-label': 'Ferramenta' });
for (const m of modos) {
  const b = el('button', { type: 'button', class: 'bt modo', title: m.dica, 'aria-label': m.dica, role: 'radio' }, icone(m.ico));
  b.dataset.modo = m.modo;
  b.addEventListener('click', () => estado.definirModo(m.modo));
  grupoModos.append(b);
}
function atualizarModos() {
  grupoModos.querySelectorAll<HTMLButtonElement>('.modo').forEach((b) => {
    const ativo = b.dataset.modo === estado.modo;
    b.classList.toggle('ligado', ativo); b.setAttribute('aria-checked', String(ativo));
  });
  barraColisao.hidden = estado.modo !== 'colisao';
  centro.classList.toggle('modo-inicio', estado.modo === 'inicio');
}

// Barra flutuante do modo Colisão
const tiposColisao: { t: 'solido' | 'atravessavel' | 'rampa-direita' | 'rampa-esquerda'; rotulo: string; dica: string }[] = [
  { t: 'solido', rotulo: 'Sólido', dica: 'Chão e paredes: o jogador não atravessa (1)' },
  { t: 'atravessavel', rotulo: 'Atravessável', dica: 'Plataforma: o jogador sobe por baixo e fica em cima (2)' },
  { t: 'rampa-direita', rotulo: 'Rampa ◢', dica: 'Rampa que sobe para a direita (3)' },
  { t: 'rampa-esquerda', rotulo: 'Rampa ◣', dica: 'Rampa que sobe para a esquerda (4)' },
];
const segTipos = el('div', { class: 'segmentado', role: 'radiogroup', 'aria-label': 'Tipo de colisão' });
for (const t of tiposColisao) {
  const b = el('button', { type: 'button', title: t.dica, role: 'radio' }, el('span', { class: 'amostra ' + t.t }), t.rotulo);
  b.dataset.tipo = t.t;
  b.addEventListener('click', () => { estado.tipoNovaColisao = t.t; atualizarTiposColisao(); });
  segTipos.append(b);
}
function atualizarTiposColisao() {
  segTipos.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    const ativo = b.dataset.tipo === estado.tipoNovaColisao;
    b.classList.toggle('ativo', ativo); b.setAttribute('aria-checked', String(ativo));
  });
}
const barraColisao = el('div', { class: 'barra-flutuante' }, segTipos,
  el('span', { class: 'dica-flutuante' }, 'Arraste para desenhar · clique numa forma para editar · Del exclui · Esc sai'));
barraColisao.hidden = true;
centro.append(barraColisao);
atualizarTiposColisao();
estado.on('modo', () => {
  atualizarModos();
  if (estado.modo === 'colisao') estado.avisar('Colisão: escolha o tipo na barra e arraste no cenário para desenhar.');
  if (estado.modo === 'inicio') estado.avisar('Início do jogador: clique onde ficam os pés da personagem ao começar.');
});

barra.append(
  botaoMarca,
  el('div', { class: 'grupo' }, nomeProjeto),
  el('div', { class: 'grupo' },
    botaoBarra('novo', 'Nova', 'Nova fase (Ctrl+N): abre a tela inicial', () => void novaFase()),
    seletorFases,
    botaoBarra('salvar', 'Salvar', 'Salvar fase (Ctrl+S)', () => void salvar()),
    indicadorSujo),
  grupoModos,
  el('div', { class: 'grupo' },
    botaoBarra('desfazer', '', 'Desfazer (Ctrl+Z)', () => estado.desfazer()),
    botaoBarra('refazer', '', 'Refazer (Ctrl+Y)', () => estado.refazer())),
  el('div', { class: 'grupo' },
    alternar('grade', 'Mostrar grade (G)', () => estado.grade, () => { estado.grade = !estado.grade; }),
    alternar('ima', 'Encaixar na grade (E)', () => estado.encaixar, () => { estado.encaixar = !estado.encaixar; }),
    alternar('camadas', 'Prévia de parallax: desligada = todas as camadas alinhadas (P)', () => estado.previaParallax, () => { estado.previaParallax = !estado.previaParallax; }),
    alternar('verColisao', 'Mostrar colisões (Shift+C)', () => estado.mostrarColisoes, () => { estado.mostrarColisoes = !estado.mostrarColisoes; }),
    alternar('brilho', 'Prévia dos efeitos animados (pulsar, brilhar…) (Shift+E)', () => estado.previaEfeitos, () => { estado.previaEfeitos = !estado.previaEfeitos; }),
    botaoBarra('enquadrar', '', 'Enquadrar a fase (Home)', () => viewport.enquadrar()),
    rotuloZoom),
  el('div', { class: 'espaco' }),
  botaoTestar,
);

// ---------- Barra de status ----------
const stCoord = el('span', {});
const stCamada = el('span', {});
const stMsg = el('span', { class: 'msg', role: 'status' });
const stAtalhos = el('span', { class: 'atalhos' }, 'V/C/I: selecionar, colisão, início · T: ferramentas · Roda: zoom · Espaço/botão do meio: mover a visão · Del: excluir · Ctrl+D: duplicar · F: espelhar · Setas: mover 1 px (Shift: 8)');
status.append(stCoord, stCamada, stMsg, stAtalhos);
let timerMsg = 0;

function atualizarStatus() {
  stCoord.textContent = `x ${viewport.mouseMundo.x}  y ${viewport.mouseMundo.y}`;
  stCamada.textContent = `Camada ativa: ${estado.camada(estado.camadaAtiva)?.nome ?? '-'}`;
  rotuloZoom.textContent = `${Math.round(estado.camera.zoom * 100)}%`;
}
estado.on('camera', atualizarStatus);
estado.on('fase', atualizarStatus);
estado.on('mensagem', () => {
  stMsg.textContent = estado.mensagem;
  clearTimeout(timerMsg);
  timerMsg = window.setTimeout(() => { stMsg.textContent = ''; }, 5000);
});
estado.on('arquivo', () => {
  indicadorSujo.textContent = estado.sujo ? '● não salvo' : '';
  document.title = `${estado.sujo ? '● ' : ''}${estado.fase.nome} · Lorex Engine 2D`;
});

// ---------- Atalhos de teclado ----------
function digitando(): boolean {
  const a = document.activeElement;
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA') && (a as HTMLInputElement).type !== 'checkbox';
}

window.addEventListener('keydown', (e) => {
  if (document.querySelector('.modal-fundo') || inicio.aberta) return;
  const ctrl = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (ctrl && k === 's') { e.preventDefault(); void salvar(); return; }
  if (ctrl && k === 'n') { e.preventDefault(); void novaFase(); return; }
  if (digitando()) return;
  if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); estado.desfazer(); return; }
  if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); estado.refazer(); return; }
  if (ctrl && k === 'd') { e.preventDefault(); duplicarSelecionado(); return; }
  if (ctrl) return;
  switch (e.key) {
    case ' ': e.preventDefault(); viewport.setEspaco(true); break;
    case 'Delete': case 'Backspace': excluirSelecionado(); break;
    case 'Escape':
      if (viewport.carimboAtivo) viewport.cancelarCarimbo();
      else if (estado.modo !== 'selecionar') estado.definirModo('selecionar');
      else estado.selecionar(null);
      break;
    case '1': case '2': case '3': case '4':
      if (estado.modo === 'colisao') { estado.tipoNovaColisao = (['solido', 'atravessavel', 'rampa-direita', 'rampa-esquerda'] as const)[Number(e.key) - 1]; atualizarTiposColisao(); }
      break;
    case 'Home': viewport.enquadrar(); break;
    case '[': viewport.escalarSelecionado(e.shiftKey ? 1 / 1.01 : 1 / 1.1); break;
    case ']': viewport.escalarSelecionado(e.shiftKey ? 1.01 : 1.1); break;
    case '+': case '=': viewport.passoZoom(1); break;
    case '-': viewport.passoZoom(-1); break;
    case 'ArrowLeft': e.preventDefault(); moverSelecionado(e.shiftKey ? -8 : -1, 0); break;
    case 'ArrowRight': e.preventDefault(); moverSelecionado(e.shiftKey ? 8 : 1, 0); break;
    case 'ArrowUp': e.preventDefault(); moverSelecionado(0, e.shiftKey ? -8 : -1); break;
    case 'ArrowDown': e.preventDefault(); moverSelecionado(0, e.shiftKey ? 8 : 1); break;
    default:
      if (k === 't') alternarLateral();
      else if (k === 'v') estado.definirModo('selecionar');
      else if (k === 'c' && e.shiftKey) { estado.mostrarColisoes = !estado.mostrarColisoes; estado.emit('opcoes'); sincronizarAlternadores(); }
      else if (k === 'c') estado.definirModo(estado.modo === 'colisao' ? 'selecionar' : 'colisao');
      else if (k === 'i') estado.definirModo('inicio');
      else if (k === 'e' && e.shiftKey) { estado.previaEfeitos = !estado.previaEfeitos; estado.emit('opcoes'); sincronizarAlternadores(); }
      else if (k === 'f') { const o = estado.objetoSelecionado(); if (o) estado.alterar(() => { o.espelharX = !o.espelharX; }); }
      else if (k === 'g') { estado.grade = !estado.grade; estado.emit('opcoes'); sincronizarAlternadores(); }
      else if (k === 'e' && !e.shiftKey) { estado.encaixar = !estado.encaixar; estado.emit('opcoes'); sincronizarAlternadores(); }
      else if (k === 'p') { estado.previaParallax = !estado.previaParallax; estado.emit('opcoes'); sincronizarAlternadores(); }
  }
});
window.addEventListener('keyup', (e) => { if (e.key === ' ') viewport.setEspaco(false); });
window.addEventListener('beforeunload', (e) => { if (estado.sujo) e.preventDefault(); });

function sincronizarAlternadores() {
  const estados = [estado.grade, estado.encaixar, estado.previaParallax, estado.mostrarColisoes, estado.previaEfeitos];
  barra.querySelectorAll<HTMLButtonElement>('.alternar').forEach((b, i) => {
    b.classList.toggle('ligado', estados[i]);
    b.setAttribute('aria-pressed', String(estados[i]));
  });
}

// ---------- Início ----------
async function carregarProjeto(nome: string) {
  nomeProjeto.textContent = nome;
  plat.progresso('Lendo a biblioteca de assets…');
  await biblioteca.recarregar();
  config = { ...CONFIG_PADRAO, ...((await plat.lerConfigProjeto()) ?? {}) };
  ferramentasAtuais = config.ferramentas ?? [];
  viewport.cancelarCarimbo();
  ferramentas.definir(ferramentasAtuais, biblioteca.caminhos);
}

async function iniciar() {
  plat.progresso('Preparando o cenário…');
  await viewport.iniciar();
  plat.progresso('Abrindo o último projeto…');
  const p = await plat.projetoAtual();
  if (p) {
    await carregarProjeto(p.nome);
    const cfg = (await plat.lerConfigProjeto()) ?? CONFIG_PADRAO;
    estado.carregarFase(criarFase('Fase 01', { resolucaoBase: cfg.resolucaoBase, tamanhoGrade: cfg.tamanhoGrade }), null);
  } else {
    nomeProjeto.textContent = 'Nenhum projeto aberto';
  }
  viewport.enquadrar();
  await atualizarListaFases();
  plat.progresso('Montando a tela inicial…');
  await inicio.mostrar(false);
  inicio.aoVoltar = () => viewport.enquadrar();
  atualizarStatus();
  atualizarModos();
  plat.progresso('Pronto');
  plat.pronto();
}

void iniciar();
