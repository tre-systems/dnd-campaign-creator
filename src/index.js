"use strict";

const {
  combineAdventureFiles,
  publishAdventure,
  generateMap,
} = require("../bin/campaign-creator");
const { loadConfig } = require("./config");
const { authorize } = require("./auth");
const { createOrUpdateDoc, getMarkdownFiles } = require("./document-manager");
const {
  processImagesAndUpload,
  extractLocalImagePaths,
  generatePrompt,
  syncAdventureAssets,
} = require("./image-manager");
const {
  buildMapPrompt,
  renderMapPromptPacket,
  validateMapPromptSpec,
} = require("./map-prompt");
const { markdownToGoogleDocsRequests } = require("./markdown-converter");
const { inlineMarkdownToText } = require("./markdown-utils");
const {
  isStatBlock,
  formatStatBlock,
  formatStatBlockTable,
  formatStatBlockList,
} = require("./stat-block-formatter");
const { AIService } = require("./ai-service");

module.exports = {
  AIService,
  authorize,
  buildMapPrompt,
  combineAdventureFiles,
  createOrUpdateDoc,
  extractLocalImagePaths,
  formatStatBlock,
  formatStatBlockList,
  formatStatBlockTable,
  generateMap,
  generatePrompt,
  getMarkdownFiles,
  inlineMarkdownToText,
  isStatBlock,
  loadConfig,
  markdownToGoogleDocsRequests,
  processImagesAndUpload,
  publishAdventure,
  renderMapPromptPacket,
  syncAdventureAssets,
  validateMapPromptSpec,
};
