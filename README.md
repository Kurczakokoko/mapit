# Mapit

Hearts of Iron IV mapping suite for humans and agents.

Load any existing map (vanilla or a total conversion), dump a **labeled atlas** with province IDs, paint ownership like MapChart on the real province mesh, validate the crash encyclopedia, and **generate a full launchable map** from a layer pack — provinces, states, rivers, terrain, heightmap, cities, strategic regions, countries, flags, bookmark.

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

Node 22+. `pnpm mapit` runs the CLI via `tsx` (no build required). `pnpm build` emits `dist/` for the `mapit` bin.

## Commands

| Command | What it does |
|---|---|
| `mapit doctor` | Find the HOI4 install |
| `mapit init` | Write `mapit.json` / `~/.config/mapit/config.json` |
| `mapit inspect [--json]` | Load a map, print counts and errors (exit 1 if errors) |
| `mapit validate [--fix]` | Crash encyclopedia. `--fix` writes coastal flags and naval-base sea links (needs `--mod`) |
| `mapit atlas SPR` | Labeled atlas: `atlas.json` + SVG/HTML with province IDs |
| `mapit paint owner SPA --provinces 12,15 --mod PATH` | Assign a brush and write (splits mixed states). `--no-apply` queues only |
| `mapit generate ./layers --out ./mod` | Full map from a layer pack. `--preview` skips keeping the mod |
| `mapit serve --mod PATH` | Local MapChart UI at http://127.0.0.1:4737 |

Selectors for `atlas`: `SPR` · `state:41` · `region:10` · `bbox:x,z,w,h` · `front:SPR,SPA` · `world`.

Env: `MAPIT_GAME`, `MAPIT_MOD`.

## Generate a world

Authors (and agents) draw layers; Mapit builds every HOI4 map file. This is the EarthToHoI4-shaped path, from files instead of GIS (GIS comes later).

Minimum: a greyscale `heightmap.png` **or** a white-on-black `landmask.png` **or** a flat-colour `political.png`.

```bash
pnpm mapit generate ./examples/island --preview --out /tmp/sunset-preview   # report + PNGs
pnpm mapit generate ./examples/island --out ~/Documents/Paradox\ Interactive/Hearts\ of\ Iron\ IV/mod/sunset
```

Put the mod folder next to a `sunset.mod` pointer (Mapit writes the sibling automatically) so the HOI4 launcher sees it.

Output includes `provinces.bmp`, `definition.csv`, `heightmap.bmp`, `terrain.bmp`, `rivers.bmp`, `trees.bmp`, `world_normal.bmp`, `cities.bmp`, half-res colormap + water colormaps, states, strategic regions with weather, buildings / adjacent railways / supply / adjacencies terminator, countries, flags, 1936 and 1939 bookmarks, localisation, and a `descriptor.mod` with `replace_path` so the overhaul launches on its own.

`mapit doctor` finds the install via Steam `libraryfolders.vdf` (Linux / Windows / macOS) plus `MAPIT_GAME`.

See [docs/generate.md](docs/generate.md) for the layer pack and [docs/quirks.md](docs/quirks.md) for the crash list.

## Paint (humans)

`mapit serve --mod PATH` is MapChart on the real mesh, north-up like the in-game camera. Wheel zooms toward the cursor, middle-mouse or Space-drag pans, left-drag paints land, Shift-click inspects. Search the brush list on big overhauls (`/` focuses search). Political colours come from `common/countries/colors.txt`. **Apply** writes the mod; mixed owners inside one state become new state files (HOI4 ownership is per state). Unused civil-war `D01`–`D50` slots stay off the brush list. Download `atlas.json` from the footer (it includes cores and claims).

## Paint (agents)

1. `mapit atlas front:SPR,SPA --out ./atlas` — JSON with every province id, owner, VP, neighbours.
2. Choose ids.
3. `mapit paint owner SPA --provinces 12,15,18 --mod PATH`
4. `mapit validate --mod PATH`

## Architecture

One in-memory map IR. Loader and generator both produce it. Atlas, validator, painter, and the web UI all consume it.

```
layer pack ─┐
vanilla/mod ┴─► MapSession ─► atlas / validate / paint / serve
                     │
                     ▼
              HOI4 mod files
```

## Development

```bash
pnpm test
pnpm mapit inspect --game "$MAPIT_GAME"
```

Hearts of Iron IV is a trademark of Paradox Interactive. Mapit is not affiliated with or endorsed by Paradox.
