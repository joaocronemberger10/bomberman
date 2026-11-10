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

- Enquanto o arquivo não existir, o jogo usa um personagem provisório e funciona normalmente.
- O modelo é redimensionado sozinho para caber em uma célula. Para ajustar, edite `src/config.js`:
  - `PLAYER_MODEL_PATH`: caminho do arquivo.
  - `PLAYER_SCALE`: escala extra (1 = tamanho padrão).
  - `PLAYER_ROTATION_OFFSET`: use `Math.PI` se o personagem aparecer de costas.
- As animações são encontradas pelo nome, sem diferenciar maiúsculas: `idle`, `walk`/`run` e `death`/`die`.
  Se o arquivo tiver uma única animação, ela é usada para andar. O que faltar é animado por código.

## Controles

| Ação   | Teclado          | Celular                 |
| ------ | ---------------- | ----------------------- |
| Mover  | Setas ou WASD    | Joystick à esquerda     |
| Bomba  | Espaço           | Botão de bomba à direita |
| Pausar | P ou Esc         | Botão ⏸ no topo         |

Elimine todos os inimigos para abrir a saída, que fica escondida sob um dos blocos.

## Estrutura

```
index.html        página, HUD, telas e import map do Three.js
style.css         estilos (responsivo, tela cheia)
src/config.js     TODOS os parâmetros do jogo (arena, pavio, velocidades, pontuação)
src/game.js       cena, câmera, regras e laço principal
src/map.js        arena: grade, paredes, blocos e porta de saída
src/player.js     jogador: modelo GLB, animações e movimento
src/bombs.js      bombas, explosões e reação em cadeia
src/enemies.js    inimigos e IA
src/powerups.js   power-ups
src/particles.js  partículas das explosões
src/audio.js      sons gerados com WebAudio
src/input.js      teclado e controles de toque
src/mover.js      movimento em grade com deslizamento suave
src/ui.js         HUD, telas e avisos
assets/models/    coloque aqui o player.glb
assets/sounds/    reservado (os sons atuais são gerados por código)
```
