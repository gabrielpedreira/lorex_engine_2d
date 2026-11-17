// Lorex Engine 2D: Construtor de Fases (etapa 1)
import './estilo.css';
import { criarFase, nomeArquivoFase, nomeDoArquivo, normalizarFase, novoIdObjeto, type OpcoesFase } from './core/fase';
import type { ObjetoFase } from './core/tipos';
import { Estado } from './editor/estado';
import { Viewport } from './editor/viewport';
import { PlataformaElectron, temElectron } from './plataforma/electron';
import { PlataformaNavegador } from './plataforma/navegador';
import type { Plataforma } from './plataforma/plataforma';
import { Biblioteca } from './ui/biblioteca';
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

const viewport = new Viewport(centro, estado, plat);
const biblioteca = new Biblioteca(esquerda, plat);

// ---------- Ações sobre objetos ----------
function excluirSelecionado() {
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
  const o = estado.objetoSelecionado();
  if (!o) return;
  estado.alterar(() => { o.x += dx; o.y += dy; });
}

new PainelPropriedades(painelProps, estado, { duplicar: duplicarSelecionado, excluir: excluirSelecionado, ordem: mudarOrdem });
new PainelCamadas(painelCamadas, estado);

/** Coloca um asset na camada ativa. (sx, sy) = posição na tela; sem posição = centro da visão. */
async function adicionarAsset(caminhoRaiz: string, sx?: number, sy?: number) {
  const camada = estado.camada(estado.camadaAtiva);
  if (!camada) return;
  if (camada.travada || !camada.visivel) {
    estado.avisar(`A camada "${camada.nome}" está ${camada.travada ? 'travada' : 'oculta'}. Escolha outra camada.`);
    return;
  }
  try {
    const asset = await plat.garantirEmUso(caminhoRaiz);
    const tex = await viewport.textura(asset);
    const centroCam = sx === undefined || sy === undefined
      ? viewport.centroNaCamada(camada.id)
      : viewport.telaParaCamada(sx, sy, camada.id);
    const obj: ObjetoFase = {
      id: novoIdObjeto(estado.fase),
      nome: nomeDoArquivo(caminhoRaiz),
      asset,
      camada: camada.id,
      x: Math.round(centroCam.x - tex.width / 2),
      y: Math.round(centroCam.y - tex.height / 2),
      w: tex.width, h: tex.height,
      escala: 1, rotacao: 0, espelharX: false, espelharY: false, opacidade: 1, visivel: true,
      efeitos: [], comportamentos: [], conexoes: {}, script: null,
    };
    estado.alterar((f) => { f.objetos.push(obj); });
    estado.selecionar(obj.id);
    estado.avisar(`"${obj.nome}" adicionado em ${camada.nome}`);
    if (!caminhoRaiz.startsWith('jogo/') && plat.tipo === 'electron') biblioteca.recarregar();
  } catch (err) {
    estado.avisar(`Erro ao adicionar asset: ${String(err)}`);
  }
}
viewport.aoSoltarAsset = (c, sx, sy) => { void adicionarAsset(c, sx, sy); };
biblioteca.aoAdicionar = (c) => { void adicionarAsset(c); };

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
    botaoBarra('enquadrar', '', 'Enquadrar a fase (Home)', () => viewport.enquadrar()),
    rotuloZoom),
  el('div', { class: 'espaco' }),
  botaoTestar,
);

// ---------- Barra de status ----------
const stCoord = el('span', {});
const stCamada = el('span', {});
const stMsg = el('span', { class: 'msg', role: 'status' });
const stAtalhos = el('span', { class: 'atalhos' }, 'Roda: zoom · Espaço/botão do meio: mover a visão · Del: excluir · Ctrl+D: duplicar · F: espelhar · Setas: mover 1 px (Shift: 8)');
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
    case 'Escape': estado.selecionar(null); break;
    case 'Home': viewport.enquadrar(); break;
    case '+': case '=': viewport.passoZoom(1); break;
    case '-': viewport.passoZoom(-1); break;
    case 'ArrowLeft': e.preventDefault(); moverSelecionado(e.shiftKey ? -8 : -1, 0); break;
    case 'ArrowRight': e.preventDefault(); moverSelecionado(e.shiftKey ? 8 : 1, 0); break;
    case 'ArrowUp': e.preventDefault(); moverSelecionado(0, e.shiftKey ? -8 : -1); break;
    case 'ArrowDown': e.preventDefault(); moverSelecionado(0, e.shiftKey ? 8 : 1); break;
    default:
      if (k === 'f') { const o = estado.objetoSelecionado(); if (o) estado.alterar(() => { o.espelharX = !o.espelharX; }); }
      else if (k === 'g') { estado.grade = !estado.grade; estado.emit('opcoes'); sincronizarAlternadores(); }
      else if (k === 'e') { estado.encaixar = !estado.encaixar; estado.emit('opcoes'); sincronizarAlternadores(); }
      else if (k === 'p') { estado.previaParallax = !estado.previaParallax; estado.emit('opcoes'); sincronizarAlternadores(); }
  }
});
window.addEventListener('keyup', (e) => { if (e.key === ' ') viewport.setEspaco(false); });
window.addEventListener('beforeunload', (e) => { if (estado.sujo) e.preventDefault(); });

function sincronizarAlternadores() {
  const estados = [estado.grade, estado.encaixar, estado.previaParallax];
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
  plat.progresso('Pronto');
  plat.pronto();
}

void iniciar();
