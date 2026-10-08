"""Completa las hojas de sprites segun sprites.json (el mapeo manda).

- players.png: convierte fondo blanco a transparente, extiende a 307x480 y
  pinta bloques explorador (y 192-320) y mago (y 320-480) por swap de paleta
  sobre los frames del guerrero. Solo se recolorea pelo + armadura.
- hero_custom.png: recorte de la fila de ataque de players.png (el mapeo ya
  describe esas coords; el fichero faltaba).
- La entrada explorador/idle se mueve en sprites.json de (0,160) — una figura
  tumbada — al frame nuevo (32,256). Resto del mapeo intacto.

Uso: python3 verification/gen_players.py  (idempotente: parte siempre de las
hojas actuales; hace backup .bak la primera vez)
"""
import json
import math
import os
import shutil
from PIL import Image, ImageDraw

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(REPO, 'public', 'sprites')
JSON_PATH = os.path.join(REPO, 'src', 'config', 'sprites.json')

W, H_OLD, H_NEW = 307, 205, 480

PELO_OSCURO = (88, 26, 25)
PELO = (145, 38, 25)
ARMADURA_OSCURA = (15, 40, 89)
ARMADURA = (22, 85, 159)

PALETAS = {
    'explorador': {
        PELO_OSCURO: (74, 48, 26),
        PELO: (139, 90, 43),
        ARMADURA_OSCURA: (20, 60, 30),
        ARMADURA: (46, 120, 60),
    },
    'mago': {
        PELO_OSCURO: (70, 60, 90),
        PELO: (205, 205, 225),
        ARMADURA_OSCURA: (45, 20, 85),
        ARMADURA: (105, 60, 175),
    },
}
SRC = list(PALETAS['explorador'].keys())


def dist(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a[:3], b[:3])))


def recolor(im, paleta):
    im = im.convert('RGBA')
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            p = px[x, y]
            if p[3] == 0:
                continue
            mejor, mejor_d = None, 1e9
            for s in SRC:
                d = dist(p, s)
                if d < mejor_d:
                    mejor, mejor_d = s, d
            if mejor is not None and mejor_d < 40:
                r, g, b = paleta[mejor]
                px[x, y] = (r, g, b, p[3])
    return im


from collections import deque


def fondo_transparente(im):
    # Limpia el blanco de fondo conectado al borde (respeta blancos interiores
    # encerrados por el outline). BFS sobre mascara de casi-blanco.
    w, h = im.size
    px = im.load()
    cerca = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            r, g, b, _a = px[x, y]
            if r > 195 and g > 195 and b > 195:
                cerca[y * w + x] = 1
    visto = bytearray(w * h)
    cola = deque()
    for x in range(w):
        for y in (0, h - 1):
            if cerca[y * w + x]:
                cola.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if cerca[y * w + x]:
                cola.append((x, y))
    while cola:
        x, y = cola.popleft()
        i = y * w + x
        if visto[i] or not cerca[i]:
            continue
        visto[i] = 1
        px[x, y] = (0, 0, 0, 0)
        if x > 0:
            cola.append((x - 1, y))
        if x < w - 1:
            cola.append((x + 1, y))
        if y > 0:
            cola.append((x, y - 1))
        if y < h - 1:
            cola.append((x, y + 1))
    return im


