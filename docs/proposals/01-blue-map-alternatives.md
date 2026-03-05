# Blue-Map Generation Alternatives (Exploration Branch)

Date: March 5, 2026  
Branch: `codex/map-approach-exploration`

## Context

Current map generation has strong output quality in places, but relies on many specialized rules and hand-tuned heuristics. The goal of this exploration is to evaluate two alternative directions that can produce Paratime-like old-school blue maps with less ad-hoc logic.

Reference style set:

- `docs/map-review/references/paratime/` (20 local reference maps)

Existing objective gates we should keep using:

- `npm run map:style:gate`
- `npm run map:quality:gate`

## Success Criteria

1. Maps retain old-school blue style alignment and pass style gate consistently.
2. Topology is readable and playable (loops, doors, stairs, keyed regions).
3. Pipeline is simpler to reason about than current rule-heavy rendering stack.
4. Determinism and editability remain good enough for campaign authoring workflows.
5. Engineering effort is bounded: first useful signal within 2-3 weeks.

## Option A: Prompt-Led Image Generation

### A1. Core idea

Generate final map images directly from prompts, possibly with structure conditioning, then select or post-filter outputs.

### A2. Implementation variants

1. Pure prompting (`text -> image`) with strong prompt templates.
2. Prompt + control image (`text + mask/sketch -> image`) where control image is generated from topology graph or coarse floorplan.
3. Prompt + lightweight style adapter (LoRA or similar) trained on blue-map references and synthetic augmentations.

### A3. Proposed pipeline

1. Build a prompt pack that includes fixed style clauses (blueprint palette, 10ft grid, room labels, orthogonal line bias), variable content clauses (theme, complexity, room count, cave fraction), and negative clauses (no painterly shading, no perspective, no fantasy art illustration).
2. Generate `N` candidates per prompt/seed.
3. Run automatic scoring with existing style metrics (`style-audit`) plus structural checks (grid detectability, OCR label count, connected white-space components).
4. Keep top-ranked candidates.
5. Optional light post-processing for symbol cleanup and threshold clarity.

### A4. What this gives you

- Fast iteration on visual style when model behavior is cooperative.
- Minimal renderer engineering if direct generation quality is high.
- Potentially broad stylistic variety with little explicit logic.

### A5. Main risks

- Reliability risk: generated maps may look right but break playability grammar.
- Control risk: exact doors, secret thresholds, and route logic are hard to force.
- Determinism risk: seed-stable but semantically unstable outputs.
- Data risk: 20 references is too small for robust style tuning without augmentation.
- Licensing/ops risk if depending on external model providers long-term.

### A6. Likely failure pattern

Output looks visually close but degrades under close inspection:

- misaligned grid logic
- ambiguous doors/stairs symbols
- impossible geometry or disconnected routes
- inconsistent label semantics

### A7. 2-3 week experiment plan

Week 1:

1. Build prompt template matrix and candidate generator.
2. Add automatic ranking with existing style metrics + simple geometry sanity checks.

Week 2:

1. Add control-image path from topology masks.
2. Compare pure prompt vs control path on 50-100 generated samples.

Week 3:

1. Optional tiny style-adapter run with augmented references.
2. Decide go/no-go based on pass rates and manual review burden.

### A8. Go/no-go criteria

1. At least 40% of samples pass style gate without manual edits.
2. At least 25% also pass structural/playability checks.
3. Human cleanup time per accepted map stays under 15 minutes.

If these are not met, this approach is likely better as a secondary style layer, not the primary generator.

## Option B: Map -> Text Structure -> Map

### B1. Core idea

Convert maps to a compact textual intermediate representation (IR), render IR back to image deterministically, then generate new IRs using ML/grammar methods.

### B2. Why this is promising for elegance

The old-school style has clear grid grammar and symbol vocabulary. Capturing structure first lets style rendering be mostly deterministic, so complexity moves from many local drawing rules into one explicit representation contract.

### B3. Proposed IR shape

Use a schema that is easy to validate and easy to render:

