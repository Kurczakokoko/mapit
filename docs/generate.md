# Layer pack → full HOI4 map

`mapit generate <layers> --out <mod>` is the EarthToHoI4-shaped path: every map layer the engine draws, plus a launch kit. GIS-from-Earth is later; this version takes **author (or agent) layer images**.

## Inputs

A directory. `manifest.json` is optional.

| File | Required | Role |
|---|---|---|
| `heightmap.png` | one of these three | Greyscale relief. Waterline (default 94) becomes sea. |
| `landmask.png` | | White land, black water. Height is synthesized from distance-to-coast + ridges if no heightmap. |
| `political.png` | | Flat unique colours = countries. Dark / near-black is sea if it is the only layer. |
| `lakes.png` | | White inland water (lakes). Otherwise inland basins not touching the map edge become lakes. |
| `terrain.png` | | RGB snapped to the vanilla terrain.bmp index table (plains, forest, hills, desert, marsh, urban, ocean, snow, …). Else height + slope + noise. |
| `rivers.png` | | Dark pixels on land are forced river traces. Else D4 flow accumulation, 1 px, sources (green) and joins (red). |
| `cities.csv` | | `name,x,z,population` in map pixels (or 0–1 normalised). Paints urban terrain and victory points. |
| `cities.png` | | Bright blobs become cities. |
| `density.png` | | Brighter = smaller provinces. |
| `continents.png` | | Unique colours → continent ids 1–7. |
| `manifest.json` | | Size, wrap, countries, spacing. |

### `manifest.json`

```json
{
  "name": "Sunset Isles",
  "width": 256,
  "height": 256,
  "waterline": 94,
  "wrap": false,
  "edgeBands": false,
  "seed": 7,
  "provinceSpacing": 14,
  "stateSize": 5,
  "countries": [
    { "tag": "SUN", "name": "Sunset", "color": [196, 72, 48] },
    { "tag": "DAW", "name": "Dawn", "color": [48, 96, 168] }
  ]
}
```

Width and height are rounded to multiples of 256. `wrap` is the HOI4 x-wrap (default true). For a single island that must not touch itself across the date line, set `"wrap": false`. Cropped continents that still wrap in-engine should set `"edgeBands": true` (sea columns on the left and right so land never wraps).

`--preview` writes `mapit-generate-report.json` and `preview-*.png` without a mod. `--seed`, `--name`, `--game` override the manifest / palette source.

## What is written

**Map:** `provinces.bmp` (24-bit), `definition.csv`, `heightmap.bmp`, `terrain.bmp`, `rivers.bmp`, `trees.bmp`, `world_normal.bmp` (half res, flat = 128,128,255), `cities.bmp`, `map/terrain/colormap_rgb_cityemissivemask_a.dds`, `buildings.txt`, `railways.txt`, `supply_nodes.txt`, `adjacencies.csv` (always with the `-1` terminator), `weatherpositions.txt` (small + big), `continent.txt`, `default.map`, `cities.txt`, `seasons.txt`, `strategicregions/*.txt` with 12 weather periods.

**History / launch kit:** `history/states`, `history/countries`, `history/units` (one infantry division per tag), `common/country_tags`, `common/countries`, `common/bookmarks`, `common/national_focus` (one generic tree), `events/mapit.txt`, `gfx/flags/*.tga`, localisation, `descriptor.mod` with `replace_path` so vanilla states/tags/bookmarks/focuses/events are not mixed in.

After writing, Mapit loads the mod and runs the validator; errors land in `mapit-generate-report.json`.

## How provinces are cut

Poisson seeds per country (so political borders stay country borders), then least-cost grow: extra cost to cross a river or a terrain change. Tiny pieces (< 8 px) merge. X-crossings are repaired. Sea and lakes are their own provinces. States cluster ~`stateSize` neighbouring land provinces of one tag. Strategic regions cluster states; sea is separate.

Rivers are 1 px, 4-connected, never on the outer frame (circular-river crash). Each network has a source pixel (index 0) and tributaries join with index 1. Width indices 3–11 follow catchment.

## Palettes

The engine keys off **indices**, not RGB. Mapit embeds the public vanilla order (wiki) and, if `--game` / `MAPIT_GAME` points at an install, copies the colour tables from your `terrain.bmp` / `rivers.bmp` / `trees.bmp`. Those bitmaps themselves are never committed.
