/**
 * D&D Stat Block Formatter for Google Docs
 *
 * Handles detection and formatting of D&D 5E stat blocks in Markdown.
 */

const { inlineMarkdownToText } = require("./markdown-utils.js");

/**
 * Check if a blockquote contains a D&D stat block.
 * Stat blocks start with ### Creature Name followed by _Size type, alignment_
 *
 * @param {Object} blockquoteToken - Blockquote token from marked parser
 * @returns {boolean} - True if this is a stat block
 */
function isStatBlock(blockquoteToken) {
  if (!blockquoteToken.tokens || blockquoteToken.tokens.length === 0) {
    return false;
  }

  // Look for a heading (depth 3) OR a paragraph starting with bold text (**Name**)
  // followed by text matching size/type/alignment pattern
  let foundHeading = false;
  for (let i = 0; i < blockquoteToken.tokens.length; i++) {
    const token = blockquoteToken.tokens[i];

    // Check if it's a heading depth 3, OR a paragraph with strong text at the start
    if (token.type === "heading" && token.depth === 3) {
      foundHeading = true;
    } else if (
      token.type === "paragraph" &&
      token.tokens &&
      token.tokens.length > 0 &&
      token.tokens[0].type === "strong"
    ) {
      foundHeading = true;
    } else if (foundHeading) {
      // Check if the current or next token contains italic text matching size/type/alignment pattern
      const text = token.text || "";
      if (token.tokens) {
        for (const nestedToken of token.tokens) {
          if (nestedToken.type === "em" || nestedToken.type === "strong") {
            const nestedText = nestedToken.text || "";
            if (/^[^_]+,\s*[^_]+$/.test(nestedText.trim())) {
              return true;
            }
          }
        }
      }

      // Also check if the raw text matches the _Size type, alignment_ pattern
      if (
        /^_[^_]+,\s*[^_]+_$/.test(text.trim()) ||
        /^[^_]+,\s*[^_]+$/.test(text.trim())
      ) {
        return true;
      }
    }

    // If the token is a paragraph, check if it contains both a strong title and an em size inside it natively
    if (token.type === "paragraph" && token.tokens) {
      const hasStrong = token.tokens.some((t) => t.type === "strong");
      const hasEm = token.tokens.some(
        (t) =>
          t.type === "em" && /^[^_]+,\s*[^_]+$/.test((t.text || "").trim()),
      );

      if (hasStrong && hasEm) {
        return true;
      }

      // Check if it's a single text block with raw italic underscores
      if (hasStrong && token.text) {
        if (/_[^_]+,\s*[^_]+_/.test(token.text)) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Format a D&D stat block with proper styling.
 *
 * @param {Object} blockquoteToken - Blockquote token containing stat block
 * @param {number} startIndex - Starting index in document
 * @returns {{requests: Array, nextIndex: number}} - Google Docs requests and next index
 */
function formatStatBlock(blockquoteToken, startIndex) {
  const requests = [];
  let currentIndex = startIndex;

  // Add spacing before stat block
  requests.push({
    insertText: { location: { index: currentIndex }, text: "\n" },
  });
  currentIndex += 1;

  const statBlockStart = currentIndex;
  let statBlockEnd = currentIndex;

  // Parse tokens in the blockquote
  let creatureName = "";
  let sizeTypeAlignment = "";
  let foundCreatureName = false;
  let statBlockLines = [];

  for (const token of blockquoteToken.tokens || []) {
    // Check for the creature name
    if (!foundCreatureName) {
      if (token.type === "heading" && token.depth === 3) {
        creatureName = token.text || "";
        foundCreatureName = true;
      } else if (
        token.type === "paragraph" &&
        token.tokens &&
        token.tokens.length > 0 &&
        token.tokens[0].type === "strong"
      ) {
        creatureName = token.tokens[0].text || "";
        foundCreatureName = true;

        // If the size/type is in the same paragraph (split by newline), extract it without pushing to stat lines
        const remainingText = token.text
          .replace(`**${creatureName}**`, "")
          .trim();
        if (remainingText && /_[^_]+,\s*[^_]+_/.test(remainingText)) {
          // Match _Size type, alignment_ pattern anywhere in remainder
          const match = remainingText.match(/_([^_]+,\s*[^_]+)_/);
          if (match) {
            sizeTypeAlignment = match[1];
          } else if (
            remainingText.startsWith("_") &&
            remainingText.endsWith("_")
          ) {
            sizeTypeAlignment = remainingText.replace(/^_|_$/g, "");
          }
        } else if (remainingText) {
          statBlockLines.push({
            type: "paragraph",
            text: remainingText,
            token,
          });
        }
      }
    } else {
      // Process stat block content
      if (token.type === "paragraph") {
        const text = token.text || "";
        // Check if it's the size/type/alignment line (more flexible pattern)
        if (!sizeTypeAlignment && /^_[^_]+,\s*[^_]+_$/.test(text.trim())) {
          sizeTypeAlignment = text.replace(/^_|_$/g, "");
        } else {
          statBlockLines.push({ type: "paragraph", text, token });
        }
      } else if (token.type === "hr") {
        statBlockLines.push({ type: "hr" });
      } else if (token.type === "table") {
        statBlockLines.push({ type: "table", token });
      } else if (token.type === "heading") {
        // Check if this heading contains the size/type/alignment (marked sometimes parses it as heading)
        const text = token.text || "";
        if (token.tokens) {
          for (const nestedToken of token.tokens) {
            if (nestedToken.type === "em" || nestedToken.type === "strong") {
              const nestedText = nestedToken.text || "";
              if (/^[^_]+,\s*[^_]+$/.test(nestedText.trim())) {
                sizeTypeAlignment = nestedText;
                break;
              }
            }
          }
        }
        // Add all headings (including depth 3 like "Actions", "Legendary Actions")
        if (!sizeTypeAlignment || token.depth !== 2) {
          statBlockLines.push({
            type: "heading",
            depth: token.depth,
            text: token.text || "",
          });
        }
      } else if (token.type === "list") {
        statBlockLines.push({ type: "list", token });
      } else if (token.type === "space") {
        statBlockLines.push({ type: "space" });
      }
    }
  }

  // Insert creature name (bold, large, red, serif)
  const nameText = creatureName + "\n";
  requests.push({
    insertText: {
      location: { index: currentIndex },
      text: nameText,
    },
  });
  const nameStart = currentIndex;
  const nameEnd = currentIndex + creatureName.length;
  if (nameStart < nameEnd) {
    requests.push({
      updateTextStyle: {
        range: { startIndex: nameStart, endIndex: nameEnd },
        textStyle: {
          bold: true,
          fontSize: { magnitude: 14, unit: "PT" },
          foregroundColor: {
            color: { rgbColor: { red: 0.5, green: 0.1, blue: 0.1 } }, // Dark Red
          },
          weightedFontFamily: {
            fontFamily: "Merriweather", // Serif font
            weight: 700,
          },
        },
        fields: "bold,fontSize,foregroundColor,weightedFontFamily",
      },
    });
  }
  currentIndex += nameText.length;

  // Insert size/type/alignment (italic, dark gray)
  if (sizeTypeAlignment) {
    const alignmentText = sizeTypeAlignment + "\n";
    requests.push({
      insertText: {
        location: { index: currentIndex },
        text: alignmentText,
      },
    });
    const alignStart = currentIndex;
    const alignEnd = currentIndex + sizeTypeAlignment.length;
    requests.push({
      updateTextStyle: {
        range: { startIndex: alignStart, endIndex: alignEnd },
        textStyle: {
          italic: true,
          fontSize: { magnitude: 10, unit: "PT" },
          foregroundColor: {
            color: { rgbColor: { red: 0.2, green: 0.2, blue: 0.2 } },
          },
        },
        fields: "italic,fontSize,foregroundColor",
      },
    });
    currentIndex += alignmentText.length;
  }

  // Process stat block lines
  for (const line of statBlockLines) {
    if (line.type === "hr") {
      // Tapered horizontal rule (Dark Red)
      const hrStart = currentIndex;
      requests.push({
        insertText: { location: { index: currentIndex }, text: "\n" },
      });
      currentIndex += 1;
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: hrStart, endIndex: currentIndex },
          paragraphStyle: {
            borderBottom: {
              color: {
                color: { rgbColor: { red: 0.6, green: 0.2, blue: 0.2 } }, // Red divider
              },
              width: { magnitude: 1.5, unit: "PT" }, // Thicker
              padding: { magnitude: 0, unit: "PT" },
              dashStyle: "SOLID",
            },
            spaceBelow: { magnitude: 2, unit: "PT" },
          },
          fields: "borderBottom,spaceBelow",
        },
      });
    } else if (line.type === "paragraph") {
      // Handle paragraph - stats text
      const paraText = inlineMarkdownToText(line.text);
      const paraStart = currentIndex;
      requests.push({
        insertText: {
          location: { index: currentIndex },
          text: paraText.text + "\n",
        },
      });

      // Apply standard stat block font (Roboto/Sans)
      requests.push({
        updateTextStyle: {
          range: {
            startIndex: paraStart,
            endIndex: currentIndex + paraText.text.length,
          },
          textStyle: {
            weightedFontFamily: {
              fontFamily: "Roboto",
              weight: 400,
            },
            fontSize: { magnitude: 9, unit: "PT" },
            foregroundColor: {
              color: { rgbColor: { red: 0.1, green: 0.1, blue: 0.1 } }, // Black/Dark gray
            },
          },
          fields: "weightedFontFamily,fontSize,foregroundColor",
        },
      });

      // Compact line spacing for stat block paragraphs
      requests.push({
        updateParagraphStyle: {
          range: {
            startIndex: paraStart,
            endIndex: paraStart + paraText.text.length + 1,
          },
          paragraphStyle: {
            lineSpacing: 110,
          },
          fields: "lineSpacing",
        },
      });

      // Apply inline formatting (bold, italic, etc.)
      if (paraText.formatting && paraText.formatting.length > 0) {
        paraText.formatting.forEach((fmt) => {
          const startIdx = paraStart + fmt.updateTextStyle.range.startIndex;
          const endIdx = paraStart + fmt.updateTextStyle.range.endIndex;
          if (endIdx <= paraStart + paraText.text.length && startIdx < endIdx) {
            fmt.updateTextStyle.range.startIndex = startIdx;
            fmt.updateTextStyle.range.endIndex = endIdx;

            // If bold, ensure it's still Roboto but Bold
            if (fmt.updateTextStyle.textStyle.bold) {
              fmt.updateTextStyle.textStyle.weightedFontFamily = {
                fontFamily: "Roboto",
                weight: 700,
              };
              fmt.updateTextStyle.fields += ",weightedFontFamily";
            }

            requests.push(fmt);
          }
        });
      }

      currentIndex += paraText.text.length + 1;
    } else if (line.type === "table") {
      const tableResult = formatStatBlockTable(line.token, currentIndex);
      requests.push(...tableResult.requests);
      currentIndex = tableResult.nextIndex;
    } else if (line.type === "heading") {
      // Section headers (Actions, etc.) - Red, Serif, with top border (5e style)
      const headingText = line.text + "\n";
      requests.push({
        insertText: {
          location: { index: currentIndex },
          text: headingText,
        },
      });
      const headingStart = currentIndex;
      const headingEnd = currentIndex + line.text.length;
      if (headingStart < headingEnd) {
        requests.push({
          updateTextStyle: {
            range: { startIndex: headingStart, endIndex: headingEnd },
            textStyle: {
              bold: true,
              italic: true,
              fontSize: { magnitude: 11, unit: "PT" },
              foregroundColor: {
                color: { rgbColor: { red: 0.5, green: 0.1, blue: 0.1 } }, // Dark Red
              },
              weightedFontFamily: {
                fontFamily: "Merriweather", // Serif
                weight: 700,
              },
            },
            fields: "bold,italic,fontSize,foregroundColor,weightedFontFamily",
          },
        });
      }
      // Add a top border to section headers (5e style divider before Actions, etc.)
      requests.push({
        updateParagraphStyle: {
          range: {
            startIndex: headingStart,
            endIndex: headingStart + headingText.length,
          },
          paragraphStyle: {
            borderTop: {
              color: {
                color: { rgbColor: { red: 0.58, green: 0.15, blue: 0.14 } },
              },
              width: { magnitude: 1, unit: "PT" },
              padding: { magnitude: 2, unit: "PT" },
              dashStyle: "SOLID",
            },
            spaceAbove: { magnitude: 4, unit: "PT" },
            spaceBelow: { magnitude: 0, unit: "PT" },
          },
          fields: "borderTop,spaceAbove,spaceBelow",
        },
      });
      currentIndex += headingText.length;
    } else if (line.type === "list") {
      const listResult = formatStatBlockList(line.token, currentIndex);
      requests.push(...listResult.requests);
      currentIndex = listResult.nextIndex;
    } else if (line.type === "space") {
      continue;
    }
  }

  statBlockEnd = currentIndex;

  // Stat Block background (Parchment), compact spacing, and indentation
  requests.push({
    updateParagraphStyle: {
      range: { startIndex: statBlockStart, endIndex: statBlockEnd },
      paragraphStyle: {
        spaceAbove: { magnitude: 1, unit: "PT" },
        spaceBelow: { magnitude: 1, unit: "PT" },
        indentFirstLine: { magnitude: 14, unit: "PT" },
        indentStart: { magnitude: 14, unit: "PT" },
        indentEnd: { magnitude: 14, unit: "PT" },
        borderLeft: {
          color: {
            color: { rgbColor: { red: 0.99, green: 0.97, blue: 0.92 } },
          },
          width: { magnitude: 0, unit: "PT" },
          padding: { magnitude: 8, unit: "PT" },
          dashStyle: "SOLID",
        },
        borderRight: {
          color: {
            color: { rgbColor: { red: 0.99, green: 0.97, blue: 0.92 } },
          },
          width: { magnitude: 0, unit: "PT" },
          padding: { magnitude: 8, unit: "PT" },
          dashStyle: "SOLID",
        },
        shading: {
          backgroundColor: {
            color: { rgbColor: { red: 0.99, green: 0.97, blue: 0.92 } }, // Parchment
          },
        },
      },
      fields:
        "spaceAbove,spaceBelow,indentFirstLine,indentStart,indentEnd,shading,borderLeft,borderRight",
    },
  });

  // Top decorative border (dark red, 5e style)
  requests.push({
    updateParagraphStyle: {
      range: { startIndex: statBlockStart, endIndex: statBlockStart + 1 },
      paragraphStyle: {
        borderTop: {
          color: {
            color: { rgbColor: { red: 0.58, green: 0.15, blue: 0.14 } },
          },
          width: { magnitude: 3, unit: "PT" },
          padding: { magnitude: 4, unit: "PT" },
          dashStyle: "SOLID",
        },
        spaceAbove: { magnitude: 12, unit: "PT" },
      },
      fields: "borderTop,spaceAbove",
    },
  });

  // Bottom decorative border (dark red, 5e style)
  if (statBlockEnd > statBlockStart + 1) {
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: statBlockEnd - 1, endIndex: statBlockEnd },
        paragraphStyle: {
          borderBottom: {
            color: {
              color: { rgbColor: { red: 0.58, green: 0.15, blue: 0.14 } },
            },
            width: { magnitude: 3, unit: "PT" },
            padding: { magnitude: 4, unit: "PT" },
            dashStyle: "SOLID",
          },
          spaceBelow: { magnitude: 12, unit: "PT" },
        },
        fields: "borderBottom,spaceBelow",
      },
    });

    // Ensure there's a blank space below the stat block!
    requests.push({
      insertText: { location: { index: statBlockEnd }, text: "\n" },
    });
    currentIndex += 1; // For the inserted newline
  }

  return { requests, nextIndex: currentIndex };
}

