# Sprite derivations

Two one-off scripts that turn the raw art in `Sprites/` into the two forms the
app renders: a PNG for the hall, and a character map for the ronin's strike.
Both encode real decisions — which source colour becomes which palette letter,
where the crop lands, where the figure stands — and both print the numbers the
component needs alongside the output.

They are **not** part of the build. Nothing in `pnpm build`, `pnpm test` or
`pnpm validate:content` runs them, and the app has no Python in it — these
exist so the derivations are reproducible rather than magic, and so the
decisions inside them (which source colour became which palette letter, where
the crop lands) are reviewable.

Run them from the repo root. They need Pillow:

```bash
python3 -m pip install --user pillow
python3 scripts/sprites/hall.py            # writes public/hall/hall.png
python3 scripts/sprites/ronin-attack.py    # prints the RONIN_ATTACK map
```

`ronin-attack.py` prints to stdout; paste the rows into `RONIN_ATTACK` in
`components/Dojo.tsx`. It is deliberately not a writer — the map sits inside a
commented block that explains it, and a script that rewrites source is a worse
trade than a paste.
