# Arquitetura da Lorex Engine 2D (motor/editor)

Última atualização: 2026-11-16

## 1. Princípios

1. **Construção incremental:** cada recurso nasce de uma necessidade real do jogo.
2. **Visual primeiro, código depois:** comportamentos comuns são opções prontas no inspetor; o painel de
   código serve para lógica específica de cada objeto.
3. **Editor e jogo usam o mesmo runtime:** o que se vê no editor é o que roda no jogo, e o ▶ testa na hora.
4. **Dados em JSON legível:** fases e projeto são arquivos texto, fáceis de versionar no git.
5. **Pixel art correta:** resolução base fixa, escala inteira, filtro *nearest* (sem borrar).
6. **Interface em linguagem natural:** ex.: "Fundo 3 (mais distante)" em vez de "Layer index -3".

## 2. Stack

| Camada | Tecnologia | Motivo |
|---|---|---|
| Linguagem | TypeScript | o Gabriel já domina JS; tipagem ajuda em um projeto grande |
| Renderização | PixiJS | 2D rápido via WebGL, bom para sprites e pixel art |
| Interface do editor | HTML/CSS + TypeScript puro (sem framework) | leve e simples de entender |
| Painel de código | Monaco Editor (etapa 4) | o mesmo editor do VS Code, com autocomplete |
| App desktop | **Electron** (decidido em 2026-11-16) | só JavaScript, simples de começar; acesso aos arquivos via IPC |
| Build | Vite | dev server rápido com hot reload |

## 3. Módulos

0 Fundação · 1 Construtor de fases · 2 Animação · 3 Personagens jogáveis · 4 Inimigos/IA · 5 Combate ·
6 Interativos · 7 Inventário · 8 HUD · 9 Menus · 10 Narrativa · 11 Luz/efeitos · 12 Áudio · 13 Save ·
14 Debug · 15 Build/exportação. Status atualizado em `docs/GUIA_DO_PROJETO.md` do repositório do jogo.

## 4. Construtor de fases: design

### 4.1 Layout

```
┌──────────────────────────────────────────────────────────────┐
│ [Selecionar][Mover][Colisão][Spawn]   ▶ Testar   ↶ ↷   Salvar │
├────────────┬────────────────────────────────────┬────────────┤
│ BIBLIOTECA │                                    │ PROPRIEDADES│
│ Fundos     │          CENÁRIO (canvas)          │ Posição     │
│ Cenário    │       zoom, pan, grid, régua       │ Tamanho     │
│ Itens      │   arrastar da biblioteca → soltar  │ Camada      │
│ Criaturas  │                                    │ Efeitos     │
│ Interativos│                                    │ Comportam.  │
├────────────┴────────────────────────────────────┤ [Código]    │
│ CAMADAS  |  CÓDIGO (Monaco)  |  Console          │             │
└──────────────────────────────────────────────────┴────────────┘
```

Referências: Godot/Unity (inspetor + hierarquia), LDtk (entidades com campos e referências entre elas),
Construct 3 (comportamentos prontos), VS Forms (arrastar → ajustar propriedades → código).

### 4.2 Camadas padrão de uma fase

| Camada | Parallax padrão | Uso |
|---|---|---|
| Fundo 3 (mais distante) | 0.2 | céu, horizonte |
| Fundo 2 | 0.5 | prédios distantes |
| Fundo 1 | 0.8 | estruturas próximas |
| Decoração de trás | 1.0 | objetos não interativos atrás do jogador |
| Terreno e colisão | 1.0 | plataformas, paredes, rampas, plataformas atravessáveis |
| Objetos | 1.0 | itens, interativos, criaturas, spawn |
| Primeiro plano | 1.2 | elementos na frente do jogador |

As camadas podem ser renomeadas, ocultadas, travadas e reordenadas, e o parallax é editável.

### 4.3 Objeto (instância no cenário)

Propriedades base: `id`, `nome`, `asset`, `camada`, `x`, `y`, `escala`, `rotação`, `espelharX/Y`, `opacidade`, `visível`.

