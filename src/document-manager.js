/**
 * Google Docs Document Manager
 *
 * Handles creating, updating, listing, and retrieving Google Docs documents.
 */

const fs = require("fs").promises;
const path = require("path");
const { google } = require("googleapis");
const { markdownToGoogleDocsRequests } = require("./markdown-converter");

/**
 * Create a new Google Doc or update existing one.
 *
 * @param {Object} docsService - Google Docs API service
 * @param {Object} driveService - Google Drive API service
 * @param {string} title - Document title
 * @param {string} content - Markdown content
 * @param {string|null} folderId - Google Drive folder ID (optional)
 * @returns {Promise<string|null>} - Document ID or null on error
 */
async function createOrUpdateDoc(
  docsService,
  driveService,
  title,
  content,
  folderId = null,
  specificDocId = null,
) {
  try {
    let docId = specificDocId;
    if (!docId) {
      // Check if document already exists
      // Escape single quotes in title to prevent query injection
      const escapedTitle = title.replace(/'/g, "\\'");
      const query = `name='${escapedTitle}' and mimeType='application/vnd.google-apps.document'${folderId ? ` and '${folderId}' in parents` : ""}`;
      const files = await driveService.files.list({ q: query });
      if (files.data.files && files.data.files.length > 0) {
        docId = files.data.files[0].id;
      }
    }

    if (docId) {
      // Document exists - update it
      console.log(`  Updating existing document: ${title}`);

      // Get current document to find end index
      const doc = await docsService.documents.get({ documentId: docId });
      const endIndex =
        doc.data.body.content[doc.data.body.content.length - 1].endIndex;

      // Clear existing content (only if there's content to delete)
      if (endIndex > 2) {
        // Need at least 2 characters (start + end markers)
        await docsService.documents.batchUpdate({
          documentId: docId,
          requestBody: {
            requests: [
              {
                deleteContentRange: {
                  range: {
                    startIndex: 1,
                    endIndex: endIndex - 1,
                  },
                },
              },
            ],
          },
        });
      }

      // Set document to pageless format (better for iPad/tablet reading)
      // Use very large page height to simulate pageless mode
      // Note: Google Docs API uses PT (points) not INCH
      // 8.5 inches = 612 points, 11 inches = 792 points
      // Use 10000 points height to effectively make it pageless
      await docsService.documents.batchUpdate({
        documentId: docId,
        requestBody: {
          requests: [
            {
              updateDocumentStyle: {
                documentStyle: {
                  pageSize: {
                    width: { magnitude: 612, unit: "PT" }, // 8.5 inches
                    height: { magnitude: 10000, unit: "PT" }, // Very large = pageless
                  },
                  marginTop: { magnitude: 36, unit: "PT" }, // 0.5 inches
                  marginBottom: { magnitude: 36, unit: "PT" },
                  marginLeft: { magnitude: 36, unit: "PT" },
                  marginRight: { magnitude: 36, unit: "PT" },
                  useFirstPageHeaderFooter: false,
                  pageNumberStart: 1,
                },
                fields:
                  "pageSize,marginTop,marginBottom,marginLeft,marginRight,useFirstPageHeaderFooter,pageNumberStart",
              },
            },
          ],
        },
      });

      // Insert new content
      const requests = markdownToGoogleDocsRequests(content);
      if (requests.length > 0) {
        await docsService.documents.batchUpdate({
          documentId: docId,
          requestBody: { requests },
        });
      }

      return docId;
    } else {
      // Create new document
      console.log(`  Creating new document: ${title}`);
      // Set to pageless format for better tablet/iPad reading
      // Use very large page height to simulate pageless mode
      // Note: Google Docs API uses PT (points) not INCH
      // 8.5 inches = 612 points, use 10000 points height for pageless
      const doc = await docsService.documents.create({
        requestBody: {
          title,
          documentStyle: {
            pageSize: {
              width: { magnitude: 612, unit: "PT" }, // 8.5 inches
              height: { magnitude: 10000, unit: "PT" }, // Very large = pageless
            },
            marginTop: { magnitude: 36, unit: "PT" }, // 0.5 inches
            marginBottom: { magnitude: 36, unit: "PT" },
            marginLeft: { magnitude: 36, unit: "PT" },
            marginRight: { magnitude: 36, unit: "PT" },
            useFirstPageHeaderFooter: false,
            pageNumberStart: 1,
          },
        },
      });
      const docId = doc.data.documentId;

      // Move to folder if specified
      if (folderId) {
        await driveService.files.update({
          fileId: docId,
          addParents: folderId,
          fields: "id, parents",
        });
      }

      // Insert content
      const requests = markdownToGoogleDocsRequests(content);
      if (requests.length > 0) {
        await docsService.documents.batchUpdate({
          documentId: docId,
          requestBody: { requests },
        });
      }

      return docId;
    }
  } catch (error) {
    // Sanitize error message - don't expose full file paths
    const errorMsg = error.message.replace(
      process.env.HOME || process.env.USERPROFILE || "",
      "~",
    );
    console.error(`  Error with ${title}:`, errorMsg);
    return null;
  }
}

/**
 * Get all Markdown files from directory recursively.
 *
 * @param {string} directory - Directory to search
 * @param {string} baseDir - Base directory for relative paths (optional)
 * @returns {Promise<Array<string>>} - Array of file paths
 */
async function getMarkdownFiles(directory, baseDir = null) {
  const files = [];
  const base = baseDir || directory;

  async function walkDir(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await walkDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        // Include all .md files
        files.push(fullPath);
      }
    }
  }

  await walkDir(directory);
  return files.sort();
}

