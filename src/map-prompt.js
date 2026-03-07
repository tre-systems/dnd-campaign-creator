"use strict";

function assertObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
}

function normalizeString(value, fieldName, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) {
      throw new Error(`${fieldName} is required`);
    }
    return "";
  }

  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(`${fieldName} must be a string`);
  }

  const normalized = String(value).trim();
  if (required && normalized === "") {
    throw new Error(`${fieldName} is required`);
  }

  return normalized;
}

function normalizeStringArray(value, fieldName) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array of strings`);
  }

  return value.map((item, index) =>
    normalizeString(item, `${fieldName}[${index}]`, { required: true }),
  );
}

function normalizeReferenceImages(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error("referenceImages must be an array");
  }

  return value.map((entry, index) => {
    assertObject(entry, `referenceImages[${index}]`);

    const label = normalizeString(
      entry.label,
      `referenceImages[${index}].label`,
    );
    const path = normalizeString(entry.path, `referenceImages[${index}].path`);

    if (!label && !path) {
      throw new Error(
        `referenceImages[${index}] must include at least a label or path`,
      );
    }

    return {
      label: label || `Reference ${index + 1}`,
      path,
      focus: normalizeString(entry.focus, `referenceImages[${index}].focus`),
      usage: normalizeString(entry.usage, `referenceImages[${index}].usage`),
    };
  });
}

function normalizeAreas(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("areas must be a non-empty array");
  }

  const areas = value.map((entry, index) => {
    assertObject(entry, `areas[${index}]`);

    return {
      label:
        normalizeString(entry.label, `areas[${index}].label`) ||
        String(index + 1),
      name: normalizeString(entry.name, `areas[${index}].name`, {
        required: true,
      }),
      role: normalizeString(entry.role, `areas[${index}].role`),
      description: normalizeString(
        entry.description,
        `areas[${index}].description`,
      ),
      connections: normalizeStringArray(
        entry.connections,
        `areas[${index}].connections`,
      ),
      exits: normalizeStringArray(entry.exits, `areas[${index}].exits`),
      mustInclude: normalizeStringArray(
        entry.mustInclude,
        `areas[${index}].mustInclude`,
      ),
    };
  });

  const seenLabels = new Set();
  for (const area of areas) {
    if (seenLabels.has(area.label)) {
      throw new Error(
        `areas labels must be unique; duplicate label '${area.label}'`,
      );
    }
    seenLabels.add(area.label);
  }

  return areas;
}

function normalizeStyle(value) {
  if (value === undefined) return {};
  assertObject(value, "style");

  return {
    overview: normalizeString(value.overview, "style.overview"),
    palette: normalizeString(value.palette, "style.palette"),
    linework: normalizeString(value.linework, "style.linework"),
    lighting: normalizeString(value.lighting, "style.lighting"),
    atmosphere: normalizeString(value.atmosphere, "style.atmosphere"),
    avoid: normalizeStringArray(value.avoid, "style.avoid"),
  };
}

function normalizeDeliverable(value) {
  if (value === undefined) return {};
  assertObject(value, "deliverable");

  return {
    format: normalizeString(value.format, "deliverable.format"),
    aspectRatio: normalizeString(value.aspectRatio, "deliverable.aspectRatio"),
    camera: normalizeString(value.camera, "deliverable.camera"),
    grid: normalizeString(value.grid, "deliverable.grid"),
    labels: normalizeString(value.labels, "deliverable.labels"),
    legendItems: normalizeStringArray(
      value.legendItems,
      "deliverable.legendItems",
    ),
  };
}

function validateMapPromptSpec(raw) {
  assertObject(raw, "map brief");

  return {
    id: normalizeString(raw.id, "id", { required: true }),
    title: normalizeString(raw.title, "title", { required: true }),
    level: normalizeString(raw.level, "level"),
    chapter: normalizeString(raw.chapter, "chapter"),
    theme: normalizeString(raw.theme, "theme", { required: true }),
    promise: normalizeString(raw.promise, "promise", { required: true }),
    referenceImages: normalizeReferenceImages(raw.referenceImages),
    deliverable: normalizeDeliverable(raw.deliverable),
    style: normalizeStyle(raw.style),
    areas: normalizeAreas(raw.areas),
    flow: normalizeStringArray(raw.flow, "flow"),
    compositionNotes: normalizeStringArray(
      raw.compositionNotes,
      "compositionNotes",
    ),
    revisionChecklist: normalizeStringArray(
      raw.revisionChecklist,
      "revisionChecklist",
    ),
  };
}

function bulletList(items) {
  if (items.length === 0) {
    return ["- None supplied."];
  }

  return items.map((item) => `- ${item}`);
}

function tableRow(label, value) {
  return `| ${label} | ${value || "-"} |`;
}

function joinSentences(parts) {
  return parts
    .filter(Boolean)
    .map((part) => part.trim().replace(/\.$/, ""))
    .join(". ")
    .trim();
}

function buildMapPrompt(spec) {
  const lines = [
    "Create a single top-down fantasy dungeon map for tabletop play.",
    `Project title: ${spec.title}.`,
    `Theme: ${spec.theme}.`,
    `Play promise: ${spec.promise.replace(/\.*$/, "")}.`,
  ];

  if (spec.referenceImages.length > 0) {
    lines.push(
      "Use the attached reference images for visual language, symbols, and surface treatment, but invent a fresh layout instead of copying any reference composition.",
    );

    for (const ref of spec.referenceImages) {
      const referenceNotes = joinSentences([
        ref.focus && `Focus on ${ref.focus}`,
        ref.usage && `Usage guidance: ${ref.usage}`,
      ]);
      lines.push(
        referenceNotes
          ? `Reference image "${ref.label}": ${referenceNotes}.`
          : `Reference image "${ref.label}".`,
      );
    }
  }

  const deliverableSentence = joinSentences([
    spec.deliverable.format && `Deliverable: ${spec.deliverable.format}`,
    spec.deliverable.aspectRatio &&
      `Frame it for ${spec.deliverable.aspectRatio}`,
    spec.deliverable.camera && `Camera: ${spec.deliverable.camera}`,
    spec.deliverable.grid && `Grid treatment: ${spec.deliverable.grid}`,
    spec.deliverable.labels && `Labels: ${spec.deliverable.labels}`,
    spec.deliverable.legendItems.length > 0 &&
      `Bottom panel MUST be included: white background legend showing short labels under symbols: ${spec.deliverable.legendItems.join(", ")}`,
  ]);
  if (deliverableSentence) {
    lines.push(`${deliverableSentence}.`);
  }

  const styleSentence = joinSentences([
    spec.style.overview && `Visual direction: ${spec.style.overview}`,
    spec.style.palette && `Palette: ${spec.style.palette}`,
    spec.style.linework && `Linework: ${spec.style.linework}`,
    spec.style.lighting && `Lighting: ${spec.style.lighting}`,
    spec.style.atmosphere && `Atmosphere: ${spec.style.atmosphere}`,
  ]);
  if (styleSentence) {
    lines.push(`${styleSentence}.`);
  }

  lines.push("Required areas and adjacencies:");
  for (const area of spec.areas) {
    lines.push(
      `${area.label}. ${area.name}: ${joinSentences([
        area.role && `Role: ${area.role}`,
        area.description,
        area.connections.length > 0 &&
          `Connect directly to ${area.connections.join(", ")}`,
        area.exits.length > 0 &&
          `Must include explicit exit arrows at edge of map: ${area.exits.join(", ")}`,
        area.mustInclude.length > 0 &&
          `Must include ${area.mustInclude.join(", ")}`,
      ])}.`,
    );
  }

  if (spec.flow.length > 0) {
    lines.push("Map flow and player-facing sequencing:");
    for (const step of spec.flow) {
      lines.push(`- ${step}`);
    }
  }

  if (spec.compositionNotes.length > 0) {
    lines.push("Additional composition notes:");
    for (const note of spec.compositionNotes) {
      lines.push(`- ${note}`);
    }
  }

  if (spec.style.avoid.length > 0) {
    lines.push(`Avoid: ${spec.style.avoid.join(", ")}.`);
  }

  return lines.join("\n");
}

function renderMapPromptPacket(spec) {
  const prompt = buildMapPrompt(spec);
  const lines = [
    `# Map Prompt Packet: ${spec.title}`,
    "",
    "## Workflow",
    "",
    "1. Attach the listed reference images to your image model.",
    "2. Paste the final prompt after the references are attached.",
    "3. Review the first pass against the checklist before asking for revisions.",
    "",
    "## Metadata",
    "",
    "| Field | Value |",
    "| ----- | ----- |",
    tableRow("ID", spec.id),
    tableRow("Title", spec.title),
    tableRow("Level", spec.level),
    tableRow("Chapter", spec.chapter),
    tableRow("Theme", spec.theme),
    tableRow("Promise", spec.promise),
    "",
    "## Reference Images",
    "",
  ];

  if (spec.referenceImages.length === 0) {
    lines.push(
      "No reference images are listed. Add one or more local references before sending this packet to an image model if you want style anchoring.",
    );
  } else {
    lines.push("| Ref | Path | Focus | Usage |");
    lines.push("| --- | ---- | ----- | ----- |");
    for (const ref of spec.referenceImages) {
      lines.push(
        `| ${ref.label} | ${ref.path || "-"} | ${ref.focus || "-"} | ${ref.usage || "-"} |`,
      );
    }
  }

  lines.push("");
  lines.push("## Deliverable");
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("| ----- | ----- |");
  lines.push(
    tableRow(
      "Format",
      spec.deliverable.format || "single top-down dungeon map",
    ),
  );
  lines.push(tableRow("Aspect Ratio", spec.deliverable.aspectRatio));
  lines.push(tableRow("Camera", spec.deliverable.camera));
  lines.push(tableRow("Grid", spec.deliverable.grid));
  lines.push(tableRow("Labels", spec.deliverable.labels));
  if (spec.deliverable.legendItems.length > 0) {
    lines.push(
      tableRow("Legend Items", spec.deliverable.legendItems.join(", ")),
    );
  }
  lines.push("");
  lines.push("## Area Schedule");
  lines.push("");

  for (const area of spec.areas) {
    lines.push(`### ${area.label}. ${area.name}`);
    lines.push("");
    if (area.role) lines.push(`- Role: ${area.role}`);
    if (area.description) lines.push(`- Description: ${area.description}`);
    lines.push(
      `- Connections: ${area.connections.length > 0 ? area.connections.join(", ") : "None specified"}`,
    );
    if (area.exits.length > 0) {
      lines.push(`- Exits: ${area.exits.join(", ")}`);
    }
    lines.push(
      `- Must Include: ${area.mustInclude.length > 0 ? area.mustInclude.join(", ") : "None specified"}`,
    );
    lines.push("");
  }

  if (spec.flow.length > 0) {
    lines.push("## Flow");
    lines.push("");
    lines.push(...spec.flow.map((step, index) => `${index + 1}. ${step}`));
    lines.push("");
  }

  if (spec.compositionNotes.length > 0) {
    lines.push("## Composition Notes");
    lines.push("");
    lines.push(...bulletList(spec.compositionNotes));
    lines.push("");
  }

  lines.push("## Final Prompt");
  lines.push("");
  lines.push("```text");
  lines.push(prompt);
  lines.push("```");
  lines.push("");
  lines.push("## Negative Prompt");
  lines.push("");
  lines.push(...bulletList(spec.style.avoid));
  lines.push("");
  lines.push("## Revision Checklist");
  lines.push("");

  const checklist =
    spec.revisionChecklist.length > 0
      ? spec.revisionChecklist
      : [
          "The layout feels original rather than copied from the reference image.",
          "The room count and major adjacencies match the area schedule.",
          "Labels are room numbers only, and they remain legible.",
          "The map reads clearly at table scale with a usable grid and doors.",
        ];

  lines.push(...checklist.map((item) => `- [ ] ${item}`));
  lines.push("");

  return lines.join("\n");
}

module.exports = {
  buildMapPrompt,
  renderMapPromptPacket,
  validateMapPromptSpec,
};
