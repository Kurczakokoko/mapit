# HOI4 map crash encyclopedia

These are the failures Mapit validates. Codes match `mapit validate` output.

| Code | Severity | Meaning |
|---|---|---|
| `DIM_NOT_256` | error | Width or height is not a multiple of 256 |
| `PIXEL_BUDGET` | error | More than ~13,238,272 pixels |
| `ID_GAP` | error | Missing province ids between min and max — later definitions shift and the game dies |
| `DUP_RGB` | error | Two provinces share an RGB in `definition.csv` / `provinces.bmp` |
| `UNKNOWN_PIXELS` | error | `provinces.bmp` colours missing from `definition.csv` |
| `X_CROSSING` | error | Four provinces meet at a corner |
| `NO_PIXELS` | error | A definition has no pixels |
| `CONTINENT_ZERO` | error | Land province with continent 0 |
| `TERRAIN_SEA` | error | Sea province terrain is not `ocean` |
| `TERRAIN_LAKE` | error | Lake province terrain is not `lakes` |
| `LAND_NO_STATE` | error | Land province in no state |
| `NO_REGION` | error | Province in no strategic region |
| `STATE_MULTI_REGION` | error | One state spans two strategic regions |
| `NAVAL_BASE_NO_SEA` | error | `naval_base` / `floating_harbor` in `buildings.txt` has sea province 0 / missing |
| `EMPTY_BUILDINGS` | error | Empty `buildings.txt` crashes on a new map |
| `EMPTY_RAILWAYS` | error | Empty `railways.txt` crashes |
| `RAIL_NOT_ADJACENT` | error | Consecutive railway provinces are not 4-adjacent (singleplayer / supply CTD) |
| `RAIL_NOT_LAND` | error | Railway visits a missing or non-land province |
| `EMPTY_SUPPLY` | error | Empty `supply_nodes.txt` crashes |
| `ADJACENCY_TERMINATOR` | error | `adjacencies.csv` missing the `-1` row |
| `WEATHER_SIZE` | error | `weatherpositions.txt` needs both a `small` and a `big`/`large` object |
| `PROVINCE_CAP` | error | More than ~21,000 provinces (hard cap 65535) |
| `DISCONNECTED` | warning | Province is not 4-connected |
| `TOO_SMALL` | warning | Under 8 pixels |
| `TOO_LARGE_BOX` | warning | Bounding box larger than 1/8 of the map |
| `COASTAL_MISMATCH` | warning | `definition.csv` coastal flag disagrees with land–sea adjacency (wrap counts) |
| `MIXED_OWNER` | warning | Pending owner paint would mix tags in one state (Apply splits) |
| `BUILDING_STATE` | warning | `buildings.txt` row state id disagrees with the province at (x,z) |

`mapit validate --fix --mod PATH` rewrites coastal flags and fills naval-base sea provinces from adjacency.

## File facts (1.19)

- `provinces.bmp`: 24-bit, BITMAPINFOHEADER, BGR, bottom-up.
- `heightmap.bmp` / `terrain.bmp` / `rivers.bmp` / `trees.bmp` / `cities.bmp`: 8-bit indexed. The game reads the **index**. Vanilla `terrain.bmp` often uses a BITMAPV5HEADER (`biSize` 124); Mapit writes a 40-byte BITMAPINFOHEADER with a 256-colour table, which the engine accepts.
- Height: sea ~89, coast 94, land ≥ 96, peaks ~239.
- Rivers: index 0 source (green), 1 join (red), 2 split (yellow), 3–11 width, 254 sea/lake, 255 land. 1 px, 4-connected. Do not run off the top/bottom edge.
- `world_normal.bmp`: 24-bit, typically half resolution; flat is `128,128,255`.
- `trees.bmp` is smaller than the world; `default.map` `tree = { 3 4 7 10 }` names which indices count as trees.
- `buildings.txt`: `state;type;x;y;z;rot;seaProvince`.
- `railways.txt`: `level count p1 p2 …`
- `supply_nodes.txt`: `level province`
- Adjacencies last row: `-1;-1;;-1;-1;-1;-1;-1;-1`
- Weather object sizes: vanilla uses `small` and `big` (wiki sometimes says `large`; Mapit accepts both).
- Ownership is **per state**. Mixed brushes require a state split.

Coordinates: x increases east, z = 0 at the south. Internal rasters use the same convention as the BMP.
