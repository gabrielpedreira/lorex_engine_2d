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
import type { Fase, InimigoFase, LuzFase, ObjetoFase } from './tipos';
import { normalizarLuz, novoIdInimigo, novoIdLuz } from './fase';
import { normalizarAjustes } from './inimigos';
import { normalizarHud, type ConfigHud } from './hud';
import { normalizarControles, type Atalho, type Controles } from './controles';
import { normalizarMapa, type Mapa } from './mapa';
import { normalizarItens, normalizarMenu } from './menu';
import { definicoes, valoresCampos, type AlvoCampo } from './definicoes';

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

// ---------- Campos do jogo (Definições do jogo) ----------

/** Põe os campos do jogo no bloco (se o jogo definiu algum para este tipo de coisa). */
function comCampos(alvo: AlvoCampo, salvos: Record<string, unknown> | undefined, r: { valores: Bloco; comentarios: Record<string, string> }) {
  const defs = definicoes()[alvo];
  if (!Object.keys(defs).length) return r;
  r.valores.campos = valoresCampos(defs, salvos);
  r.comentarios.campos = 'campos do seu jogo (Sistema do jogo › Definições do jogo); no código: eu.campos.nome';
  for (const [k, c] of Object.entries(defs)) r.comentarios[`campos.${k}`] = c.nome + (c.texto ? ` — ${c.texto}` : '');
  return r;
}
function camposDoBloco(b: Bloco, atuais: Record<string, number | string | boolean> | undefined) {
  if (!b.campos || typeof b.campos !== 'object' || Array.isArray(b.campos)) return atuais;
  const r: Record<string, number | string | boolean> = { ...(atuais ?? {}) };
  for (const [k, v] of Object.entries(b.campos as Bloco)) if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') r[k] = v;
  return r;
}

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
    base.vida = { maxima: v.maxima, invulneravel: v.invulneravel, piscar: v.piscar, piscadas: v.piscadas, renascer: v.renascer };
    Object.assign(com, { 'vida.maxima': 'vida cheia (cada golpe tira o dano do inimigo)', 'vida.invulneravel': 's sem levar golpe depois de um', 'vida.piscar': 's piscando em vermelho (pode ser menos de 1, ex.: 0.3)', 'vida.piscadas': 'quantas vezes acende e apaga nesse tempo', 'vida.renascer': 's até voltar no checkpoint' });
    base.armaEquipada = p.armaEquipada ?? '';
    com.armaEquipada = 'arquivo da arma em jogo/armas (ferramenta Armas); os números dela ficam no script da arma';
  }
  return comCampos(p.tipo === 'npc' ? 'inimigo' : 'personagem', p.campos, { valores: base, comentarios: com });
}

export function aplicarBlocoPersonagem(p: Personagem, b: Bloco): Personagem {
  const r: Personagem = structuredClone(p);
  const campos = camposDoBloco(b, r.campos);
  if (campos) r.campos = campos;
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
  return comCampos('arma', a.campos, {
    valores: {
      nome: a.nome, pente: a.pente, slots: a.slots, alcance: a.alcance, alturaTiro: a.alturaTiro, dano: a.dano,
      danoPorDistancia: a.danoPorDistancia.map((f) => ({ ate: f.ate, dano: f.dano })),
      linha: { opacidade: a.linha.opacidade, cor: a.linha.cor, espessura: a.linha.espessura, duracao: a.linha.duracao },
      imagens: { hud: a.imagens.hud, hudVazia: a.imagens.hudVazia, bala: a.imagens.bala, menu: a.imagens.menu },
      acaoTiro: a.acaoTiro, acaoRecarga: a.acaoRecarga, animacaoSemBala: a.animacaoSemBala,
    },
    comentarios: {
      pente: 'balas por pente', slots: 'espaços no inventário', alcance: 'px até onde o tiro chega', alturaTiro: 'altura do tiro (0 = pés, 1 = cabeça)',
      dano: 'dano além da última faixa', danoPorDistancia: 'até "ate"% do alcance → "dano" (ex.: 50% → 2, 100% → 1)',
      'linha.opacidade': '% (0 = invisível, 100 = bem marcada)', 'linha.espessura': 'px', 'linha.duracao': 's na tela',
      'imagens.hud': 'arma carregada no HUD', 'imagens.hudVazia': 'arma descarregada no HUD', 'imagens.bala': 'cada bala no HUD', 'imagens.menu': 'no menu/inventário',
      acaoTiro: 'animação do personagem ao atirar', acaoRecarga: 'animação ao recarregar', animacaoSemBala: 'animação com o pente vazio',
    },
  });
}

