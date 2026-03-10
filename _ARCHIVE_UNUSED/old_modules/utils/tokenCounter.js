
const { encode } = require('gpt-tokenizer');

/**
 * Count tokens in a text string using GPT tokenizer
 * @param {string} text - The text to count tokens for
 * @returns {number} - Number of tokens
 */
function countTokens(text) {
  if (!text || typeof text !== 'string') {
    return 0;
  }
  
  try {
    const tokens = encode(text);
    return tokens.length;
  } catch (error) {
    console.error('Error counting tokens:', error);
    // Fallback: rough estimate (4 characters per token)
    return Math.ceil(text.length / 4);
  }
}

/**
 * Count tokens for a conversation (messages array)
 * @param {Array} messages - Array of message objects with role and content
 * @returns {number} - Total number of tokens
 */
function countConversationTokens(messages) {
  if (!Array.isArray(messages)) {
    return 0;
  }
  
  let totalTokens = 0;
  
  for (const message of messages) {
    if (message.content) {
      totalTokens += countTokens(message.content);
    }
    // Add extra tokens for message formatting
    totalTokens += 4; // Rough estimate for role and formatting tokens
  }
  
  return totalTokens;
}

module.exports = {
  countTokens,
  countConversationTokens
};
