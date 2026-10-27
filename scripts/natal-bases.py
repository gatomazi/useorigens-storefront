"""Bases "Natal em família" para o editor do cliente: tira o sobrenome do PNG e põe no lugar uma camada de texto com campo.

Uso (dependências: pillow, numpy, scipy):
  python3 scripts/natal-bases.py "<pasta com 1.png … 12.png>" output/natal-bases [--preview]

Cada arte vem em dois PNGs com o mesmo desenho: ímpar para camiseta clara (tinta escura), par para camiseta escura (tinta clara).
A cor do sobrenome novo é lida do sobrenome original de cada PNG, e a posição é medida em cada um (as duas versões podem
diferir alguns pixels).

Gera um `<slug>-<clara|escura>.origens.json` por PNG (importar em /admin/estampas → conferir → Salvar como modelo) e, com
--preview, um PNG aproximado (Pillow, sem kerning do navegador) só para conferência.
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
# das letras) menos os elementos que `apagar` recusa, preservados com uma margem. Os critérios usam posição e tamanho, nunca cor,
# para valerem nas duas versões.
# ink: caixa da tinta do sobrenome no PNG de referência (o da camiseta clara), onde foram medidos baseline (linha de base; no arco,
# a do ápice), cx (centro), size, spacing, stroke e arc. Em cada PNG, essas medidas acompanham a caixa medida ali.
# box: largura máxima (no arco, o maior arco) antes de diminuir a letra.
# lines: sobrenome composto quebra em até N linhas, para baixo; push: a arte inteira desce junto (só serve quando ela toda fica
# abaixo do nome, como no universitário).
ARTS = [
    {"files": ("1.png", "2.png"), "slug": "natal-universitario", "name": "Natal em família · universitário", "font": "font-graduate", "size": 940, "spacing": 10, "stroke": 27,
     "template": "{sobrenome}", "case": "upper", "lines": 2, "push": True, "baseline": 1386, "cx": 2143, "box": 3660, "arc": 3836, "ink": (205, 455, 4062, 1891),
     "erase": (0, 380, 4270, 1960, lambda c: c["top"] < 1000 and c["size"] >= 150000)},
    {"files": ("3.png", "4.png"), "slug": "natal-eu-vim-pela-ceia", "name": "Natal em família · eu vim pela ceia", "font": "font-montserrat-semibold", "size": 129, "spacing": 18.8,
     "template": "NATAL DOS {sobrenome}", "case": "upper", "dos": True, "baseline": 2630, "cx": 2134, "box": 2400, "ink": (1316, 2544, 2951, 2630),
     "erase": (1200, 2495, 3100, 2680, lambda c: c["top"] > 2500)},
    {"files": ("5.png", "6.png"), "slug": "natal-eu-vim-pelo-presente", "name": "Natal em família · eu vim pelo presente", "font": "font-montserrat-semibold", "size": 207, "spacing": 21,
     "template": "NATAL DOS {sobrenome}", "case": "upper", "dos": True, "baseline": 3266, "cx": 2185, "box": 3600, "ink": (947, 3125, 3424, 3265),
     "erase": (850, 3070, 3550, 3320, lambda c: c["top"] > 3075)},
    {"files": ("7.png", "8.png"), "slug": "natal-ceia-dos", "name": "Natal em família · ceia dos", "font": "font-caveat", "size": 500, "spacing": 60,
     "template": "{sobrenome}", "case": "title", "dos": True, "baseline": 912, "cx": 2060, "box": 2900, "ink": (1143, 511, 2976, 960),
     "erase": (1080, 470, 3100, 1000, lambda c: 480 < c["top"] < 900)},
    {"files": ("9.png", "10.png"), "slug": "natal-arvore", "name": "Natal em família · árvore", "font": "font-montserrat-semibold", "size": 188, "spacing": 25.2,
     "template": "{sobrenome}", "case": "upper", "baseline": 1181, "cx": 3448, "box": 1300, "ink": (2999, 1049, 3897, 1181),
     "erase": (2900, 1010, 4000, 1205, lambda c: 1012 < c["top"] < 1100)},
    {"files": ("11.png", "12.png"), "slug": "natal-pave-ou-pacume", "name": "Natal em família · pavê ou pacumê", "font": "font-caveat-brush", "size": 200, "spacing": 2.2,
     "template": "NATAL DOS {sobrenome}", "case": "upper", "dos": True, "baseline": 2650, "cx": 2158, "box": 2700, "ink": (1426, 2514, 2890, 2653),
     "erase": (1300, 2490, 3000, 2700, lambda c: c["top"] > 2495)},
]
VARIANTS = ("clara", "escura")


def erase(img: Image.Image, spec):
    """Devolve a arte sem o sobrenome, a cor dele e a caixa da sua tinta."""
    a = np.array(img)
    x0, y0, x1, y1, remove = spec
    zone = a[y0:y1, x0:x1]
    lab, _ = ndimage.label(zone[:, :, 3] > 20)
    keep = np.zeros(lab.shape, bool)
    name = np.zeros(lab.shape, bool)
    for i, sl in enumerate(ndimage.find_objects(lab)):
        m = lab[sl] == i + 1
        comp = {"size": int(m.sum()), "top": sl[0].start + y0}
        if remove(comp):
            name[sl] |= m
        else:
            keep[sl] |= m
    # A cor do texto novo é a do sobrenome apagado: a mesma arte em outra cor não precisa de ajuste.
    solid = (zone[:, :, 3] > 200) & ~ndimage.binary_dilation(keep, iterations=2)
    if solid.sum() < 1000:
        raise SystemExit("Não encontrei o sobrenome na zona de apagar: confira se a arte tem o mesmo desenho e posição.")
    color = "#%02x%02x%02x" % tuple(int(v) for v in np.median(zone[solid][:, :3], 0))
    ys, xs = np.where(name & (zone[:, :, 3] > 128))
    ink = (xs.min() + x0, ys.min() + y0, xs.max() + x0, ys.max() + y0)
    keep = ndimage.binary_dilation(keep, iterations=30)
    zone[:, :, 3][~keep] = 0
    return Image.fromarray(a), color, ink


def fitted(art, ink):
    """Leva as medidas do PNG de referência para a tinta medida neste PNG: mesma escala pela largura, ancorada embaixo."""
    rx0, _, rx1, ry1 = art["ink"]
    x0, _, x1, y1 = ink
    k = (x1 - x0) / (rx1 - rx0)
    scaled = {key: round(art[key] * k, 1) for key in ("size", "spacing", "stroke", "arc") if art.get(key)}
    return {**art, **scaled, "size": round(art["size"] * k), "cx": round(x0 + (art["cx"] - rx0) * k), "baseline": round(y1 + (art["baseline"] - ry1) * k)}


def data_url(path_or_bytes, mime):
    raw = path_or_bytes if isinstance(path_or_bytes, bytes) else pathlib.Path(path_or_bytes).read_bytes()
    return f"data:{mime};base64,{base64.b64encode(raw).decode()}"


def cap_height(font_file: pathlib.Path, size: float) -> float:
    font = ImageFont.truetype(str(font_file), round(size))
    return -font.getbbox("H", anchor="ls")[1]


def project(art, png: bytes, color: str, variant: str):
    font_name, weight, file = FONTS[art["font"]]
    font_file = ROOT / "assets" / "print-studio" / "fonts" / file
    # O renderizador põe a linha de base em y + altura do "H" quando o nome cabe na caixa.
    y = art["baseline"] - cap_height(font_file, art["size"])
    # A largura medida pelo canvas inclui o espaçamento depois da última letra: compensa para centralizar a tinta.
    x = art["cx"] + art["spacing"] / 2 - art["box"] / 2
    text = {
        "id": "sobrenome", "kind": "text", "name": "Sobrenome", "text": art["template"].replace("{sobrenome}", "TOMAZI" if art["case"] == "upper" else "Tomazi"),
        "x": round(x, 1), "y": round(y, 1), "visible": True, "fontId": art["font"], "fontSize": art["size"], "weight": weight, "color": color,
        "letterSpacing": art["spacing"], "lineHeight": 1.1, "align": "center", "boxWidth": art["box"],
        **({"arc": art["arc"]} if art.get("arc") else {}), **({"stroke": art["stroke"]} if art.get("stroke") else {}),
        "slot": {**SLOT, "template": art["template"], "textCase": art["case"], **({"maxLines": art["lines"]} if art.get("lines") else {}),
                 **({"dropParticle": True} if art.get("dos") else {})},
    }
    image = {"id": "arte", "kind": "image", "name": "Arte fixa", "x": 0, "y": 0, "visible": True, "width": 4270, **({"pushedBy": "sobrenome"} if art.get("push") else {}),
             "asset": {"dataUrl": data_url(png, "image/png"), "name": f"{art['slug']}-{variant}.png", "width": 4270, "height": 4900}}
    return {"version": 1, "name": f"{art['name']} · camiseta {variant}", "width": 4270, "height": 4900, "dpi": 300, "background": None,
            "layers": [image, text], "fonts": [{"id": art["font"], "name": font_name, "weight": weight, "dataUrl": data_url(font_file, "application/octet-stream")}],
            "reference": None}


def preview(art, base: Image.Image, text: str, color: str) -> Image.Image:
    """Aproximação do renderizador (letra a letra, sem kerning) para conferir posição e tamanho. `text` pode ter quebras de linha."""
    _, _, file = FONTS[art["font"]]
    path = str(ROOT / "assets" / "print-studio" / "fonts" / file)
    font = ImageFont.truetype(path, art["size"])
    lines = text.split("\n")
    ratio = min(1, art["box"] / max(sum(font.getlength(ch) for ch in line) + art["spacing"] * len(line) for line in lines))
    size = round(art["size"] * ratio)
    font = ImageFont.truetype(path, size)
    spacing = art["spacing"] * ratio
    step = size * 1.1
    out = Image.new("RGBA", base.size, (0, 0, 0, 0))
    out.alpha_composite(base, (0, round(step * (len(lines) - 1)) if art.get("push") else 0))
    ink = {"fill": color, "stroke_width": round(art.get("stroke", 0) * ratio / 2), "stroke_fill": color}
    for index, line in enumerate(lines):
        widths = [font.getlength(ch) for ch in line]
        baseline = art["baseline"] + index * step
        if not art.get("arc"):
            draw = ImageDraw.Draw(out)
            x = art["cx"] - (sum(widths) + spacing * (len(line) - 1)) / 2
            for ch, w in zip(line, widths):
                draw.text((x, baseline), ch, font=font, anchor="ls", **ink)
                x += w + spacing
            continue
        r = art["arc"] - index * step
        along = -(sum(widths) + spacing * (len(line) - 1)) / 2
        for ch, w in zip(line, widths):
            theta = (along + w / 2) / r
            tile = Image.new("RGBA", (int(w) + 400, size * 2), (0, 0, 0, 0))
            ImageDraw.Draw(tile).text((200, size * 1.5), ch, font=font, anchor="ls", **ink)
            tile = tile.rotate(-math.degrees(theta), center=(200 + w / 2, size * 1.5), resample=Image.BICUBIC)
            px = art["cx"] + r * math.sin(theta) - (200 + w / 2)
            py = baseline + r - r * math.cos(theta) - size * 1.5
            out.alpha_composite(tile, (round(px), round(py)))
            along += w + spacing
    return out


def main():
    src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    for art in ARTS:
        for variant, file in zip(VARIANTS, art["files"]):
            slug = f"{art['slug']}-{variant}"
            if not (src / file).exists():
                print(slug, "sem", file, "— pulada")
                continue
            clean, color, ink = erase(Image.open(src / file).convert("RGBA"), art["erase"])
            this = fitted(art, ink)
            buf = io.BytesIO()
            clean.save(buf, "PNG", optimize=True, dpi=(300, 300))
            (out / f"{slug}.origens.json").write_text(json.dumps(project(this, buf.getvalue(), color, variant), ensure_ascii=False))
            if "--preview" in sys.argv:
                for name in ("TOMAZI", "VASCONCELOS", "ALBUQUERQUE\nLINS"):
                    if "\n" in name and not this.get("lines"):
                        continue
                    text = this["template"].replace("{sobrenome}", name if this["case"] == "upper" else name.title())
                    preview(this, clean, text, color).save(out / f"{slug}-{name.lower().replace(chr(10), '-')}.png")
            print(slug, file, color, {k: this[k] for k in ("size", "baseline", "cx")}, f"{len(buf.getvalue()) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
