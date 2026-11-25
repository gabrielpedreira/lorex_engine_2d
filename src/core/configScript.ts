// Bloco de valores no topo dos scripts: `export const config = { vida: 3, velocidadeAndar: 30, … }`.
// É o mesmo dado das ferramentas visuais (Personagens, Propriedades, projeto.json), visto como código:
//   dados → código: quando algo muda no editor, o bloco do script é reescrito com os valores atuais;
//   código → dados: quando o script é salvo, os valores do bloco voltam para o personagem/objeto/fase/jogo.
// Assim tudo o que existe no jogo (vida, velocidade, dano, tamanho…) aparece e se edita no painel de Código.
// Puro (sem DOM).
import type { Comportamento } from './comportamentos';
import type { ConfigJogador } from './fisica';
import { normalizarArma, normalizarInimigo, type ConfigArma } from './inimigos';
import { normalizarVida, type Personagem } from './personagem';
import type { Fase, ObjetoFase } from './tipos';

type Valor = number | string | boolean | null | Valor[] | { [k: string]: Valor };
export type Bloco = Record<string, Valor>;

const ABRE = 'export const config = ';

// ---------- Texto ----------

/** Posição do bloco no texto (início da linha "export const config" até o "};" que fecha). */
function acharBloco(texto: string): { ini: number; fim: number; objIni: number; objFim: number } | null {
  const i = texto.search(/^export\s+const\s+config\s*=\s*\{/m);
  if (i < 0) return null;
  const objIni = texto.indexOf('{', i);
  let prof = 0, j = objIni, str: string | null = null;
  for (; j < texto.length; j++) {
    const c = texto[j];
    if (str) { if (c === '\\') j++; else if (c === str) str = null; continue; }
    if (c === '"' || c === "'" || c === '`') { str = c; continue; }
    if (c === '/' && texto[j + 1] === '/') { j = texto.indexOf('\n', j); if (j < 0) return null; continue; }
    if (c === '/' && texto[j + 1] === '*') { j = texto.indexOf('*/', j + 2) + 1; if (j <= 0) return null; continue; }
    if (c === '{' || c === '[') prof++;
    else if (c === '}' || c === ']') { prof--; if (prof === 0) break; }
  }
  if (prof !== 0) return null;
  let fim = j + 1;
  if (texto[fim] === ';') fim++;
  // Inclui o comentário "// Valores…" logo acima
  let ini = i;
  const antes = texto.slice(0, i);
  const m = /(^|\n)(\/\/ Valores[^\n]*\n(?:\/\/[^\n]*\n)*)$/.exec(antes);
  if (m) ini = i - m[2].length;
  return { ini, fim, objIni, objFim: j + 1 };
}

/** Lê o bloco config do script (null = não tem ou não dá para ler). */
export function lerBloco(texto: string): Bloco | null {
  const b = acharBloco(texto);
  if (!b) return null;
  try {
    const v = lerLiteral(texto.slice(b.objIni, b.objFim));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Bloco) : null;
  } catch { return null; }
}

/**
 * Lê um literal JavaScript simples (objetos, listas, números, textos, true/false/null, comentários, vírgula no fim).
 * Sem eval: o editor não pode rodar código só para ler valores.
 */