/**
 * Format ability score table for stat blocks.
 *
 * @param {Object} tableToken - Table token from marked parser
 * @param {number} startIndex - Starting index in document
 * @returns {{requests: Array, nextIndex: number}} - Google Docs requests and next index
 */
function formatStatBlockTable(tableToken, startIndex) {
  const requests = [];
  let currentIndex = startIndex;

  if (!tableToken.header || !tableToken.rows) {
    return { requests, nextIndex: currentIndex };
  }

  // Format ability scores table - standard D&D format with clean columns
  const headerCells = tableToken.header.map((cell) => {
    const text = inlineMarkdownToText(cell.text || "");
    return text.text.trim();
  });

  // Create header row with proper spacing (no visible pipes)
  const headerRow = headerCells.map((cell) => cell.padEnd(12)).join("") + "\n";
  requests.push({
    insertText: {
      location: { index: currentIndex },
      text: headerRow,
    },
  });
  const headerStart = currentIndex;
  const headerEnd = currentIndex + headerRow.length - 1;

  // Apply monospace font and bold to header row
  requests.push({
    updateTextStyle: {
      range: { startIndex: headerStart, endIndex: headerEnd },
      textStyle: {
        bold: true,
        fontSize: { magnitude: 9, unit: "PT" },
        weightedFontFamily: {
          fontFamily: "Roboto Mono",
          weight: 700,
        },
        foregroundColor: {
          color: { rgbColor: { red: 0.5, green: 0.1, blue: 0.1 } },
        },
      },
      fields: "bold,fontSize,weightedFontFamily,foregroundColor",
    },
  });

  // Apply border-bottom directly to the header row paragraph (no separate separator line)
  requests.push({
    updateParagraphStyle: {
      range: { startIndex: headerStart, endIndex: headerEnd },
      paragraphStyle: {
        borderBottom: {
          color: {
            color: { rgbColor: { red: 0.6, green: 0.2, blue: 0.2 } },
          },
          width: { magnitude: 0.5, unit: "PT" },
          padding: { magnitude: 0, unit: "PT" },
          dashStyle: "SOLID",
        },
        spaceBelow: { magnitude: 0, unit: "PT" },
        lineSpacing: 100,
      },
      fields: "borderBottom,spaceBelow,lineSpacing",
    },
  });

  currentIndex += headerRow.length;

  // Format data rows with aligned columns
  tableToken.rows.forEach((row) => {
    const rowCells = row.map((cell) => {
      const text = inlineMarkdownToText(cell.text || "");
      return text.text.trim();
    });
    const rowText = rowCells.map((cell) => cell.padEnd(12)).join("") + "\n";
    const rowStart = currentIndex;
    requests.push({
      insertText: {
        location: { index: currentIndex },
        text: rowText,
      },
    });

    // Apply monospace font to data rows
    requests.push({
      updateTextStyle: {
        range: {
          startIndex: rowStart,
          endIndex: rowStart + rowText.length - 1,
        },
        textStyle: {
          fontSize: { magnitude: 9, unit: "PT" },
          weightedFontFamily: {
            fontFamily: "Roboto Mono",
            weight: 400,
          },
          foregroundColor: {
            color: { rgbColor: { red: 0.1, green: 0.1, blue: 0.1 } },
          },
        },
        fields: "fontSize,weightedFontFamily,foregroundColor",
      },
    });

    // Tight line spacing for table rows
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: rowStart, endIndex: rowStart + rowText.length },
        paragraphStyle: {
          lineSpacing: 100,
          spaceAbove: { magnitude: 0, unit: "PT" },
          spaceBelow: { magnitude: 0, unit: "PT" },
        },
        fields: "lineSpacing,spaceAbove,spaceBelow",
      },
    });

    currentIndex += rowText.length;
  });

  return { requests, nextIndex: currentIndex };
}

