"""Crea las hojas que faltaban y remata NPCs/comida.

- dynamic.png (128x1088, transparente): puerta cerrada/abierta, trampa
  inactiva/activa x3 y 4 vfx, en las coords que el mapeo ya describe.
- food.png (224x32): 7 comidas de 32px + entradas food.* en el mapeo
  (manzana se re-apunta desde el fichero inexistente food_apple).
- pickaxe.png (32x32): el mapeo ya lo describe, el fichero faltaba.
- npcs.png: pase de outline (1px oscuro en el borde de cada silueta
  mapeada). In-situ, sin mover coords.

Uso: python3 verification/gen_items.py (idempotente, .bak la primera vez)
"""
import json
import os
import shutil
from PIL import Image, ImageDraw

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(REPO, 'public', 'sprites')
JSON_PATH = os.path.join(REPO, 'src', 'config', 'sprites.json')

BORDE = (24, 18, 26, 255)


def backup(nombre):
    p = os.path.join(PUB, nombre)
    if not os.path.exists(p + '.bak') and os.path.exists(p):
        shutil.copy(p, p + '.bak')
    return p


def dynamic():
    img = Image.new('RGBA', (128, 1088), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)

    def puerta(x0, y0, abierta):
        dr.rectangle([x0, y0, x0 + 31, y0 + 31], fill=(47, 44, 57, 255))
        dr.rectangle([x0 + 2, y0 + 2, x0 + 29, y0 + 29], outline=(81, 94, 103, 255))
        if abierta:
            dr.rectangle([x0 + 5, y0 + 4, x0 + 22, y0 + 27], fill=(8, 6, 12, 255))
            dr.rectangle([x0 + 22, y0 + 4, x0 + 27, y0 + 27], fill=(85, 54, 45, 255))
            dr.line([(x0 + 22, y0 + 4), (x0 + 22, y0 + 27)], fill=(154, 84, 55, 255))
        else:
            for i, xx in enumerate((6, 13, 20)):
                dr.rectangle([x0 + xx, y0 + 4, x0 + xx + 5, y0 + 27], fill=(85, 54, 45, 255))
                dr.rectangle([x0 + xx, y0 + 4, x0 + xx + 1, y0 + 27], fill=(154, 84, 55, 255))
                dr.point([(x0 + xx + 3, y0 + 8 + 8 * (i % 2))], fill=(30, 20, 16, 255))
            dr.ellipse([x0 + 20, y0 + 15, x0 + 25, y0 + 20], outline=(200, 200, 210, 255))

    def trampa(x0, y0, activa, fase=0):
        dr.rectangle([x0, y0, x0 + 31, y0 + 31], fill=(44, 46, 58, 255))
        dr.rectangle([x0 + 3, y0 + 3, x0 + 28, y0 + 28], outline=(28, 30, 38, 255))
        if activa:
            for i in range(4):
                bx = x0 + 6 + i * 6
                h = 8 + fase * 4
                dr.polygon([(bx, y0 + 24), (bx + 3, y0 + 24 - h), (bx + 6, y0 + 24)],
                           fill=(120, 130, 145, 255))
                dr.line([(bx + 3, y0 + 24 - h), (bx + 3, y0 + 24)], fill=(220, 230, 240, 255))
            if fase == 2:
                for sx, sy in ((8, 6), (22, 8), (15, 5)):
                    dr.point([(x0 + sx, y0 + sy)], fill=(255, 80, 60, 255))

    puerta(0, 864, False)
    puerta(0, 896, True)
    trampa(0, 928, False)
    for i in range(3):
        trampa(i * 32, 960, True, i)

    # vfx 32px: fuego, hielo, flecha, remolino
    x0, y0 = 0, 1024
    for r, c in ((10, (255, 120, 30, 255)), (7, (255, 200, 80, 255)), (4, (255, 240, 180, 255))):
        dr.ellipse([x0 + 16 - r, y0 + 16 - r, x0 + 16 + r, y0 + 16 + r], fill=c)
    dr.polygon([(32 + 16, 1024 + 4), (32 + 10, 1024 + 20), (32 + 16, 1024 + 28),
                (32 + 22, 1024 + 20)], fill=(140, 220, 255, 255))
    dr.polygon([(32 + 14, 1024 + 8), (32 + 16, 1024 + 12), (32 + 14, 1024 + 22)], fill=(230, 250, 255, 255))
    dr.rectangle([64 + 14, 1024 + 6, 64 + 17, 1024 + 26], fill=(120, 85, 50, 255))
    dr.polygon([(64 + 11, 1024 + 6), (64 + 21, 1024 + 6), (64 + 16, 1024 + 1)], fill=(200, 200, 210, 255))
    dr.line([(64 + 16, 1024 + 26), (64 + 16, 1024 + 30)], fill=(200, 200, 210, 255))
    for r in (11, 8, 5):
        dr.arc([96 + 16 - r, 1024 + 16 - r, 96 + 16 + r, 1024 + 16 + r],
               start=200 - r * 20, end=380 - r * 20, fill=(235, 235, 245, 255), width=2)

    img.save(os.path.join(PUB, 'dynamic.png'))
    print('dynamic.png 128x1088')


