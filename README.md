# D&D Campaign Creator Tool

A generic, automated utility for compiling Markdown-based D&D adventures into flawlessly styled Google Docs, complete with Google Drive image syncing.

This tool extracts the robust publishing scripts developed for the _Borderlands Campaign_ and makes them available for any organized repository of Markdown adventure notes.

## Features

- **Automated Google Docs Publishing**: Combines multiple markdown files, organizes them by category, inserts page breaks, generates a title page, and publishes a single cohesive Google Document.
- **Image Syncing**: Automatically traverses markdown files finding local images (like maps and NPC portraits), uploads them to Google Drive (making them public), and rewrites the markdown to use the new Drive URLs.
- **Stat Block Formatting**: D&D 5E compliant formatting for any blockquotes matching the standard `_Size type, alignment_` layout, complete with thematic parchment backgrounds and red dividers.

## Prerequisites

- **Node.js**: v18 or newer
- **Google Cloud Console Project**: You need an active Google Cloud Project with the **Google Docs API** and **Google Drive API** enabled.

## Authentication Setup

Because this tool interacts with Google Drive (to upload images) and Google Docs (to write the adventure content), you must supply your own Google API credentials.
You have two options:

### Option 1: Desktop OAuth (Easiest)

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project or select an existing one.
3. Enable the **Google Docs API** and **Google Drive API**.
4. Navigate to **APIs & Services** > **Credentials**.
5. Click **Create Credentials** > **OAuth client ID**.
6. Set the Application type to **Desktop app**.
7. Download the resulting JSON file and save it exactly as `credentials.json` in the root of your new campaign repository.
8. When you run the publisher for the first time, it will prompt you in your browser to grant access and will save a `token.json` file.

### Option 2: Service Account

1. Follow steps 1-3 above, then go to **IAM & Admin** > **Service Accounts**.
2. Create a new Service Account and download a JSON key.
3. Save it as `service-account-key.json` in the root of your campaign repository.
4. Set the environment variable `AUTH_METHOD=service-account` when running the tool.

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
- `--color-scheme <blue|parchment>` map palette
- `--max-attempts <n>` geometry retry budget (default `50`)
- `--allow-invalid` emit outputs even if geometry validation fails

Notes:

- The map system enforces a maximum section grid of `30 x 44`.
- Connector definitions are routed into playable space and validated for reachability.
- `layoutStrategy: "organic"` and `"hybrid"` currently run on the constructed placement baseline.
