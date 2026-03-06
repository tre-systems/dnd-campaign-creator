/**
 * AI Service for Image Generation
 *
 * Handles retries, exponential backoff, and throttling for AI services.
 */

const { setTimeout } = require("timers/promises");

class AIService {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 5;
    this.initialDelay = options.initialDelay || 2000; // 2 seconds
    this.throttleDelay = options.throttleDelay || 5000; // 5 seconds between successful calls
    this.lastCallTime = 0;
  }

  /**
   * Throttling mechanism to avoid hitting rate limits too fast
   */
  async _waitforThrottle() {
    const now = Date.now();
    const elapsed = now - this.lastCallTime;
    if (elapsed < this.throttleDelay) {
      const wait = this.throttleDelay - elapsed;
      await setTimeout(wait);
    }
  }

  /**
   * Generic generation wrapper with retry logic
   *
   * @param {Function} generationFn - The actual API call function
   * @returns {Promise<any>}
   */
  async withRetry(generationFn) {
    let lastError;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        await this._waitforThrottle();

        const result = await generationFn();
        this.lastCallTime = Date.now();
        return result;
      } catch (error) {
        lastError = error;

        // Check if it's a retryable error (429, 503, or network issues)
        const status =
          error.status || (error.response && error.response.status);
        const isRetryable = status === 429 || status === 503 || !status;

        if (!isRetryable || attempt === this.maxRetries) {
          throw error;
        }

        const delay = this.initialDelay * Math.pow(2, attempt);
        console.warn(
          `   ⚠️ AI Service Error (${status}): ${error.message}. Retrying in ${delay / 1000}s... (Attempt ${attempt + 1}/${this.maxRetries})`,
        );
        await setTimeout(delay);
      }
    }

    throw lastError;
  }

  /**
   * Placeholder for actual image generation.
   * Callers must wire a real provider into this module before using
   * `sync-assets --generate`.
   *
   * @param {string} prompt - The final detailed prompt
   * @param {string} savePath - Where to save the image
   */
  async generateImage(prompt, savePath) {
    const error = new Error(
      "AI provider not configured. Implement src/ai-service.js before using sync-assets --generate.",
    );
    error.status = 400;
    error.prompt = prompt;
    error.savePath = savePath;
    throw error;
  }
}

module.exports = { AIService };