def comidas():
    img = Image.new('RGBA', (224, 32), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)

    def manzana(x0):
        dr.ellipse([x0 + 6, 8, x0 + 26, 28], fill=(200, 40, 40, 255))
        dr.ellipse([x0 + 9, 11, x0 + 17, 22], fill=(235, 110, 110, 255))
        dr.line([(x0 + 16, 8), (x0 + 16, 3)], fill=(110, 70, 40, 255), width=2)
        dr.ellipse([x0 + 17, 3, x0 + 25, 9], fill=(60, 150, 60, 255))

    def platano(x0):
        dr.arc([x0 + 4, 6, x0 + 28, 26], start=200, end=340, fill=(235, 210, 80, 255), width=6)
        dr.point([(x0 + 6, 22)], fill=(120, 85, 40, 255))

    def kiwi(x0):
        dr.ellipse([x0 + 6, 6, x0 + 26, 26], fill=(110, 80, 40, 255))
        dr.ellipse([x0 + 9, 9, x0 + 23, 23], fill=(110, 180, 70, 255))
        dr.ellipse([x0 + 13, 13, x0 + 19, 19], fill=(220, 240, 200, 255))

    def brocoli(x0):
        dr.rectangle([x0 + 14, 18, x0 + 18, 28], fill=(190, 200, 150, 255))
        for cx, cy, r in ((12, 12, 6), (20, 10, 7), (16, 16, 6)):
            dr.ellipse([x0 + cx - r, cy - r, x0 + cx + r, cy + r], fill=(45, 140, 60, 255))
        dr.ellipse([x0 + 12, 6, x0 + 18, 12], fill=(90, 190, 100, 255))

    def muslo(x0):
        dr.line([(x0 + 8, 24), (x0 + 16, 16)], fill=(235, 235, 240, 255), width=4)
        dr.ellipse([x0 + 5, 21, x0 + 11, 27], fill=(235, 235, 240, 255))
        dr.ellipse([x0 + 12, 4, x0 + 28, 20], fill=(170, 110, 70, 255))
        dr.ellipse([x0 + 15, 7, x0 + 23, 15], fill=(200, 145, 100, 255))

    def chuleta(x0):
        dr.line([(x0 + 22, 10), (x0 + 28, 4)], fill=(235, 235, 240, 255), width=3)
        dr.ellipse([x0 + 25, 2, x0 + 30, 7], fill=(235, 235, 240, 255))
        dr.ellipse([x0 + 4, 12, x0 + 24, 26], fill=(220, 150, 160, 255))
        dr.ellipse([x0 + 8, 15, x0 + 18, 22], fill=(240, 200, 205, 255))

    def pescado(x0):
        dr.polygon([(x0 + 4, 16), (x0 + 11, 9), (x0 + 11, 23)], fill=(70, 130, 180, 255))
        dr.ellipse([x0 + 10, 9, x0 + 26, 23], fill=(90, 160, 210, 255))
        dr.line([(x0 + 12, 16), (x0 + 24, 16)], fill=(50, 100, 150, 255))
        dr.point([(x0 + 22, 13)], fill=(15, 20, 30, 255))

    for i, fn in enumerate((manzana, platano, kiwi, brocoli, muslo, chuleta, pescado)):
        fn(i * 32)
    img.save(os.path.join(PUB, 'food.png'))
    print('food.png 224x32 (7 comidas)')


