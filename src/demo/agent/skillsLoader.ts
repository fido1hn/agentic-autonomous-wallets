import { readFile } from "node:fs/promises";
import path from "node:path";

export async function loadSkillsDocument(skillsPath: string = path.resolve(process.cwd(), "SKILLS.md")): Promise<string> {
  const raw = await readFile(skillsPath, "utf-8");
  const content = raw.trim();
  if (!content) {
    throw new Error(`SKILLS_EMPTY: ${skillsPath}`);
  }
  return content;
}

