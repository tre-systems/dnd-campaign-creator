# Contributing to D&D Campaign Creator

Thank you for your interest in contributing to the D&D Campaign Creator! This tool is designed to be a generic engine for compiling Markdown adventures into Google Docs.

## Reporting Issues

If you encounter a bug or have a feature request, please open an issue on the GitHub repository. Provide as much detail as possible, including:

- What you were trying to do
- What happened instead
- Any error messages (stack traces) you received
- The version of Node.js you are using

## Local Development

Prerequisite: Node.js v20 or newer.

1. Fork the repository and clone it to your local machine.
2. Run `npm install` to install dependencies.
3. You will need a valid `credentials.json` (OAuth) or `service-account-key.json` to test the Google API integrations locally. Do **not** commit these files.

## Running Tests

Ensure your code passes formatting, linting, unit tests, map snapshot checks,
and style alignment gate checks before submitting a Pull Request:

```bash
npm run format
npm run lint
npm test
npm run map:snapshots:check
npm run map:style:gate
```

Or run the bundled local gate:

```bash
npm run verify
```

Run the repository secret/sensitive-file scan before publishing public changes:

```bash
npm run security:scan
```

Before making the repository public (or tagging a public release), run the full
public safety gate:

```bash
npm run public:check
```

Do not commit third-party reference images (for example under
`docs/map-review/references/`) unless you have clear redistribution rights and
documented provenance.

## Pull Requests

- Keep your changes small and focused on a single issue.
- Write tests for any new functionality or bug fixes.
- Ensure all existing tests pass.
- Provide a clear, descriptive title and description for your Pull Request.
