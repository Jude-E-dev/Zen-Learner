"use client";

/**
 * The practice hall.
 *
 * The spec asks for "chunky pixel-font damage numbers" and "a satisfying hit",
 * which only means something if there is something being hit. So: a ronin on
 * the left, a training post on the right, and every correct answer is a strike
 * that lands. XP is damage. The streak is a combo. Getting stuck quiets the
 * whole room rather than just swapping a panel.
 *
 * Everything is drawn from pixel maps below — no sprite packs, no licensing
 * ambiguity (constraint #10), and editing the art means editing a string.
 */

export type DojoMood = "idle" | "strike" | "miss" | "quiet";

const PX = 2;

/** `.` is transparent; every other character indexes into the palette. */
const PALETTE: Record<string, string> = {
  K: "#d9c88a", // straw hat, lit
  k: "#b0a06a", // straw hat, brim shadow
  f: "#c9a88a", // face
  e: "#12151d", // the eye-line under the brim
  H: "#3b4a6b", // haori
  h: "#2a3550", // haori shadow
  A: "#31405e", // sleeve
  g: "#c9a88a", // hands
  O: "#e5484d", // obi
  L: "#23283a", // hakama and legs
  S: "#d9c88a", // straw binding on the post
  P: "#7a5a3a", // post timber
  R: "#cbb27a", // rope
};

/**
 * The face reads as a face because it is lit. An earlier pass shadowed it to
 * near-black, which at this scale just looked like a gap between the hat and
 * the shoulders.
 */
/*
 * Split at the hips so the idle breath can lift the torso while the feet stay
 * planted. Lifting the whole figure reads as hopping, not breathing.
 */
const RONIN_UPPER = [
  ".......KKKKKK.......",
  ".....KKKKKKKKKK.....",
  "...KKKKKKKKKKKKKK...",
  "..KKKKKKKKKKKKKKKK..",
  ".kkkkkkkkkkkkkkkkkk.",
  "........ffff........",
  "........feef........",
  "........ffff........",
  ".......HHHHHH.......",
  "......HHHHHHHH......",
  ".....HHHHHHHHHH.....",
  "....AHHHHHHHHHHA....",
  "....AHHHHHHHHHHA....",
  "....AOOOOOOOOOOA....",
  "....gHHHHHHHHHHg....",
  ".....HHHHHHHHHH.....",
  ".....hHHHHHHHHh.....",
];

/*
 * The first row is a duplicate of the leg tops, drawn one pixel high so it
 * tucks under the haori at rest. The legs paint before the torso, so at rest
 * that row is hidden; when the breath lifts the torso it is what fills the
 * gap, instead of a slit of back wall opening across the hips.
 */
const RONIN_LOWER = [
  ".....LLLL..LLLL.....",
  ".....LLLL..LLLL.....",
  ".....LLLL..LLLL.....",
  ".....LLLL..LLLL.....",
  "....LLLLL..LLLLL....",
  "...LLLLLL..LLLLLL...",
];

const POST = [
  "...SSSS...",
  "..SSSSSS..",
  "..SSSSSS..",
  "...PPPP...",
  "...PPPP...",
  "..RRRRRR..",
  "...PPPP...",
  "...PPPP...",
  "..RRRRRR..",
  "...PPPP...",
  "...PPPP...",
  "..RRRRRR..",
  "...PPPP...",
  "...PPPP...",
  "...PPPP...",
  "..PPPPPP..",
  ".PPPPPPPP.",
];

