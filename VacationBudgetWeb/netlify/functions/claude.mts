import Anthropic from '@anthropic-ai/sdk';
import type { Handler, HandlerEvent } from '@netlify/functions';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'add_event',
    description: 'Add a new event to the user\'s itinerary calendar. Use this when the user asks you to add, schedule, or plan an activity.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title:       { type: 'string', description: 'Short event title' },
        description: { type: 'string', description: 'Brief description' },
        location:    { type: 'string', description: 'Address or place name' },
        date:        { type: 'string', description: 'Date in YYYY-MM-DD format' },
        startTime:   { type: 'string', description: 'Start time in HH:MM 24-hour format' },
        endTime:     { type: 'string', description: 'End time in HH:MM 24-hour format' },
      },
      required: ['title', 'date', 'startTime', 'endTime'],
    },
  },
  {
    name: 'update_event',
    description: 'Update an existing event in the user\'s itinerary. Use this when the user asks to edit, change, move, or modify an existing activity. You must use the exact event ID from the calendar.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id:          { type: 'string', description: 'The exact ID of the event to update' },
        title:       { type: 'string' },
        description: { type: 'string' },
        location:    { type: 'string' },
        date:        { type: 'string', description: 'YYYY-MM-DD' },
        startTime:   { type: 'string', description: 'HH:MM 24-hour' },
        endTime:     { type: 'string', description: 'HH:MM 24-hour' },
      },
      required: ['id'],
    },
  },
];

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { messages, destination, tripName, events = [], selectedDate } = JSON.parse(event.body ?? '{}');

    if (!messages || !Array.isArray(messages)) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'messages array required' }) };
    }

    const eventsContext = events.length > 0
      ? `\n\nCurrent calendar events (use these IDs for updates):\n${events.map((e: any) =>
          `- ID:${e.id} | ${e.date} ${e.startTime}-${e.endTime} | "${e.title}"${e.location ? ` @ ${e.location}` : ''}`
        ).join('\n')}`
      : '\n\nThe calendar is currently empty.';

    const systemPrompt = [
      'You are a friendly, knowledgeable travel planning assistant with the ability to add and edit events on the user\'s itinerary calendar.',
      destination ? `The user is planning a trip to ${destination}${tripName ? ` called "${tripName}"` : ''}.` : '',
      selectedDate ? `The user is currently viewing ${selectedDate} on their calendar.` : '',
      'Help them plan activities, find restaurants, discover attractions, and get travel tips.',
      'When the user asks to add, schedule, or book an activity — use the add_event tool.',
      'When the user asks to edit, change, reschedule, or modify an existing event — use the update_event tool with the exact event ID.',
      'You may call multiple tools in one response to add several events at once.',
      'After using a tool, briefly confirm what you did in plain text.',
      'For general questions, be concise. Use bullet points for lists. Keep responses under 200 words.',
      eventsContext,
    ].filter(Boolean).join(' ');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });

    let textContent = '';
    const toolCalls: { type: string; id: string; input: Record<string, unknown> }[] = [];

    for (const block of response.content) {
      if (block.type === 'text') textContent += block.text;
      if (block.type === 'tool_use') {
        toolCalls.push({ type: block.name, id: block.id, input: block.input as Record<string, unknown> });
      }
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ content: textContent, toolCalls }),
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
