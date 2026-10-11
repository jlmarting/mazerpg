"""Piezas v1: overlays programáticos + registro (receta versionada).

Uso (desde la raíz del repo):
    python3 scripts/gen_piezas.py [--apply]

Sin --apply: verifica base intactos e imprime resumen (variantes × frames).
Con --apply: escribe `public/sprites/pieces.png`, `src/config/piezas.json`
y matrices a `verification/`.

Variantes v1:
  pelo-largo-f (overlay, generos [f]) · peto-f (remap fijo, [f]) ·
  botas-f (remap fijo, [f]) · casco (overlay, [m,f]).
Frames: idle/walking/attacking × 3 clases × M/F. Caídos/defensa excluidos.
Overlays = capas del tamaño del frame (ancla 0,0: robusto ante poses).
"""
import hashlib
import json
import os
import sys

from PIL import Image, ImageDraw

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# --- Receta v1 (versionada) ---
PELO_EXTRA = 9
PELO_VOLUMEN = 3
PELO_FILAS = (0.26, 0.54)
CASCO_ALTO = 8
CASCO_COLOR = (70, 90, 160, 255)
CASCO_BORDE = (20, 26, 48, 255)
CASCO_CRESTA = (200, 60, 60, 255)
PET0_PALETA = {'torso': '#b76e79'}   # acero rosado (nota: nombre histórico)
BOTAS_PALETA = {'piernas': '#6b4a2f'}  # cuero
UMBRAL = 40

TONOS_PELO = {
    'explorador': [(74, 48, 26), (139, 90, 43)],
    'mago': [(70, 60, 90), (205, 205, 225)],
    'guerrero': [(90, 34, 32), (161, 150, 144)],
}
ANCLA_PELO = {'explorador': (74, 48, 26), 'mago': (70, 60, 90), 'guerrero': (90, 34, 32)}
CLASES = ('explorador', 'mago', 'guerrero')
ESTADOS = ('idle', 'walking', 'attacking')
GENEROS = ('m', 'f')


def cerca(px, tonos, umbral=UMBRAL):
    return any((px[0] - t[0]) ** 2 + (px[1] - t[1]) ** 2 + (px[2] - t[2]) ** 2 <= umbral * umbral for t in tonos)


def anclar(px, tonos, ancla):
    best = min(tonos, key=lambda t: (px[0] - t[0]) ** 2 + (px[1] - t[1]) ** 2 + (px[2] - t[2]) ** 2)
    return (max(0, min(255, ancla[0] + (px[0] - best[0]))),
            max(0, min(255, ancla[1] + (px[1] - best[1]))),
            max(0, min(255, ancla[2] + (px[2] - best[2]))), px[3])


