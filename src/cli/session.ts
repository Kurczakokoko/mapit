import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadMap, type LoadOptions } from "../core/load.ts";
import { findHoi4Install, readConfig, defaultConfigPath } from "../core/paths.ts";
import type { MapSession } from "../core/ir.ts";

export function resolveLoadOptions(opts: { game?: string; mod?: string }): LoadOptions {
  const cfg = readConfig();
  const game = opts.game ?? cfg.game ?? findHoi4Install();
  const mod = opts.mod ?? cfg.mod;
  if (!game && !mod) {
    throw new Error("No HOI4 game or mod path. Run `mapit doctor` or `mapit init --game PATH`.");
  }
  return { gamePath: game, modPath: mod };
}

export async function openSession(opts: { game?: string; mod?: string }): Promise<MapSession> {
  return loadMap(resolveLoadOptions(opts));
}

export function writeJsonConfig(game?: string, mod?: string, cwd = process.cwd()): string {
  const local = `${cwd}/mapit.json`;
  const current = readConfig(cwd);
  const next = { ...current, ...(game ? { game } : {}), ...(mod ? { mod } : {}) };
  writeFileSync(local, JSON.stringify(next, null, 2) + "\n");
  return local;
}

export function writeGlobalConfig(game?: string, mod?: string): string {
  const p = defaultConfigPath();
  mkdirSync(dirname(p), { recursive: true });
  const current = readConfig();
  writeFileSync(p, JSON.stringify({ ...current, ...(game ? { game } : {}), ...(mod ? { mod } : {}) }, null, 2) + "\n");
  return p;
}
