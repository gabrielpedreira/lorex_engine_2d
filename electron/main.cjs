// Processo principal do Electron: splash, janela do editor, acesso a arquivos do projeto e protocolo projeto://
const { app, BrowserWindow, ipcMain, dialog, protocol, net, nativeImage, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { pathToFileURL } = require('node:url');

const VERSAO = require('../package.json').version;
const PASTAS_IGNORADAS = new Set(['lorex_engine_2d', '.git', 'node_modules', 'dist']);
const EXTENSOES_IMAGEM = new Set(['.png', '.jpg', '.jpeg']);
const MAX_RECENTES = 6;
const SPLASH_MINIMO_MS = 1800; // tempo mínimo da splash na tela, para não "piscar"

let raizProjeto = null; // caminho absoluto da pasta do projeto (ex.: ...\jogo invasão)
let janelaSplash = null;
let janelaEditor = null;
let inicioSplash = 0;

const URL_DEV = process.env.VITE_DEV_SERVER_URL;
const ICONE = path.join(__dirname, '..', URL_DEV ? 'public' : 'dist', 'marca', process.platform === 'win32' ? 'icone.ico' : 'icone-256.png');

// ---------- Configuração do aplicativo (último projeto, recentes) ----------
const arquivoConfig = () => path.join(app.getPath('userData'), 'config.json');
function lerConfig() {
  try { return JSON.parse(fs.readFileSync(arquivoConfig(), 'utf-8')); } catch { return {}; }
}
function salvarConfig(cfg) {
  try { fs.writeFileSync(arquivoConfig(), JSON.stringify(cfg, null, 2)); } catch { /* sem config, sem problema */ }
}

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

function infoProjeto() {
  return raizProjeto ? { nome: path.basename(raizProjeto), caminho: raizProjeto } : null;
}

async function abrirProjeto(raiz) {
  if (!raiz || !fs.existsSync(raiz)) return null;
  raizProjeto = raiz;
  await fsp.mkdir(path.join(raiz, 'jogo', 'assets'), { recursive: true });
  await fsp.mkdir(path.join(raiz, 'jogo', 'fases'), { recursive: true });
  const cfg = lerConfig();
  cfg.ultimoProjeto = raiz;
  cfg.recentes = [raiz, ...(cfg.recentes ?? []).filter((r) => r !== raiz)].slice(0, MAX_RECENTES);
  salvarConfig(cfg);
  return infoProjeto();
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

// ---------- Splash ----------
function statusSplash(texto) {
  if (!janelaSplash || janelaSplash.isDestroyed()) return;
  janelaSplash.webContents.executeJavaScript(`window.definirStatus && window.definirStatus(${JSON.stringify(texto)})`).catch(() => {});
}

function criarSplash() {
  inicioSplash = Date.now();
  janelaSplash = new BrowserWindow({
    width: 620,
    height: 400,
    frame: false,
    resizable: false,
    movable: true,
    center: true,
    show: false,
    skipTaskbar: false,
    backgroundColor: '#083933',
    icon: ICONE,
    title: 'Lorex Engine 2D',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  janelaSplash.once('ready-to-show', () => janelaSplash.show());
  const q = { versao: VERSAO };
  if (URL_DEV) janelaSplash.loadURL(URL_DEV + '/splash.html?' + new URLSearchParams(q));
  else janelaSplash.loadFile(path.join(__dirname, '..', 'dist', 'splash.html'), { query: q });
}

function fecharSplashEMostrarEditor() {
  const espera = Math.max(0, SPLASH_MINIMO_MS - (Date.now() - inicioSplash));
  setTimeout(() => {
    if (janelaEditor && !janelaEditor.isDestroyed()) {
      janelaEditor.maximize();
      janelaEditor.show();
      janelaEditor.focus();
    }
    if (janelaSplash && !janelaSplash.isDestroyed()) janelaSplash.close();
    janelaSplash = null;
  }, espera);
}

// ---------- IPC ----------
function registrarIpc() {
  ipcMain.handle('app:versao', () => VERSAO);
  ipcMain.on('app:progresso', (_e, texto) => statusSplash(String(texto)));
  ipcMain.on('app:pronto', () => fecharSplashEMostrarEditor());

  ipcMain.handle('projeto:abrir', async () => {
    const r = await dialog.showOpenDialog(janelaEditor, { title: 'Abrir pasta do projeto', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    return abrirProjeto(r.filePaths[0]);
  });
  ipcMain.handle('projeto:abrirCaminho', async (_e, caminho) => abrirProjeto(caminho));
  ipcMain.handle('projeto:atual', async () => infoProjeto() ?? abrirProjeto(lerConfig().ultimoProjeto));
  ipcMain.handle('projeto:recentes', async () =>
    (lerConfig().recentes ?? []).filter((r) => fs.existsSync(r)).map((r) => ({ nome: path.basename(r), caminho: r })));

  // Configuração do projeto (resolução do jogo, grade) em jogo/projeto.json
  ipcMain.handle('projeto:lerConfig', async () => {
    try { return JSON.parse(await fsp.readFile(resolverDentroDoProjeto('jogo/projeto.json'), 'utf-8')); } catch { return null; }
  });
  ipcMain.handle('projeto:salvarConfig', async (_e, dados) => {
    await fsp.writeFile(resolverDentroDoProjeto('jogo/projeto.json'), JSON.stringify(dados, null, 2), 'utf-8');
    return true;
  });

  ipcMain.handle('assets:listar', async () => {
    if (!raizProjeto) return [];
    const lista = [];
    await listarImagens(raizProjeto, '', lista);
    return lista.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  });

  // Se o asset é do material de apoio, copia para jogo/assets/<categoria>/ (o original fica onde está).
  ipcMain.handle('assets:garantirEmUso', async (_e, relRaiz) => {
    if (relRaiz.startsWith('jogo/')) return relRaiz.slice('jogo/'.length);
    const origem = resolverDentroDoProjeto(relRaiz);
    const partes = relRaiz.split('/');
    const categoria = partes.length > 1 ? normalizarCategoria(partes[0]) : 'geral';
    const relJogo = `assets/${categoria}/${partes[partes.length - 1]}`;
    const destino = resolverDentroDoProjeto('jogo/' + relJogo);
    await fsp.mkdir(path.dirname(destino), { recursive: true });
    if (!fs.existsSync(destino)) await fsp.copyFile(origem, destino);
    return relJogo;
  });

  // Gera em jogo/assets uma cópia reduzida da imagem no tamanho em que ela é usada (o original não é alterado).
  // fonteRaiz: caminho relativo à raiz (de preferência o original de apoio, em alta resolução).
  ipcMain.handle('assets:otimizar', async (_e, fonteRaiz, largura, altura) => {
    const origem = resolverDentroDoProjeto(fonteRaiz);
    const img = nativeImage.createFromPath(origem);
    if (img.isEmpty()) throw new Error('Não consegui ler a imagem: ' + fonteRaiz);
    const w = Math.max(1, Math.round(largura)), h = Math.max(1, Math.round(altura));
    const reduzida = img.resize({ width: w, height: h, quality: 'best' });
    const partes = fonteRaiz.split('/');
    const categoria = fonteRaiz.startsWith('jogo/assets/') && partes.length > 3 ? partes[2]
      : partes.length > 1 && !fonteRaiz.startsWith('jogo/') ? normalizarCategoria(partes[0]) : 'geral';
    const base = path.parse(partes[partes.length - 1]).name.replace(/_\d+x\d+$/, '');
    const relJogo = `assets/${categoria}/${base}_${w}x${h}.png`;
    const destino = resolverDentroDoProjeto('jogo/' + relJogo);
    await fsp.mkdir(path.dirname(destino), { recursive: true });
    await fsp.writeFile(destino, reduzida.toPNG());
    const antes = fs.statSync(origem).size, depois = fs.statSync(destino).size;
    return { asset: relJogo, w, h, bytesAntes: antes, bytesDepois: depois, pixelsAntes: img.getSize().width * img.getSize().height };
  });

  // Manda para a Lixeira os arquivos de jogo/assets que nenhuma fase usa.
  // emUsoAgora: assets da fase aberta (pode ter alterações ainda não salvas).
  ipcMain.handle('assets:limparNaoUsados', async (_e, emUsoAgora) => {
    if (!raizProjeto) return [];
    const usados = new Set(emUsoAgora ?? []);
    const dirFases = path.join(raizProjeto, 'jogo', 'fases');
    for (const n of await fsp.readdir(dirFases).catch(() => [])) {
      if (!n.toLowerCase().endsWith('.json')) continue;
      try {
        const f = JSON.parse(await fsp.readFile(path.join(dirFases, n), 'utf-8'));
        for (const o of f.objetos ?? []) if (o.asset) usados.add(o.asset);
      } catch { /* fase ilegível: por segurança, não apaga nada */ return []; }
    }
    const arquivos = [];
    const percorrer = async (dir, rel) => {
      for (const e of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) {
        const r = rel + '/' + e.name;
        if (e.isDirectory()) await percorrer(path.join(dir, e.name), r);
        else if (EXTENSOES_IMAGEM.has(path.extname(e.name).toLowerCase())) arquivos.push(r);
      }
    };
    await percorrer(path.join(raizProjeto, 'jogo', 'assets'), 'assets');
    const removidos = [];
    for (const r of arquivos) {
      if (usados.has(r)) continue;
      const abs = resolverDentroDoProjeto('jogo/' + r);
      try { await shell.trashItem(abs); removidos.push(r); } catch { /* sem Lixeira: mantém o arquivo */ }
    }
    return removidos;
  });

  ipcMain.handle('fases:listar', async () => {
    if (!raizProjeto) return [];
    try {
      return (await fsp.readdir(path.join(raizProjeto, 'jogo', 'fases')))
        .filter((n) => n.toLowerCase().endsWith('.json')).sort();
    } catch { return []; }
  });
  ipcMain.handle('fases:ler', async (_e, nome) =>
    fsp.readFile(resolverDentroDoProjeto('jogo/fases/' + path.basename(nome)), 'utf-8'));
  ipcMain.handle('fases:salvar', async (_e, nome, conteudo) => {
    await fsp.writeFile(resolverDentroDoProjeto('jogo/fases/' + path.basename(nome)), conteudo, 'utf-8');
    return true;
  });
}

// projeto://raiz/<caminho relativo> → arquivo dentro da pasta do projeto
protocol.registerSchemesAsPrivileged([
  { scheme: 'projeto', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

function criarEditor() {
  janelaEditor = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    show: false, // só aparece quando a interface avisar que está pronta (a splash fica na frente até lá)
    backgroundColor: '#141a19',
    title: 'Lorex Engine 2D',
    icon: ICONE,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // Fechar com alterações não salvas: a interface bloqueia (beforeunload) e aqui perguntamos ao usuário
  janelaEditor.webContents.on('will-prevent-unload', (e) => {
    const r = dialog.showMessageBoxSync(janelaEditor, {
      type: 'warning',
      buttons: ['Sair sem salvar', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
      title: 'Alterações não salvas',
      message: 'A fase aberta tem alterações não salvas.',
      detail: 'Se sair agora, essas alterações serão perdidas. Use Ctrl+S para salvar antes de sair.',
    });
    if (r === 0) e.preventDefault(); // ignora o bloqueio e fecha
  });
  if (URL_DEV) janelaEditor.loadURL(URL_DEV);
  else janelaEditor.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  // Se a interface travar ao carregar, não deixa o usuário preso na splash
  setTimeout(() => { if (janelaEditor && !janelaEditor.isVisible()) fecharSplashEMostrarEditor(); }, 15000);
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
  criarSplash();
  criarEditor();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) criarEditor(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