/**
 * Format list for stat blocks.
 *
 * @param {Object} listToken - List token from marked parser
 * @param {number} startIndex - Starting index in document
 * @returns {{requests: Array, nextIndex: number}} - Google Docs requests and next index
 */
function formatStatBlockList(listToken, startIndex) {
  const requests = [];
  let currentIndex = startIndex;

  listToken.items.forEach((item, idx) => {
    let itemText;
    if (typeof item.text === "string") {
      itemText = inlineMarkdownToText(item.text);
    } else if (item.tokens) {
      const text = item.tokens.map((t) => t.raw || t.text || "").join("");
      itemText = inlineMarkdownToText(text);
    } else {
      itemText = { text: "", formatting: [] };
    }

    const itemStart = currentIndex;
    const prefix = listToken.ordered ? `${idx + 1}. ` : "• ";
    const fullText = prefix + itemText.text + "\n";
    requests.push({
      insertText: {
        location: { index: currentIndex },
        text: fullText,
      },
    });

    // Apply stat block font to list items
    requests.push({
      updateTextStyle: {
        range: {
          startIndex: itemStart,
          endIndex: itemStart + fullText.length - 1,
        },
        textStyle: {
          weightedFontFamily: {
            fontFamily: "Roboto",
            weight: 400,
          },
          fontSize: { magnitude: 9, unit: "PT" },
          foregroundColor: {
            color: { rgbColor: { red: 0.1, green: 0.1, blue: 0.1 } },
          },
        },
        fields: "weightedFontFamily,fontSize,foregroundColor",
      },
    });

    // Compact line spacing for list items
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: itemStart, endIndex: itemStart + fullText.length },
        paragraphStyle: {
          lineSpacing: 110,
          spaceAbove: { magnitude: 1, unit: "PT" },
          spaceBelow: { magnitude: 1, unit: "PT" },
        },
        fields: "lineSpacing,spaceAbove,spaceBelow",
      },
    });

    // Apply formatting
    if (itemText.formatting && itemText.formatting.length > 0) {
      itemText.formatting.forEach((fmt) => {
        const startIdx =
          itemStart + prefix.length + fmt.updateTextStyle.range.startIndex;
        const endIdx =
          itemStart + prefix.length + fmt.updateTextStyle.range.endIndex;
        if (
          endIdx <= itemStart + (prefix + itemText.text).length &&
          startIdx < endIdx
        ) {
          fmt.updateTextStyle.range.startIndex = startIdx;
          fmt.updateTextStyle.range.endIndex = endIdx;

          // Ensure bold items use Roboto Bold
          if (fmt.updateTextStyle.textStyle.bold) {
            fmt.updateTextStyle.textStyle.weightedFontFamily = {
              fontFamily: "Roboto",
              weight: 700,
            };
            fmt.updateTextStyle.fields += ",weightedFontFamily";
          }

          requests.push(fmt);
        }
      });
    }

    currentIndex += fullText.length;
  });

  return { requests, nextIndex: currentIndex };
}

module.exports = {
  isStatBlock,
  formatStatBlock,
  formatStatBlockTable,
  formatStatBlockList,
};
