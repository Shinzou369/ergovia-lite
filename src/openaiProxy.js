const OpenAI = require('openai');

let openaiClient = null;

function initializeOpenAI(apiKey) {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required');
  }
  openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

function getOpenAIClient() {
  if (!openaiClient) {
    throw new Error('OpenAI client not initialized');
  }
  return openaiClient;
}

async function proxyChatCompletion(requestBody, isStreaming = false) {
  const client = getOpenAIClient();

  const completionParams = { ...requestBody };

  if (!completionParams.model) {
    completionParams.model = 'gpt-4.1';
  }

  if (isStreaming) {
    completionParams.stream = true;
    completionParams.stream_options = { include_usage: true };
  }

  const response = await client.chat.completions.create(completionParams);

  return response;
}

const ALLOWED_MODELS = [
  { id: 'gpt-4.1', object: 'model' },
  { id: 'gpt-4.1-mini', object: 'model' },
  { id: 'gpt-4.1-nano', object: 'model' },
  { id: 'gpt-4o', object: 'model' },
  { id: 'gpt-4o-mini', object: 'model' },
  { id: 'gpt-4-turbo', object: 'model' },
  { id: 'gpt-3.5-turbo', object: 'model' }
];

function getModels() {
  return {
    object: 'list',
    data: ALLOWED_MODELS
  };
}

module.exports = {
  initializeOpenAI,
  getOpenAIClient,
  proxyChatCompletion,
  getModels,
  ALLOWED_MODELS
};
