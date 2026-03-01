/**
 * Markdown to Google Docs Converter
 *
 * Converts Markdown content to Google Docs API batchUpdate requests.
 */

const { marked } = require("marked");
const { inlineMarkdownToText } = require("./markdown-utils");
const { isStatBlock, formatStatBlock } = require("./stat-block-formatter");

/**
 * Convert Markdown to Google Docs API batchUpdate requests.
 * Uses marked library to parse Markdown into tokens, then converts to Google Docs format.
 *
 * @param {string} mdContent - Markdown content to convert
 * @returns {Array} - Array of Google Docs API requests
 */
function markdownToGoogleDocsRequests(mdContent) {
  // Configure marked
  marked.setOptions({
    gfm: true,
    breaks: false,
    headerIds: false,
  });

  // Parse Markdown into tokens
  const tokens = marked.lexer(mdContent);

  // Filter out excessive space tokens (reduce blank lines)
  const filteredTokens = tokens.filter((token, idx) => {
    // Skip space tokens if previous token was also space or hr
    if (token.type === "space") {
      const prevToken = idx > 0 ? tokens[idx - 1] : null;
      if (
        prevToken &&
        (prevToken.type === "space" || prevToken.type === "hr")
      ) {
        return false;
      }
    }
    return true;
  });

  // Preprocess to handle page breaks (form feed character \f)
  const processedTokens = [];
  for (const token of filteredTokens) {
    // Check if token contains form feed character OR literal \f string
    const text = token.text || token.raw || "";
    if (text.includes("\f") || text.includes("\\f")) {
      // Split by form feed key or literal \f
      // We need a regex to split by either
      const parts = text.split(/\f|\\f/);
      parts.forEach((part, idx) => {
        if (part.trim()) {
          processedTokens.push({ ...token, text: part.trim() });
        }
        if (idx < parts.length - 1) {
          processedTokens.push({ type: "pagebreak" });
        }
      });
    } else {
      processedTokens.push(token);
    }
  }

  const requests = [];
  let currentIndex = 1;

  // Convert tokens to Google Docs requests
  for (const token of processedTokens) {
    // Check if this paragraph contains an image
    if (token.type === "paragraph" && token.text) {
      const imageMatch = token.text.match(/!\[([^\]]*)\]\(([^\)]+)\)/);
      if (imageMatch) {
        // Extract image info
        const imageAlt = imageMatch[1];
        const imageUrl = imageMatch[2];

        // Remove image from paragraph text
        const textWithoutImage = token.text
          .replace(/!\[([^\]]*)\]\(([^\)]+)\)/g, "")
          .trim();

        // If there's remaining text, add it as a paragraph
        if (textWithoutImage) {
          const paraText = inlineMarkdownToText(textWithoutImage);
          const paraStart = currentIndex;
          requests.push({
            insertText: {
              location: { index: currentIndex },
              text: paraText.text + "\n",
            },
          });
          currentIndex += paraText.text.length + 1;
        }

        // Insert the image
        const imageInsertIndex = currentIndex;

        // Add spacing before image
        requests.push({
          insertText: { location: { index: currentIndex }, text: "\n" },
        });
        currentIndex += 1;

        // Check if it's a Google Drive file ID
        let finalImageUrl = imageUrl;
        let driveFileId = null;
        const driveUrlMatch = imageUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (driveUrlMatch) {
          driveFileId = driveUrlMatch[1];
        } else {
          const fileIdMatch = imageUrl.match(/^([a-zA-Z0-9_-]{25,})$/);
          if (fileIdMatch) {
            driveFileId = fileIdMatch[1];
          }
        }

        if (driveFileId) {
          finalImageUrl = `https://drive.google.com/uc?export=view&id=${driveFileId}`;
        }

        // Insert inline image
        requests.push({
          insertInlineImage: {
            location: {
              index: currentIndex,
            },
            uri: finalImageUrl,
            objectSize: {
              height: {
                magnitude: 450,
                unit: "PT",
              },
              width: {
                magnitude: 450,
                unit: "PT",
              },
            },
          },
        });

        currentIndex += 1;

        // Add spacing after image
        requests.push({
          insertText: { location: { index: currentIndex }, text: "\n" },
        });
        currentIndex += 1;

        continue; // Skip normal paragraph processing
      }
    }

    // Normal token processing
    const tokenRequests = tokenToGoogleDocs(token, currentIndex);
    requests.push(...tokenRequests.requests);
    currentIndex = tokenRequests.nextIndex;
  }

  return requests;
}

