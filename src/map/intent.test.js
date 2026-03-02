const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { buildIntent, createRng } = require("./intent");

describe("intent", () => {
  describe("buildIntent", () => {
    it("builds intent from valid section data", () => {
      const intent = buildIntent({
        id: "test-section",
        theme: "Test dungeon",
        pressure: "faction",
        sessionLoad: "standard",
        promise: "A test section.",
      });
      assert.equal(intent.id, "test-section");
      assert.equal(intent.pressure, "faction");
      assert.equal(intent.grid.width, 30);
      assert.equal(intent.grid.height, 44);
      assert.equal(intent.layoutStrategy, "constructed");
      assert.equal(intent.density, "standard");
    });

    it("rejects null input", () => {
      assert.throws(() => buildIntent(null), /non-null object/);
    });

    it("rejects missing required fields", () => {
      assert.throws(() => buildIntent({ id: "x" }), /Missing required field/);
    });

    it("rejects invalid pressure type", () => {
      assert.throws(
        () =>
          buildIntent({
            id: "x",
            theme: "t",
            pressure: "banana",
            sessionLoad: "light",
            promise: "p",
          }),
        /Invalid pressure type/,
      );
    });

    it("rejects invalid session load", () => {
      assert.throws(
        () =>
          buildIntent({
            id: "x",
            theme: "t",
            pressure: "faction",
            sessionLoad: "extreme",
            promise: "p",
          }),
        /Invalid session load/,
      );
    });

    it("rejects grid dimensions exceeding 30x44", () => {
      assert.throws(
        () =>
          buildIntent({
            id: "x",
            theme: "t",
            pressure: "faction",
            sessionLoad: "light",
            promise: "p",
            grid: { width: 50, height: 50 },
          }),
        /exceed maximum/,
      );
    });

    it("rejects grid dimensions below minimum", () => {
      assert.throws(
        () =>
          buildIntent({
            id: "x",
            theme: "t",
            pressure: "faction",
            sessionLoad: "light",
            promise: "p",
            grid: { width: 5, height: 5 },
          }),
        /too small/,
      );
    });

    it("accepts custom grid within limits", () => {
      const intent = buildIntent({
        id: "x",
        theme: "t",
        pressure: "faction",
        sessionLoad: "light",
        promise: "p",
        grid: { width: 20, height: 30 },
      });
      assert.equal(intent.grid.width, 20);
      assert.equal(intent.grid.height, 30);
    });
  });

  describe("createRng", () => {
    it("produces deterministic output for same seed", () => {
      const rng1 = createRng(42);
      const rng2 = createRng(42);
      const values1 = Array.from({ length: 10 }, () => rng1());
      const values2 = Array.from({ length: 10 }, () => rng2());
      assert.deepEqual(values1, values2);
    });

    it("produces different output for different seeds", () => {
      const rng1 = createRng(42);
      const rng2 = createRng(99);
      const v1 = rng1();
      const v2 = rng2();
      assert.notEqual(v1, v2);
    });

    it("produces values in [0, 1)", () => {
      const rng = createRng(123);
      for (let i = 0; i < 1000; i++) {
        const v = rng();
        assert.ok(v >= 0 && v < 1, `Value ${v} out of range`);
      }
    });
  });
});
