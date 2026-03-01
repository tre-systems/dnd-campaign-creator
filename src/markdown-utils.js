/**
 * Shared utilities for Markdown to Google Docs conversion
 */

/**
 * Convert inline Markdown (bold, italic, code, etc.) to plain text with formatting requests.
 *
 * @param {string} text - Text containing inline Markdown
 * @returns {{text: string, formatting: Array}} - Plain text and formatting requests
 */
function inlineMarkdownToText(text) {
  if (!text) return { text: "", formatting: [] };

  const formatting = [];
  let result = text;

  // Collect all formatting ranges first (code, bold, italic) before modifying text
  const codeRegex = /`([^`]+)`/g;
  let match;
  const codeRanges = [];

  while ((match = codeRegex.exec(text)) !== null) {
    codeRanges.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[1],
    });
  }

  // Handle bold (**text** or __text__)
  // First, collect all bold ranges
  const boldRegex = /\*\*([^*]+)\*\*|__([^_]+)__/g;
  let boldMatch;
  const boldRanges = [];

  while ((boldMatch = boldRegex.exec(text)) !== null) {
    const boldText = boldMatch[1] || boldMatch[2];
    boldRanges.push({
      start: boldMatch.index,
      end: boldMatch.index + boldMatch[0].length,
      text: boldText,
    });
  }

  // Collect link ranges (exclude images starting with !)
  const linkRegex = /(?:^|[^!])\[([^\]]+)\]\(([^\)]+)\)/g;
  let linkMatch;
  const linkRanges = [];

  // Reset regex lastIndex
  linkRegex.lastIndex = 0;

  // Note: Complex regex to avoid capturing the preceding char if it's not !
  // A simpler approach is to match all [...] and check if it starts with !
  const naiveLinkRegex = /\[([^\]]+)\]\(([^\)]+)\)/g;
  while ((linkMatch = naiveLinkRegex.exec(text)) !== null) {
    // Check if it's an image (preceded by !)
    if (linkMatch.index > 0 && text[linkMatch.index - 1] === "!") {
      continue;
    }

    linkRanges.push({
      start: linkMatch.index,
      end: linkMatch.index + linkMatch[0].length,
      text: linkMatch[1],
      url: linkMatch[2],
      type: "link",
    });
  }

  // Collect italic ranges before modifying text
  const italicRegex = /(?<!\*)\*([^*]+)\*(?!\*)|(?<!_)_([^_]+)_(?!_)/g;
  const italicRanges = [];
  let italicMatch;

  while ((italicMatch = italicRegex.exec(text)) !== null) {
    const italicText = italicMatch[1] || italicMatch[2];
    italicRanges.push({
      start: italicMatch.index,
      end: italicMatch.index + italicMatch[0].length,
      text: italicText,
    });
  }

  // Apply all replacements and track formatting positions correctly
  // Process in reverse order so earlier positions aren't affected by later replacements
  const allRanges = [
    ...codeRanges.map((r) => ({ ...r, type: "code" })),
    ...boldRanges.map((r) => ({ ...r, type: "bold" })),
    ...italicRanges.map((r) => ({ ...r, type: "italic" })),
    ...linkRanges,
  ].sort((a, b) => b.start - a.start);

  // Track how much each replacement shortens the text
  // When processing in reverse, we need to adjust positions for earlier replacements
  const replacements = [];

  allRanges.forEach((range) => {
    // Check for overlaps - simplified logic: strict containment or disjoint
    // If ranges overlap partially, results may be undefined, but markdown usually nests nicely
    // We'll proceed with standard reverse application

    const resultStart = range.start;
    const resultEnd = range.end;

    // Replace in result
    // Note: If we have nested formatting, this simple replacement might break things
    // But for a simple converter, it covers 90% of cases
    // We need to check if the range is still valid in 'result' (might have been altered by a nested replacement)
    // Actually, since we sort by start descending, inner ranges (which start later) are processed first?
    // No, outer ranges start earlier usually.
    // Nested: **[Link](url)**.
    // Bold: start 0, end 20. Link: start 2, end 18.
    // Sorted by start desc: Link processed first (start 2).
    // Link text replaced.
    // Then Bold processed (start 0).
    // This works for containment where inner starts LATER.
    // But [**Bold**](url)... Link start 0. Bold start 1.
    // Bold processed first (start 1). Text shortens.
    // Link start 0 is now valid, but its end is wrong because text shortened inside it.

    // To fix nested formatting properly requires a AST.
    // For now, we'll accept that this regex approach has limits with nesting.

    // However, we MUST adjust 'range.url' for links? No, url is separate.

    // We only replace the text in the string.

    // Correction: We must apply replacements.
    // And we need to re-calculate indices for "formatting" objects.

    // Let's rely on the text content.

    result =
      result.substring(0, resultStart) +
      range.text +
      result.substring(resultEnd);

    // Store replacement info for calculating final positions
    replacements.push({
      originalStart: range.start,
      originalEnd: range.end,
      newText: range.text,
      type: range.type,
      url: range.url, // for links
    });
  });

  // Now calculate final formatting positions
  // Process replacements in forward order to calculate offsets
  replacements.reverse().forEach((repl) => {
    // Calculate offset from all previous replacements (those before this one)
    let offset = 0;
    replacements.forEach((prevRepl) => {
      // If a previous replacement finished before this one started, it shifts us
      if (prevRepl.originalEnd <= repl.originalStart) {
        offset +=
          prevRepl.originalEnd -
          prevRepl.originalStart -
          prevRepl.newText.length;
      }
    });

    const finalStart = repl.originalStart - offset;
    const finalEnd = finalStart + repl.newText.length;

    // Add formatting
    if (repl.type === "code") {
      formatting.push({
        updateTextStyle: {
          range: {
            startIndex: finalStart,
            endIndex: finalEnd,
          },
          textStyle: {
            fontSize: { magnitude: 10, unit: "PT" },
            backgroundColor: {
              color: { rgbColor: { red: 0.95, green: 0.95, blue: 0.95 } },
            },
          },
          fields: "fontSize,backgroundColor",
        },
      });
    } else if (repl.type === "bold") {
      formatting.push({
        updateTextStyle: {
          range: {
            startIndex: finalStart,
            endIndex: finalEnd,
          },
          textStyle: { bold: true },
          fields: "bold",
        },
      });
    } else if (repl.type === "italic") {
      formatting.push({
        updateTextStyle: {
          range: {
            startIndex: finalStart,
            endIndex: finalEnd,
          },
          textStyle: { italic: true },
          fields: "italic",
        },
      });
    } else if (repl.type === "link") {
      formatting.push({
        updateTextStyle: {
          range: {
            startIndex: finalStart,
            endIndex: finalEnd,
          },
          textStyle: {
            link: { url: repl.url },
            foregroundColor: {
              color: { rgbColor: { red: 0.06, green: 0.33, blue: 0.8 } },
            }, // Link blue
            underline: true,
          },
          fields: "link,foregroundColor,underline",
        },
      });
    }
  });

  // Second pass: fix nested formatting artifacts
  // When bold (**) is inside italic (_), the outer replacement re-introduces ** markers.
  // Strip any remaining bold markers and add proper formatting.
  const leftoverBoldRegex = /\*\*(.+?)\*\*/g;
  let leftoverMatch;
  while ((leftoverMatch = leftoverBoldRegex.exec(result)) !== null) {
    const start = leftoverMatch.index;
    const end = start + leftoverMatch[0].length;
    const innerText = leftoverMatch[1];

    result = result.substring(0, start) + innerText + result.substring(end);

    formatting.push({
      updateTextStyle: {
        range: { startIndex: start, endIndex: start + innerText.length },
        textStyle: { bold: true },
        fields: "bold",
      },
    });

    // Adjust positions of existing formatting entries that come after this replacement
    const delta = 4; // removed 4 chars: ** before + ** after
    formatting.forEach((fmt) => {
      if (fmt.updateTextStyle && fmt.updateTextStyle.range) {
        const r = fmt.updateTextStyle.range;
        if (r.startIndex > start) r.startIndex -= delta;
        if (r.endIndex > start) r.endIndex -= delta;
      }
    });

    // Reset regex since string changed
    leftoverBoldRegex.lastIndex = start + innerText.length;
  }

  return { text: result, formatting };
}

module.exports = {
  inlineMarkdownToText,
};
