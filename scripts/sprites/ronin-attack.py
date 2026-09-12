"""The ronin's strike -> the RONIN_STRIKE frames in lib/game/sprites.ts.

Three frames, cycled one per landed hit, so a fast run of correct answers reads
as one continuous flurry instead of the same pose flashing on and off:

    cut       Sprites/roning_attack.png, the right-hand pose: overhead, the arc
              sweeping down across the post. This is the original single frame.
    backhand  the same sheet's left-hand pose, which swings the other way. It
              was drawn and never used; it is the return stroke of the cut.
    guard     Sprites/Rough_ronin_with_straw_h-Sword_attacking_fro, the
              south-east rotation of the 8-direction set — the same 3/4 view
              the idle is traced from. Blade level across the body, no arc: the
              beat between the two big sweeps.

Two of the frames come from one sheet rendered at roughly eight times the app's
scale, so they are resampled rather than transcribed pixel for pixel. The third
is already 1:1 pixel art at the app's own scale and is passed through untouched
— resampling 59 rows up to 60 would smear every pixel in it to buy one row.

ALIGNMENT. Every pose is centred independently in its own sheet, and each one
carries a sword and an arc that extend the bounding box by a different amount
in a different direction. So the frames are aligned on the hat and the floor
line, never on the bounding box: each is scaled so hat-top to feet is 60 rows,
the idle's height, and then drawn at the x that puts its hat centre on the
idle's and the y that lands its feet on the floor. A bbox-aligned swap would
teleport the body sideways at exactly the moment the motion is meant to read as
deliberate. The anchors are printed on each frame's header line, so a re-run
says whether they moved.

Prints the frames. Paste the rows into lib/game/sprites.ts.

    python3 scripts/sprites/ronin-attack.py             # all three frames
    python3 scripts/sprites/ronin-attack.py cut         # one, by name
"""

import argparse
import math
from collections import Counter, deque
from dataclasses import dataclass

from PIL import Image
import numpy as np

ARC_SHEET = "Sprites/roning_attack.png"
EIGHT_WAY = (
    "Sprites/Rough_ronin_with_straw_h-Sword_attacking_fro"
    "/Sword_attacking_fro/rotations/south-east.png"
)

IDLE_ROWS = 60          # hat-top to feet in RONIN_UPPER + RONIN_LOWER
IDLE_HAT_CENTRE = 31.0  # centre of the straw in RONIN_UPPER rows 0-9
IDLE_FEET_ROW = 75      # scene y the idle's feet land on
IDLE_DRAW_X = 110       # scene x RONIN_UPPER is drawn at

# Rows of the output the hat is measured across, from HAT_TOP down: crown plus
# most of the brim. Deeper than this and the shoulders start voting.
HAT_ROWS = 11


@dataclass(frozen=True)
class Frame:
    """One pose, and the numbers measured off its own sheet.

    These were constants until the strike needed more than one frame, which is
    precisely how a frame's numbers get overwritten by the next frame's and
    stop being reviewable. They are data now, one row per pose.
    """

    name: str
    src: str
    #: Crop of the source, inclusive, tight to this pose's ink.
    crop: tuple[int, int, int, int]
    #: Source row of the top of the hat, and of the lowest sandal. The scale
    #: and the floor line both come off these two, so they are the only
    #: measurements that have to be right.
    hat_top: int
    feet: int
    #: Output rows the obi and the shin wraps are assigned by band. See the
    #: note on `classify`; they differ per pose because the arc frames carry 14
    #: rows of sword above the hat and this one does not.
    obi_rows: range
    wrap_rows: range
    #: Value above which a cool pixel is blade or arc rather than cloth. Set
    #: from the robe's brightest tone in that frame — see `classify`.
    steel_value: int
    #: How the figure is cut out of its sheet. The arc sheet is composited on
    #: black with no alpha channel; the 8-direction export has a real one.
    alpha: bool


FRAMES = {
    # The arc sheet holds both poses side by side, on one black field, at one
    # scale. Hat tops are the first row of straw: at this resolution the hat's
    # ink outline is eight-odd pixels thick, so the straw is the honest anchor.
    "cut": Frame(
        name="cut",
        src=ARC_SHEET,
        crop=(1005, 139, 1670, 728),
        hat_top=250,
        feet=728,
        obi_rows=range(40, 57),
        wrap_rows=range(60, 74),
        steel_value=180,
        alpha=False,
    ),
    "backhand": Frame(
        name="backhand",
        src=ARC_SHEET,
        crop=(56, 248, 852, 724),
        hat_top=250,
        feet=724,
        # Four rows shallower than the cut's bands: this pose stands two rows
        # lower in its own frame and the sword crosses fewer rows above the
        # hat, so the same anatomy lands higher in the output.
        obi_rows=range(36, 53),
        wrap_rows=range(56, 70),
        steel_value=180,
        alpha=False,
    ),
    # 64x64 with a real alpha channel, already at the app's scale: hat-top to
    # feet is 60 rows on the nose, so nothing is resampled. HAT_TOP here is the
    # hat's one-pixel outline, because at 1:1 that pixel *is* the top of the
    # hat rather than a rendering artefact of an 8x outline.
    "guard": Frame(
        name="guard",
        src=EIGHT_WAY,
        crop=(0, 2, 61, 61),
        hat_top=2,
        feet=61,
        obi_rows=range(26, 36),
        wrap_rows=range(47, 60),
        # This export is painted far darker than the arc sheet — its brightest
        # robe tone is 122 and the blade sits in the 150s — so the cut that
        # separates steel from cloth has to come down with it.
        steel_value=150,
        alpha=True,
    ),
}

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


