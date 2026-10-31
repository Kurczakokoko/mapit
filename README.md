# Mapit

Hearts of Iron IV mapping suite for humans and agents.

Load any existing map (vanilla or a total conversion), dump a **labeled atlas** with province IDs, paint ownership like MapChart on the real province mesh, validate the crash encyclopedia, and **generate a full launchable map** from a layer pack — provinces, states, rivers, terrain, heightmap, cities, strategic regions, countries, flags, 1936 and 1939 bookmarks.

Target game: HOI4 **1.19.x** (Operation Postern). MIT. No Paradox assets are shipped; palettes are the public index tables and, when present, copied at runtime from your install.

## Why this exists

Agents fail at custom HOI4 maps: province IDs, naval-base sea links, X-crossings, empty `buildings.txt` / `railways.txt`, mixed owners inside one state, and reverse-engineering MapChart screenshots. Mapit gives them structured data (IDs, names, neighbours) and writes files the engine will actually boot.

## Install

```bash
git clone https://github.com/Kurczakokoko/mapit.git
cd mapit
pnpm install
pnpm mapit doctor
pnpm mapit init --game "/path/to/Hearts of Iron IV" --mod "/path/to/mod"
```

Node 22+. `pnpm mapit` runs the CLI via `tsx` (no build required). `pnpm build` emits `dist/` for the `mapit` bin. Package manager: pnpm 11.8.0 (`packageManager` in `package.json`).

## Configuration

Resolution order: `--game` / `--mod` flags, then `MAPIT_GAME` / `MAPIT_MOD`, then `mapit.json` in the current directory, then `~/.config/mapit/config.json`. The game path then falls back to Steam `libraryfolders.vdf` (Linux / Windows / macOS).

| Source | Role |
|---|---|
| `--game PATH` | HOI4 install (vanilla overlay + palettes) |
| `--mod PATH` | Mod folder to load and write |
| `MAPIT_GAME` | Overrides config files. `--game` still wins. `findHoi4Install` also reads this (and `HOI4_PATH`) |
| `MAPIT_MOD` | Overrides config files. `--mod` still wins |
| `mapit init` | Writes `./mapit.json` |
| `mapit init --global` | Writes `~/.config/mapit/config.json` |

`mapit.json` is gitignored. Do not commit local game/mod paths.

## Coordinates

Internal rasters match the engine: **x east, z = 0 south**. `provinces.bmp` is a bottom-up 24-bit BMP. Author layer PNGs, the atlas SVG, and the painter preview are **north-up** (top of the image is high z). `cities.csv` uses HOI4 coordinates (z = 0 south).

## Commands

Every command except `doctor` / `init` / `generate` accepts `--game` and `--mod`. `generate` takes `--game` for palettes.

| Command | What it does |
|---|---|
| `mapit doctor` | Find the HOI4 install, print node / game / `provinces.bmp` / mod / config. Exit 1 if the game is missing |
| `mapit init [--game PATH] [--mod PATH] [--global]` | Write `mapit.json` or `~/.config/mapit/config.json` |
| `mapit inspect [--json]` | Load a map, print counts and error/warning codes. Exit 1 if errors |
| `mapit validate [--fix]` | Crash encyclopedia. `--fix` writes coastal flags and naval-base sea links (needs `--mod`) |
| `mapit atlas SELECTOR [--out DIR]` | Labeled atlas: `atlas.json` + SVG/HTML with province IDs. Default `--out ./atlas` |
| `mapit paint LAYER BRUSH --provinces 12,15 [--no-apply]` | Assign a brush and write (splits mixed states). `--no-apply` queues only |
| `mapit generate ./layers --out ./mod` | Full map from a layer pack. `--preview` skips keeping the mod; `--seed` / `--name` / `--game` override the manifest |
| `mapit serve [--mod PATH] [--game PATH] [--port 4737]` | Local MapChart UI at http://127.0.0.1:4737 |

Selectors for `atlas`: `SPR` · `state:41` · `region:10` · `bbox:x,z,w,h` · `front:SPR,SPA` · `world`.

Paint layers: `owner` · `controller` · `core` · `claim`. HOI4 stores owner on the **state**. Painting one country onto part of a state **splits** the state on apply.

## Generate a world

Authors (and agents) draw layers; Mapit builds every HOI4 map file. This is the EarthToHoI4-shaped path, from files instead of GIS (GIS comes later).

Minimum: a greyscale `heightmap.png` **or** a white-on-black `landmask.png` **or** a flat-colour `political.png`.

```bash
pnpm mapit generate ./examples/island --preview --out /tmp/sunset-preview   # report + PNGs
pnpm mapit generate ./examples/island --out ~/Documents/Paradox\ Interactive/Hearts\ of\ Iron\ IV/mod/sunset
```

Put the mod folder next to a `sunset.mod` pointer (Mapit writes the sibling automatically) so the HOI4 launcher sees it.

