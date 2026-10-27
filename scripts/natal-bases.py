"""Bases "Natal em família" para o editor do cliente: tira o sobrenome do PNG e põe no lugar uma camada de texto com campo.

Uso (dependências: pillow, numpy, scipy):
  python3 scripts/natal-bases.py "<pasta com 1.png … 6.png>" output/natal-bases [--preview]

Gera um `<slug>.origens.json` por arte (importar em /admin/estampas → conferir → Salvar como modelo) e, com --preview,
um PNG aproximado (Pillow, sem kerning do navegador) só para conferência. As medidas vieram das artes originais de 4270 × 4900.
"""
import base64, io, json, math, pathlib, sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = {
    "font-graduate": ("Graduate", 400, "Graduate-Regular.ttf"),
    "font-caveat": ("Caveat", 400, "Caveat-Regular.ttf"),
    "font-caveat-brush": ("Caveat Brush", 400, "CaveatBrush-Regular.ttf"),
    "font-montserrat-semibold": ("Montserrat SemiBold", 600, "Montserrat-SemiBold.ttf"),
}
SLOT = {"field": "sobrenome", "label": "Sobrenome da família", "maxLength": 20, "example": "Silva"}

# erase: (x0, y0, x1, y1, apagar) — dentro da zona, limpa tudo (inclusive o halo quase transparente que as artes trazem em volta
# das letras) menos os elementos que `apagar` recusa, preservados com uma margem.
# baseline/cx: linha de base e centro do sobrenome original; box: largura máxima (no arco, o maior arco) antes de diminuir a letra.
ARTS = [
    {"file": "1.png", "slug": "natal-universitario", "name": "Natal em família · universitário", "font": "font-graduate", "size": 900, "spacing": 10, "stroke": 26,
     "color": "#fdf3da", "template": "{sobrenome}", "case": "upper", "baseline": 2270, "cx": 2150, "box": 3500, "arc": 3836,
     "erase": (0, 1250, 4270, 2950, lambda c: c["size"] >= 150000 and not c["green"])},
    {"file": "2.png", "slug": "natal-eu-vim-pela-ceia", "name": "Natal em família · eu vim pela ceia", "font": "font-montserrat-semibold", "size": 157, "spacing": 22.8,
     "color": "#14311d", "template": "NATAL DOS {sobrenome}", "case": "upper", "baseline": 3190, "cx": 2135, "box": 3600,
     "erase": (900, 3040, 3400, 3330, lambda c: c["top"] >= 3060)},
    {"file": "3.png", "slug": "natal-eu-vim-pelo-presente", "name": "Natal em família · eu vim pelo presente", "font": "font-montserrat-semibold", "size": 206, "spacing": 20.9,
     "color": "#fdf2d5", "template": "NATAL DOS {sobrenome}", "case": "upper", "baseline": 3344, "cx": 2186, "box": 3600,
     "erase": (700, 3150, 3700, 3550, lambda c: c["top"] >= 3170)},
    {"file": "4.png", "slug": "natal-ceia-dos", "name": "Natal em família · ceia dos", "font": "font-caveat", "size": 500, "spacing": 60,
     "color": "#960a0c", "template": "{sobrenome}", "case": "title", "baseline": 1210, "cx": 2060, "box": 2900,
     "erase": (900, 700, 3250, 1330, lambda c: 780 <= c["top"] < 1200)},
    {"file": "5.png", "slug": "natal-arvore", "name": "Natal em família · árvore", "font": "font-montserrat-semibold", "size": 376, "spacing": 50.6,
     "color": "#fdf3db", "template": "{sobrenome}", "case": "upper", "baseline": 3315, "cx": 2138, "box": 3400,
     "erase": (1000, 2980, 3300, 3375, lambda c: 3030 <= c["top"] < 3340)},
    {"file": "6.png", "slug": "natal-pave-ou-pacume", "name": "Natal em família · pavê ou pacumê", "font": "font-caveat-brush", "size": 200, "spacing": 2.2,
     "color": "#a7010b", "template": "NATAL DOS {sobrenome}", "case": "upper", "baseline": 2650, "cx": 2158, "box": 2700,
     "erase": (1150, 2490, 3150, 2850, lambda c: c["top"] >= 2500)},
]


def erase(img: Image.Image, spec) -> Image.Image:
    a = np.array(img)
    x0, y0, x1, y1, remove = spec
    zone = a[y0:y1, x0:x1]
    lab, _ = ndimage.label(zone[:, :, 3] > 20)
    keep = np.zeros(lab.shape, bool)
    for i, sl in enumerate(ndimage.find_objects(lab)):
        m = lab[sl] == i + 1
        rgb = np.median(zone[sl][m][:, :3], 0)
        comp = {"size": int(m.sum()), "top": sl[0].start + y0, "green": rgb[1] > rgb[0]}
        if not remove(comp):
            keep[sl] |= m
    keep = ndimage.binary_dilation(keep, iterations=30)
    zone[:, :, 3][~keep] = 0
    a[:14, :, 3] = 0  # a arte 1 veio com um risco amarelo quase transparente no topo
    return Image.fromarray(a)


