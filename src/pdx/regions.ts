import type { StrategicRegion, WeatherPeriod } from "../core/ir.ts";
import {
  asArray,
  asIdList,
  asNumber,
  asRecord,
  asString,
  parsePdx,
} from "./clausewitz.ts";

export async function parseRegionFile(
  fileName: string,
  text: string,
): Promise<StrategicRegion> {
  const root = asRecord(await parsePdx(text));
  const body = asRecord(root.strategic_region ?? root);
  const weatherBlock = asRecord(body.weather);
  const periods: WeatherPeriod[] = [];
  for (const period of asArray<unknown>(weatherBlock.period)) {
    const p = asRecord(period);
    const between = asIdList(p.between);
    const temperature = asArray<number>(p.temperature).map((n) => asNumber(n));
    const chances: Record<string, number> = {};
    for (const [k, v] of Object.entries(p)) {
      if (k === "between" || k === "temperature") continue;
      if (typeof v === "number") chances[k] = v;
    }
    periods.push({
      between: [between[0] ?? 0, between[1] ?? 0],
      temperature: [temperature[0] ?? 0, temperature[1] ?? 0],
      chances,
    });
  }
  return {
    id: asNumber(body.id),
    name: asString(body.name, fileName),
    fileName,
    provinces: asIdList(body.provinces),
    navalTerrain: asString(body.naval_terrain) || undefined,
    weather: periods,
  };
}

const MONTH_LAST_DAY = [30, 27, 30, 29, 30, 29, 30, 30, 29, 30, 29, 30];

export function monthBetweenText(month: number): string {
  const last = MONTH_LAST_DAY[month] ?? 30;
  return `0.${month} ${last}.${month}`;
}

export function defaultWeather(avgTemp: number): WeatherPeriod[] {
  const seasonal = [0, 1, 4, 7, 10, 14, 16, 15, 11, 6, 3, 1];
  return seasonal.map((s, i) => {
    const t = avgTemp + (s - 8);
    return {
      between: [i, MONTH_LAST_DAY[i] ?? 30],
      temperature: [Math.round((t - 6) * 10) / 10, Math.round((t + 8) * 10) / 10],
      chances: {
        no_phenomenon: 0.7,
        rain_light: 0.2,
        rain_heavy: 0.08,
        snow: t < 2 ? 0.05 : 0,
        blizzard: 0,
        arctic_water: 0,
        mud: 1,
        sandstorm: 0,
        min_snow_level: 0,
      },
    };
  });
}

export function writeRegionFile(region: StrategicRegion): string {
  const weather = region.weather.length ? region.weather : defaultWeather(10);
  const periods = weather
    .map((p, i) => {
      const chances = Object.entries(p.chances)
        .map(([k, v]) => `\t\t\t${k}=${typeof v === "number" ? v.toFixed(3) : v}`)
        .join("\n");
      const between = monthBetweenText(p.between[0] ?? i);
      return `\t\tperiod={\n\t\t\tbetween={ ${between} }\n\t\t\ttemperature={ ${p.temperature[0].toFixed(1)} ${p.temperature[1].toFixed(1)} }\n${chances}\n\t\t}`;
    })
    .join("\n");
  const naval = region.navalTerrain ? `\tnaval_terrain=${region.navalTerrain}\n` : "";
  return `strategic_region={
	id=${region.id}
	name="${region.name}"
${naval}\tprovinces={
		${region.provinces.join(" ")}
	}
	weather={
${periods}
	}
}
`;
}
