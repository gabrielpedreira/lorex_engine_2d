<p align="center"><img src="public/marca/logo-fundo-claro.png" alt="Lorex Engine" width="420"></p>

# Lorex Engine 2D

Motor e editor visual 2D próprios, criados para construir o jogo **Infestação** (plataforma 2D em pixel art).

A ideia é ter um editor no estilo "Visual Studio para Forms" aplicado a jogos: arrastar assets para o cenário,
ajustar tudo em um painel de propriedades, ativar efeitos prontos (pulsar, brilhar...) e, quando necessário,
escrever código para o comportamento de cada objeto. Tudo testável na hora com o botão ▶.

## Status

🟨 **Construtor de Fases: etapas 1–3 e 4a prontas** (cenário, camadas, caixa de ferramentas, efeitos, colisões
desenhadas à mão, início do jogador, **▶ Testar** com física de plataforma e **comportamentos interativos**).
Próximo: 4b, painel de código por objeto.

## Como rodar

Requisitos: [Node.js](https://nodejs.org) 20 ou superior.

```powershell
npm install
npm run dev
```

- `npm run dev`: abre o editor (Electron) com recarga automática ao mudar o código.
- **Atalho na área de trabalho (Windows):** rode uma vez `powershell -ExecutionPolicy Bypass -File scripts\criar-atalho.ps1`.
  O atalho "Lorex Engine 2D" (com o ícone da engine) abre o editor sem janela de terminal; fechar a janela encerra
  tudo. Se a engine já estiver aberta, o atalho só traz a janela para a frente. A saída fica em `lorex.log`.
- `npm run web`: abre só no navegador (http://127.0.0.1:5173) usando o **projeto de demonstração** em
  `public/demo-projeto` (assets genéricos).
- `npm run build`: verifica os tipos e gera a versão final em `dist/`.

Na primeira vez, clique no ícone de pasta e escolha a pasta do projeto do jogo. O editor lembra a última pasta aberta.

## O que o editor faz hoje

- **Splash de inicialização** (logo, status real do carregamento, créditos e licença) enquanto o editor carrega.
- **Tela inicial**: projeto atual e recentes, fases do projeto e criação de fase com a **resolução do jogo**
  (formato de pixels: 320×180, 480×270, 640×360, 960×540 ou personalizada), grade (8/16/32 px), tamanho em
  telas e cor de fundo. A resolução e a grade ficam salvas em `jogo/projeto.json` e valem para as fases novas.
  O ícone da Lorex na barra superior volta para essa tela.

- **Fases e áreas**: além de fases completas, dá para criar **áreas conectáveis** (trechos do mundo que se ligam
  a outras áreas, estilo metroidvania), agrupadas por **região** na tela inicial.
- **Caixa de ferramentas** (painel esquerdo, recolhível com `T`): escolha pastas do projeto; cada uma vira uma
  ferramenta com as miniaturas das imagens. Clique numa miniatura e depois no cenário para **carimbar** o elemento
  na camada ativa (com prévia fantasma; continua carimbando até `Esc` ou botão direito). Cada ferramenta define se
  os objetos são **estáticos** ou **interativos**.
- **Tamanho livre**: de muito grande a muito pequeno, pelas 4 alças (proporcional; `Shift` = valores redondos), por
  `[` / `]`, `Alt`+roda, ou digitando %, largura ou altura em px. Imagens maiores que a tela entram reduzidas, e
  a engine **lembra o tamanho** usado para cada imagem.
- **Otimizar imagem**: se a imagem aparece bem menor do que é, a engine gera em `jogo/assets` uma cópia
  reduzida exatamente no tamanho usado (o original de apoio fica intacto) e manda para a Lixeira as cópias grandes
  que ficaram sem uso.
- **Efeitos** (painel de propriedades): **pulsar**, **brilhar** (halo colorido), **flutuar** e **piscar**, cada um
  com seus ajustes e prévia animada no cenário (liga/desliga com `Shift+E`).
- **Barra de ferramentas lateral** (estilo Photoshop): Selecionar, Mover a visão, Elementos, Colisão, Início e
  ▶ Testar. Todo botão, ferramenta e objeto tem **legenda ao passar o mouse** explicando o que é e como usar.
- **Colisão** (ferramenta `C`): desenhe por cima da arte com **bloco**, **rampas** ◢◣, **polígono** (clique a
  clique), **linha** (superfícies) e **mão livre** (traço simplificado automaticamente). Cada forma é **sólida** ou
  **atravessável**. Para modelar: arraste para mover, alças dos cantos para aumentar ou diminuir, bolinhas
  (vértices) para modelar, duplo clique numa borda cria vértice, Alt+clique apaga. `Shift+C` mostra/oculta.
- **▶ Testar** (`F5`): jogue a fase dentro do editor. Um jogador provisório anda (setas ou A/D) e pula (Espaço/W/↑)
  sobre as colisões, com pulo de altura variável, *coyote time*, *buffer* de pulo, rampas, degraus e plataformas
  atravessáveis. A câmera segue o jogador, com parallax real e a área fora da tela escurecida. Velocidade, pulo,
  gravidade e tamanho se ajustam ao vivo e ficam salvos no projeto.
- **Comportamentos** (objetos interativos, painel de propriedades): **coletável** (vai para o inventário),
  **porta** (sólida enquanto fechada; pode exigir e gastar um item), **alavanca/botão** (aciona outro objeto,
  escolhido com um clique no cenário; a ligação aparece como linha tracejada), **saída** (leva para outra fase ou área,
  levando o inventário) e **mensagem/nota** (texto na tela). No ▶ Testar: `E` interage, com aviso "E Abrir/Ler/Entrar"
  sobre o objeto e inventário no canto.
- **Personagens** (`K`): monte um personagem a partir de spritesheets, um por estado (Parado, Andando, Pulando,
  Caindo, Aterrissando, Dano, Morte). O editor detecta os quadros pela folha (inclusive quadros não quadrados e
  desenhos com espaços), lê o FPS do nome (`_8fps`), mostra a prévia animada com chão, cruz dos pés e caixa de
  colisão, e detecta pés e caixa sozinho. Estados sem animação usam um substituto (ex.: Caindo → Pulando → Parado).
  Salvo em `jogo/personagens/<nome>.json`; "Usar no ▶ Testar" troca o retângulo provisório pelo personagem animado.
- **Trabalho a quatro mãos:** se uma fase é alterada fora do editor (por outra ferramenta ou pelo assistente), o
  editor recarrega sozinho ou, havendo alterações não salvas, pergunta antes.
- **Início do jogador** (ferramenta `I`): bandeira na posição dos pés da personagem, arrastável.
- **Biblioteca**: lista as imagens do projeto em "Em uso no jogo" (`jogo/assets`) e no material de apoio (resto
  da pasta). Ao colocar um asset de apoio numa fase, ele é **copiado** para `jogo/assets/<categoria>/`.
- **Cenário**: zoom em níveis inteiros (pixel art nítida), grade de 16 px, quadro amarelo mostrando a **tela do
  jogador** (resolução base) e **prévia de parallax** simulando a câmera do jogo.
- **Camadas**: Fundo 3 (mais distante) → Primeiro plano, com parallax editável, ocultar, travar e renomear.
- **Objetos**: estático ou interativo (losango lima no cenário), arrastar da biblioteca ou duplo clique (centro da camada ativa), mover, redimensionar pela alça
  (passos de 0,25; Shift = livre), espelhar, girar, opacidade, ordem, duplicar, excluir.
- **Fases**: nova, abrir, salvar (`jogo/fases/*.json`), desfazer/refazer.

### Atalhos

| Ação | Atalho |
|---|---|
| Zoom | roda do mouse, `+` / `-` |
| Mover a visão | Espaço + arrastar, ou botão do meio |
| Enquadrar a fase | `Home` |
| Desfazer / refazer | `Ctrl+Z` / `Ctrl+Y` |
| Salvar / nova fase | `Ctrl+S` / `Ctrl+N` |
| Duplicar / excluir | `Ctrl+D` / `Del` |
| Espelhar | `F` |
| Mover 1 px (8 px) | setas (Shift + setas) |
| Grade / encaixar / prévia de parallax | `G` / `E` / `P` |
| Ferramentas: selecionar / mover a visão / colisão / início | `V` / `H` / `C` / `I` |
| Forma de colisão | `1` bloco · `2` rampa ◢ · `3` rampa ◣ · `4` polígono · `5` linha · `6` mão livre |
| Sólido ↔ atravessável (modo Colisão) | `X` |
| Polígono/linha: terminar · desfazer ponto · cancelar | `Enter` ou duplo clique · `Backspace` · `Esc` |
| Personagens | `K` |
| ▶ Testar / voltar | `F5` / `Esc` (no teste: `E` interage, `R` reinicia) |
| Mostrar colisões / prévia de efeitos | `Shift+C` / `Shift+E` |
| Mostrar/ocultar caixa de ferramentas | `T` |
| Carimbar e continuar | `Shift` + clique |
| Cancelar o carimbo | `Esc` ou botão direito |
| Diminuir / aumentar o objeto | `[` / `]` (Shift: 1%) ou `Alt` + roda |

## Stack

TypeScript · PixiJS 8 · Electron · Vite

## Documentação

- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md): arquitetura, módulos e design do editor

## Autor

Gabriel Pedreira
