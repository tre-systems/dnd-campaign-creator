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
- `legendItems` (ordered short labels for a bottom legend panel)

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
- `exits` (explicit edge-of-map exit arrow labels)
- `mustInclude`

If `label` is omitted, sequential numbering is assigned automatically.
Area labels must be unique; duplicate room numbers are rejected during validation.

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

## Authoring Guidance

- Use `legendItems` when the map should ship with a constrained symbol legend rather than a free-form note.
- Use `exits` when continuity between adjacent maps matters and the image model must place a specific labelled arrow on the map edge.
- Treat `compositionNotes` as the place to call out room-number readability, patrol-route clarity, alternate-route arrival points, and other problems that are easy for an image model to muddle.
- Treat `revisionChecklist` as the final QA gate. Include exact checks for label clarity, edge exits, distinct adjacent rooms, and any route continuity that the DM must be able to trust.

## Reference Images

Reference images are expected to stay private and local unless you have clear
rights to distribute them. If you need a shared placeholder location for team
notes, use [`docs/reference-images/`](./reference-images/README.md) without
committing licensed or third-party image files.
