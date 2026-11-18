// Modelos de script que ESCREVEM em JavaScript o comportamento que a engine já tem pronto
// (IA do zumbi, regras da arma, comportamentos prontos dos objetos). Assim, ao criar o script de algo que já
// funciona, o painel de Código mostra exatamente o que acontece, e é ali que se muda.
import type { Comportamento } from './comportamentos';
import type { ConfigArma, ConfigInimigo } from './inimigos';

const js = (s: string) => JSON.stringify(s);

/** Inimigo com comportamento Zumbi: o cérebro inteiro em aoPensar + reações. */
export function modeloInimigoZumbi(nome: string, c: ConfigInimigo): string {
  const ataques = c.ataques.map((a) => `${a.animacao} ${Math.round(a.peso)}%${a.agarra ? ' (agarra)' : ''}`).join(', ');
  return `// Comportamento de ${nome} (inimigo do tipo Zumbi).
// Este arquivo É o cérebro dele: mude aqui e o jogo muda. Os números (visão, velocidades, alcance, ataques)
// ficam em Personagens (K) → ${nome} → Inimigo, e aparecem aqui como eu.config.
//
// Valores atuais: visão ${c.visao} px · desiste em ${c.perderVisao} px · anda ${c.velocidadeAndar} px/s ·
// persegue ${c.velocidadePerseguir} px/s · ataca a ${c.alcanceAtaque} px · ataques: ${ataques} · vida ${c.vida}.
//
// A engine cuida do que está EM ANDAMENTO (animação de ataque e o golpe na hora certa, levar tiro, morrer):
// enquanto isso eu.ocupado é true e aoPensar não é chamado.

/**
 * O cérebro, a cada quadro: decide andar, parar, perseguir ou atacar.
 * @param {Inimigo} eu
 * @param {Jogo} jogo
 * @param {number} dt
 */
export function aoPensar(eu, jogo, dt) {
  const c = eu.config;

  // Perseguição: tenta chegar o mais perto possível e ataca quando encosta
  if (eu.estado === 'perseguir') {
    if (!eu.vendo && Math.abs(eu.dx) > c.perderVisao) {
      eu.estado = 'perambular';           // o jogador se afastou: desiste
      eu.dados.timer = eu.aleatorio(1, 3);
      eu.dados.direcao = 0;
      return;
    }
    eu.olharParaJogador();
    if (eu.vao <= c.alcanceAtaque && eu.mesmaAltura) eu.atacar();   // sorteia golpe/mordida pelos pesos
    else if (eu.podeAndar(eu.ladoJogador)) eu.andar(eu.ladoJogador, c.velocidadePerseguir);
    return;
  }

  // Alerta: um tiro chamou a atenção; vai até o ponto do tiro
  if (eu.estado === 'alerta') {
    if (eu.vendo) { eu.estado = 'perseguir'; return; }
    const dir = eu.alerta.x >= eu.x ? 1 : -1;
    if (eu.alerta.restante <= 0 || Math.abs(eu.alerta.x - eu.x) < 8 || !eu.podeAndar(dir)) {
      eu.estado = 'perambular';
      eu.dados.direcao = 0;
      eu.dados.timer = eu.aleatorio(1, 3);
      return;
    }
    eu.andar(dir, (c.velocidadeAndar + c.velocidadePerseguir) / 2);
    return;
  }

  // Perambular: anda para um lado, para em idle, anda para o outro, tudo ao acaso
  if (eu.vendo) { eu.estado = 'perseguir'; return; }
  eu.dados.timer = (eu.dados.timer ?? eu.aleatorio(0.5, 2)) - dt;
  eu.dados.direcao = eu.dados.direcao ?? 0;
  if (eu.dados.timer <= 0) {
    if (eu.dados.direcao === 0) {
      eu.dados.direcao = Math.random() < 0.5 ? -1 : 1;   // escolhe um lado
      eu.dados.timer = eu.aleatorio(1, 3.5);              // e anda um tempo
    } else {
      eu.dados.direcao = 0;                               // para (idle)
      eu.dados.timer = eu.aleatorio(1.2, 4.2);
    }
  }
  // Beira ou parede: vira (às vezes só para)
  if (eu.dados.direcao !== 0 && !eu.podeAndar(eu.dados.direcao)) {
    eu.dados.direcao = Math.random() < 0.5 ? -eu.dados.direcao : 0;
    eu.dados.timer = eu.aleatorio(0.8, 2.3);
  }
  if (eu.dados.direcao !== 0) eu.andar(eu.dados.direcao, c.velocidadeAndar);
}

/**
 * O inimigo viu o jogador e começou a perseguir.
 * @param {Inimigo} eu
 * @param {Jogo} jogo
 */
export function aoVer(eu, jogo) {
  // jogo.log(\`\${eu.nome} (\${eu.id}) viu o jogador\`);
}

/**
 * O inimigo levou um tiro. Retorne false para ignorar o dano.
 * A engine já desconta a vida, toca "dano" e, se ele não estava perseguindo, faz ele ir na direção do tiro
 * por ${c.alertaTiro} s (eu.alerta). Tiros a até ${c.audicaoTiro} px também chamam a atenção dele.
 * @param {Inimigo} eu
 * @param {Jogo} jogo
 * @param {number} dano
 */
export function aoLevarDano(eu, jogo, dano) {
  // if (eu.estado === 'perambular') eu.alertar(jogo.jogador.x);
}

/**
 * O inimigo morreu.
 * @param {Inimigo} eu
 * @param {Jogo} jogo
 */
export function aoMorrer(eu, jogo) {
  // jogo.inventario.dar('pontos', 10);
}
`;
}

