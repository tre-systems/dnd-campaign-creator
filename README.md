# D&D Campaign Creator Tool

<!-- markdownlint-disable MD033 -->
<div align="center">
  <img src="/docs/screenshot.jpg" alt="dnd-campaign-creator screenshot" width="1254" />
</div>
<!-- markdownlint-enable MD033 -->

A generic, automated utility for compiling Markdown-based D&D adventures into
styled Google Docs, complete with Google Drive image syncing.

## Features

- **Automated Google Docs Publishing**: Combines multiple markdown files, organizes them by category, inserts page breaks, generates a title page, and publishes a single cohesive Google Document.
- **Image Syncing**: Automatically traverses markdown files finding local images (like maps and NPC portraits), uploads them to Google Drive (making them public), and rewrites the markdown to use the new Drive URLs.
- **Stat Block Formatting**: D&D 5E compliant formatting for any blockquotes matching the standard `_Size type, alignment_` layout, complete with thematic parchment backgrounds and red dividers.

## Prerequisites

- **Node.js**: v20 or newer
- **Google Cloud Console Project**: You need an active Google Cloud Project with the **Google Docs API** and **Google Drive API** enabled.

## Authentication Setup

Because this tool uploads images to Drive and writes documents via Docs, it
must authenticate with Google APIs using one of two methods:

- **OAuth desktop app** (recommended for most individual users)
- **Service account** (recommended for automation/CI)

The tool uses these scopes:

- `https://www.googleapis.com/auth/documents`
- `https://www.googleapis.com/auth/drive`

### Quick Setup Checklist

1. Create/select a Google Cloud project.
2. Enable **Google Docs API** and **Google Drive API**.
3. Configure one auth method below.
4. Run a dry run: `npx campaign-creator publish <adventure-key> --config ./campaign.json --test`
5. Run real publish once auth is confirmed.

### Option 1: Desktop OAuth (Recommended)

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or select an existing one).
3. Enable **Google Docs API** and **Google Drive API**.
4. Configure OAuth consent screen:
   - Go to **Google Auth Platform** > **Branding / Audience**.
   - If app is in testing mode, add your Google account under **Test users**.
5. Create OAuth client credentials:
   - Go to **Google Auth Platform** > **Clients**.
   - Click **Create client**.
   - Choose **Desktop app**.
6. Download the credentials JSON and save it as `credentials.json` in your
   campaign repository root (the directory where you run `npx campaign-creator`).
7. Run a publish command. On first run, a browser window opens for consent.
8. After success, `token.json` is created automatically and reused on future runs.

### Option 2: Service Account (Automation-Friendly)

1. In Google Cloud Console, enable **Google Docs API** and **Google Drive API**.
2. Go to **IAM & Admin** > **Service Accounts** and create a service account.
3. Create and download a JSON key.
4. Save it as `service-account-key.json` in your campaign repository root.
5. Share the destination Drive folder (and any existing target document) with
   the service account email (Editor role), otherwise writes will fail with 403.
6. Set auth mode to service account when running commands:

macOS/Linux:

```bash
AUTH_METHOD=service-account npx campaign-creator publish my-epic-adventure --config ./campaign.json
```

PowerShell:

```powershell
$env:AUTH_METHOD="service-account"
npx campaign-creator publish my-epic-adventure --config ./campaign.json
```

### Credential File Resolution And Overrides

By default, credential files are discovered in this order:

1. Current working directory (`process.cwd()`, typically your campaign repo)
2. Package directory fallback
3. Legacy parent-directory fallback

You can override paths explicitly:

- `GOOGLE_OAUTH_CREDENTIALS_PATH`
- `GOOGLE_SERVICE_ACCOUNT_KEY_PATH`
- `GOOGLE_TOKEN_PATH`

Auth method can be selected with either:

- `AUTH_METHOD`
- `DRIVE_AUTH_METHOD`

Accepted auth method values:

- `oauth` (default)
- `service-account`

### Troubleshooting (Common Errors)

