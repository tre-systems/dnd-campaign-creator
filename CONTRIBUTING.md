# Contributing to D&D Campaign Creator

Thank you for your interest in contributing to the D&D Campaign Creator! This tool is designed to be a generic engine for compiling Markdown adventures into Google Docs.

## Reporting Issues
If you encounter a bug or have a feature request, please open an issue on the GitHub repository. Provide as much detail as possible, including:
- What you were trying to do
- What happened instead
- Any error messages (stack traces) you received
- The version of Node.js you are using

## Local Development
1. Fork the repository and clone it to your local machine.
2. Run `npm install` to install dependencies.
3. You will need a valid `credentials.json` (OAuth) or `service-account-key.json` to test the Google API integrations locally. Do **not** commit these files.

## Running Tests
Ensure your code passes all formatting, linting, and unit tests before submitting a Pull Request:
```bash
npm run format
npm run lint
npm test
```

## Pull Requests
- Keep your changes small and focused on a single issue.
- Write tests for any new functionality or bug fixes.
- Ensure all existing tests pass.
- Provide a clear, descriptive title and description for your Pull Request.
