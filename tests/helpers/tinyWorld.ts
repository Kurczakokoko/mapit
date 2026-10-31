import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodeBmp24 } from "../../src/pdx/bmp.ts";
import { writeDefinitionCsv, type ProvinceDef } from "../../src/pdx/definition.ts";

export function writeTinyWorld(root: string): string {
  mkdirSync(join(root, "map/strategicregions"), { recursive: true });
  mkdirSync(join(root, "history/states"), { recursive: true });
  mkdirSync(join(root, "common/country_tags"), { recursive: true });
  mkdirSync(join(root, "common/countries"), { recursive: true });

  const width = 256;
  const height = 256;
  const defs: ProvinceDef[] = [
    { id: 1, r: 200, g: 40, b: 40, type: "land", coastal: true, terrain: "plains", continent: 1 },
    { id: 2, r: 40, g: 200, b: 40, type: "land", coastal: true, terrain: "forest", continent: 1 },
    { id: 3, r: 40, g: 40, b: 200, type: "land", coastal: false, terrain: "hills", continent: 1 },
    { id: 4, r: 20, g: 20, b: 160, type: "sea", coastal: true, terrain: "ocean", continent: 0 },
  ];
  const rgb = new Uint8Array(width * height * 3);
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      let r: ProvinceDef;
      if (z >= 192 && x >= 20 && x < 160) r = defs[3]!;
      else if (x < 85) r = defs[0]!;
      else if (x < 170) r = defs[1]!;
      else r = defs[2]!;
      const i = (z * width + x) * 3;
      rgb[i] = r.r;
      rgb[i + 1] = r.g;
      rgb[i + 2] = r.b;
    }
  }
  writeFileSync(join(root, "map/provinces.bmp"), encodeBmp24({ width, height, data: rgb }));
  writeFileSync(join(root, "map/definition.csv"), writeDefinitionCsv(defs));
  writeFileSync(
    join(root, "map/buildings.txt"),
    "1;naval_base;40.00;10.00;180.00;0.00;4\n1;arms_factory;40.00;10.00;100.00;0.00;0\n",
  );
  writeFileSync(join(root, "map/railways.txt"), "1 2 1 2\n");
  writeFileSync(join(root, "map/supply_nodes.txt"), "1 1\n");
  writeFileSync(
    join(root, "map/adjacencies.csv"),
    "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\r\n-1;-1;;-1;-1;-1;-1;-1;-1\r\n",
  );
  writeFileSync(join(root, "map/weatherpositions.txt"), "1;128.00;10.00;128.00;small\n1;130.00;10.00;130.00;big\n");
  writeFileSync(join(root, "map/continent.txt"), "continents = {\n\teurope\n}\n");
  writeFileSync(
    join(root, "map/strategicregions/1-Test.txt"),
    `strategic_region={
	id=1
	name="STRATEGICREGION_1"
	provinces={ 1 2 3 4 }
}
`,
  );
  writeFileSync(
    join(root, "history/states/1-West.txt"),
    `state={
	id=1
	name="STATE_1"
	history={
		owner = SPR
		victory_points = { 1 10 }
		buildings = {
			infrastructure = 2
			1 = { naval_base = 2 }
		}
		add_core_of = SPR
	}
	provinces={ 1 2 }
	manpower=1000000
	state_category=town
	local_supplies=1.0
}
`,
  );
  writeFileSync(
    join(root, "history/states/2-East.txt"),
    `state={
	id=2
	name="STATE_2"
	history={
		owner = POR
		add_core_of = POR
	}
	provinces={ 3 }
	manpower=500000
	state_category=rural
	local_supplies=0
}
`,
  );
  writeFileSync(join(root, "common/country_tags/00_countries.txt"), `SPR = "countries/Spain.txt"
POR = "countries/Portugal.txt"
SPA = "countries/Nationalist Spain.txt"
`);
  writeFileSync(join(root, "common/countries/Spain.txt"), "color = { 242 205 94 }\n");
  writeFileSync(join(root, "common/countries/Portugal.txt"), "color = { 39 64 32 }\n");
  writeFileSync(join(root, "common/countries/Nationalist Spain.txt"), "color = { 180 40 40 }\n");
  mkdirSync(join(root, "history/countries"), { recursive: true });
  writeFileSync(join(root, "history/countries/SPR - Spain.txt"), "capital = 1\n");
  writeFileSync(join(root, "history/countries/POR - Portugal.txt"), "capital = 2\n");
  writeFileSync(join(root, "history/countries/SPA - Nationalist Spain.txt"), "capital = 1\n");
  return root;
}
