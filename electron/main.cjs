// Processo principal do Electron: janela, acesso a arquivos do projeto e protocolo projeto://
const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { pathToFileURL } = require('node:url');

// Pastas que nunca aparecem na biblioteca de assets
const PASTAS_IGNORADAS = new Set(['lorex_engine_2d', '.git', 'node_modules', 'dist']);
const EXTENSOES_IMAGEM = new Set(['.png', '.jpg', '.jpeg']);

let raizProjeto = null; // caminho absoluto da pasta do projeto (ex.: ...\jogo invasão)
const arquivoConfig = () => path.join(app.getPath('userData'), 'config.json');

function lerConfig() {
  try { return JSON.parse(fs.readFileSync(arquivoConfig(), 'utf-8')); } catch { return {}; }
}
function salvarConfig(cfg) {
  try { fs.writeFileSync(arquivoConfig(), JSON.stringify(cfg, null, 2)); } catch { /* sem config, sem problema */ }
}

// Garante que um caminho relativo não saia da pasta do projeto
function resolverDentroDoProjeto(rel) {
  if (!raizProjeto) throw new Error('Nenhum projeto aberto');
  const abs = path.resolve(raizProjeto, rel);
  const raiz = path.resolve(raizProjeto);
  if (abs !== raiz && !abs.startsWith(raiz + path.sep)) throw new Error('Caminho fora do projeto: ' + rel);
  return abs;
}

function normalizarCategoria(nome) {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'geral';
}

async function abrirProjeto(raiz) {
  if (!raiz || !fs.existsSync(raiz)) return null;
  raizProjeto = raiz;
  // Convenção do projeto: jogo/assets (em uso) e jogo/fases
  await fsp.mkdir(path.join(raiz, 'jogo', 'assets'), { recursive: true });
  await fsp.mkdir(path.join(raiz, 'jogo', 'fases'), { recursive: true });
  const cfg = lerConfig(); cfg.ultimoProjeto = raiz; salvarConfig(cfg);
  return { nome: path.basename(raiz) };
}

async function listarImagens(dirAbs, relBase, saida) {
  let entradas;
  try { entradas = await fsp.readdir(dirAbs, { withFileTypes: true }); } catch { return; }
  for (const e of entradas) {
    if (e.name.startsWith('.')) continue;
    const rel = relBase ? relBase + '/' + e.name : e.name;
    if (e.isDirectory()) {
      if (!relBase && PASTAS_IGNORADAS.has(e.name)) continue;
      await listarImagens(path.join(dirAbs, e.name), rel, saida);
    } else if (EXTENSOES_IMAGEM.has(path.extname(e.name).toLowerCase())) {
      saida.push(rel);
    }
  }
}

function registrarIpc() {
  ipcMain.handle('projeto:abrir', async () => {
    const r = await dialog.showOpenDialog({ title: 'Abrir pasta do projeto', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    return abrirProjeto(r.filePaths[0]);
  });

  ipcMain.handle('projeto:atual', async () => {
    if (raizProjeto) return { nome: path.basename(raizProjeto) };
    return abrirProjeto(lerConfig().ultimoProjeto);
  });

  ipcMain.handle('assets:listar', async () => {
    if (!raizProjeto) return [];
    const lista = [];
    await listarImagens(raizProjeto, '', lista);
    return lista.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  });

  // Se o asset é do material de apoio, copia para jogo/assets/<categoria>/ (o original fica onde está).
  // Retorna o caminho relativo a jogo/ (ex.: "assets/chaves_e_itens/chave.png").
  ipcMain.handle('assets:garantirEmUso', async (_e, relRaiz) => {
    if (relRaiz.startsWith('jogo/')) return relRaiz.slice('jogo/'.length);
    const origem = resolverDentroDoProjeto(relRaiz);
    const partes = relRaiz.split('/');
    const categoria = partes.length > 1 ? normalizarCategoria(partes[0]) : 'geral';
    const nome = partes[partes.length - 1];
    const relJogo = `assets/${categoria}/${nome}`;
    const destino = resolverDentroDoProjeto('jogo/' + relJogo);
    await fsp.mkdir(path.dirname(destino), { recursive: true });
    if (!fs.existsSync(destino)) await fsp.copyFile(origem, destino);
    return relJogo;
  });

  ipcMain.handle('fases:listar', async () => {
    if (!raizProjeto) return [];
    const dir = path.join(raizProjeto, 'jogo', 'fases');
    try {
      return (await fsp.readdir(dir)).filter((n) => n.toLowerCase().endsWith('.json')).sort();
    } catch { return []; }
  });

  ipcMain.handle('fases:ler', async (_e, nome) => {
    return fsp.readFile(resolverDentroDoProjeto('jogo/fases/' + path.basename(nome)), 'utf-8');
  });

  ipcMain.handle('fases:salvar', async (_e, nome, conteudo) => {
    const destino = resolverDentroDoProjeto('jogo/fases/' + path.basename(nome));
    await fsp.writeFile(destino, conteudo, 'utf-8');
    return true;
  });
}

// projeto://raiz/<caminho relativo> → arquivo dentro da pasta do projeto
protocol.registerSchemesAsPrivileged([
  { scheme: 'projeto', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

function criarJanela() {
  const janela = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#1b1c21',
    title: 'Lorex Engine 2D',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const urlDev = process.env.VITE_DEV_SERVER_URL;
  if (urlDev) janela.loadURL(urlDev);
  else janela.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  protocol.handle('projeto', (req) => {
    try {
      const url = new URL(req.url);
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      return net.fetch(pathToFileURL(resolverDentroDoProjeto(rel)).toString());
    } catch (err) {
      return new Response(String(err), { status: 404 });
    }
  });
  registrarIpc();
  criarJanela();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) criarJanela(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