Efeitos prontos (cada um com seus parâmetros): **Pulsar** (intensidade, velocidade), **Brilhar** (cor, raio),
**Flutuar** (amplitude, velocidade), **Piscar** (intervalo).

Comportamentos prontos (etapa 4): **Coletável** (item de inventário), **Porta** (requer item X),
**Gatilho** (área que dispara um evento), **Spawner**.

Conexões: um objeto pode referenciar outro (chave → porta, alavanca → plataforma), criadas arrastando no canvas.

Script (opcional): ganchos `aoIniciar`, `aoAtualizar(dt)`, `aoInteragir`, `aoColetar`, `aoEntrarArea`.

### 4.4 Formato da fase (v1)

Definido em `src/core/tipos.ts`. Cada objeto também guarda `w`/`h` (tamanho original da imagem) e `nome`.
`x`/`y` = canto superior esquerdo no espaço da camada. Fases antigas são completadas por `normalizarFase()`.

```json
{
  "versao": 0,
  "nome": "Fase 01 - Laboratório",
  "resolucaoBase": [480, 270],
  "tamanho": [3840, 540],
  "camadas": [
    { "id": "fundo3", "nome": "Fundo 3 (mais distante)", "parallax": [0.2, 0.2], "visivel": true, "travada": false }
  ],
  "objetos": [
    {
      "id": "obj_001", "asset": "assets/itens/chave_vermelha.png", "camada": "objetos",
      "x": 640, "y": 380, "escala": 1, "rotacao": 0, "espelharX": false,
      "efeitos": [{ "tipo": "pulsar", "intensidade": 0.15, "velocidade": 1.5 }],
      "comportamentos": [{ "tipo": "coletavel", "item": "chave_vermelha" }],
      "conexoes": { "abre": "obj_014" },
      "script": null
    }
  ],
  "colisoes": [{ "tipo": "retangulo", "x": 0, "y": 500, "w": 3840, "h": 40, "atravessavel": false }],
  "spawnJogador": [96, 460]
}
```

### 4.5 Etapas

1. Base: canvas, zoom/pan/grid, importar imagens, colocar/mover/redimensionar/espelhar, camadas com parallax, desfazer/refazer, salvar/abrir.
2. Inspetor e efeitos, desenho de colisão, spawn do jogador.
3. ▶ Testar: jogador simples com câmera.
4. Interativos, conexões e painel de código.
5. Integração com o módulo de animação.

### 4.6 Assets em uso e assets de apoio

O jogo só enxerga `jogo/assets/` (caminhos das fases são relativos a `jogo/`). A biblioteca do editor
mostra também o material de apoio, e ao colocar um asset de apoio numa fase o editor o **copia** para
`jogo/assets/<categoria>/` (o original fica onde está). Arquivos editáveis (`.sketchmotion` etc.) nunca entram.

### 4.7 Prévia de parallax

No jogo, um objeto de uma camada aparece em `tela = (x - câmera × parallax) × zoom`. No editor, a prévia calcula a
câmera que o jogo teria com a visão centralizada no mesmo ponto (resolução base, presa dentro da fase) e desloca
cada camada em `câmera_jogo × (1 - parallax)`. O quadro amarelo no cenário é essa câmera. Com a prévia desligada (`P`),
todas as camadas ficam alinhadas como na posição inicial.

### 4.8 Inicialização

1. O Electron abre a **splash** (`splash.html`, janela sem moldura de 620×400, centralizada) e, escondida, a janela do editor.
2. A interface manda o progresso real (`lorex.progresso(...)`): preparar cenário → abrir último projeto → ler biblioteca → montar tela inicial.
3. Ao terminar, `lorex.pronto()` fecha a splash (que fica no mínimo 1,8 s, para não piscar) e mostra o editor maximizado. Se algo travar, o editor aparece sozinho em 15 s.
4. O editor abre na **tela inicial** (projeto, recentes, fases, nova fase). No modo navegador não há splash.

