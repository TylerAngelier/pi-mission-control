import { describe, expect, it } from "vitest";

import { health } from "./index.js";

describe("web health", () => {
  it("returns ok status", () => {
    expect(health()).toEqual({ service: "web", status: "ok" });
  });
});
