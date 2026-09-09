"use client";

/**
 * The practice hall.
 *
 * A ronin on the left, a training post on the right, and every correct answer
 * is a strike that lands. XP is damage. The streak is a combo. Getting stuck
 * quiets the whole room rather than just swapping a panel.
 *
 * Both poses come from Sprites/, from different sheets and by different
 * routes. The idle is the south-east frame of the 8-direction idle sheet, a
 * 3/4 view facing the post, traced by hand: the source is a 64-colour
 * painterly render, and 64 colours is the opposite of 16-bit, so what carried
 * over is the pose, the silhouette and the costume, with every material put
 * back on a tight ramp of two or three tones and the dithering gone. The
 * strike is resampled from roning_attack.png by script (see RONIN_ATTACK).
 *
 * Nothing is hand-aligned between them. The strike is scaled to the idle's
 * hat-to-feet height and placed by hat centre and floor line, so the swap
 * does not move the character. Either way the whole scene sits on one pixel
 * grid — every element is drawn at one art pixel per viewBox unit, so nothing
 * is secretly half the resolution of the thing beside it.
 *
 * Everything is still drawn from the character maps below. No sprite packs, no
 * licensing ambiguity (constraint #10), and editing the art means editing a
 * string.
 */

import {
  defaultAvatar,
  resolvePalette,
  type AvatarChoice,
} from "@/lib/game/avatar";

export type DojoMood = "idle" | "strike" | "miss" | "quiet";

/**
 * Colours the learner cannot change: their own skin, the leather and wraps
 * that hold the kit together, and the room itself. Everything they can change
 * arrives through the resolved palette in lib/game/avatar.ts.
 */
export const FIXED: Record<string, string> = {
  X: "#0a0b10", // the silhouette
  M: "#cfd6e6", // the blade
  m: "#8e97ab", // the blade, shaded
  T: "#7a5a3a", // post timber
  t: "#52341f", // post timber, shaded
  R: "#cbb27a", // straw binding
  r: "#9a8555", // straw binding, shaded
};


/*
 * Split at the hips so the idle breath can lift the torso while the feet stay
 * planted. Lifting the whole figure reads as hopping, not breathing. The first
 * row of RONIN_LOWER duplicates the row above it and is drawn one pixel high,
 * so the lifted frame shows hakama rather than a slit of back wall.
 */
export const RONIN_UPPER = [
  "............................XXXXXXX.........................",
  "...........................XjkkkkkkX........................",
  "..........................XjjkkKKKkjX.......................",
  "..........................XjjkkKKKkjX.......................",
  ".......................XXXgjjkkKKKkjjXXXX...................",
  "....................XXXjjjgjjjkkKKkhhjjjjXX.................",
  "...................XjjjjjjjhhhhHHHHhhjjkkkjX................",
  "...................XjjjkkjjkkhhHHHHhkkKKkkkX................",
  "....................XXkkkkkkkKkkKKKkkkKKkkX.................",
  "......................XjjKkkKKkkKKKKkkkKKX..................",
  ".....................XggggKjjKjkkkkkKkXXXX..................",
  "....................XXXXgggjjjjjkjjjXX......................",
  "........................XXggggSSSSSX........................",
  ".......................XX.XgggSffffX........................",
  "......................XgX.XhgggfSSssX.......................",
  "......................XggXhhhggfefshhXXX....................",
  ".....................XgggshghgsefefhhgHX....................",
  "....................XhhHgshghHSSSsshhhHX....................",
  "....................XggHHmhhhHHSSSshHhHHX...................",
  "....................XhhHmfmhhHmmfffeHhHHX...................",
  "....................XhhhHmmmHhHmfffeHhHHX...................",
  "....................XehhhgHHHhHHeffeHhHhX...................",
  "...................XhhhhhgHHHHHHHmseHhHhX...................",
  "...................XhhhHHhghHHHHHmmmmhHgHX..................",
  "...................XhhHHHhghhHHHhHHHHhhgHhX.................",
  "..................XhhhhhhhghgHHHhhhhHhghHhX.................",
  "..................XghhhhHgghghHHhhhhHhghhheX................",
  ".................XhghhhhHghhhhhhhhgHggghhsfeX...............",
  ".................XhhhhhhhghhhhhhhghhhhgggssXX...............",
  ".................XHHhhhhhgghhogghhhhhhggssX.................",
  ".................XHHggPPPgooooghhhgggoofsHX.................",
  "................XhgghhppHgooooggggooOoopgHmX................",
  "................XhgghhpHHgooooOOOOooooopgHmX................",
  "................XXXghHMggghooooooooooooppsSX................",
  "...................XhHMpghhhhHgoooOooooggsfX................",
  "....................XHMpphhhHHgghoOohOOggsffX...............",
  "....................XhHMphheHHgghoOohhOghsfsX...............",
  "....................XhHMefhePggggooHHggghgfsX...............",
  "....................XhHMeegHHgggghhHHHHgggXX................",
  "....................XsffefgHHgPhgHHHHPHHgX..................",
  "....................XssseSgHHgPhgHHHHPHHmX..................",
  ".....................XssfgggpPPpgHHHHPHHgX..................",
];

