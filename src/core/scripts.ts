// Scripts (código do jogo): onde ficam, quais "ganchos" existem, o modelo de cada um, a compilação e os tipos
// usados pelo autocompletar do painel de Código. Os scripts são módulos JavaScript em jogo/scripts/*.js:
//
//   export function aoInteragir(eu, jogo) { jogo.aviso('Olá!'); }
//
// Quem é dono de um script: o jogo inteiro (jogo.js), uma fase (<fase>.js), um objeto da fase
// (<fase>.<id>.js) ou um personagem (personagem.<nome>.js). O dono guarda o nome do arquivo em "script".
//
// REGRA DA ENGINE: todo módulo novo (menus, HUD, inimigos…) que criar algo programável deve
// (1) aparecer no explorador do painel de Código (fonte de elementos), (2) ganhar ganchos aqui em GANCHOS e
// (3) expor a API dele em tiposApi(). Assim o código sempre acompanha o que existe no projeto.

export type DonoScript = 'jogo' | 'fase' | 'objeto' | 'personagem' | 'inimigo';

export interface Gancho {
  nome: string;
  donos: DonoScript[];
  /** Parâmetros (texto JS), ex.: "eu, jogo". */
  params: string;
  texto: string;
  /** Exemplo de corpo para o modelo. */
  exemplo?: string;
}

export const GANCHOS: Gancho[] = [
  { nome: 'aoIniciar', donos: ['jogo', 'fase', 'objeto', 'personagem', 'inimigo'], params: 'eu, jogo', texto: 'Uma vez, quando a fase começa.' },
  { nome: 'aoAtualizar', donos: ['jogo', 'fase', 'objeto', 'personagem', 'inimigo'], params: 'eu, jogo, dt', texto: 'A cada quadro (dt = segundos desde o último). Use com moderação.' },
  { nome: 'aoTocar', donos: ['objeto'], params: 'eu, jogo', texto: 'Quando o jogador encosta no objeto (uma vez por encostada).' },
  { nome: 'aoSair', donos: ['objeto'], params: 'eu, jogo', texto: 'Quando o jogador sai de cima/de dentro do objeto (zonas de gatilho: saiu da área).' },
  { nome: 'aoInteragir', donos: ['objeto'], params: 'eu, jogo', texto: 'Quando o jogador aperta Interagir perto do objeto. Retorne false para cancelar o comportamento pronto (porta, alavanca…). Um objeto com este gancho vira interagível mesmo sem comportamento.' },
  { nome: 'aoColetar', donos: ['objeto'], params: 'eu, jogo', texto: 'Antes de um coletável ir para o inventário. Retorne false para não pegar.' },
  { nome: 'aoAcionado', donos: ['objeto'], params: 'eu, jogo, origem', texto: 'Quando uma alavanca ligada a este objeto é acionada (origem = a alavanca).' },
  { nome: 'aoAcao', donos: ['personagem'], params: 'eu, jogo, acao', texto: 'Quando o jogador dispara uma ação (ex.: "tiro", "recarga"). Retorne false para cancelar a animação.' },
  { nome: 'aoUsarArma', donos: ['personagem'], params: 'eu, jogo, acao', texto: 'Regras da arma: chamado quando o jogador aperta a ação de tiro ou de recarga (seção Arma em Personagens). Com este gancho, quem decide é o código (pente, sem bala, recarga); sem ele, a engine usa as regras prontas.' },
  { nome: 'aoAtirar', donos: ['personagem'], params: 'eu, jogo, alvo', texto: 'Depois de cada tiro da arma (alvo = inimigo acertado, ou null se errou).' },
  { nome: 'aoSerAtingido', donos: ['personagem'], params: 'eu, jogo, ataque, inimigo, dano', texto: 'Quando um inimigo acerta o jogador (ataque = "golpe", "mordida"…). Retorne false para ignorar o golpe.' },
  { nome: 'aoPensar', donos: ['inimigo'], params: 'eu, jogo, dt', texto: 'O CÉREBRO do inimigo, a cada quadro: decide andar, parar, perseguir, atacar (eu.andar, eu.atacar, eu.estado = "perseguir"…). Ataque, dano e morte em andamento são da engine (eu.ocupado). Sem este gancho, a engine usa a IA pronta.' },
  { nome: 'aoVer', donos: ['inimigo'], params: 'eu, jogo', texto: 'O inimigo viu o jogador e começou a perseguir.' },
  { nome: 'aoPerder', donos: ['inimigo'], params: 'eu, jogo', texto: 'O jogador se afastou e o inimigo desistiu da perseguição.' },
  { nome: 'aoAtacar', donos: ['inimigo'], params: 'eu, jogo, ataque', texto: 'O inimigo vai atacar (ataque = "golpe", "mordida"…). Retorne false para cancelar.' },
  { nome: 'aoLevarDano', donos: ['inimigo'], params: 'eu, jogo, dano', texto: 'O inimigo levou um tiro. Retorne false para ignorar o dano.' },
  { nome: 'aoMorrer', donos: ['inimigo', 'personagem'], params: 'eu, jogo, motivo', texto: 'Inimigo: morreu. Jogador: a vida chegou a 0 (motivo = o golpe, "código"…); retorne false para não morrer (fica com 1 de vida).' },
  { nome: 'aoRenascer', donos: ['personagem'], params: 'eu, jogo', texto: 'O jogador voltou no último checkpoint depois de morrer (vida cheia).' },
  { nome: 'aoTrocarFase', donos: ['jogo'], params: 'eu, jogo, fase', texto: 'Quando o jogador chega numa fase ou área (fase = nome do arquivo).' },
  { nome: 'aoPassar', donos: ['jogo', 'fase'], params: 'eu, jogo, passagem, destino', texto: 'Antes de passar por uma passagem para outra sala (Mapa, M). destino = { fase, chegada, transicao } e pode ser mudado aqui (ex.: destino.transicao.efeito = "corte"). Retorne false para não passar.' },
];

