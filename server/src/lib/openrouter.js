// src/lib/openrouter.js
import 'dotenv/config';

const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-exp:free';
const BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function callOpenRouter(systemPrompt, userPrompt, options = {}) {
  if (!API_KEY) throw new Error('OPENROUTER_API_KEY is not set in .env');

  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 4000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}