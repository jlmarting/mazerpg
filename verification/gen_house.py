"""Genera el arte de la casa: suelos (madera, baldosa, alfombra), muros de interior
(yeso + zócalo), mobiliario (cama, chimenea, mesa, silla, estante) y el portal con
forma de casita. Escribe `public/sprites/house.png` y registra el mapeo en
`src/config/sprites.json` (grupo `escenario_casa`, prefijo `casa`).

Uso: python3 verification/gen_house.py (idempotente).
"""
import json
import os
import shutil
from PIL import Image, ImageDraw

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(REPO, 'public', 'sprites')
JSON_PATH = os.path.join(REPO, 'src', 'config', 'sprites.json')

W, H = 192, 160
T = 32

MADERA = (138, 90, 43)
MADERA_OSC = (100, 63, 30)
MADERA_CLARA = (168, 116, 60)
BALDOSA_A = (224, 208, 173)
BALDOSA_B = (198, 122, 84)
JUNTA = (150, 140, 120)
ALFOMBRA = (140, 45, 45)
ALFOMBRA_BORDE = (212, 175, 55)
YESO = (203, 184, 148)
YESO_CLARO = (226, 210, 178)
ZOCALO = (92, 58, 34)
MADERA_MUEBLE = (120, 78, 40)
MADERA_MUEBLE_OSC = (86, 54, 28)


def suelo_madera(dr):
    x0, y0 = 0, 0
    dr.rectangle([x0, y0, x0 + T - 1, y0 + T - 1], fill=MADERA)
    for fila in range(4):
        y = y0 + fila * 8
        dr.line([(x0, y), (x0 + T - 1, y)], fill=MADERA_OSC)
    for fila in range(4):
        x = x0 + (8 + fila * 7) % T
        dr.line([(x, y0 + fila * 8), (x, y0 + fila * 8 + 7)], fill=MADERA_OSC)
    for i in range(10):
        gx = x0 + (i * 11 + 3) % T
        gy = y0 + (i * 7 + 2) % T
        dr.line([(gx, gy), (gx + 3, gy)], fill=MADERA_CLARA)


def suelo_baldosa(dr):
    x0, y0 = 32, 0
    dr.rectangle([x0, y0, x0 + T - 1, y0 + T - 1], fill=JUNTA)
    for by in range(2):
        for bx in range(2):
            color = BALDOSA_A if (bx + by) % 2 == 0 else BALDOSA_B
            dr.rectangle([x0 + bx * 16 + 1, y0 + by * 16 + 1,
                          x0 + bx * 16 + 15, y0 + by * 16 + 15], fill=color)


def suelo_alfombra(dr):
    x0, y0 = 64, 0
    dr.rectangle([x0, y0, x0 + T - 1, y0 + T - 1], fill=ALFOMBRA)
    dr.rectangle([x0 + 3, y0 + 3, x0 + T - 4, y0 + T - 4], outline=ALFOMBRA_BORDE, width=2)
    dr.rectangle([x0 + 9, y0 + 9, x0 + T - 10, y0 + T - 10], outline=ALFOMBRA_BORDE, width=1)


def muro(dr):
    x0, y0 = 0, 32
    dr.rectangle([x0, y0, x0 + T - 1, y0 + T - 1], fill=YESO)
    for i in range(0, T, 8):
        dr.line([(x0 + i, y0), (x0 + i, y0 + T - 11)], fill=(189, 170, 134))
    dr.rectangle([x0, y0 + T - 12, x0 + T - 1, y0 + T - 1], fill=ZOCALO)
    dr.line([(x0, y0 + T - 12), (x0 + T - 1, y0 + T - 12)], fill=YESO_CLARO)


def caras(dr):
    # tiras que el autotile pinta en las caras del muro que dan a suelo
    dr.rectangle([0, 32, 31, 37], fill=YESO_CLARO)           # superior
    dr.rectangle([0, 59, 31, 63], fill=ZOCALO)               # inferior
    dr.rectangle([0, 32, 4, 63], fill=(189, 170, 134))       # izquierdo
    dr.rectangle([27, 32, 31, 63], fill=(160, 142, 110))     # derecho


