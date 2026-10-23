# Va'a

Jogo de corrida de canoa havaiana (OC1) que roda no navegador. Você rema contra três canoas rivais em lugares famosos do mundo para remar, e vence quem lê melhor a onda, o vento, o equilíbrio e o próprio fôlego.

## Como jogar

Abra `index.html` no navegador. Não precisa instalar nada.

- **A / D** (ou as setas) remam pela esquerda ou pela direita. No celular, toque na metade esquerda ou direita da tela.
- Alternar os lados num ritmo constante rende mais.

## Fatores da corrida

- **Onda:** as ondulações chegam por trás. Remando forte na hora certa você pega a face da onda e ganha velocidade por alguns segundos.
- **Vento:** muda de força com as rajadas. De popa empurra, de proa segura, de través arrasta a canoa para o lado.
- **Equilíbrio:** o ama fica à esquerda. Remar demais pela esquerda, ou vento vindo do lado do ama, levanta o ama e a canoa dá huli. Ama afundado demais deixa a canoa pesada.
- **Stamina:** cada remada cansa, ritmo acelerado cansa mais. Cansado, a remada perde força. Recupera parando ou surfando.

## Pistas

| Pista | Lugar | Nível |
|---|---|---|
| Copacabana | Rio de Janeiro, do Leme ao Forte | Fácil |
| Hawaiki Nui | Polinésia Francesa, etapa Raiatea → Taha'a | Médio |
| Ka'iwi Channel | Havaí, rota da Molokai Hoe | Difícil |

As distâncias são versões compactas das rotas reais.

## Estrutura

Tudo está em um único `index.html` (HTML, CSS e JavaScript com canvas 2D). As pistas ficam na lista `TRACKS` no início do script.
