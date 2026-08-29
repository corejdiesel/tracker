import { afterEach, describe, expect, it, vi } from "vitest";
import { describeFrame, synthesizeSessionNote } from "./session-summary";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetch(responseBody: unknown, ok = true, status = 200) {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(responseBody),
    text: () => Promise.resolve(JSON.stringify(responseBody)),
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe("describeFrame", () => {
  it("sends the image as a base64 content block and returns the text response", async () => {
    const fetchMock = mockFetch({ content: [{ type: "text", text: "Editing a TypeScript file in VS Code." }] });

    const result = await describeFrame("test-key", "aGVsbG8=");

    expect(result).toBe("Editing a TypeScript file in VS Code.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("test-key");
    const body = JSON.parse(init.body);
    expect(body.messages[0].content[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "aGVsbG8=" },
    });
  });

  it("throws with the response body on a non-ok response, rather than returning empty text", async () => {
    mockFetch({ error: { message: "invalid x-api-key" } }, false, 401);
    await expect(describeFrame("bad-key", "aGVsbG8=")).rejects.toThrow(/401/);
  });

  it("trims whitespace from the model's response", async () => {
    mockFetch({ content: [{ type: "text", text: "  padded response  \n" }] });
    expect(await describeFrame("key", "aGVsbG8=")).toBe("padded response");
  });
});

describe("synthesizeSessionNote", () => {
  it("returns an empty string without calling the API when there are no frames", async () => {
    const fetchMock = mockFetch({ content: [] });
    const result = await synthesizeSessionNote("test-key", []);
    expect(result).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("includes every frame's timestamp and text in the prompt, oldest first", async () => {
    const fetchMock = mockFetch({ content: [{ type: "text", text: "Worked on the invoices page." }] });

    const result = await synthesizeSessionNote("test-key", [
      { at: "09:00:00", text: "Editing invoices/page.tsx" },
      { at: "09:05:00", text: "Testing the invoice form" },
    ]);

    expect(result).toBe("Worked on the invoices page.");
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body);
    const prompt = body.messages[0].content as string;
    expect(prompt).toContain("09:00:00: Editing invoices/page.tsx");
    expect(prompt).toContain("09:05:00: Testing the invoice form");
    expect(prompt.indexOf("09:00:00")).toBeLessThan(prompt.indexOf("09:05:00"));
  });

  it("never mentions screenshots in its own prompt, matching the 'not looked back at' intent", async () => {
    const fetchMock = mockFetch({ content: [{ type: "text", text: "ok" }] });
    await synthesizeSessionNote("key", [{ at: "09:00:00", text: "Reviewing a PR" }]);
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body);
    expect(body.messages[0].content).toMatch(/don.t mention/i);
  });
});
