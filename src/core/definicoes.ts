// Definições do JOGO: campos novos que o próprio jogo cria para personagens, inimigos, armas, objetos e fases.
// Ficam em jogo/scripts/definicoes.js (Código › Sistema do jogo › Definições do jogo). Para cada campo definido:
//   • o editor mostra um campo de preencher (Personagens, Armas, Propriedades do objeto e da fase);
//   • o valor fica salvo junto (personagem/arma/objeto/fase → "campos") e aparece no bloco config do script;
//   • o código lê e muda com eu.campos.nome (ex.: eu.campos.danoAtaqueForte).
// Os campos que a ENGINE já tem (vida, escala, ataques…) estão em Código › Definições da engine (somente leitura).
// Puro (sem DOM).

export type TipoCampo = 'numero' | 'texto' | 'sim_nao' | 'lista' | 'acao' | 'cor';
export const TIPOS_CAMPO: TipoCampo[] = ['numero', 'texto', 'sim_nao', 'lista', 'acao', 'cor'];
export type AlvoCampo = 'personagem' | 'inimigo' | 'arma' | 'objeto' | 'fase';
export const ALVOS_CAMPO: { id: AlvoCampo; nome: string }[] = [
  { id: 'personagem', nome: 'Personagens jogáveis' }, { id: 'inimigo', nome: 'Inimigos (NPC)' }, { id: 'arma', nome: 'Armas' },
  { id: 'objeto', nome: 'Objetos da fase' }, { id: 'fase', nome: 'Fases e áreas' },
];

export interface CampoDefinido {
  tipo: TipoCampo;
  /** Nome mostrado no editor. */
  nome: string;
  /** Explicação (legenda ao passar o mouse). */
  texto: string;
  padrao: number | string | boolean;
  /** Número: limites e passo. */
  min?: number;
  max?: number;
  passo?: number;
  /** Lista: as opções. */
  opcoes?: string[];
}

export type Definicoes = Record<AlvoCampo, Record<string, CampoDefinido>>;

export const definicoesVazias = (): Definicoes => ({ personagem: {}, inimigo: {}, arma: {}, objeto: {}, fase: {} });

/** Lê o "campos" exportado por definicoes.js, aceitando formas curtas (ex.: danoForte: 3 → número com padrão 3). */
export function normalizarDefinicoes(d: unknown): Definicoes {
  const r = definicoesVazias();
  if (!d || typeof d !== 'object') return r;
  for (const alvo of ALVOS_CAMPO.map((a) => a.id)) {
    const lista = (d as Record<string, unknown>)[alvo];
    if (!lista || typeof lista !== 'object') continue;
    for (const [chave, v] of Object.entries(lista as Record<string, unknown>)) {
      if (!/^[A-Za-z_$][\w$]*$/.test(chave)) continue;
      let c: Partial<CampoDefinido>;
      if (typeof v === 'number') c = { tipo: 'numero', padrao: v };
      else if (typeof v === 'boolean') c = { tipo: 'sim_nao', padrao: v };
      else if (typeof v === 'string') c = { tipo: 'texto', padrao: v };
      else if (v && typeof v === 'object') c = v as Partial<CampoDefinido>;
      else continue;
      const tipo: TipoCampo = TIPOS_CAMPO.includes(c.tipo as TipoCampo) ? c.tipo as TipoCampo : typeof c.padrao === 'number' ? 'numero' : typeof c.padrao === 'boolean' ? 'sim_nao' : 'texto';
      const padrao = c.padrao ?? (tipo === 'numero' ? 0 : tipo === 'sim_nao' ? false : tipo === 'lista' ? (c.opcoes?.[0] ?? '') : tipo === 'cor' ? '#ffffff' : '');
      r[alvo][chave] = {
        tipo, nome: typeof c.nome === 'string' && c.nome ? c.nome : chave, texto: typeof c.texto === 'string' ? c.texto : '', padrao,
        ...(typeof c.min === 'number' ? { min: c.min } : {}), ...(typeof c.max === 'number' ? { max: c.max } : {}), ...(typeof c.passo === 'number' ? { passo: c.passo } : {}),
        ...(Array.isArray(c.opcoes) ? { opcoes: c.opcoes.map(String) } : {}),
      };
    }
  }
  return r;
}

