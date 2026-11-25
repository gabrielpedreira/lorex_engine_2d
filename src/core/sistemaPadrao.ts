// "Sistema do jogo": as regras que o JOGO usa (não a engine), escritas em JavaScript e editáveis no painel de Código.
// A engine sempre roda estes módulos: o arquivo do projeto (jogo/scripts/sistema.<nome>.js), se existir, ou o texto
// padrão daqui. Para mudar uma regra do jogo inteiro (ex.: como a linha do tiro some), edite e salve o módulo.
// Novos sistemas entram nesta lista conforme as regras saem da engine para o jogo.

export interface ModuloSistema {
  /** Nome curto usado pela engine (ex.: "armas"). */
  id: string;
  arquivo: string;
  nome: string;
  descricao: string;
  /** Funções que a engine chama (para o painel mostrar). */
  funcoes: string[];
  texto: string;
}

const ARMAS = `// Sistema do jogo: ARMAS E TIRO.
// Este é o código do JOGO (não da engine): as regras que todas as armas seguem. A engine chama estas funções;
// mude aqui e salve (Ctrl+S) para mudar o jogo inteiro. Para mudar uma arma só, use o script dela
// (Código › Armas › <arma> → aoCalcularDano). Os números de cada arma ficam na ferramenta Armas (A).
//
// "arma" é a arma inteira como está em jogo/armas/<arma>.json:
//   { nome, pente, slots, alcance, alturaTiro, dano, danoPorDistancia: [{ ate, dano }],
//     linha: { opacidade, cor, espessura, duracao }, imagens: { hud, hudVazia, bala, menu },
//     acaoTiro, acaoRecarga, animacaoSemBala }

/**
 * Dano de um tiro que acertou um alvo a "distancia" px.
 * Faixas da arma: até "ate"% do alcance → "dano" (a primeira que cobrir a distância vale).
 * @param {any} arma
 * @param {number} distancia
 * @returns {number}
 */
export function danoNaDistancia(arma, distancia) {
  const porcento = arma.alcance > 0 ? (distancia / arma.alcance) * 100 : 0;
  const faixa = [...arma.danoPorDistancia].sort((a, b) => a.ate - b.ate).find((f) => porcento <= f.ate);
  return faixa ? faixa.dano : arma.dano;
}

/**
 * Como a linha do tiro aparece enquanto está na tela (chamada a cada quadro).
 * restante: 1 = o tiro acabou de sair, 0 = a linha está sumindo.
 * Retorne { opacidade (0 a 1), espessura (px), cor ("#rrggbb") }. Opacidade 0 = sem linha.
 * @param {any} arma
 * @param {number} restante
 */
export function linhaDoTiro(arma, restante) {
  return {
    opacidade: (arma.linha.opacidade / 100) * (0.4 + 0.6 * restante),   // começa forte e vai sumindo
    espessura: arma.linha.espessura,
    cor: arma.linha.cor,
  };
}

/**
 * Regras do tiro e da recarga: chamada quando o jogador aperta a ação de tiro ou de recarga da arma.
 * (Um personagem com aoUsarArma no script dele usa a regra dele no lugar desta.)
 * @param {Jogador} eu
 * @param {Jogo} jogo
 * @param {string} acao   a ação apertada (arma.acaoTiro ou arma.acaoRecarga)
 * @param {any} arma
 */
export function usarArma(eu, jogo, acao, arma) {
  if (eu.acaoAtual || eu.agarrado) return;                 // ocupado (atirando, recarregando) ou preso

  if (acao === arma.acaoRecarga) {
    if (eu.arma.municao >= arma.pente) return;             // pente cheio
    if (!eu.tocar(arma.acaoRecarga)) return;
    // O pente enche quando a animação de recarga termina
    jogo.esperar(eu.duracao(arma.acaoRecarga), () => { eu.arma.municao = arma.pente; });
    return;
  }

  // Tiro
  if (eu.arma.municao <= 0) {
    eu.tocar(arma.animacaoSemBala);                        // clique: arma descarregada
    jogo.aviso('Sem munição! Recarregue.');
    return;
  }
  if (!eu.tocar(arma.acaoTiro)) return;
  eu.arma.municao -= 1;
  eu.arma.disparar();                                      // tiro instantâneo: dano por danoNaDistancia
}
`;

export const SISTEMAS: ModuloSistema[] = [
  {
    id: 'armas', arquivo: 'sistema.armas.js', nome: 'Armas e tiro',
    descricao: 'Dano por distância, como a linha do tiro aparece e some, regras do tiro e da recarga.',
    funcoes: ['danoNaDistancia(arma, distancia)', 'linhaDoTiro(arma, restante)', 'usarArma(eu, jogo, acao, arma)'],
    texto: ARMAS,
  },
];

/** Modelo de um módulo novo do usuário (classes e funções para importar em outros scripts). */
export function modeloModulo(nome: string) {
  const classe = nome.replace(/(^|[_\-\s]+)(\w)/g, (_, __, c: string) => c.toUpperCase()).replace(/\W/g, '') || 'MinhaClasse';
  return `// Módulo ${nome}: suas classes, funções e valores para usar em qualquer script do jogo.
// Em outro script:  import { ${classe} } from './${nome}.js';
// Quem importa o mesmo módulo divide as mesmas variáveis (bom para regras e contadores do jogo inteiro).

export class ${classe} {
  constructor(nome) {
    this.nome = nome;
    this.vezes = 0;
  }

  usar() {
    this.vezes += 1;
    return this.vezes;
  }
}

/** Exemplo de função: dano dobrado nas costas do inimigo. */
export function danoPelasCostas(dano, atacanteDireita, alvoOlhandoDireita) {
  return atacanteDireita === alvoOlhandoDireita ? dano * 2 : dano;
}
`;
}
