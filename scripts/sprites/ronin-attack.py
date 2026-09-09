"""The ronin's strike -> the RONIN_ATTACK character map in components/Dojo.tsx.

Source: Sprites/roning_attack.png, which holds two poses. The right-hand one is
the one that swings toward the post; the left-hand one swings away and is
unused. The sheet draws the sword's arc into the art, which is why the scene
has no hand-made contact flash any more.

The sheet renders at roughly eight times the app's scale, so this resamples
rather than transcribing pixel for pixel. Two anchors put the result back
exactly where the idle figure stands: the pose is scaled so hat-top to feet is
60 rows, the idle's height, and DRAW_X / DRAW_Y below line the hat centres up
and land the feet on the floor line. Both numbers are printed on the header
line so a re-run tells you if they moved.

Prints the map. Paste the rows into RONIN_ATTACK.
"""

import math
from collections import Counter, deque

from PIL import Image
import numpy as np

SRC = "Sprites/roning_attack.png"

# The right-hand pose, and the two anchors measured off it. HAT_TOP is the
# first row of straw; FEET is the last row of sandal.
X0, X1, Y0, Y1 = 1005, 1670, 139, 728
HAT_TOP, FEET = 250, 728
IDLE_ROWS = 60          # hat-top to feet in RONIN_UPPER + RONIN_LOWER
IDLE_HAT_CENTRE = 31.0  # centre of the straw in RONIN_UPPER rows 0-9
IDLE_FEET_ROW = 75      # scene y the idle's feet land on

# The default avatar palette: straw hat, indigo robe, blood obi, olive hakama.
# Transcribing against the defaults is what puts each source colour in the
# right slot, so a learner's own choices still re-colour the pose.
PAL = {
    "X": "#0a0b10", "M": "#cfd6e6", "m": "#8e97ab",
    "f": "#d9a882", "e": "#9c6f52", "S": "#8a5a3a", "s": "#52341f", "w": "#b8563f",
    "K": "#e8d39a", "k": "#c2a768", "j": "#8a7442",
    "H": "#4a5c74", "h": "#34435a", "g": "#222c40",
    "O": "#a04a34", "o": "#6b2f22",
    "P": "#6d7a68", "p": "#4a5449",
}
RGB = {k: tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) for k, v in PAL.items()}

# Assigned by band rather than by colour, and this is a character decision
# rather than a fidelity one: the sheet paints the sash cream and the ronin
# wears it red. Matching the paint would mean he changes clothes when he
# swings, and would quietly drop the obi out of the armoury for the whole
# strike, since a cream sash resolves to the hat's ramp. The wrap band is the
# same rule, where the cream mostly lands on the leather tones instead.
OBI_ROWS = range(40, 57)
WRAP_ROWS = range(60, 74)

# The robe's brightest tone in this frame is 161, so anything above it that is
# not warm is blade or arc, and anything below it stays cloth.
STEEL_VALUE = 180


def nearest(c, candidates):
    return min(candidates, key=lambda k: sum((int(c[i]) - RGB[k][i]) ** 2 for i in range(3)))


def classify(c, y):
    r, g, b = int(c[0]), int(c[1]), int(c[2])
    v, spread = max(r, g, b), max(r, g, b) - min(r, g, b)
    if v < 40:
        return "X"
    if v >= STEEL_VALUE and b >= r - 10:
        return nearest(c, ["M", "m"])
    warm_bright = r > g > b and v > 150
    if warm_bright and y in OBI_ROWS:
        return nearest(c, ["O", "o"])
    if warm_bright and y in WRAP_ROWS:
        return "w" if v > 175 else "s"
    if r > g + 35 and g > b + 18 and v > 150:
        return nearest(c, ["f", "e"])
    if r > g > b and v > 135:
        return nearest(c, ["K", "k", "j"])
    if r > g + 22:
        return nearest(c, ["O", "o", "S", "s", "w"])
    if g >= b and g >= r - 10 and v > 55:
        return nearest(c, ["P", "p"])
    return nearest(c, ["H", "h", "g"])