export const RONIN_LOWER = [
  "....................XhHMeegHHgggghhHHHHgggXX................",
  "....................XsffefgHHgPhgHHHHPHHgX..................",
  "....................XssseSgHHgPhgHHHHPHHmX..................",
  ".....................XssfgggpPPpgHHHHPHHgX..................",
  "......................XhhhhhpPPphgHHPPPHhhX.................",
  ".....................XhhhpphPPPphgHfpppHehX.................",
  ".....................XhhheePPPPphgHggphhehX.................",
  "....................XhhhheePPPPpgggghhhhegX.................",
  "....................XhhhheepPPpppghhhghheX..................",
  ".....................XhhhhppPPhpXXhhhghhhX..................",
  ".....................XghhhfpphhX..XgghhgX...................",
  "......................XghhhhhhX...XhgggX....................",
  "......................XhgghhhX....XhhhX.....................",
  "......................XhhhggX.....XsssX.....................",
  "......................XhHHgX......XhhhX.....................",
  "......................XswwX.......XhhhhXX...................",
  "......................XhHHX......XshhwwmgX..................",
  "......................XhHHX......XshhhhhhsX.................",
  "......................XsHHgX.....XXXXXwwwsX.................",
  "......................XgwHHX..........XXXXX.................",
  "......................XwwwssX...............................",
  "......................XXXXXXX...............................",
];

/*
 * The strike, from Sprites/roning_attack.png — the right-hand of the two
 * poses on that sheet, the one swinging toward the post. The arc is drawn
 * into the art, which is why there is no hand-made contact flash any more.
 *
 * Unlike the idle, this is not a 1:1 transcription: that sheet is rendered at
 * roughly eight times the app's scale, so it is resampled. Two anchors put it
 * back exactly where the idle stands — the figure is scaled so hat-top to
 * feet is 60 rows, the idle's height, and then drawn at x=109, y=2 so the hat
 * centres line up (idle 31, this 32.5) and the feet land on y=75. Nothing is
 * eyeballed; the numbers come out of the script.
 *
 * Colour is where the work is. 116k source colours have to land in the
 * 19-letter palette the armoury re-colours, and two of the rules are about
 * character rather than fidelity:
 *
 *   - The cutout is by brightness, because the sheet has no alpha — and the
 *     ronin's own outlines and deepest shadows are as dark as the black he
 *     stands on. Cutting at 28 punched them out of him and the hall showed
 *     through in a scatter of holes that read as an unfinished sprite. The
 *     cutoff is 4, everything the outside cannot reach is filled in, and any
 *     pixel the downsample still leaves transparent with three opaque
 *     neighbours takes the colour around it. Genuine gaps — inside the arc,
 *     between his legs — have at most two neighbours and are left alone.
 *   - Steel is anything at value >= 180 that is not warm. That threshold is
 *     not arbitrary: the robe's brightest tone in this frame is 161, so
 *     anything above it is blade or arc, and anything below stays cloth.
 *   - The obi is assigned by band, rows 40-56, not by colour. The sheet
 *     paints it cream and the ronin wears it red; matching the paint would
 *     mean the character changes clothes when he swings, and would quietly
 *     drop the obi out of the armoury for the whole strike, since a cream
 *     sash resolves to the hat's ramp rather than the obi's. The shin wraps
 *     take the same rule from row 60 down, where the same cream mostly lands
 *     on the leather tones and reads as wrapping.
 *
 * 83 columns for a 60-row figure, because the arc sweeps well past him: it
 * reaches x=191 in scene coordinates, across and beyond the post at 164-177.
 * That is also why the whole figure is drawn after the post below.
 *
 * Regenerate with `python3 scripts/sprites/ronin-attack.py`, which prints
 * exactly these rows.
 */
