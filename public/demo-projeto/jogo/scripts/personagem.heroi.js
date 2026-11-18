// Script do herói (demonstração): conta os socos e mostra no canto da tela.

/**
 * @param {Jogador} eu
 * @param {Jogo} jogo
 */
export function aoIniciar(eu, jogo) {
  eu.dados.socos = eu.dados.socos ?? 0;
  jogo.hud.definir('Socos', eu.dados.socos);
}

/**
 * Quando o jogador dispara uma ação (teclas da ferramenta Controles).
 * @param {Jogador} eu
 * @param {Jogo} jogo
 * @param {string} acao
 */
export function aoAcao(eu, jogo, acao) {
  if (acao !== 'soco' || eu.acaoAtual) return;
  eu.dados.socos++;
  jogo.hud.definir('Socos', eu.dados.socos);
}
