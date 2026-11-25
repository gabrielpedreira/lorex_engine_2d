// Lorex Engine 2D: Construtor de Fases (etapa 1)
import './estilo.css';
import { palpiteAnim, pareceFolha, tamanhoQuadro } from './core/folha';
import { criarFase, nomeArquivoFase, nomeDoArquivo, normalizarFase, novoIdObjeto, type OpcoesFase } from './core/fase';
import type { ObjetoFase } from './core/tipos';
import { Estado } from './editor/estado';
import { Viewport, escalaFullHd, formatarPct } from './editor/viewport';
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
import { FORMAS_LUZ, PainelPropriedades } from './ui/propriedades';
import { divisor, ligarDivisoresAutomaticos } from './ui/divisor';
import { PainelSalas } from './ui/salas';
import { ModoTeste } from './editor/testar';
import { EditorPersonagens } from './ui/personagens';
import { EditorControles } from './ui/controles';
import { PainelLog } from './ui/log';
import { abrirJanelaCodigo, aoReceber, enviar, ponteDisponivel, type ElementoSerial } from './plataforma/ponte';
import { carregarTipo, type TipoInimigo } from './editor/inimigosTeste';
import { EditorHud } from './ui/hud';
import { GuiaAtalhos } from './ui/atalhos';
import { textoAtalho } from './core/controles';
import { normalizarHud } from './core/hud';
import { LOG, capturarErrosGlobais } from './core/log';
import { ACOES_SISTEMA, normalizarControles } from './core/controles';
import { PainelCodigo, type ElementoCodigo } from './ui/codigo/painel';
import { arquivoScript, modeloScript, tiposApi } from './core/scripts';
import { aplicarBlocoFase, aplicarBlocoJogo, aplicarBlocoObjeto, aplicarBlocoPersonagem, blocoFase, blocoJogo, blocoObjeto, blocoPersonagem, escreverBloco, lerBloco, mesmosValores } from './core/configScript';
import { modeloArma, modeloComportamento, modeloInimigoZumbi } from './core/modelosScript';
import type { Personagem as DadosPersonagem } from './core/personagem';

/** Modelo de script de um personagem: arma (jogador) ou cérebro do inimigo (NPC). */
function modeloPersonagem(p: DadosPersonagem): { modelo?: string; pronto?: string } {
  const r: { modelo?: string; pronto?: string } = p.tipo === 'npc' && p.inimigo?.comportamento === 'zumbi' ? { modelo: modeloInimigoZumbi(p.nome, p.inimigo), pronto: 'IA de Zumbi (perambular, perseguir, atacar, alerta por tiro)' }
    : p.tipo !== 'npc' && p.arma ? { modelo: modeloArma(p.nome, p.arma), pronto: `arma (pente ${p.arma.pente}, sem bala, recarga)` } : {};
  return { ...r, modelo: comBloco(r.modelo ?? modeloScript(p.tipo === 'npc' ? 'inimigo' : 'personagem', p.nome), blocoPersonagem(p), p.nome) };
}

