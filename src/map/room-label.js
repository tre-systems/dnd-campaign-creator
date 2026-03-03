/**
 * Convert a zero-based room index to a compact map label.
 * Sequence: 1-9, A-Z, AA, AB, ...
 *
 * @param {number} index - Zero-based room index
 * @returns {string}
 */
function roomLabelFromIndex(index) {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`Room index must be a non-negative integer (got: ${index})`);
  }

  if (index < 9) {
    return String(index + 1);
  }

  let n = index - 9 + 1; // 1 => A
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

module.exports = { roomLabelFromIndex };
