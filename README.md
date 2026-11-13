# Boom Arena

Jogo de arena com bombas em 3D para navegador, feito com HTML + JavaScript puro (módulos ES) e
[Three.js](https://threejs.org/) via CDN. Não tem build, npm nem terminal: basta servir os arquivos.

## Como publicar no GitHub Pages

1. No repositório, abra **Settings > Pages**.
2. Em **Build and deployment > Source**, escolha **Deploy from a branch**.
3. Em **Branch**, selecione **main** e a pasta **/ (root)**, e clique em **Save**.
4. Aguarde cerca de um minuto. O jogo ficará em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

> O código precisa estar no branch escolhido. Se ele ainda estiver em outro branch, leve-o para o
> `main` primeiro (ou selecione esse outro branch no passo 3).
> Abrir o `index.html` direto do disco (`file://`) não funciona, porque módulos ES exigem um servidor.

## Onde colocar o personagem (`player.glb`)

Salve o modelo exportado do Meshy (formato **GLB**, com animações) em:

```
assets/models/player.glb
```

- O repositório já traz um `player.glb` (gerado no Meshy, com as animações `Idle`, `Walk` e `Death`).
  Para trocar de personagem, basta substituir o arquivo.
- Se o arquivo não existir, o jogo usa um personagem provisório e funciona normalmente.
- O modelo é redimensionado sozinho para caber em uma célula. Para ajustar, edite `src/config.js`:
  - `PLAYER_MODEL_PATH`: caminho do arquivo.
  - `PLAYER_SCALE`: escala extra (1 = tamanho padrão).
  - `PLAYER_ROTATION_OFFSET`: use `Math.PI` se o personagem aparecer de costas.
- As animações são encontradas pelo nome, sem diferenciar maiúsculas: `idle`, `walk`/`run` e `death`/`die`.
  Se o arquivo tiver uma única animação, ela é usada para andar. O que faltar é animado por código.

### Rivais

Os rivais usam modelos próprios em `assets/models/` (caminhos em `ENEMY_MODEL_PATHS`, no
`src/config.js`) e só precisam de uma animação de caminhada:

| Arquivo | Comportamento | Aparece |
| ------- | ------------- | ------- |
| `enemy_flamengo.glb` | básico | desde a fase 1 |
| `enemy_fluminense.glb` | mais rápido | a partir da fase 2 |
| `enemy_botafogo.glb` | persegue o jogador | a partir da fase 3 |

Se um arquivo faltar, aquele rival usa um boneco provisório. A altura dos modelos se ajusta em
`ENEMY_HEIGHT` (rivais) e `PLAYER_HEIGHT` (jogador).

## Como se joga

Elimine todos os rivais e monstros para abrir a saída, que fica escondida sob um dos blocos.
São **12 fases** e o cenário muda a cada uma, passando por 6 cenários (Gramado, Deserto,
Geleira, Noite Neon, Doceria e Vulcão) duas vezes. A cada fase há mais inimigos, mais rápidos e
com bombas mais fortes. Vencer a fase 12 zera o jogo.

Cada cenário tem um perigo próprio:

| Cenário | Perigo |
| ------- | ------ |
| Gramado | poças de lama: quem pisa anda devagar |
| Deserto | espinhos que sobem da areia de tempos em tempos |
| Geleira | poças de gelo: quem entra escorrega sem controle |
| Noite Neon | lasers que piscam (aviso) e depois ligam ao longo de corredores |
| Doceria | balas gigantes que rolam pela arena |
| Vulcão | bolas de fogo que caem do céu, com aviso no chão, e destroem blocos |

Lama e gelo afetam todos. Espinhos, lasers e balas ferem o jogador e eliminam rivais. As bolas de
fogo atingem qualquer um. Na segunda volta (fases 7 a 12) os perigos são mais numerosos.

- **Rivais** soltam bombas perto de blocos, do jogador e dos monstros, e fogem das explosões.
- **Monstros** atacam qualquer um: o contato fere o jogador e elimina rivais.
  - Gosma: anda devagar (desde a fase 1).
  - Fantasma: atravessa blocos (a partir da fase 4).
  - Touro: dispara em linha reta ao ver alguém (a partir da fase 7).
- **Itens** saem de alguns blocos destruídos: +1 bomba, +1 alcance, +velocidade, +1 vida e as
  bombas especiais, que vêm com munição limitada:
  - Remota: só explode quando você manda.
  - Perfurante: a chama atravessa vários blocos em linha.
  - Mega: a chama vai até a parede.

Durante a partida a câmera se aproxima e acompanha o jogador; na tela inicial mostra a arena
inteira. A aproximação se ajusta em `CAMERA_ZOOM` (tela deitada/computador),
`CAMERA_ZOOM_PORTRAIT` (celular em pé) e `CAMERA_PLAY_TILT` (inclinação), no `src/config.js`.

O conteúdo de cada fase fica na função `levelSetup()` e as cores dos cenários em `THEMES`,
ambos em `src/config.js`.

## Controles

| Ação   | Teclado          | Celular                 |
| ------ | ---------------- | ----------------------- |
| Mover  | Setas ou WASD    | Joystick à esquerda     |
| Bomba  | Espaço           | Botão de bomba à direita |
| Detonar bomba remota | E | Botão DETONAR (aparece quando há bomba remota) |
| Pausar | P ou Esc         | Botão ⏸ no topo         |

## Estrutura

```
index.html        página, HUD, telas e import map do Three.js
style.css         estilos (responsivo, tela cheia)
src/config.js     TODOS os parâmetros do jogo (arena, pavio, velocidades, fases, cenários)
src/game.js       cena, câmera, regras e laço principal
src/map.js        arena: grade, paredes, blocos e porta de saída
src/player.js     jogador: modelo GLB, animações e movimento
src/bombs.js      bombas, explosões e reação em cadeia
src/enemies.js    rivais (modelos GLB), monstros e IA
src/hazards.js    perigos de cada cenário (lama, espinhos, gelo, lasers, balas, bolas de fogo)
src/model.js      ajuste de tamanho dos modelos GLB
src/powerups.js   power-ups
src/particles.js  partículas das explosões
src/audio.js      efeitos sonoros gerados com WebAudio
src/music.js      música de fundo gerada por código, uma por fase
src/input.js      teclado e controles de toque
src/mover.js      movimento em grade com deslizamento suave
src/ui.js         HUD, telas e avisos
assets/models/    player.glb e os modelos dos inimigos
assets/sounds/    reservado (sons e músicas atuais são gerados por código)
assets/icons/     ícones do app
assets/ui/        arte da tela de entrada
```