/** Texto do script com o bloco config (os valores do editor) no topo. */
function comBloco(texto: string, b: { valores: import('./core/configScript').Bloco; comentarios: Record<string, string> }, titulo: string) {
  return escreverBloco(texto, b.valores, b.comentarios, titulo);
}
import { NOMES_COMPORTAMENTO, comportamentoDe } from './core/comportamentos';
import type { FontesScripts } from './editor/motorScripts';
import { normalizarPersonagem, type Personagem } from './core/personagem';
import { JOGADOR_PADRAO } from './core/fisica';
import { TelaInicio } from './ui/inicio';
import { CONFIG_PADRAO, anticache, novaVersaoImagens, urlAsset } from './plataforma/plataforma';
import { EditorMapa, type InfoSala } from './ui/mapa';
import { TelaTransicao } from './editor/transicao';
import { conexaoDaPassagem, limparMapa, normalizarMapa, resumoTransicao, viagemDe } from './core/mapa';

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
// Divisores arrastáveis: largura das laterais e altura do bloco de Camadas (tamanhos salvos no computador)
const ancoraCamadas = el('div', { class: 'divisor-ancora' });
const ancoraSalas = el('div', { class: 'divisor-ancora' });
const blocoSalas = el('section', { class: 'bloco salas-bloco', 'aria-label': 'Salas' });
direita.append(painelProps, ancoraCamadas, painelCamadas, ancoraSalas, blocoSalas);
const status = el('footer', { class: 'status' });
/** Linha logo abaixo da barra de menu: posição do mouse, camada ativa e a última mensagem do editor. */
const barraInfo = el('div', { class: 'barra-info', role: 'status' });
// Painel de Log (embaixo do cenário): teclas, personagem, mundo, código, erros e avisos
capturarErrosGlobais();
const painelLog = new PainelLog();
app.append(barra, barraInfo, esquerda, centro, painelLog.raiz, direita, status);
esquerda.append(divisor({ id: 'editor-esquerda', eixo: 'x', alvo: app, variavel: '--larg-esq', padrao: 260, min: 170, max: () => Math.max(200, window.innerWidth * 0.4), sentido: 1, lado: 'fim', titulo: 'Largura da caixa de ferramentas / biblioteca' }));
direita.append(divisor({ id: 'editor-direita', eixo: 'x', alvo: app, variavel: '--larg-dir', padrao: 300, min: 220, max: () => Math.max(260, window.innerWidth * 0.45), sentido: -1, lado: 'inicio', titulo: 'Largura do painel de propriedades' }));
ancoraSalas.append(divisor({ id: 'editor-salas', eixo: 'y', alvo: direita, variavel: '--alt-salas', padrao: 220, min: 90, max: () => Math.max(120, window.innerHeight * 0.6), sentido: -1, lado: 'inicio', titulo: 'Altura da lista de salas' }));
ancoraCamadas.append(divisor({ id: 'editor-camadas', eixo: 'y', alvo: direita, variavel: '--alt-camadas', padrao: 280, min: 90, max: () => Math.max(120, window.innerHeight * 0.7), sentido: -1, lado: 'inicio', titulo: 'Altura do bloco de camadas' }));
ligarDivisoresAutomaticos();

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
  const idLuz = estado.luzSelecionada;
  if (idLuz) {
    estado.alterar((f) => { f.luzes = f.luzes.filter((l) => l.id !== idLuz); });
    estado.selecionarLuz(null);
    estado.avisar(`Luz ${idLuz} removida.`);
    return;
  }
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
  destinoNoMapa: (id) => {
    const c = conexaoDaPassagem(normalizarMapa(config.mapa), estado.arquivoFase ?? '', id);
    if (!c) return null;
    const ehA = c.a.fase === estado.arquivoFase && c.a.passagem === id;
    const outra = ehA ? c.b : c.a;
    if (!outra.fase) return null; // a outra ponta foi desligada no Mapa
    if (!ehA && !c.maoDupla) return `chegada de ${outra.fase} (só ida: não leva de volta)`;
    return `${outra.fase}${outra.passagem ? ` (passagem ${outra.passagem})` : ' (início)'} · ${resumoTransicao(c.transicao)}${c.maoDupla ? '' : ' · só ida'}`;
  },
  abrirMapa: () => void abrirMapa(),
  sincronizarModo: (id, modo) => {
    const c = conexaoDaPassagem(normalizarMapa(config.mapa), estado.arquivoFase ?? '', id);
    if (!c || !c.mesmoNosDoisSentidos || !c.maoDupla || !c.b.passagem) return;
    const outra = c.a.fase === estado.arquivoFase && c.a.passagem === id ? c.b : c.a;
    void alterarFaseArquivo(outra.fase, (f) => { const k = f.objetos.find((o) => o.id === outra.passagem)?.comportamentos[0]; if (k?.tipo === 'saida') k.modo = modo; })
      .then(() => LOG.add({ cat: 'sistema', texto: `Mapa: a passagem do outro lado (${outra.fase}) também ficou "${modo === 'tocar' ? 'ao atravessar' : 'apertando Interagir'}"` }));
  },
  tamanhoImagem: async (o) => { const t = await viewport.textura(o.asset); return { w: t.width, h: t.height }; },
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
    // Spritesheet (nome com "spritesheet"/"_8fps" ou tira larga): entra como objeto ANIMADO, mostrando um quadro
    const anim = pareceFolha(nomeDoArquivo(caminhoRaiz), original.width, original.height)
      ? palpiteAnim(nomeDoArquivo(caminhoRaiz), original.width, original.height) : undefined;
    const quadro = anim ? tamanhoQuadro(anim) : { w: original.width, h: original.height };
    let esc = escala || config.escalas?.[caminhoRaiz] || viewport.escalaInicial(quadro.w, quadro.h);
    const reduzidaAuto = !escala && !config.escalas?.[caminhoRaiz] && esc < 1;

    // Se já existe uma cópia otimizada exatamente nesse tamanho, usa ela (leve) em vez do original
    let asset: string, w: number, h: number;
    const otim = anim ? undefined : config.otimizados?.[caminhoRaiz];
    if (otim && otim.w === Math.round(original.width * esc) && otim.h === Math.round(original.height * esc)) {
      asset = otim.asset; w = otim.w; h = otim.h; esc = 1;
    } else {
      asset = await plat.garantirEmUso(caminhoRaiz);
      w = quadro.w; h = quadro.h;
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
      ...(anim ? { anim } : {}),
    };
    estado.alterar((f) => { f.objetos.push(obj); });
    if (anim) LOG.add({ cat: 'sistema', texto: `${obj.nome}: spritesheet colocado como objeto animado (${anim.quadros} quadros, ${anim.fps} fps) — ajuste em Propriedades › Animação` });
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
// Biblioteca › Atualizar (F9): imagens novas, apagadas ou trocadas na pasta
async function atualizarBiblioteca() {
  const pares: [string, string][] = estado.fase.objetos.filter((o) => o.origem && o.asset).map((o) => [o.origem!, o.asset]);
  for (const t of tiposInimigo.values()) for (const a of Object.values(t.p.animacoes)) if (a.origem) pares.push([a.origem, a.folha]);
  const copiadas = await plat.atualizarCopias(pares);
  novaVersaoImagens();
  viewport.recarregarTexturas();
  await biblioteca.recarregar();
  ferramentas.definir(ferramentasAtuais, biblioteca.caminhos);
  await carregarTiposInimigo();
  LOG.add({ cat: 'sistema', texto: `Biblioteca atualizada: ${biblioteca.caminhos.length} imagem(ns)${copiadas.length ? ` · ${copiadas.length} cópia(s) em jogo/assets atualizada(s): ${copiadas.join(', ')}` : ''}` });
  estado.avisar(`Biblioteca atualizada${copiadas.length ? ` (${copiadas.length} imagem(ns) trocada(s) recarregada(s))` : ''}.`);
}
biblioteca.aoAtualizar = () => void atualizarBiblioteca();
// Ferramenta Zona: retângulo desenhado vira um objeto sem imagem (gatilho por padrão)
viewport.aoCriarZona = (x, y, w, h) => {
  const camada = estado.fase.camadas.find((c) => c.id === 'objetos')?.id ?? estado.camadaAtiva;
  const n = estado.fase.objetos.filter((o) => !o.asset).length + 1;
  const obj: ObjetoFase = {
    id: novoIdObjeto(estado.fase), tipo: 'interativo', nome: `Zona ${n}`, asset: '', camada,
    x, y, w, h, escala: 1, rotacao: 0, espelharX: false, espelharY: false, opacidade: 1, visivel: true,
    efeitos: [], comportamentos: [{ tipo: 'gatilho', acao: 'mensagem', texto: '', alvo: '', luz: '', luzAcao: 'alternar', umaVez: true }], conexoes: {}, script: null,
  };
  estado.alterar((f) => { f.objetos.push(obj); });
  estado.definirModo('selecionar');
  estado.selecionar(obj.id);
  estado.avisar(`${obj.nome} criada (${w}×${h} px): escolha o que ela faz em Propriedades › Comportamento. Para uma passagem contínua, troque para "Passagem".`);
};
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
  const baseW = base ? (o.anim ? base.w * tamanhoQuadro(o.anim).w / o.anim.folha[0] : base.w) : 0;
  config.escalas = { ...(config.escalas ?? {}), [o.origem]: baseW ? (o.w * o.escala) / baseW : o.escala };
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
  if (o.anim) { estado.avisar('Objetos animados não são otimizados: reduzir a folha borra e desalinha os quadros da pixel art.'); return; }
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