function PixelArt({
  map,
  x,
  y,
  flip = false,
}: {
  map: string[];
  x: number;
  y: number;
  flip?: boolean;
}) {
  const width = map[0].length * PX;
  return (
    <g transform={`translate(${x} ${y})${flip ? ` scale(-1 1) translate(${-width} 0)` : ""}`}>
      {map.flatMap((row, rowIndex) =>
        [...row].map((char, colIndex) => {
          const fill = PALETTE[char];
          if (!fill) return null;
          return (
            <rect
              key={`${rowIndex}-${colIndex}`}
              x={colIndex * PX}
              y={rowIndex * PX}
              width={PX}
              height={PX}
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
  className = "grow",
}: {
  mood: DojoMood;
  combo: number;
  className?: string;
}) {
  const quiet = mood === "quiet";

  return (
    <div
      className={`relative w-full overflow-hidden ${className}`}
      data-testid="dojo"
    >
      <svg
        viewBox="0 0 192 64"
        preserveAspectRatio="xMidYMax meet"
        shapeRendering="crispEdges"
        className={`h-full w-full transition-opacity duration-300 ${
          quiet ? "opacity-35" : "opacity-100"
        }`}
        aria-hidden
      >
        {/* Back wall and floor. Hard edges only — no gradients. */}
        <rect x="0" y="0" width="192" height="52" fill="var(--color-hall-wall)" />
        <rect x="0" y="30" width="192" height="1" fill="var(--color-hall-rail)" />
        <rect x="0" y="52" width="192" height="2" fill="var(--color-ink-line)" />
        <rect x="0" y="54" width="192" height="10" fill="var(--color-hall-floor)" />
        {/* Floor boards, so the ground reads as a surface rather than a band. */}
        {[12, 46, 80, 114, 148, 182].map((x) => (
          <rect key={x} x={x} y="54" width="1" height="10" fill="var(--color-hall-wall)" />
        ))}

        {/* Wall banner, hung from the ceiling. */}
        <rect x="20" y="0" width="12" height="2" fill="var(--color-hall-rod)" />
        <rect x="21" y="2" width="10" height="30" fill="var(--color-hall-banner)" />
        <rect x="24" y="7" width="4" height="2" fill="var(--color-blood)" />
        <rect x="24" y="12" width="4" height="2" fill="var(--color-blood)" />
        <rect x="24" y="17" width="4" height="5" fill="var(--color-blood)" />
        <rect x="21" y="32" width="10" height="1" fill="var(--color-hall-rod)" />

        {/* Paper lantern on its cord. It warms as the combo builds. */}
        <rect x="166" y="0" width="1" height="10" fill="var(--color-ink-line)" />
        <rect
          x="162"
          y="10"
          width="9"
          height="11"
          fill={combo >= 3 ? "var(--color-hall-lamp-case-lit)" : "var(--color-hall-lamp-case-dim)"}
        />
        <rect
          x="164"
          y="13"
          width="5"
          height="6"
          fill={combo >= 3 ? "var(--color-hall-lamp-lit)" : "var(--color-hall-lamp-dim)"}
        />
        <rect x="164" y="21" width="5" height="1" fill="var(--color-ink-line)" />

        {/*
          The ronin. The whole figure plus the blade it holds sit in one group
          so a strike drives them forward together — animating the blade alone
          read as a sword swinging by itself, with the swordsman inert.

          Feet land on the floor line at y=52.
        */}
        <g
          className={
            mood === "strike" ? "anim-lunge" : mood === "miss" ? "anim-flinch" : ""
          }
        >
          <PixelArt map={RONIN_LOWER} x={50} y={40} />
          <g className="anim-breathe">
            <PixelArt map={RONIN_UPPER} x={50} y={8} />
          </g>

          {/* The blade, held at the right hand (x=80, y=36) and swinging through
              it on a landed strike. */}
          <g
            className={mood === "strike" ? "anim-slash" : ""}
            style={{ transformOrigin: "80px 36px" }}
          >
            <rect x="76" y="35" width="6" height="2" fill="var(--color-timber)" />
            <rect x="82" y="35" width="26" height="2" fill="var(--color-steel)" />
            <rect x="82" y="37" width="26" height="1" fill="var(--color-steel-shadow)" />
          </g>
        </g>

        {/* The post takes the hit, so it is what recoils. */}
        <g
          className={
            mood === "strike" ? "anim-recoil" : mood === "miss" ? "anim-miss" : ""
          }
        >
          <PixelArt map={POST} x={116} y={18} />
        </g>

        {/* The contact arc, drawn only at the moment of the hit. */}
        {mood === "strike" && (
          <g className="anim-arc">
            <rect x="112" y="20" width="2" height="30" fill="var(--color-paper)" />
            <rect x="109" y="25" width="2" height="20" fill="var(--color-jade)" />
          </g>
        )}

        {/* Combo lives inside the scene's own coordinates. Positioned in HTML it
            drifted away from the art when the viewBox letterboxed. */}
        {combo >= 3 && !quiet && (
          <g>
            <text
              x="188"
              y="48"
              textAnchor="end"
              fill="var(--color-gold)"
              fontSize="13"
              fontFamily="ui-monospace, monospace"
            >
              {combo}
            </text>
            <text
              x="188"
              y="56"
              textAnchor="end"
              fill="var(--color-hall-lamp-case-dim)"
              fontSize="4.5"
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