- `OAuth credentials not found`: place `credentials.json` in your campaign root
  or set `GOOGLE_OAUTH_CREDENTIALS_PATH`.
- `Service account key not found`: place `service-account-key.json` in your
  campaign root or set `GOOGLE_SERVICE_ACCOUNT_KEY_PATH`.
- `Invalid service account key format`: ensure the file is the original JSON
  key and includes `client_email` and `private_key`.
- `access_denied` during OAuth: your Google account may not be listed as a
  test user on the OAuth consent screen.
- `redirect_uri_mismatch`: recreate credentials as **Desktop app** (not Web app).
- `403 insufficient permissions`: for service accounts, ensure the folder/doc
  is explicitly shared to the service account email.
- Images fail to render in Docs: this tool sets image files to public
  reader links. If your Workspace policy blocks public sharing, those images
  may need an org-allowed alternative sharing model.

If OAuth tokens become stale/corrupt, delete `token.json` and authenticate again.

## Setup & Architecture

This repository now acts as a **generic, reusable engine**. Campaign content itself should live in completely separate repositories and link to these tools.

### 1. Manual Setup

If you prefer manual setup:

1. Create a new directory for your campaign: `mkdir my-campaign && cd my-campaign && npm init -y`
2. Link the generic tools directly from this engine repository:

   ```bash
   npm install file:/path/to/dnd-campaign-creator
   ```

3. Copy the `campaign.example.json` file from this repository into your new campaign repository and rename it to `campaign.json`.

### 2. `campaign.json` Configuration

Your campaign repository must have a `campaign.json` at its root.

```json
{
  "campaignRoot": "./",
  "assetsDir": "./assets",
  "adventures": {
    "my-epic-adventure": {
      "title": "My Epic Adventure",
      "sourceDir": "adventures/epic",
      "targetDocId": "YOUR_GOOGLE_DOC_ID_HERE", // Optional: leave null to create a new doc
      "folderId": "YOUR_GOOGLE_DRIVE_FOLDER_ID", // Optional
      "categories": [
        { "name": "Content", "key": "content", "pageBreakBefore": false },
        {
          "name": "Session Notes",
          "key": "session",
          "pageBreakBefore": true,
          "excludeFromPublish": true
        }
      ],
      "order": {
        "content": ["01-intro.md", "02-dungeon.md"],
        "session": ["session-1.md"]
      }
    }
  }
}
```

### Art Style Definition

Each adventure can include an optional `artStyle` object in `campaign.json` to define the visual identity for generated illustrations. This ensures consistency when creating images across sessions, contributors, or AI tools.

```json
"artStyle": {
  "style": "Dark fantasy, painterly, highly detailed",
  "medium": "Digital painting with traditional oil painting aesthetic",
  "palette": "Desaturated earth tones, warm torchlight ambers, cold dungeon blues",
  "lighting": "Dramatic, directional. Deep shadows, high contrast",
  "mood": "Epic, foreboding, mysterious",
  "subjects": "NPCs as character portraits with environmental context. Locations as wide establishing shots with sense of scale",
  "avoid": "Cartoonish styles, bright saturated colors, text or lettering in images"
}
```

| Field      | Purpose                                            |
| ---------- | -------------------------------------------------- |
| `style`    | Overall artistic style and level of detail         |
| `medium`   | The look and feel of the rendering technique       |
| `palette`  | Color palette, including per-section accent colors |
| `lighting` | Lighting direction, sources, and contrast          |
| `mood`     | Emotional tone and atmosphere                      |
| `subjects` | Composition guidelines for NPCs vs. locations      |
| `avoid`    | Explicit exclusions to maintain consistency        |

When generating images (e.g. with an AI tool), prepend the `artStyle` fields to your prompt to maintain a cohesive visual language across the entire campaign.

### Player Guide

Every campaign benefits from a player-facing guide that sets expectations before anyone sits down at the table. This is typically the first file in your adventure's `order` list (e.g., `000-session-primer.md`) and gets published at the top of the Google Doc so players can read it before the first session.

