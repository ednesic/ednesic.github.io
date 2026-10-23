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
- Segure **Shift** e reme para a remada diagonal, que vira bem a canoa.
- **Espetada:** segure **Q** (esquerda) ou **E** (direita) para cravar a pá na água como leme. A canoa vira para o lado da pá e freia um pouco; é o que segura a V1 reta na onda. No celular, segure o botão do lado.
- Alternar os lados num ritmo constante rende mais.
- **Desistir** (ou Esc duas vezes) volta para a tela inicial.

## Fatores da corrida

- **Onda:** o mar é uma soma de ondas reais e a canoa sente a gravidade na superfície. Quando a onda chega por trás, remando forte você entra nela e surfa. A onda empurra a popa e gira a canoa: quem entra torto é atravessado e precisa da espetada para alinhar. Descendo rápido demais, a proa enterra nas costas da onda da frente.
- **Vento:** sorteado a cada largada dentro da faixa da pista, com rajadas. O mar de vento segue a direção e a força do vento.
- **Equilíbrio:** o ama fica à esquerda. Onda e vento vindos da esquerda e curvas para a esquerda levantam o ama; passou do limite, é huli. Remar pela direita apoia. Ama afundado deixa a canoa pesada.
- **Stamina:** cada remada cansa, ritmo acelerado cansa mais. Cansado, a remada perde força. Recupera parando ou surfando.

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
  tracks/             uma pista por arquivo
  render/             cena 3D (three.js): mar, cenário, canoas, câmera
  ui/                 HUD e controles
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
