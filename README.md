# Va'a

Jogo de corrida de canoa havaiana (OC1) em 3D que roda no navegador. Você rema contra três canoas rivais em lugares famosos do mundo para remar, e vence quem lê melhor a onda, o vento, o equilíbrio e o próprio fôlego.

## Como jogar

Abra `index.html` no navegador (precisa de internet para carregar o three.js do cdnjs). Não precisa instalar nada.

- **A / D** (ou as setas) remam pela esquerda ou pela direita. No celular, use os botões na parte de baixo.
- Segure **W** para a remada forte (rápida, gasta muita stamina) ou **S** para a longa (mais tempo de água, economiza). Sem nada, é a média. As teclas 1, 2 e 3 fixam o tipo.
- Segure **Shift** e reme para a remada diagonal, que vira bem a canoa.
- Alternar os lados num ritmo constante rende mais.

## Fatores da corrida

- **Onda:** o mar é uma soma de ondas reais e a canoa sente a gravidade na superfície. Quando a onda chega por trás aparece a **caçada**: remando forte você entra nela e surfa. A onda empurra a popa e gira a canoa. Descendo rápido demais, a proa crava nas costas da onda da frente: é a **espetada**.
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

Tudo está em um único `index.html` (HTML, CSS e JavaScript com three.js r128). As pistas ficam na lista `TRACKS` e os tipos de remada em `STROKES`, no início do script.

## Próximos passos

- Provas com curva de bóia, inspiradas em provas reais.
- Pistas modeladas a partir do mapa real (ex.: volta no Pão de Açúcar).
