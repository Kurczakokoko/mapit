import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseReplacePaths } from "../pdx/mapfiles.ts";

export type MapitConfig = {
  game?: string;
  mod?: string;
};

export function defaultConfigPath(): string {
  return join(homedir(), ".config", "mapit", "config.json");
}

export function readConfig(cwd = process.cwd()): MapitConfig {
  const local = join(cwd, "mapit.json");
  const global = defaultConfigPath();
  const fromFile = (p: string): MapitConfig => {
    if (!existsSync(p)) return {};
    try {
      return JSON.parse(readFileSync(p, "utf8")) as MapitConfig;
    } catch {
      return {};
    }
  };
  return {
    ...fromFile(global),
    ...fromFile(local),
    game: process.env.MAPIT_GAME ?? fromFile(local).game ?? fromFile(global).game,
    mod: process.env.MAPIT_MOD ?? fromFile(local).mod ?? fromFile(global).mod,
  };
}

export function findHoi4Install(): string | undefined {
  const env = process.env.MAPIT_GAME ?? process.env.HOI4_PATH;
  if (env && existsSync(join(env, "map", "provinces.bmp"))) return env;
  const home = homedir();
  const candidates = [
    join(home, ".local/share/Steam/steamapps/common/Hearts of Iron IV"),
    join(home, ".steam/steam/steamapps/common/Hearts of Iron IV"),
    join(home, ".steam/root/steamapps/common/Hearts of Iron IV"),
    "/run/media/cel/b526da1c-558e-443e-bbe7-5a5c8397c8ae/SteamLibrary/steamapps/common/Hearts of Iron IV",
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "map", "provinces.bmp"))) return c;
  }
  return undefined;
}

export type FileResolver = {
  gamePath?: string;
  modPath?: string;
  replacePaths: string[];
  resolve: (rel: string) => string | undefined;
  resolveDir: (rel: string) => string[];
};

export function makeResolver(gamePath?: string, modPath?: string): FileResolver {
  let replacePaths: string[] = [];
  if (modPath) {
    for (const name of ["descriptor.mod", "../" + (modPath.split(/[/\\]/).pop() ?? "") + ".mod"]) {
      const p = join(modPath, name);
      if (existsSync(p)) {
        replacePaths = parseReplacePaths(readFileSync(p, "utf8"));
        break;
      }
    }
    const parentMod = modPath.replace(/[/\\]$/, "") + ".mod";
    const sibling = join(modPath, "..", `${modPath.split(/[/\\]/).pop()}.mod`);
    for (const p of [parentMod, sibling]) {
      if (existsSync(p)) {
        replacePaths = parseReplacePaths(readFileSync(p, "utf8"));
        break;
      }
    }
  }
  const replaced = (rel: string) =>
    replacePaths.some((rp) => rel === rp || rel.startsWith(rp + "/"));
  const existsRel = (root: string | undefined, rel: string) =>
    root ? join(root, rel) : undefined;

  return {
    gamePath,
    modPath,
    replacePaths,
    resolve(rel: string) {
      const modFile = existsRel(modPath, rel);
      if (modFile && existsSync(modFile)) return modFile;
      if (replaced(rel)) return undefined;
      const gameFile = existsRel(gamePath, rel);
      if (gameFile && existsSync(gameFile)) return gameFile;
      return undefined;
    },
    resolveDir(rel: string) {
      const files = new Map<string, string>();
      const addFrom = (root: string | undefined) => {
        if (!root) return;
        const dir = join(root, rel);
        if (!existsSync(dir)) return;
        for (const name of readdirSync(dir)) {
          files.set(name, join(dir, name));
        }
      };
      if (!replaced(rel)) addFrom(gamePath);
      addFrom(modPath);
      return [...files.values()];
    },
  };
}