export function lerLiteral(s: string): Valor {
  let i = 0;
  const espaco = () => {
    for (;;) {
      while (i < s.length && /\s/.test(s[i])) i++;
      if (s.startsWith('//', i)) { const n = s.indexOf('\n', i); i = n < 0 ? s.length : n + 1; continue; }
      if (s.startsWith('/*', i)) { const n = s.indexOf('*/', i + 2); i = n < 0 ? s.length : n + 2; continue; }
      return;
    }
  };
  const erro = (m: string): never => { throw new Error(`${m} (posição ${i})`); };
  const texto = (): string => {
    const q = s[i++];
    let r = '';
    while (i < s.length && s[i] !== q) {
      if (s[i] === '\\') { const c = s[++i]; r += c === 'n' ? '\n' : c === 't' ? '\t' : c; i++; continue; }
      r += s[i++];
    }
    if (s[i] !== q) erro('texto sem fim');
    i++;
    return r;
  };
  const valor = (): Valor => {
    espaco();
    const c = s[i];
    if (c === '{') {
      i++;
      const o: Record<string, Valor> = {};
      for (;;) {
        espaco();
        if (s[i] === '}') { i++; return o; }
        let k: string;
        if (s[i] === '"' || s[i] === "'") k = texto();
        else { const m = /^[A-Za-z_$][\w$]*/.exec(s.slice(i)); if (!m) erro('nome esperado'); k = m![0]; i += k.length; }
        espaco();
        if (s[i++] !== ':') erro('":" esperado');
        o[k] = valor();
        espaco();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === '}') { i++; return o; }
        erro('"," ou "}" esperado');
      }
    }
    if (c === '[') {
      i++;
      const a: Valor[] = [];
      for (;;) {
        espaco();
        if (s[i] === ']') { i++; return a; }
        a.push(valor());
        espaco();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === ']') { i++; return a; }
        erro('"," ou "]" esperado');
      }
    }
    if (c === '"' || c === "'" || c === '`') return texto();
    const m = /^(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|true|false|null)/i.exec(s.slice(i));
    if (!m) return erro('valor esperado');
    i += m[0].length;
    return m[0] === 'true' ? true : m[0] === 'false' ? false : m[0] === 'null' ? null : Number(m[0]);
  };
  const v = valor();
  espaco();
  if (i < s.length) erro('sobrou texto');
  return v;
}

const ident = (k: string) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));

/** Objeto como literal JavaScript legível, com comentário por campo. */
function literal(v: Valor, comentarios: Record<string, string>, caminho: string, nivel: number): string {
  const pad = '  '.repeat(nivel + 1), padFim = '  '.repeat(nivel);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    if (v.every((x) => typeof x !== 'object' || x === null)) return `[${v.map((x) => JSON.stringify(x)).join(', ')}]`;
    return `[\n${v.map((x) => pad + literal(x, comentarios, caminho + '[]', nivel + 1) + ',').join('\n')}\n${padFim}]`;
  }
  if (v && typeof v === 'object') {
    const ks = Object.keys(v);
    if (!ks.length) return '{}';
    // Objetos pequenos dentro de listas (ex.: ataques) ficam numa linha só
    if (caminho.endsWith('[]')) return `{ ${ks.map((k) => `${ident(k)}: ${literal(v[k], comentarios, `${caminho}.${k}`, nivel + 1)}`).join(', ')} }`;
    const linhas = ks.map((k) => {
      const c = comentarios[caminho ? `${caminho}.${k}` : k];
      return `${pad}${ident(k)}: ${literal(v[k], comentarios, caminho ? `${caminho}.${k}` : k, nivel + 1)},${c ? `  // ${c}` : ''}`;
    });
    return `{\n${linhas.join('\n')}\n${padFim}}`;
  }
  return typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : JSON.stringify(v);
}

/** Texto do bloco (com o comentário de ajuda em cima). */
export function textoBloco(valores: Bloco, comentarios: Record<string, string>, titulo: string): string {
  return `// Valores de ${titulo}: os mesmos das ferramentas do editor. Mude aqui e salve (Ctrl+S): o editor atualiza;\n`
    + `// mude no editor e este bloco se atualiza sozinho. No código, leia com config.nome (ex.: config.vida).\n`
    + `${ABRE}${literal(valores, comentarios, '', 0)};`;
}

/** Põe (ou troca) o bloco config no script. Sem bloco, entra depois dos comentários do topo. */
export function escreverBloco(texto: string, valores: Bloco, comentarios: Record<string, string>, titulo: string): string {
  const novo = textoBloco(valores, comentarios, titulo);
  const b = acharBloco(texto);
  if (b) return texto.slice(0, b.ini) + novo + texto.slice(b.fim);
  const linhas = texto.split('\n');
  let k = 0;
  while (k < linhas.length && linhas[k].startsWith('//')) k++;
  return [...linhas.slice(0, k), ...(k ? [''] : []), novo, '', ...linhas.slice(k).filter((l, i) => !(i === 0 && l === ''))].join('\n');
}

/** Os valores do bloco são iguais (ignora formatação)? */
export const mesmosValores = (a: Bloco | null, b: Bloco | null) => JSON.stringify(a) === JSON.stringify(b);

// ---------- Leitura/escrita de cada tipo ----------

