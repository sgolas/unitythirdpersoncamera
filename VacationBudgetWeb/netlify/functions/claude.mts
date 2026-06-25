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
    description: 'Add a new event to the user\'s itinerary calendar. Use this when the user asks to add, schedule, or plan an activity.',
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
    description: 'Update an existing event in the user\'s itinerary. Use this when the user asks to edit, change, or modify an existing activity.',
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
    const body = JSON.parse(event.body ?? '{}');
    const {
      messages, destination, tripName,
      events = [], selectedDate,
      expenses = [], budget: budgetInfo,
      findPlaces,
    } = body;

    // ── Find Places mode ──────────────────────────────────────────────
    if (findPlaces) {
      const { category, query } = findPlaces;
      const locationHint = destination ? ` near ${destination}` : '';
      const prompt = `You are a travel concierge. The user is looking for a ${category} place${locationHint}.
Their search: "${query}"

Return ONLY a raw JSON array (no markdown, no code fences, no explanation) with 4-5 results:
[{"name":"Place Name","address":"Full street address, city","description":"One sentence why it's great"}]`;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]';
      // Strip any accidental markdown fences
      const clean = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ suggestions: JSON.parse(clean) }),
      };
    }

    // ── Chat mode ─────────────────────────────────────────────────────
    if (!messages || !Array.isArray(messages)) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'messages array required' }) };
    }

    // Build budget context
    const totalSpent = expenses.reduce((s: number, e: any) => s + (e.amount ?? 0), 0);
    const remaining  = (budgetInfo?.totalAmount ?? 0) - totalSpent;
    const currency   = budgetInfo?.currency ?? 'USD';

    const budgetContext = budgetInfo?.totalAmount > 0
      ? `\n\nBudget overview: ${currency} ${budgetInfo.totalAmount.toFixed(2)} total | ${currency} ${totalSpent.toFixed(2)} spent | ${currency} ${remaining.toFixed(2)} remaining.`
      : '';

    const expensesContext = expenses.length > 0
      ? `\nRecent expenses:\n${expenses.slice(-15).map((e: any) =>
          `- ${e.name}: ${currency} ${e.amount?.toFixed(2)} (${e.category}${e.location ? `, ${e.location}` : ''})`
        ).join('\n')}`
      : '';

    const eventsContext = events.length > 0
      ? `\n\nCalendar events (use IDs to update):\n${events.map((e: any) =>
          `- ID:${e.id} | ${e.date} ${e.startTime}-${e.endTime} | "${e.title}"${e.location ? ` @ ${e.location}` : ''}`
        ).join('\n')}`
      : '\n\nThe calendar is currently empty.';

    const systemPrompt = [
      'You are a friendly, knowledgeable travel planning assistant with full access to the user\'s trip budget and itinerary calendar.',
      destination ? `The user is planning a trip to ${destination}${tripName ? ` called "${tripName}"` : ''}.` : '',
      selectedDate ? `The user is currently viewing ${selectedDate} on their calendar.` : '',
      'Help them plan activities, find restaurants, discover attractions, manage their budget, and get travel tips.',
      'When the user asks to add or schedule an activity — use the add_event tool.',
      'When the user asks to edit, move, or change an existing event — use the update_event tool with the exact ID.',
      'You may call multiple tools in one response.',
      'After using a tool, briefly confirm what you did in plain text.',
      'For general questions, be concise and practical. Use bullet points for lists. Keep responses under 250 words.',
      budgetContext,
      expensesContext,
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
