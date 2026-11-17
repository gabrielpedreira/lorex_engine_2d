// Ponte segura entre a interface (navegador) e o processo principal (arquivos do projeto)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lorex', {
  abrirProjeto: () => ipcRenderer.invoke('projeto:abrir'),
  projetoAtual: () => ipcRenderer.invoke('projeto:atual'),
  listarAssets: () => ipcRenderer.invoke('assets:listar'),
  garantirEmUso: (relRaiz) => ipcRenderer.invoke('assets:garantirEmUso', relRaiz),
  listarFases: () => ipcRenderer.invoke('fases:listar'),
  lerFase: (nome) => ipcRenderer.invoke('fases:ler', nome),
  salvarFase: (nome, conteudo) => ipcRenderer.invoke('fases:salvar', nome, conteudo),
});
