"""Importa tábuas de maré da Marinha (PDF) para os arquivos de dados do Rumo.

Uso:  python importar_mares.py                -> reprocessa as fontes de fontes.json
      python importar_mares.py ID URL         -> acrescenta/atualiza uma fonte e processa

Cada PDF traz um ano inteiro de um porto. O texto é lido com `pdftotext -bbox` (poppler),
que devolve cada palavra com a sua posição na página. A tábua tem 8 colunas por página
(4 meses x duas metades do mês); cada dia é um bloco com o número do dia à esquerda.
Nada é gravado se a leitura não fechar com o calendário: todos os dias do ano presentes,
horários crescentes dentro do dia e alturas plausíveis.
"""
import calendar, html, json, os, re, subprocess, sys, tempfile, unicodedata, urllib.parse
from net import fetch

AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(AQUI, "..", "mares")
FONTES = os.path.join(AQUI, "fontes.json")
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
HOSTS = ("marinha.mil.br",)


class Erro(Exception):
    pass


def palavras_por_pagina(pdf_bytes):
    with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
        f.write(pdf_bytes); f.flush()
        out = subprocess.run(["pdftotext", "-bbox", f.name, "-"], capture_output=True, text=True, check=True).stdout
    paginas = []
    for bloco in out.split("<page ")[1:]:
        ws = [(float(x), float(y), html.unescape(t)) for x, y, t in
              re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="[\d.]+" yMax="[\d.]+">([^<]*)</word>', bloco)]
        paginas.append(ws)
    return paginas


def graus(tokens):
    """['22°', "53'.8", 'S'] -> -22.8967"""
    g = float(tokens[0].rstrip("°"))
    m = float(tokens[1].replace("'", "")) if len(tokens) > 2 else 0.0
    v = g + m / 60
    return -v if tokens[-1] in ("S", "W") else v


def cabecalho(ws):
    def apos(rotulo, n):
        for i, w in enumerate(ws):
            if w[2] == rotulo:
                linha = sorted([v for v in ws if abs(v[1] - w[1]) < 2 and v[0] > w[0]], key=lambda v: v[0])
                return [v[2] for v in linha[:n]], w
        raise Erro(f"cabeçalho sem '{rotulo}'")
    lat, wlat = apos("Latitude", 3)
    lon, _ = apos("Longitude", 3)
    fuso, _ = apos("UTC", 1)
    titulo = sorted([w for w in ws if wlat[1] - 18 < w[1] < wlat[1] - 5 and w[0] > 60], key=lambda w: w[0])
    texto = " ".join(w[2] for w in titulo)
    m = re.search(r"\b(20\d\d)\b\s*$", texto)
    if not m:
        raise Erro(f"não achei o ano no título: {texto!r}")
    nome = re.sub(r"\s*\(ESTADO.*$|\s*-\s*20\d\d\s*$", "", texto).strip()
    nivel = None
    for i, w in enumerate(ws):
        if w[2] == "Médio":
            prox = sorted([v for v in ws if abs(v[1] - w[1]) < 2 and v[0] > w[0]], key=lambda v: v[0])
            nivel = float(prox[0][2])
    cut = lambda t: t[:3] if t[2] in "SNWE" else t[:2] + [t[-1]]
    return {"nome": nome, "ano": int(m.group(1)), "lat": round(graus(cut(lat)), 4), "lon": round(graus(cut(lon)), 4),
            "fuso": float(fuso[0]), "nivelMedio": nivel}


def ler_pagina(ws, ano):
    """Devolve {(mes, dia): [(hhmm, altura), ...]} de uma página."""
    horas = sorted([w for w in ws if w[2] == "HORA"], key=lambda w: w[0])
    if not horas:
        raise Erro("página sem colunas")
    # os nomes dos meses ficam na linha logo acima de HORA (o título também tem "JANEIRO", de Rio de Janeiro)
    meses = sorted([w for w in ws if w[2].lower() in MESES and horas[0][1] - 20 < w[1] < horas[0][1] - 4], key=lambda w: w[0])
    if len(horas) != 2 * len(meses) or not meses:
        raise Erro(f"página com {len(horas)} colunas e {len(meses)} meses")
    y0 = horas[0][1] + 3
    corpo = [w for w in ws if w[1] > y0]
    res = {}
    for ci, h in enumerate(horas):
        hx = h[0]
        mes = MESES.index(meses[ci // 2][2].lower()) + 1
        dias = sorted([(w[1], int(w[2])) for w in corpo if hx - 24 <= w[0] <= hx - 6 and re.fullmatch(r"\d\d", w[2])])
        tempos = sorted([(w[1], w[0], w[2]) for w in corpo if hx - 2 <= w[0] <= hx + 10 and re.fullmatch(r"\d{4}", w[2])])
        alts = [(w[1], w[0], w[2]) for w in corpo if hx + 12 <= w[0] <= hx + 34 and re.fullmatch(r"-?\d\.\d\d", w[2])]
        if not dias:
            raise Erro(f"coluna {ci} do mês {mes} sem dias")
        for ty, tx, t in tempos:
            perto = [a for a in alts if abs(a[0] - ty) < 2.5]
            if len(perto) != 1:
                raise Erro(f"mês {mes}: horário {t} com {len(perto)} alturas na mesma linha")
            antes = [d for d in dias if d[0] <= ty + 4]   # o bloco do dia começa, no máximo, 4 pt acima do número
            if not antes:
                raise Erro(f"mês {mes}: horário {t} acima do primeiro dia")
            res.setdefault((mes, antes[-1][1]), []).append((t, float(perto[0][2])))
    return res


def importar(pdf_bytes):
    paginas = palavras_por_pagina(pdf_bytes)
    info = cabecalho(paginas[0])
    ano = info["ano"]
    dias = {}
    for ws in paginas:
        if any(w[2] == "HORA" for w in ws):
            for k, v in ler_pagina(ws, ano).items():
                if k in dias:
                    raise Erro(f"dia {k} aparece duas vezes")
                dias[k] = v
    eventos, problemas = [], []
    for mes in range(1, 13):
        for dia in range(1, calendar.monthrange(ano, mes)[1] + 1):
            ev = dias.pop((mes, dia), None)
            if not ev or not 2 <= len(ev) <= 10:
                problemas.append(f"{dia:02d}/{mes:02d}: {len(ev) if ev else 0} registros"); continue
            mins = [int(t[:2]) * 60 + int(t[2:]) for t, _ in ev]
            if any(b <= a for a, b in zip(mins, mins[1:])) or any(int(t[:2]) > 23 or int(t[2:]) > 59 for t, _ in ev):
                problemas.append(f"{dia:02d}/{mes:02d}: horários fora de ordem {ev}"); continue
            if any(not -2 < a < 15 for _, a in ev):
                problemas.append(f"{dia:02d}/{mes:02d}: altura implausível {ev}"); continue
            base = (calendar.timegm((ano, mes, dia, 0, 0, 0)) - calendar.timegm((ano, 1, 1, 0, 0, 0))) // 60
            eventos += [[base + m, round(a * 100)] for m, (_, a) in zip(mins, ev)]
    if dias:
        problemas.append(f"dias que não existem no calendário: {sorted(dias)}")
    if problemas:
        raise Erro("leitura não fecha com o calendário:\n  " + "\n  ".join(problemas[:25]))
    return info, eventos


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def main():
    fontes = json.load(open(FONTES, encoding="utf-8"))
    if len(sys.argv) == 3:
        fid, url = slug(sys.argv[1]), sys.argv[2].strip()
        host = urllib.parse.urlsplit(url).hostname or ""
        if not url.startswith("https://") or not host.endswith(HOSTS) or not url.lower().endswith(".pdf"):
            raise SystemExit("O link precisa ser um PDF em https://...marinha.mil.br")
        fontes = [f for f in fontes if not (f["id"] == fid and f["url"] == url)] + [{"id": fid, "url": url}]
    os.makedirs(SAIDA, exist_ok=True)
    idx_path = os.path.join(SAIDA, "portos.json")
    portos = {p["id"]: p for p in (json.load(open(idx_path, encoding="utf-8")) if os.path.exists(idx_path) else [])}
    falhas = 0
    for f in fontes:
        try:
            info, eventos = importar(fetch(f["url"]))
        except Exception as e:  # uma fonte ruim não derruba as outras nem apaga o que já existe
            falhas += 1; print(f"ERRO {f['id']}: {e}"); continue
        p = portos.setdefault(f["id"], {"id": f["id"], "anos": []})
        p.update(nome=info["nome"].title().replace(" Do ", " do ").replace(" De ", " de ").replace(" Da ", " da "),
                 lat=info["lat"], lon=info["lon"], fuso=info["fuso"], nivelMedio=info["nivelMedio"])
        p["anos"] = sorted(set(p["anos"]) | {info["ano"]})
        with open(os.path.join(SAIDA, f"{f['id']}-{info['ano']}.json"), "w", encoding="utf-8") as o:
            # e = [minutos desde 1º de janeiro 00:00 na hora local do porto, altura em cm]
            json.dump({"id": f["id"], "ano": info["ano"], "fuso": info["fuso"], "fonte": f["url"], "e": eventos}, o, separators=(",", ":"))
        f["ano"] = info["ano"]
        print(f"ok {f['id']} {info['ano']}: {len(eventos)} extremos, {info['nome']} ({info['lat']}, {info['lon']})")
        amostra = {m: h for m, h in eventos}
        print("   primeiros:", eventos[:4], "| últimos:", eventos[-3:])
    json.dump(sorted(portos.values(), key=lambda p: p["id"]), open(idx_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(fontes, open(FONTES, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    sys.exit(1 if falhas else 0)


if __name__ == "__main__":
    main()