def cabeza_metricas(crop):
    """(cx, y_min, semiancho) de la masa superior."""
    w, h = crop.size
    px = crop.load()
    xs = [i for j in range(0, h // 3 + 2) for i in range(w) if px[i, j][3] > 128]
    if not xs:
        return w // 2, 0, w // 4
    ymin = min(j for j in range(h) for i in range(w) if px[i, j][3] > 128)
    return sum(xs) // len(xs), ymin, (max(xs) - min(xs)) // 2


def capa_pelo_largo(crop, clase):
    """Melena hasta hombros con volumen, anclada al tono de clase."""
    w, h = crop.size
    px = crop.load()
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    op = out.load()
    tonos = TONOS_PELO[clase]
    for i in range(w):
        col = [j for j in range(0, int(h * 0.38)) if px[i, j][3] > 128 and cerca(px[i, j][:3], tonos)]
        if not col:
            continue
        for j in range(max(col) + 1, min(max(col) + 1 + PELO_EXTRA, h)):
            if op[i, j][3] <= 128 and px[i, j][3] <= 128:
                op[i, j] = anclar(px[i, max(col)], tonos, ANCLA_PELO[clase])
    for j in range(int(h * PELO_FILAS[0]), int(h * PELO_FILAS[1])):
        xs = [i for i in range(w) if op[i, j][3] > 128 and cerca(op[i, j][:3], tonos)]
        base = [i for i in range(w) if px[i, j][3] > 128 and cerca(px[i, j][:3], tonos)]
        xs = xs or base
        if not xs:
            continue
        for di in range(1, PELO_VOLUMEN + 1):
            if min(xs) - di >= 0 and op[min(xs) - di, j][3] <= 128 and px[min(xs) - di, j][3] <= 128:
                op[min(xs) - di, j] = anclar(op[min(xs), j], tonos, ANCLA_PELO[clase])
            if max(xs) + di < w and op[max(xs) + di, j][3] <= 128 and px[max(xs) + di, j][3] <= 128:
                op[max(xs) + di, j] = anclar(op[max(xs), j], tonos, ANCLA_PELO[clase])
    return out


def capa_casco(crop):
    """Yelmo: domo + visera + cresta, dimensionado a la cabeza medida."""
    w, h = crop.size
    cx, ymin, semi = cabeza_metricas(crop)
    cw, chh = semi * 2 + 6, CASCO_ALTO
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x0, x1 = cx - cw // 2, cx + cw // 2
    y0, y1 = max(0, ymin - chh + 2), ymin + 2
    d.rounded_rectangle([x0, y0, x1, y1], radius=3, fill=CASCO_COLOR, outline=CASCO_BORDE, width=1)
    d.line([cx, max(0, y0 - 2), cx, y0], fill=CASCO_CRESTA, width=2)
    d.line([x0 + 3, y1 - 2, x1 - 3, y1 - 2], fill=CASCO_BORDE, width=1)
    return img


def sha(ruta):
    with open(ruta, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def main():
    aplicar = '--apply' in sys.argv
    cfg = json.load(open(os.path.join(RAIZ, 'src', 'config', 'sprites.json')))
    hojas = {
        ('m', 'sheet_players'): os.path.join(RAIZ, 'public', 'sprites', 'players.png'),
        ('m', 'hero_custom'): os.path.join(RAIZ, 'public', 'sprites', 'hero_custom.png'),
        ('f', 'sheet_players_f'): os.path.join(RAIZ, 'public', 'sprites', 'players_f.png'),
        ('f', 'hero_custom_f'): os.path.join(RAIZ, 'public', 'sprites', 'hero_custom_f.png'),
    }
    imgs = {k: Image.open(v).convert('RGBA') for k, v in hojas.items()}
    antes = {k: sha(v) for k, v in hojas.items()}

    variantes = {
        'pelo-largo-f': {'ranura': 'pelo', 'generos': ['f'], 'tipo': 'overlay'},
        'peto-f': {'ranura': 'torso', 'generos': ['f'], 'tipo': 'remap', 'paleta': {'torso': '#b76e79'}},
        'botas-f': {'ranura': 'piernas', 'generos': ['f'], 'tipo': 'remap', 'paleta': {'piernas': '#6b4a2f'}},
        'casco': {'ranura': 'casco', 'generos': ['m', 'f'], 'tipo': 'overlay'},
    }
    capas = {}  # (variante, frameKey) -> Image
    anclas = {}
    for clase in CLASES:
        for est in ESTADOS:
            info = cfg['mapeo']['jugadores'][clase][est]
            for idx, p in enumerate(info['puntos']):
                box = (p['x'], p['y'], p['x'] + p['w'], p['y'] + p['h'])
                for g in GENEROS:
                    hoja = info['imagen'] if g == 'm' else info['imagen'].replace('sheet_players', 'sheet_players_f').replace('hero_custom', 'hero_custom_f')
                    base = imgs[(g, hoja)].crop(box)
                    fk = f'{clase}_{g}_{est}_{idx}'
                    if g == 'f':
                        capas[('pelo-largo-f', fk)] = capa_pelo_largo(base, clase)
                    capas[('casco', fk)] = capa_casco(base)
                    anclas.setdefault('pelo-largo-f', {})[fk] = {'dx': 0, 'dy': 0, 'w': base.width, 'h': base.height}
                    anclas.setdefault('casco', {})[fk] = {'dx': 0, 'dy': 0, 'w': base.width, 'h': base.height}

    for v in variantes:
        variantes[v]['anclas'] = anclas.get(v, {})
    n_overlays = sum(1 for k in capas)
    print(f'variantes: {sorted(variantes)} | overlays: {n_overlays} | base intactos: {all(sha(v) == antes[k] for k, v in hojas.items())}')

    if not aplicar:
        print('--- modo lectura (sin escritura) ---')
        return

    # Atlas: cuadrícula de capas (todas del mismo... tamaños mixtos: empaquetar por filas)
    items = sorted(capas.items())
    cols = 8
    W = max(im.width for _, im in items)
    H = max(im.height for _, im in items)
    atlas = Image.new('RGBA', (W * cols, H * ((len(items) + cols - 1) // cols)), (0, 0, 0, 0))
    rects = {}
    for n, ((v, fk), im) in enumerate(items):
        cx, cy = (n % cols) * W, (n // cols) * H
        atlas.paste(im, (cx, cy), im)
        rects[f'{v}|{fk}'] = {'x': cx, 'y': cy, 'w': im.width, 'h': im.height}
    atlas.save(os.path.join(RAIZ, 'public', 'sprites', 'pieces.png'))
    doc = {'variantes': variantes, 'rects': rects, 'atlas_celda': {'w': W, 'h': H}}
    json.dump(doc, open(os.path.join(RAIZ, 'src', 'config', 'piezas.json'), 'w'), indent=1)
    print(f'escrito pieces.png ({atlas.size}) + piezas.json')

    # Matriz: base | +piezas (pelo-largo+peto+botas+casco en F; casco en M)
    CELL = 48
    filas = []
    for clase in CLASES:
        for est in ESTADOS:
            info = cfg['mapeo']['jugadores'][clase][est]
            p = info['puntos'][0]
            box = (p['x'], p['y'], p['x'] + p['w'], p['y'] + p['h'])
            for g in GENEROS:
                hoja = info['imagen'] if g == 'm' else info['imagen'].replace('sheet_players', 'sheet_players_f').replace('hero_custom', 'hero_custom_f')
                base = imgs[(g, hoja)].crop(box)
                comp = base.copy()
                fk = f'{clase}_{g}_{est}_0'
                for v in (['casco'] if g == 'm' else ['pelo-largo-f', 'casco']):
                    key = (v, fk)
                    if key in capas:
                        comp.alpha_composite(capas[key], (0, 0))
                if g == 'f':
                    comp = aplicar_remap_fijo(comp, clase, {'torso': (183, 110, 121), 'piernas': (107, 74, 47)})
                filas.append((f'{clase}/{g}/{est}', base, comp))
    sheet = Image.new('RGB', (CELL * 3, CELL * len(filas)), (20, 20, 20))
    for fi, (_, b, c) in enumerate(filas):
        for ci, t in enumerate([b, c]):
            t = t.resize((CELL, CELL), Image.NEAREST)
            sheet.paste(t, (CELL * (ci + 1), CELL * fi), t if t.mode == 'RGBA' else None)
    sheet.save(os.path.join(RAIZ, 'verification', 'avatar-matriz-piezas.png'))
    print('matriz -> verification/avatar-matriz-piezas.png')


def aplicar_remap_fijo(crop, clase, paleta):
    """Espejo del remap de pieza (validación visual): tonos ORIGEN + bandas v1."""
    ORIGEN = {
        'explorador': {'torso': [(20, 60, 30), (46, 120, 60)], 'piernas': [(139, 90, 43)]},
        'mago': {'torso': [(45, 20, 85), (105, 60, 175)], 'piernas': [(205, 205, 225)]},
        'guerrero': {'torso': [(82, 91, 116), (19, 31, 58)], 'piernas': [(215, 207, 192), (49, 0, 4)]},
    }
    BANDAS = {'torso': (0.40, 0.70), 'piernas': (0.62, 1.0)}
    w, h = crop.size
    out = crop.copy()
    px = out.load()
    for j in range(h):
        yf = (j + 0.5) / h
        for i in range(w):
            r, g, b, a = px[i, j]
            if a == 0:
                continue
            for zona, dest in paleta.items():
                y0, y1 = BANDAS[zona]
                if not (y0 <= yf <= y1):
                    continue
                best = min(ORIGEN[clase][zona], key=lambda t: (r - t[0]) ** 2 + (g - t[1]) ** 2 + (b - t[2]) ** 2)
                if (r - best[0]) ** 2 + (g - best[1]) ** 2 + (b - best[2]) ** 2 <= 1600:
                    px[i, j] = (max(0, min(255, dest[0] + (r - best[0]))),
                                max(0, min(255, dest[1] + (g - best[1]))),
                                max(0, min(255, dest[2] + (b - best[2]))), a)
                    break
    return out


if __name__ == '__main__':
    main()
