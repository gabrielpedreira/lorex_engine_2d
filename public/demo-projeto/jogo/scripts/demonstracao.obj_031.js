// Script da chave (demonstração): ao encostar, a chave some e vai para o inventário.

/**
 * Quando o jogador encosta no objeto.
 * @param {Objeto} eu
 * @param {Jogo} jogo
 */
export function aoTocar(eu, jogo) {
  eu.esconder();
  jogo.inventario.dar('chave');
  jogo.aviso('Pegou a chave!');
  jogo.log('chave coletada aos', jogo.tempo.toFixed(1), 's');
}

/**
 * A cada quadro: a chave balança devagar enquanto não foi pega.
 * @param {Objeto} eu
 * @param {Jogo} jogo
 * @param {number} dt
 */
export function aoAtualizar(eu, jogo, dt) {
  eu.dados.t = (eu.dados.t ?? 0) + dt;
  eu.mover(0, Math.sin(eu.dados.t * 3) * 6 * dt);
}
