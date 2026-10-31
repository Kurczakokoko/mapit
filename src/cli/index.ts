#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAtlasJson, renderSvg, writeAtlas } from "../atlas/render.ts";
import { parseSelector, selectProvinces } from "../atlas/select.ts";
import { findHoi4Install, readConfig } from "../core/paths.ts";
import { autoFixCoastal, fixNavalBases, queuePaint, applyPending } from "../core/paint.ts";
import { formatDiagnostics, validate } from "../core/validate.ts";
import { generateWorld } from "../core/generate.ts";
import { writeDefinitionCsv } from "../pdx/definition.ts";
import { writeBuildingsTxt } from "../pdx/mapfiles.ts";
import { openSession, resolveLoadOptions, writeGlobalConfig, writeJsonConfig } from "./session.ts";
import { startServer } from "../serve/server.ts";

const shared = {
  game: { type: "string" as const, description: "HOI4 install path" },
  mod: { type: "string" as const, description: "Mod folder path" },
};

const doctor = defineCommand({
  meta: { name: "doctor", description: "Find HOI4 and report Mapit paths" },
  async run() {
    const cfg = readConfig();
    const found = findHoi4Install();
    const game = cfg.game ?? found;
    console.log("Mapit doctor");
    console.log(`  node     ${process.version}`);
    console.log(`  game     ${game ?? "(not found)"}`);
    const provinces = game ? join(game, "map", "provinces.bmp") : undefined;
    console.log(`  provinces.bmp  ${provinces && existsSync(provinces) ? "ok" : "missing"}`);
    console.log(`  mod      ${cfg.mod ?? "(not set)"}`);
    console.log(`  config   mapit.json or ${process.env.HOME}/.config/mapit/config.json`);
    if (!game || !provinces || !existsSync(provinces)) process.exitCode = 1;
  },
});

const init = defineCommand({
  meta: { name: "init", description: "Write mapit.json with game/mod paths" },
  args: {
    ...shared,
    global: { type: "boolean", description: "Write ~/.config/mapit/config.json" },
  },
  run({ args }) {
    const game = args.game ?? findHoi4Install();
    const path = args.global ? writeGlobalConfig(game, args.mod) : writeJsonConfig(game, args.mod);
    console.log(`Wrote ${path}`);
  },
});

const inspect = defineCommand({
  meta: { name: "inspect", description: "Load a map and print counts" },
  args: { ...shared, json: { type: "boolean", description: "Machine-readable JSON" } },
  async run({ args }) {
    const t0 = Date.now();
    const session = await openSession(args);
    const land = [...session.provinces.values()].filter((p) => p.type === "land" && p.pixels > 0).length;
    const sea = [...session.provinces.values()].filter((p) => p.type === "sea" && p.pixels > 0).length;
    const v = validate(session);
    const warningCodes: Record<string, number> = {};
    const errorCodes: Record<string, number> = {};
    for (const w of v.warnings) warningCodes[w.code] = (warningCodes[w.code] ?? 0) + 1;
    for (const e of v.errors) errorCodes[e.code] = (errorCodes[e.code] ?? 0) + 1;
    const payload = {
      width: session.width,
      height: session.height,
      ms: Date.now() - t0,
      provinces: session.provinces.size,
      land,
      sea,
      states: session.states.size,
      regions: session.regions.size,
      countries: session.countries.size,
      buildings: session.buildings.length,
      railways: session.railways.length,
      errors: v.errors.length,
      warnings: v.warnings.length,
      errorCodes,
      warningCodes,
      sampleErrors: v.errors.slice(0, 20),
      sampleWarnings: v.warnings.slice(0, 12),
    };
    if (v.errors.length) process.exitCode = 1;
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    console.log(`Map ${session.width}×${session.height}  (${payload.ms}ms)`);
    console.log(`  provinces  ${session.provinces.size}  (land ${land}, sea ${sea})`);
    console.log(`  states     ${session.states.size}`);
    console.log(`  regions    ${session.regions.size}`);
    console.log(`  countries  ${session.countries.size}`);
    console.log(`  buildings  ${session.buildings.length}`);
    console.log(`  railways   ${session.railways.length}`);
    console.log(`  errors     ${v.errors.length}`);
    console.log(`  warnings   ${v.warnings.length}`);
    if (v.errors.length) {
      const parts = Object.entries(errorCodes)
        .sort((a, b) => b[1] - a[1])
        .map(([code, n]) => `${code} ${n}`);
      console.log(`  error codes    ${parts.join(", ")}`);
      console.log(formatDiagnostics({ ...v, all: v.errors.slice(0, 20), warnings: [] }));
      if (v.errors.length > 20) console.log(`  … ${v.errors.length - 20} more errors`);
    }
    if (v.warnings.length) {
      const parts = Object.entries(warningCodes)
        .sort((a, b) => b[1] - a[1])
        .map(([code, n]) => `${code} ${n}`);
      console.log(`  warning codes  ${parts.join(", ")}`);
    }
  },
});

