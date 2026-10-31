import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { solidTga } from "../pdx/media.ts";

export type KitCountry = {
  tag: string;
  name: string;
  color: [number, number, number];
  capital: number;
  capitalProvince: number;
};

export function writeLaunchKit(opts: {
  outDir: string;
  modName: string;
  supportedVersion?: string;
  countries: KitCountry[];
  stateNames: { id: number; name: string }[];
  regionNames: { id: number; name: string }[];
}): void {
  const { outDir, countries } = opts;
  mkdirSync(join(outDir, "common/country_tags"), { recursive: true });
  mkdirSync(join(outDir, "common/countries"), { recursive: true });
  mkdirSync(join(outDir, "common/bookmarks"), { recursive: true });
  mkdirSync(join(outDir, "common/national_focus"), { recursive: true });
  mkdirSync(join(outDir, "history/countries"), { recursive: true });
  mkdirSync(join(outDir, "history/units"), { recursive: true });
  mkdirSync(join(outDir, "events"), { recursive: true });
  mkdirSync(join(outDir, "localisation/english"), { recursive: true });
  mkdirSync(join(outDir, "gfx/flags/medium"), { recursive: true });
  mkdirSync(join(outDir, "gfx/flags/small"), { recursive: true });

  const tagLines = countries.map((c) => `${c.tag} = "countries/${c.tag}.txt"`).join("\n") + "\n";
  writeFileSync(join(outDir, "common/country_tags/00_countries.txt"), tagLines);

  const colorsTxt = countries
    .map(
      (c) =>
        `${c.tag} = {\n\tcolor = rgb { ${c.color.join(" ")} }\n\tcolor_ui = rgb { ${c.color.join(" ")} }\n}\n`,
    )
    .join("\n");
  writeFileSync(join(outDir, "common/countries/colors.txt"), colorsTxt);

  for (const c of countries) {
    writeFileSync(
      join(outDir, `common/countries/${c.tag}.txt`),
      `graphical_culture = western_european_gfx
graphical_culture_2d = western_european_2d
color = { ${c.color.join(" ")} }
`,
    );
    writeFileSync(
      join(outDir, `history/countries/${c.tag} - ${c.name}.txt`),
      `capital = ${c.capital}
oob = "${c.tag}_1936"
set_research_slots = 3
set_technology = {
	infantry_weapons = 1
	infantry_weapons1 = 1
}
set_politics = {
	ruling_party = neutrality
	last_election = "1935.1.1"
	election_frequency = 48
	elections_allowed = no
}
set_popularities = {
	democratic = 10
	fascism = 10
	communism = 10
	neutrality = 70
}
`,
    );
    writeFileSync(
      join(outDir, `history/units/${c.tag}_1936.txt`),
      `division_template = {
	name = "Infantry Division"
	regiments = {
		infantry = { x = 0 y = 0 }
		infantry = { x = 0 y = 1 }
		infantry = { x = 1 y = 0 }
		infantry = { x = 1 y = 1 }
	}
}
units = {
	division = {
		name = "1st Division"
		location = ${c.capitalProvince}
		division_template = "Infantry Division"
		start_experience_factor = 0.1
	}
}
`,
    );
    writeFileSync(join(outDir, `gfx/flags/${c.tag}.tga`), solidTga(82, 52, c.color));
    writeFileSync(join(outDir, `gfx/flags/medium/${c.tag}.tga`), solidTga(41, 26, c.color));
    writeFileSync(join(outDir, `gfx/flags/small/${c.tag}.tga`), solidTga(10, 7, c.color));
  }

  const defaultTag = countries[0]?.tag ?? "TAG";
  const bookmarkCountries = countries
    .map(
      (c) => `\t\t${c.tag} = {
			history = "${c.tag}_GATHERING_STORM_DESC"
			ideology = neutrality
			available = { always = yes }
		}`,
    )
    .join("\n");
  writeFileSync(
    join(outDir, "common/bookmarks/the_gathering_storm.txt"),
    `bookmarks = {
	bookmark = {
		name = "MAPIT_GATHERING_STORM"
		desc = "MAPIT_GATHERING_STORM_DESC"
		date = 1936.1.1.12
		picture = "GFX_select_date_1936"
		default_country = "${defaultTag}"
		default = yes
${bookmarkCountries}
		"---" = {
			history = "OTHER_GATHERING_STORM_DESC"
		}
		effect = {
			randomize_weather = 22345
		}
	}
}
`,
  );

  const focusCountries = countries.map((c) => `\t\tmodifier = { add = 10 tag = ${c.tag} }`).join("\n");
  writeFileSync(
    join(outDir, "common/national_focus/mapit_generic.txt"),
    `focus_tree = {
	id = mapit_generic
	country = {
		factor = 0
${focusCountries}
	}
	default = no
	reset_on_civilwar = no
	focus = {
		id = MAPIT_develop_capital
		icon = GFX_goal_generic_construct_infrastructure
		x = 0
		y = 0
		cost = 10
		search_filters = { FOCUS_FILTER_INDUSTRY }
		completion_reward = {
			capital_scope = {
				add_extra_state_shared_building_slots = 1
				add_building_construction = { type = industrial_complex level = 1 instant_build = yes }
			}
		}
	}
}
`,
  );
  writeFileSync(join(outDir, "events/mapit.txt"), "add_namespace = mapit\n");

  const locStates = opts.stateNames.map((s) => ` STATE_${s.id}:0 "${escapeYml(s.name)}"`).join("\n");
  const locRegions = opts.regionNames.map((s) => ` STRATEGICREGION_${s.id}:0 "${escapeYml(s.name)}"`).join("\n");
  const locTags = countries
    .map(
      (c) =>
        ` ${c.tag}:0 "${escapeYml(c.name)}"\n ${c.tag}_DEF:0 "${escapeYml(c.name)}"\n ${c.tag}_ADJ:0 "${escapeYml(c.name)}"\n ${c.tag}_GATHERING_STORM_DESC:0 "${escapeYml(c.name)} in 1936."`,
    )
    .join("\n");
  const yml =
    "\ufeffl_english:\n MAPIT_GATHERING_STORM:0 \"" +
    escapeYml(opts.modName) +
    "\"\n MAPIT_GATHERING_STORM_DESC:0 \"A Mapit-generated world.\"\n MAPIT_develop_capital:0 \"Develop Capital\"\n MAPIT_develop_capital_desc:0 \"Expand the capital's workshops.\"\n" +
    locTags +
    "\n" +
    locStates +
    "\n" +
    locRegions +
    "\n";
  writeFileSync(join(outDir, "localisation/english/mapit_l_english.yml"), yml);

  const folder = outDir.split(/[/\\]/).pop() ?? "mapit_mod";
  const descriptor = `name="${opts.modName}"
path="mod/${folder}"
supported_version="${opts.supportedVersion ?? "1.19.*"}"
replace_path="history/states"
replace_path="history/countries"
replace_path="history/units"
replace_path="map/strategicregions"
replace_path="common/country_tags"
replace_path="common/bookmarks"
replace_path="common/national_focus"
replace_path="events"
`;
  writeFileSync(join(outDir, "descriptor.mod"), descriptor);
  writeFileSync(join(outDir, `${folder}.mod`), descriptor);
}

function escapeYml(s: string): string {
  return s.replace(/"/g, '\\"');
}