def nearest(c, candidates):
    return min(candidates, key=lambda k: sum((int(c[i]) - RGB[k][i]) ** 2 for i in range(3)))


def classify(c, y, frame):
    """One source pixel -> one palette letter.

    The obi is assigned by band rather than by colour, and this is a character
    decision rather than a fidelity one: the sheet paints the sash cream and
    the ronin wears it red. Matching the paint would mean he changes clothes
    when he swings, and would quietly drop the obi out of the armoury for the
    whole strike, since a cream sash resolves to the hat's ramp.

    The shin wraps take the same rule, and for the same reason — the sheet
    paints those cream too, and the ronin's are red. They used to split at 175
    into `w` and `s`, which sent most of the band to leather: defensible on its
    own, and a different character to the idle's red wraps standing beside it
    in the same session. They split at the middle of the band's own range now,
    so the wraps read as red cloth with `s` left doing what it does everywhere
    else on the figure, the deepest shadow in the fold.
    """
    r, g, b = int(c[0]), int(c[1]), int(c[2])
    v, spread = max(r, g, b), max(r, g, b) - min(r, g, b)
    if v < 40:
        return "X"
    if v >= frame.steel_value and b >= r - 10:
        return nearest(c, ["M", "m"])
    warm_bright = r > g > b and v > 150
    if warm_bright and y in frame.obi_rows:
        return nearest(c, ["O", "o"])
    if warm_bright and y in frame.wrap_rows:
        return "w" if v > 160 else "s"
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

    The arc sheet has no alpha, so the figure is cut out by brightness — and
    the ronin's own outlines and deepest shadows are as dark as the background
    he is standing on. Cutting on brightness alone punched them out of him, and
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


def transcribe(frame):
    """One Frame -> (rows, draw_x, draw_y, hat_centre)."""
    x0, y0, x1, y1 = frame.crop
    src = Image.open(frame.src)

    if frame.alpha:
        rgba = np.array(src.convert("RGBA")).astype(np.uint8)
    else:
        # The sheet is on black rather than transparent, so the mask is the
        # art. The cutoff is 4 and not something safer: the figure's darkest
        # tones start just above the background's flat 0, and every step higher
        # eats another piece of his outline.
        flat = np.array(src.convert("RGB")).astype(int)
        ink = enclose(flat.max(axis=2) > 4)
        rgba = np.dstack([flat, np.where(ink, 255, 0)]).astype(np.uint8)

    crop = Image.fromarray(rgba, "RGBA").crop((x0, y0, x1 + 1, y1 + 1))

    scale = IDLE_ROWS / (frame.feet - frame.hat_top + 1)
    width, height = round((x1 - x0 + 1) * scale), round((y1 - y0 + 1) * scale)
    resampled = (width, height) != crop.size
    # A frame already at the app's own scale is passed through: LANCZOS across
    # a 1.00x "resize" would soften every edge in it for nothing.
    small = np.array(crop.resize((width, height), Image.LANCZOS) if resampled else crop)
    small = small.astype(int)

    rows = [
        "".join(
            classify(small[y, x, :3], y, frame) if small[y, x, 3] > 110 else "."
            for x in range(width)
        )
        for y in range(height)
    ]
    if resampled:
        rows = patch_holes(rows)

    top = round((frame.hat_top - y0) * scale)
    hat = [x for y in range(top, min(top + HAT_ROWS, height))
           for x, c in enumerate(rows[y]) if c in "Kkj"]
    hat_centre = (min(hat) + max(hat)) / 2
    # Half a unit either way is a coin toss; round it up so the script and
    # the component agree on one number rather than two defensible ones.
    draw_x = math.floor(IDLE_DRAW_X + (IDLE_HAT_CENTRE - hat_centre) + 0.5)
    # The crop's last row is the feet — that is what `feet` is measured for —
    # so landing the bottom of the map on the floor line lands the sandals.
    draw_y = IDLE_FEET_ROW - (height - 1)
    return rows, draw_x, draw_y, hat_centre


def emit(frame):
    rows, draw_x, draw_y, hat_centre = transcribe(frame)
    print(f"// {frame.name}: {len(rows)} rows x {len(rows[0])} cols"
          f"  draw at x={draw_x} y={draw_y}"
          f"  (hat centre {hat_centre} -> {draw_x + hat_centre}, idle"
          f" {IDLE_DRAW_X + IDLE_HAT_CENTRE}; feet row {draw_y + len(rows) - 1})")
    for row in rows:
        print(f'  "{row}",')
    print()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("frames", nargs="*", choices=[*FRAMES, []],
                        help="which frames to print (default: all of them)")
    args = parser.parse_args()
    for name in args.frames or FRAMES:
        emit(FRAMES[name])
