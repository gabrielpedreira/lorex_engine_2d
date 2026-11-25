// Ponte entre as janelas do Electron: o editor (cenário) e a janela do Código (que pode ir para o segundo monitor).
// As mensagens passam pelo processo principal. No navegador não existe: o Código abre por cima do editor.
import type { LinhaLog } from '../core/log';

/** Elemento do explorador como viaja entre as janelas (sem funções). */
export interface ElementoSerial {
  chave: string; grupo: string; nome: string; detalhe?: string;
  dono: import('../core/scripts').DonoScript;
  arquivo: string | null; arquivoNovo: string; compartilhado?: number; modelo?: string; pronto?: string;
  /** Tem como ligar um script novo ao dono (o editor faz a gravação). */
  ligavel: boolean;
}

export type MsgPonte =
  // editor → código
  | { tipo: 'elementos'; lista: ElementoSerial[]; tipos: string }
  | { tipo: 'foco'; chave?: string }
  | { tipo: 'irPara'; arquivo: string; linha?: number }
  | { tipo: 'log'; linha: LinhaLog }
  | { tipo: 'resposta'; id: number; ok: boolean }
  /** O editor reescreveu o bloco config de um script (mudou um valor numa ferramenta). */
  | { tipo: 'scriptMudou'; arquivo: string }
  // código → editor
  | { tipo: 'pronto' }
  | { tipo: 'testar' }
  | { tipo: 'ligar'; id: number; chave: string; arquivo: string }
  | { tipo: 'aviso'; texto: string }
  /** Um script foi salvo na janela do Código: o editor aplica o bloco config nos dados. */
  | { tipo: 'scriptSalvo'; arquivo: string }
  // processo principal → editor
  | { tipo: 'codigoFechado' };

interface ApiPonte {
  abrirJanelaCodigo(): Promise<boolean>;
  ponteEnviar(destino: 'editor' | 'codigo', msg: MsgPonte): void;
  aoPonte(fn: (msg: MsgPonte) => void): void;
}

const api = () => (window as unknown as { lorex?: Partial<ApiPonte> }).lorex;

/** Há várias janelas (Electron)? */
export const ponteDisponivel = () => typeof api()?.ponteEnviar === 'function';

export function enviar(destino: 'editor' | 'codigo', msg: MsgPonte) { api()?.ponteEnviar?.(destino, msg); }
export function aoReceber(fn: (msg: MsgPonte) => void) { api()?.aoPonte?.(fn); }
/** Abre (ou traz para a frente) a janela do Código. true = acabou de abrir. */
export async function abrirJanelaCodigo() { return (await api()?.abrirJanelaCodigo?.()) ?? false; }