const num = (v: unknown, p: number) => (typeof v === 'number' && Number.isFinite(v) ? v : p);

/** Personagem (jogador ou NPC/inimigo). */
export function blocoPersonagem(p: Personagem): { valores: Bloco; comentarios: Record<string, string> } {
  const base: Bloco = { escala: p.escala, largura: p.caixa.largura, altura: p.caixa.altura };
  const com: Record<string, string> = { escala: 'tamanho do desenho (1 = tamanho da folha)', largura: 'caixa de colisão do corpo (px)', altura: 'caixa de colisão do corpo (px)' };
  if (p.tipo === 'npc' && p.inimigo) {
    const i = p.inimigo;
    Object.assign(base, {
      vida: i.vida, velocidadeAndar: i.velocidadeAndar, velocidadePerseguir: i.velocidadePerseguir, visao: i.visao, perderVisao: i.perderVisao,
      alcanceAtaque: i.alcanceAtaque, intervaloAtaque: i.intervaloAtaque, momentoDano: i.momentoDano, alertaTiro: i.alertaTiro, audicaoTiro: i.audicaoTiro,
      ataques: i.ataques.map((a) => ({ animacao: a.animacao, chance: a.peso, dano: a.dano, agarra: a.agarra })),
    });
    Object.assign(com, {
      vida: 'tiros para morrer (dano 1 por tiro)', velocidadeAndar: 'px/s perambulando', velocidadePerseguir: 'px/s perseguindo', visao: 'px até perceber o jogador',
      perderVisao: 'px em que desiste', alcanceAtaque: 'px entre os corpos para atacar', intervaloAtaque: 's entre ataques', momentoDano: 'parte da animação em que o golpe acerta (0 a 1)',
      alertaTiro: 's indo atrás do som de um tiro', audicaoTiro: 'px em que ouve tiros (0 = surdo)', ataques: 'animação, chance (%), dano e se agarra',
    });
  }
  if (p.tipo === 'jogador') {
    const v = p.vida ?? normalizarVida(null);
    base.vida = { maxima: v.maxima, invulneravel: v.invulneravel, piscar: v.piscar, renascer: v.renascer };
    Object.assign(com, { 'vida.maxima': 'vida cheia (cada golpe tira o dano do inimigo)', 'vida.invulneravel': 's sem levar golpe depois de um', 'vida.piscar': 's piscando em vermelho', 'vida.renascer': 's até voltar no checkpoint' });
    base.armaEquipada = p.armaEquipada ?? '';
    com.armaEquipada = 'arquivo da arma em jogo/armas (ferramenta Armas); os números dela ficam no script da arma';
  }
  return { valores: base, comentarios: com };
}

export function aplicarBlocoPersonagem(p: Personagem, b: Bloco): Personagem {
  const r: Personagem = structuredClone(p);
  r.escala = Math.max(0.05, num(b.escala, r.escala));
  r.caixa = { largura: Math.max(2, Math.round(num(b.largura, r.caixa.largura))), altura: Math.max(2, Math.round(num(b.altura, r.caixa.altura))) };
  if (r.tipo === 'npc' && r.inimigo) {
    const ataques = Array.isArray(b.ataques) ? (b.ataques as Bloco[]).map((a) => ({ animacao: a.animacao, peso: a.chance ?? a.peso, dano: a.dano, agarra: a.agarra })) : r.inimigo.ataques;
    r.inimigo = normalizarInimigo({ ...r.inimigo, ...pegar(b, ['vida', 'velocidadeAndar', 'velocidadePerseguir', 'visao', 'perderVisao', 'alcanceAtaque', 'intervaloAtaque', 'momentoDano', 'alertaTiro', 'audicaoTiro']), ataques });
  }
  if (r.tipo === 'jogador') {
    if (b.vida && typeof b.vida === 'object') r.vida = normalizarVida({ ...(r.vida ?? {}), ...(b.vida as object) });
    if (typeof b.armaEquipada === 'string') { if (b.armaEquipada) r.armaEquipada = b.armaEquipada; else delete r.armaEquipada; }
  }
  return r;
}

function pegar(b: Bloco, chaves: string[]) {
  const o: Record<string, Valor> = {};
  for (const k of chaves) if (b[k] !== undefined) o[k] = b[k];
  return o;
}

