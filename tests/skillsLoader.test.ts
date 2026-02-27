import { describe, expect, it } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadSkillsDocument } from "../src/demo/agent/skillsLoader";

describe("skills loader", () => {
  it("loads non-empty skills content from file", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "aegis-skills-"));
    const skillsPath = path.join(dir, "SKILLS.md");
    await writeFile(skillsPath, "# Skills\n\nUse tools.\n", "utf-8");

    const loaded = await loadSkillsDocument(skillsPath);
    expect(loaded).toContain("# Skills");
    expect(loaded).toContain("Use tools.");
  });
});