const validateCmd = defineCommand({
  meta: { name: "validate", description: "Run the HOI4 map crash encyclopedia" },
  args: {
    ...shared,
    fix: { type: "boolean", description: "Write coastal flags and naval-base sea links (requires --mod)" },
  },
  async run({ args }) {
    const session = await openSession(args);
    if (args.fix) {
      const mod = resolveLoadOptions(args).modPath;
      if (!mod) throw new Error("validate --fix requires --mod PATH (or mapit init --mod)");
      const c = autoFixCoastal(session);
      const n = fixNavalBases(session);
      console.log(`Auto-fix: coastal ${c}, naval bases ${n}`);
      mkdirSync(join(mod, "map"), { recursive: true });
      const defs = [...session.provinces.values()]
        .sort((a, b) => a.id - b.id)
        .map((p) => ({
          id: p.id,
          r: p.r,
          g: p.g,
          b: p.b,
          type: p.type,
          coastal: p.coastal,
          terrain: p.terrain,
          continent: p.continent,
        }));
      writeFileSync(join(mod, "map/definition.csv"), writeDefinitionCsv(defs));
      writeFileSync(join(mod, "map/buildings.txt"), writeBuildingsTxt(session.buildings));
      console.log(`Wrote ${mod}/map/definition.csv and buildings.txt`);
    }
    const v = validate(session);
    console.log(formatDiagnostics(v));
    console.log(`\n${v.errors.length} errors, ${v.warnings.length} warnings`);
    if (v.errors.length) process.exitCode = 1;
  },
});

const atlas = defineCommand({
  meta: { name: "atlas", description: "Dump a labeled atlas (JSON/SVG/HTML) for a selector" },
  args: {
    ...shared,
    selector: { type: "positional", description: "SPR | state:41 | region:10 | bbox:x,z,w,h | front:SPR,SPA | world", required: true },
    out: { type: "string", description: "Output directory", default: "./atlas" },
  },
  async run({ args }) {
    const session = await openSession(args);
    const selector = parseSelector(String(args.selector));
    const provinces = selectProvinces(session, selector);
    if (provinces.length === 0) {
      throw new Error(`Selector matched 0 provinces: ${args.selector}`);
    }
    const json = buildAtlasJson(session, selector, provinces);
    const svg = renderSvg(session, json, provinces);
    writeAtlas(String(args.out), json, svg);
    console.log(`Atlas ${provinces.length} provinces → ${args.out}/atlas.json, atlas.svg, atlas.html`);
  },
});

const paint = defineCommand({
  meta: { name: "paint", description: "Assign a brush (country tag) to provinces and write the mod" },
  args: {
    ...shared,
    layer: { type: "positional", description: "owner | controller | core | claim", required: true },
    brush: { type: "positional", description: "Country tag, e.g. SPA", required: true },
    provinces: { type: "string", description: "Comma-separated province IDs" },
    apply: { type: "boolean", description: "Write the mod (default true). Pass --no-apply to only queue.", default: true },
  },
  async run({ args }) {
    const session = await openSession(args);
    const ids = String(args.provinces ?? "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length === 0) throw new Error("Pass --provinces 1,2,3");
    const layer = String(args.layer);
    if (layer !== "owner" && layer !== "controller" && layer !== "core" && layer !== "claim") {
      throw new Error("layer must be owner|controller|core|claim");
    }
    queuePaint(session, { layer, brush: String(args.brush).toUpperCase(), provinces: ids });
    if (args.apply === false) {
      console.log(`Queued ${ids.length} provinces as ${args.brush} on ${layer} (${session.pending.length} pending)`);
      return;
    }
    const mod = resolveLoadOptions(args).modPath;
    if (!mod) throw new Error("paint --apply needs a mod path (`mapit init --mod`)");
    const result = applyPending(session, mod);
    console.log(`Painted ${ids.length} provinces as ${args.brush}. New states: ${result.createdStates}`);
    for (const f of result.wrote) console.log(`  wrote ${f}`);
  },
});

const generate = defineCommand({
  meta: { name: "generate", description: "Build a full HOI4 map from a layer pack (EarthToHoI4-class)" },
  args: {
    layers: { type: "positional", description: "Path to a layer pack directory", required: true },
    out: { type: "string", description: "Output mod folder (optional with --preview)" },
    preview: { type: "boolean", description: "Write report + preview PNGs; skip keeping a launchable mod" },
    game: { type: "string", description: "HOI4 install (copy vanilla palettes)" },
    seed: { type: "string", description: "RNG seed" },
    name: { type: "string", description: "Mod display name" },
  },
  async run({ args }) {
    if (!args.preview && !args.out) {
      throw new Error("mapit generate needs --out (omit only with --preview)");
    }
    const outDir = args.out ? String(args.out) : mkdtempSync(join(tmpdir(), "mapit-preview-"));
    const result = await generateWorld({
      layersDir: String(args.layers),
      outDir,
      preview: Boolean(args.preview),
      gamePath: args.game ?? findHoi4Install(),
      seed: args.seed ? Number(args.seed) : undefined,
      name: args.name,
    });
    console.log(result.summary);
  },
});

const serve = defineCommand({
  meta: { name: "serve", description: "Open the MapChart-style map editor" },
  args: {
    ...shared,
    port: { type: "string", description: "Port", default: "4737" },
  },
  async run({ args }) {
    const session = await openSession(args);
    const port = Number(args.port);
    await startServer({ session, port, load: resolveLoadOptions(args) });
    console.log(`Mapit UI  http://127.0.0.1:${port}`);
  },
});

const main = defineCommand({
  meta: {
    name: "mapit",
    description: "HOI4 mapping suite for humans and agents",
    version: "0.1.0",
  },
  subCommands: {
    doctor,
    init,
    inspect,
    validate: validateCmd,
    atlas,
    paint,
    generate,
    serve,
  },
});

await runMain(main);
