# Map Prompt Workflow

Technical reference for the current `generate-map` command.

The repository no longer tries to construct dungeon layouts with in-repo
geometry, corridor routing, or renderer code. The current workflow is:

1. Author a structured map brief in JSON.
2. Attach one or more private reference images to your image model.
3. Run `generate-map` to produce a markdown packet.
4. Use the packet as the prompt handoff and revision checklist.

## CLI Contract

```bash
campaign-creator generate-map <brief.json> [--output <dir>] [--validate-only]
```

Outputs `<id>-packet.md` unless `--validate-only` is supplied.

## Brief Schema

Required top-level fields:

- `id`
- `title`
- `theme`
- `promise`
- `areas`

Optional top-level fields:

- `level`
- `chapter`
- `referenceImages`
- `deliverable`
- `style`
- `flow`
- `compositionNotes`
- `revisionChecklist`

### Minimal Example

```json
{
  "id": "gatehouse-ruin",
  "title": "Gatehouse Ruin",
  "theme": "Goblin-occupied dwarven gatehouse",
  "promise": "Players breach the outer defences and discover the goblins are fortifying against something deeper.",
  "areas": [
    {
      "name": "Collapsed Gate",
      "description": "Broken outer gate and rubble choke point."
    }
  ]
}
```

### `referenceImages`

Each entry may contain:

- `label`
- `path`
- `focus`
- `usage`

At least one of `label` or `path` must be present.

The command does not upload or inspect reference images. It records them in the
packet so you can attach them when you use your image model.

### `deliverable`

Supported authored fields:

- `format`
- `aspectRatio`
- `camera`
- `grid`
- `labels`

### `style`

Supported authored fields:

- `overview`
- `palette`
- `linework`
- `lighting`
- `atmosphere`
- `avoid` (array of negative-prompt constraints)

### `areas`

`areas` is the core authored schedule. Each area supports:

- `label`
- `name` (required)
- `role`
- `description`
- `connections`
- `mustInclude`

If `label` is omitted, sequential numbering is assigned automatically.

## Packet Contents

The generated markdown packet contains:

- workflow steps
- metadata
- reference-image table
- deliverable summary
- area schedule
- flow and composition notes
- final prompt block
- negative prompt
- revision checklist

The packet is intentionally model-agnostic. It should work with any image
generation workflow that accepts attached reference images plus a text prompt.

## Reference Images

Reference images are expected to stay private and local unless you have clear
rights to distribute them. If you need a shared placeholder location for team
notes, use [`docs/reference-images/`](./reference-images/README.md) without
committing licensed or third-party image files.
