"use client";

/**
 * The practice hall.
 *
 * A ronin on the left, a training post on the right, and every correct answer
 * is a strike that lands. XP is damage. The streak is a combo. Getting stuck
 * quiets the whole room rather than just swapping a panel.
 *
 * The figure is traced from the 8-direction idle sheet in Sprites/, using the
 * south-east frame: a 3/4 view facing the post, which keeps the face, the
 * kimono lapels and the obi knot readable in a way the pure profile does not.
 *
 * The source is a 64-colour painterly render, and 64 colours is the opposite
 * of 16-bit. What carried over is the pose, the silhouette and the costume;
 * what changed is that every material now runs on a tight ramp of two or three
 * tones, the dithering is gone, and the whole scene sits on one pixel grid —
 * every element is drawn at one art pixel per viewBox unit, so nothing is
 * secretly half the resolution of the thing beside it.
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

export const RONIN_ATTACK = [
  ".............................XXXX...........................",
  "............................XkkkjXXX........................",
  "...........................XjjkkKKKkX.......................",
  "...........................XjjkKKKKkjX......................",
  ".......................XXXXjjjjkkKKKjX......................",
  ".....................XXjjjjhhjkkKKKKjgXXX...................",
  "....................XjjjjjjjhhhhhhhHhgkjjXX.................",
  "....................XjjjjjjkkhhhHHHHhkkkkkjX................",
  ".....................XjjkjjkkKKKkjjkkkKKkkkjX...............",
  ".....................XgkjjjkKKKKkKKkkkKKKkkX................",
  "...................XXgggjjjkKKjKkKKKkkKKKKX.................",
  "....................XggghhhhjjjjkkkkkkXXXX..................",
  ".....................XgggggggegssjjjjX......................",
  "....................XhhhhghggegSsSSSX.......................",
  "...................XghhhhghgghhSfffSX.......................",
  "X................XXhgHHHgghssshhfssX........................",
  "XX..............XhhhhgHHhhgssssheffgXX......................",
  "XmX...........XXhhhhhghHhhgssssheehhhgX.....................",
  "XmmX........XXhhhhhhhghhhhgffssgghhhhhhX....................",
  ".XmmX......XhhhhhhhhgghhhhgffffghhhhmmhhX...................",
  "..XmmX....XhhhhhhhhhhghhhhgffffHhHHhmmhhX...................",
  "...XmmX..XhhggggghhhghhhhhgffhHHggghhhhX....................",
  "....XmmXXgggggghhghgghhhhhmffhhHgggHHhhX....................",
  ".....XmmmmgggghhHghXghhHHhmhhhhggHHHhhhX....................",
  "......XmmmseegHHHgX.XhhHHhhhhhhhhHhhhhX.....................",
  ".......XmmseegHHgX..XhhhhhhhhhhhhhhhhhX.....................",
  "........XmsseHHHX...XhhhhhghhghhhHHhhhX.....................",
  ".........XssSffHX...XghhhhggghhhhhHHhX......................",
  "..........XsSffHmX..XhhhhgggghhhhHHhhX......................",
  "...........XSSfeeeXXghhggghhoohhhHHhhoX.....................",
  "............XSSeessssggggffhooHHHHhhooX.....................",
  ".............XXssssssgggHHHHoogHHhhgooX.....................",
  "...............XXssssfffpgggoggghhhgXX......................",
  ".................XssSffffgoooogghhgX........................",
  "...............XXsssSsffommmoooghggX........................",
  "............XXXssssssssoommmommggghhX.......................",
  "..........XXsssssshhhsSoommMMmmgghhhhX......................",
  "........XXsssssshhhHHhhogghhMMMHHgghhhX.....................",
  "......XXsssXXXgghhHHPPhhhghhmmmMMmmmggpX....................",
  "....XXsssXX...XhhHHHPPHHhgHHhhhmmMMmmmpX....................",
  "...XsssXX....XgghHHPfHHHhgHHhPHHmmmMMMPPXX..................",
  "...XXXX......XhhppefHHHHhgHHHPHHPhhhmmMMmmXXX...............",
  "............XhhhpppmHHPPhggPHggghhhhPPPMMMMmmXXX............",
  "...........XhhhhpppmHHPphgpPHhhhhhhhPPPPPmmMMMMmXXX.........",
  "..........XhhhhppppppppphgpPghhhhhhhhPPPPPpmXXXmmmmXXX......",
  "..........XhhhpppPPpphhhhXXXXXhhhhhhhhhhPPpX...XXXMMmmXXX...",
  "..........XhhhpPPPPPphhhX.....XXhhgghpphpppX......XXMMMmmXXX",
  "..........XhhhhPPPPPhhhX........XgpppphhppgX........XXXXXXX.",
  "..........XhhhhhPPhhhhX..........XhhhhhhhgX.................",
  ".........XhhhhhhhhhhhhX...........XggggghX..................",
  ".........XhhhhhhhhhhXX.............XhhhmX...................",
  "........XshhhhhhXXXX...............XhhhmX...................",
  ".......XhsshhhXX...................XhssX....................",
  ".......XhsssXX.....................XsssX....................",
  "......XphssX.......................XhhPX....................",
  "......XpppX.......................XghPPeX...................",
  ".....XshpwX.......................XshPPffXX.................",
  ".....XwhhhgX......................XsghhhhhsX................",
  ".....XwwswwX......................XXXXghffsX................",
  ".....XXXXXXX..........................XXXXXX................",
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
        The wall colour, not the page's, so the band left over when the room is
        taller than its 3:1 art reads as ceiling rather than as a seam.
      */
      className={`bg-hall-wall relative w-full overflow-hidden ${className}`}
      data-testid="dojo"
    >
      <svg
        viewBox="0 0 288 96"
        preserveAspectRatio="xMidYMax meet"
        shapeRendering="crispEdges"
        className={`h-full w-full transition-opacity duration-300 ${
          quiet ? "opacity-35" : "opacity-100"
        }`}
        aria-hidden
      >
        {/* Back wall and floor. Hard edges only — no gradients. */}
        <rect x="0" y="0" width="288" height="78" fill="var(--color-hall-wall)" />
        <rect x="0" y="12" width="288" height="1" fill="var(--color-hall-rail)" />
        <rect x="0" y="78" width="288" height="2" fill="var(--color-ink-line)" />
        <rect x="0" y="80" width="288" height="16" fill="var(--color-hall-floor)" />

        {/*
          Two shoji bays, set wide of the action. An earlier pass ruled the
          whole wall at even intervals and one of the lines ran straight
          through the ronin's chest, which is the sort of thing that reads as
          a rendering fault rather than as architecture.
        */}
        {[16, 226].map((x) => (
          <g key={x}>
            <rect x={x} y="16" width="46" height="58" fill="var(--color-hall-banner)" />
            <rect x={x} y="16" width="46" height="1" fill="var(--color-hall-rail)" />
            <rect x={x + 23} y="16" width="1" height="58" fill="var(--color-hall-rail)" />
            <rect x={x} y="44" width="46" height="1" fill="var(--color-hall-rail)" />
          </g>
        ))}

        {/* Floor boards, so the ground reads as a surface rather than a band. */}
        {[18, 66, 114, 162, 210, 258].map((x) => (
          <rect key={x} x={x} y="80" width="1" height="16" fill="var(--color-hall-wall)" />
        ))}

        {/* Wall banner, hung from the ceiling. */}
        <rect x="31" y="20" width="16" height="2" fill="var(--color-hall-rod)" />
        <rect x="33" y="22" width="12" height="40" fill="var(--color-hall-wall)" />
        <rect x="37" y="29" width="5" height="3" fill="var(--color-blood)" />
        <rect x="37" y="36" width="5" height="3" fill="var(--color-blood)" />
        <rect x="37" y="43" width="5" height="7" fill="var(--color-blood)" />
        <rect x="33" y="62" width="12" height="1" fill="var(--color-hall-rod)" />

        {/* Paper lantern on its cord. It warms as the combo builds. */}
        <rect x="249" y="13" width="1" height="12" fill="var(--color-ink-line)" />
        <rect
          x="243"
          y="25"
          width="13"
          height="16"
          fill={lit ? "var(--color-hall-lamp-case-lit)" : "var(--color-hall-lamp-case-dim)"}
        />
        <rect
          x="246"
          y="29"
          width="7"
          height="9"
          fill={lit ? "var(--color-hall-lamp-lit)" : "var(--color-hall-lamp-dim)"}
        />
        <rect x="246" y="41" width="7" height="1" fill="var(--color-ink-line)" />

        {/*
          The ronin. Feet land on the floor line at y=77.

          A strike swaps the whole figure for the attack pose from the sprite
          sheet rather than rotating a drawn rectangle past a standing body.
          Both poses are cropped to one shared frame and aligned on the hat, so
          the swap does not teleport the body sideways; the forward drive comes
          from anim-lunge, deliberately, rather than from a framing accident.

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
            <PixelArt map={RONIN_ATTACK} palette={palette} x={110} y={18} />
          ) : (
            <>
              {/*
                Drawn before the torso and overlapping it by OVERLAP rows, so
                the breath lifts the torso off real hakama rather than off a
                hole. An earlier version butted the two halves edge to edge and
                a 2px lift opened a transparent line straight across the hips.
              */}
              <PixelArt map={RONIN_LOWER} palette={palette} x={110} y={56} />
              <g className="anim-breathe">
                <PixelArt map={RONIN_UPPER} palette={palette} x={110} y={18} />
              </g>
            </>
          )}
        </g>

        {/* The post takes the hit, so it is what recoils. */}
        <g
          className={
            mood === "strike" ? "anim-recoil" : mood === "miss" ? "anim-miss" : ""
          }
        >
          <PixelArt map={POST} palette={palette} x={164} y={38} />
        </g>

        {/*
          The contact flash, at the height the blade actually meets the post
          (the tip sits at y=64) rather than running the full height of it. A
          bar the length of the whole post read as a second object standing in
          front of it instead of as an impact.
        */}
        {mood === "strike" && (
          <g className="anim-arc">
            <rect x="162" y="54" width="2" height="20" fill="var(--color-paper)" />
            <rect x="158" y="59" width="2" height="11" fill="var(--color-jade)" />
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
