# Mapit — notes for agents

You are editing Hearts of Iron IV maps. Do not invent province IDs from screenshots. Load the map and read `atlas.json`.

## First run

```bash
pnpm install
pnpm mapit doctor
pnpm mapit inspect --json
```

If doctor cannot find the game, set `MAPIT_GAME` or `mapit init --game PATH`.

## Read a map

```bash
pnpm mapit atlas SPR --out ./atlas
# or: state:41 | region:10 | bbox:x,z,w,h | front:TAG1,TAG2 | world
```

`atlas/atlas.json` lists province `id`, `owner`, `state`, `terrain`, `coastal`, `vp`, `buildings`, `neighbors`, `centroid`. SVG/HTML label those IDs on the land.

## Change ownership

HOI4 stores owner on the **state**, not the province. Painting one country onto part of a state **splits** the state on apply. One brush per province.

```bash
pnpm mapit paint owner SPA --provinces 12,15,18 --mod "$MAPIT_MOD"
pnpm mapit validate --mod "$MAPIT_MOD"
```

The web UI (`mapit serve --mod PATH`) keeps paints pending until Apply. The CLI applies immediately.

## Generate a new world

Put layers in a folder (see `docs/generate.md`). Minimum one of `heightmap.png`, `landmask.png`, `political.png`.

```bash
pnpm mapit generate ./layers --out ./my_mod --preview
# read my_mod/mapit-generate-report.json and preview-*.png
pnpm mapit generate ./layers --out ./my_mod
pnpm mapit inspect --mod ./my_mod --json
pnpm mapit validate --mod ./my_mod
```

The generator writes every layer the engine needs to boot: provinces, heightmap, terrain, rivers (1 px, sources + joins), trees, world_normal, cities, colormap, states, strategic regions, railways, supply, buildings (naval bases point at a sea province), adjacencies terminator, weather small+big, launch kit (tags, flags, bookmark, `replace_path`).

## Crash list (do not skip)

Empty `buildings.txt` / `railways.txt` / `supply_nodes.txt` crash. Missing `-1` adjacency terminator crashes. Province ID gaps crash. X-crossings crash. Naval bases need a sea province column. `weatherpositions.txt` needs both `small` and `big` (vanilla) objects. Map sides must be multiples of 256. Pixel budget ≈ 13.2e6. ~21k province cap. Definition `coastal` must match land–sea adjacency, including wrap.

Coords: x east, z = 0 south. BMPs are bottom-up. Internal rasters match that.

## Do not

- Ship Paradox bitmap assets in git. Copy palettes from the user's install at runtime.
- Put two owners in one state file.
- Leave land provinces out of a state or any province out of a strategic region.
- Paint from a MapChart screenshot without resolving IDs through Mapit.
