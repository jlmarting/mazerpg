"""Auditoria sprites.json contra las hojas reales.

Comprueba por cada entrada del mapeo:
  1. que el fichero de imagen exista en public/
  2. que cada rect (x, y, w, h) este dentro de los bounds y tenga area > 0

Uso:  python verification/verify_sprites.py [--strict]
Salida distinta de 0 si hay errores (o avisos con --strict).
"""
import json
import os
import sys
from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSON_PATH = os.path.join(REPO, 'src', 'config', 'sprites.json')
PUBLIC = os.path.join(REPO, 'public')


def iter_puntos(mapeo, path=()):
    if isinstance(mapeo, dict):
        if set(mapeo.keys()) == {'imagen', 'puntos'} or ('puntos' in mapeo and 'imagen' in mapeo):
            yield path, mapeo
            return
        for k, v in mapeo.items():
            yield from iter_puntos(v, path + (k,))
    elif isinstance(mapeo, list):
        for i, v in enumerate(mapeo):
            yield from iter_puntos(v, path + (i,))


def main() -> int:
    strict = '--strict' in sys.argv
    with open(JSON_PATH) as f:
        data = json.load(f)
    recursos = data.get('recursos', {})
    mapeo = data.get('mapeo', {})

    errores = []
    avisos = []
    revisados = 0
    for path, nodo in iter_puntos(mapeo):
        revisados += 1
        nombre = '.'.join(str(p) for p in path)
        rel = recursos.get(nodo['imagen'], nodo['imagen'])
        ruta = os.path.join(PUBLIC, rel)
        if not os.path.isfile(ruta):
            errores.append(f'{nombre}: falta fichero {rel}')
            continue
        with Image.open(ruta) as im:
            w, h = im.size
        for i, p in enumerate(nodo.get('puntos', [])):
            x, y, pw, ph = p['x'], p['y'], p['w'], p['h']
            if pw <= 0 or ph <= 0:
                errores.append(f'{nombre}[{i}]: area nula {pw}x{ph}')
            elif x < 0 or y < 0 or x + pw > w or y + ph > h:
                errores.append(
                    f'{nombre}[{i}]: rect ({x},{y},{pw},{ph}) fuera de {rel} ({w}x{h})'
                )

    print(f'revisados: {revisados} nodos')
    for e in errores:
        print(f'ERROR: {e}')
    for a in avisos:
        print(f'AVISO: {a}')
    print(f'errores: {len(errores)}')
    if errores or (strict and avisos):
        return 1
    print('OK sprites')
    return 0


if __name__ == '__main__':
    sys.exit(main())
