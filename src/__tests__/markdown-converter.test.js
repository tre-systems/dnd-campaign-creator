const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { markdownToGoogleDocsRequests } = require("../markdown-converter");

function getStyleRequests(requests, predicate) {
  return requests.filter(
    (request) =>
      request.updateTextStyle &&
      (!predicate || predicate(request.updateTextStyle)),
  );
}

describe("markdownToGoogleDocsRequests", () => {
  it("does not emit negative ranges for nested inline markdown", () => {
    const requests = markdownToGoogleDocsRequests(
      "[**Bold**](https://example.com)",
    );

    const styleRequests = getStyleRequests(requests);
    assert.ok(styleRequests.length > 0);
    assert.ok(
      styleRequests.every(
        (request) => request.updateTextStyle.range.startIndex >= 0,
      ),
    );
  });

  it("anchors blockquote inline formatting to the quote text", () => {
    const requests = markdownToGoogleDocsRequests(
      "> [**Bold**](https://example.com)",
    );

    const nestedStyleRequests = getStyleRequests(
      requests,
      (style) => style.textStyle.bold || style.textStyle.link,
    );

    assert.strictEqual(nestedStyleRequests.length, 2);
    assert.ok(
      nestedStyleRequests.every(
        (request) => request.updateTextStyle.range.startIndex === 2,
      ),
    );
    assert.ok(
      nestedStyleRequests.every(
        (request) => request.updateTextStyle.range.endIndex === 6,
      ),
    );
  });
});