def pickaxe():
    img = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    dr.line([(8, 24), (24, 8)], fill=(120, 85, 50, 255), width=4)
    dr.arc([4, 2, 28, 18], start=180, end=360, fill=(150, 155, 165, 255), width=5)
    dr.arc([6, 4, 26, 16], start=180, end=360, fill=(215, 220, 230, 255), width=2)
    img.save(os.path.join(PUB, 'pickaxe.png'))
    print('pickaxe.png 32x32')


def outline_npcs():
    with open(JSON_PATH) as f:
        data = json.load(f)
    p = backup('npcs.png')
    im = Image.open(p).convert('RGBA')
    px = im.load()
    w, h = im.size
    rects = []

    def recoge(nodo):
        if isinstance(nodo, dict):
            if 'puntos' in nodo and 'imagen' in nodo and nodo['imagen'] == 'sheet_npcs':
                rects.extend((pt['x'], pt['y'], pt['w'], pt['h']) for pt in nodo['puntos'])
            else:
                for v in nodo.values():
                    recoge(v)

    recoge(data['mapeo']['npcs'])
    for rx, ry, rw, rh in rects:
        for y in range(max(0, ry - 1), min(h, ry + rh + 1)):
            for x in range(max(0, rx - 1), min(w, rx + rw + 1)):
                if px[x, y][3] == 0:
                    for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                        if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] > 0:
                            px[x, y] = BORDE
                            break
    im.save(p)
    print(f'npcs.png outline en {len(rects)} rects')


def mapeo_food():
    with open(JSON_PATH) as f:
        raw = f.read()
    viejo_rec = '    "sheet_dynamic": "sprites/dynamic.png",'
    nuevo_rec = viejo_rec + '\n    "sheet_food": "sprites/food.png",'
    if '"sheet_food"' not in raw:
        assert viejo_rec in raw
        raw = raw.replace(viejo_rec, nuevo_rec)
    viejo_manz = '"imagen": "food_apple"'
    assert '"imagen": "sheet_food"' in raw or viejo_manz in raw
    raw = raw.replace(viejo_manz, '"imagen": "sheet_food"')
    # Celdas 32px en food.png por nombre de Game.generarObjetos
    celdas = {'plátano': 1, 'kiwi': 2, 'brócoli': 3, 'muslo_de_pollo': 4, 'chuleta': 5, 'pescado': 6}
    for nombre, i in celdas.items():
        if f'"{nombre}"' not in raw:
            ancla = '''      "manzana": {
        "idle": {
          "puntos": [
            {
              "x": 0,
              "y": 0,
              "w": 32,
              "h": 32
            }
          ],
          "imagen": "sheet_food"
        }
      }'''
            assert ancla in raw, 'bloque manzana irreconocible'
            nuevo = ancla + f''',
      "{nombre}": {{
        "idle": {{
          "puntos": [
            {{
              "x": {i * 32},
              "y": 0,
              "w": 32,
              "h": 32
            }}
          ],
          "imagen": "sheet_food"
        }}
      }}'''
            raw = raw.replace(ancla, nuevo)
    with open(JSON_PATH, 'w') as f:
        f.write(raw)
    json.loads(raw)
    print('mapeo food.* completo')


def main():
    dynamic()
    comidas()
    pickaxe()
    outline_npcs()
    mapeo_food()


if __name__ == '__main__':
    main()
