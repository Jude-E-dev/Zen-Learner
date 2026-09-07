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
const RONIN = [
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
        <rect x="0" y="0" width="192" height="52" fill="#12141b" />
        <rect x="0" y="30" width="192" height="1" fill="#191d27" />
        <rect x="0" y="52" width="192" height="2" fill="#2a2f3d" />
        <rect x="0" y="54" width="192" height="10" fill="#191c25" />
        {/* Floor boards, so the ground reads as a surface rather than a band. */}
        {[12, 46, 80, 114, 148, 182].map((x) => (
          <rect key={x} x={x} y="54" width="1" height="10" fill="#12141b" />
        ))}

        {/* Wall banner, hung from the ceiling. */}
        <rect x="20" y="0" width="12" height="2" fill="#3b4a6b" />
        <rect x="21" y="2" width="10" height="30" fill="#1d2230" />
        <rect x="24" y="7" width="4" height="2" fill="#e5484d" />
        <rect x="24" y="12" width="4" height="2" fill="#e5484d" />
        <rect x="24" y="17" width="4" height="5" fill="#e5484d" />
        <rect x="21" y="32" width="10" height="1" fill="#3b4a6b" />

        {/* Paper lantern on its cord. It warms as the combo builds. */}
        <rect x="166" y="0" width="1" height="10" fill="#2a2f3d" />
        <rect
          x="162"
          y="10"
          width="9"
          height="11"
          fill={combo >= 3 ? "#f5b544" : "#8a6a2a"}
        />
        <rect
          x="164"
          y="13"
          width="5"
          height="6"
          fill={combo >= 3 ? "#ffe9b0" : "#c9a45a"}
        />
        <rect x="164" y="21" width="5" height="1" fill="#2a2f3d" />

        {/* Feet land on the floor line at y=52. */}
        <PixelArt map={RONIN} x={50} y={8} />

        {/* The post takes the hit, so it is what recoils. */}
        <g
          className={
            mood === "strike" ? "anim-recoil" : mood === "miss" ? "anim-miss" : ""
          }
        >
          <PixelArt map={POST} x={116} y={18} />
        </g>

        {/* The blade, held at the right hand (x=80, y=36) and swinging through
            it on a landed strike. */}
        <g
          className={mood === "strike" ? "anim-slash" : ""}
          style={{ transformOrigin: "80px 36px" }}
        >
          <rect x="76" y="35" width="6" height="2" fill="#7a5a3a" />
          <rect x="82" y="35" width="26" height="2" fill="#cfd6e6" />
          <rect x="82" y="37" width="26" height="1" fill="#8e97ab" />
        </g>

        {/* The contact arc, drawn only at the moment of the hit. */}
        {mood === "strike" && (
          <g className="anim-arc">
            <rect x="112" y="20" width="2" height="30" fill="#e8e4d9" />
            <rect x="109" y="25" width="2" height="20" fill="#4ade80" />
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
              fill="#f5b544"
              fontSize="13"
              fontFamily="ui-monospace, monospace"
            >
              {combo}
            </text>
            <text
              x="188"
              y="56"
              textAnchor="end"
              fill="#8a6a2a"
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
