"""Diagnóstico: baixa uma tábua da Marinha e mostra como o texto sai do PDF."""
import sys, io, urllib.request, pdfplumber
URL = sys.argv[1]
req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 (rumo-mares)"})
data = urllib.request.urlopen(req, timeout=60).read()
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
    for top in sorted(rows)[:70]:
        print(top, " | ".join(f'{w["text"]}@{w["x0"]:.0f}/{w["size"]:.0f}' for w in sorted(rows[top], key=lambda w: w["x0"])))
