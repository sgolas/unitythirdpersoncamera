import Anthropic from '@anthropic-ai/sdk';
import type { Handler, HandlerEvent } from '@netlify/functions';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { messages, destination, tripName } = JSON.parse(event.body ?? '{}');

    if (!messages || !Array.isArray(messages)) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'messages array required' }) };
    }

    const systemPrompt = [
      `You are a friendly, knowledgeable travel planning assistant.`,
      destination ? `The user is planning a trip to ${destination}${tripName ? ` called "${tripName}"` : ''}.` : '',
      `Help them plan activities, find restaurants, discover attractions, and get travel tips.`,
      `Be concise and practical. Use bullet points for lists. Limit responses to 200 words.`,
      `When suggesting activities, include approximate duration and location when relevant.`,
    ].filter(Boolean).join(' ');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response type');

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ content: content.text }),
    };
  } catch (err) {
    console.error('Claude function error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to get AI response. Check your API key.' }),
    };
  }
};
