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
  it("sends the image as a base64 array on the message and returns the response text", async () => {
    const fetchMock = mockFetch({ message: { role: "assistant", content: "Editing a TypeScript file in VS Code." } });

    const result = await describeFrame("moondream", "aGVsbG8=");

    expect(result).toBe("Editing a TypeScript file in VS Code.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://localhost:11434/api/chat");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("moondream");
    expect(body.stream).toBe(false);
    expect(body.messages[0].images).toEqual(["aGVsbG8="]);
  });

  it("throws a clear error when Ollama isn't reachable, rather than silently returning empty text", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed")) as unknown as typeof fetch;
    await expect(describeFrame("moondream", "aGVsbG8=")).rejects.toThrow(/not reachable/i);
  });

  it("throws with the response body on a non-ok response", async () => {
    mockFetch({ error: "model not found" }, false, 404);
    await expect(describeFrame("moondream", "aGVsbG8=")).rejects.toThrow(/404/);
  });

  it("trims whitespace from the model's response", async () => {
    mockFetch({ message: { role: "assistant", content: "  padded response  \n" } });
    expect(await describeFrame("moondream", "aGVsbG8=")).toBe("padded response");
  });
});

describe("synthesizeSessionNote", () => {
  it("returns an empty string without calling Ollama when there are no frames", async () => {
    const fetchMock = mockFetch({ message: { role: "assistant", content: "" } });
    const result = await synthesizeSessionNote("moondream", []);
    expect(result).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("includes every frame's timestamp and text in the prompt, oldest first, with no image data", async () => {
    const fetchMock = mockFetch({ message: { role: "assistant", content: "Worked on the invoices page." } });

    const result = await synthesizeSessionNote("moondream", [
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
    expect(body.messages[0].images).toBeUndefined();
  });

  it("never mentions screenshots in its own prompt, matching the 'not looked back at' intent", async () => {
    const fetchMock = mockFetch({ message: { role: "assistant", content: "ok" } });
    await synthesizeSessionNote("moondream", [{ at: "09:00:00", text: "Reviewing a PR" }]);
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body);
    expect(body.messages[0].content).toMatch(/don.t mention/i);
  });
});
