const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { roomLabelFromIndex } = require("./room-label");

describe("room-label", () => {
  it("uses 1-9 for first nine rooms", () => {
    assert.equal(roomLabelFromIndex(0), "1");
    assert.equal(roomLabelFromIndex(8), "9");
  });

  it("uses A-Z after 9", () => {
    assert.equal(roomLabelFromIndex(9), "A");
    assert.equal(roomLabelFromIndex(34), "Z");
  });

  it("continues with AA, AB after Z", () => {
    assert.equal(roomLabelFromIndex(35), "AA");
    assert.equal(roomLabelFromIndex(36), "AB");
  });

  it("rejects invalid indices", () => {
    assert.throws(() => roomLabelFromIndex(-1), /non-negative integer/);
    assert.throws(() => roomLabelFromIndex(1.5), /non-negative integer/);
  });
});