export const gancho = (nome: string) => GANCHOS.find((g) => g.nome === nome);

/** Parâmetros de um gancho para um dono (jogo e fase não têm "eu"). */
export function paramsDe(g: Gancho, dono: DonoScript) {
  return dono === 'jogo' || dono === 'fase' ? g.params.replace(/^eu, /, '') : g.params;
}

/** Nome de arquivo (sem acento/espaço) a partir de um texto. */
export function slugScript(t: string) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'script';
}

export const arquivoScript = {
  jogo: () => 'jogo.js',
  fase: (arquivoFase: string) => `${slugScript(arquivoFase.replace(/\.json$/i, ''))}.js`,
  inimigo: (arquivoPersonagem: string) => `personagem.${slugScript(arquivoPersonagem.replace(/\.json$/i, ''))}.js`,
  objeto: (arquivoFase: string, idObjeto: string) => `${slugScript(arquivoFase.replace(/\.json$/i, ''))}.${slugScript(idObjeto)}.js`,
  personagem: (arquivoPersonagem: string) => `personagem.${slugScript(arquivoPersonagem.replace(/\.json$/i, ''))}.js`,
};

const TIPO_EU: Record<DonoScript, string> = { jogo: 'Jogo', fase: 'Jogo', objeto: 'Objeto', personagem: 'Jogador', inimigo: 'Inimigo' };