/** Arma (ferramenta Armas): tudo, inclusive o dano por distância, a linha do tiro e as imagens. */
export function blocoArma(a: ConfigArma): { valores: Bloco; comentarios: Record<string, string> } {
  return {
    valores: {
      nome: a.nome, pente: a.pente, slots: a.slots, alcance: a.alcance, alturaTiro: a.alturaTiro, dano: a.dano,
      danoPorDistancia: a.danoPorDistancia.map((f) => ({ ate: f.ate, dano: f.dano })),
      linha: { visibilidade: a.linha.visibilidade, cor: a.linha.cor, espessura: a.linha.espessura, duracao: a.linha.duracao },
      imagens: { hud: a.imagens.hud, hudVazia: a.imagens.hudVazia, bala: a.imagens.bala, menu: a.imagens.menu },
      acaoTiro: a.acaoTiro, acaoRecarga: a.acaoRecarga, animacaoSemBala: a.animacaoSemBala,
    },
    comentarios: {
      pente: 'balas por pente', slots: 'espaços no inventário', alcance: 'px até onde o tiro chega', alturaTiro: 'altura do tiro (0 = pés, 1 = cabeça)',
      dano: 'dano além da última faixa', danoPorDistancia: 'até "ate"% do alcance → "dano" (ex.: 50% → 2, 100% → 1)',
      'linha.visibilidade': '"visivel", "pouco" ou "invisivel"', 'linha.espessura': 'px', 'linha.duracao': 's na tela',
      'imagens.hud': 'arma carregada no HUD', 'imagens.hudVazia': 'arma descarregada no HUD', 'imagens.bala': 'cada bala no HUD', 'imagens.menu': 'no menu/inventário',
      acaoTiro: 'animação do personagem ao atirar', acaoRecarga: 'animação ao recarregar', animacaoSemBala: 'animação com o pente vazio',
    },
  };
}

export function aplicarBlocoArma(a: ConfigArma, b: Bloco): ConfigArma {
  const d = b.danoPorDistancia;
  return normalizarArma({
    ...a, ...pegar(b, ['nome', 'pente', 'slots', 'alcance', 'alturaTiro', 'dano', 'acaoTiro', 'acaoRecarga', 'animacaoSemBala']),
    danoPorDistancia: Array.isArray(d) ? d : a.danoPorDistancia,
    linha: b.linha && typeof b.linha === 'object' ? { ...a.linha, ...(b.linha as object) } : a.linha,
    imagens: b.imagens && typeof b.imagens === 'object' ? { ...a.imagens, ...(b.imagens as object) } : a.imagens,
  }) ?? a;
}

/** Objeto da fase: posição, tamanho na tela e o comportamento (porta, coletável…). */
export function blocoObjeto(o: ObjetoFase): { valores: Bloco; comentarios: Record<string, string> } {
  const v: Bloco = {
    x: Math.round(o.x), y: Math.round(o.y), largura: Math.round(o.w * o.escala), altura: Math.round(o.h * o.escala),
    rotacao: o.rotacao, opacidade: o.opacidade, visivel: o.visivel, espelhado: o.espelharX,
  };
  const com: Record<string, string> = { x: 'canto esquerdo (px)', y: 'topo (px)', largura: 'tamanho na tela (px)', altura: 'tamanho na tela (px)', rotacao: 'graus', opacidade: '0 a 1', visivel: 'aparece no começo da fase' };
  const c = o.comportamentos[0];
  if (c) {
    const { tipo, ...resto } = c as Comportamento & Record<string, Valor>;
    v.comportamento = { tipo, ...(resto as Bloco) };
    com.comportamento = 'o comportamento pronto (Propriedades → Interação)';
  }
  if (o.anim) { v.animacao = { quadros: o.anim.quadros, fps: o.anim.fps, modo: o.anim.modo }; com.animacao = 'modo: "loop", "umaVez" ou "parado"'; }
  return { valores: v, comentarios: com };
}

