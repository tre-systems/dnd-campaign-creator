/**
 * Shared utilities for Markdown to Google Docs conversion
 */

const { marked } = require("marked");

function buildTextStyleRequest(startIndex, endIndex, textStyle, fields) {
  return {
    updateTextStyle: {
      range: { startIndex, endIndex },
      textStyle,
      fields,
    },
  };
}

function applyActiveStyles(formatting, startIndex, endIndex, activeStyles) {
  if (startIndex >= endIndex) {
    return;
  }

  if (activeStyles.bold) {
    formatting.push(
      buildTextStyleRequest(startIndex, endIndex, { bold: true }, "bold"),
    );
  }

  if (activeStyles.italic) {
    formatting.push(
      buildTextStyleRequest(startIndex, endIndex, { italic: true }, "italic"),
    );
  }

  if (activeStyles.code) {
    formatting.push(
      buildTextStyleRequest(
        startIndex,
        endIndex,
        {
          fontSize: { magnitude: 10, unit: "PT" },
          backgroundColor: {
            color: { rgbColor: { red: 0.95, green: 0.95, blue: 0.95 } },
          },
        },
        "fontSize,backgroundColor",
      ),
    );
  }

  if (activeStyles.link) {
    formatting.push(
      buildTextStyleRequest(
        startIndex,
        endIndex,
        {
          link: { url: activeStyles.link },
          foregroundColor: {
            color: { rgbColor: { red: 0.06, green: 0.33, blue: 0.8 } },
          },
          underline: true,
        },
        "link,foregroundColor,underline",
      ),
    );
  }

  if (activeStyles.strikethrough) {
    formatting.push(
      buildTextStyleRequest(
        startIndex,
        endIndex,
        { strikethrough: true },
        "strikethrough",
      ),
    );
  }
}

function appendInlineTokens(tokens, state) {
  const formatting = [];
  let text = "";

  function appendText(chunk, activeStyles) {
    if (!chunk) {
      return;
    }

    const startIndex = text.length;
    text += chunk;
    applyActiveStyles(formatting, startIndex, text.length, activeStyles);
  }

  function visit(token, inheritedStyles) {
    if (!token) {
      return;
    }

    switch (token.type) {
      case "text":
      case "escape":
      case "html":
        appendText(token.text || token.raw || "", inheritedStyles);
        break;
      case "strong":
        walk(token.tokens, { ...inheritedStyles, bold: true });
        break;
      case "em":
        walk(token.tokens, { ...inheritedStyles, italic: true });
        break;
      case "codespan":
        appendText(token.text || "", { ...inheritedStyles, code: true });
        break;
      case "link":
        walk(token.tokens, { ...inheritedStyles, link: token.href });
        break;
      case "del":
        walk(token.tokens, { ...inheritedStyles, strikethrough: true });
        break;
      case "image":
        appendText(token.text || "", inheritedStyles);
        break;
      case "br":
        appendText("\n", inheritedStyles);
        break;
      default:
        if (Array.isArray(token.tokens) && token.tokens.length > 0) {
          walk(token.tokens, inheritedStyles);
        } else {
          appendText(token.text || token.raw || "", inheritedStyles);
        }
        break;
    }
  }

  function walk(nestedTokens, inheritedStyles) {
    for (const token of nestedTokens || []) {
      visit(token, inheritedStyles);
    }
  }

  walk(tokens, state);
  return { text, formatting };
}

/**
 * Convert inline Markdown (bold, italic, code, etc.) to plain text with formatting requests.
 *
 * @param {string} text - Text containing inline Markdown
 * @returns {{text: string, formatting: Array}} - Plain text and formatting requests
 */
function inlineMarkdownToText(text) {
  if (!text) return { text: "", formatting: [] };
  return appendInlineTokens(marked.Lexer.lexInline(text), {});
}

module.exports = {
  inlineMarkdownToText,
};