export const RONIN_ATTACK = [
  "...............................HmmH................................................",
  ".................................hmmg..............................................",
  ".....................................HmmHH...H.....................................",
  ".......................................mmmHhXHHH...................................",
  ".........................................HmmHXXgX..................................",
  "...........................................HmHHHhhXHh..............................",
  ".............................................HHMMHHmmXgH...........................",
  "...............................................hmMMHMmHgHH.........................",
  ".................................................gMMmmmmHHmH.......................",
  "...................................................HMMmMmhHMHH.....................",
  "....................................................hmMmMMHmMMH....................",
  ".....................................................hHmmMMMMMMmH..................",
  ".....................................................HXhmMmMMmmMMH.................",
  ".....................................................gHPHHmHMMMmMMH................",
  "........................XefeeS......................PmPH..HmmmMMmMMHg..............",
  ".......................gjfffffes...................PMP.....hmmmMMMMMHH.............",
  ".......................sfffKffeh.................Pmmh.......hmMMMMMMmHH............",
  "....................sgXhjeffejHHgos............gPmP..........gmMmMMMMHHHXXHg.......",
  ".................sggsesghPPjPhHhjSSSs......ooXPmPh.............HMMMMMMmHXXgHX......",
  ".................sSjfeeehhhhHpjfefjees.....XgshP................HMMMMMMmHXXgH......",
  ".................XffeffffeffeffffeffSg...XefggS..................mMMMMMMMhXXhHX....",
  "...................offffffffffffffSg.....gofess..................XmMmMMMMMhXXHH....",
  "...................osfSkjefeffffsXXg..XsgggsjX....................hMMMMMMMmgXXHH...",
  ".....................sgXXsfosfXffhhXgoogXSehX......................HMMMMMMMHX......",
  "......................sgshgssojsghhghHgXggSo.......................HmMmMMMMMX...H..",
  ".......................XXSfeffoghphHgXgHHHg........................HXmMmMMMMHX..H..",
  ".......................gjgeffSXhHPXhXgHHhHH........................HHHMMMMMMMh.....",
  "......................ghHPgeoXShhggXgHHphHh........................hHXmMMMMMMmX..Hg",
  ".....................XhhXghgXgohghhHHhHphHh........................ghHHMMMMMMmX..HH",
  ".....................hhhHHhPHgggPHgpHhPhghg.........................HmXHMMMMMMH..XM",
  "....................ghHPhHPhhHhHPggHhHHhghh.........................HHXgMMMMMMH..gM",
  "....................ghHhhHhgHhhHhgHHHhggghh..........................gXXmMMMMMmg..H",
  "...................XghHhHghHhhHhgHHhhghgghg..........................HgXHMMMMMMH...",
  "...................gghhHhgHhgHhgHHhhgggggg...........................MgXHMMMMMMH...",
  "...................ggghhghhgHhgHHhgX.................................HgggmMMMMMH...",
  "...................ggggggghHggHhgXXg....................................XHMMMMMHX..",
  "...................ggXghghhggggXXghhg................................X...HMMMMMh..H",
  "...................ggXgggggggXXXhhhg.................................H...HMMMMHX.Xm",
  "...................gggXgggggXhgghhhg.................................HH..HMMMMH..hM",
  "....................ghggXghghgghhhgg....................................hmMMMmX..HH",
  ".......................XggghggggggXgggo.................................HmmMMHXXXmX",
  ".......................ggXXXggXXXXhhgss.................................HMMMmgXXHHX",
  ".......................gjpXgXXhOXSOgsss................................gmmMMhXXgMh.",
  "......................hXsSOOjsSOgpjhXXs................................HmMMHXXXmmg.",
  ".................pp..gHPggssHOsSghpgggXsos............................gHHMH..XHmg..",
  ".................PpghjHgggpggOgXgghggggXsoSo.........................XHhmHX..gmH...",
  ".................XhPHpXggPPHXggXsXHPgXggXXsoos.......................mHHmX...hHg...",
  ".................XhgXXgHPPPgXhhXghgOPgggXXXsso......................HHhMH..........",
  "...............hhpXghHOOPXggghhgXpsjOPhhXggg.......................HmgHH...HH......",
  ".............shHXXghpOPpXgghhhhgXhhHPOghHggg......................HHhHX...HMX......",
  "...........oosXXgggjOPhXgghHhhggXghpjgHgHHhXg....................HHXH....hMH.......",
  ".........sSogXXggpOOpXgHhhHhhgggXXHghgHpgHHhg....................HHh...............",
  ".......soSsgggghHhpgghHhhHhhggggXXgHhhHggHHPHh.................XhHH..XHm...........",
  ".....soSossgXhHHPPghHHghHhHggghXXggHHHgghHHPHHh.............hh..HgH..HmH...........",
  ".....oos...XhHHPPPHHhggHhHhgghgXggggHhXhhHHHhPHh...........HHg....Xgmm.............",
  "...........gHPpHhghhhgggHhgghg...ggghgghhHHHHPHh.........HHh......HHH..............",
  ".........ggghPHPHHHHhhgXhgghg.....gXhgghhHHPPHhgX......hHgH.....gHH................",
  "........XhgXhhPHPPHHhggXXghg.........ggghhhHHhgXg.............H....................",
  ".........ghghhhpHHhhgggXXgg...........XggghhggXgg...........HgH....................",
  ".........gHhgggghhgggg.................gghhgXXghX..........hH......................",
  ".......pHXhHhgXXXXhgg..................gHhggghgXX..................................",
  "......PHPpXhhhgggXghg...................hggghXXpj..................................",
  "......XgsspXggghgggg......................ghghjPHh.................................",
  "......ghPskHgXgh..........................gHhhhgPp.................................",
  "......PPppppHh.............................pXghsPh.................................",
  ".....gkjHpgXp................................HPppk.................................",
  ".....HjsPhh...................................ggPHX................................",
  "...HHHHgg......................................hgSP................................",
  "...gswSg.......................................sHsPX...............................",
  "..phpHsp.......................................ghXps...............................",
  "..gjPgsX......................................hhghjHp..............................",
  "hPHppHg......................................ghgppghHggh...........................",
  "gHHghHh..........................................XghHHHHg..........................",
  "hHHPHHh..............................................p.............................",
];