/** Personagem com arma: as regras (pente, sem bala, recarga) em aoUsarArma. */
export function modeloArma(nome: string, a: ConfigArma): string {
  return `// Arma de ${nome}: as regras do tiro e da recarga.
// Este código substitui as regras prontas da engine. Os números (pente ${a.pente}, dano ${a.dano}, alcance ${a.alcance} px)
// ficam em Personagens (K) → ${nome} → Arma; o HUD mostra eu.arma.municao (chave "municao").

/**
 * Chamado quando o jogador aperta a ação de tiro (${js(a.acaoTiro)}) ou de recarga (${js(a.acaoRecarga)}).
 * @param {Jogador} eu
 * @param {Jogo} jogo
 * @param {string} acao
 */
export function aoUsarArma(eu, jogo, acao) {
  // Ocupada (atirando, recarregando, levando golpe) ou presa num agarrão: não faz nada
  if (eu.acaoAtual || eu.agarrado) return;

  if (acao === ${js(a.acaoRecarga)}) {
    if (eu.arma.municao >= eu.arma.pente) return;          // pente cheio
    eu.tocar(${js(a.acaoRecarga)});
    // O pente enche quando a animação de recarga termina
    jogo.esperar(eu.duracao(${js(a.acaoRecarga)}), () => {
      eu.arma.municao = eu.arma.pente;
      jogo.log(\`pente cheio: \${eu.arma.municao}/\${eu.arma.pente}\`);
    });
    return;
  }

  // Tiro
  if (eu.arma.municao <= 0) {
    eu.tocar(${js(a.animacaoSemBala)});                    // arma descarregada
    jogo.aviso('Sem munição! Recarregue.');
    return;
  }
  eu.arma.municao -= 1;
  eu.tocar(${js(a.acaoTiro)});
  const alvo = eu.arma.disparar();                         // tiro instantâneo; paredes param
  // if (alvo) jogo.log(\`acertou \${alvo.nome}: vida \${alvo.vida}\`);
}

/**
 * Depois de cada tiro (alvo = inimigo acertado ou null).
 * @param {Jogador} eu
 * @param {Jogo} jogo
 * @param {Inimigo | null} alvo
 */
export function aoAtirar(eu, jogo, alvo) {
  if (alvo && !alvo.vivo) jogo.log(\`\${eu.nome} derrubou \${alvo.nome} (\${alvo.id})\`);
}

/**
 * Quando um inimigo acerta ${nome} (ainda sem barra de vida). Retorne false para ignorar o golpe.
 * @param {Jogador} eu
 * @param {Jogo} jogo
 * @param {string} ataque
 * @param {Inimigo} inimigo
 * @param {number} dano
 */
export function aoSerAtingido(eu, jogo, ataque, inimigo, dano) {
  eu.dados.golpesLevados = (eu.dados.golpesLevados ?? 0) + 1;
  jogo.log(\`\${eu.nome} levou \${ataque} (\${dano}) de \${inimigo.nome}; total: \${eu.dados.golpesLevados}\`);
}
`;
}

