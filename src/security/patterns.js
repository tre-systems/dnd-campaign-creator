"use strict";

const forbiddenPathChecks = [
  {
    name: "oauth-credentials-file",
    test: (p) => /(^|\/)credentials\.json$/i.test(p),
    message: "OAuth credential file should never be tracked",
  },
  {
    name: "oauth-token-file",
    test: (p) => /(^|\/)token\.json$/i.test(p),
    message: "OAuth token file should never be tracked",
  },
  {
    name: "service-account-key-file",
    test: (p) => /(^|\/)service-account-key\.json$/i.test(p),
    message: "Service account key should never be tracked",
  },
  {
    name: "dotenv-file",
    test: (p) => /(^|\/)\.env(\.|$)/i.test(p),
    message: ".env files should never be tracked",
  },
  {
    name: "private-key-file",
    test: (p) =>
      /\.(pem|p12|pfx)$/i.test(p) || /(^|\/)id_(rsa|ed25519)$/i.test(p),
    message: "Private key material should never be tracked",
  },
  {
    name: "external-reference-image",
    test: (p) =>
      /^docs\/map-review\/references\/.+\.(png|jpe?g|webp)$/i.test(p),
    message:
      "External reference images should remain local-only unless license provenance is documented",
  },
];

const secretPatterns = [
  {
    name: "private-key-block",
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    name: "google-api-key",
    regex: /\bAIza[0-9A-Za-z\-_]{35}\b/g,
  },
  {
    name: "aws-access-key-id",
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    name: "github-personal-access-token",
    regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g,
  },
  {
    name: "github-fine-grained-token",
    regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  },
  {
    name: "npm-access-token",
    regex: /\bnpm_[A-Za-z0-9]{36}\b/g,
  },
  {
    name: "slack-token",
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    name: "google-oauth-access-token",
    regex: /\bya29\.[0-9A-Za-z\-_]+\b/g,
  },
  {
    name: "jwt-like-token",
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
];

module.exports = {
  forbiddenPathChecks,
  secretPatterns,
};
