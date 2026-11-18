// Inicia a Lorex Engine 2D em modo de desenvolvimento (usado pelo atalho da área de trabalho).
// - Se a engine ainda não está rodando: executa "npm run dev" (Vite + Electron; fechar a janela encerra tudo).
// - Se já está rodando (porta 5173 ocupada): abre só o Electron, que encontra a janela aberta e a traz para a frente.
// - Antes, se faltar alguma dependência do package.json (ex.: depois de atualizar a engine), roda "npm install" sozinho.
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORTA = 5173;
const raiz = path.join(__dirname, '..');

function portaEmUso() {
  return new Promise((ok) => {
    const s = net.connect(PORTA, '127.0.0.1');
    s.once('connect', () => { s.destroy(); ok(true); });
    s.once('error', () => ok(false));
  });
}

/** Dependências do package.json que ainda não estão em node_modules (ex.: depois de uma atualização da engine). */
function faltando() {
  const fs = require('node:fs');
  const pacote = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf-8'));
  const deps = Object.keys({ ...pacote.dependencies, ...pacote.devDependencies });
  return deps.filter((d) => !fs.existsSync(path.join(raiz, 'node_modules', d, 'package.json')));
}

function instalarSePreciso() {
  const f = faltando();
  if (!f.length) return Promise.resolve();
  console.log(`Instalando dependências novas: ${f.join(', ')}…`);
  return new Promise((ok) => {
    spawn('npm', ['install'], { cwd: raiz, stdio: 'inherit', shell: true }).on('exit', () => ok());
  });
}

portaEmUso().then(async (emUso) => {
  if (!emUso) await instalarSePreciso();
  if (emUso) {
    const electron = require('electron'); // caminho do executável do Electron
    spawn(electron, ['.'], {
      cwd: raiz, stdio: 'inherit',
      env: { ...process.env, VITE_DEV_SERVER_URL: `http://127.0.0.1:${PORTA}` },
    });
  } else {
    spawn('npm', ['run', 'dev'], { cwd: raiz, stdio: 'inherit', shell: true });
  }
});