async function abrirFase(arquivo: string, jaPerguntou = false): Promise<boolean> {
  if (arquivo === estado.arquivoFase) return true;
  if (!jaPerguntou && !(await podeDescartar())) { void atualizarListaFases(); return false; }
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
  abrirMapa: () => void abrirMapa(),
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
teste.urlImagem = (c) => urlAsset(plat, c);
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
teste.aoMudarConfig = (c) => { config.jogador = c; salvarConfigDepois(); sincronizarBlocosDepois(); };
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
// Passagem para outra sala durante o teste (Mapa): transição (corte/escurecer/tela cheia + som) cobrindo a
// janela enquanto o editor abre o destino; o teste continua lá com inventário, munição e variáveis do código.
const telaTransicao = new TelaTransicao((c) => urlAsset(plat, c));
teste.aoIrPara = async (v) => {
  const inv = teste.inventarioParaLevar;
  const outraSala = v.fase !== estado.arquivoFase;
  if (outraSala && estado.sujo) {
    if (!(await podeDescartar())) { teste.cancelarViagem(); estado.avisar('Passagem cancelada: a fase tem alterações não salvas.'); return; }
  }
  await telaTransicao.cobrir(v.transicao);
  teste.prepararViagem(v);
  teste.parar();
  if (outraSala && !(await abrirFase(v.fase, true))) {
    LOG.add({ cat: 'erro', texto: `Passagem: não consegui abrir ${v.fase}` });
    estado.avisar(`Não consegui ir para ${v.fase}.`);
    teste.cancelarViagem();
    await telaTransicao.descobrir();
    return;
  }
  teste.config = { ...JOGADOR_PADRAO, ...(config.jogador ?? {}) };
  teste.controles = normalizarControles(config.controles);
  teste.mapa = normalizarMapa(config.mapa);
  await prepararPersonagemTeste();
  await carregarTiposInimigo();
  teste.hudConfig = normalizarHud(config.hud);
  await teste.prepararScripts(await fontesScripts());
  teste.levarInventario(inv);
  teste.iniciar();
  estado.avisar(`Chegou em ${estado.fase.nome}.`);
  await telaTransicao.descobrir();
};

async function alternarTeste() {
  if (estado.testando) { teste.parar(); return; }
  if (viewport.carimboAtivo) viewport.cancelarCarimbo();
  viewport.ferrColisao.cancelar();
  teste.config = { ...JOGADOR_PADRAO, ...(config.jogador ?? {}) };
  teste.controles = normalizarControles(config.controles);
  teste.mapa = normalizarMapa(config.mapa);
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
painelLog.aoAbrirScript = (arquivo, linha) => {
  if (codigoEmJanela) {
    void abrirJanelaCodigo().then((nova) => {
      if (nova || !janelaCodigoPronta) { janelaCodigoPronta = false; irParaPendente = { arquivo, linha }; }
      else enviar('codigo', { tipo: 'irPara', arquivo, linha });
    });
    return;
  }
  if (estado.testando) teste.parar();
  void painelCodigo.irPara(arquivo, linha);
};

/** Arquivo da fase atual (salva antes, se for nova). */
async function garantirFaseSalva(): Promise<string | null> {
  if (estado.arquivoFase && !estado.sujo) return estado.arquivoFase;
  return (await salvar()) ? estado.arquivoFase : null;
}

// Fonte 1: o jogo inteiro (jogo.js)
painelCodigo.registrarFonte(async () => {
  const existe = (await plat.listarDados('scripts')).includes('jogo.js');
  const b = blocoJogo({ ...JOGADOR_PADRAO, ...(config.jogador ?? {}) });
  return [{ chave: 'jogo', grupo: 'Jogo', nome: 'Jogo (global)', detalhe: 'vale em todas as fases', dono: 'jogo', arquivo: existe ? 'jogo.js' : null, arquivoNovo: arquivoScript.jogo(),
    modelo: escreverBloco(modeloScript('jogo', 'Jogo (global)'), b.valores, b.comentarios, 'o jogo (física do jogador)') }];
});
// Fonte 2: a fase aberta e seus objetos
painelCodigo.registrarFonte(async () => {
  const f = estado.fase;
  const arqFase = estado.arquivoFase ?? nomeArquivoFase(f.nome);
  const grupo = `${f.tipo === 'area' ? 'Área' : 'Fase'}: ${f.nome}`;
  const lista: ElementoCodigo[] = [{
    modelo: comBloco(modeloScript('fase', f.nome, f.tipo === 'area' ? 'área' : 'fase'), blocoFase(f), f.nome),
    chave: 'fase', grupo, nome: f.nome, detalhe: f.tipo === 'area' ? 'script da área' : 'script da fase', dono: 'fase',
    arquivo: f.script ?? null, arquivoNovo: arquivoScript.fase(arqFase),
    ligar: async (a) => { estado.alterar((x) => { x.script = a; }); return !!(await garantirFaseSalva()); },
  }];
  for (const o of [...f.objetos].sort((a, b) => a.nome.localeCompare(b.nome))) {
    const c = comportamentoDe(o);
    const alvoAlavanca = c?.tipo === 'alavanca' && c.alvo ? f.objetos.find((x) => x.id === c.alvo) : undefined;
    lista.push({
      ...(c ? { pronto: NOMES_COMPORTAMENTO[c.tipo].nome } : {}),
      modelo: comBloco(c ? modeloComportamento(o.nome, c, alvoAlavanca ? { nome: alvoAlavanca.nome, porta: comportamentoDe(alvoAlavanca)?.tipo === 'porta' } : undefined) : modeloScript('objeto', o.nome), blocoObjeto(o), o.nome),
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
      ...(t ? modeloPersonagem(t.p) : {}),
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
        ...modeloPersonagem(p),
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
    luzes: f.luzes.flatMap((l) => [l.nome, l.id]),
    fases: await plat.listarFases(),
    itens,
  });
};
// No Electron o Código abre numa JANELA PRÓPRIA (pode ir para o segundo monitor); no navegador, por cima do editor
const codigoEmJanela = ponteDisponivel();
let janelaCodigoPronta = false;
let focoPendente: string | undefined;
let irParaPendente: { arquivo: string; linha?: number } | undefined;

async function abrirCodigo(foco?: string) {
  if (editorPersonagens.aberta) await editorPersonagens.fechar();
  if (editorControles.aberta) editorControles.fechar();
  if (codigoEmJanela) {
    const abriuAgora = await abrirJanelaCodigo();
    if (abriuAgora || !janelaCodigoPronta) { janelaCodigoPronta = false; focoPendente = foco; }
    else enviar('codigo', { tipo: 'foco', ...(foco ? { chave: foco } : {}) });
    return;
  }
  if (estado.testando) teste.parar();
  await painelCodigo.abrir(foco);
}

/** Manda para a janela do Código a lista atual (objetos, inimigos, personagens…) e os tipos do autocompletar. */
let timerElementos = 0;
function avisarCodigoMudou() {
  clearTimeout(timerElementos);
  timerElementos = window.setTimeout(async () => {
    if (codigoEmJanela) {
      if (!janelaCodigoPronta) return;
      const lista: ElementoSerial[] = (await painelCodigo.coletarElementos()).map(({ ligar, ...e }) => ({ ...e, ligavel: !!ligar }));
      enviar('codigo', { tipo: 'elementos', lista, tipos: await painelCodigo.tipos() });
    } else if (painelCodigo.aberta) {
      await painelCodigo.atualizarElementos();
    }
  }, 250);
}
// Tempo real: colocou um inimigo, apagou um objeto, salvou, trocou de fase → a lista do Código acompanha
estado.on('fase', avisarCodigoMudou);
estado.on('arquivo', avisarCodigoMudou);

if (codigoEmJanela) {
  aoReceber(async (msg) => {
    switch (msg.tipo) {
      case 'pronto':
        janelaCodigoPronta = true;
        avisarCodigoMudou();
        if (focoPendente) { enviar('codigo', { tipo: 'foco', chave: focoPendente }); focoPendente = undefined; }
        if (irParaPendente) { enviar('codigo', { tipo: 'irPara', ...irParaPendente }); irParaPendente = undefined; }
        break;
      case 'testar':
        if (estado.testando) teste.parar();
        await alternarTeste();
        break;
      case 'ligar': {
        const e = (await painelCodigo.coletarElementos()).find((x) => x.chave === msg.chave);
        const ok = e?.ligar ? await e.ligar(msg.arquivo) : false;
        enviar('codigo', { tipo: 'resposta', id: msg.id, ok: !!ok });
        avisarCodigoMudou();
        break;
      }
      case 'aviso': estado.avisar(msg.texto); break;
      case 'scriptSalvo': await aplicarBlocoDoScript(msg.arquivo); break;
      case 'codigoFechado': janelaCodigoPronta = false; break;
    }
  });
  // A Saída da janela do Código mostra o que o teste registra (código e erros)
  LOG.ouvintes.add((l) => { if (janelaCodigoPronta && l && (l.cat === 'codigo' || l.cat === 'erro')) enviar('codigo', { tipo: 'log', linha: l }); });
}

// ---------- Bloco config dos scripts: dados ⇄ código ----------
// Tudo o que existe no jogo aparece no painel de Código: o topo de cada script tem `export const config = {…}` com os
// valores das ferramentas (vida, velocidade, dano, tamanho, posição…). Mudou no editor → o bloco é reescrito;
// salvou o script → os valores voltam para o personagem/objeto/fase/jogo.

/** Grava o script só se o texto mudou e avisa o painel (aqui ou na janela do Código). */
async function gravarScriptSeMudou(arquivo: string, texto: string, novo: string) {
  if (novo === texto) return;
  await plat.salvarDados('scripts', arquivo, novo);
  await painelCodigo.mudouPorFora(arquivo);
  if (codigoEmJanela && janelaCodigoPronta) enviar('codigo', { tipo: 'scriptMudou', arquivo });
}

async function lerScript(arquivo: string): Promise<string | null> {
  try { return await plat.lerDados('scripts', arquivo); } catch { return null; }
}

/** Dados → código: reescreve os blocos config dos scripts que existem (jogo, fase aberta, objetos, personagens). */
let sincronizando = false;
async function sincronizarBlocos() {
  if (sincronizando) return;
  sincronizando = true;
  try {
    const existentes = new Set(await plat.listarDados('scripts'));
    /**
     * Valores diferentes entre o script e os dados: vence o mais novo. Script salvo depois (ex.: o Claude editou o
     * arquivo, ou o vigia de arquivos não avisou) → os valores do código vão para os dados; senão o bloco é reescrito.
     */
    const aplicar: string[] = [];
    const trocar = async (arquivo: string | null | undefined, b: { valores: import('./core/configScript').Bloco; comentarios: Record<string, string> }, titulo: string, dados: string | null) => {
      if (!arquivo || !existentes.has(arquivo)) return;
      const texto = await lerScript(arquivo);
      if (texto === null) return;
      const doCodigo = lerBloco(texto);
      if (mesmosValores(doCodigo, b.valores)) return;
      if (doCodigo && dados) {
        const [mS, mD] = await Promise.all([plat.dataArquivo('jogo/scripts/' + arquivo), plat.dataArquivo(dados)]);
        if (mS && mS > mD + 1000) { aplicar.push(arquivo); return; }
      }
      await gravarScriptSeMudou(arquivo, texto, escreverBloco(texto, b.valores, b.comentarios, titulo));
      LOG.add({ cat: 'sistema', texto: `bloco config de ${arquivo} atualizado com os valores do editor` });
    };
    await trocar('jogo.js', blocoJogo({ ...JOGADOR_PADRAO, ...(config.jogador ?? {}) }), 'o jogo (física do jogador)', 'jogo/projeto.json');
    const f = estado.fase;
    const arqFase = !estado.sujo && estado.arquivoFase ? 'jogo/fases/' + estado.arquivoFase : null;
    await trocar(f.script, blocoFase(f), f.nome, arqFase);
    const usos = new Map<string, number>();
    for (const o of f.objetos) if (o.script) usos.set(o.script, (usos.get(o.script) ?? 0) + 1);
    for (const o of f.objetos) if (o.script && usos.get(o.script) === 1) await trocar(o.script, blocoObjeto(o), o.nome, arqFase);
    for (const arq of await plat.listarDados('personagens')) {
      try { const p = normalizarPersonagem(JSON.parse(await plat.lerDados('personagens', arq))); await trocar(p.script, blocoPersonagem(p), p.nome, 'jogo/personagens/' + arq); } catch { /* ilegível */ }
    }
    sincronizando = false;
    for (const a of new Set(aplicar)) await aplicarBlocoDoScript(a);
  } finally { sincronizando = false; }
}
let timerBlocos = 0;
function sincronizarBlocosDepois(ms = 900) { clearTimeout(timerBlocos); timerBlocos = window.setTimeout(() => void sincronizarBlocos(), ms); }

/** Código → dados: o script foi salvo; os valores do bloco config voltam para quem usa o script. */
async function aplicarBlocoDoScript(arquivo: string) {
  const texto = await lerScript(arquivo);
  const b = texto ? lerBloco(texto) : null;
  if (!b) return;
  const mudou: string[] = [];
  if (arquivo === 'jogo.js') {
    const atual = { ...JOGADOR_PADRAO, ...(config.jogador ?? {}) };
    if (!mesmosValores(blocoJogo(atual).valores, b)) {
      config.jogador = aplicarBlocoJogo(atual, b); teste.config = { ...config.jogador }; salvarConfigDepois(); mudou.push('jogo');
    }
  }
  const f = estado.fase;
  if (f.script === arquivo && !mesmosValores(blocoFase(f).valores, b)) { estado.alterar((x) => aplicarBlocoFase(x, b)); mudou.push(f.nome); }
  const donos = f.objetos.filter((o) => o.script === arquivo);
  if (donos.length === 1 && !mesmosValores(blocoObjeto(donos[0]).valores, b)) { estado.alterar(() => aplicarBlocoObjeto(donos[0], b)); mudou.push(donos[0].nome); }
  for (const arq of await plat.listarDados('personagens')) {
    try {
      const p = normalizarPersonagem(JSON.parse(await plat.lerDados('personagens', arq)));
      if (p.script !== arquivo || mesmosValores(blocoPersonagem(p).valores, b)) continue;
      await plat.salvarDados('personagens', arq, JSON.stringify(aplicarBlocoPersonagem(p, b), null, 2));
      await editorPersonagens.mudouPorFora(arq);
      mudou.push(p.nome);
    } catch { /* ilegível */ }
  }
  if (!mudou.length) return;
  if (mudou.some((n) => n !== 'jogo')) await carregarTiposInimigo();
  // A fase mudou pelo código: salva junto (se já tinha arquivo), para o valor valer no ▶ Testar e no disco
  if (estado.sujo && estado.arquivoFase && (f.script === arquivo || donos.length)) await salvar();
  LOG.add({ cat: 'codigo', arquivo, texto: `valores do bloco config aplicados em: ${mudou.join(', ')}` });
  estado.avisar(`Valores do código aplicados: ${mudou.join(', ')}`);
}
painelCodigo.aoSalvarScript = (arquivo) => void aplicarBlocoDoScript(arquivo);
estado.on('fase', () => sincronizarBlocosDepois());
estado.on('arquivo', () => sincronizarBlocosDepois(300));

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
  avisarCodigoMudou();
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
editorPersonagens.aoSalvo = () => { void carregarTiposInimigo(); sincronizarBlocosDepois(300); };
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
const editorHud = new EditorHud({
  imagens: () => plat.listarAssets(),
  garantir: (c, cat) => (c.startsWith('jogo/') ? Promise.resolve(c.slice(5)) : plat.garantirEmUso(c, cat)),
  url: (c) => urlAsset(plat, c) + anticache(),
});
editorHud.aoMudar = (h: import('./core/hud').ConfigHud) => { config.hud = h; salvarConfigDepois(); };
async function abrirHud() {
  if (estado.testando) teste.parar();
  editorHud.abrir(normalizarHud(config.hud), estado.fase.resolucaoBase, estado.fase.objetos.flatMap((o) => { const c = comportamentoDe(o); return c?.tipo === 'coletavel' ? [c.item] : []; }));
}

// ---------- Mapa (salas, passagens e transições) ----------
/** Salas do projeto para o diagrama: a fase aberta vem da memória (com passagens ainda não salvas). */
async function salasDoProjeto(): Promise<InfoSala[]> {
  const arquivos = await plat.listarFases();
  const salas: InfoSala[] = [];
  for (const arquivo of arquivos) {
    try {
      const f = arquivo === estado.arquivoFase ? estado.fase : normalizarFase(JSON.parse(await plat.lerFase(arquivo)));
      salas.push({
        arquivo, nome: f.nome, tipo: f.tipo, regiao: f.regiao, tamanho: f.tamanho, spawn: f.spawnJogador,
        passagens: f.objetos.flatMap((o) => {
          const c = comportamentoDe(o);
          return c?.tipo === 'saida' ? [{ id: o.id, nome: o.nome, x: o.x, y: o.y, w: o.w * o.escala, h: o.h * o.escala, requer: c.requer, modo: c.modo,
            fora: o.x + o.w * o.escala < 0 || o.x > f.tamanho[0] || o.y + o.h * o.escala < 0 || o.y > f.tamanho[1], zona: !o.asset }] : [];
        }),
      });
    } catch (err) {
      salas.push({ arquivo, nome: arquivo, tipo: 'fase', regiao: '', tamanho: [640, 360], spawn: [0, 0], passagens: [], erro: `Não abriu: ${String(err)}` });
    }
  }
  return salas;
}
const editorMapa = new EditorMapa({
  aoMudar: (m, motivo) => {
    config.mapa = m;
    salvarConfigDepois();
    if (motivo) LOG.add({ cat: 'sistema', texto: `Mapa: ${motivo}` });
    avisarCodigoMudou();
    atualizarSetas(true);
  },
  aoAbrirSala: (arquivo) => void abrirFase(arquivo),
  criarSala: async (nome) => {
    const fase = criarFase(nome, { tipo: 'area', resolucaoBase: config.resolucaoBase, tamanhoGrade: config.tamanhoGrade, telas: [2, 1] });
    // Já com chão na altura do início do jogador (dá para testar na hora)
    const [fw, fh] = fase.tamanho, yc = fase.spawnJogador[1];
    fase.colisoes.push({ id: 'col_001', forma: 'bloco', comportamento: 'solido', pontos: [[0, yc], [fw, yc], [fw, fh], [0, fh]] });
    const arquivo = await arquivoLivre(nome);
    await plat.salvarFase(arquivo, JSON.stringify(fase, null, 2));
    await atualizarListaFases();
    LOG.add({ cat: 'sistema', texto: `Mapa: sala "${nome}" criada em jogo/fases/${arquivo}` });
    return { arquivo, salas: await salasDoProjeto() };
  },
  renomearSala: async (arquivo, nome) => {
    await alterarFaseArquivo(arquivo, (f) => { f.nome = nome; });
    await atualizarListaFases();
    return salasDoProjeto();
  },
  criarPassagem: async (arquivo, lado, nome) => {
    let id = '';
    await alterarFaseArquivo(arquivo, (f) => {
      const w = 32, h = 64;
      const camada = f.camadas.find((c) => c.id === 'objetos')?.id ?? f.camadas[f.camadas.length - 1].id;
      id = novoIdObjeto(f);
      f.objetos.push({
        id, tipo: 'interativo', nome, asset: '', camada,
        x: lado === 'esquerda' ? 8 : f.tamanho[0] - w - 8, y: f.spawnJogador[1] - h, w, h,
        escala: 1, rotacao: 0, espelharX: false, espelharY: false, opacidade: 1, visivel: true,
        efeitos: [], comportamentos: [{ tipo: 'saida', destino: '', requer: '', consome: false, modo: 'interagir' }], conexoes: {}, script: null,
      });
    });
    LOG.add({ cat: 'sistema', texto: `Mapa: passagem "${nome}" (${id}) criada em ${arquivo}` });
    return { id, salas: await salasDoProjeto() };
  },
  modoPassagem: async (arquivo, id, modo) => {
    await alterarFaseArquivo(arquivo, (f) => { const c = f.objetos.find((o) => o.id === id)?.comportamentos[0]; if (c?.tipo === 'saida') c.modo = modo; });
    return salasDoProjeto();
  },
  excluirPassagem: async (arquivo, id) => {
    if (arquivo === estado.arquivoFase && estado.selecionado === id) estado.selecionar(null);
    await alterarFaseArquivo(arquivo, (f) => { f.objetos = f.objetos.filter((o) => o.id !== id); });
    return salasDoProjeto();
  },
  imagens: () => plat.listarAssets(),
  sons: () => plat.listarSons(),
  garantir: (c, cat) => (c.startsWith('jogo/') ? Promise.resolve(c.slice(5)) : plat.garantirEmUso(c, cat)),
  url: (c) => urlAsset(plat, c),
  previa: (t) => { LOG.add({ cat: 'sistema', texto: `Mapa: pré-visualizou a transição (${resumoTransicao(t)})` }); void telaTransicao.previa(t); },
});
/** Muda uma fase pelo Mapa: a aberta no editor muda na memória e é salva; as outras, direto no arquivo. */
async function alterarFaseArquivo(arquivo: string, fn: (f: import('./core/tipos').Fase) => void) {
  if (arquivo === estado.arquivoFase) {
    estado.alterar(fn);
    if (!(await salvar())) throw new Error('não consegui salvar a fase aberta');
    return;
  }
  const f = normalizarFase(JSON.parse(await plat.lerFase(arquivo)));
  fn(f);
  await plat.salvarFase(arquivo, JSON.stringify(f, null, 2));
}
// ---------- Setas de navegação no cenário (passagens que levam a outras salas) ----------
const nomesSalas = new Map<string, string>();
let timerSetas = 0;
function atualizarSetas(limparNomes = false) {
  if (limparNomes) nomesSalas.clear();
  clearTimeout(timerSetas);
  timerSetas = window.setTimeout(async () => {
    const arquivo = estado.arquivoFase ?? '';
    const mapa = normalizarMapa(config.mapa);
    const setas: import('./editor/viewport').SetaNav[] = [];
    for (const o of estado.fase.objetos) {
      const c = comportamentoDe(o);
      if (c?.tipo !== 'saida') continue;
      const destino = viagemDe(mapa, arquivo, o.id)?.fase || c.destino;
      if (!destino || destino === arquivo) continue;
      if (!nomesSalas.has(destino)) {
        try { nomesSalas.set(destino, normalizarFase(JSON.parse(await plat.lerFase(destino))).nome); } catch { nomesSalas.set(destino, destino); }
      }
      setas.push({ id: o.id, nome: nomesSalas.get(destino)!, arquivo: destino, x: o.x, y: o.y, w: o.w * o.escala, h: o.h * o.escala });
    }
    viewport.definirSetas(setas);
  }, 150);
}
viewport.aoNavegar = (arq) => {
  LOG.add({ cat: 'sistema', texto: `Seta: abrindo ${arq}` });
  void abrirFase(arq);
};
estado.on('fase', () => atualizarSetas());
estado.on('arquivo', () => atualizarSetas());

async function abrirMapa() {
  if (estado.testando) teste.parar();
  if (editorPersonagens.aberta) await editorPersonagens.fechar();
  if (editorControles.aberta) editorControles.fechar();
  if (editorHud.aberta) editorHud.fechar();
  const salas = await salasDoProjeto();
  const mapa = normalizarMapa(config.mapa);
  // Fases apagadas/renomeadas: conexões para elas saem
  const removidas = salas.length ? limparMapa(mapa, salas.map((s) => s.arquivo)) : 0;
  if (removidas) { config.mapa = mapa; salvarConfigDepois(); LOG.add({ cat: 'sistema', texto: `Mapa: ${removidas} conexão(ões) para salas que não existem mais foram removidas` }); }
  editorMapa.abrir(mapa, salas, estado.arquivoFase ?? '');
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

// ---------- Lista de Salas (abaixo de Camadas) ----------
const painelSalas = new PainelSalas(blocoSalas, plat);
painelSalas.aoAbrir = (arq) => { LOG.add({ cat: 'sistema', texto: `Salas: abrindo ${arq}` }); void abrirFase(arq); };
const salaEmMemoria = () => (estado.arquivoFase ? {
  arquivo: estado.arquivoFase, nome: estado.fase.nome, tipo: estado.fase.tipo, regiao: estado.fase.regiao,
  passagens: estado.fase.objetos.filter((o) => o.comportamentos[0]?.tipo === 'saida').length,
} : undefined);
let timerSalas = 0;
estado.on('fase', () => { clearTimeout(timerSalas); timerSalas = window.setTimeout(() => void painelSalas.atualizar(estado.arquivoFase ?? '', salaEmMemoria()), 600); });

async function atualizarListaFases() {
  void painelSalas.atualizar(estado.arquivoFase ?? '', salaEmMemoria());
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
type ItemTrilho = { id: string; ico: keyof typeof ICONES; titulo: string; texto: string; atalho: string; acao: () => void; modo?: import('./editor/estado').Modo };
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
  { id: 'tela', modo: 'tela', ico: 'tela', titulo: 'Tela do jogo', atalho: 'Q', acao: () => estado.definirModo(estado.modo === 'tela' ? 'selecionar' : 'tela'),
    texto: 'Ajusta o quadro laranja: o pedaço do cenário que o jogador vê. Arraste os cantos (mantém a proporção) ou escolha 320×180, 480×270, 640×360, 960×540. Mostra se a escala fica nítida em Full HD. Pode virar o padrão do projeto ou ir para todas as fases.' },
  { id: 'zona', modo: 'zona', ico: 'zona', titulo: 'Zona (gatilho / passagem)', atalho: 'Z', acao: () => estado.definirModo(estado.modo === 'zona' ? 'selecionar' : 'zona'),
    texto: 'Arraste no cenário para criar uma área invisível no jogo: um GATILHO (ao entrar: mensagem, inimigos surgindo, luzes, acionar objeto) ou, trocando o comportamento, uma PASSAGEM contínua (fim de rua). No editor aparece roxa (gatilho) ou vermelha (passagem).' },
  { id: 'luz', modo: 'luz', ico: 'luz', titulo: 'Iluminação', atalho: 'Y', acao: () => estado.definirModo(estado.modo === 'luz' ? 'selecionar' : 'luz'),
    texto: 'Pontos de luz para salas escuras: clique para criar, arraste o centro para mover e a borda para mudar o raio. Ligue "Fase escura" nas propriedades da fase (sem seleção) e ajuste a escuridão e a lanterna do jogador. Shift+Y mostra/oculta a prévia do escuro.' },
  { id: 'inimigos', modo: 'inimigo', ico: 'inimigo', titulo: 'Inimigos', atalho: 'N', acao: () => estado.definirModo(estado.modo === 'inimigo' ? 'selecionar' : 'inimigo'),
    texto: 'Coloca inimigos na fase: escolha o tipo na barra de cima (ex.: Zumbi) e clique no cenário (ele pisa no chão abaixo). Clique num inimigo para selecionar e arraste para mover; Del exclui.' },
  { id: 'personagens', ico: 'personagem', titulo: 'Personagens', atalho: 'K', acao: () => void abrirPersonagens(),
    texto: 'Monta personagens animados a partir dos spritesheets (parado, andando, pulando, caindo…), marca os pés e a caixa de colisão, e escolhe quem é o jogador no ▶ Testar.' },
  { id: 'hud', ico: 'hud', titulo: 'HUD', atalho: 'U', acao: () => void abrirHud(),
    texto: 'Edita o que aparece na tela durante o jogo: munição, inimigos vivos, itens, valores do código. Arraste os elementos na prévia da tela.' },
  { id: 'mapa', ico: 'mapa', titulo: 'Mapa', atalho: 'M', acao: () => void abrirMapa(),
    texto: 'Diagrama das salas do jogo: conecte as passagens (portas, escadas, saídas) de uma sala à outra e escolha o que acontece no caminho (◆): corte, escurecer, tela cheia animada estilo Resident Evil, som.' },
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
  barraTela.hidden = estado.modo !== 'tela' || estado.testando;
  barraLuz.hidden = estado.modo !== 'luz' || estado.testando;
  if (estado.modo === 'luz') atualizarBarraLuz();
  if (estado.modo === 'tela') atualizarBarraTela();
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
// ---------- Ferramenta Iluminação: formato das luzes novas ----------
const formasLuz = el('div', { class: 'grupo-presets' }, ...FORMAS_LUZ.map((f) => {
  const b = el('button', { type: 'button', class: 'secundario' }, f.nome);
  dica(b, `Luz em ${f.nome.toLowerCase()}`, `${f.texto} O próximo clique no cenário cria uma luz assim.`);
  b.addEventListener('click', () => { estado.formaLuzNova = f.id; atualizarBarraLuz(); });
  return b;
}));
const barraLuz = el('div', { class: 'barra-flutuante barra-tela' }, el('strong', { class: 'rotulo-barra' }, 'Luz nova:'), formasLuz,
  el('span', { class: 'dica-campo' }, 'Clique para criar · centro move · alça muda tamanho/direção · Shift+Y esconde o escuro'));
barraLuz.hidden = true;
centro.append(barraLuz);
function atualizarBarraLuz() {
  formasLuz.querySelectorAll('button').forEach((b, i) => b.classList.toggle('ligado', FORMAS_LUZ[i].id === estado.formaLuzNova));
}

// ---------- Ferramenta Tela do jogo (o quadro laranja = o que o jogador vê) ----------
const PRESETS_TELA: [number, number][] = [[320, 180], [480, 270], [640, 360], [960, 540]];
const telaL = el('input', { type: 'number', min: 160, max: 3840, step: 16, 'aria-label': 'Largura da tela do jogo' }) as HTMLInputElement;
const telaA = el('input', { type: 'number', min: 90, max: 2160, step: 2, 'aria-label': 'Altura da tela do jogo' }) as HTMLInputElement;
const telaInfo = el('span', { class: 'dica-campo' });
const presetsTela = el('div', { class: 'grupo-presets' }, ...PRESETS_TELA.map(([w, h]) => {
  const b = el('button', { type: 'button', class: 'secundario' }, `${w}×${h}`);
  dica(b, `${w} × ${h}`, `A tela do jogo mostra ${w} × ${h} px do cenário (${escalaFullHd(w, h)}).`);
  b.addEventListener('click', () => definirTela(w, h));
  return b;
}));
function definirTela(w: number, h: number) {
  w = Math.max(160, Math.min(3840, Math.round(w))); h = Math.max(90, Math.min(2160, Math.round(h)));
  estado.alterar((f) => { f.resolucaoBase = [w, h]; });
  LOG.add({ cat: 'sistema', texto: `Tela do jogo de ${estado.fase.nome}: ${w} × ${h} px (${escalaFullHd(w, h)})` });
  atualizarBarraTela();
}
telaL.addEventListener('change', () => { const [rw, rh] = estado.fase.resolucaoBase; const w = Number(telaL.value); if (w > 0) definirTela(w, Math.round((w * rh) / rw / 2) * 2); });
telaA.addEventListener('change', () => { const [rw] = estado.fase.resolucaoBase; const h = Number(telaA.value); if (h > 0) definirTela(rw, h); });
const telaPadrao = el('button', { type: 'button', class: 'secundario' }, 'Padrão do projeto');
dica(telaPadrao, 'Padrão do projeto', 'As fases e salas NOVAS (inclusive "+ Sala" do Mapa) nascem com esta tela do jogo.');
telaPadrao.addEventListener('click', () => {
  config.resolucaoBase = [...estado.fase.resolucaoBase] as [number, number];
  salvarConfigDepois();
  estado.avisar(`Padrão do projeto: ${config.resolucaoBase[0]} × ${config.resolucaoBase[1]} px.`);
});
const telaTodas = el('button', { type: 'button', class: 'secundario' }, 'Aplicar em todas');
dica(telaTodas, 'Aplicar em todas', 'Todas as fases e salas do projeto passam a ter esta tela do jogo (e ela vira o padrão). Pergunta antes.');
telaTodas.addEventListener('click', async () => {
  const [w, h] = estado.fase.resolucaoBase;
  const fases = await plat.listarFases();
  if ((await perguntar('Tela do jogo em todas as fases', `Todas as ${fases.length} fase(s) passam a mostrar ${w} × ${h} px. A fase aberta é salva.`, ['Cancelar', 'Aplicar'])) !== 1) return;
  for (const arq of fases) await alterarFaseArquivo(arq, (f) => { f.resolucaoBase = [w, h]; });
  config.resolucaoBase = [w, h]; salvarConfigDepois();
  LOG.add({ cat: 'sistema', texto: `Tela do jogo ${w} × ${h} px aplicada em ${fases.length} fase(s) e no padrão do projeto` });
  estado.avisar(`Tela ${w} × ${h} aplicada em ${fases.length} fase(s).`);
});
const barraTela = el('div', { class: 'barra-flutuante barra-tela' }, el('strong', { class: 'rotulo-barra' }, 'Tela do jogo desta sala:'), presetsTela,
  telaL, el('span', {}, '×'), telaA, telaInfo, el('div', { class: 'sep-v' }), telaPadrao, telaTodas);
barraTela.hidden = true;
centro.append(barraTela);
function atualizarBarraTela() {
  const [w, h] = estado.fase.resolucaoBase;
  if (document.activeElement !== telaL) telaL.value = String(w);
  if (document.activeElement !== telaA) telaA.value = String(h);
  telaInfo.textContent = escalaFullHd(w, h);
  presetsTela.querySelectorAll('button').forEach((b, i) => b.classList.toggle('ligado', PRESETS_TELA[i][0] === w && PRESETS_TELA[i][1] === h));
}
estado.on('fase', () => { if (estado.modo === 'tela') atualizarBarraTela(); });
viewport.aoMudarTela = () => {
  const [w, h] = estado.fase.resolucaoBase;
  LOG.add({ cat: 'sistema', texto: `Tela do jogo de ${estado.fase.nome}: ${w} × ${h} px (${escalaFullHd(w, h)})` });
  atualizarBarraTela();
};

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
  if (estado.modo === 'tela') estado.avisar('Tela do jogo: arraste os cantos do quadro laranja para mudar quanto o jogador vê, ou escolha um tamanho na barra de cima. Arraste o cenário para levar o quadro a outro lugar.');
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
// Rodapé: Log, guia de atalhos, versão e desenvolvedor
const guiaAtalhos = new GuiaAtalhos();
guiaAtalhos.teclasTeste = () => {
  const c = normalizarControles(config.controles);
  const nomes: Record<string, string> = { esquerda: 'Andar para a esquerda', direita: 'Andar para a direita', pular: 'Pular', interagir: 'Interagir (abrir, ler, passar pela passagem)' };
  return Object.entries(c.acoes).filter(([, l]) => l.length).map(([a, l]) => [l.map(textoAtalho).join(' / '), nomes[a] ?? `Ação "${a}" (ferramenta Controles, B)`] as [string, string]);
};
const stAtalhos = el('button', { type: 'button', class: 'st-botao' }, 'Teclas de atalho');
dica(stAtalhos, 'Teclas de atalho', 'Guia com todos os atalhos do editor, do ▶ Testar e do Código, com busca.', 'F1');
stAtalhos.addEventListener('click', () => guiaAtalhos.alternar());
const stVersao = el('span', { class: 'st-versao' }, 'Lorex Engine 2D');
void plat.versao().then((v) => { stVersao.textContent = `Lorex Engine 2D v${v}`; });
const stDev = el('a', { class: 'st-dev', href: 'https://github.com/gabrielpedreira', target: '_blank', rel: 'noopener' }, 'Desenvolvido por Gabriel Pedreira · github.com/gabrielpedreira');
dica(stDev, 'Desenvolvedor', 'Abre o GitHub de Gabriel Pedreira no navegador.');
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
status.append(stLog, stAtalhos, el('div', { class: 'espaco' }), stVersao, el('span', { class: 'st-sep' }, '·'), stDev);
barraInfo.append(stCoord, stCamada, stMsg);
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
  if (e.key === 'F1') { e.preventDefault(); guiaAtalhos.alternar(); return; }
  if (e.key === 'F9' && !estado.testando) { e.preventDefault(); void atualizarBiblioteca(); return; }
  if (document.querySelector('.modal-fundo') || inicio.aberta || editorPersonagens.aberta || editorControles.aberta || painelCodigo.aberta || editorHud.aberta || editorMapa.aberta || telaTransicao.ativa) return;
  const ctrl = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (ctrl && k === 's') { e.preventDefault(); void salvar(); return; }
  if (ctrl && k === 'n') { e.preventDefault(); void novaFase(); return; }
  if (ctrl && k === 'p' && !estado.testando) { e.preventDefault(); painelSalas.focarBusca(); return; }
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
      else if (k === 'm') void abrirMapa();
      else if (k === 'y' && e.shiftKey) { estado.previaLuz = !estado.previaLuz; estado.emit('opcoes'); estado.avisar(`Prévia do escuro ${estado.previaLuz ? 'ligada' : 'desligada'}.`); }
      else if (k === 'y') estado.definirModo(estado.modo === 'luz' ? 'selecionar' : 'luz');
      else if (k === 'q') estado.definirModo(estado.modo === 'tela' ? 'selecionar' : 'tela');
      else if (k === 'z') estado.definirModo(estado.modo === 'zona' ? 'selecionar' : 'zona');
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
    // Imagem nova, apagada ou TROCADA em jogo/assets: biblioteca e cenário mostram a versão atual
    recarregandoBib = window.setTimeout(async () => { novaVersaoImagens(); viewport.recarregarTexturas(); await biblioteca.recarregar(); ferramentas.definir(ferramentasAtuais, biblioteca.caminhos); }, 300);
    return;
  }
  if (m.tipo === 'personagem') { await editorPersonagens.mudouPorFora(m.nome); await carregarTiposInimigo(); if (painelCodigo.aberta) await painelCodigo.atualizarElementos(); sincronizarBlocosDepois(); return; }
  if (m.tipo === 'script') { await painelCodigo.mudouPorFora(m.nome); await aplicarBlocoDoScript(m.nome); return; }
  if (m.tipo === 'config') {
    config = { ...CONFIG_PADRAO, ...((await plat.lerConfigProjeto()) ?? {}) };
    if (editorMapa.aberta) void abrirMapa();
    atualizarSetas(true);
    ferramentasAtuais = config.ferramentas ?? [];
    ferramentas.definir(ferramentasAtuais, biblioteca.caminhos);
    estado.avisar('Configuração do projeto atualizada por fora.');
    sincronizarBlocosDepois();
    return;
  }
  // Fase
  await atualizarListaFases();
  if (editorMapa.aberta) editorMapa.atualizarSalas(await salasDoProjeto());
  atualizarSetas(true);
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
