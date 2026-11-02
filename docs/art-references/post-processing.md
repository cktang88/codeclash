# Pixel post-processing (scanlines, grain, grade)

Studied for `GlPost` in `src/client/render/post.ts`. The screenshots come from the libretro forum thread ["Please show off what CRT shaders can do"](https://forums.libretro.com/t/please-show-off-what-crt-shaders-can-do/19193). The game art belongs to its owners and the shader output was posted by forum users; both are reference only.

| # | Source | Licence | Taken from it |
|---|--------|---------|---------------|
| 1 | [post 88](https://forums.libretro.com/t/please-show-off-what-crt-shaders-can-do/19193/88) (`373888…png`, Street Fighter III, soft CRT preset) | reference only | A light touch: pixels stay crisp, with slight softening and colour bleed, and the palette is kept. Scanlines are barely visible. This is the level we want by default. |
| 2 | [post 6](https://forums.libretro.com/t/please-show-off-what-crt-shaders-can-do/19193/6) (`31e0a7…jpg`) | reference only | Strong scanlines: dark gaps between rows, with bright rows blooming wider. Bright pixels lose less to a scanline than dark ones. |
| 3 | [post 401](https://forums.libretro.com/t/please-show-off-what-crt-shaders-can-do/19193/401) (`025e42…jpg`) | reference only | Aperture mask plus scanlines darkens the image a lot, so it needs a brightness lift to compensate. |
| 4 | [libretro CRT shader docs](https://docs.libretro.com/shader/crt/) | docs | crt-lottes and fakelottes: the cheap variants are just scanlines plus a mask, with the scanline weight depending on brightness. |

Applied:
- scanlines only at 3+ device pixels per scene pixel
- scanline darkening that depends on brightness (bright rows lose about 5%, dark rows about 20%)
- a small brightness lift
- faint grain
- chromatic split only at the corners