const POST = [
  "...XXXXXXXX...",
  "..XRRRRRRRRX..",
  "..XRrrRRrrRX..",
  "..XRRRRRRRRX..",
  "..XRRrRRrRRX..",
  "..XRRRRRRRRX..",
  "..XrRRRRRRrX..",
  "..XRRRRRRRRX..",
  "..XRRrRRrRRX..",
  "..XRRRRRRRRX..",
  "..XrRRRRRRrX..",
  "..XRRRRRRRRX..",
  "..XRRrRRrRRX..",
  "..XRRRRRRRRX..",
  "..XrrRRRRrrX..",
  "..XRRRRRRRRX..",
  "..XXXXXXXXXX..",
  "...XTTTtttX...",
  "...XTTTtttX...",
  "..XRRRRRRRRX..",
  "..XrrrrrrrrX..",
  "...XTTTtttX...",
  "...XTTTtttX...",
  "...XTTTtttX...",
  "...XTTTtttX...",
  "..XRRRRRRRRX..",
  "..XrrrrrrrrX..",
  "...XTTTtttX...",
  "...XTTTtttX...",
  "...XTTTtttX...",
  "...XTTTtttX...",
  "...XTTTtttX...",
  "..XTTTTttttX..",
  "..XTTTTttttX..",
  ".XTTTTTtttttX.",
  ".XTTTTTtttttX.",
  "XTTTTTTttttttX",
  "XTTTTTTttttttX",
  "XttttttttttttX",
  "XXXXXXXXXXXXXX",
];


/** One art pixel per viewBox unit. `.` is transparent. */
export function PixelArt({
  map,
  palette,
  x,
  y,
}: {
  map: string[];
  palette: Record<string, string>;
  x: number;
  y: number;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {map.flatMap((row, rowIndex) =>
        [...row].map((char, colIndex) => {
          const fill = palette[char];
          if (!fill) return null;
          return (
            <rect
              key={`${rowIndex}-${colIndex}`}
              x={colIndex}
              y={rowIndex}
              width={1}
              height={1}
              fill={fill}
            />
          );
        }),
      )}
    </g>
  );
}