export function aplicarBlocoArma(a: ConfigArma, b: Bloco): ConfigArma {
  const d = b.danoPorDistancia;
  return normalizarArma({
    ...a, ...pegar(b, ['nome', 'pente', 'slots', 'alcance', 'alturaTiro', 'dano', 'acaoTiro', 'acaoRecarga', 'animacaoSemBala']),
    danoPorDistancia: Array.isArray(d) ? d : a.danoPorDistancia,
    linha: b.linha && typeof b.linha === 'object' ? { ...a.linha, ...(b.linha as object) } : a.linha,
    imagens: b.imagens && typeof b.imagens === 'object' ? { ...a.imagens, ...(b.imagens as object) } : a.imagens,
    ...(camposDoBloco(b, a.campos) ? { campos: camposDoBloco(b, a.campos) } : {}),
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
  return comCampos('objeto', o.campos, { valores: v, comentarios: com });
}

export function aplicarBlocoObjeto(o: ObjetoFase, b: Bloco) {
  const campos = camposDoBloco(b, o.campos);
  if (campos) o.campos = campos;
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
  return comCampos('fase', f.campos, {
    valores: {
      nome: f.nome, largura: f.tamanho[0], altura: f.tamanho[1], tela: [...f.resolucaoBase], corFundo: f.corFundo, inicio: [...f.spawnJogador],
      escura: f.iluminacao.escura, escuridao: f.iluminacao.escuridao, corEscuro: f.iluminacao.cor, lanterna: f.iluminacao.lanterna, lanternaForma: f.iluminacao.lanternaForma,
      camadas: f.camadas.map((c) => ({ id: c.id, nome: c.nome, paralaxe: [c.parallax[0], c.parallax[1]], visivel: c.visivel })),
      luzes: f.luzes.map((l) => ({
        id: l.id, nome: l.nome, forma: l.forma, x: Math.round(l.x), y: Math.round(l.y), raio: l.raio, intensidade: l.intensidade, cor: l.cor,
        ...(l.forma === 'cone' ? { angulo: l.angulo, abertura: l.abertura } : {}),
        ...(l.forma === 'retangulo' ? { largura: l.largura, altura: l.altura, angulo: l.angulo } : {}),
        tremular: l.tremular, ligada: l.ligada,
      })),
      inimigos: f.inimigos.map((i) => ({
        id: i.id, tipo: i.personagem, x: Math.round(i.x), y: Math.round(i.y), olhandoDireita: i.olhandoDireita, surge: i.surge ?? '',
        ajustes: { ...(i.ajustes ?? {}) },
      })),
    },
    comentarios: {
      largura: 'tamanho da fase (px)', altura: 'tamanho da fase (px)', tela: 'tela do jogo [largura, altura] (ferramenta Q)', inicio: 'pés do jogador ao começar [x, y]',
      escura: 'sala no escuro', escuridao: '0 a 1', corEscuro: 'cor da escuridão', lanterna: 'raio da luz do jogador (0 = sem)', lanternaForma: '"circulo" ou "cone"',
      camadas: 'paralaxe [x, y]: 0 = parada, 1 = junto com o jogador, >1 = primeiro plano',
      luzes: 'forma: "circulo", "cone" ou "retangulo"; intensidade 0 a 1. Apague uma linha para tirar a luz; uma linha sem id cria uma luz nova',
      inimigos: 'tipo = personagem NPC; surge = id do gatilho ("" = desde o início); ajustes = só este inimigo (vida, velocidadeAndar, velocidadePerseguir, visao, perderVisao, alcanceAtaque, intervaloAtaque, audicaoTiro, alertaTiro)',
    },
  });
}

export function aplicarBlocoFase(f: Fase, b: Bloco) {
  const campos = camposDoBloco(b, f.campos);
  if (campos) f.campos = campos;
  if (typeof b.nome === 'string' && b.nome.trim()) f.nome = b.nome.trim();
  f.tamanho = [Math.max(16, Math.round(num(b.largura, f.tamanho[0]))), Math.max(16, Math.round(num(b.altura, f.tamanho[1])))];
  if (Array.isArray(b.tela) && b.tela.length === 2) f.resolucaoBase = [Math.max(32, Math.round(num(b.tela[0], f.resolucaoBase[0]))), Math.max(32, Math.round(num(b.tela[1], f.resolucaoBase[1])))];
  if (typeof b.corFundo === 'string') f.corFundo = b.corFundo;
  if (Array.isArray(b.inicio) && b.inicio.length === 2) f.spawnJogador = [num(b.inicio[0], f.spawnJogador[0]), num(b.inicio[1], f.spawnJogador[1])];
  if (typeof b.escura === 'boolean') f.iluminacao.escura = b.escura;
  if (typeof b.corEscuro === 'string' && /^#[0-9a-f]{6}$/i.test(b.corEscuro)) f.iluminacao.cor = b.corEscuro;
  if (b.lanternaForma === 'circulo' || b.lanternaForma === 'cone') f.iluminacao.lanternaForma = b.lanternaForma;
  // Camadas: só mexe nas que existem (os objetos moram nelas)
  if (Array.isArray(b.camadas)) for (const c of b.camadas as Bloco[]) {
    const cam = f.camadas.find((x) => x.id === c?.id) ?? f.camadas.find((x) => x.nome === c?.nome);
    if (!cam) continue;
    if (typeof c.nome === 'string' && c.nome.trim()) cam.nome = c.nome.trim();
    if (Array.isArray(c.paralaxe) && c.paralaxe.length === 2) cam.parallax = [num(c.paralaxe[0], cam.parallax[0]), num(c.paralaxe[1], cam.parallax[1])];
    if (typeof c.visivel === 'boolean') cam.visivel = c.visivel;
  }
  // Luzes: linha apagada = luz removida; linha sem id (ou id novo) = luz nova
  if (Array.isArray(b.luzes)) {
    const novas: LuzFase[] = [];
    for (const l of b.luzes as Bloco[]) {
      if (!l || typeof l !== 'object') continue;
      const antiga = f.luzes.find((x) => x.id === l.id);
      const id = antiga?.id ?? (typeof l.id === 'string' && l.id && !novas.some((n) => n.id === l.id) ? l.id : novoIdLuz({ ...f, luzes: [...f.luzes, ...novas] }));
      novas.push(normalizarLuz({ ...(antiga ?? {}), ...(l as Partial<LuzFase>), id }));
    }
    f.luzes = novas;
  }
  // Inimigos: linha apagada = inimigo removido; linha sem id = inimigo novo
  if (Array.isArray(b.inimigos)) {
    const novos: InimigoFase[] = [];
    for (const i of b.inimigos as Bloco[]) {
      if (!i || typeof i !== 'object' || typeof i.tipo !== 'string') continue;
      const antigo = f.inimigos.find((x) => x.id === i.id);
      const id = antigo?.id ?? (typeof i.id === 'string' && i.id && !novos.some((n) => n.id === i.id) ? i.id : novoIdInimigo({ ...f, inimigos: [...f.inimigos, ...novos] }));
      const aj = normalizarAjustes(i.ajustes);
      novos.push({
        id, personagem: i.tipo, x: num(i.x, antigo?.x ?? 0), y: num(i.y, antigo?.y ?? 0),
        olhandoDireita: typeof i.olhandoDireita === 'boolean' ? i.olhandoDireita : (antigo?.olhandoDireita ?? false),
        ...(typeof i.surge === 'string' && i.surge ? { surge: i.surge } : {}),
        ...(aj ? { ajustes: aj } : {}),
      });
    }
    f.inimigos = novos;
  }
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

// ---------- HUD, Controles e Mapa (projeto.json): scripts só de valores no grupo Jogo ----------

export function blocoHud(h: ConfigHud): { valores: Bloco; comentarios: Record<string, string> } {
  return {
    valores: { elementos: h.elementos.map((e) => ({ ...e, faixas: e.faixas.map((f) => ({ ...f })) })) as unknown as Valor[], morte: { ...h.morte } as unknown as Bloco },
    comentarios: {
      elementos: 'cada elemento do HUD: chave = o que mostra (vida, municao, item:moeda…); ancora = canto (no, n, ne, o, c, l, so, s, se); estilo = texto, barra, icones, caixas ou imagem; faixas = valor ≤ ate troca cor/imagem',
      morte: 'tela de morte: imagem (spritesheet) ou só o texto; escurecer 0 a 1',
    },
  };
}
export function aplicarBlocoHud(h: ConfigHud, b: Bloco): ConfigHud {
  return normalizarHud({ elementos: Array.isArray(b.elementos) ? b.elementos : h.elementos, morte: b.morte && typeof b.morte === 'object' ? b.morte : h.morte });
}

/** Atalho como texto: "KeyJ", "Shift + KeyJ" (juntas), "ArrowDown > ArrowRight > KeyJ" (sequência). Letras/números sozinhos também valem: "J", "1". */
function textoDoAtalho(a: Atalho) { return a.teclas.join(a.tipo === 'sequencia' ? ' > ' : a.tipo === 'combinacao' ? ' + ' : ''); }
function atalhoDoTexto(t: string): Atalho | null {
  const cod = (k: string) => { const x = k.trim(); return /^[A-Za-z]$/.test(x) ? 'Key' + x.toUpperCase() : /^\d$/.test(x) ? 'Digit' + x : x; };
  const seq = t.split('>').map(cod).filter(Boolean);
  if (seq.length > 1) return { tipo: 'sequencia', teclas: seq };
  const comb = t.split(' + ').map(cod).filter(Boolean);
  if (comb.length > 1) return { tipo: 'combinacao', teclas: comb };
  return t.trim() ? { tipo: 'tecla', teclas: [cod(t)] } : null;
}
export function blocoControles(c: Controles): { valores: Bloco; comentarios: Record<string, string> } {
  const acoes: Bloco = {};
  for (const [k, lista] of Object.entries(c.acoes)) acoes[k] = lista.map(textoDoAtalho);
  return {
    valores: { acoes, janelaSequencia: c.janelaSequencia },
    comentarios: { acoes: 'ação → teclas. "KeyJ" (ou "J"), "Shift + KeyJ" = juntas, "ArrowDown > ArrowRight > KeyJ" = uma depois da outra', janelaSequencia: 's máximos entre as teclas de uma sequência' },
  };
}
export function aplicarBlocoControles(c: Controles, b: Bloco): Controles {
  const acoes: Record<string, Atalho[]> = {};
  if (b.acoes && typeof b.acoes === 'object' && !Array.isArray(b.acoes)) {
    for (const [k, lista] of Object.entries(b.acoes as Bloco)) {
      if (!Array.isArray(lista)) continue;
      acoes[k] = lista.flatMap((t) => (typeof t === 'string' ? [atalhoDoTexto(t)].filter((x): x is Atalho => !!x) : []));
    }
  }
  return normalizarControles({ acoes: b.acoes ? acoes : c.acoes, janelaSequencia: num(b.janelaSequencia, c.janelaSequencia) });
}

export function blocoMapa(m: Mapa): { valores: Bloco; comentarios: Record<string, string> } {
  return {
    valores: { conexoes: m.conexoes.map(({ pos: _pos, ...c }) => JSON.parse(JSON.stringify(c))) as Valor[] },
    comentarios: { conexoes: 'passagens entre salas: a/b = { fase, passagem }; maoDupla = volta pelo mesmo caminho; transicao = efeito (corte, escurecer, tela), duracao (s), cor, texto, som, volume' },
  };
}
export function aplicarBlocoMapa(m: Mapa, b: Bloco): Mapa {
  if (!Array.isArray(b.conexoes)) return m;
  const conexoes = (b.conexoes as Bloco[]).map((c) => ({ ...c, ...(m.conexoes.find((x) => x.id === c?.id)?.pos ? { pos: m.conexoes.find((x) => x.id === c?.id)!.pos } : {}) }));
  return normalizarMapa({ salas: m.salas, conexoes });
}

// ---------- Menu e itens (projeto.json): menu.js e itens.js no grupo Jogo ----------

export function blocoMenu(m: import('./menu').ConfigMenu): { valores: Bloco; comentarios: Record<string, string> } {
  return {
    valores: JSON.parse(JSON.stringify(m)) as Bloco,
    comentarios: {
      fundo: 'cor atrás dos painéis', escurecer: 'quanto escurece o jogo atrás do menu (0 a 1)',
      telas: 'inventario e arquivos: painéis { id, tipo, x, y, w, h, imagem, area [x, y, w, h], acao, faixas, colunas, linhas, cor }. tipo: imagem, retrato, vida, arma, itens, info, lista, leitura, botao; acao (botão): sair, arquivos, menu, mapa',
      submenu: 'caixa Usar / Combinar / Checar: imagem, tamanho e a área de cada botão [x, y, w, h]', som: 'som ao abrir (opcional)',
    },
  };
}
export function aplicarBlocoMenu(_m: import('./menu').ConfigMenu, b: Bloco): import('./menu').ConfigMenu {
  return normalizarMenu(b);
}

export function blocoItens(i: import('./menu').ConfigItens): { valores: Bloco; comentarios: Record<string, string> } {
  return {
    valores: JSON.parse(JSON.stringify(i)) as Bloco,
    comentarios: {
      itens: 'cada item: nome (o mesmo do Coletável), tipo "item" ou "arquivo", espacos 1 ou 2, imagem, imagemGrande, descricao (legenda do Checar), uso: "area", "curar", "arma" ou "nada", cura, arma (arquivo), consome',
      receitas: 'combinações: a + b → resultado (quantidade)',
      mensagens: 'textos: aquiNao (usar no lugar errado), semEspaco ({item} = nome), naoCombina',
    },
  };
}
export function aplicarBlocoItens(_i: import('./menu').ConfigItens, b: Bloco): import('./menu').ConfigItens {
  return normalizarItens(b);
}
