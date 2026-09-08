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
const FIXED: Record<string, string> = {
  X: "#0a0b10", // the silhouette
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
  "............XXXXXXX..........",
  "...........XjkkkkkkX.........",
  "..........XjjkkKKKkjX........",
  "..........XjjkkKKKkjX........",
  ".......XXXgjjkkKKKkjjXXXX....",
  "....XXXjjjgjjjkkKKkhhjjjjXX..",
  "...XjjjjjjjhhhhHHHHhhjjkkkjX.",
  "...XjjjkkjjkkhhHHHHhkkKKkkkX.",
  "....XXkkkkkkkKkkKKKkkkKKkkX..",
  "......XjjKkkKKkkKKKKkkkKKX...",
  ".....XggggKjjKjkkkkkKkXXXX...",
  "....XXXXgggjjjjjkjjjXX.......",
  "........XXggggSSSSSX.........",
  ".......XX.XgggSffffX.........",
  "......XgX.XhgggfSSssX........",
  "......XggXhhhggfefshhXXX.....",
  ".....XgggshghgsefefhhgHX.....",
  "....XhhHhshghHSSSsshhhHX.....",
  "....XggHhhhhhHHSSSshHhHHX....",
  "....XhhHhfhhhHHhfffeHhHHX....",
  "....XhhhHhhhHhHHfffeHhHHX....",
  "....XehhhgHHHhHHeffeHhHhX....",
  "...XhhhhhgHHHHHHHhseHhHhX....",
  "...XhhhHHhghHHHHHhSghhHgHX...",
  "...XhhHHHhghhHHHhHHgHhhgHhX..",
  "..XhhhhhhhghgHHHhhhhHhghHhX..",
  "..XghhhhHgghghHHhhhhHhghhheX.",
  ".XhghhhhHghhhhhhhhgHggghhsfeX",
  ".XhhhhhhhghhhhhhhghhhhgggssXX",
  ".XHHhhhhhgghhogghhhhhhggssX..",
  ".XHHggPPPgooooghhhgggoofsHX..",
  "XhgghhppHgooooggggooOoopgHhX.",
  "XhgghhhgHgooooOOOOooooopgHPX.",
  "XXXghHhggghooooooooooooppsSX.",
  "...XhHhpghhhhHgoooOooooggsfX.",
  "....XHhpphhhHHgghoOohOOggsffX",
  "....XhHffhheHHgghoOohhOghsfsX",
  "....XhHfffhePggggooHHggghgfsX",
  "....XhHfeegHHgggghhHHHHgggXX.",
  "....XsffefgHHgPhgHHHPPHHgX...",
  "....XssseSgHHgPhgHHHHPHHhX...",
  ".....XssfgggpPPpgHHHHPHHgX...",
];

export const RONIN_LOWER = [
  "......XhhhhhpPPphgHHPPPHhhX..",
  "......XhhhhhpPPphgHHPPPHhhX..",
  ".....XhhhpphPPPphgHfpppHehX..",
  ".....XhhheePPPPphgHggphhehX..",
  "....XhhhheePPPPpgggghhhhegX..",
  "....XhhhheepPPpppghhhghheX...",
  ".....XhhhhppPPhpXXhhhghhhX...",
  ".....XghhhfpphhX..XgghhgX....",
  "......XghhhhhhX...XhgggX.....",
  "......XhgghhhX....XhhhX......",
  "......XhhhggX.....XsssX......",
  "......XhHHgX......XhhhX......",
  "......XswwX.......XhhhhXX....",
  "......XhHHX......XshhwwegX...",
  "......XhHHX......XshhhhhhsX..",
  "......XsHHgX.....XXXXXwwwsX..",
  "......XgwHHX..........XXXXX..",
  "......XwwwssX................",
  "......XXXXXXX................",
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
  className = "grow",
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
          The ronin. Feet land on the floor line at y=78.

          The blade is drawn only while a strike is landing, so the resting
          pose keeps the sword sheathed at the hip where the sprite carries it.
          A drawn katana held out horizontally from a hanging hand looked wrong;
          a blade that appears for the length of the cut reads as the draw
          itself, which is what a ronin with one sword would actually do.
        */}
        <g
          className={
            mood === "strike" ? "anim-lunge" : mood === "miss" ? "anim-flinch" : ""
          }
        >
          <PixelArt map={RONIN_LOWER} palette={palette} x={104} y={59} />
          <g className="anim-breathe">
            <PixelArt map={RONIN_UPPER} palette={palette} x={104} y={18} />
          </g>

          {mood === "strike" && (
            <g className="anim-slash" style={{ transformOrigin: "132px 54px" }}>
              <rect x="128" y="52" width="9" height="4" fill="var(--color-timber)" />
              <rect x="137" y="52" width="34" height="3" fill="var(--color-steel)" />
              <rect x="137" y="55" width="34" height="1" fill="var(--color-steel-shadow)" />
            </g>
          )}
        </g>

        {/* The post takes the hit, so it is what recoils. */}
        <g
          className={
            mood === "strike" ? "anim-recoil" : mood === "miss" ? "anim-miss" : ""
          }
        >
          <PixelArt map={POST} palette={palette} x={166} y={39} />
        </g>

        {/* The contact arc, drawn only at the moment of the hit. */}
        {mood === "strike" && (
          <g className="anim-arc">
            <rect x="164" y="36" width="2" height="42" fill="var(--color-paper)" />
            <rect x="160" y="42" width="2" height="30" fill="var(--color-jade)" />
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
              x="173"
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
