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

## 5. Estrutura do código

```
electron/main.cjs        processo principal: janela, protocolo projeto://, IPC de arquivos (listar, copiar, salvar)
electron/preload.cjs     ponte segura (window.lorex)
splash.html + src/splash/ splash de inicialização
src/main.ts              monta a tela, barra, atalhos, abrir/salvar, fluxo de inicialização
src/core/                formato de dados da fase (tipos, criação, normalização)
src/editor/estado.ts     estado central + eventos + desfazer/refazer (snapshots JSON)
src/editor/viewport.ts   cenário PixiJS: câmera, camadas, grade, seleção, mouse
src/plataforma/          acesso a arquivos: Electron (disco) ou navegador (demo)
src/ui/                  painéis: tela inicial, caixa de ferramentas, biblioteca, camadas, propriedades, diálogos, ícones
public/demo-projeto/     projeto de demonstração com assets genéricos (para portfólio e testes)
```

## 6. Questões em aberto

- Colisão por retângulos/polígonos desenhados (cenários pintados à mão) ou por tiles; provavelmente a primeira.
