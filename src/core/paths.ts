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

export function parseSteamLibraryPaths(vdf: string): string[] {
  const out: string[] = [];
  const re = /"path"\s+"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(vdf))) {
    out.push(m[1]!.replace(/\\\\/g, "\\"));
  }
  return out;
}

function isHoi4Root(dir: string): boolean {
  return existsSync(join(dir, "map", "provinces.bmp"));
}

function steamVdfCandidates(): string[] {
  const home = homedir();
  const pf86 = process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)";
  return [
    join(home, ".local/share/Steam/steamapps/libraryfolders.vdf"),
    join(home, ".steam/steam/steamapps/libraryfolders.vdf"),
    join(home, ".steam/root/steamapps/libraryfolders.vdf"),
    join(home, "Library/Application Support/Steam/steamapps/libraryfolders.vdf"),
    join(pf86, "Steam/steamapps/libraryfolders.vdf"),
  ];
}

export function findHoi4Install(): string | undefined {
  const env = process.env.MAPIT_GAME ?? process.env.HOI4_PATH;
  if (env && isHoi4Root(env)) return env;
  const home = homedir();
  const pf86 = process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)";
  const pf = process.env.PROGRAMFILES ?? "C:\\Program Files";
  const candidates: string[] = [
    join(home, ".local/share/Steam/steamapps/common/Hearts of Iron IV"),
    join(home, ".steam/steam/steamapps/common/Hearts of Iron IV"),
    join(home, ".steam/root/steamapps/common/Hearts of Iron IV"),
    join(home, "Library/Application Support/Steam/steamapps/common/Hearts of Iron IV"),
    join(pf86, "Steam/steamapps/common/Hearts of Iron IV"),
    join(pf, "Paradox Interactive/Hearts of Iron IV"),
    join(pf86, "Paradox Interactive/Hearts of Iron IV"),
  ];
  for (const vdf of steamVdfCandidates()) {
    if (!existsSync(vdf)) continue;
    try {
      for (const lib of parseSteamLibraryPaths(readFileSync(vdf, "utf8"))) {
        candidates.push(join(lib, "steamapps/common/Hearts of Iron IV"));
      }
    } catch {
      /* ignore unreadable vdf */
    }
  }
  for (const c of candidates) {
    if (isHoi4Root(c)) return c;
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
