import { describe, expect, it } from "vitest";
import { parseStateFile, writeStateFile } from "../../src/pdx/states.ts";

describe("state files", () => {
  it("round-trips impassable and force_link_ownership_to", async () => {
    const raw = `state={
	id=962
	name="STATE_962"
	impassable = yes
	force_link_ownership_to = 495
	history={
		owner = BRA
		add_core_of = BRA
	}
	provinces={ 1 2 }
	manpower=1000
	state_category=wasteland
	local_supplies=0
}
`;
    const st = await parseStateFile("962-Amazon.txt", raw);
    expect(st.impassable).toBe(true);
    expect(st.forceLinkOwnershipTo).toBe(495);
    const out = writeStateFile(st);
    expect(out).toContain("impassable = yes");
    expect(out).toContain("force_link_ownership_to = 495");
    expect(out).toContain("owner = BRA");
  });
});
