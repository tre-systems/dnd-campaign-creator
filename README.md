# D&D Campaign Creator Tool

<!-- markdownlint-disable MD033 -->
<div align="center">
  <img src="/docs/screenshot.jpg" alt="dnd-campaign-creator screenshot" width="1254" />
</div>
<!-- markdownlint-enable MD033 -->

A generic, automated utility for compiling Markdown-based D&D adventures into flawlessly styled Google Docs, complete with Google Drive image syncing.

This tool extracts the robust publishing scripts developed for the _Borderlands Campaign_ and makes them available for any organized repository of Markdown adventure notes.

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

### 1. Initializing a New Campaign

You can create a new blank campaign repository anywhere on your machine by referring to the Antigravity workflow designed for this tool.

If you are using Google Antigravity, simply tell the agent:

> "Use the create-campaign workflow to make a new campaign at /path/to/my/new/campaign"

### 2. Manual Setup

If you prefer manual setup:

1. Create a new directory for your campaign: `mkdir my-campaign && cd my-campaign && npm init -y`
2. Link the generic tools directly from this engine repository:

   ```bash
   npm install file:/path/to/dnd-campaign-creator
   ```

3. Copy the `campaign.example.json` file from this repository into your new campaign repository and rename it to `campaign.json`.

### `campaign.json` Configuration

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

The tool can generate old-school tactical maps and section packets from a section JSON definition:

```bash
npx campaign-creator generate-map ./examples/gatehouse-ruin.json --output ./examples --seed 42
```

Generated artifacts:

- `<id>-map.txt` (ASCII map)
- `<id>-map.svg` (styled SVG map)
- `<id>-packet.md` (section packet with topology, room key, and validation checklist)

Useful options:

- `--validate-only` run topology checks without geometry/output
- `--ascii-only` skip SVG generation
- `--cell-size <px>` SVG cell size (default `20`)
- `--no-grid` disable SVG grid lines
- `--no-labels` disable room labels
- `--label-mode <auto|corner|center|none>` room label placement strategy
- `--color-scheme <blue|parchment>` map palette
- `--style-profile <blue-enhanced|blueprint-strict>` blue-map style profile
- `--max-attempts <n>` geometry retry budget (default `50`)
- `--allow-invalid` emit outputs even if geometry validation fails

Notes:

- The map system enforces a maximum section grid of `60 x 60` and minimum `10 x 10`.
- Connector definitions are routed into playable space and validated for reachability.
- `layoutStrategy: "organic"` and `"hybrid"` currently run on the constructed placement baseline.
- `blueprint-strict` defaults to flatter old-school output (no sheet wash, paper grain, title block, legend, or compass unless explicitly enabled).
- Room geometry is semantic (`rect`, `notched`, `chamfered`, `cross`, `cave`) and selected from node intent and naming.
- Entry/exit rooms receive automatic transition symbols (stairs up/down), with name-direction hints overriding defaults.
- Dressing placement now reserves doorway ingress and center traffic lanes so key room features do not block natural movement.

### Quality Automation

Quality is enforced in four layers:

- Local pre-commit hook: runs `npm test`, formatting, and markdown lint.
- Local pre-push hook: runs `npm run verify` (lint + tests + map snapshot diffs + style gate + structural quality gate + tracked-file secret scan).
- CI workflow: GitHub Actions runs `npm run verify`, scans full git history for secret patterns, and audits production dependencies on every PR and on pushes to `main`.
- CI workflow also publishes a map quality report artifact (`JSON` + `Markdown`) for each run.

You can run the same checks manually with:

```bash
npm run verify
```

Map rendering snapshots are managed with:

```bash
npm run map:snapshots:update
npm run map:snapshots:check
```

Reference-style alignment against local Paratime benchmarks:

```bash
npm run map:style:audit
```

Reference-style gate used by `verify` and CI:

```bash
npm run map:style:gate
```

Structural/content/semantics quality scoring and gate:

```bash
npm run map:quality:score
npm run map:quality:gate
```

Refresh the checked-in reference metrics baseline (requires local reference images):

```bash
npm run map:style:baseline:update
```

Notes:

- `map:style:audit` compares generated snapshots to local images under
  `docs/map-review/references/paratime/`.
- `map:style:gate` compares generated snapshots to
  `docs/map-review/reference-style-metrics.json` so CI can enforce style
  alignment without requiring external reference image files.
- `map:quality:gate` evaluates style + content + semantic topology checks using
  `docs/map-review/paratime-style-spec.json` to prevent regressions while map
  generation logic evolves.
- `map:quality:score` emits a human/machine-readable report without failing the
  run (unless used in gate mode).
- Current structural quality gate (`paratime-style-spec.json`) requires
  composite score `>= 75`, corridor-width variety across the suite, bounded
  feature-cell density, and full gated-edge symbol-match coverage.
- Current gate thresholds: minimum alignment score `45`, with max absolute
  deltas for `luminanceMean=0.12`, `saturationMean=0.08`,
  `inkCoverage=0.08`, and `orthogonalEdgeRatio=0.16`.
- Snapshot QA currently tracks 12 deterministic strict renders across gatehouse,
  dwarven, sunken, and clockwork fixtures with varied seeds.
- Reference images stay local-only by default and are excluded from git.

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

- `npm run verify` for lint/tests/snapshot guardrails and tracked-file secret scanning
- `npm run security:scan:history` to scan full git history for high-signal secret patterns
- `npm audit --omit=dev --audit-level=high` for production dependency vulnerabilities

Tracked-file scanning checks for:

- accidentally committed credential artifacts (`credentials.json`, `token.json`, `service-account-key.json`, `.env*`, key files)
- high-signal secret patterns (private key blocks, common API token formats)
- local-only external reference images under `docs/map-review/references/`

Credential files are ignored by default in `.gitignore`, but this scan is the
enforcement layer that prevents accidental exposure.

If `security:scan:history` reports legacy findings, do not make the repository
public until one of these is complete:

1. Rewrite git history to remove the flagged artifacts.
2. Publish from a fresh repository initialized from a clean export (no legacy history).

For vulnerability disclosure guidance, see [SECURITY.md](./SECURITY.md).
