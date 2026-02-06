from PIL import Image
import io
import base64

def create_sprite(color, pattern=None, frame=0):
    img = Image.new('RGB', (32, 32), color=color)
    pixels = img.load()
    if pattern == 'player_walk':
        # Simple leg movement simulation
        for i in range(12, 20):
            for j in range(8, 24):
                pixels[i, j] = (0, 100, 255)
        # Legs
        if frame == 0:
            for j in range(24, 32):
                pixels[12, j] = (0, 50, 200)
                pixels[19, j] = (0, 50, 200)
        elif frame == 1:
            for j in range(24, 32):
                pixels[10, j] = (0, 50, 200)
                pixels[21, j] = (0, 50, 200)
        else:
            for j in range(24, 32):
                pixels[14, j] = (0, 50, 200)
                pixels[17, j] = (0, 50, 200)
    elif pattern == 'player_attack':
        # Body
        for i in range(12, 20):
            for j in range(8, 24):
                pixels[i, j] = (0, 100, 255)
        # Sword/Arm
        if frame == 0:
            for i in range(20, 28): pixels[i, 16] = (200, 200, 200)
        elif frame == 1:
            for i in range(20, 30): pixels[i, 12] = (200, 200, 200)
        else:
            for i in range(20, 28): pixels[i, 20] = (200, 200, 200)

    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    return base64.b64encode(buffered.getvalue()).decode()

for f in range(3):
    print(f"PLAYER_WALK_{f}: {create_sprite((255, 255, 255), 'player_walk', f)}")
for f in range(3):
    print(f"PLAYER_ATTACK_{f}: {create_sprite((255, 255, 255), 'player_attack', f)}")