/** Valores dos campos de uma coisa: os salvos, completados com o padrão de cada campo definido. */
export function valoresCampos(defs: Record<string, CampoDefinido>, salvos: Record<string, unknown> | undefined): Record<string, number | string | boolean> {
  const r: Record<string, number | string | boolean> = {};
  for (const [k, c] of Object.entries(defs)) {
    const v = salvos?.[k];
    r[k] = c.tipo === 'numero' ? (typeof v === 'number' && Number.isFinite(v) ? v : Number(c.padrao) || 0)
      : c.tipo === 'sim_nao' ? (typeof v === 'boolean' ? v : !!c.padrao)
        : typeof v === 'string' ? v : String(c.padrao ?? '');
  }
  // Valores de campos que não existem mais na definição ficam guardados (não se perdem se o campo voltar)
  for (const [k, v] of Object.entries(salvos ?? {})) if (!(k in r) && (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean')) r[k] = v;
  return r;
}

// ---------- As definições atuais (o editor carrega de definicoes.js) ----------
let atuais: Definicoes = definicoesVazias();
const ouvintes = new Set<() => void>();
export const definicoes = () => atuais;
export function definirDefinicoes(d: Definicoes) { atuais = d; for (const f of ouvintes) f(); }
export function aoMudarDefinicoes(f: () => void) { ouvintes.add(f); }

/** Texto padrão de jogo/scripts/definicoes.js. */
export const MODELO_DEFINICOES = `// Definições do JOGO: os campos que o SEU jogo cria (a engine já tem os dela: vida, escala, ataques…;
// veja Código › Definições da engine). Cada campo aqui vira:
//   • um campo no editor (Personagens, Armas, Propriedades do objeto/fase), seção "Campos do jogo";
//   • um valor no bloco config do script daquela coisa (config.campos);
//   • um valor no código: eu.campos.nomeDoCampo (personagem, inimigo, arma, objeto) ou jogo.camposFase.
//
// Tipos: "numero" (min, max, passo), "texto", "sim_nao", "lista" (opcoes: [...]), "acao" (uma animação/ação
// do personagem, ex.: "ataque_forte"), "cor". Forma curta também vale: danoForte: 3 (número com padrão 3).
// Salve (Ctrl+S) e o editor passa a mostrar os campos.

export const campos = {
  // Personagens jogáveis (Lorena, Nicolas…)
  personagem: {
    // ataqueForte: { tipo: "acao", nome: "Ataque forte", padrao: "ataque_forte", texto: "Animação/ação do golpe forte" },
    // danoAtaqueForte: { tipo: "numero", nome: "Dano do ataque forte", padrao: 3, min: 0, passo: 1 },
  },
  // Inimigos (NPC com IA)
  inimigo: {
    // medoDeLuz: { tipo: "sim_nao", nome: "Foge da luz", padrao: false, texto: "Insetos que ficam no escuro" },
  },
  // Armas (ferramenta Armas)
  arma: {
    // barulho: { tipo: "numero", nome: "Barulho do tiro (px)", padrao: 260, texto: "Até onde os zumbis ouvem" },
  },
  // Objetos da fase (Propriedades do objeto)
  objeto: {
    // peso: { tipo: "lista", nome: "Peso", padrao: "leve", opcoes: ["leve", "pesado", "fixo"] },
  },
  // Fases e áreas (Propriedades da fase, sem nada selecionado)
  fase: {
    // musica: { tipo: "texto", nome: "Música", padrao: "", texto: "Arquivo de som da fase" },
  },
};
`;