/**
 * List all published Sanctum documents in Google Drive.
 *
 * @param {Object} driveService - Google Drive API service
 * @returns {Promise<void>}
 */
async function listDocs(driveService) {
  console.log("📋 Listing Sanctum documents in Google Drive...\n");

  try {
    // Search for documents with Sanctum-related names
    const query =
      "mimeType='application/vnd.google-apps.document' and (name contains 'Sanctum' or name contains 'Terminus' or name contains 'Memory Engine' or name contains 'Forge' or name contains 'Canyon' or name contains 'Spire' or name contains 'Plated Mage' or name contains 'Voice Guide' or name contains 'Campaign Connections' or name contains 'Character Hooks' or name contains 'Dm Guide' or name contains 'Multiple Endings' or name contains 'Npc Relationships' or name contains 'Hex Map')";

    const files = await driveService.files.list({
      q: query,
      fields: "files(id, name, webViewLink, modifiedTime, createdTime)",
      orderBy: "name",
    });

    if (files.data.files && files.data.files.length > 0) {
      console.log(`Found ${files.data.files.length} documents:\n`);
      files.data.files.forEach((file, index) => {
        const modified = file.modifiedTime
          ? new Date(file.modifiedTime).toLocaleDateString()
          : "Unknown";
        console.log(`${index + 1}. ${file.name}`);
        console.log(`   📄 ${file.webViewLink}`);
        console.log(`   📅 Modified: ${modified}\n`);
      });
    } else {
      console.log("No Sanctum documents found in Google Drive.");
    }
  } catch (error) {
    console.error("Error listing documents:", error.message);
  }
}

/**
 * Get document content from Google Docs.
 *
 * @param {Object} docsService - Google Docs API service
 * @param {string} docId - Document ID
 * @returns {Promise<string|null>} - Document text content or null on error
 */
async function getDocContent(docsService, docId) {
  try {
    const doc = await docsService.documents.get({ documentId: docId });

    // Extract text content
    let text = "";
    if (doc.data.body && doc.data.body.content) {
      function extractText(element) {
        if (element.paragraph) {
          const para = element.paragraph;
          if (para.elements) {
            para.elements.forEach((elem) => {
              if (elem.textRun) {
                text += elem.textRun.content;
              }
            });
          }
        } else if (element.table) {
          // Handle tables
          element.table.tableRows.forEach((row) => {
            row.tableCells.forEach((cell) => {
              if (cell.content) {
                cell.content.forEach((cont) => {
                  extractText(cont);
                });
              }
            });
            text += "\n";
          });
        }
      }

      doc.data.body.content.forEach((element) => {
        extractText(element);
      });
    }

    return text;
  } catch (error) {
    console.error("Error getting document content:", error.message);
    return null;
  }
}

