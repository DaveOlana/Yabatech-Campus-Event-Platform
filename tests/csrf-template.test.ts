import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function serverRenderedPostForms(relativeTemplatePath: string): string[] {
  const template = readFileSync(path.join(repositoryRoot, relativeTemplatePath), "utf8");
  return (template.match(/<form\b[\s\S]*?<\/form>/gi) ?? [])
    .filter((form) => /\bmethod=["']post["']/i.test(form));
}

describe("server-rendered CSRF fields", () => {
  it.each([
    ["views/admin/events/detail.ejs", 3],
    ["views/admin/organizers/detail.ejs", 2],
    ["views/admin/organizers/index.ejs", 1],
    ["views/organizer/events/detail.ejs", 2],
    ["views/organizer/events/index.ejs", 1],
  ])("keeps every POST form in %s usable without JavaScript", (relativeTemplatePath, expectedFormCount) => {
    const forms = serverRenderedPostForms(relativeTemplatePath);

    expect(forms).toHaveLength(expectedFormCount);
    for (const form of forms) {
      expect(form).toMatch(/include\(["'][^"']*csrf-field["']\)/);
    }
  });
});
