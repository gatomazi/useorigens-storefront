"""Base "Placa · UF e cidade" para o editor do cliente: tira os dois textos do PNG da placa e põe no lugar duas camadas de texto com campo,
na fonte Origens Placa (assets/print-studio/fonts/OrigensPlaca-Regular.ttf, embutida na base).

Uso (dependências: pillow, numpy; a venv de arte-lojas tem as duas):
  ../arte-lojas/.venv/bin/python scripts/placa-base.py "<PNG da placa>" output/placa-base

- Linha de cima ("PR - SANTA TEREZINHA DE ITAIPU"): campo de cidade (`input: "city"`), o cliente escolhe a UF e a cidade da lista do IBGE.
  A caixa vai de uma borda a outra da moldura interna, com folga; cidade longa encolhe a letra e continua centrada na moldura.
- Linha grande ("TOM-1996"): campo de placa (`input: "plate"`), 3 letras e 4 números.

Uma arte só para todas as cores de camiseta: a placa tem fundo próprio (na camiseta preta, sobram a moldura e as letras prata).
Gera `placa-uf-cidade.origens.json` (importar em /admin/estampas → conferir → Salvar como modelo). A prévia exata sai do renderizador do
site (scripts/placa-previa.mts), não daqui.
"""
import base64, io, json, pathlib, sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONT_FILE = ROOT / "assets" / "print-studio" / "fonts" / "OrigensPlaca-Regular.ttf"
FONT = {"id": "font-origens-placa", "name": "Origens Placa", "weight": 400}

# Medidas do PNG de 4270×4900 (29/10/2026). Moldura interna: x 502–3770, y 277–536 (traço de ~20 px); placa preta: x 304–3971, y 237–1239.
FRAME_INNER = (526, 299, 3748, 515)  # miolo da moldura interna, onde fica a linha da cidade (apagado inteiro)
PLATE_TEXT = (560, 560, 3720, 1225)  # miolo da placa abaixo da moldura, onde fica a linha grande (apagado inteiro)
# Onde medir a tinta de cada linha: dentro do miolo, longe do traço da moldura (a borda antisserrilhada contaria como letra).
MEASURE = {"cidade": (560, 320, 3715, 495), "placa": PLATE_TEXT}
LINES = [
    {"id": "cidade", "name": "UF - Cidade", "zone": FRAME_INNER, "text": "PR - SANTA TEREZINHA DO ITAIPU", "box": FRAME_INNER[2] - FRAME_INNER[0] - 2 * 110,
     "slot": {"field": "cidade", "label": "Cidade", "template": "{cidade}", "textCase": "upper", "maxLength": 60, "example": "Santa Terezinha de Itaipu/PR", "input": "city"},
     "example": "PR - SANTA TEREZINHA DE ITAIPU"},
    # A Origens Placa é mais larga que as letras do PNG: aqui o espaçamento é fixo (6% do tamanho) e a caixa encolhe a combinação larga.
    {"id": "placa", "name": "Placa", "zone": PLATE_TEXT, "text": "TOM-1996", "box": 3400, "tracking": 0.06,
     "slot": {"field": "placa", "label": "Placa", "template": "{placa}", "textCase": "upper", "maxLength": 8, "example": "TOM-1996", "input": "plate"},
     "example": "TOM-1996"},
]


def ink_box(mask: np.ndarray, zone):
    x0, y0, x1, y1 = zone
    ys, xs = np.where(mask[y0:y1, x0:x1])
    if not len(xs):
        raise SystemExit(f"Não achei texto na zona {zone}: confira se o PNG é o da placa.")
    return xs.min() + x0, ys.min() + y0, xs.max() + x0, ys.max() + y0


def fit_font(text: str, ink, tracking=None):
    """Tamanho pela altura das maiúsculas; espaçamento pela largura da tinta medida (a fonte não tem kerning) ou fixo, em fração do tamanho."""
    x0, y0, x1, y1 = ink
    probe = ImageFont.truetype(str(FONT_FILE), 1000)
    cap = -probe.getbbox("H", anchor="ls")[1]
    size = round((y1 - y0 + 1) * 1000 / cap)
    font = ImageFont.truetype(str(FONT_FILE), size)

    def width(spacing: float) -> float:
        left = font.getbbox(text[0], anchor="ls")[0]
        right = font.getlength(text[-1]) - font.getbbox(text[-1], anchor="ls")[2]
        return sum(font.getlength(ch) for ch in text) + spacing * (len(text) - 1) - left - right

    spacing = size * tracking if tracking is not None else ((x1 - x0 + 1) - width(0)) / (len(text) - 1)
    return size, round(float(spacing), 1), -font.getbbox("H", anchor="ls")[1]


def data_url(raw: bytes, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(raw).decode()}"


def main():
    src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    a = np.array(Image.open(src).convert("RGBA"))
    silver = (a[..., 3] > 128) & (a[..., 0] > 100)
    color = "#%02x%02x%02x" % tuple(int(v) for v in np.median(a[silver][:, :3], 0))
    # Pixels quase transparentes fora da placa sairiam como pontinhos na impressão.
    ys, xs = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    outside = (xs < 260) | (xs > 4015) | (ys < 195) | (ys > 1282)
    a[outside] = 0
    layers = []
    for line in LINES:
        ink = tuple(int(v) for v in ink_box(silver, MEASURE[line["id"]]))
        size, spacing, cap = fit_font(line["text"], ink, line.get("tracking"))
        cx, baseline = (ink[0] + ink[2]) / 2, ink[3]
        # Apaga o texto do PNG: o miolo é preto liso, então a zona inteira vira o preto da placa.
        x0, y0, x1, y1 = line["zone"]
        a[y0:y1, x0:x1] = (0, 0, 0, 255)
        # Caixa fixa: o renderizador põe a linha de base em y + altura do "H" e centraliza a linha na caixa; a largura medida inclui o
        # espaçamento depois da última letra, então meio espaçamento compensa para centralizar a tinta.
        layers.append({
            "id": line["id"], "kind": "text", "name": line["name"], "text": line["example"], "x": round(cx + spacing / 2 - line["box"] / 2, 1),
            "y": round(baseline + 1 - cap, 1), "visible": True, "fontId": FONT["id"], "fontSize": size, "weight": FONT["weight"], "color": color,
            "letterSpacing": spacing, "lineHeight": 1.1, "align": "center", "boxWidth": line["box"], "slot": line["slot"],
        })
        print(line["id"], {"ink": ink, "size": size, "spacing": spacing, "cx": cx, "baseline": baseline})
    buf = io.BytesIO()
    Image.fromarray(a).save(buf, "PNG", optimize=True, dpi=(300, 300))
    image = {"id": "arte", "kind": "image", "name": "Placa", "x": 0, "y": 0, "visible": True, "width": 4270,
             "asset": {"dataUrl": data_url(buf.getvalue(), "image/png"), "name": "placa-uf-cidade.png", "width": 4270, "height": 4900}}
    project = {"version": 1, "name": "Placa · UF e cidade", "width": 4270, "height": 4900, "dpi": 300, "background": None, "layers": [image, *layers],
               "fonts": [{**FONT, "dataUrl": data_url(FONT_FILE.read_bytes(), "application/octet-stream")}], "reference": None}
    (out / "placa-uf-cidade.origens.json").write_text(json.dumps(project, ensure_ascii=False))
    print("cor", color, f"{len(buf.getvalue()) / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