/** Objeto com comportamento pronto: o mesmo comportamento escrito em código (retornando false, o pronto não roda). */
export function modeloComportamento(nome: string, c: Comportamento, alvo?: { nome: string; porta: boolean }): string {
  const cab = `// Script de ${nome}. Ele já tinha o comportamento pronto "${c.tipo}" (painel Propriedades);
// aqui está o MESMO comportamento escrito em código. Retornar false desliga o pronto: quem manda é este código.\n\n`;
  const doc = (texto: string, extra = '') => `/**\n * ${texto}\n * @param {Objeto} eu\n * @param {Jogo} jogo${extra}\n */\n`;
  switch (c.tipo) {
    case 'porta':
      return cab + doc('Interagir com a porta (tecla Interagir).') + `export function aoInteragir(eu, jogo) {
${c.requer ? `  if (!jogo.inventario.tem(${js(c.requer)})) {
    jogo.aviso('Trancada. Precisa de: ' + ${js(c.requer)});
    return false;
  }
${c.consome ? `  jogo.inventario.tirar(${js(c.requer)});\n` : ''}` : ''}  eu.abrir();
  jogo.aviso(\`\${eu.nome}: aberta\`);
  return false;
}
`;
    case 'alavanca':
      return cab + doc('Acionar a alavanca.') + `export function aoInteragir(eu, jogo) {
${c.umaVez ? `  if (eu.dados.usada) return false;   // só funciona uma vez
  eu.dados.usada = true;
` : ''}  const alvo = jogo.objeto(${js(c.alvo || '')});${alvo ? `   // ${alvo.nome}` : ''}
  if (!alvo) { jogo.aviso('Esta alavanca não está ligada a nada.'); return false; }
${alvo?.porta ? `  alvo.aberta = !alvo.aberta;                    // porta: abre/fecha
  jogo.aviso(\`\${alvo.nome}: \${alvo.aberta ? 'aberta' : 'fechada'}\`);` : `  alvo.visivel = !alvo.visivel;                  // aparece/some
  jogo.aviso(\`\${alvo.nome}: \${alvo.visivel ? 'apareceu' : 'sumiu'}\`);`}
  return false;
}
`;
    case 'coletavel':
      return cab + doc('Antes de ir para o inventário. Retorne false para não pegar.') + `export function aoColetar(eu, jogo) {
  // O pronto faz: some e dá ${c.quantidade}× "${c.item}" no inventário
  eu.esconder();
  jogo.inventario.dar(${js(c.item)}, ${c.quantidade});
  jogo.aviso('Pegou: ' + ${js(c.item)}${c.quantidade > 1 ? ` + ' ×${c.quantidade}'` : ''});
  return false;
}
`;
    case 'saida':
      return cab + doc('Entrar na saída.') + `export function aoInteragir(eu, jogo) {
  jogo.irPara(${js(c.destino || '')});
  return false;
}
`;
    case 'mensagem':
      return cab + doc('Ler a mensagem.') + `export function aoInteragir(eu, jogo) {
  jogo.mensagem(${js(c.texto || '')});
  return false;
}
`;
    default:
      return cab;
  }
}
