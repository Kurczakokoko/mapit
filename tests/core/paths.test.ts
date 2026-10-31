import { describe, expect, it } from "vitest";
import { parseSteamLibraryPaths } from "../../src/core/paths.ts";

describe("Steam libraryfolders.vdf", () => {
  it("reads path entries including escaped Windows paths", () => {
    const vdf = `"libraryfolders"
{
	"0"
	{
		"path"		"/home/user/.local/share/Steam"
	}
	"1"
	{
		"path"		"D:\\\\SteamLibrary"
	}
}
`;
    expect(parseSteamLibraryPaths(vdf)).toEqual(["/home/user/.local/share/Steam", "D:\\SteamLibrary"]);
  });
});