/**
 * Convert a single Markdown token to Google Docs requests.
 *
 * @param {Object} token - Token from marked parser
 * @param {number} startIndex - Starting index in document
 * @returns {{requests: Array, nextIndex: number}} - Google Docs requests and next index
 */
function tokenToGoogleDocs(token, startIndex) {
  const requests = [];
  let currentIndex = startIndex;

  switch (token.type) {
    case "image":
      // Handle images - support Google Drive file IDs and URLs
      const imageUrl = token.href;
      const imageAlt = token.text || "";

      // Add spacing before image
      requests.push({
        insertText: { location: { index: currentIndex }, text: "\n" },
      });
      currentIndex += 1;

      // Check if it's a Google Drive file ID or URL
      let finalImageUrl = imageUrl;

      // Pattern 1: Full Drive URL: https://drive.google.com/file/d/FILE_ID/view
      let driveFileId = null;
      const driveUrlMatch = imageUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (driveUrlMatch) {
        driveFileId = driveUrlMatch[1];
      } else {
        // Pattern 2: Just a file ID (25+ alphanumeric chars)
        const fileIdMatch = imageUrl.match(/^([a-zA-Z0-9_-]{25,})$/);
        if (fileIdMatch) {
          driveFileId = fileIdMatch[1];
        }
      }

      if (driveFileId) {
        // Convert Drive file ID to direct image URL
        // Note: File must be publicly accessible or shared with the service account
        // Format: https://drive.google.com/uc?export=view&id=FILE_ID
        finalImageUrl = `https://drive.google.com/uc?export=view&id=${driveFileId}`;
      }

      // Insert inline image
      // Note: For Drive images, the file must be publicly accessible
      const imageInsertIndex = currentIndex;
      requests.push({
        insertInlineImage: {
          location: {
            index: imageInsertIndex,
          },
          uri: finalImageUrl,
          objectSize: {
            height: {
              magnitude: 450,
              unit: "PT",
            },
            width: {
              magnitude: 450,
              unit: "PT",
            },
          },
        },
      });

      // After inserting an inline image, the image object is inserted at the index
      // We need to advance the index by 1 (for the image object) and add spacing
      currentIndex = imageInsertIndex + 1;

      // Add spacing after image
      requests.push({
        insertText: { location: { index: currentIndex }, text: "\n" },
      });
      currentIndex += 1;
      break;

    case "heading":
      // Add spacing before heading (except first)
      // More spacing for higher-level headings
      if (currentIndex > 1) {
        const spacing = token.depth === 1 ? 2 : token.depth === 2 ? 1 : 0;
        for (let i = 0; i < spacing; i++) {
          requests.push({
            insertText: { location: { index: currentIndex }, text: "\n" },
          });
          currentIndex += 1;
        }
      }

      const headingText = inlineMarkdownToText(token.text);
      const headingStart = currentIndex;
      requests.push({
        insertText: {
          location: { index: currentIndex },
          text: headingText.text + "\n",
        },
      });

      const headingEnd = currentIndex + headingText.text.length;
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: headingStart, endIndex: headingEnd },
          paragraphStyle: {
            namedStyleType: `HEADING_${Math.min(token.depth, 6)}`,
          },
          fields: "namedStyleType",
        },
      });

      // Apply custom premium styling to headings
      const headingStyle = {
        weightedFontFamily: { fontFamily: "Merriweather", weight: 700 }, // Serif bold
      };

      if (token.depth === 1) {
        // Title: Dark Blue, Large
        headingStyle.fontSize = { magnitude: 26, unit: "PT" };
        headingStyle.foregroundColor = {
          color: { rgbColor: { red: 0.1, green: 0.2, blue: 0.4 } },
        };
      } else if (token.depth === 2) {
        // Act/Section: Dark Red
        headingStyle.fontSize = { magnitude: 18, unit: "PT" };
        headingStyle.foregroundColor = {
          color: { rgbColor: { red: 0.5, green: 0.1, blue: 0.1 } },
        };
      } else if (token.depth === 3) {
        // Stat block headers or sub-events: Deep crimson
        headingStyle.fontSize = { magnitude: 14, unit: "PT" };
        headingStyle.foregroundColor = {
          color: { rgbColor: { red: 0.6, green: 0.15, blue: 0.15 } },
        };
      } else {
        // Subsections: Black
        headingStyle.fontSize = { magnitude: 12, unit: "PT" };
        headingStyle.foregroundColor = {
          color: { rgbColor: { red: 0.2, green: 0.2, blue: 0.2 } },
        };
      }

      requests.push({
        updateTextStyle: {
          range: { startIndex: headingStart, endIndex: headingEnd },
          textStyle: headingStyle,
          fields: "weightedFontFamily,fontSize,foregroundColor",
        },
      });

      // Apply inline formatting (validate indices)
      if (headingText.formatting && headingText.formatting.length > 0) {
        headingText.formatting.forEach((fmt) => {
          const startIdx = headingStart + fmt.updateTextStyle.range.startIndex;
          const endIdx = headingStart + fmt.updateTextStyle.range.endIndex;
          // Only apply if indices are valid
          if (
            endIdx <= headingStart + headingText.text.length &&
            startIdx < endIdx
          ) {
            fmt.updateTextStyle.range.startIndex = startIdx;
            fmt.updateTextStyle.range.endIndex = endIdx;
            requests.push(fmt);
          }
        });
      }

      currentIndex = headingEnd + 1;
      break;

    case "paragraph":
      // Skip empty paragraphs
      if (!token.text || !token.text.trim()) {
        break;
      }

      // Use token.text directly - it already has the correct markdown formatting
      // Reconstructing from tokens can introduce errors
      const paraText = inlineMarkdownToText(token.text);

      const paraStart = currentIndex;
      requests.push({
        insertText: {
          location: { index: currentIndex },
          text: paraText.text + "\n",
        },
      });

      // Apply inline formatting (validate indices first)
      if (paraText.formatting && paraText.formatting.length > 0) {
        paraText.formatting.forEach((fmt) => {
          const startIdx = paraStart + fmt.updateTextStyle.range.startIndex;
          const endIdx = paraStart + fmt.updateTextStyle.range.endIndex;
          // Only apply if indices are valid
          if (endIdx <= paraStart + paraText.text.length && startIdx < endIdx) {
            fmt.updateTextStyle.range.startIndex = startIdx;
            fmt.updateTextStyle.range.endIndex = endIdx;
            requests.push(fmt);
          }
        });
      }

      currentIndex += paraText.text.length + 1;
      break;

    case "list":
      token.items.forEach((item, idx) => {
        // Handle list items - item.text might be a string or tokens
        let itemText;
        if (typeof item.text === "string") {
          itemText = inlineMarkdownToText(item.text);
        } else if (item.tokens) {
          // If it's tokens, convert them to text
          const text = item.tokens.map((t) => t.raw || t.text || "").join("");
          itemText = inlineMarkdownToText(text);
        } else {
          itemText = { text: "", formatting: [] };
        }

        const itemStart = currentIndex;
        const prefix = token.ordered ? `${idx + 1}. ` : "• ";
        requests.push({
          insertText: {
            location: { index: currentIndex },
            text: prefix + itemText.text + "\n",
          },
        });

        // Apply formatting (validate indices)
        if (itemText.formatting && itemText.formatting.length > 0) {
          itemText.formatting.forEach((fmt) => {
            const startIdx =
              itemStart + prefix.length + fmt.updateTextStyle.range.startIndex;
            const endIdx =
              itemStart + prefix.length + fmt.updateTextStyle.range.endIndex;
            // Only apply if indices are valid
            if (
              endIdx <= itemStart + (prefix + itemText.text).length &&
              startIdx < endIdx
            ) {
              fmt.updateTextStyle.range.startIndex = startIdx;
              fmt.updateTextStyle.range.endIndex = endIdx;
              requests.push(fmt);
            }
          });
        }

        // Add visual spacing below list items for readability
        requests.push({
          updateParagraphStyle: {
            range: {
              startIndex: itemStart,
              endIndex: itemStart + (prefix + itemText.text).length,
            },
            paragraphStyle: {
              spaceBelow: { magnitude: 4, unit: "PT" },
            },
            fields: "spaceBelow",
          },
        });

        currentIndex += (prefix + itemText.text + "\n").length;
      });
      break;

    case "hr":
      // Horizontal rule
      requests.push({
        insertText: { location: { index: currentIndex }, text: "\n" },
      });
      const hrStart = currentIndex;
      currentIndex += 1;
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: hrStart, endIndex: currentIndex },
          paragraphStyle: {
            borderBottom: {
              color: {
                color: { rgbColor: { red: 0.8, green: 0.8, blue: 0.8 } },
              },
              width: { magnitude: 1, unit: "PT" },
              padding: { magnitude: 0, unit: "PT" },
              dashStyle: "SOLID",
            },
            spaceBelow: { magnitude: 6, unit: "PT" },
          },
          fields: "borderBottom,spaceBelow",
        },
      });
      break;

    case "code":
      // Code block - format with background and better spacing
      const codeText = token.text;
      const codeStart = currentIndex;

      // Add spacing before code block
      requests.push({
        insertText: { location: { index: currentIndex }, text: "\n" },
      });
      currentIndex += 1;

      requests.push({
        insertText: {
          location: { index: currentIndex },
          text: codeText + "\n",
        },
      });
      const codeEnd = currentIndex + codeText.length;

      // Apply code formatting: smaller font, background color
      requests.push({
        updateTextStyle: {
          range: { startIndex: currentIndex, endIndex: codeEnd },
          textStyle: {
            fontSize: { magnitude: 10, unit: "PT" },
            backgroundColor: {
              color: { rgbColor: { red: 0.95, green: 0.95, blue: 0.95 } },
            },
          },
          fields: "fontSize,backgroundColor",
        },
      });

      // Add paragraph style for code block (indent and padding)
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: currentIndex, endIndex: codeEnd },
          paragraphStyle: {
            indentFirstLine: { magnitude: 12, unit: "PT" },
            indentStart: { magnitude: 12, unit: "PT" },
            spaceAbove: { magnitude: 6, unit: "PT" },
            spaceBelow: { magnitude: 6, unit: "PT" },
          },
          fields: "indentFirstLine,indentStart,spaceAbove,spaceBelow",
        },
      });

      currentIndex = codeEnd + 1;

      // Add spacing after code block
      requests.push({
        insertText: { location: { index: currentIndex }, text: "\n" },
      });
      currentIndex += 1;
      break;

    case "blockquote":
      // Check if this is a D&D stat block
      if (isStatBlock(token)) {
        const statBlockResult = formatStatBlock(token, currentIndex);
        requests.push(...statBlockResult.requests);
        currentIndex = statBlockResult.nextIndex;
        break;
      }

      // Regular blockquote - indent, italicize, and add visual border
      // Collapse multiple newlines to single newlines to avoid massive gaps with paragraph spacing
      const rawText = (token.text || "").replace(/\n\n+/g, "\n");
      let quoteText = inlineMarkdownToText(rawText);

      // Check for Alerts
      let alertType = "DEFAULT";
      const alertMatch = quoteText.text.match(
        /^\[!(NOTE|IMPORTANT|WARNING|CAUTION|TIP)\]\s*/i,
      );

      if (alertMatch) {
        alertType = alertMatch[1].toUpperCase();
        // Remove the alert tag from text
        const tagLength = alertMatch[0].length;
        quoteText.text = quoteText.text.substring(tagLength);

        // Adjust formatting indices
        if (quoteText.formatting) {
          quoteText.formatting.forEach((fmt) => {
            const newStart = Math.max(
              0,
              fmt.updateTextStyle.range.startIndex - tagLength,
            );
            const newEnd = Math.max(
              0,
              fmt.updateTextStyle.range.endIndex - tagLength,
            );
            fmt.updateTextStyle.range.startIndex = newStart;
            fmt.updateTextStyle.range.endIndex = newEnd;
          });
          // Remove formattings that were inside the tag (unlikely but possible)
          quoteText.formatting = quoteText.formatting.filter(
            (fmt) => fmt.updateTextStyle.range.endIndex > 0,
          );
        }
      }

      const quoteStart = currentIndex;

      // Add spacing before quote
      requests.push({
        insertText: { location: { index: currentIndex }, text: "\n" },
      });
      currentIndex += 1;

      requests.push({
        insertText: {
          location: { index: currentIndex },
          text: quoteText.text + "\n",
        },
      });
      const quoteEnd = currentIndex + quoteText.text.length;

      // Define Alert Styles
      const alertStyles = {
        NOTE: {
          bg: { rgbColor: { red: 0.9, green: 0.95, blue: 1.0 } }, // Light Blue
          border: { rgbColor: { red: 0.2, green: 0.4, blue: 0.8 } }, // Blue
        },
        IMPORTANT: {
          bg: { rgbColor: { red: 0.95, green: 0.9, blue: 1.0 } }, // Light Purple
          border: { rgbColor: { red: 0.5, green: 0.2, blue: 0.8 } }, // Purple
        },
        WARNING: {
          bg: { rgbColor: { red: 1.0, green: 0.95, blue: 0.8 } }, // Light Orange
          border: { rgbColor: { red: 0.9, green: 0.6, blue: 0.0 } }, // Orange
        },
        CAUTION: {
          bg: { rgbColor: { red: 1.0, green: 0.9, blue: 0.9 } }, // Light Red
          border: { rgbColor: { red: 0.8, green: 0.2, blue: 0.2 } }, // Red
        },
        TIP: {
          bg: { rgbColor: { red: 0.9, green: 1.0, blue: 0.9 } }, // Light Green
          border: { rgbColor: { red: 0.2, green: 0.6, blue: 0.2 } }, // Green
        },
        DEFAULT: {
          bg: { rgbColor: { red: 0.99, green: 0.99, blue: 0.95 } }, // Parchment (existing)
          border: { rgbColor: { red: 0.8, green: 0.6, blue: 0.2 } }, // Gold
        },
      };

      const style = alertStyles[alertType] || alertStyles.DEFAULT;

      // Apply blockquote style (indent, italic, border, background)
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: currentIndex, endIndex: quoteEnd },
          paragraphStyle: {
            indentFirstLine: { magnitude: 18, unit: "PT" },
            indentStart: { magnitude: 18, unit: "PT" },
            spaceAbove: { magnitude: 6, unit: "PT" },
            spaceBelow: { magnitude: 12, unit: "PT" },
            borderLeft: {
              color: {
                color: style.border,
              },
              width: { magnitude: 3, unit: "PT" },
              padding: { magnitude: 8, unit: "PT" },
              dashStyle: "SOLID",
            },
            shading: {
              backgroundColor: {
                color: style.bg,
              },
            },
          },
          fields:
            "indentFirstLine,indentStart,spaceAbove,spaceBelow,borderLeft,shading",
        },
      });

      // Apply italic, background, and font family to quote text
      // Alerts are not italicized by default (often just normal text), but let's keep italic for "boxed text" feel?
      // Actually, standard Alerts are normal text. D&D Boxed Text is italic.
      // Let's keep Default as Italic, but Alerts as Normal?
      // No, consistent styling is better. Keep italic for all blockquotes as "read this/note this".
      requests.push({
        updateTextStyle: {
          range: { startIndex: currentIndex, endIndex: quoteEnd },
          textStyle: {
            italic: true,
            weightedFontFamily: { fontFamily: "Merriweather", weight: 400 },
          },
          fields: "italic,weightedFontFamily",
        },
      });
      // Apply inline formatting if any (validate indices)
      if (quoteText.formatting && quoteText.formatting.length > 0) {
        quoteText.formatting.forEach((fmt) => {
          const startIdx = quoteStart + fmt.updateTextStyle.range.startIndex;
          const endIdx = quoteStart + fmt.updateTextStyle.range.endIndex;
          // Only apply if indices are valid
          if (
            endIdx <= quoteStart + quoteText.text.length &&
            startIdx < endIdx
          ) {
            fmt.updateTextStyle.range.startIndex = startIdx;
            fmt.updateTextStyle.range.endIndex = endIdx;
            requests.push(fmt);
          }
        });
      }
      currentIndex = quoteEnd + 1;

      // Add spacing after blockquote for visual separation
      requests.push({
        insertText: { location: { index: currentIndex }, text: "\n" },
      });
      currentIndex += 1;
      break;

    case "table":
      // Handle tables - ROBUST MONOSPACE TEXT TABLE STRATEGY
      // Reverts to a "Code Block" style table to guarantee alignment and prevent index errors.
      if (token.header && token.rows) {
        // Configuration
        const MAX_TOTAL_WIDTH = 110; // Increased to 110 chars for better fit (8pt font allows ~112)
        const PADDING = 1; // Reduced padding
        const MIN_COL_WIDTH = 5;

        const cols = token.header.length;

        // 1. Calculate Natural Column Widths
        let colWidths = new Array(cols).fill(0);

        // Helper to get clean text
        const getTxt = (cell) =>
          (inlineMarkdownToText(cell.text || cell).text || "")
            .toString()
            .trim();

        // Check Header
        token.header.forEach((cell, i) => {
          colWidths[i] = Math.max(colWidths[i], getTxt(cell).length);
        });

        // Check Rows
        token.rows.forEach((row) => {
          row.forEach((cell, i) => {
            if (i < cols) {
              colWidths[i] = Math.max(colWidths[i], getTxt(cell).length);
            }
          });
        });

        // 2. Adjust Widths to Fit Page
        const separatorOverhead = cols * (PADDING * 2 + 1) + 1; // | + padding + |
        const availableForContent = MAX_TOTAL_WIDTH - separatorOverhead;
        const totalNaturalWidth = colWidths.reduce((a, b) => a + b, 0);

        if (totalNaturalWidth > availableForContent) {
          // Need to shrink.
          // Strategy: Proportional reduction with floor
          const scale = availableForContent / totalNaturalWidth;
          colWidths = colWidths.map((w) =>
            Math.max(MIN_COL_WIDTH, Math.floor(w * scale)),
          );

          // Re-check total (rounding might have messed it up)
          // If still too big, brute force reduce biggest
          let currentTotal = colWidths.reduce((a, b) => a + b, 0);
          while (currentTotal > availableForContent) {
            // Find biggest col
            let maxIdx = 0;
            for (let i = 1; i < cols; i++)
              if (colWidths[i] > colWidths[maxIdx]) maxIdx = i;
            colWidths[maxIdx]--;
            currentTotal--;
          }
        }

        const paddedWidths = colWidths.map((w) => w + PADDING * 2);

        // 3. Helper to wrap text
        const wrapText = (text, width) => {
          if (text.length <= width) return [text];
          const words = text.split(" ");
          const lines = [];
          let currentLine = words[0];

          for (let i = 1; i < words.length; i++) {
            if (currentLine.length + 1 + words[i].length <= width) {
              currentLine += " " + words[i];
            } else {
              lines.push(currentLine);
              currentLine = words[i];
            }
          }
          lines.push(currentLine);

          // Hard split if a single word is too long
          return lines.flatMap((line) => {
            if (line.length <= width) return [line];
            const chunked = [];
            for (let i = 0; i < line.length; i += width) {
              chunked.push(line.slice(i, i + width));
            }
            return chunked;
          });
        };

        // 4. Render Table
        let tableText = "";

        const renderRow = (cells, isHeader = false) => {
          // Prepare data: array of line-arrays
          const rowData = cells.map((cell, i) => {
            if (i >= cols) return [];
            const txt = getTxt(cell);
            return wrapText(txt, colWidths[i]);
          });

          const maxHeights = Math.max(...rowData.map((r) => r.length));
          let rowOutput = "";

          for (let lineIdx = 0; lineIdx < maxHeights; lineIdx++) {
            let lineStr = "|";
            for (let c = 0; c < cols; c++) {
              const txtLine = rowData[c][lineIdx] || "";
              // Padding
              const space = paddedWidths[c] - txtLine.length - PADDING; // Left padding is PADDING
              // Ensure paddingRight is valid
              const padRight = Math.max(0, space);
              lineStr +=
                " ".repeat(PADDING) + txtLine + " ".repeat(padRight) + "|";
            }
            rowOutput += lineStr + "\n";
          }

          return rowOutput;
        };

        // Header
        tableText += renderRow(token.header, true);

        // Separator
        const separatorCells = paddedWidths.map((w) => "-".repeat(w));
        tableText += "|" + separatorCells.join("|") + "|\n";

        // Rows
        token.rows.forEach((row) => {
          tableText += renderRow(row);
        });

        // Insert
        requests.push({
          insertText: {
            location: { index: currentIndex },
            text: "\n" + tableText + "\n",
          },
        });

        const tableStart = currentIndex + 1;
        const tableEnd = tableStart + tableText.length;

        // Stylize
        requests.push({
          updateTextStyle: {
            range: { startIndex: tableStart, endIndex: tableEnd },
            textStyle: {
              weightedFontFamily: { fontFamily: "Roboto Mono", weight: 400 },
              fontSize: { magnitude: 8, unit: "PT" }, // Reduced to 8pt
              backgroundColor: {
                color: { rgbColor: { red: 0.95, green: 0.95, blue: 0.95 } },
              },
            },
            fields: "weightedFontFamily,fontSize,backgroundColor",
          },
        });

        requests.push({
          updateParagraphStyle: {
            range: { startIndex: tableStart, endIndex: tableEnd },
            paragraphStyle: {
              lineSpacing: 100,
              spaceAbove: { magnitude: 0, unit: "PT" },
              spaceBelow: { magnitude: 0, unit: "PT" },
            },
            fields: "lineSpacing,spaceAbove,spaceBelow",
          },
        });

        // Update Index
        currentIndex += 1 + tableText.length + 1;
      }
      break;

    case "space":
      // Skip spaces (handled by paragraph breaks)
      break;

    case "pagebreak":
      // Handle explicit page breaks - REPLACED WITH HORIZONTAL RULE for iPad/Digital reading
      // User requested no page breaks, so we insert a visual separator instead.

      // Add a small spacer
      requests.push({
        insertText: { location: { index: currentIndex }, text: "\n" },
      });
      currentIndex += 1;

      // Insert a separator line (using a paragraph border)
      const pbStart = currentIndex;
      requests.push({
        insertText: { location: { index: currentIndex }, text: "\n" },
      });
      currentIndex += 1;

      requests.push({
        updateParagraphStyle: {
          range: { startIndex: pbStart, endIndex: currentIndex },
          paragraphStyle: {
            borderBottom: {
              color: {
                color: { rgbColor: { red: 0.6, green: 0.6, blue: 0.6 } },
              },
              width: { magnitude: 1.5, unit: "PT" }, // Slightly thicker than normal HR
              padding: { magnitude: 0, unit: "PT" },
              dashStyle: "DASH", // Dashed line to distinguish from normal HR
            },
            spaceAbove: { magnitude: 12, unit: "PT" },
            spaceBelow: { magnitude: 12, unit: "PT" },
          },
          fields: "borderBottom,spaceAbove,spaceBelow",
        },
      });
      break;

    default:
      // For unknown tokens, try to extract text
      if (token.text) {
        const text = inlineMarkdownToText(token.text);
        requests.push({
          insertText: {
            location: { index: currentIndex },
            text: text.text + "\n",
          },
        });
        currentIndex += text.text.length + 1;
      }
  }

  return { requests, nextIndex: currentIndex };
}

module.exports = {
  markdownToGoogleDocsRequests,
};
