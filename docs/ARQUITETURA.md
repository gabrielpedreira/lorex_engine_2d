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
| Interface do editor | HTML/CSS (+ framework leve, a definir) | montar painéis é rápido na web |
| Painel de código | Monaco Editor | o mesmo editor do VS Code, com autocomplete |
| App desktop | Tauri **ou** Electron (decidir na etapa 1) | acesso a arquivos locais e executável final |
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

### 4.4 Formato da fase (rascunho v0)

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

## 5. Questões em aberto

- Tauri (mais leve; usa Rust, que o Gabriel já tem instalado) ou Electron (mais simples, só JS).
- Resolução base do jogo (480×270? 640×360?), a definir conforme o tamanho dos sprites.
- Colisão por retângulos/polígonos desenhados (cenários pintados à mão) ou por tiles; provavelmente a primeira.
