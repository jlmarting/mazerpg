"""Extiende static.png a 368x832 con el contenido que sprites.json ya describe.

- Bloque muro (0,736,32,32): las tiras superior/inferior/izq/der son subrects
  suyos, asi que con pintar el bloque quedan todas servidas. Cero cambios JSON.
- Suelos: cesped (0,800) + tierra (32,800) + grieta (64,800). El mapeo actual
  apunta normal y cesped al mismo rect: se mueve normal a (32,800).
  Requiere varianteSuelo 'grieta' (autotile.ts) — el Renderer ya resuelve
  `static_suelo_<variante>`.
- El fondo viejo ya es transparente; la zona nueva nace transparente.

Uso: python3 verification/gen_static.py (idempotente, .bak la primera vez)
"""
import json
import os
import random
import shutil
from PIL import Image, ImageDraw

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(REPO, 'public', 'sprites')
JSON_PATH = os.path.join(REPO, 'src', 'config', 'sprites.json')

W, H_OLD, H_NEW = 368, 384, 832
PIEDRA = (61, 65, 78)
PIEDRA_OSC = (40, 43, 52)
PIEDRA_CLARA = (95, 108, 118)
BORDE = (30, 32, 40)
MUSGO = [(43, 85, 27), (100, 127, 44)]
GUIJA = (81, 94, 103)
GRIETA = (18, 16, 24)


def motas(dr, x0, y0, w, h, n, colores, rmax=2, semilla=7):
    rnd = random.Random(semilla + x0 + y0)
    for _ in range(n):
        x = x0 + rnd.randint(0, w - 1)
        y = y0 + rnd.randint(0, h - 1)
        r = rnd.randint(1, rmax)
        dr.ellipse([x - r, y - r, x + r, y + r], fill=rnd.choice(colores))


def grieta(dr, x0, y0, semilla=7):
    rnd = random.Random(semilla + x0)
    x, y = x0 + rnd.randint(8, 24), y0
    pts = [(x, y)]
    while y < y0 + 32:
        y += rnd.randint(3, 6)
        x += rnd.randint(-5, 5)
        x = max(x0 + 2, min(x0 + 29, x))
        pts.append((x, y))
    dr.line(pts, fill=GRIETA, width=3, joint='curve')
    dr.line([(a + 2, b + 1) for a, b in pts], fill=(120, 135, 150), width=1)


def bloque_muro(dr):
    x0, y0 = 0, 736
    dr.rectangle([x0, y0, x0 + 31, y0 + 31], fill=PIEDRA)
    for i in range(6):  # luz cenital en la cabecera
        c = tuple(int(PIEDRA[j] + (PIEDRA_CLARA[j] - PIEDRA[j]) * (1 - i / 6)) for j in range(3))
        dr.line([(x0, y0 + i), (x0 + 31, y0 + i)], fill=c)
    dr.rectangle([x0, y0 + 31, x0 + 31, y0 + 31], fill=BORDE)
    dr.line([(x0, y0), (x0, y0 + 31)], fill=BORDE)
    dr.line([(x0 + 31, y0), (x0 + 31, y0 + 31)], fill=BORDE)
    dr.line([(x0, y0 + 20), (x0 + 31, y0 + 20)], fill=PIEDRA_OSC)  # junta
    dr.line([(x0 + 16, y0 + 20), (x0 + 16, y0 + 31)], fill=PIEDRA_OSC)
    motas(dr, x0, y0, 32, 32, 8, [(47, 44, 57), (100, 115, 128)], semilla=11)
    grieta(dr, x0, y0 + 2, semilla=12)


def suelo(dr, x0, base, musgo=False, tierra=False, con_grieta=False):
    y0 = 800
    dr.rectangle([x0, y0, x0 + 31, y0 + 31], fill=base)
    dr.rectangle([x0, y0, x0 + 31, y0 + 31], outline=(28, 30, 38))
    if musgo:
        motas(dr, x0, y0, 32, 32, 14, MUSGO, semilla=21 + x0)
    if tierra:
        motas(dr, x0, y0, 32, 32, 10, [(120, 100, 80), (154, 84, 55)], semilla=22 + x0)
    motas(dr, x0, y0, 32, 32, 5, [GUIJA], semilla=23 + x0)
    if con_grieta:
        grieta(dr, x0, y0, semilla=24)
    else:
        rnd = random.Random(25 + x0)
        x = x0 + rnd.randint(4, 27)
        dr.line([(x, y0 + 4), (x + rnd.randint(-4, 4), y0 + 14),
                 (x + rnd.randint(-4, 4), y0 + 24)], fill=(30, 30, 40), width=1)


def main():
    p = os.path.join(PUB, 'static.png')
    if not os.path.exists(p + '.bak'):
        shutil.copy(p, p + '.bak')
    base = Image.open(p + '.bak').convert('RGBA')
    lienzo = Image.new('RGBA', (W, H_NEW), (0, 0, 0, 0))
    lienzo.paste(base, (0, 0))
    dr = ImageDraw.Draw(lienzo)
    bloque_muro(dr)
    suelo(dr, 0, (44, 46, 58), musgo=True)
    suelo(dr, 32, (62, 52, 44), tierra=True)
    suelo(dr, 64, (44, 46, 58), musgo=True, con_grieta=True)
    lienzo.save(p)

    with open(JSON_PATH) as f:
        raw = f.read()
    viejo = '''"normal": {
            "puntos": [
              {
                "x": 0,
                "y": 800,'''
    nuevo = '''"normal": {
            "puntos": [
              {
                "x": 32,
                "y": 800,'''
    if viejo in raw:
        raw = raw.replace(viejo, nuevo, 1)
        with open(JSON_PATH, 'w') as f:
            f.write(raw)
        json.loads(raw)
        print('suelo.normal -> (32,800)')
    print('static.png 368x832')


if __name__ == '__main__':
    main()