Each campaign is different, but a good player guide generally covers:

- **What the game is about** — Tone, themes, and what kind of experience to expect (combat-heavy, roleplay-focused, survival horror, political intrigue, etc.)
- **Character creation rules** — Which rulebooks and sources are allowed, ability score method (Standard Array, Point Buy, rolling), starting level, and any restrictions
- **What to bring** — Character sheet, dice, pencils, notebooks, supplementary rulebooks
- **House rules** — Any deviations from the official rules (flanking, fumbles, readied spells, ammunition recovery, shooting into melee, etc.)
- **XP or milestone system** — How progression works, what earns XP, and what happens when a player misses a session
- **Resting and resource management** — If your campaign tracks light sources, rations, encumbrance, or dungeon turns
- **Player expectations** — Rules knowledge responsibility, engagement expectations, and the balance between combat, exploration, and social interaction
- **Quick reference tables** — Key rules and resource durations in a scannable format

The example `campaign.json` includes a `000-session-primer.md` file as the first entry in the main order. Use this slot for your player guide.

> **Tip:** Players are responsible for knowing the rules for their own characters. If they use material from supplementary sourcebooks, they should bring those rules to the table. Make this explicit in your guide — it saves enormous amounts of time during play.

### Publishing

Once you've linked the toolkit in your campaign repository, you can publish using `npx`. Run this command _from within your campaign repository_:

```bash
npx campaign-creator publish my-epic-adventure --config ./campaign.json
```

You can append `--test` to the command to run a dry-run which simulates the file fetching and category organization without hitting the Google APIs or modifying any documents.

### Map Generation

`generate-map` now builds a **prompt packet** for an image model rather than
trying to lay out rooms procedurally in code. You author the map brief,
attach one or more reference images, and use the generated markdown packet as
the handoff document.

```bash
npx campaign-creator generate-map ./examples/gatehouse-ruin.json --output ./examples
```

Generated artifact:

- `<id>-packet.md` (reference-image list, area schedule, final prompt, and revision checklist)

Useful options:

- `--output <dir>` write the packet into a different directory
- `--validate-only` validate the authored brief without writing a packet

The example brief in [`examples/gatehouse-ruin.json`](./examples/gatehouse-ruin.json)
shows the current schema: metadata, reference images, deliverable/style notes,
an authored area schedule, and revision criteria. The technical reference is in
[`docs/map-system.md`](./docs/map-system.md).

### Quality Checks

The repository currently ships these checks:

- `npm test` runs the Node test suite, including map-generation coverage.
- `npm run lint` checks Markdown docs.
- `npm run security:scan` scans tracked files for high-signal secrets and credential artifacts.
- `npm run verify` runs lint, tests, and the tracked-file security scan together.
- `npm run check-links` verifies external links in docs and examples.
- `npm run public:check` runs `verify`, scans full git history for secrets, and audits production dependencies.

Public-release checks are available with:

```bash
npm run public:check
```

### Public Repository Safety

Before making a fork or clone public, run:

```bash
npm run public:check
```

This runs:

- `npm run verify` for lint, tests, and tracked-file secret scanning
- `npm run security:scan:history` to scan full git history for high-signal secret patterns
- `npm audit --omit=dev --audit-level=high` for production dependency vulnerabilities

Tracked-file scanning checks for:

- accidentally committed credential artifacts (`credentials.json`, `token.json`, `service-account-key.json`, `.env*`, key files)
- high-signal secret patterns (private key blocks, common API token formats)
- local-only external reference images under `docs/reference-images/`

Credential files are ignored by default in `.gitignore`, but this scan is the
enforcement layer that prevents accidental exposure.

If `security:scan:history` reports legacy findings, do not make the repository
public until one of these is complete:

1. Rewrite git history to remove the flagged artifacts.
2. Publish from a fresh repository initialized from a clean export (no legacy history).

For vulnerability disclosure guidance, see [SECURITY.md](./SECURITY.md).
