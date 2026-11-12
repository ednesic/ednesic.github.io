"""Diagnóstico 2: onde estão dia, mês e ano no PDF da tábua."""
import sys, io, re, subprocess, collections, pdfplumber
from net import fetch
data = fetch(sys.argv[1]); open("t.pdf", "wb").write(data)
pdf = pdfplumber.open(io.BytesIO(data)); print("meta", pdf.metadata)
p = pdf.pages[0]
print("fontes", collections.Counter((c["fontname"], round(c["size"])) for c in p.chars).most_common(12))
print("imagens", len(p.images), "retas", len(p.lines), "rects", len(p.rects), "curvas", len(p.curves))
print("texto simples:", repr(p.extract_text()[:400]))
print("== pdftotext -layout (60 linhas)")
print("\n".join(subprocess.run(["pdftotext", "-layout", "-f", "1", "-l", "1", "t.pdf", "-"], capture_output=True, text=True).stdout.split("\n")[:60]))
bb = subprocess.run(["pdftotext", "-bbox", "-f", "1", "-l", "1", "t.pdf", "-"], capture_output=True, text=True).stdout
ws = re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="[\d.]+" yMax="[\d.]+">([^<]*)</word>', bb)
print("bbox palavras", len(ws))
print("nao-numericas:", [(w, round(float(x)), round(float(y))) for x, y, w in ws if not re.fullmatch(r"-?\d+\.\d\d|\d{4}", w)][:120])