### 4.9 Configuração do projeto

`jogo/projeto.json`: `{ "resolucaoBase": [640, 360], "tamanhoGrade": 16 }`. Definida na tela inicial ao criar uma
fase; as fases novas herdam esses valores, e cada fase guarda os seus (`resolucaoBase`, `tamanhoGrade`).
Padrão: 640×360 (escala ×3 em Full HD), escolhido porque os sprites do Infestação têm frames de 128 px de altura.

### 4.10 Identidade visual

Paleta da logo: verde-noite `#083933`, verde-escuro `#135f4d`, verde `#2ca782`, verde-claro `#65da67`,
lima `#a7dd3e` (cor de destaque e seleção), laranja `#f89715` (tela do jogador, avisos, "não salvo").
Arquivos em `public/marca/` (logos para fundo claro/escuro, ícone `.png`/`.ico`, favicon).

### 4.11 Fases, áreas e regiões

Cada arquivo em `jogo/fases/` é uma **cena**, com `tipo: "fase"` (nível completo) ou `tipo: "area"` (trecho
conectável) e `regiao` (agrupamento livre, ex.: "Laboratório"). As **conexões entre áreas** (saídas/portas que
levam a outra área) virão com a ferramenta de interação, e depois um **mapa do mundo** para ver as áreas lado a lado
(como o modo "world" do LDtk).

### 4.12 Caixa de ferramentas e carimbo

`jogo/projeto.json` guarda `ferramentas: [{ pasta, nome, tipoPadrao }]`. A pasta é relativa à raiz do projeto, e
as imagens dela (incluindo subpastas) viram miniaturas. Clicar numa miniatura arma o **carimbo**: um sprite
"fantasma" segue o mouse na camada ativa (vermelho se a camada estiver travada ou oculta), e cada clique no cenário
cria um objeto centrado no cursor (com encaixe na grade se ativo), com `tipo = tipoPadrao` da ferramenta.

Um clique coloca um objeto, desarma o carimbo e seleciona o objeto novo; `Shift`+clique mantém o carimbo.

### 4.14 Tamanho, escala lembrada e otimização

- O objeto guarda `origem` (a imagem original, relativa à raiz) além de `asset` (o arquivo em `jogo/`).
- `projeto.json → escalas[origem]`: a última escala usada para cada imagem, **relativa ao original**. O carimbo e o
  arrastar da biblioteca reaproveitam. Sem escala lembrada, imagens maiores que a tela do jogo entram reduzidas
  para ~60% da altura da tela.
- **Otimizar** (Electron): `nativeImage.resize({ quality: 'best' })` a partir do original em alta resolução gera
  `jogo/assets/<categoria>/<nome>_<L>x<A>.png`. Os objetos da fase com a mesma imagem e o mesmo tamanho passam a
  usar a cópia com escala 1. `projeto.json → otimizados[origem]` faz o carimbo seguinte já usar a cópia leve.
- **Limpeza:** depois de otimizar (com a fase salva), ou pelo botão "Limpar cópias sem uso" na Biblioteca, as
  imagens de `jogo/assets` que nenhuma fase usa vão para a **Lixeira** (`shell.trashItem`). Se alguma fase estiver
  ilegível, nada é apagado.

**Formato das imagens:** PNG é o formato certo para pixel art (sem perda e com transparência). A otimização que
importa é outra: (1) desenhar os assets na escala de pixel do jogo, sem PNGs gigantes reduzidos no editor;
(2) no build final, juntar as imagens em **atlas de texturas** (módulo 15).

### 4.13 Objeto estático x interativo

`objeto.tipo`: `estatico` (só visual) ou `interativo` (recebe comportamentos na ferramenta de interação). No
editor, os interativos ganham um losango lima no canto.

### 4.15 Efeitos (etapa 2)