/** Script novo, já com os ganchos daquele tipo de dono (comentados os que não são essenciais). */
export function modeloScript(dono: DonoScript, nome: string, extra = ''): string {
  const ganchos = GANCHOS.filter((g) => g.donos.includes(dono));
  const principais: Record<DonoScript, string[]> = {
    jogo: ['aoIniciar', 'aoTrocarFase'], fase: ['aoIniciar'], objeto: ['aoInteragir'], personagem: ['aoAcao', 'aoMorrer'], inimigo: ['aoVer', 'aoMorrer'],
  };
  const linhas = [
    `// Script de ${nome}${extra ? ` (${extra})` : ''}.`,
    '// Ganchos: funções com nomes especiais que a engine chama sozinha. Apague as que não usar.',
    "// Ctrl+Espaço sugere o que existe (objetos, ações, animações). Referência completa: botão \"API\" no topo.",
    '',
  ];
  for (const g of ganchos) {
    const ativo = principais[dono].includes(g.nome);
    const params = paramsDe(g, dono);
    const p = params.split(', ');
    const tipoParam = (x: string) => x === 'eu' ? TIPO_EU[dono] : x === 'jogo' ? 'Jogo' : x === 'dt' || x === 'dano' ? 'number'
      : x === 'origem' || x === 'passagem' ? 'Objeto' : x === 'destino' ? 'Destino' : x === 'inimigo' ? 'Inimigo' : x === 'alvo' ? 'Inimigo | null' : 'string';
    const doc = [`/**`, ` * ${g.texto}`, ...p.map((x) => ` * @param {${tipoParam(x)}} ${x}`), ' */'];
    const corpo = ativo ? exemploPara(dono, g.nome) : '  ';
    const bloco = [...doc, `export function ${g.nome}(${params}) {`, corpo, '}'];
    linhas.push(...(ativo ? bloco : bloco.map((l) => '// ' + l)), '');
  }
  return linhas.join('\n');
}

function exemploPara(dono: DonoScript, nome: string) {
  if (dono === 'objeto' && nome === 'aoInteragir') return "  jogo.aviso(`Você mexeu em ${eu.nome}`);\n  // return false; // descomente para cancelar o comportamento pronto";
  if (dono === 'personagem' && nome === 'aoAcao') return '  // if (acao === "tiro") { ... }';
  if (dono === 'personagem' && nome === 'aoMorrer') return '  // jogo.log(`${eu.nome} morreu: ${motivo}`);\n  // return false; // descomente para não morrer (fica com 1 de vida)';
  if (dono === 'jogo' && nome === 'aoTrocarFase') return '  // jogo.log("Entrou em", fase);';
  if (nome === 'aoPassar') return '  // if (destino.fase === "laboratorio.json" && !jogo.variaveis.energia) { jogo.aviso("Sem energia."); return false; }';
  if (dono === 'inimigo' && nome === 'aoVer') return '  // jogo.log(`${eu.nome} viu o jogador`);';
  if (dono === 'inimigo' && nome === 'aoMorrer') return '  // jogo.inventario.dar("pontos", 10);';
  return '  ';
}

// ---------- Compilação (módulo ES a partir de texto) ----------

export interface ScriptCompilado {
  arquivo: string;
  url: string;
  ganchos: Record<string, (...args: unknown[]) => unknown>;
}

/** Compila um script como módulo (via blob:). Lança SyntaxError se o código tiver erro. */
export async function compilarScript(arquivo: string, codigo: string): Promise<ScriptCompilado> {
  const url = URL.createObjectURL(new Blob([codigo + `\n//# sourceURL=lorex-script/${arquivo}`], { type: 'text/javascript' }));
  const m = (await import(/* @vite-ignore */ url)) as Record<string, unknown>;
  const ganchos: ScriptCompilado['ganchos'] = {};
  for (const [k, v] of Object.entries(m)) if (typeof v === 'function') ganchos[k] = v as (...a: unknown[]) => unknown;
  return { arquivo, url, ganchos };
}

/** Linha de um erro dentro de um script (pela pilha), se der para saber. */
export function linhaDoErro(err: unknown, url: string): { linha: number; coluna: number } | null {
  const pilha = err instanceof Error ? err.stack ?? '' : '';
  const esc = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(esc + ':(\\d+):(\\d+)').exec(pilha) ?? /lorex-script\/[^:]+:(\d+):(\d+)/.exec(pilha);
  return m ? { linha: Number(m[1]), coluna: Number(m[2]) } : null;
}

// ---------- Tipos para o autocompletar ----------

export interface ContextoTipos {
  objetos: string[];
  /** Ids dos inimigos colocados na fase. */
  inimigos?: string[];
  /** Chaves dos elementos do HUD. */
  hud?: string[];
  /** Nomes das luzes da fase. */
  luzes?: string[];
  acoes: string[];
  animacoes: string[];
  fases: string[];
  itens: string[];
}