/**
 * Process requests, handling special table population duties with separate passes
 * This avoids index calculation errors by:
 * 1. Inserting a marker and empty table
 * 2. Fetching the document to find the EXACT table cell indices
 * 3. Populating the table using those indices
 * 4. Cleaning up the marker
 * 5. Self-Healing: Adjusting subsequent indices based on actual table size
 */
async function processRequestsWithTables(docsService, docId, requests) {
  let batch = [];
  let cumulativeShift = 0;

  // Helper to shift request indices
  const shiftRequest = (req, delta) => {
    if (!req || delta === 0) return;
    ["insertText", "insertTable"].forEach((key) => {
      if (req[key] && req[key].location && req[key].location.index) {
        req[key].location.index += delta;
      }
    });
    ["updateTextStyle", "updateParagraphStyle", "deleteContentRange"].forEach(
      (key) => {
        if (req[key] && req[key].range) {
          if (req[key].range.startIndex) req[key].range.startIndex += delta;
          if (req[key].range.endIndex) req[key].range.endIndex += delta;
        }
      },
    );
    ["updateTableCellStyle"].forEach((key) => {
      if (
        req[key] &&
        req[key].tableRange &&
        req[key].tableRange.tableCellLocation &&
        req[key].tableRange.tableCellLocation.tableStartLocation
      ) {
        req[key].tableRange.tableCellLocation.tableStartLocation.index += delta;
      }
    });
  };

  for (let i = 0; i < requests.length; i++) {
    const req = requests[i];

    // Apply existing shift
    shiftRequest(req, cumulativeShift);

    if (req._custom_populate_table) {
      // 1. Execute accumulated batch (includes Marker and Table Structure)
      if (batch.length > 0) {
        await docsService.documents.batchUpdate({
          documentId: docId,
          requestBody: { requests: batch },
        });
        batch = [];
      }

      console.log("    Processing table via multi-pass...");

      // 2. Fetch Document to find the Table
      const doc = await docsService.documents.get({ documentId: docId });
      const content = doc.data.body.content;

      // Find Marker
      const markerText = req._custom_populate_table.marker;
      let markerIndex = -1;
      let table = null;
      let tableIndex = -1;

      // Deep search for marker
      for (let j = 0; j < content.length; j++) {
        const element = content[j];
        if (element.paragraph && element.paragraph.elements) {
          for (const el of element.paragraph.elements) {
            if (
              el.textRun &&
              el.textRun.content &&
              el.textRun.content.includes(markerText)
            ) {
              markerIndex = el.startIndex;
              // Table is expected to be the NEXT structural element (j+1)
              if (j + 1 < content.length && content[j + 1].table) {
                table = content[j + 1].table;
                tableIndex = j + 1;
              }
              break;
            }
          }
        }
        if (table) break;
      }

      if (table) {
        // 3. Generate Populate Requests using ACTUAL indices
        const populateBatch = [];
        const data = req._custom_populate_table.data;
        const cols = req._custom_populate_table.cols;

        data.sort((a, b) => {
          // Reverse sort R then C
          if (a.r !== b.r) return b.r - a.r;
          return b.c - a.c;
        });

        for (const cell of data) {
          if (cell.r < table.tableRows.length) {
            const row = table.tableRows[cell.r];
            if (cell.c < row.tableCells.length) {
              const tableCell = row.tableCells[cell.c];
              const insertIdx = tableCell.startIndex + 1;

              populateBatch.push({
                insertText: {
                  location: { index: insertIdx },
                  text: cell.text,
                },
              });

              const style = cell.isHeader
                ? {
                    bold: true,
                    fontSize: { magnitude: 10, unit: "PT" },
                    weightedFontFamily: { fontFamily: "Roboto", weight: 700 },
                  }
                : {
                    fontSize: { magnitude: 10, unit: "PT" },
                    weightedFontFamily: { fontFamily: "Roboto", weight: 400 },
                  };

              populateBatch.push({
                updateTextStyle: {
                  range: {
                    startIndex: insertIdx,
                    endIndex: insertIdx + cell.text.length,
                  },
                  textStyle: style,
                  fields: "bold,fontSize,weightedFontFamily",
                },
              });
            }
          }
        }

        // Style Header Background
        populateBatch.push({
          updateTableCellStyle: {
            tableRange: {
              tableCellLocation: {
                tableStartLocation: { index: table.startIndex },
                rowIndex: 0,
                columnIndex: 0,
              },
              rowSpan: 1,
              columnSpan: cols,
            },
            tableCellStyle: {
              backgroundColor: {
                color: { rgbColor: { red: 0.9, green: 0.9, blue: 0.9 } },
              },
            },
            fields: "backgroundColor",
          },
        });

        // 4. Delete Marker
        populateBatch.push({
          deleteContentRange: {
            range: {
              startIndex: markerIndex,
              endIndex: markerIndex + markerText.length + 1, // +1 for newline often attached
            },
          },
        });

        // Execute Populate
        if (populateBatch.length > 0) {
          await docsService.documents.batchUpdate({
            documentId: docId,
            requestBody: { requests: populateBatch },
          });
        }

        // 5. SELF-HEALING INDICES
        // The table and content are now final.
        // We need to calculate how much the indices shifted compared to what the NEXT request expects.
        // Current State: Table is populated. Marker is deleted.

        // Get updated doc state? Or estimate?
        // Populating text shifts indices recursively.
        // Deleting marker shifts indices back.

        // Simplest way: Fetch doc AGAIN to get the reliable "End of Table" index.
        // This is expensive but failsafe.
        const docAfter = await docsService.documents.get({ documentId: docId });
        // We need to find where we are.
        // The table we just processed is at table.startIndex?
        // No, marker deletion might have shifted it.
        // Assuming Marker was BEFORE table, deletion shifts table left.
        // We can just find the table again? No marker now.
        // We can find by "Index near where it was".
        // OR, simpler:
        // We know the NEXT request in the queue (requests[i+1]) expects to insert text at some index `X`.
        // That index `X` corresponds to "After the table".
        // In the ACTUAL doc, "After the table" is `table.endIndex` (from the new fetch).
        // So valid index is `table.endIndex + 1` (newline).

        // Let's find the table again in `docAfter`.
        // It's the table at roughly `table.startIndex - markerLength`.
        const approxIndex = table.startIndex - markerText.length - 10;
        let foundTable = null;
        for (const el of docAfter.data.body.content) {
          if (el.table && el.startIndex >= approxIndex) {
            foundTable = el;
            break;
          }
        }

        if (foundTable && i + 1 < requests.length) {
          // Check next request's expected index
          const nextReq = requests[i + 1];
          let expectedIndex = -1;
          if (nextReq.insertText && nextReq.insertText.location)
            expectedIndex = nextReq.insertText.location.index;
          else if (nextReq.insertTable)
            expectedIndex = nextReq.insertTable.location.index;

          if (expectedIndex !== -1) {
            const actualIndex = foundTable.endIndex + 1; // +1 for safety spacing
            const delta = actualIndex - expectedIndex;
            // console.log(`    Self-Healing: Shift ${delta} (Exp: ${expectedIndex}, Act: ${actualIndex})`);
            cumulativeShift += delta;
          }
        }
      } else {
        console.warn(
          `    Warning: Could not find table marker '${markerText}'. content length: ${content.length}`,
        );
        // Dump content snippets to debug
        // content.forEach((c, idx) => { if(c.paragraph) console.log(idx, c.startIndex, c.paragraph.elements.map(e=>e.textRun?.content).join('').trim().substring(0, 20))});
      }
    } else {
      batch.push(req);
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    await docsService.documents.batchUpdate({
      documentId: docId,
      requestBody: { requests: batch },
    });
  }
}

module.exports = {
  createOrUpdateDoc,
  getMarkdownFiles,
  listDocs,
  getDocContent,
};