`src/core/efeitos.ts` tem os tipos e a função pura `calcularEfeitos(efeitos, t, fase)` → `{ dy, escala, alpha, brilho }`,
que o editor usa na prévia e o jogo vai usar no runtime.

| Efeito | Parâmetros | Como funciona |
|---|---|---|
| pulsar | intensidade (0–50%), velocidade (/s) | escala × (1 + intensidade × onda) |
| brilhar | cor, raio (px), intensidade, pulsar?, velocidade | halo: cópia da imagem em silhueta (ColorMatrixFilter) + BlurFilter, atrás do objeto |
| flutuar | amplitude (px), velocidade | deslocamento vertical em pixels inteiros (não borra a pixel art) |
| piscar | intervalo (s), opacidade mínima | alterna opacidade |

Cada objeto tem uma fase própria (hash do id), para que vários itens não pisquem em sincronia. Os deslizantes registram
no desfazer uma vez por arraste.

### 4.16 Colisão (formas por pontos) e início do jogador

- `fase.colisoes[]`: `{ id, comportamento: 'solido' | 'atravessavel', forma: 'bloco' | 'rampa' | 'poligono' | 'linha', pontos: [x, y][] }`
  no espaço do mundo (parallax 1). Bloco, rampa e polígono são **fechados**; linha é **aberta** (a mão livre vira
  linha, simplificada por Ramer–Douglas–Peucker). Fases do formato antigo (`tipo/x/y/w/h/sobe`) são convertidas
  ao abrir (`normalizarColisoes`).
- Edição (`src/editor/ferramentaColisao.ts`): mover, escalar pela caixa (Shift = proporcional), arrastar vértices,
  duplo clique na borda insere vértice, Alt+clique ou botão direito apaga vértice.
- `fase.spawnJogador = [x, y]`: posição dos **pés** do jogador ao começar.
- Ferramentas (`estado.modo`): `selecionar`, `mao`, `colisao`, `inicio`, na barra lateral (`main.ts → itensTrilho`).
  Novas ferramentas entram nessa lista.

### 4.17 ▶ Testar e física (etapa 3)

`src/core/fisica.ts` (puro, reaproveitado pelo jogo):
- `montarSegmentos(colisoes)` classifica cada borda pela normal para fora: **chão** (normal para cima, até ~60°),
  **teto** e **parede**. Atravessáveis geram só chão de **uma via**. Linhas sólidas geram chão + teto (bloqueiam por baixo).
- `Jogador.passo(dt, entrada, segmentos)`: caixa com os pés em (x, y); horizontal barrado por paredes (raios na frente,
  acima da altura de degrau); vertical com raios para baixo (sobe degraus de até ~16% da altura, acompanha rampas) ou
  para cima (teto). Pulo com altura configurável (`v = √(2·g·h)`), pulo curto ao soltar, *coyote time* 0,1 s e
  *buffer* 0,12 s. Passo fixo de 1/120 s.
- `projeto.json → jogador`: `{ largura, altura, velocidade, alturaPulo, gravidade }`, ajustável ao vivo no HUD do teste.

`src/editor/testar.ts`: bloqueia a edição, põe o zoom inteiro que cabe, centraliza a visão na câmera do jogo
(seguindo o jogador, presa na fase, com suavização), escurece o que fica fora da tela do jogador e desenha o jogador
provisório (retângulo) dentro da camada Objetos. A Lorena animada entra com o módulo de animação.

### 4.18a Comportamentos e interação (etapa 4a)

`src/core/comportamentos.ts` (puro): `objeto.comportamentos = [Comportamento]` (um por objeto, só em interativos):

| Tipo | Campos | No jogo |
|---|---|---|
| coletavel | item, quantidade | some ao encostar e vai para o inventário |
| porta | requer (item, '' = livre), consome, abertaNoInicio | enquanto fechada, a caixa da imagem vira 4 segmentos sólidos; `E` abre |
| alavanca | alvo (id), umaVez | `E` alterna a porta-alvo (abre/fecha) ou mostra/esconde o objeto-alvo |
| saida | destino (arquivo .json) | `E` abre a fase/área de destino e continua o teste lá, levando o inventário |
| mensagem | texto | `E` mostra o texto e pausa o jogo até fechar |

