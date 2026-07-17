import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assertPublicUrl, performOutgoingRequest, readOutgoingRequestConfig } from "./outgoing-request";

describe("assertPublicUrl", () => {
  it("throws when the url is missing or blank", async () => {
    await expect(assertPublicUrl(undefined, "WEBHOOK")).rejects.toThrow(/must include a non-empty string "url"/);
    await expect(assertPublicUrl("   ", "WEBHOOK")).rejects.toThrow(/must include a non-empty string "url"/);
    await expect(assertPublicUrl(42, "WEBHOOK")).rejects.toThrow(/must include a non-empty string "url"/);
  });

  it("throws on a malformed URL string", async () => {
    await expect(assertPublicUrl("not a url", "WEBHOOK")).rejects.toThrow(/is not a valid URL/);
  });

  it("rejects non-http(s) protocols", async () => {
    await expect(assertPublicUrl("ftp://example.com/file", "WEBHOOK")).rejects.toThrow(/must be http:\/\/ or https:\/\//);
    await expect(assertPublicUrl("file:///etc/passwd", "WEBHOOK")).rejects.toThrow(/must be http:\/\/ or https:\/\//);
  });

  it("rejects localhost and .local/.internal hostnames outright, without a DNS lookup", async () => {
    await expect(assertPublicUrl("http://localhost/", "WEBHOOK")).rejects.toThrow(/local\/internal hostname/);
    await expect(assertPublicUrl("http://foo.internal/", "WEBHOOK")).rejects.toThrow(/local\/internal hostname/);
    await expect(assertPublicUrl("http://box.local/", "WEBHOOK")).rejects.toThrow(/local\/internal hostname/);
    await expect(assertPublicUrl("http://0.0.0.0/", "WEBHOOK")).rejects.toThrow(/local\/internal hostname/);
  });

  it("rejects private/loopback/link-local IPv4 literals directly (no DNS lookup needed)", async () => {
    await expect(assertPublicUrl("http://127.0.0.1/", "WEBHOOK")).rejects.toThrow(/private\/internal IP address/);
    await expect(assertPublicUrl("http://10.1.2.3/", "WEBHOOK")).rejects.toThrow(/private\/internal IP address/);
    await expect(assertPublicUrl("http://192.168.1.1/", "WEBHOOK")).rejects.toThrow(/private\/internal IP address/);
    await expect(assertPublicUrl("http://169.254.1.1/", "WEBHOOK")).rejects.toThrow(/private\/internal IP address/);
  });

  it("rejects private IPv6 literals directly, including the bracketed form a URL's hostname actually uses", async () => {
    await expect(assertPublicUrl("http://[::1]/", "WEBHOOK")).rejects.toThrow(/private\/internal IP address/);
    await expect(assertPublicUrl("http://[fd00::1]/", "WEBHOOK")).rejects.toThrow(/private\/internal IP address/);
  });

  it("accepts a public IPv4 literal without needing DNS", async () => {
    const url = await assertPublicUrl("http://8.8.8.8/webhook", "WEBHOOK");
    expect(url).toBeInstanceOf(URL);
    expect(url.hostname).toBe("8.8.8.8");
  });

  it("resolves a real hostname via DNS and rejects it when every address is private", async () => {
    const dns = await import("node:dns");
    const lookupSpy = vi.spyOn(dns.promises, "lookup").mockResolvedValue([{ address: "10.0.0.5", family: 4 }] as never);
    try {
      await expect(assertPublicUrl("http://internal-service.example.com/", "WEBHOOK")).rejects.toThrow(/resolves to a private\/internal IP address/);
      expect(lookupSpy).toHaveBeenCalledWith("internal-service.example.com", { all: true });
    } finally {
      lookupSpy.mockRestore();
    }
  });

  it("resolves a real hostname via DNS and accepts it when every address is public", async () => {
    const dns = await import("node:dns");
    const lookupSpy = vi.spyOn(dns.promises, "lookup").mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    try {
      const url = await assertPublicUrl("http://public-service.example.com/", "WEBHOOK");
      expect(url.hostname).toBe("public-service.example.com");
    } finally {
      lookupSpy.mockRestore();
    }
  });
});

describe("readOutgoingRequestConfig", () => {
  it("defaults to POST and empty headers when unset", () => {
    const result = readOutgoingRequestConfig({}, "WEBHOOK");
    expect(result.method).toBe("POST");
    expect(result.headers).toEqual({});
    expect(result.body).toBeUndefined();
  });

  it("uppercases a lowercase method", () => {
    const result = readOutgoingRequestConfig({ method: "get" }, "WEBHOOK");
    expect(result.method).toBe("GET");
  });

  it("throws on an unsupported method", () => {
    expect(() => readOutgoingRequestConfig({ method: "TRACE" }, "WEBHOOK")).toThrow(/must be one of POST, GET, PUT, PATCH, DELETE/);
  });

  it("returns a fresh headers object copy, not the original reference", () => {
    const original = { "X-Test": "1" };
    const result = readOutgoingRequestConfig({ headers: original }, "WEBHOOK");
    expect(result.headers).toEqual(original);
    expect(result.headers).not.toBe(original);
  });

  it("passes body through verbatim", () => {
    const body = { hello: "world" };
    const result = readOutgoingRequestConfig({ body }, "WEBHOOK");
    expect(result.body).toBe(body);
  });
});

describe("performOutgoingRequest", () => {
  const url = new URL("http://8.8.8.8/webhook");

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the real status and parsed JSON body on success", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const result = await performOutgoingRequest("WEBHOOK", url, "POST", {}, { a: 1 });
    expect(result).toEqual({ status: 200, body: { ok: true } });
  });

  it("returns the raw text body when the response is not JSON", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response("plain text", { status: 200, headers: { "content-type": "text/plain" } }));
    const result = await performOutgoingRequest("WEBHOOK", url, "GET", {}, undefined);
    expect(result).toEqual({ status: 200, body: "plain text" });
  });

  it("throws a descriptive error on a non-ok response", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response("server exploded", { status: 500 }));
    await expect(performOutgoingRequest("WEBHOOK", url, "POST", {}, undefined)).rejects.toThrow(/failed with HTTP 500/);
  });

  it("wraps a network-level fetch failure in a descriptive error", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("fetch failed"));
    await expect(performOutgoingRequest("WEBHOOK", url, "POST", {}, undefined)).rejects.toThrow(/request to ".*" failed: fetch failed/);
  });

  it("throws when a redirect response has no Location header", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(null, { status: 302 }));
    await expect(performOutgoingRequest("WEBHOOK", url, "GET", {}, undefined)).rejects.toThrow(/redirect \(302\) with no destination/);
  });

  it("throws after exceeding the maximum number of redirect hops", async () => {
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockImplementation(async () => new Response(null, { status: 307, headers: { location: "http://8.8.8.8/next" } }));
    await expect(performOutgoingRequest("WEBHOOK", url, "GET", {}, undefined)).rejects.toThrow(/followed too many redirects/);
  });

  it("downgrades a POST with a body to GET with no body on a 303 redirect, then follows it", async () => {
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 303, headers: { location: "http://8.8.8.8/after" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ done: true }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await performOutgoingRequest("WEBHOOK", url, "POST", {}, { some: "body" });

    expect(result).toEqual({ status: 200, body: { done: true } });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const secondCallInit = mockFetch.mock.calls[1][1] as RequestInit;
    expect(secondCallInit.method).toBe("GET");
    expect(secondCallInit.body).toBeUndefined();
  });

  it("preserves method and body across a 307 redirect", async () => {
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 307, headers: { location: "http://8.8.8.8/after" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ done: true }), { status: 200, headers: { "content-type": "application/json" } }));

    await performOutgoingRequest("WEBHOOK", url, "POST", {}, { some: "body" });

    const secondCallInit = mockFetch.mock.calls[1][1] as RequestInit;
    expect(secondCallInit.method).toBe("POST");
    expect(secondCallInit.body).toBe(JSON.stringify({ some: "body" }));
  });

  it("re-validates every redirect hop's hostname and refuses a redirect into a private address", async () => {
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "http://127.0.0.1/steal" } }));
    await expect(performOutgoingRequest("WEBHOOK", url, "GET", {}, undefined)).rejects.toThrow(/private\/internal IP address/);
  });
});
