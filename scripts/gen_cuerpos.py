"""Cuerpos F por derivación programática (receta v3, validada en matriz M/F).

Uso (desde la raíz del repo):
    python3 scripts/gen_cuerpos.py [--apply]

Sin --apply: modo lectura — verifica que los sheets base no cambian e imprime
el bloque `jugadoras` para `src/config/sprites.json` (revisar a mano).
Con --apply: escribe `public/sprites/players_f.png`, `hero_custom_f.png`
y parchea `sprites.json` (recursos + `mapeo.jugadoras`, misma geometría).

Receta v3 (params abajo, versionados aquí — nada mágico fuera):
  cadera +1px/lado (filas CADERA_FILAS) · pelo +PELO_EXTRA filas + volumen
  lateral anclado a ANCLA_PELO · hombros/cintura oscurecidos · busto sutil.
Re-ejecutable: dos pasadas generan bytes idénticos (los _f se derivan de los
base, nunca de sí mismos).
"""
import hashlib
import io
import json
import os
import sys

from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# --- Receta v3 (versionada) ---
CADERA_FILAS = (0.66, 0.82)
PELO_EXTRA = 6
PELO_BANDA_TOP = 0.38
VOLUMEN_FILAS = (0.30, 0.50)
SOMBRA_FILAS = (0.42, 0.45, 0.58, 0.61, 0.64)
SOMBRA_FACTOR = 0.65
BUSTO_FILA = 0.50
BUSTO_DELTA = 30
UMBRAL = 40

TONOS_PELO = {
    'explorador': [(74, 48, 26), (139, 90, 43)],
    'mago': [(70, 60, 90), (205, 205, 225)],
    'guerrero': [(90, 34, 32), (161, 150, 144)],
}
ANCLA_PELO = {'explorador': (74, 48, 26), 'mago': (70, 60, 90), 'guerrero': (90, 34, 32)}
CLASES = ('explorador', 'mago', 'guerrero')
ESTADOS = ('idle', 'walking', 'attacking', 'defending', 'fallen')


def cerca(px, tonos, umbral=UMBRAL):
    return any((px[0] - t[0]) ** 2 + (px[1] - t[1]) ** 2 + (px[2] - t[2]) ** 2 <= umbral * umbral for t in tonos)


def anclar(px, tonos, ancla):
    best = min(tonos, key=lambda t: (px[0] - t[0]) ** 2 + (px[1] - t[1]) ** 2 + (px[2] - t[2]) ** 2)
    return (max(0, min(255, ancla[0] + (px[0] - best[0]))),
            max(0, min(255, ancla[1] + (px[1] - best[1]))),
            max(0, min(255, ancla[2] + (px[2] - best[2]))), px[3])


