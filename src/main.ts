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
import { Legendas, dica } from './ui/legenda';
import type { FormaNova } from './editor/estado';
import { ICONES, icone } from './ui/icones';
import { PainelPropriedades } from './ui/propriedades';
import { ModoTeste } from './editor/testar';
import { EditorPersonagens } from './ui/personagens';
import { EditorControles } from './ui/controles';
import { PainelLog } from './ui/log';
import { carregarTipo, type TipoInimigo } from './editor/inimigosTeste';
import { EditorHud } from './ui/hud';
import { normalizarHud } from './core/hud';
import { LOG, capturarErrosGlobais } from './core/log';
import { ACOES_SISTEMA, normalizarControles } from './core/controles';
import { PainelCodigo, type ElementoCodigo } from './ui/codigo/painel';
import { arquivoScript, tiposApi } from './core/scripts';
import { NOMES_COMPORTAMENTO, comportamentoDe } from './core/comportamentos';
import type { FontesScripts } from './editor/motorScripts';
import { normalizarPersonagem, type Personagem } from './core/personagem';
import { JOGADOR_PADRAO } from './core/fisica';
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
// Painel de Log (embaixo do cenário): teclas, personagem, mundo, código, erros e avisos
capturarErrosGlobais();
const painelLog = new PainelLog();
app.append(barra, esquerda, centro, painelLog.raiz, direita, status);

// Painel lateral esquerdo: abas Ferramentas / Biblioteca, recolhível
const abaFerr = el('button', { type: 'button', class: 'aba ativa', role: 'tab', 'aria-selected': 'true' }, 'Ferramentas');
const abaBib = el('button', { type: 'button', class: 'aba', role: 'tab', 'aria-selected': 'false' }, 'Biblioteca');
const recolher = el('button', { type: 'button', class: 'aba-recolher', title: 'Ocultar painel (T)', 'aria-label': 'Ocultar painel' }, '«');
const conteudoFerr = el('div', { class: 'aba-conteudo', role: 'tabpanel' });
const conteudoBib = el('div', { class: 'aba-conteudo', role: 'tabpanel' });
conteudoBib.hidden = true;
esquerda.append(el('div', { class: 'abas', role: 'tablist' }, abaFerr, abaBib, recolher), conteudoFerr, conteudoBib);

function mostrarAba(qual: 'ferr' | 'bib') {
  conteudoFerr.hidden = qual !== 'ferr'; conteudoBib.hidden = qual !== 'bib';
  abaFerr.classList.toggle('ativa', qual === 'ferr'); abaBib.classList.toggle('ativa', qual === 'bib');
  abaFerr.setAttribute('aria-selected', String(qual === 'ferr')); abaBib.setAttribute('aria-selected', String(qual === 'bib'));
}
function alternarLateral(mostrar?: boolean) {
  const oculta = mostrar === undefined ? !app.classList.contains('lateral-oculta') : !mostrar;
  app.classList.toggle('lateral-oculta', oculta);
  atualizarModos();
}
abaFerr.addEventListener('click', () => mostrarAba('ferr'));
abaBib.addEventListener('click', () => mostrarAba('bib'));
recolher.addEventListener('click', () => alternarLateral(false));

const viewport = new Viewport(centro, estado, plat);
const legendas = new Legendas();
viewport.aoPairar = (info, cx, cy) => legendas.mostrarNaCena(info, cx, cy);
const ferramentas = new CaixaFerramentas(conteudoFerr, plat);
const biblioteca = new Biblioteca(conteudoBib, plat);

