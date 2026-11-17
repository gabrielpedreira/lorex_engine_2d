// Ponte segura entre a interface (navegador) e o processo principal (arquivos do projeto)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lorex', {
  versao: () => ipcRenderer.invoke('app:versao'),
  progresso: (texto) => ipcRenderer.send('app:progresso', texto),
  pronto: () => ipcRenderer.send('app:pronto'),

  abrirProjeto: () => ipcRenderer.invoke('projeto:abrir'),
  abrirCaminho: (caminho) => ipcRenderer.invoke('projeto:abrirCaminho', caminho),
  projetoAtual: () => ipcRenderer.invoke('projeto:atual'),
  recentes: () => ipcRenderer.invoke('projeto:recentes'),
  lerConfigProjeto: () => ipcRenderer.invoke('projeto:lerConfig'),
  salvarConfigProjeto: (dados) => ipcRenderer.invoke('projeto:salvarConfig', dados),

  listarAssets: () => ipcRenderer.invoke('assets:listar'),
  garantirEmUso: (relRaiz) => ipcRenderer.invoke('assets:garantirEmUso', relRaiz),
  limparNaoUsados: (emUsoAgora) => ipcRenderer.invoke('assets:limparNaoUsados', emUsoAgora),
  otimizarAsset: (fonteRaiz, largura, altura) => ipcRenderer.invoke('assets:otimizar', fonteRaiz, largura, altura),
  listarFases: () => ipcRenderer.invoke('fases:listar'),
  lerFase: (nome) => ipcRenderer.invoke('fases:ler', nome),
  salvarFase: (nome, conteudo) => ipcRenderer.invoke('fases:salvar', nome, conteudo),
});
