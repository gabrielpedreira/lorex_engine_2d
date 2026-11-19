// Ponte segura entre a interface (navegador) e o processo principal (arquivos do projeto)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lorex', {
  versao: () => ipcRenderer.invoke('app:versao'),
  progresso: (texto) => ipcRenderer.send('app:progresso', texto),
  pronto: () => ipcRenderer.send('app:pronto'),
  aoMudarProjeto: (fn) => { ipcRenderer.on('projeto:mudou', (_e, dados) => fn(dados)); },

  abrirProjeto: () => ipcRenderer.invoke('projeto:abrir'),
  abrirCaminho: (caminho) => ipcRenderer.invoke('projeto:abrirCaminho', caminho),
  projetoAtual: () => ipcRenderer.invoke('projeto:atual'),
  recentes: () => ipcRenderer.invoke('projeto:recentes'),
  lerConfigProjeto: () => ipcRenderer.invoke('projeto:lerConfig'),
  salvarConfigProjeto: (dados) => ipcRenderer.invoke('projeto:salvarConfig', dados),

  listarAssets: () => ipcRenderer.invoke('assets:listar'),
  listarSons: () => ipcRenderer.invoke('assets:listarSons'),
  garantirEmUso: (relRaiz, categoria) => ipcRenderer.invoke('assets:garantirEmUso', relRaiz, categoria),
  listarDados: (pasta) => ipcRenderer.invoke('dados:listar', pasta),
  lerDados: (pasta, nome) => ipcRenderer.invoke('dados:ler', pasta, nome),
  salvarDados: (pasta, nome, conteudo) => ipcRenderer.invoke('dados:salvar', pasta, nome, conteudo),
  salvarLog: (nome, conteudo) => ipcRenderer.invoke('logs:salvar', nome, conteudo),
  // Janela do Código (segundo monitor) e mensagens entre as janelas
  abrirJanelaCodigo: () => ipcRenderer.invoke('codigo:abrir'),
  ponteEnviar: (destino, msg) => ipcRenderer.send('ponte:enviar', destino, msg),
  aoPonte: (fn) => { ipcRenderer.on('ponte:mensagem', (_e, msg) => fn(msg)); },
  limparNaoUsados: (emUsoAgora) => ipcRenderer.invoke('assets:limparNaoUsados', emUsoAgora),
  otimizarAsset: (fonteRaiz, largura, altura) => ipcRenderer.invoke('assets:otimizar', fonteRaiz, largura, altura),
  listarFases: () => ipcRenderer.invoke('fases:listar'),
  lerFase: (nome) => ipcRenderer.invoke('fases:ler', nome),
  salvarFase: (nome, conteudo) => ipcRenderer.invoke('fases:salvar', nome, conteudo),
});