def centro_cabeza(crop):
    w, h = crop.size
    px = crop.load()
    xs = [i for j in range(0, h // 3 + 2) for i in range(w) if px[i, j][3] > 128]
    return sum(xs) // len(xs) if xs else w // 2


def oscurecer(px, f):
    r, g, b, a = px
    return (int(r * f), int(g * f), int(b * f), a)


def aclarar(px, d):
    r, g, b, a = px
    return (min(255, r + d), min(255, g + d), min(255, b + d), a)


def derivar(sheet, box, clase):
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    crop = sheet.crop(box).copy()
    px = crop.load()
    tonos = TONOS_PELO[clase]
    for rj in range(int(h * CADERA_FILAS[0]), int(h * CADERA_FILAS[1])):
        xs = [i for i in range(w) if px[i, rj][3] > 128]
        if not xs:
            continue
        ini = prev = xs[0]
        rachas = []
        for i in xs[1:]:
            if i == prev + 1:
                prev = i
            else:
                rachas.append((ini, prev))
                ini = prev = i
        rachas.append((ini, prev))
        for a, b in rachas:
            if a - 1 >= 0 and px[a - 1, rj][3] <= 128:
                px[a - 1, rj] = px[a, rj]
            if b + 1 < w and px[b + 1, rj][3] <= 128:
                px[b + 1, rj] = px[b, rj]
    for i in range(w):
        col_pelo = [j for j in range(0, int(h * PELO_BANDA_TOP))
                    if px[i, j][3] > 128 and cerca(px[i, j][:3], tonos)]
        if not col_pelo:
            continue
        for j in range(max(col_pelo) + 1, min(max(col_pelo) + 1 + PELO_EXTRA, h)):
            if px[i, j][3] <= 128:
                px[i, j] = anclar(px[i, max(col_pelo)], tonos, ANCLA_PELO[clase])
    for j in range(int(h * VOLUMEN_FILAS[0]), int(h * VOLUMEN_FILAS[1])):
        xs = [i for i in range(w) if px[i, j][3] > 128 and cerca(px[i, j][:3], tonos)]
        if not xs:
            continue
        if min(xs) - 1 >= 0 and px[min(xs) - 1, j][3] <= 128:
            px[min(xs) - 1, j] = anclar(px[min(xs), j], tonos, ANCLA_PELO[clase])
        if max(xs) + 1 < w and px[max(xs) + 1, j][3] <= 128:
            px[max(xs) + 1, j] = anclar(px[max(xs), j], tonos, ANCLA_PELO[clase])
    for r in SOMBRA_FILAS:
        rj = int(h * r)
        if rj >= h:
            continue
        xs = [i for i in range(w) if px[i, rj][3] > 128]
        if len(xs) < 6:
            continue
        px[min(xs), rj] = oscurecer(px[min(xs), rj], SOMBRA_FACTOR)
        px[max(xs), rj] = oscurecer(px[max(xs), rj], SOMBRA_FACTOR)
    cx = centro_cabeza(crop)
    by = int(h * BUSTO_FILA)
    for bx in (cx - 2, cx + 2):
        if 0 <= bx < w and px[bx, by][3] > 128:
            px[bx, by] = aclarar(px[bx, by], BUSTO_DELTA)
    return crop


def sha(ruta):
    with open(ruta, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def main():
    aplicar = '--apply' in sys.argv
    cfg_ruta = os.path.join(RAIZ, 'src', 'config', 'sprites.json')
    hojas = {
        'sheet_players': os.path.join(RAIZ, 'public', 'sprites', 'players.png'),
        'hero_custom': os.path.join(RAIZ, 'public', 'sprites', 'hero_custom.png'),
    }
    cfg = json.load(open(cfg_ruta))
    antes = {h: sha(r) for h, r in hojas.items()}
    imgs = {h: Image.open(r).convert('RGBA') for h, r in hojas.items()}
    salidas = {h: Image.open(r).convert('RGBA') for h, r in hojas.items()}

    cajas_por_hoja = {h: 0 for h in hojas}
    for clase in CLASES:
        for est in ESTADOS:
            info = cfg['mapeo']['jugadores'][clase][est]
            hoja = info['imagen']
            for p in info['puntos']:
                box = (p['x'], p['y'], p['x'] + p['w'], p['y'] + p['h'])
                fem = derivar(imgs[hoja], box, clase)
                salidas[hoja].paste(fem, (p['x'], p['y']), fem)
                cajas_por_hoja[hoja] += 1

    # Los base no se tocan: verificación antes de escribir nada
    assert all(sha(r) == antes[h] for h, r in hojas.items()), 'los sheets base cambiaron a mitad de receta'
    print(f'cajas derivadas: {cajas_por_hoja} (base intactos)')

    destinos = {
        'sheet_players': os.path.join(RAIZ, 'public', 'sprites', 'players_f.png'),
        'hero_custom': os.path.join(RAIZ, 'public', 'sprites', 'hero_custom_f.png'),
    }
    jugadoras = {}
    for clase in CLASES:
        jugadoras[clase] = {}
        for est in ESTADOS:
            info = cfg['mapeo']['jugadores'][clase][est]
            hoja_f = 'sheet_players_f' if info['imagen'] == 'sheet_players' else 'hero_custom_f'
            jugadoras[clase][est] = {'imagen': hoja_f, 'puntos': info['puntos']}

    if not aplicar:
        print('--- modo lectura: bloque `jugadoras` para sprites.json ---')
        print(json.dumps(jugadoras, indent=1)[:500] + ' ...')
        print('recursos: "sheet_players_f": "sprites/players_f.png", "hero_custom_f": "sprites/hero_custom_f.png"')
        return

    for h, img in salidas.items():
        img.save(destinos[h])
        print(f'escrito {destinos[h]}')
    cfg['recursos']['sheet_players_f'] = 'sprites/players_f.png'
    cfg['recursos']['hero_custom_f'] = 'sprites/hero_custom_f.png'
    cfg['mapeo']['jugadoras'] = jugadoras
    json.dump(cfg, open(cfg_ruta, 'w'), indent=1, ensure_ascii=False)
    print(f'parcheado {cfg_ruta} (recursos + mapeo.jugadoras)')

    despues = {h: sha(r) for h, r in hojas.items()}
    assert all(despues[h] == antes[h] for h in hojas), 'los sheets base cambiaron'


if __name__ == '__main__':
    main()