export function Dojo({
  mood,
  combo,
  award = null,
  avatar = defaultAvatar(),
  rankId = "kensei",
  /*
   * `grow` with a floor.
   *
   * The hall is the only elastic child of an `h-dvh` column in which every
   * other block is `shrink-0`, so it is the one thing that yields when the
   * viewport runs short — and `min-h-0` on its parent removed even the
   * content floor. On a 375x812 phone the home page's header and drill panel
   * already exceed the viewport, so the hall was allotted exactly 0px: the
   * ronin, the whole visual identity of the product and the thing the armoury
   * lets you dress, rendered at zero height and vanished.
   *
   * A 3:1 scene below about 100px is a smear anyway, so this is the height
   * under which there is no point drawing it at all. Pages that want the
   * deliberate quiet strip pass their own height and are unaffected.
   */
  className = "min-h-[7.5rem] grow",
}: {
  mood: DojoMood;
  combo: number;
  /** The XP just awarded, drawn at the post. `seq` replays it on a repeat. */
  award?: { xp: number; seq: number } | null;
  /** How the learner has dressed the ronin. Defaults to the starting kit. */
  avatar?: AvatarChoice;
  /** Which rank the learner holds, so locked options fall back rather than render holes. */
  rankId?: string;
  className?: string;
}) {
  const quiet = mood === "quiet";
  const palette = { ...FIXED, ...resolvePalette(avatar, rankId) };
  const lit = combo >= 3;

  return (
    <div
      /*
        The outer box takes whatever height the column gives it and paints
        nothing. The room inside it is capped to the art's own 288x115, which
        is the ratio at which the art fills its frame exactly — the scene is
        96 units tall inside a 115-row image, and the 19 rows left over are
        precisely the ceiling that hangs above the viewBox.

        Before this, the box was the room: on a 375px phone it ran 1.5:1
        against art that is 2.5:1, and 84 of its 218 pixels — 38% of the hall
        — were flat `hall-wall`. That was tolerable while the room was drawn
        in the same flat colours; against a lit raster it read as a maroon
        slab sitting on top of the room. Any leftover height now falls outside
        the frame and shows the page, which is the ground everything else on
        the page already sits on.
      */
      className={`relative flex w-full items-end justify-center overflow-hidden ${className}`}
      data-testid="dojo"
    >
      <svg
        viewBox="0 0 288 96"
        preserveAspectRatio="xMidYMax meet"
        shapeRendering="crispEdges"
        /*
          `max-h-full` is what keeps the wide case working: on the home page
          the container is nearer 7:1, the aspect ratio would ask for a box
          taller than there is room for, and the clamp hands the width back to
          the mirrored copies that continue the room sideways.
        */
        className={`bg-hall-wall aspect-[288/115] max-h-full w-full transition-opacity duration-300 ${
          quiet ? "opacity-35" : "opacity-100"
        }`}
        aria-hidden
      >
        {/*
          The room itself: one 288x115 pixel image drawn at 1:1 — one art
          pixel per viewBox unit, the same grid the ronin is drawn on, so
          nothing on screen is secretly a different resolution from the thing
          beside it. `preserveAspectRatio="none"` is exact here rather than
          sloppy: the rect it is given IS the image's natural size.

          This replaced about twenty hand-placed rects approximating a hall.
          The trade is deliberate and worth stating: the room is now art
          rather than a themeable surface. Its palette is baked into the PNG,
          so rank and avatar palette shifts no longer reach the walls, and the
          only thing left in vector is the lamp, which is state-dependent and
          has to be.

          Three copies, because the scene letterboxes.

          The art is 2.5:1 and the scene is 3:1, and the container is neither:
          about 7:1 on the home page and nearer 1.4:1 on a phone. Content
          drawn outside the viewBox still paints into the bands `meet` leaves
          over — the root svg clips to the container, not to the viewBox — so
          the bands get the room continued into them rather than a flat
          colour and a seam.

          Vertically that is free: the image is 19 rows taller than the scene,
          so hanging it at y=-19 puts its own ceiling beams in the band above.
          Horizontally there is nothing to continue with, so each side gets
          the room mirrored. The art is near-symmetric — a lit shoji bay at
          both ends — so the join reads as more hall rather than as a fold.
        */}
        <g transform="translate(0 -19)">
          {[
            { key: "hall", transform: undefined },
            { key: "hall-left", transform: "scale(-1 1)" },
            { key: "hall-right", transform: "translate(576 0) scale(-1 1)" },
          ].map(({ key, transform }) => (
            <g key={key} transform={transform}>
              <image
                href="/hall/hall.png"
                x="0"
                y="0"
                width="288"
                height="115"
                preserveAspectRatio="none"
                /* Without this the whole 16-bit premise dies on a retina screen. */
                style={{ imageRendering: "pixelated" }}
              />
            </g>
          ))}
        </g>

        {/*
          The two paper lanterns are in the art, but "the room warms as the
          combo builds" is not — so the only thing still drawn by hand is the
          light itself, sat exactly on the lanterns' paper.
        */}
        {[56, 256].map((x) => (
          <rect
            key={x}
            x={x}
            y="6"
            width="7"
            height="7"
            fill="var(--color-hall-lamp-lit)"
            opacity={lit ? 0.55 : 0}
            className="transition-opacity duration-300"
          />
        ))}

        {/* The post takes the hit, so it is what recoils. */}
        <g
          className={
            mood === "strike" ? "anim-recoil" : mood === "miss" ? "anim-miss" : ""
          }
        >
          <PixelArt map={POST} palette={palette} x={164} y={36} />
        </g>

        {/*
          The ronin. Feet land at y=75, on the lit boards of the platform
          rather than on the dark front edge below them.

          A strike swaps the whole figure for the attack pose from the sprite
          sheet rather than rotating a drawn rectangle past a standing body.
          Both poses are anchored on the hat and the floor line rather than on
          a shared frame, so the swap does not teleport the body sideways; the
          forward drive comes from anim-lunge, deliberately, rather than from
          a framing accident.

          Drawn after the post, not before it. The strike's arc sweeps across
          and past the post, so the figure has to be in front of it or the
          brightest thing in the scene disappears behind a stick of wood. The
          idle never reaches that far — it ends at x=154 and the post starts
          at 164 — so nothing else changes by moving it.

          The blade belongs to the pose, so there is no blade at rest — the
          sprite carries its sword sheathed, which is what a ronin with one
          sword would actually do between cuts.
        */}
        <g
          className={
            mood === "strike" ? "anim-lunge" : mood === "miss" ? "anim-flinch" : ""
          }
        >
          {mood === "strike" ? (
            <PixelArt map={RONIN_ATTACK} palette={palette} x={110} y={2} />
          ) : (
            <>
              {/*
                Drawn before the torso and overlapping it by OVERLAP rows, so
                the breath lifts the torso off real hakama rather than off a
                hole. An earlier version butted the two halves edge to edge and
                a 2px lift opened a transparent line straight across the hips.
              */}
              <PixelArt map={RONIN_LOWER} palette={palette} x={110} y={54} />
              <g className="anim-breathe">
                <PixelArt map={RONIN_UPPER} palette={palette} x={110} y={16} />
              </g>
            </>
          )}
        </g>

        {/*
          The jade cue, at the height the arc actually crosses the post
          (rows 49-61 of the scene). The white contact bar that used to sit
          here is gone: the strike sprite draws its own arc, and a second
          hand-made flash beside it read as a stray rectangle.
        */}
        {mood === "strike" && (
          <g className="anim-arc">
            <rect x="166" y="52" width="2" height="10" fill="var(--color-jade)" />
          </g>
        )}

        {/*
          The damage number, at the thing taking the damage. It used to sit at
          the top-right of the question card, roughly 250px from the post it
          was rewarding a hit on. Like the combo below it, it lives in the
          scene's own coordinates so it cannot drift away from the art.
        */}
        {award && !quiet && (
          <g key={award.seq} className="anim-hit-scene">
            <text
              x="171"
              y="26"
              textAnchor="middle"
              fill="var(--color-jade)"
              fontSize="15"
              fontFamily="ui-monospace, monospace"
            >
              +{award.xp}
            </text>
          </g>
        )}

        {/* Combo lives inside the scene's own coordinates. Positioned in HTML it
            drifted away from the art when the viewBox letterboxed. */}
        {combo >= 3 && !quiet && (
          <g>
            <text
              x="282"
              y="68"
              textAnchor="end"
              fill="var(--color-gold)"
              fontSize="18"
              fontFamily="ui-monospace, monospace"
            >
              {combo}
            </text>
            <text
              x="282"
              y="76"
              textAnchor="end"
              fill="var(--color-hall-lamp-case-dim)"
              fontSize="6"
              letterSpacing="1"
              fontFamily="ui-monospace, monospace"
            >
              {combo >= 10 ? "UNBROKEN" : combo >= 5 ? "SHARP" : "COMBO"}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