def enclose(mask):
    """mask, plus every background pixel the border cannot reach.

    The sheet has no alpha, so the figure is cut out by brightness — and the
    ronin's own outlines and deepest shadows are as dark as the background he
    is standing on. Cutting on brightness alone punched them out of him, and
    the hall showed through in a scatter of holes that read as an unfinished
    sprite. Anything the outside cannot reach is inside the figure.
    """
    h, w = mask.shape
    outside = np.zeros_like(mask)
    queue = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not mask[y, x] and not outside[y, x]:
                outside[y, x] = True
                queue.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not mask[y, x] and not outside[y, x]:
                outside[y, x] = True
                queue.append((x, y))
    while queue:
        x, y = queue.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not mask[ny, nx] and not outside[ny, nx]:
                outside[ny, nx] = True
                queue.append((nx, ny))
    return mask | ~outside


def patch_holes(rows):
    """Close what survives the downsample.

    A pixel with three or four opaque orthogonal neighbours is inside the
    figure whatever the resampled alpha says, so it takes the commonest colour
    around it rather than showing the room through the ronin. Genuine gaps —
    the space inside the arc's crescent, the daylight between his legs — have
    at most two, and are left alone.
    """
    rows = [list(r) for r in rows]
    h, w = len(rows), len(rows[0])
    for _ in range(4):
        filled = 0
        for y in range(h):
            for x in range(w):
                if rows[y][x] != ".":
                    continue
                orth = [rows[y + dy][x + dx]
                        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                        if 0 <= x + dx < w and 0 <= y + dy < h]
                if sum(c != "." for c in orth) < 3:
                    continue
                around = [rows[y + dy][x + dx]
                          for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                          if 0 <= x + dx < w and 0 <= y + dy < h
                          and rows[y + dy][x + dx] != "."]
                rows[y][x] = Counter(around).most_common(1)[0][0]
                filled += 1
        if not filled:
            break
    return ["".join(r) for r in rows]


frame = np.array(Image.open(SRC).convert("RGB")).astype(int)
# The sheet is on black rather than transparent, so the mask is the art. The
# cutoff is 4 and not something safer: the figure's darkest tones start just
# above the background's flat 0, and every step higher eats another piece of
# his outline.
ink = enclose(frame.max(axis=2) > 4)
rgba = np.dstack([frame, np.where(ink, 255, 0)]).astype(np.uint8)
crop = Image.fromarray(rgba, "RGBA").crop((X0, Y0, X1 + 1, Y1 + 1))

scale = IDLE_ROWS / (FEET - HAT_TOP + 1)
width, height = round((X1 - X0 + 1) * scale), round((Y1 - Y0 + 1) * scale)
small = np.array(crop.resize((width, height), Image.LANCZOS)).astype(int)

rows = patch_holes([
    "".join(
        classify(small[y, x, :3], y) if small[y, x, 3] > 110 else "."
        for x in range(width)
    )
    for y in range(height)
])

hat = [x for y in range(round((HAT_TOP - Y0) * scale), round((HAT_TOP - Y0) * scale) + 11)
       for x, c in enumerate(rows[y]) if c in "Kkj"]
hat_centre = (min(hat) + max(hat)) / 2
# Half a unit either way is a coin toss; round it up so the script and
# the component agree on one number rather than two defensible ones.
draw_x = math.floor(110 + (IDLE_HAT_CENTRE - hat_centre) + 0.5)
draw_y = IDLE_FEET_ROW - (height - 1)

print(f"// {height} rows x {width} cols  draw at x={draw_x} y={draw_y}"
      f"  (hat centre {hat_centre}, idle {IDLE_HAT_CENTRE})")
for row in rows:
    print(f'  "{row}",')
