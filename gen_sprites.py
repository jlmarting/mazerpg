from PIL import Image
import io
import base64

def create_sprite(color, pattern=None):
    img = Image.new('RGB', (32, 32), color=color)
    pixels = img.load()
    if pattern == 'floor':
        for i in range(0, 32, 8):
            for j in range(0, 32, 8):
                pixels[i, j] = (100, 100, 100)
    elif pattern == 'wall':
        for i in range(32):
            pixels[i, 0] = (50, 50, 50)
            pixels[i, 31] = (50, 50, 50)
            pixels[0, i] = (50, 50, 50)
            pixels[31, i] = (50, 50, 50)
    elif pattern == 'player':
        for i in range(8, 24):
            for j in range(8, 24):
                pixels[i, j] = (0, 100, 255)
    elif pattern == 'orc':
        for i in range(8, 24):
            for j in range(8, 24):
                pixels[i, j] = (0, 150, 0)
        pixels[12, 12] = (255, 0, 0)
        pixels[20, 12] = (255, 0, 0)
    elif pattern == 'food':
        for i in range(10, 22):
            for j in range(10, 22):
                pixels[i, j] = (255, 0, 0) # Red apple
    elif pattern == 'pick':
        for i in range(32):
            pixels[i, 31-i] = (200, 200, 200) # Silver diagonal

    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    return base64.b64encode(buffered.getvalue()).decode()

print(f"FLOOR: {create_sprite((200, 200, 200), 'floor')}")
print(f"WALL: {create_sprite((80, 80, 80), 'wall')}")
print(f"PLAYER: {create_sprite((255, 255, 255), 'player')}")
print(f"ORC: {create_sprite((255, 255, 255), 'orc')}")
print(f"FOOD: {create_sprite((255, 255, 255), 'food')}")
print(f"PICK: {create_sprite((0, 0, 0), 'pick')}")