def data_url(path_or_bytes, mime):
    raw = path_or_bytes if isinstance(path_or_bytes, bytes) else pathlib.Path(path_or_bytes).read_bytes()
    return f"data:{mime};base64,{base64.b64encode(raw).decode()}"


def cap_height(font_file: pathlib.Path, size: float) -> float:
    font = ImageFont.truetype(str(font_file), round(size))
    return -font.getbbox("H", anchor="ls")[1]


def project(art, png: bytes):
    name, weight, file = FONTS[art["font"]]
    font_file = ROOT / "assets" / "print-studio" / "fonts" / file
    # O renderizador põe a linha de base em y + altura do "H" quando o nome cabe na caixa.
    y = art["baseline"] - cap_height(font_file, art["size"])
    # A largura medida pelo canvas inclui o espaçamento depois da última letra: compensa para centralizar a tinta.
    x = art["cx"] + art["spacing"] / 2 - art["box"] / 2
    text = {
        "id": "sobrenome", "kind": "text", "name": "Sobrenome", "text": art["template"].replace("{sobrenome}", "TOMAZI" if art["case"] == "upper" else "Tomazi"),
        "x": round(x, 1), "y": round(y, 1), "visible": True, "fontId": art["font"], "fontSize": art["size"], "weight": weight, "color": art["color"],
        "letterSpacing": art["spacing"], "lineHeight": 1.1, "align": "center", "boxWidth": art["box"],
        **({"arc": art["arc"]} if art.get("arc") else {}), **({"stroke": art["stroke"]} if art.get("stroke") else {}),
        "slot": {**SLOT, "template": art["template"], "textCase": art["case"]},
    }
    image = {"id": "arte", "kind": "image", "name": "Arte fixa", "x": 0, "y": 0, "visible": True, "width": 4270,
             "asset": {"dataUrl": data_url(png, "image/png"), "name": f"{art['slug']}.png", "width": 4270, "height": 4900}}
    return {"version": 1, "name": art["name"], "width": 4270, "height": 4900, "dpi": 300, "background": None,
            "layers": [image, text], "fonts": [{"id": art["font"], "name": name, "weight": weight, "dataUrl": data_url(font_file, "application/octet-stream")}],
            "reference": None}


def preview(art, base: Image.Image, text: str) -> Image.Image:
    """Aproximação do renderizador (letra a letra, sem kerning) para conferir posição e tamanho."""
    _, _, file = FONTS[art["font"]]
    font = ImageFont.truetype(str(ROOT / "assets" / "print-studio" / "fonts" / file), art["size"])
    out = base.copy()
    widths = [font.getlength(ch) for ch in text]
    total = sum(widths) + art["spacing"] * len(text)
    ratio = min(1, art["box"] / total)
    if ratio < 1:
        font = ImageFont.truetype(str(ROOT / "assets" / "print-studio" / "fonts" / file), round(art["size"] * ratio))
        widths = [font.getlength(ch) for ch in text]
    spacing = art["spacing"] * ratio
    ink = {"fill": art["color"], "stroke_width": round(art.get("stroke", 0) * ratio / 2), "stroke_fill": art["color"]}
    if not art.get("arc"):
        draw = ImageDraw.Draw(out)
        x = art["cx"] - (sum(widths) + spacing * (len(text) - 1)) / 2
        for ch, w in zip(text, widths):
            draw.text((x, art["baseline"]), ch, font=font, anchor="ls", **ink)
            x += w + spacing
        return out
    r = art["arc"]
    along = -(sum(widths) + spacing * (len(text) - 1)) / 2
    for ch, w in zip(text, widths):
        theta = (along + w / 2) / r
        tile = Image.new("RGBA", (int(w) + 400, art["size"] * 2), (0, 0, 0, 0))
        ImageDraw.Draw(tile).text((200, art["size"] * 1.5), ch, font=font, anchor="ls", **ink)
        tile = tile.rotate(-math.degrees(theta), center=(200 + w / 2, art["size"] * 1.5), resample=Image.BICUBIC)
        px = art["cx"] + r * math.sin(theta) - (200 + w / 2)
        py = art["baseline"] + r - r * math.cos(theta) - art["size"] * 1.5
        out.alpha_composite(tile, (round(px), round(py)))
        along += w + spacing
    return out


def main():
    src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    for art in ARTS:
        clean = erase(Image.open(src / art["file"]).convert("RGBA"), art["erase"])
        buf = io.BytesIO()
        clean.save(buf, "PNG", optimize=True, dpi=(300, 300))
        (out / f"{art['slug']}.origens.json").write_text(json.dumps(project(art, buf.getvalue()), ensure_ascii=False))
        if "--preview" in sys.argv:
            for name in ("TOMAZI", "VASCONCELOS"):
                text = art["template"].replace("{sobrenome}", name if art["case"] == "upper" else name.title())
                preview(art, clean, text).save(out / f"{art['slug']}-{name.lower()}.png")
        print(art["slug"], f"{len(buf.getvalue()) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