// ---------- Ações sobre objetos ----------
function excluirSelecionado() {
  const idIni = estado.inimigoSelecionado;
  if (idIni) {
    estado.alterar((f) => { f.inimigos = f.inimigos.filter((i) => i.id !== idIni); });
    estado.selecionarInimigo(null);
    estado.avisar(`Inimigo ${idIni} removido.`);
    return;
  }
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

// ---------- Copiar, recortar, colar e continuação ----------
/** Objeto copiado (Ctrl+C). Fica guardado ao trocar de fase, para colar em outra. */
let copiado: ObjetoFase | null = null;
let colagens = 0;

function copiarSelecionado(recortar = false) {
  const o = estado.objetoSelecionado();
  if (!o) { estado.avisar('Selecione um objeto para copiar.'); return; }
  copiado = JSON.parse(JSON.stringify(o));
  colagens = 0;
  if (recortar) { excluirSelecionado(); estado.avisar(`Recortado: ${o.nome}. Ctrl+V cola onde está o mouse.`); }
  else estado.avisar(`Copiado: ${o.nome} (${Math.round(o.w * o.escala)} × ${Math.round(o.h * o.escala)} px). Ctrl+V cola onde está o mouse.`);
}

function colar() {
  if (!copiado) { estado.avisar('Nada copiado ainda: selecione um objeto e use Ctrl+C.'); return; }
  const c: ObjetoFase = JSON.parse(JSON.stringify(copiado));
  c.id = novoIdObjeto(estado.fase);
  // Mesma camada do original (se existir e estiver liberada); senão, a camada ativa
  const camOrig = estado.camada(c.camada);
  if (!camOrig || camOrig.travada || !camOrig.visivel) c.camada = estado.camadaAtiva;
  const cam = estado.camada(c.camada);
  if (!cam || cam.travada) { estado.avisar('A camada ativa está travada: destrave para colar.'); return; }
  const m = viewport.posicaoMouse;
  if (m) {
    const pos = viewport.posicaoColocacao(m.x, m.y, c.w * c.escala, c.h * c.escala, c.camada);
    c.x = pos.x; c.y = pos.y;
  } else {
    colagens++;
    c.x += 16 * colagens; c.y += 16 * colagens;
  }
  estado.alterar((f) => { f.objetos.push(c); });
  estado.selecionar(c.id);
  estado.avisar(`Colado: ${c.nome} na camada ${cam.nome}.`);
}

/** Cópia encostada exatamente ao lado do selecionado (para cenários em loop, chão, muros…). */
function continuar(lado: 'direita' | 'esquerda' | 'cima' | 'baixo') {
  const o = estado.objetoSelecionado();
  if (!o) { estado.avisar('Selecione o objeto que vai continuar.'); return; }
  const c: ObjetoFase = JSON.parse(JSON.stringify(o));
  c.id = novoIdObjeto(estado.fase);
  const w = o.w * o.escala, h = o.h * o.escala;
  if (lado === 'direita') c.x = o.x + w;
  if (lado === 'esquerda') c.x = o.x - w;
  if (lado === 'cima') c.y = o.y - h;
  if (lado === 'baixo') c.y = o.y + h;
  estado.alterar((f) => { f.objetos.splice(f.objetos.indexOf(o) + 1, 0, c); });
  estado.selecionar(c.id);
  const frac = !Number.isInteger(Math.round(w * 1000) / 1000) || !Number.isInteger(Math.round(h * 1000) / 1000);
  estado.avisar(`Continuação para ${lado === 'cima' ? 'cima' : lado === 'baixo' ? 'baixo' : 'a ' + lado}: ${o.nome}.`
    + (frac ? ` Tamanho fracionário (${w.toFixed(2)} × ${h.toFixed(2)} px): se aparecer uma emenda, use um tamanho em px inteiro.` : ' Repita para continuar o loop.'));
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
  if (c) { estado.alterar(() => { c.pontos = c.pontos.map(([x, y]) => [x + dx, y + dy]); }); return; }
  const o = estado.objetoSelecionado();
  if (!o) return;
  estado.alterar(() => { o.x += dx; o.y += dy; });
}

new PainelPropriedades(painelProps, estado, {
  duplicar: duplicarSelecionado,
  abrirCodigo: (id) => void abrirCodigo(id ? 'obj:' + id : 'fase'),
  tiposInimigo: () => [...tiposInimigo].map(([arquivo, t]) => ({ arquivo, nome: t.p.nome, vida: t.p.inimigo?.vida, script: t.p.script })),
  abrirPersonagem: (arquivo) => void abrirPersonagens(arquivo),
  abrirCodigoInimigo: (id) => void abrirCodigo('ini:' + id),
  copiar: () => copiarSelecionado(),
  continuar,
  excluir: excluirSelecionado,
  ordem: mudarOrdem,
  escalar: (f) => viewport.escalarSelecionado(f),
  otimizar: plat.tipo === 'electron' ? () => void otimizarSelecionado() : null,
  aoEscalar: (o) => viewport.aoEscalar(o),
  listarFases: () => plat.listarFases(),
  escolherAlvo: () => new Promise((resolve) => {
    if (estado.modo !== 'selecionar') estado.definirModo('selecionar');
    const origem = estado.selecionado;
    estado.avisar('Clique no objeto que será o alvo. Esc cancela.');
    estado.escolhendoAlvo = (id) => {
      if (origem) estado.selecionar(origem);
      estado.avisar(id ? `Alvo escolhido: ${estado.objeto(id)?.nome ?? id}` : 'Escolha de alvo cancelada.');
      resolve(id);
    };
  }),
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

/** Nome de arquivo livre em jogo/fases (não sobrescreve outra fase com o mesmo nome). */
async function arquivoLivre(nome: string) {
  const existentes = new Set(await plat.listarFases());
  const base = nomeArquivoFase(nome).replace(/\.json$/, '');
  let candidato = base + '.json';
  for (let i = 2; existentes.has(candidato); i++) candidato = `${base}_${i}.json`;
  return candidato;
}

async function salvar(): Promise<boolean> {
  const arquivo = estado.arquivoFase ?? await arquivoLivre(estado.fase.nome);
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
const botaoTestar = botaoBarra('play', 'Testar', 'Testar a fase', () => void alternarTeste(), 'testar');
dica(botaoTestar, 'Testar a fase', 'Jogue a fase agora com o personagem do teste e as teclas da ferramenta Controles (B). Esc volta ao editor.', 'F5');

// ---------- ▶ Testar ----------
const teste = new ModoTeste(viewport, estado, centro);
// Ao parar o teste, o log inteiro dele vai para logs/ (o Claude lê de lá quando você relata um problema)
teste.aoTerminarLog = async (texto) => {
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  const nome = `teste_${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}-${p2(d.getMinutes())}-${p2(d.getSeconds())}.log`;
  const cabecalho = `Lorex Engine 2D · log de teste · ${d.toLocaleString('pt-BR')}\nFase: ${estado.fase.nome}${estado.arquivoFase ? ` (${estado.arquivoFase})` : ''}\n\n`;
  try {
    const caminho = await plat.salvarLog(nome, cabecalho + texto + '\n');
    if (caminho) painelLog.mostrarArquivo(caminho);
  } catch (err) { LOG.add({ cat: 'erro', texto: `Não consegui salvar o log do teste: ${String(err)}` }); }
};
teste.aoMudarConfig = (c) => { config.jogador = c; salvarConfigDepois(); };
teste.aoMudarEstado = () => {
  app.classList.toggle('testando', estado.testando);
  botaoTestar.classList.toggle('ligado', estado.testando);
  botaoTestar.querySelector('span:last-child')!.textContent = estado.testando ? 'Parar' : 'Testar';
  // Durante o teste o botão vira "parar" (quadrado), no topo e na barra lateral
  const ico = ICONES[estado.testando ? 'parar' : 'play'];
  botaoTestar.querySelector('.ico')!.innerHTML = ico;
  const noTrilho = document.querySelector<HTMLElement>('.trilho-ferramentas [data-id="testar"] .ico');
  if (noTrilho) noTrilho.innerHTML = ico;
  atualizarModos();
  if (!estado.testando) viewport.app.canvas.focus();
};
// Saída para outra fase/área durante o teste: abre o destino e continua testando lá, levando o inventário
teste.aoIrPara = async (destino) => {
  const inv = teste.inventarioParaLevar;
  teste.parar();
  if (!(await abrirFase(destino))) { estado.avisar(`Não consegui ir para ${destino}.`); return; }
  teste.config = { ...JOGADOR_PADRAO, ...(config.jogador ?? {}) };
  teste.controles = normalizarControles(config.controles);
  await prepararPersonagemTeste();
  await carregarTiposInimigo();
  teste.hudConfig = normalizarHud(config.hud);
  await teste.prepararScripts(await fontesScripts());
  teste.levarInventario(inv);
  teste.iniciar();
  estado.avisar(`Chegou em ${estado.fase.nome}.`);
};

async function alternarTeste() {
  if (estado.testando) { teste.parar(); return; }
  if (viewport.carimboAtivo) viewport.cancelarCarimbo();
  viewport.ferrColisao.cancelar();
  teste.config = { ...JOGADOR_PADRAO, ...(config.jogador ?? {}) };
  teste.controles = normalizarControles(config.controles);
  await prepararPersonagemTeste();
  await carregarTiposInimigo();
  teste.hudConfig = normalizarHud(config.hud);
  await teste.prepararScripts(await fontesScripts());
  teste.iniciar();
}

/** Código desta partida: jogo.js, o da fase, o do personagem e o de cada objeto. */
async function fontesScripts(): Promise<FontesScripts> {
  const existentes = new Set(await plat.listarDados('scripts'));
  const ler = async (arquivo?: string | null) => {
    if (!arquivo || !existentes.has(arquivo)) return undefined;
    try { return { arquivo, codigo: await plat.lerDados('scripts', arquivo) }; } catch { return undefined; }
  };
  const objetos: FontesScripts['objetos'] = [];
  for (const o of estado.fase.objetos) {
    const f = await ler(o.script);
    if (f) objetos.push({ id: o.id, ...f });
    else if (o.script) estado.avisar(`O script ${o.script} de ${o.nome} não existe mais.`);
  }
  // Inimigos: cada inimigo colocado usa o script do seu tipo (personagem NPC)
  const inimigos: NonNullable<FontesScripts['inimigos']> = [];
  for (const i of estado.fase.inimigos) {
    const f = await ler(tiposInimigo.get(i.personagem)?.p.script);
    if (f) inimigos.push({ id: i.id, ...f });
  }
  return { jogo: await ler('jogo.js'), fase: await ler(estado.fase.script), personagem: await ler(personagemDoTeste?.script), objetos, inimigos };
}

// ---------- Código (painel estilo VS Code) ----------
const painelCodigo = new PainelCodigo(plat);
painelCodigo.aoAvisar = (m) => estado.avisar(m);
painelCodigo.aoTestar = () => void alternarTeste();
painelLog.aoAbrirScript = (arquivo, linha) => { if (estado.testando) teste.parar(); void painelCodigo.irPara(arquivo, linha); };

/** Arquivo da fase atual (salva antes, se for nova). */
async function garantirFaseSalva(): Promise<string | null> {
  if (estado.arquivoFase && !estado.sujo) return estado.arquivoFase;
  return (await salvar()) ? estado.arquivoFase : null;
}

// Fonte 1: o jogo inteiro (jogo.js)
painelCodigo.registrarFonte(async () => {
  const existe = (await plat.listarDados('scripts')).includes('jogo.js');
  return [{ chave: 'jogo', grupo: 'Jogo', nome: 'Jogo (global)', detalhe: 'vale em todas as fases', dono: 'jogo', arquivo: existe ? 'jogo.js' : null, arquivoNovo: arquivoScript.jogo() }];
});
// Fonte 2: a fase aberta e seus objetos
painelCodigo.registrarFonte(async () => {
  const f = estado.fase;
  const arqFase = estado.arquivoFase ?? nomeArquivoFase(f.nome);
  const grupo = `${f.tipo === 'area' ? 'Área' : 'Fase'}: ${f.nome}`;
  const lista: ElementoCodigo[] = [{
    chave: 'fase', grupo, nome: f.nome, detalhe: f.tipo === 'area' ? 'script da área' : 'script da fase', dono: 'fase',
    arquivo: f.script ?? null, arquivoNovo: arquivoScript.fase(arqFase),
    ligar: async (a) => { estado.alterar((x) => { x.script = a; }); return !!(await garantirFaseSalva()); },
  }];
  for (const o of [...f.objetos].sort((a, b) => a.nome.localeCompare(b.nome))) {
    const c = comportamentoDe(o);
    lista.push({
      chave: 'obj:' + o.id, grupo, nome: o.nome,
      detalhe: `${o.tipo === 'interativo' ? (c ? NOMES_COMPORTAMENTO[c.tipo].nome : 'interativo') : 'estático'} · ${estado.camada(o.camada)?.nome ?? o.camada}`,
      dono: 'objeto', arquivo: o.script, arquivoNovo: arquivoScript.objeto(arqFase, o.id),
      ligar: async (a) => { estado.alterar(() => { o.script = a; }); return !!(await garantirFaseSalva()); },
    });
  }
  // Inimigos colocados: o código é do TIPO (personagem NPC), compartilhado por todos daquele tipo
  for (const i of f.inimigos) {
    const t = tiposInimigo.get(i.personagem);
    lista.push({
      chave: 'ini:' + i.id, grupo, nome: `${t?.p.nome ?? i.personagem} (${i.id})`, detalhe: `inimigo · código do tipo ${i.personagem}`,
      dono: 'inimigo', arquivo: t?.p.script ?? null, arquivoNovo: arquivoScript.inimigo(i.personagem),
      ligar: async (a) => {
        const atual = normalizarPersonagem(JSON.parse(await plat.lerDados('personagens', i.personagem)));
        atual.script = a;
        await plat.salvarDados('personagens', i.personagem, JSON.stringify(atual, null, 2));
        await carregarTiposInimigo();
        return true;
      },
    });
  }
  return lista;
});
// Fonte 3: personagens (jogador e NPCs)
painelCodigo.registrarFonte(async () => {
  const lista: ElementoCodigo[] = [];
  for (const arq of await plat.listarDados('personagens')) {
    try {
      const p = normalizarPersonagem(JSON.parse(await plat.lerDados('personagens', arq)));
      lista.push({
        chave: 'pers:' + arq, grupo: 'Personagens', nome: p.nome, detalhe: p.tipo === 'npc' ? (p.inimigo ? 'NPC · inimigo' : 'NPC') : 'Jogador', dono: p.tipo === 'npc' ? 'inimigo' : 'personagem',
        arquivo: p.script ?? null, arquivoNovo: arquivoScript.personagem(arq),
        ligar: async (a) => {
          const atual = normalizarPersonagem(JSON.parse(await plat.lerDados('personagens', arq)));
          atual.script = a;
          await plat.salvarDados('personagens', arq, JSON.stringify(atual, null, 2));
          return true;
        },
      });
    } catch { /* personagem ilegível: fica de fora */ }
  }
  return lista;
});
// Fonte 4: scripts que não pertencem a nada aberto agora (de outras fases ou sem dono)
painelCodigo.registrarFonte(async () => {
  const usados = new Set<string>(['jogo.js']);
  if (estado.fase.script) usados.add(estado.fase.script);
  for (const o of estado.fase.objetos) if (o.script) usados.add(o.script);
  for (const arq of await plat.listarDados('personagens')) {
    try { const p = JSON.parse(await plat.lerDados('personagens', arq)) as { script?: string }; if (p.script) usados.add(p.script); } catch { /* ignora */ }
  }
  return (await plat.listarDados('scripts')).filter((a) => !usados.has(a)).map((a) => ({
    chave: 'arq:' + a, grupo: 'Outros scripts', nome: a, detalhe: /\./.test(a.replace(/\.js$/, '')) ? `de ${a.split('.')[0]}` : 'sem dono',
    dono: 'objeto' as const, arquivo: a, arquivoNovo: a,
  }));
});
// Autocompletar com o que existe no projeto
painelCodigo.tipos = async () => {
  const f = estado.fase;
  const pers = await lerPersonagemTeste(false);
  const itens = f.objetos.flatMap((o) => { const c = comportamentoDe(o); return c?.tipo === 'coletavel' ? [c.item] : c?.tipo === 'porta' && c.requer ? [c.requer] : []; });
  return tiposApi({
    objetos: f.objetos.map((o) => o.nome),
    acoes: [...ACOES_SISTEMA.map((a) => a.id), ...Object.keys(normalizarControles(config.controles).acoes)],
    animacoes: [...new Set([...(pers ? Object.keys(pers.animacoes) : []), ...[...tiposInimigo.values()].flatMap((t) => Object.keys(t.p.animacoes))])],
    inimigos: f.inimigos.map((i) => i.id),
    hud: normalizarHud(config.hud).elementos.map((e) => e.chave),
    fases: await plat.listarFases(),
    itens,
  });
};
async function abrirCodigo(foco?: string) {
  if (estado.testando) teste.parar();
  if (editorPersonagens.aberta) await editorPersonagens.fechar();
  if (editorControles.aberta) editorControles.fechar();
  await painelCodigo.abrir(foco);
}

// ---------- Tipos de inimigo (personagens NPC) ----------
let tiposInimigo = new Map<string, TipoInimigo>();
/** Lê os personagens NPC (com IA de inimigo) e carrega as texturas: o editor desenha e o ▶ Testar usa. */
async function carregarTiposInimigo() {
  const novo = new Map<string, TipoInimigo>();
  for (const arq of await plat.listarDados('personagens')) {
    try {
      const p = normalizarPersonagem(JSON.parse(await plat.lerDados('personagens', arq)));
      if (p.tipo !== 'npc' || !p.animacoes.parado) continue;
      novo.set(arq, await carregarTipo(arq, p, (folha) => viewport.textura(folha)));
    } catch (err) { LOG.add({ cat: 'erro', texto: `Não consegui carregar o inimigo ${arq}: ${String(err)}` }); }
  }
  tiposInimigo = novo;
  viewport.definirTiposInimigo(novo);
  teste.definirTiposInimigo(novo);
  if (!novo.has(estado.tipoInimigoNovo)) estado.tipoInimigoNovo = [...novo.keys()][0] ?? '';
  atualizarBarraInimigos();
}

/** Lê o personagem do ▶ Testar (null = retângulo provisório). */
async function lerPersonagemTeste(avisar = true): Promise<Personagem | null> {
  if (!config.personagemTeste) return null;
  try { return normalizarPersonagem(JSON.parse(await plat.lerDados('personagens', config.personagemTeste))); }
  catch { if (avisar) estado.avisar(`Não achei o personagem ${config.personagemTeste}; testando com o retângulo provisório.`); return null; }
}

/** Carrega o personagem animado escolhido para o teste (se houver). */
let personagemDoTeste: Personagem | null = null;
async function prepararPersonagemTeste() {
  const dados = await lerPersonagemTeste();
  personagemDoTeste = dados;
  try { await teste.definirPersonagem(dados, (folha) => viewport.textura(folha)); }
  catch (err) { estado.avisar(`Não consegui carregar as animações: ${String(err)}`); await teste.definirPersonagem(null, (f) => viewport.textura(f)); }
}

// ---------- Personagens ----------
const editorPersonagens = new EditorPersonagens(plat);
editorPersonagens.aoAvisar = (m) => estado.avisar(m);
editorPersonagens.aoDefinirTeste = (arquivo) => { config.personagemTeste = arquivo; salvarConfigDepois(); };
async function abrirPersonagens(arquivo?: string) {
  if (estado.testando) teste.parar();
  if (editorControles.aberta) editorControles.fechar();
  editorPersonagens.controles = normalizarControles(config.controles);
  await editorPersonagens.abrir(biblioteca.caminhos, config.personagemTeste ?? '', arquivo);
}
editorPersonagens.aoAbrirControles = () => void abrirControles();
editorPersonagens.aoSalvo = () => void carregarTiposInimigo();
editorPersonagens.aoAbrirCodigo = (arquivo) => void abrirCodigo('pers:' + arquivo);
// Renomear uma animação extra leva junto as teclas dela
editorPersonagens.aoRenomearAcao = (antiga, nova) => {
  const c = normalizarControles(config.controles);
  if (!c.acoes[antiga] || c.acoes[nova]) return;
  c.acoes[nova] = c.acoes[antiga];
  delete c.acoes[antiga];
  config.controles = c;
  salvarConfigDepois();
};

// ---------- HUD ----------
const editorHud = new EditorHud();
editorHud.aoMudar = (h: import('./core/hud').ConfigHud) => { config.hud = h; salvarConfigDepois(); };
async function abrirHud() {
  if (estado.testando) teste.parar();
  editorHud.abrir(normalizarHud(config.hud), estado.fase.resolucaoBase, estado.fase.objetos.flatMap((o) => { const c = comportamentoDe(o); return c?.tipo === 'coletavel' ? [c.item] : []; }));
}

// ---------- Controles ----------
const editorControles = new EditorControles();
editorControles.aoAvisar = (m) => estado.avisar(m);
editorControles.aoMudar = (c) => { config.controles = c; salvarConfigDepois(); editorPersonagens.atualizarControles(c); };
async function abrirControles() {
  if (estado.testando) teste.parar();
  if (editorPersonagens.aberta) {
    // Vindo do editor de Personagens: usa o personagem aberto lá (mesmo não salvo)
    editorControles.abrir(normalizarControles(config.controles), editorPersonagens.personagemAtual);
    return;
  }
  editorControles.abrir(normalizarControles(config.controles), await lerPersonagemTeste(false));
}

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

// ---------- Barra de ferramentas lateral (estilo Photoshop) ----------
const trilhoFerr = el('nav', { class: 'trilho-ferramentas', 'aria-label': 'Ferramentas' });
type ItemTrilho = { id: string; ico: keyof typeof ICONES; titulo: string; texto: string; atalho: string; acao: () => void; modo?: 'selecionar' | 'mao' | 'colisao' | 'inicio' | 'inimigo' };
const itensTrilho: (ItemTrilho | 'sep')[] = [
  { id: 'selecionar', modo: 'selecionar', ico: 'cursor', titulo: 'Selecionar e mover', atalho: 'V', acao: () => estado.definirModo('selecionar'),
    texto: 'Clique num objeto para selecionar, arraste para mover, use as alças dos cantos para mudar o tamanho. A bandeira verde (início do jogador) também se arrasta.' },
  { id: 'mao', modo: 'mao', ico: 'mao', titulo: 'Mover a visão', atalho: 'H', acao: () => estado.definirModo('mao'),
    texto: 'Arraste para navegar pelo cenário sem mexer em nada. Em qualquer ferramenta, segure Espaço para o mesmo efeito. A roda do mouse dá zoom.' },
  { id: 'elementos', ico: 'elementos', titulo: 'Elementos (caixa de ferramentas)', atalho: 'T', acao: () => alternarLateral(),
    texto: 'Mostra ou oculta o painel com suas pastas de elementos e a biblioteca. Clique numa miniatura e depois no cenário para colocar o elemento na camada ativa.' },
  'sep',
  { id: 'colisao', modo: 'colisao', ico: 'colisao', titulo: 'Colisão', atalho: 'C', acao: () => estado.definirModo(estado.modo === 'colisao' ? 'selecionar' : 'colisao'),
    texto: 'Desenha onde o jogador pisa e esbarra. Ao escolher, aparece uma barra no topo do cenário com as formas (bloco, rampas, polígono, linha, mão livre) e o tipo (sólido ou atravessável).' },
  { id: 'inicio', modo: 'inicio', ico: 'bandeira', titulo: 'Início do jogador', atalho: 'I', acao: () => estado.definirModo('inicio'),
    texto: 'Clique no cenário onde ficam os pés da personagem quando a fase começa. A bandeira verde marca esse lugar.' },
  { id: 'inimigos', modo: 'inimigo', ico: 'inimigo', titulo: 'Inimigos', atalho: 'N', acao: () => estado.definirModo(estado.modo === 'inimigo' ? 'selecionar' : 'inimigo'),
    texto: 'Coloca inimigos na fase: escolha o tipo na barra de cima (ex.: Zumbi) e clique no cenário (ele pisa no chão abaixo). Clique num inimigo para selecionar e arraste para mover; Del exclui.' },
  { id: 'personagens', ico: 'personagem', titulo: 'Personagens', atalho: 'K', acao: () => void abrirPersonagens(),
    texto: 'Monta personagens animados a partir dos spritesheets (parado, andando, pulando, caindo…), marca os pés e a caixa de colisão, e escolhe quem é o jogador no ▶ Testar.' },
  { id: 'hud', ico: 'hud', titulo: 'HUD', atalho: 'U', acao: () => void abrirHud(),
    texto: 'Edita o que aparece na tela durante o jogo: munição, inimigos vivos, itens, valores do código. Arraste os elementos na prévia da tela.' },
  { id: 'codigo', ico: 'codigo', titulo: 'Código', atalho: 'O', acao: () => void abrirCodigo(),
    texto: 'Painel de código estilo VS Code: à esquerda o jogo, a fase, cada objeto e cada personagem; à direita o editor. Programe o que os comportamentos prontos não cobrem.' },
  { id: 'controles', ico: 'controle', titulo: 'Controles', atalho: 'B', acao: () => void abrirControles(),
    texto: 'Define qual tecla faz cada ação no ▶ Testar: andar, pular, interagir e as ações do personagem (tiro, recarga…). Aceita tecla, combinação (Shift + J) e sequência (↓ › → › J).' },
  'sep',
  { id: 'testar', ico: 'play', titulo: 'Testar a fase', atalho: 'F5', acao: () => void alternarTeste(),
    texto: 'Jogue a fase agora com as teclas da ferramenta Controles (padrão: setas ou A/D andam, Espaço pula, E interage, J atira, R recarrega). F6 volta ao início, Esc volta ao editor.' },
];
for (const item of itensTrilho) {
  if (item === 'sep') { trilhoFerr.append(el('div', { class: 'trilho-sep', role: 'separator' })); continue; }
  const b = el('button', { type: 'button', class: 'ferramenta' + (item.id === 'testar' ? ' testar' : '') }, icone(item.ico));
  b.dataset.id = item.id;
  if (item.modo) b.dataset.modo = item.modo;
  dica(b, item.titulo, item.texto, item.atalho);
  b.setAttribute('aria-label', `${item.titulo} (${item.atalho})`);
  b.addEventListener('click', item.acao);
  trilhoFerr.append(b);
}
app.append(trilhoFerr);

function atualizarModos() {
  trilhoFerr.querySelectorAll<HTMLButtonElement>('.ferramenta').forEach((b) => {
    const ativo = b.dataset.modo === estado.modo || (b.dataset.id === 'elementos' && !app.classList.contains('lateral-oculta')) || (b.dataset.id === 'testar' && estado.testando);
    b.classList.toggle('ligado', ativo);
    b.setAttribute('aria-pressed', String(ativo));
  });
  barraColisao.hidden = estado.modo !== 'colisao' || estado.testando;
  barraInimigos.hidden = estado.modo !== 'inimigo' || estado.testando;
  if (estado.modo === 'inimigo') atualizarBarraInimigos();
  if (estado.modo !== 'colisao') viewport.ferrColisao.cancelar();
}

// ---------- Barra de opções da ferramenta Colisão ----------
type FormaItem = { f: FormaNova; ico: keyof typeof ICONES; titulo: string; texto: string };
const formasColisao: FormaItem[] = [
  { f: 'bloco', ico: 'bloco', titulo: 'Bloco', texto: 'Arraste para desenhar um retângulo: chão, parede, caixa, degrau.' },
  { f: 'rampa-direita', ico: 'rampaDireita', titulo: 'Rampa que sobe para a direita', texto: 'Arraste para desenhar a rampa dentro de um retângulo.' },
  { f: 'rampa-esquerda', ico: 'rampaEsquerda', titulo: 'Rampa que sobe para a esquerda', texto: 'Arraste para desenhar a rampa dentro de um retângulo.' },
  { f: 'poligono', ico: 'poligono', titulo: 'Polígono', texto: 'Clique para cada vértice e feche clicando no primeiro ponto, com duplo clique ou Enter. Bom para terrenos irregulares e pedras.' },
  { f: 'linha', ico: 'linha', titulo: 'Linha', texto: 'Clique ponto a ponto para traçar uma superfície (chão ondulado, telhado, galho). Termine com duplo clique, Enter ou botão direito.' },
  { f: 'maoLivre', ico: 'maoLivre', titulo: 'Mão livre', texto: 'Arraste para desenhar uma linha à mão livre seguindo o relevo da arte. A engine simplifica o traço automaticamente.' },
];
const segFormas = el('div', { class: 'segmentado formas', role: 'radiogroup', 'aria-label': 'Forma' });
formasColisao.forEach((item, i) => {
  const b = el('button', { type: 'button', role: 'radio' }, icone(item.ico));
  b.dataset.forma = item.f;
  dica(b, item.titulo, item.texto, String(i + 1));
  b.addEventListener('click', () => { estado.formaNova = item.f; viewport.ferrColisao.cancelar(); atualizarOpcoesColisao(); });
  segFormas.append(b);
});
const segComportamento = el('div', { class: 'segmentado', role: 'radiogroup', 'aria-label': 'Tipo' });
for (const [c, rotulo, texto] of [
  ['solido', 'Sólido', 'O jogador não atravessa: chão, paredes e teto.'],
  ['atravessavel', 'Atravessável', 'Plataforma: o jogador sobe por baixo e fica em cima (só as bordas de cima seguram).'],
] as const) {
  const b = el('button', { type: 'button', role: 'radio' }, el('span', { class: 'amostra ' + c }), rotulo);
  b.dataset.comp = c;
  dica(b, rotulo, texto + ' Vale para as próximas formas; para mudar uma forma pronta, selecione-a e use o painel de propriedades.', 'X');
  b.addEventListener('click', () => { estado.comportamentoNovo = c; atualizarOpcoesColisao(); });
  segComportamento.append(b);
}
const dicaColisao = el('span', { class: 'dica-flutuante' });
function atualizarOpcoesColisao() {
  segFormas.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    const a = b.dataset.forma === estado.formaNova; b.classList.toggle('ativo', a); b.setAttribute('aria-checked', String(a));
  });
  segComportamento.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    const a = b.dataset.comp === estado.comportamentoNovo; b.classList.toggle('ativo', a); b.setAttribute('aria-checked', String(a));
  });
  const f = formasColisao.find((x) => x.f === estado.formaNova)!;
  dicaColisao.textContent = `${f.titulo}: ${f.texto}`;
}
const barraColisao = el('div', { class: 'barra-flutuante' }, segFormas, el('div', { class: 'sep-v' }), segComportamento, dicaColisao);
barraColisao.hidden = true;
centro.append(barraColisao);
atualizarOpcoesColisao();
// ---------- Barra da ferramenta Inimigos ----------
const seletorInimigo = el('select', { 'aria-label': 'Tipo de inimigo' });
seletorInimigo.addEventListener('change', () => { estado.tipoInimigoNovo = seletorInimigo.value; });
dica(seletorInimigo, 'Tipo de inimigo', 'O que será colocado ao clicar no cenário. Os tipos são personagens NPC (Personagens, K) com a seção Inimigo preenchida.');
const novoTipoInimigo = el('button', { type: 'button', class: 'secundario' }, 'Editar tipos…');
dica(novoTipoInimigo, 'Editar tipos de inimigo', 'Abre Personagens: animações, vida, visão, velocidades e ataques de cada inimigo.', 'K');
novoTipoInimigo.addEventListener('click', () => void abrirPersonagens(estado.tipoInimigoNovo || undefined));
const dicaInimigos = el('span', { class: 'dica-barra' }, 'Clique para colocar · arraste para mover · Del exclui');
const barraInimigos = el('div', { class: 'barra-flutuante' }, el('strong', { class: 'rotulo-barra' }, 'Inimigo:'), seletorInimigo, novoTipoInimigo, el('div', { class: 'sep-v' }), dicaInimigos);
barraInimigos.hidden = true;
centro.append(barraInimigos);
function atualizarBarraInimigos() {
  seletorInimigo.replaceChildren(...(tiposInimigo.size
    ? [...tiposInimigo].map(([arq, t]) => el('option', { value: arq }, `${t.p.nome} (${arq})`))
    : [el('option', { value: '' }, 'Nenhum NPC: crie em Personagens (K)')]));
  seletorInimigo.value = estado.tipoInimigoNovo;
}

