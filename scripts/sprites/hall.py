"""Sprites/Background -> public/hall/hall.png.

The source is 1983x793 with 155k distinct colours: an AI render in a pixel-art
style rather than actual pixel art. Two things make it match the app.

288 wide, because that is the scene's viewBox width in components/Dojo.tsx, so
the room lands at exactly one art pixel per viewBox unit — the same grid the
ronin is drawn on. 115 keeps the source's 2.5:1.

32 colours, no dithering, because the rest of the scene runs on tight ramps of
two or three tones per material and a 155k-colour background beside that reads
as a photograph someone dropped into a game.

If you re-export the art, re-sample --color-hall-wall from the top visible row
(row 19, the first one the scene shows) or the letterbox band stops matching.
"""

from PIL import Image

SRC = "Sprites/Background"
OUT = "public/hall/hall.png"

src = Image.open(SRC).convert("RGB")
small = src.resize((288, 115), Image.LANCZOS)
quantized = small.quantize(colors=32, method=Image.MEDIANCUT, dither=Image.Dither.NONE)
quantized.save(OUT, optimize=True)

top = quantized.convert("RGB").load()
band = [top[x, 19] for x in range(288)]
avg = tuple(sum(c[i] for c in band) // 288 for i in range(3))
print(f"wrote {OUT} {quantized.size}")
print("--color-hall-wall should be #%02x%02x%02x" % avg)