`MundoInterativo` guarda o estado da partida (inventário, portas, visibilidade) e oferece `coletar()`, `proximo()`
(objeto ao alcance + texto do botão), `interagir()` e `segmentosPortas()`. No editor: escolher o alvo da alavanca com
um clique no cenário (`estado.escolhendoAlvo`), e linhas tracejadas mostram as ligações.

### 4.19 Personagens e animação (módulo 2, primeira parte)

- **Formato** `jogo/personagens/<slug>.json`: `{versao, nome, pes:[x,y], caixa:{largura,altura}, escala, olhaDireita,
  animacoes:{<estado>: {folha, larguraQuadro, alturaQuadro, quadros, fps, repetir, escala}}}`. `folha` é relativa à
  raiz do projeto (normalmente `jogo/assets/personagens/<nome>/`). `pes` está em px do quadro da animação Parado;
  `caixa` está em px do jogo (é a caixa da física).
- **Estados** (`core/personagem.ts`): parado, andando, pulando, caindo, aterrissando, dano, morte. `SUBSTITUTOS`
  define o que tocar quando falta uma animação (caindo → pulando → parado; aterrissando → parado etc.).
  `estadoDoJogador()` deriva o estado da física (no chão/velocidade/aterrissou há pouco).
- **Âncora:** `ancoraPes()` converte os pés em frações do quadro, assim animações com quadros de tamanhos diferentes
  ficam presas ao mesmo ponto. O sprite é espelhado quando o lado para onde o jogador olha difere de `olhaDireita`.
- **Detecção da folha** (`ui/personagens.ts`): primeiro por colunas vazias entre desenhos (`quadrosPorColunas`); se a
  folha é múltipla exata da altura (quadros quadrados), usa a maior contagem exata. Pés = centro inferior da união
  dos pixels da animação Parado; caixa = `min(largura, altura×0,4)×0,85` por `altura×0,95`.
- **IPC de dados:** `dados:listar/ler/salvar` limitado à pasta `personagens`; o watcher avisa o tipo `personagem`.
  `projeto.json.personagemTeste` diz qual personagem o ▶ Testar usa; sem ele, o retângulo provisório.
- O protocolo `projeto://` responde com `Access-Control-Allow-Origin: *` para o canvas 2D ler os pixels (detecção).

### 4.20 Animações extras, Animador e Controles

- **Extras:** `animacoes` aceita chaves livres (`chaveAnimacao("Tiro andando")` → `tiro_andando`, sem acento). Campos
  só das extras: `nome`, `travaMovimento`, `aoAndar` (variante quando anda). `Personagem.tipo`: `jogador` | `npc`.
- **Animador** (`core/personagem.ts`, puro): a básica vem do estado (física ou IA) e `tocar(chave, segurar)` põe uma
  extra por cima; as que não repetem acabam após `quadros/fps`; as que repetem duram enquanto a ação estiver
  segurada. `travaMovimento(querAndar)` diz se a entrada de andar é zerada. Serve igual para jogador e NPC.
- **Controles** (`core/controles.ts`, puro): `projeto.json → controles = {acoes: {acao: Atalho[]}, janelaSequencia}`.
  `Atalho = {tipo: tecla|combinacao|sequencia, teclas: code[]}` com `KeyboardEvent.code` (posição física; Shift/Ctrl/Alt
  sem lado). `EntradaJogo`: `apertar/soltar` nos eventos, `atualizar(t)` uma vez por quadro, depois
  `apertou(acao)`/`segurando(acao)`. O atalho mais específico vence e "consome" a tecla (Shift+J não dispara J;
  ↓ › → › J não dispara J). Ações fixas: esquerda, direita, pular, interagir; as demais são chaves de animações extras.
