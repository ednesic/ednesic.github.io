"""Diagnóstico: baixa uma tábua da Marinha e mostra como o texto sai do PDF."""
import sys, io, re, pdfplumber
from net import fetch
for u in ["https://www.marinha.mil.br/chm/tabuas-de-mare-6", "https://www.marinha.mil.br/chm/tabuas-de-mare",
          "https://www.marinha.mil.br/chm/dados-do-segnav-publicacoes/tabuas-das-mares"]:
    try:
        h = fetch(u).decode("utf-8", "replace")
        print("===", u, len(h))
        for m in sorted(set(re.findall(r'href="([^"]*(?:dados_de_mare|tabuas-de-mare|tabuas-das-mares)[^"]*)"', h)))[:90]:
            print("  ", m)
        i = h.find("POINT (")
        print("  trecho:", re.sub(r"\s+", " ", h[max(0, i - 900):i + 200]) if i > 0 else "sem POINT")
        print("  paginação:", sorted(set(re.findall(r'href="([^"]*page=\d+[^"]*)"', h)))[:10])
    except Exception as e:
        print("===", u, "ERRO", repr(e))
data = fetch(sys.argv[1])
print("bytes", len(data))
pdf = pdfplumber.open(io.BytesIO(data))
print("paginas", len(pdf.pages))
for pi, page in enumerate(pdf.pages[:2]):
    print("== pagina", pi, page.width, page.height)
    words = page.extract_words(keep_blank_chars=False, extra_attrs=["size"])
    print("palavras", len(words))
    rows = {}
    for w in words:
        rows.setdefault(round(w["top"]), []).append(w)
    for top in sorted(rows)[:(75 if pi == 0 else 25)]:
        print(top, " | ".join(f'{w["text"]}@{w["x0"]:.0f}/{w["size"]:.0f}' for w in sorted(rows[top], key=lambda w: w["x0"])))
