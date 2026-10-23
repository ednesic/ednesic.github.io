# Va'a

Jogo de corrida de V1 (va'a de uma pessoa, sem leme) em 3D que roda no navegador. Você rema contra três canoas rivais em lugares famosos do mundo para remar, e vence quem lê melhor a onda, o vento, o equilíbrio e o próprio fôlego.

## Como jogar

O jogo usa módulos JavaScript, então precisa ser servido por HTTP (abrir o arquivo direto não funciona):

```sh
npm start          # serve a pasta em http://localhost:8080
```

Precisa de internet para carregar o three.js do cdnjs. Não há etapa de build.

- **A / D** (ou as setas) remam pela esquerda ou pela direita. No celular, use os botões na parte de baixo.
- Segure **W** para a remada forte (rápida, gasta muita stamina) ou **S** para a longa (mais tempo de água, economiza). Sem nada, é a média. As teclas 1, 2 e 3 fixam o tipo.
- Segure **Shift** e reme para a remada diagonal, que vira bem a canoa devagar. Quanto mais rápida a canoa, mais força ela pede; na onda quem direciona é a espetada.
- **Arrasto do ama:** o ama, do lado esquerdo, arrasta na água: freia um pouco e puxa a proa para a esquerda. Para seguir reto, reme um pouco mais pela esquerda. Apoiado na água ele arrasta mais; levantado, quase nada.
- **Espetada:** segure **Q** (esquerda) ou **E** (direita), o botão Espeta, ou segure a própria remada, para cravar a pá na água. A pá trava na água: segura o giro da canoa (uma boa travada, não total), freia um pouco e, como arrasta só daquele lado, puxa a proa para o lado espetado, mais forte quanto mais rápido você vem (na onda ou no embalo). A pá fica atrás do quadril, junto da popa. Devagar ela quase não faz nada. Se a onda está jogando a proa para a direita, espete na esquerda.
- Alternar os lados num ritmo constante rende mais.
- **Desistir** (ou Esc duas vezes) volta para a tela inicial.

## Jogar online

**Jogar online** na tela inicial. Um jogador cria a sala e recebe um código de 4 letras (ou um link `?sala=CODE` pelo botão Copiar convite); os amigos entram com o código. Cabem até 6 remadores. Quem criou a sala escolhe o lugar, as condições e se as vagas livres vão para os adversários, e larga para todos.

Não há servidor próprio: os navegadores se ligam direto por WebRTC, com o [PeerJS](https://peerjs.com) (carregado do jsdelivr só quando alguém abre a tela online). O servidor público e gratuito do PeerJS só apresenta os navegadores um ao outro. O navegador de quem criou a sala é a sala: os outros se conectam só a ele, e ele repassa as canoas de cada um aos demais.

O mar, o vento e os obstáculos saem da semente da corrida, então cada tela calcula o mesmo mar sozinha. Cada jogador simula só a própria canoa (quem criou a sala também os adversários) e manda a posição umas 15 vezes por segundo; as canoas dos outros deslizam entre uma mensagem e outra. Corridas online não contam para o recorde da pista.

A rede fica em `src/net/`: `room.js` (sala, códigos e mensagens, sem depender do PeerJS), `peer.js` (a ligação pelo PeerJS) e `sync.js` (o que cada canoa manda e como a canoa remota anda). Para trocar o PeerJS por outro meio (Firebase, servidor próprio), basta outro objeto com a mesma interface de `peer.js`.

## Fatores da corrida

- **Vento:** empurra, faz derivar e, de través, puxa a proa para o vento. Rajadas em manchas correm pelo mar (água mais escura e crespa); fiapos no ar e bandeiras nas bóias mostram a direção.
- **Onda:** o mar é uma soma de ondas reais e a canoa sente a gravidade na superfície. Quando a onda chega por trás, remando forte você entra nela e surfa. A onda empurra a popa e gira a canoa: quem entra torto é atravessado e precisa da espetada do lado oposto para segurar o giro. Descendo rápido demais, a proa enterra nas costas da onda da frente.
- **Vento:** sorteado a cada largada dentro da faixa da pista, com rajadas. O mar de vento segue a direção e a força do vento.
- **Equilíbrio:** o ama fica à esquerda. Onda e vento vindos da esquerda e curvas para a esquerda levantam o ama; passou do limite, é huli. Remar pela direita apoia. Ama afundado deixa a canoa pesada.
- **Stamina:** cada remada cansa, ritmo acelerado cansa mais. Cansado, a remada perde força. Recupera parando ou surfando.

## Som

Todo o som é sintetizado na hora (Web Audio), sem arquivos. O mar cresce com as ondas e a cada ondulação que passa; o casco chia mais alto e mais agudo quanto mais rápido; surfando entra o ronco da onda. O vento vem do lado de onde sopra e assobia quando está forte. Chuva, praia quebrando (Copacabana) e recife (Hawaiki Nui) mudam o ambiente, com gaivotas ao longe. Cada remada tem entrada, puxada e saída com respingos (a diagonal varre para fora), a espetada chia enquanto a pá está cravada, o iako range quando o ama levanta, o remador ofega sem fôlego, e no huli tudo fica abafado debaixo da canoa. A largada e a chegada são com pū (concha). Dá para ouvir os rivais remando perto. O botão Som liga e desliga e fica salvo.

## Pistas

| Pista | Lugar | Nível |
|---|---|---|
| Copacabana | Rio de Janeiro, do Forte ao Leme, com o Pão de Açúcar à frente e a ondulação quebrando na praia | Fácil |
| Hawaiki Nui | Polinésia Francesa, etapa Raiatea → Taha'a | Médio |
| Ka'iwi Channel | Havaí, rota da Molokai Hoe | Difícil |

As distâncias são versões compactas das rotas reais.

## Estrutura

```
index.html            marcação da página
css/style.css         estilos
src/
  utils.js            utilitários e gerador aleatório com semente
  strokes.js          tipos de remada (média, forte, longa, diagonal)
  sea.js              sorteio de vento e ondas; altura e inclinação da água
  canoe.js            física da V1: remada, espetada, onda, vento, equilíbrio, stamina, huli
  ai.js               rivais (usam a mesma física e só decidem as remadas)
  race.js             uma corrida: largada, obstáculos, chegada, classificação
  audio/              som sintetizado: mix.js (níveis do ambiente, testável no Node) e sound.js (Web Audio)
  tracks/             uma pista por arquivo
  render/             cena 3D (three.js): mar, cenário, canoas, câmera
  net/                partida online: sala por código, ligação PeerJS, sincronia das canoas
  ui/                 HUD, controles e tela online
  main.js             liga tudo e roda o loop
test/                 testes da simulação (node --test)
```

A simulação (`sea`, `canoe`, `ai`, `race`) não depende do navegador nem do three.js, então dá para testar no Node.

## Testes

```sh
npm test
```

Rodam no GitHub Actions a cada push e pull request.

## Nova pista

Crie um arquivo em `src/tracks/` copiando um dos existentes, registre em `src/tracks/index.js` e adicione o cenário em `src/render/scenery.js` com a mesma `id`.

## Próximos passos

- Provas com curva de bóia, inspiradas em provas reais.
- Pistas modeladas a partir do mapa real (ex.: volta no Pão de Açúcar).

## Remador

O corpo do remador é `assets/paddler.glb`, gerado por `tools/make_paddler.py` a partir do MakeHuman (malha, morphs, esqueleto e pesos, todos CC0): um homem fictício, jovem e atlético, com o esqueleto reduzido aos ossos que o jogo anima. Para gerar de novo: `python3 tools/make_paddler.py`. Se o modelo não carregar, o jogo usa o remador simples.