- **▶ Testar:** Esc/F5 saem, F6 reinicia (reservadas). O HUD lista as teclas atuais e mostra a ação tocando.
- **Ímã entre objetos** (`Viewport.encaixarEmObjetos`): ao mover/carimbar, compara bordas e centros (esq./dir./centro e
  topo/base/centro) com os vizinhos da MESMA camada que estejam perto no outro eixo; tolerância 8 px de tela; o encaixe
  pode deixar posição fracionária para a continuação ser exata. Copiar/colar e continuação ficam em `main.ts`.
- **Rolagem do cenário:** barras DOM sobre o canvas; faixa navegável = fase + meia tela de folga em cada lado.

### 4.21 Código (etapa 4b): scripts, ganchos e painel

- **Arquivos:** `jogo/scripts/*.js` (módulos ES). Donos: `jogo.js` (global), `<fase>.js` (`fase.script`),
  `<fase>.<idObjeto>.js` (`objeto.script`), `personagem.<nome>.js` (`personagem.script`). Objetos copiados
  compartilham o script (o explorador mostra "compartilhado com N").
- **`core/scripts.ts`:** lista de GANCHOS (nome, donos, parâmetros, texto), modelo de script, compilação por
  `import()` de um `blob:` (CSP `script-src 'self' blob:`; sem eval) e `tiposApi(contexto)` — declarações que mudam com o
  projeto (uniões de nomes de objetos, ações, animações, fases e itens) para o autocompletar.
- **`editor/motorScripts.ts`:** roda no ▶ Testar. API `jogo` (jogador, inventário, hud, variáveis, objeto(), objetos(),
  aviso, mensagem, irPara, apertou/segurando, esperar, log) e `eu` (objeto ou jogador). Erros vão para `SAIDA` com a
  linha (pela pilha do blob) e desligam só o gancho que falhou. `MundoInterativo` ganhou deslocamentos (objetos movidos
  pelo código), interagíveis por código (`aoInteragir`), `podeColetar` (`aoColetar`) e `acionado` (alavanca → `aoAcionado`).
- **`ui/codigo/`:** `painel.ts` (explorador por **fontes** registradas em `main.ts`, abas, API, Saída) e `monaco.ts`
  (Monaco carregado sob demanda; workers via `?worker`; tema Lorex; checkJs).
- **REGRA:** todo módulo novo que crie algo programável registra uma fonte no painel (`painelCodigo.registrarFonte`),
  acrescenta seus ganchos em `GANCHOS` e sua API em `tiposApi()`/`motorScripts`. Assim o código acompanha o projeto.

### 4.22 Log (registro único)

- **`core/log.ts`:** `LOG.add({cat, texto, arquivo?, linha?})` com categorias entrada, personagem, mundo, código, erro e
  sistema (editor). `iniciarTeste()`/`terminarTeste()` marcam o tempo do teste e devolvem o texto completo, que o
  editor grava via IPC `logs:salvar` em `<projeto>/logs/` (fora do Git). Erros globais (`error`, `unhandledrejection`)
  e todo `estado.avisar()` também entram. A Saída do painel de Código é um filtro do mesmo registro (código + erros).
- **`ui/log.ts`:** painel na linha `log` do grid (abaixo do cenário; o canvas se ajusta via ResizeObserver), filtros,
  busca, altura arrastável, preferências em localStorage; erros com script abrem o painel de Código na linha.
- **REGRA:** todo módulo novo registra seus eventos no LOG, só quando algo muda (nada a cada quadro).

### 4.23 Inimigos, arma e HUD

- **Dados:** `Personagem.inimigo` (NPC) = `ConfigInimigo` (comportamento, vida, visão, perderVisao, velocidades,
  alcanceAtaque **borda a borda**, intervalo, ataques[{animacao, peso, dano, agarra}], alertaTiro, audicaoTiro,
  momentoDano). `Personagem.arma` (jogador) = `ConfigArma`. `Fase.inimigos[] = {id, personagem, x, y, olhandoDireita}`.
  `projeto.json.hud = {elementos[]}` (core/hud.ts: âncoras de 9 posições + distância).
