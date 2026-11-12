# Tábuas de maré do Rumo

O app usa a tábua de marés oficial da Marinha quando há um porto com tábua a até 60 km.
Os dados ficam em `rumo/mares/` e são gerados por `importar_mares.py` a partir dos PDFs do CHM.

- `fontes.json`: um link de PDF por porto e por ano.
- `importar_mares.py`: lê o PDF e só grava se a leitura fechar com o calendário
  (todos os dias do ano, horários em ordem, alturas plausíveis).
- `net.py`: download com verificação de certificado (o servidor da Marinha não envia a cadeia completa).

## Tábua nova (todo fim de ano, ou para incluir outro porto)

A página de listagem da Marinha recusa acesso automático, então o link de cada tábua nova
precisa ser copiado à mão, uma vez por ano:

1. Abra a página "Tábuas de Maré" do CHM e copie o link do PDF do porto.
2. No GitHub: Actions > "Rumo - tábuas de maré" > Run workflow.
3. Preencha o nome curto do porto (ex.: `rio-de-janeiro`) e cole o link.

O fluxo roda sozinho todo dia 3 e abre uma issue quando falta a tábua do ano.