def main():
    players_path = os.path.join(PUB, 'players.png')
    bak_path = players_path + '.bak'
    if not os.path.exists(bak_path):
        shutil.copy(players_path, bak_path)
    # Idempotente: se parte siempre del original para que el BFS vea el
    # damero de fondo conectado al borde.
    base = fondo_transparente(Image.open(bak_path).convert('RGBA'))

    # hero_custom.png = fila de ataque (coords que el mapeo ya describe, en
    # espacio players: recorte (0,0)-(271,139) para que y~104-139 encaje)
    hero = base.crop((0, 0, 271, 139))
    hero.save(os.path.join(PUB, 'hero_custom.png'))

    # Lienzo extendido: contenido viejo intacto (mismas coords)
    lienzo = Image.new('RGBA', (W, H_NEW), (0, 0, 0, 0))
    lienzo.paste(base, (0, 0))

    guerrero_idle = (44, 12, 24, 32)
    guerrero_walk = [(37, 55, 32, 32), (98, 14, 32, 32), (96, 54, 32, 32)]
    guerrero_attack = [(56, 104, 32, 32), (150, 104, 32, 32), (218, 104, 32, 32)]
    guerrero_defend = (0, 96, 32, 32)
    # Fila de tumbados real (los rects viejos de fallen apuntaban a vacio)
    guerrero_fallen = [(54, 160, 32, 32), (111, 160, 32, 32), (168, 160, 32, 32)]

    bloques = {
        'explorador': {
            'base_y': 192,
            'idle_dst': (32, 256),
            'walk_dst': [(0, 192), (32, 192), (64, 192)],
            'attack_dst': [(0, 224), (32, 224), (64, 224)],
            'defend_dst': (0, 256),
            'fallen_dst': [(0, 288), (32, 288), (64, 288)],
        },
        'mago': {
            'base_y': 320,
            'idle_dst': (0, 320),
            'walk_dst': [(0, 352), (32, 352), (64, 352)],
            'attack_dst': [(0, 384), (32, 384), (64, 384)],
            'defend_dst': (0, 416),
            'fallen_dst': [(0, 448), (32, 448), (64, 448)],
        },
    }
    for clase, b in bloques.items():
        pal = PALETAS[clase]
        ix, iy = guerrero_idle[0], guerrero_idle[1]
        idle = base.crop((ix, iy, ix + 24, iy + 32))
        idle = recolor(idle, pal)
        dx, dy = b['idle_dst']
        lienzo.paste(idle, (dx + 4, dy), idle)
        for (sx, sy, sw, sh), (dx, dy) in zip(guerrero_walk, b['walk_dst']):
            c = recolor(base.crop((sx, sy, sx + sw, sy + sh)), pal)
            lienzo.paste(c, (dx, dy), c)
        for (sx, sy, sw, sh), (dx, dy) in zip(guerrero_attack, b['attack_dst']):
            c = recolor(base.crop((sx, sy, sx + sw, sy + sh)), pal)
            lienzo.paste(c, (dx, dy), c)
        sx, sy, sw, sh = guerrero_defend
        c = recolor(base.crop((sx, sy, sx + sw, sy + sh)), pal)
        lienzo.paste(c, b['defend_dst'], c)
        for (sx, sy, sw, sh), (dx, dy) in zip(guerrero_fallen, b['fallen_dst']):
            c = recolor(base.crop((sx, sy, sx + sw, sy + sh)), pal)
            lienzo.paste(c, (dx, dy), c)

    lienzo.save(players_path)

    # Unico retoque JSON: explorador/idle (0,160) era una figura tumbada
    with open(JSON_PATH) as f:
        raw = f.read()
    viejo = '"explorador": {\n        "idle": {\n          "puntos": [\n            {\n              "x": 0,\n              "y": 160,'
    nuevo = '"explorador": {\n        "idle": {\n          "puntos": [\n            {\n              "x": 32,\n              "y": 256,'
    assert nuevo in raw or viejo in raw, 'entrada explorador/idle irreconocible'
    raw = raw.replace(viejo, nuevo)

    # Guerrero fallen apuntaba a vacio/fragmentos (y=128): a tumbados reales
    viejo_f = '''"x": 0,
              "y": 128,'''
    assert raw.count(viejo_f) == 1, 'fallen guerrero ambiguo o ya migrado'
    raw = raw.replace('"x": 0,\n              "y": 128,', '"x": 54,\n              "y": 160,')
    raw = raw.replace('"x": 32,\n              "y": 128,', '"x": 111,\n              "y": 160,')
    raw = raw.replace('"x": 64,\n              "y": 128,', '"x": 168,\n              "y": 160,')
    with open(JSON_PATH, 'w') as f:
        f.write(raw)
    json.loads(raw)
    print('players.png 307x480 + hero_custom.png + idle explorador -> (32,256)')


if __name__ == '__main__':
    main()
