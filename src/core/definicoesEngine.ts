// "Definições da engine": o código-fonte REAL (TypeScript) onde a Lorex define o que é cada coisa que aparece nos
// scripts e nas ferramentas (escala, ataque, vida, caixa, ganchos…). O painel de Código mostra só para leitura:
// mudar a engine é mexer em lorex_engine_2d/src. Para criar as SUAS bases, use Sistema do jogo › Definições do jogo.
import personagem from './personagem.ts?raw';
import inimigos from './inimigos.ts?raw';
import comportamentos from './comportamentos.ts?raw';
import tipos from './tipos.ts?raw';
import hud from './hud.ts?raw';
import scripts from './scripts.ts?raw';
import definicoes from './definicoes.ts?raw';

export interface DefinicaoEngine { id: string; nome: string; detalhe: string; arquivo: string; texto: string }

export const DEFINICOES_ENGINE: DefinicaoEngine[] = [
  { id: 'personagem', nome: 'Personagem e animações', detalhe: 'escala, pés, caixa, animações, ações', arquivo: 'src/core/personagem.ts', texto: personagem },
  { id: 'inimigos', nome: 'Inimigos e armas', detalhe: 'vida, ataques, dano, alcance, armas', arquivo: 'src/core/inimigos.ts', texto: inimigos },
  { id: 'comportamentos', nome: 'Comportamentos prontos', detalhe: 'IA de inimigo, patrulha…', arquivo: 'src/core/comportamentos.ts', texto: comportamentos },
  { id: 'tipos', nome: 'Fase e objetos', detalhe: 'fase, camadas, objetos, colisão', arquivo: 'src/core/tipos.ts', texto: tipos },
  { id: 'hud', nome: 'HUD', detalhe: 'elementos da tela (vida, munição…)', arquivo: 'src/core/hud.ts', texto: hud },
  { id: 'scripts', nome: 'API dos scripts', detalhe: 'ganchos, jogo, eu, objetos', arquivo: 'src/core/scripts.ts', texto: scripts },
  { id: 'definicoes', nome: 'Campos próprios (como funcionam)', detalhe: 'tipos de campo do definicoes.js', arquivo: 'src/core/definicoes.ts', texto: definicoes },
];
