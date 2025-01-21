import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";

describe("Script Redirector Worker", () => {
  let worker: UnstableDevWorker;

  beforeAll(async () => {
    worker = await unstable_dev("../cloudflare/src/index.ts", {
      experimental: { disableExperimentalWarning: true },
    });
  });

  afterAll(async () => {
    await worker.stop();
  });

  // First check if the source files are available
  describe("GitHub Raw Files Availability", () => {
    it("should verify Linux script is accessible", async () => {
      const response = await fetch(
        "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/linux-install-script.sh",
      );
      expect(response.status).toBe(200);
      const content = await response.text();
      expect(content).toContain("#!/bin/bash");
    });

    it("should verify Windows script is accessible", async () => {
      const response = await fetch(
        "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/windows-install-script.ps1",
      );
      expect(response.status).toBe(200);
      const content = await response.text();
      expect(content.toLowerCase()).toContain("powershell");
    });
  });

  // Worker tests
  describe("Worker Functionality", () => {
    it("should redirect to linux script for linux subdomain", async () => {
      const resp = await worker.fetch("http://linux.jfa.dev");
      expect(resp.status).toBe(200);
      expect(resp.headers.get("Content-Type")).toBe("text/x-shellscript");
      const text = await resp.text();
      expect(text).toContain("#!/bin/bash");
    });

    it("should redirect to windows script for windows subdomain", async () => {
      const resp = await worker.fetch("http://win.jfa.dev");
      expect(resp.status).toBe(200);
      expect(resp.headers.get("Content-Type")).toBe("application/x-powershell");
      const text = await resp.text();
      expect(text.toLowerCase()).toContain("powershell");
    });

    it("should redirect to GitHub repo for other domains", async () => {
      const resp = await worker.fetch("http://other.jfa.dev");
      expect(resp.status).toBe(302);
      expect(resp.headers.get("Location")).toBe(
        "https://github.com/jfalava/outfitting",
      );
    });
  });

  // Error handling tests
  describe("Error Handling", () => {
    it("should handle script fetch failures gracefully", async () => {
      // Mock a failed request by using an invalid branch name
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error("Failed to fetch"));

      const resp = await worker.fetch("http://linux.jfa.dev");
      expect(resp.status).toBe(500);
      expect(await resp.text()).toContain("Failed to fetch the script");

      global.fetch = originalFetch;
    });

    it("should verify correct headers are set", async () => {
      const resp = await worker.fetch("http://linux.jfa.dev");
      expect(resp.headers.get("Cache-Control")).toBe("no-cache");
      expect(resp.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });
});