estado.on('modo', () => {
  if (estado.modo === 'inimigo') {
    estado.avisar(tiposInimigo.size ? 'Inimigos: escolha o tipo na barra de cima e clique no cenário para colocar.' : 'Inimigos: ainda não há personagem NPC. Crie um em Personagens (K), tipo NPC.');
    void carregarTiposInimigo();
  }
  atualizarModos();
  if (estado.modo === 'colisao') estado.avisar('Colisão: escolha a forma e o tipo na barra do topo e desenhe no cenário. Clique numa forma pronta para editar.');
  if (estado.modo === 'inicio') estado.avisar('Início do jogador: clique onde ficam os pés da personagem ao começar.');
  if (estado.modo === 'mao') estado.avisar('Mover a visão: arraste o cenário.');
});

barra.append(
  botaoMarca,
  el('div', { class: 'grupo' }, nomeProjeto),
  el('div', { class: 'grupo' },
    botaoBarra('novo', 'Nova', 'Nova fase (Ctrl+N): abre a tela inicial', () => void novaFase()),
    seletorFases,
    botaoBarra('salvar', 'Salvar', 'Salvar fase (Ctrl+S)', () => void salvar()),
    indicadorSujo),
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
const stCoord = el('span', { class: 'st-coord' });
const stCamada = el('span', {});
const stMsg = el('span', { class: 'msg', role: 'status' });
const stAtalhos = el('span', { class: 'atalhos' }, 'V/C/I: selecionar, colisão, início · T: ferramentas · Roda: zoom · Espaço/botão do meio: mover a visão · Del: excluir · Ctrl+C/V: copiar/colar · Ctrl+Shift+setas: continuação · Alt: sem ímã · Ctrl+D: duplicar · F: espelhar · Setas: mover 1 px (Shift: 8)');
// Botão do Log na barra de status (com contador de erros)
const stLog = el('button', { type: 'button', class: 'st-log' }, 'Log', el('span', { class: 'st-log-erros' }));
dica(stLog, 'Log', 'Mostra ou esconde o painel de Log embaixo do cenário: teclas, personagem, mundo, código e erros. Os testes são salvos em logs/.', 'L');
stLog.addEventListener('click', () => painelLog.alternar());
const atualizarStLog = () => {
  const n = LOG.linhas.filter((l) => l.cat === 'erro').length;
  const s = stLog.querySelector('.st-log-erros')!;
  s.textContent = n ? String(n) : '';
  stLog.classList.toggle('ligado', painelLog.aberto);
};
LOG.ouvintes.add(atualizarStLog);
painelLog.aoMudarVisibilidade = atualizarStLog;
status.append(stLog, stCoord, stCamada, stMsg, stAtalhos);
atualizarStLog();
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
  if (document.querySelector('.modal-fundo') || inicio.aberta || editorPersonagens.aberta || editorControles.aberta || painelCodigo.aberta || editorHud.aberta) return;
  const ctrl = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (ctrl && k === 's') { e.preventDefault(); void salvar(); return; }
  if (ctrl && k === 'n') { e.preventDefault(); void novaFase(); return; }
  if (digitando()) return;
  if (estado.testando) return; // o modo Testar trata as próprias teclas
  if (e.key === 'F5') { e.preventDefault(); void alternarTeste(); return; }
  if (estado.modo === 'colisao' && !ctrl && viewport.ferrColisao.tecla(e.key)) { e.preventDefault(); return; }
  if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); estado.desfazer(); return; }
  if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); estado.refazer(); return; }
  if (ctrl && k === 'd') { e.preventDefault(); duplicarSelecionado(); return; }
  if (ctrl && k === 'c' && !e.shiftKey) { e.preventDefault(); copiarSelecionado(); return; }
  if (ctrl && k === 'x') { e.preventDefault(); copiarSelecionado(true); return; }
  if (ctrl && k === 'v') { e.preventDefault(); colar(); return; }
  if (ctrl && e.shiftKey && e.key.startsWith('Arrow')) {
    e.preventDefault();
    continuar(({ ArrowRight: 'direita', ArrowLeft: 'esquerda', ArrowUp: 'cima', ArrowDown: 'baixo' } as const)[e.key as 'ArrowRight']);
    return;
  }
  if (ctrl) return;
  switch (e.key) {
    case ' ': e.preventDefault(); viewport.setEspaco(true); break;
    case 'Delete': case 'Backspace': excluirSelecionado(); break;
    case 'Escape':
      if (estado.escolhendoAlvo) { const fn = estado.escolhendoAlvo; estado.escolhendoAlvo = null; fn(null); }
      else if (viewport.carimboAtivo) viewport.cancelarCarimbo();
      else if (estado.modo !== 'selecionar') estado.definirModo('selecionar');
      else estado.selecionar(null);
      break;
    case '1': case '2': case '3': case '4': case '5': case '6':
      if (estado.modo === 'colisao') { estado.formaNova = formasColisao[Number(e.key) - 1].f; viewport.ferrColisao.cancelar(); atualizarOpcoesColisao(); }
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
      else if (k === 'h') estado.definirModo('mao');
      else if (k === 'k') void abrirPersonagens();
      else if (k === 'b') void abrirControles();
      else if (k === 'o') void abrirCodigo();
      else if (k === 'n') estado.definirModo(estado.modo === 'inimigo' ? 'selecionar' : 'inimigo');
      else if (k === 'u') void abrirHud();
      else if (k === 'l') painelLog.alternar();
      else if (k === 'x' && estado.modo === 'colisao') { estado.comportamentoNovo = estado.comportamentoNovo === 'solido' ? 'atravessavel' : 'solido'; atualizarOpcoesColisao(); }
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

// ---------- Mudanças feitas fora do editor (ex.: pelo Claude) ----------
let recarregandoBib = 0;
plat.aoMudarProjeto(async (m) => {
  if (m.tipo === 'assets') {
    clearTimeout(recarregandoBib);
    recarregandoBib = window.setTimeout(async () => { await biblioteca.recarregar(); ferramentas.definir(ferramentasAtuais, biblioteca.caminhos); }, 300);
    return;
  }
  if (m.tipo === 'personagem') { await editorPersonagens.mudouPorFora(m.nome); await carregarTiposInimigo(); if (painelCodigo.aberta) await painelCodigo.atualizarElementos(); return; }
  if (m.tipo === 'script') { await painelCodigo.mudouPorFora(m.nome); return; }
  if (m.tipo === 'config') {
    config = { ...CONFIG_PADRAO, ...((await plat.lerConfigProjeto()) ?? {}) };
    ferramentasAtuais = config.ferramentas ?? [];
    ferramentas.definir(ferramentasAtuais, biblioteca.caminhos);
    estado.avisar('Configuração do projeto atualizada por fora.');
    return;
  }
  // Fase
  await atualizarListaFases();
  if (inicio.aberta) await inicio.render();
  if (m.nome !== estado.arquivoFase) { estado.avisar(`A fase ${m.nome} foi alterada por fora.`); return; }
  if (estado.testando) teste.parar();
  if (estado.sujo) {
    const r = await perguntar('A fase mudou fora do editor',
      `O arquivo ${m.nome} foi alterado fora do editor (por exemplo, pelo Claude), e você tem alterações não salvas aqui.`,
      ['Manter as minhas', 'Carregar a versão do arquivo']);
    if (r !== 1) { estado.avisar('Mantidas as suas alterações. Ao salvar, elas substituem a versão do arquivo.'); return; }
  }
  try {
    const fase = normalizarFase(JSON.parse(await plat.lerFase(m.nome)));
    const camera = { ...estado.camera };
    estado.carregarFase(fase, m.nome);
    Object.assign(estado.camera, camera);
    estado.emit('camera');
    estado.avisar(`Fase atualizada por fora: ${m.nome} recarregada.`);
  } catch (err) {
    estado.avisar(`A fase mudou por fora, mas não consegui ler: ${String(err)}`);
  }
});

// ---------- Início ----------
async function carregarProjeto(nome: string) {
  nomeProjeto.textContent = nome;
  plat.progresso('Lendo a biblioteca de assets…');
  await biblioteca.recarregar();
  config = { ...CONFIG_PADRAO, ...((await plat.lerConfigProjeto()) ?? {}) };
  ferramentasAtuais = config.ferramentas ?? [];
  viewport.cancelarCarimbo();
  ferramentas.definir(ferramentasAtuais, biblioteca.caminhos);
  void carregarTiposInimigo();
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
