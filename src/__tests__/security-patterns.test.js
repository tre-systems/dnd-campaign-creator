const test = require("node:test");
const assert = require("node:assert/strict");
const { forbiddenPathChecks, secretPatterns } = require("../security/patterns");

function getPattern(name) {
  const p = secretPatterns.find((entry) => entry.name === name);
  assert.ok(p, `Expected secret pattern '${name}'`);
  p.regex.lastIndex = 0;
  return p.regex;
}

test("forbidden path rules catch known sensitive file names", () => {
  const samples = [
    "credentials.json",
    "auth/token.json",
    "keys/service-account-key.json",
    ".env",
    "secrets/.env.local",
    "id_rsa",
    "nested/id_ed25519",
    "private/key.pem",
    "docs/map-review/references/example.jpg",
  ];

  for (const sample of samples) {
    assert.ok(
      forbiddenPathChecks.some((rule) => rule.test(sample)),
      `Expected forbidden path match for ${sample}`,
    );
  }
});

test("secret patterns detect representative tokens", () => {
  const sampleGoogleApiKey = "AIza" + "12345678901234567890123456789012345";
  const sampleAwsKeyId = "AKIA" + "1234567890ABCD12";
  const sampleGithubPat = "ghp_" + "abcdefghijklmnopqrstuvwxyz1234567890ABCD";
  const sampleGithubFine =
    "github_pat_" + "abcdefghijklmnopqrstuvwxyz_0123456789";
  const sampleNpmToken = "npm_" + "abcdefghijklmnopqrstuvwxyz0123456789";
  const sampleSlack = "xoxb-" + "1234567890-abcdef1234";
  const sampleGoogleOauth = "ya29." + "a0ARrdaM-example-long-token-value";
  const sampleJwt =
    "eyJhbGciOiJIUzI1NiJ9" +
    "." +
    "eyJzdWIiOiIxMjM0NTY3ODkwIn0" +
    "." +
    "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

  assert.match(sampleGoogleApiKey, getPattern("google-api-key"));
  assert.match(sampleAwsKeyId, getPattern("aws-access-key-id"));
  assert.match(sampleGithubPat, getPattern("github-personal-access-token"));
  assert.match(sampleGithubFine, getPattern("github-fine-grained-token"));
  assert.match(sampleNpmToken, getPattern("npm-access-token"));
  assert.match(sampleSlack, getPattern("slack-token"));
  assert.match(sampleGoogleOauth, getPattern("google-oauth-access-token"));
  assert.match(sampleJwt, getPattern("jwt-like-token"));
});