Output includes `provinces.bmp`, `definition.csv`, `heightmap.bmp`, `terrain.bmp`, `rivers.bmp`, `trees.bmp`, `world_normal.bmp`, `cities.bmp`, half-res colormap + water colormaps, states, strategic regions with weather, buildings / adjacent railways / supply / adjacencies terminator, countries, flags, **1936 Gathering Storm and 1939 Blitzkrieg** bookmarks (dated 1939.1.1 oob plus `_1939.txt` unit copies), localisation, and a `descriptor.mod` with `replace_path` so the overhaul launches on its own.

See [docs/generate.md](docs/generate.md) for the layer pack and [docs/quirks.md](docs/quirks.md) for the crash list.

## Paint (humans)

`mapit serve --mod PATH` is MapChart on the real mesh, north-up like the in-game camera.

- **Wheel** zooms toward the cursor; **double-click** zooms in.
- **Middle-mouse**, **right-mouse**, **Space-drag**, or **Alt-drag** pans. Arrow keys nudge.
- **Left-drag** paints land with the current brush. Sea and lakes are ignored.
- **Shift-click** inspects without painting.
- **`/`** focuses country search; **Escape** clears it. Unused civil-war `D01`–`D50` slots stay off the list until you search.
- **A** Apply · **U** Undo · **0** / **F** Fit · **+** / **−** zoom.

Paints stay **pending** until **Apply**. Mixed owners inside one state become new state files. **Undo** drops the last stroke; **Discard** drops the whole queue. Apply needs `--mod` (or `mapit init --mod`).

Political colours come from `common/countries/colors.txt` (`color = rgb { }`, `HSV { }`, `hsv360 { }`, or a bare `{ r g b }`). Country-file `color = { }` is the fallback. `color_ui` is the diplomacy UI colour and is not used on the map.

The live painter streams `/api/preview.bin` (packed RGB + province ids) once, then recolors interiors in the browser. Gold state lines and black country/coast lines stay put until Apply / Undo / Discard, which rebuild the raster. `/api/preview.png` is still there if you want a snapshot; it is not on the paint hot path. That is what keeps 5632×2048 overhauls paintable without a hitch after every stroke.

Download `atlas.json` from the footer (it includes cores and claims). Diagnostics are grouped by code; click a sample to jump to that province.

## Paint (agents)

1. `mapit atlas front:SPR,SPA --out ./atlas` — JSON with every province id, owner, VP, neighbours, cores, claims.
2. Choose ids. Do not invent them from a screenshot.
3. `mapit paint owner SPA --provinces 12,15,18 --mod PATH`
4. `mapit validate --mod PATH`

`mapit paint … --no-apply` queues without writing. The web UI is the same IR; Apply is the write.

## HTTP API (`mapit serve`)

| Method | Path | Role |
|---|---|---|
| GET | `/` | Painter UI |
| GET | `/api/meta` | Size, counts, countries (`onMap`), pending, grouped diagnostics |
| GET | `/api/preview.bin` | Packed preview (`MPIT` + RGB + u32 ids), `Cache-Control: no-store` |
| GET | `/api/preview.png` | Same raster as PNG (lazy encode) |
| GET | `/api/idmap.png` | Province ids as RGB (debug) |
| GET | `/api/province/:id` | Inspector payload (owner/controller/cores/claims, pending) |
| POST | `/api/hit` | `{ x, z }` → province (engine coords, z = 0 south) |
| POST | `/api/paint` | `{ layer, brush, provinces }` → `{ pending, painted, province }` |
| POST | `/api/undo` · `/api/discard` · `/api/apply` | Queue / write the mod |
| GET | `/api/atlas.json` | Downloadable atlas (cores + claims) |
| POST | `/api/atlas` | Write atlas files to disk |

## Architecture

One in-memory map IR. Loader and generator both produce it. Atlas, validator, painter, and the web UI all consume it.

```
layer pack ─┐
vanilla/mod ┴─► MapSession ─► atlas / validate / paint / serve
                     │
                     ▼
              HOI4 mod files
```

The loader overlays the mod on the game using `replace_path` and a file resolver, so total conversions (their own `provinces.bmp`) load as themselves. See [AGENTS.md](AGENTS.md) for the agent-facing crash list.

v1 is CLI + files. GIS-from-Earth and MCP are later work; they are not in this tree.

## Development

```bash
pnpm install
pnpm test
pnpm exec tsc --noEmit -p tsconfig.json
pnpm mapit inspect --game "$MAPIT_GAME"
pnpm mapit serve --mod "$MAPIT_MOD" --port 4737
```

CI installs with `--frozen-lockfile` and runs the Vitest suite. Hearts of Iron IV is a trademark of Paradox Interactive. Mapit is not affiliated with or endorsed by Paradox.