```json
{
  "meta": { "cellSizeFt": 10, "width": 60, "height": 60 },
  "rooms": [
    {
      "id": "r12",
      "shape": "rect",
      "x": 10,
      "y": 8,
      "w": 6,
      "h": 5,
      "label": "12"
    }
  ],
  "corridors": [
    {
      "from": "r12",
      "to": "r13",
      "path": [
        [16, 10],
        [17, 10],
        [18, 10]
      ],
      "width": 1
    }
  ],
  "thresholds": [
    { "x": 16, "y": 10, "type": "door" },
    { "x": 22, "y": 14, "type": "secret" }
  ],
  "features": [
    { "x": 13, "y": 10, "type": "stairsDown" },
    { "x": 12, "y": 9, "type": "pillar" }
  ],
  "style": { "profile": "blueprint-strict" }
}
```

### B4. Pipeline architecture

1. **Image -> IR extraction**: normalize image, detect grid scale and alignment, segment walls/floors/corridors, detect symbols with a small detector/classifier, and output IR with confidence per element.
2. **IR validation/correction**: enforce topology and symbol rules centrally (not scattered), with an optional lightweight correction UI for low-confidence elements.
3. **IR -> Image rendering**: deterministic SVG/PNG renderer in blueprint style, with style variation handled by a small style config rather than procedural exceptions.
4. **IR generation**: start with a constrained grammar/solver (lowest data requirement), then add a token model over IR sequences as corpus size grows, then consider a graph model for topology plus a layout model for placement.

### B5. What this gives you

- Strong control and determinism.
- Clear separation of concerns across structure generation, style rendering, and quality validation.
- Better debuggability: failures are visible at IR level.
- Easier long-term maintainability than distributed heuristics.

### B6. Main risks

- Upfront engineering cost for robust image-to-IR extraction.
- Symbol detection quality may bottleneck if references are noisy.
- Need a modest annotation/correction loop to create clean IR corpus.

### B7. 2-3 week experiment plan

Week 1:

1. Define `MapIR v0` schema.
2. Implement deterministic `IR -> SVG` renderer subset (rooms, corridors, doors, stairs, labels).
3. Hand-author 10 IR files from references to validate expressiveness.

Week 2:

1. Build `image -> IR` prototype for grid + wall extraction.
2. Add symbol detector for 5 core symbols (door, secret, stairs up/down, pillar).

Week 3:

1. Evaluate round-trip fidelity (`image -> IR -> image`) on 5-10 references.
2. Add constrained IR generator (grammar + topology constraints) and render outputs.

### B8. Go/no-go criteria

1. Round-trip maps preserve key topology and threshold positions with >=90% element-level match.
2. Rendered IR outputs pass style gate >=80% with no manual edits.
3. First constrained IR generator outputs pass quality gate >=60% within three iterations.

If this is met, it becomes a strong base architecture and the best path away from ad-hoc rule sprawl.

## Decision Matrix

| Criterion                     | Option A: Prompt-Led Images | Option B: IR-Centric |
| ----------------------------- | --------------------------- | -------------------- |
| Visual style discovery speed  | High                        | Medium               |
| Playability control           | Low-Medium                  | High                 |
| Determinism/editability       | Low                         | High                 |
| Data efficiency with 20 refs  | Low-Medium                  | Medium-High          |
| Long-term maintainability     | Medium-Low                  | High                 |
| Upfront implementation effort | Low-Medium                  | Medium-High          |
| Risk of hidden ad-hoc cleanup | High                        | Medium               |

## Recommendation

Primary direction: **Option B (IR-centric)**.

Reason:

1. It aligns with your core complaint (too many ad-hoc rules) by centralizing constraints in an explicit representation.
2. It is better matched to grid-first map language and gameplay semantics.
3. It preserves deterministic authoring workflows and objective gating already in this repo.

Pragmatic hybrid use:

- Keep a small Option A track for style ideation or texture overlays.
- Do not make Option A the authoritative structure generator unless pass rates materially improve.

## Suggested Immediate Next Step

Create a thin vertical slice for Option B:

1. `MapIR v0` schema
2. minimal IR renderer
3. one `image -> IR` parser for grid + wall geometry only

Then compare effort and quality after one week against a controlled Option A prompt experiment using the same acceptance gates.