const uniao = (l: string[]) => (l.length ? [...new Set(l)].map((x) => JSON.stringify(x)).join(' | ') : 'string');

/** Declarações da API (mudam conforme o projeto: nomes de objetos, ações, animações, fases e itens). */
export function tiposApi(c: ContextoTipos): string {
  return `
/** Nome (ou id) de um objeto desta fase. */
type NomeObjeto = ${uniao(c.objetos)} | (string & {});
/** Ação dos Controles (teclas). */
type NomeAcao = ${uniao(c.acoes)} | (string & {});
/** Animação do personagem. */
type NomeAnimacao = ${uniao(c.animacoes)} | (string & {});
/** Arquivo de fase ou área. */
type NomeFase = ${uniao(c.fases)} | (string & {});
/** Inimigo colocado nesta fase (id). */
type NomeInimigo = ${uniao(c.inimigos ?? [])} | (string & {});
/** Chave de um elemento do HUD (ferramenta HUD). */
type ChaveHud = ${uniao(c.hud ?? [])} | (string & {});
/** Luz desta fase (nome ou id). */
type NomeLuz = ${uniao(c.luzes ?? [])} | (string & {});
/** Item do inventário. */
type NomeItem = ${uniao(c.itens)} | (string & {});

/** Um objeto da fase, durante o jogo. */
interface Objeto {
  readonly id: string;
  readonly nome: string;
  /** Posição (canto superior esquerdo). Mudar move o objeto. */
  x: number;
  y: number;
  readonly largura: number;
  readonly altura: number;
  /** Aparece no jogo? */
  visivel: boolean;
  /** Portas: aberta ou fechada. */
  aberta: boolean;
  /** Guarde aqui o que quiser deste objeto (vale durante a partida). */
  dados: Record<string, any>;
  mostrar(): void;
  esconder(): void;
  abrir(): void;
  fechar(): void;
  /** Move somando dx, dy (px). */
  mover(dx: number, dy: number): void;
  /** O jogador está encostando neste objeto? */
  readonly tocandoJogador: boolean;
  /** Distância (px) entre os centros do objeto e do jogador. */
  distanciaDoJogador(): number;
  /** Faz a mesma coisa que o jogador apertar Interagir nele. */
  interagir(): void;
  // ----- Objeto animado (Propriedades › Animação) -----
  /** A imagem é um spritesheet animado? */
  readonly animado: boolean;
  /** Toca a animação do começo (repetir = true fica em loop). */
  tocar(repetir?: boolean): void;
  /** Para no quadro atual. */
  parar(): void;
  /** Quadro mostrado agora (0 = primeiro). Mudar para nele. */
  quadro: number;
  readonly quadros: number;
  /** Está tocando agora? */
  readonly tocando: boolean;
}

/** O jogador (personagem do teste). */
interface Jogador {
  /** Posição dos pés. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  readonly noChao: boolean;
  readonly olhandoDireita: boolean;
  /** Nome do personagem (ex.: "Lorena"). */
  readonly nome: string;
  /** Toca uma animação extra (ex.: "tiro_sem_bala"). Retorna false se não existir. */
  tocar(animacao: NomeAnimacao): boolean;
  /** Animação extra tocando agora (ou null). */
  readonly acaoAtual: string | null;
  /** Leva o jogador para (x, y), parado. */
  teleportar(x: number, y: number): void;
  /** Dá um impulso (px/s), ex.: empurrar(0, -400) para um pulo extra. */
  empurrar(vx: number, vy: number): void;
  /** Guarde aqui o que quiser do jogador. */
  dados: Record<string, any>;
  /** Arma (seção Arma em Personagens). */
  readonly arma: {
    /** Balas no pente (pode mudar). */
    municao: number;
    readonly pente: number;
    /** Recarga pelas regras prontas da engine. */
    recarregar(): void;
    /** Tiro instantâneo com o dano e o alcance da arma; devolve o inimigo acertado ou null. */
    disparar(): Inimigo | null;
  };
  /** Duração (s) de uma animação do personagem. */
  duracao(animacao: NomeAnimacao): number;
  /** Está preso num agarrão? */
  readonly agarrado: boolean;
  /** Vida atual (mudar cura ou fere; 0 = morre). Vida cheia e tempo invulnerável: seção Vida em Personagens. */
  vida: number;
  readonly vidaMax: number;
  /** Tira vida (o personagem fica invulnerável por um instante). */
  ferir(dano: number): void;
  /** Cura (sem número = vida cheia). */
  curar(quantidade?: number): void;
  /** Morre agora (volta no último checkpoint). */
  morrer(): void;
  readonly morto: boolean;
  /** Piscando depois de um golpe (golpes não pegam). */
  readonly invulneravel: boolean;
}

/** Um inimigo da fase durante o jogo. */
interface Inimigo {
  readonly id: string;
  readonly nome: string;
  /** Arquivo do tipo (ex.: "zumbi.json"). */
  readonly tipo: string;
  /** Posição dos pés. */
  x: number;
  y: number;
  vida: number;
  readonly vidaMax: number;
  /** "perambular" | "perseguir" | "alerta" | "atacar" | "dano" | "morto" ou um estado seu (ex.: "fugir"). Mudar troca o estado. */
  estado: string;
  /** Segundos no estado atual. */
  readonly tempoNoEstado: number;
  readonly vivo: boolean;
  readonly olhandoDireita: boolean;
  /** Configuração do tipo (Personagens → Inimigo): visao, perderVisao, velocidadeAndar, velocidadePerseguir, alcanceAtaque, ataques… */
  readonly config: { visao: number; perderVisao: number; velocidadeAndar: number; velocidadePerseguir: number; alcanceAtaque: number; intervaloAtaque: number; alertaTiro: number; audicaoTiro: number; [k: string]: any };
  /** Guarde aqui o que quiser deste inimigo (cada inimigo tem o seu). */
  dados: Record<string, any>;

  // ----- Percepção (atualizada a cada quadro) -----
  /** O jogador está dentro da visão (config.visao) e na mesma altura? */
  readonly vendo: boolean;
  /** Distância horizontal até o jogador (positiva = jogador à direita). */
  readonly dx: number;
  /** Espaço entre os corpos, borda a borda (compare com config.alcanceAtaque). */
  readonly vao: number;
  readonly mesmaAltura: boolean;
  /** -1 = jogador à esquerda, 1 = à direita. */
  readonly ladoJogador: -1 | 1;
  /** Atacando, levando dano ou morto (a engine está cuidando; aoPensar nem é chamado). */
  readonly ocupado: boolean;
  /** Já passou o intervalo entre ataques? */
  readonly podeAtacar: boolean;
  /** Para onde um tiro chamou a atenção e quantos segundos de alerta restam. */
  readonly alerta: { x: number; restante: number };
  /** Tem chão e nenhuma parede nessa direção? */
  podeAndar(direcao: -1 | 1): boolean;
  distanciaDoJogador(): number;

  // ----- Comandos (use em aoPensar) -----
  /** Anda para -1 (esquerda) ou 1 (direita) neste quadro. */
  andar(direcao: -1 | 1, velocidade?: number): void;
  parar(): void;
  olhar(direcao: -1 | 1): void;
  olharParaJogador(): void;
  /** Ataca (sorteia pelos pesos se não disser qual). false = não pode agora. */
  atacar(nome?: NomeAnimacao): boolean;
  /** Chama a atenção para o ponto x (como um tiro). */
  alertar(x: number): void;
  aleatorio(min: number, max: number): number;
  /** Sem aoPensar (IA pronta): forçar perseguição / ficar parado / voltar ao normal. */
  forcarPerseguir(): void;
  ficarParado(): void;
  liberar(): void;
  dano(quantidade?: number): void;
  matar(): void;
}

interface Inventario {
  tem(item: NomeItem, quantidade?: number): boolean;
  quantidade(item: NomeItem): number;
  dar(item: NomeItem, quantidade?: number): void;
  tirar(item: NomeItem, quantidade?: number): boolean;
  /** Todos os itens: { "chave vermelha": 1, ... } */
  lista(): Record<string, number>;
}

interface Hud {
  /** Define o valor de um elemento do HUD (ferramenta HUD) pela chave; se não houver elemento, mostra uma linha no canto. */
  definir(chave: ChaveHud, valor: string | number): void;
  remover(chave: ChaveHud): void;
}

type EfeitoTransicao = "corte" | "escurecer" | "tela";
/** O que acontece entre uma sala e outra (Mapa › losango). */
interface Transicao {
  efeito: EfeitoTransicao;
  /** Spritesheet da tela cheia (relativo a jogo/). */
  animacao: string;
  /** Tempo mínimo (s). */
  duracao: number;
  cor: string;
  texto: string;
  /** Som (relativo a jogo/), "" = nenhum. */
  som: string;
  volume: number;
}
/** Destino de uma passagem (aoPassar pode mudar). */
interface Destino {
  /** Arquivo da sala de destino. */
  fase: NomeFase;
  /** Id da passagem onde o jogador aparece ("" = início do jogador). */
  chegada: string;
  transicao: Transicao;
}

/** Um ponto de luz (ferramenta Iluminação). As mudanças valem durante a partida. */
interface Luz {
  readonly id: string;
  readonly nome: string;
  readonly x: number;
  readonly y: number;
  ligada: boolean;
  raio: number;
  /** 0 a 1. */
  intensidade: number;
  readonly forma: "circulo" | "cone" | "retangulo";
  /** Cone: direção em graus (0 = direita, 90 = baixo); retângulo: rotação. Ex.: holofote girando. */
  angulo: number;
  ligar(): void;
  desligar(): void;
  alternar(): void;
}

/** Tudo o que o código pode usar durante o jogo. */
interface Jogo {
  readonly jogador: Jogador;
  readonly inventario: Inventario;
  readonly hud: Hud;
  /** Variáveis livres que seguem de uma fase para outra (ex.: jogo.variaveis.portaoAberto = true). */
  variaveis: Record<string, any>;
  /** Arquivo da fase atual. */
  readonly fase: string;
  /** Segundos desde que a fase começou. */
  readonly tempo: number;
  objeto(nomeOuId: NomeObjeto): Objeto | null;
  /** Inimigos da fase (filtro opcional pelo nome, id ou tipo). */
  inimigos(contem?: string): Inimigo[];
  inimigo(id: NomeInimigo): Inimigo | null;
  /** Objetos cujo nome contém o texto (ou todos). */
  objetos(nomeContem?: string): Objeto[];
  /** Luz da fase (ferramenta Iluminação), pelo nome ou id. */
  luz(nomeOuId: NomeLuz): Luz | null;
  luzes(): Luz[];
  /** A sala está escura? Mudar apaga/acende a sala (queda de energia). */
  escura: boolean;
  /** Aviso rápido na tela. */
  aviso(texto: string): void;
  /** Caixa de mensagem (pausa o jogo até fechar). */
  mensagem(texto: string): void;
  /** Vai para outra sala. chegada = id da passagem onde aparece (vazio = início do jogador); transicao = "corte" | "escurecer" | "tela" ou { efeito, animacao, som, duracao, cor, texto }. */
  irPara(fase: NomeFase, opcoes?: { chegada?: string; transicao?: EfeitoTransicao | Partial<Transicao> }): void;
  /** Passa pela passagem como se o jogador apertasse Interagir nela (destino e efeito vêm do Mapa). */
  passar(passagem: NomeObjeto | Objeto): void;
  /** Para onde a passagem leva pelo Mapa (null = não conectada). */
  destinoDe(passagem: NomeObjeto | Objeto): Destino | null;
  /** A ação foi apertada neste quadro? */
  apertou(acao: NomeAcao): boolean;
  /** A ação está segurada? */
  segurando(acao: NomeAcao): boolean;
  /** Marca um checkpoint (onde o jogador volta ao morrer) na posição dada ou onde ele está. */
  checkpoint(x?: number, y?: number): void;
  /** Chama a função depois de alguns segundos. */
  esperar(segundos: number, fn: () => void): void;
  /** Escreve na Saída do painel de Código. */
  log(...valores: any[]): void;
}
`;
}