export function aplicarBlocoObjeto(o: ObjetoFase, b: Bloco) {
  o.x = num(b.x, o.x); o.y = num(b.y, o.y);
  const L = num(b.largura, Math.round(o.w * o.escala)), A = num(b.altura, Math.round(o.h * o.escala));
  if (!o.asset) { o.w = Math.max(2, L); o.h = Math.max(2, A); o.escala = 1; }
  else if (L !== Math.round(o.w * o.escala)) o.escala = Math.max(0.01, L / o.w);
  else if (A !== Math.round(o.h * o.escala)) o.escala = Math.max(0.01, A / o.h);
  o.rotacao = num(b.rotacao, o.rotacao);
  o.opacidade = Math.max(0, Math.min(1, num(b.opacidade, o.opacidade)));
  if (typeof b.visivel === 'boolean') o.visivel = b.visivel;
  if (typeof b.espelhado === 'boolean') o.espelharX = b.espelhado;
  const c = o.comportamentos[0];
  if (c && b.comportamento && typeof b.comportamento === 'object') {
    const novo = { ...c, ...(b.comportamento as object), tipo: c.tipo } as Comportamento;
    o.comportamentos[0] = novo;
  }
  if (o.anim && b.animacao && typeof b.animacao === 'object') {
    const a = b.animacao as Bloco;
    o.anim = { ...o.anim, quadros: Math.max(1, Math.round(num(a.quadros, o.anim.quadros))), fps: Math.max(0.5, num(a.fps, o.anim.fps)), modo: a.modo === 'umaVez' || a.modo === 'parado' ? a.modo : a.modo === 'loop' ? 'loop' : o.anim.modo };
  }
}

/** Fase/área: tamanho, tela, início do jogador e iluminação. */
export function blocoFase(f: Fase): { valores: Bloco; comentarios: Record<string, string> } {
  return {
    valores: {
      nome: f.nome, largura: f.tamanho[0], altura: f.tamanho[1], tela: [...f.resolucaoBase], corFundo: f.corFundo, inicio: [...f.spawnJogador],
      escura: f.iluminacao.escura, escuridao: f.iluminacao.escuridao, lanterna: f.iluminacao.lanterna,
    },
    comentarios: { largura: 'tamanho da fase (px)', altura: 'tamanho da fase (px)', tela: 'tela do jogo [largura, altura] (ferramenta Q)', inicio: 'pés do jogador ao começar [x, y]', escura: 'sala no escuro', escuridao: '0 a 1', lanterna: 'raio da luz do jogador (0 = sem)' },
  };
}

export function aplicarBlocoFase(f: Fase, b: Bloco) {
  if (typeof b.nome === 'string' && b.nome.trim()) f.nome = b.nome.trim();
  f.tamanho = [Math.max(16, Math.round(num(b.largura, f.tamanho[0]))), Math.max(16, Math.round(num(b.altura, f.tamanho[1])))];
  if (Array.isArray(b.tela) && b.tela.length === 2) f.resolucaoBase = [Math.max(32, Math.round(num(b.tela[0], f.resolucaoBase[0]))), Math.max(32, Math.round(num(b.tela[1], f.resolucaoBase[1])))];
  if (typeof b.corFundo === 'string') f.corFundo = b.corFundo;
  if (Array.isArray(b.inicio) && b.inicio.length === 2) f.spawnJogador = [num(b.inicio[0], f.spawnJogador[0]), num(b.inicio[1], f.spawnJogador[1])];
  if (typeof b.escura === 'boolean') f.iluminacao.escura = b.escura;
  f.iluminacao.escuridao = Math.max(0, Math.min(1, num(b.escuridao, f.iluminacao.escuridao)));
  f.iluminacao.lanterna = Math.max(0, num(b.lanterna, f.iluminacao.lanterna));
}

/** Jogo (global): física do jogador (projeto.json → jogador). */
export function blocoJogo(j: ConfigJogador): { valores: Bloco; comentarios: Record<string, string> } {
  return {
    valores: { velocidade: j.velocidade, alturaPulo: j.alturaPulo, gravidade: j.gravidade },
    comentarios: { velocidade: 'px/s andando', alturaPulo: 'px do pulo segurando o botão', gravidade: 'px/s² (mais alto = pulo mais pesado)' },
  };
}

export function aplicarBlocoJogo(j: ConfigJogador, b: Bloco): ConfigJogador {
  return { ...j, velocidade: Math.max(10, num(b.velocidade, j.velocidade)), alturaPulo: Math.max(4, num(b.alturaPulo, j.alturaPulo)), gravidade: Math.max(50, num(b.gravidade, j.gravidade)) };
}