- **IA** (`core/inimigos.ts`, pura): `IAInimigo.passo(dt, ctx)` → decisão (mover, velocidade, olhar) + eventos (estado,
  viu, perdeu, atacou, acertou{segurar}, errou, alerta, morreu). Estados: perambular (anda/para ao acaso, vira na beirada
  ou parede), perseguir (desiste além de perderVisao), alerta (vai ao ponto do tiro por alertaTiro s), atacar (dano no
  momentoDano se ainda no alcance), dano, morto. `sortearAtaque` usa os pesos.
- **Teste** (`editor/inimigosTeste.ts` + `testar.ts`): corpo com a mesma física (`Jogador`), `podeAndar` (chão à frente,
  sem parede), `raioTiro` (tiro instantâneo, paredes param), animação por estado (morte para no último quadro), flash
  vermelho no acerto, rastro do tiro. Golpe empurra o jogador; agarrão prende até o fim (solta se o zumbi levar tiro).
- **Editor:** modo `inimigo` (N) com barra de tipo; viewport desenha o 1º quadro do Parado, gruda no chão ao arrastar;
  painel de propriedades do inimigo; ferramenta HUD (`ui/hud.ts`).
- **Código:** dono `inimigo` (script do TIPO, compartilhado), ganchos aoVer/aoPerder/aoAtacar/aoLevarDano/aoMorrer;
  personagem ganha aoAtirar/aoSerAtingido; API `jogo.inimigos()/inimigo(id)`, `Inimigo` (vida, estado, perseguir,
  parar, liberar, dano, matar, dados), `jogador.arma`; autocompletar com ids dos inimigos e chaves do HUD.
- **Log:** categoria `inimigo`.

### 4.18 Legendas e recarregar por fora

- `src/ui/legenda.ts`: `dica(el, título, texto, atalho)` + conversão automática de `title`. O cenário mostra legendas
  de objetos, colisões, vértices e da bandeira (`viewport.aoPairar`). **Regra:** toda função nova ganha legenda.
- `electron/main.cjs → observarProjeto()`: `fs.watch` recursivo em `jogo/`. Ignora as escritas do próprio editor
  (janela de 2 s) e avisa a interface (`projeto:mudou`): fase aberta → recarrega (ou pergunta, se houver alteração não
  salva); assets → recarrega a biblioteca; `projeto.json` → recarrega a configuração.

## 5. Estrutura do código

```
electron/main.cjs        processo principal: janela, protocolo projeto://, IPC de arquivos (listar, copiar, salvar)
electron/preload.cjs     ponte segura (window.lorex)
splash.html + src/splash/ splash de inicialização
src/main.ts              monta a tela, barra, atalhos, abrir/salvar, fluxo de inicialização
src/core/                formato de dados da fase (tipos, criação, normalização) e efeitos (puros, reaproveitados pelo jogo)
src/editor/estado.ts     estado central + eventos + desfazer/refazer (snapshots JSON)
src/editor/viewport.ts   cenário PixiJS: câmera, camadas, grade, seleção, mouse, efeitos ao vivo
src/editor/colisoes.ts   geometria e desenho das colisões e da bandeira de início
src/editor/ferramentaColisao.ts  ferramenta Colisão (desenhar e editar formas)
src/editor/testar.ts     modo ▶ Testar (HUD, câmera, entrada)
src/core/fisica.ts       física de plataforma (pura)
src/plataforma/          acesso a arquivos: Electron (disco) ou navegador (demo)
src/ui/                  painéis: tela inicial, caixa de ferramentas, biblioteca, camadas, propriedades, diálogos, ícones
public/demo-projeto/     projeto de demonstração com assets genéricos (para portfólio e testes)
```

## 6. Questões em aberto

- Colisão por retângulos/polígonos desenhados (cenários pintados à mão) ou por tiles; provavelmente a primeira.
