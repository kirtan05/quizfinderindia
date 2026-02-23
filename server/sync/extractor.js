import OpenAI from 'openai';
import { readFileSync } from 'fs';
import { normalizeEligibility } from '../utils/eligibility.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are a structured data extractor for quiz event announcements from Delhi quiz clubs.

Extract the following fields from the message and/or poster image. Return ONLY valid JSON, no commentary.

{
  "name": "Quiz name/title",
  "description": "A well-formatted markdown description of the event. Use **bold** for emphasis, bullet points for lists.",
  "date": "YYYY-MM-DD format or null if not found",
  "time": "HH:MM format (24h) or descriptive like '2 PM' or null",
  "venue": "Full venue name and address or null",
  "venueMapLink": "Google Maps link if mentioned, or null",
  "eligibility": ["Array of eligibility criteria as mentioned, e.g. 'Open', 'U23', 'UG', 'DU Only'"],
  "hostingOrg": "Organization hosting the quiz or null",
  "quizMasters": ["Array of quiz master names, empty array if not mentioned"],
  "poc": {
    "name": "Contact person name or null",
    "phone": "Phone number or null",
    "whatsapp": "WhatsApp number or null"
  },
  "regLink": "Registration link or null",
  "instagramLink": "Instagram link or null",
  "confidence": 0.85,
  "extractedFields": ["list", "of", "fields", "that", "were", "actually", "found"]
}

Rules:
- confidence: 0.0-1.0 based on how much information you could extract. Below 0.5 if only name found. Above 0.8 if most fields found.
- extractedFields: only list fields where you found actual data, not nulls.
- eligibility is critical: look for age limits (U23, Under 25), degree (UG, PG), university restrictions (DU Only), or Open/anyone.
- For dates, use the current year (2026) if only month/day mentioned.
- Return ONLY the JSON object, nothing else.`;

export async function extractQuizFromMessage(captionText, imagePath) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  const userContent = [];

  if (imagePath) {
    const imageBuffer = readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    userContent.push({
      type: 'image_url',
      image_url: {
        url: `data:${mimeType};base64,${base64Image}`,
        detail: 'high',
      },
    });
  }

  if (captionText) {
    userContent.push({
      type: 'text',
      text: `WhatsApp message caption:\n\n${captionText}`,
    });
  }

  if (userContent.length === 0) return null;

  messages.push({ role: 'user', content: userContent });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    max_tokens: 1000,
    temperature: 0.1,
    response_format: { type: 'json_object' },
  });

  if (!response.choices || response.choices.length === 0) {
    throw new Error('OpenAI returned no choices');
  }

  let raw;
  try {
    raw = JSON.parse(response.choices[0].message.content);
  } catch (parseErr) {
    throw new Error(`Failed to parse OpenAI response as JSON: ${parseErr.message}`);
  }

  return {
    ...raw,
    eligibilityCategories: normalizeEligibility(raw.eligibility),
  };
}
