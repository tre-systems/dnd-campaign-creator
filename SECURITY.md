# Security Policy

## Reporting A Vulnerability

Please do not open public issues for suspected credential leaks or security
vulnerabilities.

Instead, report privately to the maintainer via the repository owner's contact
channel and include:

- a clear description of the issue
- affected files/commands
- reproduction steps
- impact assessment

You should receive an acknowledgment within 5 business days.

## Public Release Safety Checklist

Before making this repository public (or preparing a public release), run:

```bash
npm run public:check
```

This enforces:

- lint + tests
- documentation link checks
- tracked-file secret/sensitive-file scanning
- git history secret scanning
- production dependency vulnerability audit (`high` and above)

If history scanning fails, treat it as a release blocker for public visibility
until history is rewritten or a clean-history public mirror is created.

## Secret Handling

- Never commit `credentials.json`, `token.json`, `service-account-key.json`, `.env*`, or private key files.
- Keep third-party reference images local-only unless explicit license
  provenance is documented in-repo.
- Use environment-variable overrides for credential paths when possible:
  - `GOOGLE_OAUTH_CREDENTIALS_PATH`
  - `GOOGLE_SERVICE_ACCOUNT_KEY_PATH`
  - `GOOGLE_TOKEN_PATH`
- Rotate and revoke exposed credentials immediately if a leak is suspected.