def muebles(dr):
    # cama (0,64)
    x0, y0 = 0, 64
    dr.rectangle([x0 + 4, y0 + 4, x0 + 27, y0 + 27], fill=(120, 80, 45))
    dr.rectangle([x0 + 5, y0 + 5, x0 + 26, y0 + 20], fill=(220, 220, 230))
    dr.rectangle([x0 + 5, y0 + 5, x0 + 26, y0 + 11], fill=(245, 245, 250))
    dr.rectangle([x0 + 5, y0 + 14, x0 + 26, y0 + 27], fill=(150, 60, 60))
    # chimenea (32,64)
    x0 = 32
    dr.rectangle([x0 + 5, y0 + 6, x0 + 26, y0 + 27], fill=(120, 110, 100))
    dr.rectangle([x0 + 11, y0 + 12, x0 + 20, y0 + 27], fill=(40, 30, 26))
    dr.rectangle([x0 + 12, y0 + 20, x0 + 19, y0 + 26], fill=(240, 150, 40))
    dr.rectangle([x0 + 14, y0 + 23, x0 + 17, y0 + 26], fill=(255, 220, 90))
    # mesa (64,64)
    x0 = 64
    dr.rectangle([x0 + 4, y0 + 11, x0 + 27, y0 + 17], fill=MADERA_MUEBLE)
    dr.rectangle([x0 + 6, y0 + 17, x0 + 9, y0 + 27], fill=MADERA_MUEBLE_OSC)
    dr.rectangle([x0 + 22, y0 + 17, x0 + 25, y0 + 27], fill=MADERA_MUEBLE_OSC)
    # silla (96,64)
    x0 = 96
    dr.rectangle([x0 + 9, y0 + 8, x0 + 22, y0 + 15], fill=MADERA_MUEBLE)
    dr.rectangle([x0 + 10, y0 + 15, x0 + 21, y0 + 20], fill=MADERA_MUEBLE_OSC)
    dr.rectangle([x0 + 10, y0 + 20, x0 + 12, y0 + 27], fill=MADERA_MUEBLE_OSC)
    dr.rectangle([x0 + 19, y0 + 20, x0 + 21, y0 + 27], fill=MADERA_MUEBLE_OSC)
    # estante (128,64)
    x0 = 128
    dr.rectangle([x0 + 5, y0 + 4, x0 + 26, y0 + 27], fill=MADERA_MUEBLE)
    for yy in (10, 17, 24):
        dr.line([(x0 + 5, y0 + yy), (x0 + 26, y0 + yy)], fill=MADERA_MUEBLE_OSC)
    libros = [(220, 70, 70), (70, 120, 200), (90, 180, 90), (230, 200, 80)]
    for i, col in enumerate(libros):
        dr.rectangle([x0 + 7 + i * 5, y0 + 5, x0 + 10 + i * 5, y0 + 9], fill=col)
        dr.rectangle([x0 + 6 + i * 5, y0 + 12, x0 + 9 + i * 5, y0 + 16], fill=col)


def portal_casita(dr):
    x0, y0 = 0, 96
    # tejado
    dr.polygon([(x0 + 16, y0 + 3), (x0 + 3, y0 + 14), (x0 + 29, y0 + 14)], fill=(170, 70, 50))
    dr.polygon([(x0 + 16, y0 + 3), (x0 + 3, y0 + 14), (x0 + 16, y0 + 14)], fill=(140, 55, 40))
    # cuerpo
    dr.rectangle([x0 + 5, y0 + 14, x0 + 27, y0 + 28], fill=(232, 218, 188))
    dr.rectangle([x0 + 5, y0 + 14, x0 + 27, y0 + 15], fill=(200, 182, 150))
    # puerta
    dr.rectangle([x0 + 13, y0 + 20, x0 + 19, y0 + 28], fill=(110, 70, 35))
    # ventana
    dr.rectangle([x0 + 7, y0 + 17, x0 + 11, y0 + 22], fill=(120, 170, 200))
    dr.rectangle([x0 + 21, y0 + 17, x0 + 25, y0 + 22], fill=(120, 170, 200))


def rect(x, y, w, h):
    return {"x": x, "y": y, "w": w, "h": h}


def actualizar_json():
    with open(JSON_PATH) as f:
        data = json.load(f)
    data['recursos']['sheet_house'] = 'sprites/house.png'
    data['mapeo']['escenario_casa'] = {
        'suelo': {
            'normal':  {'puntos': [rect(0, 0, T, T)],           'imagen': 'sheet_house'},
            'madera':  {'puntos': [rect(0, 0, T, T)],           'imagen': 'sheet_house'},
            'baldosa': {'puntos': [rect(32, 0, T, T)],          'imagen': 'sheet_house'},
            'alfombra': {'puntos': [rect(64, 0, T, T)],         'imagen': 'sheet_house'},
        },
        'muro': {
            'normal':    {'puntos': [rect(0, 32, T, T)],  'imagen': 'sheet_house'},
            'superior':  {'puntos': [rect(0, 32, T, 6)],  'imagen': 'sheet_house'},
            'inferior':  {'puntos': [rect(0, 58, T, 6)],  'imagen': 'sheet_house'},
            'izquierdo': {'puntos': [rect(0, 32, 5, T)],  'imagen': 'sheet_house'},
            'derecho':   {'puntos': [rect(27, 32, 5, T)], 'imagen': 'sheet_house'},
        },
        'mueble': {
            'cama':     {'puntos': [rect(0, 64, T, T)],   'imagen': 'sheet_house'},
            'chimenea': {'puntos': [rect(32, 64, T, T)],  'imagen': 'sheet_house'},
            'mesa':     {'puntos': [rect(64, 64, T, T)],  'imagen': 'sheet_house'},
            'silla':    {'puntos': [rect(96, 64, T, T)],  'imagen': 'sheet_house'},
            'estante':  {'puntos': [rect(128, 64, T, T)], 'imagen': 'sheet_house'},
        },
        'portal': {
            'casita': {'puntos': [rect(0, 96, T, T)], 'imagen': 'sheet_house'},
        },
    }
    with open(JSON_PATH, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')


def main():
    p = os.path.join(PUB, 'house.png')
    if os.path.exists(p) and not os.path.exists(p + '.bak'):
        shutil.copy(p, p + '.bak')
    lienzo = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(lienzo)
    suelo_madera(dr)
    suelo_baldosa(dr)
    suelo_alfombra(dr)
    muro(dr)
    caras(dr)
    muebles(dr)
    portal_casita(dr)
    lienzo.save(p)
    actualizar_json()
    print(f'house.png {W}x{H} + sprites.json (escenario_casa)')


if __name__ == '__main__':
    main()
