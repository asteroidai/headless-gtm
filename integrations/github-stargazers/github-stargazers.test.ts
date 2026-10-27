import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pull } from "./index.ts";

const dir = resolve(import.meta.dirname, "fixtures");
const stars = readFileSync(resolve(dir, "stargazers.json"), "utf8");
const users = JSON.parse(readFileSync(resolve(dir, "users.json"), "utf8")) as Record<string, unknown>;

function mockGitHub() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/stargazers")) return new Response(stars, { status: 200, headers: { link: '<x?page=1>; rel="last"' } });
      const login = url.split("/users/")[1]!;
      return new Response(JSON.stringify(users[login]), { status: 200 });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("github-stargazers", () => {
  it("emits the newest stars first on a first run and sets the watermark", async () => {
    mockGitHub();
    const state: Record<string, unknown> = {};
    const signals = await pull({ settings: { repos: ["yourorg/yourrepo"], first_run_limit: 2 }, state });
    expect(signals.map((s) => s.payload.login)).toEqual(["octo-cy", "octo-bo"]);
    expect(signals[0]?.subject).toMatchObject({ name: "Cy Example", company: "Example Fintech", domain: "example-fintech.io", email: "cy@example-fintech.io" });
    expect((state.since as Record<string, string>)["yourorg/yourrepo"]).toBe("2026-03-10T08:05:00Z");
  });

  it("emits only stars after the watermark", async () => {
    mockGitHub();
    const state = { since: { "yourorg/yourrepo": "2026-03-09T11:30:00Z" } };
    const signals = await pull({ settings: { repos: ["yourorg/yourrepo"] }, state });
    expect(signals.map((s) => s.payload.login)).toEqual(["octo-cy"]);
  });

  it("strips the @ from a GitHub company handle", async () => {
    mockGitHub();
    const signals = await pull({ settings: { repos: ["yourorg/yourrepo"], first_run_limit: 3 }, state: {} });
    expect(signals.at(-1)?.subject.company).toBe("example-robotics");
  });
});
