import OpenAI from 'openai';
import { readFileSync } from 'fs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are a structured data extractor for quiz event announcements.

Extract the following fields from the message and/or poster image. Return ONLY valid JSON, no commentary.

{
  "name": "Quiz name/title",
  "description": "A well-formatted markdown description of the event. Use **bold** for emphasis, bullet points for lists.",
  "date": "YYYY-MM-DD format or null if not found",
  "time": "HH:MM format (24h) or descriptive like '2 PM' or null",
  "venue": "Full venue name and address or null",
  "venueMapLink": "Google Maps link if mentioned, or null",
  "eligibility": ["Human-readable eligibility as mentioned, e.g. 'Open to all', 'Under 23', 'UG Students only'"],
  "eligibilityCategories": ["Normalized categories from ONLY this fixed set: 'Open', 'U18', 'U23', 'U25', 'U30', 'UG', 'PG', 'Research', 'DU Only'. Pick all that apply. Empty array if unclear."],
  "teamSize": "Maximum team size as a number (1 for solo-only, 2 for pairs, 3 for trios). null if not mentioned.",
  "crossCollege": "true if cross-college/cross-institution teams are explicitly allowed, false if restricted to one college, null if not mentioned",
  "mode": "One of: 'offline' (physical venue), 'online' (Zoom/Meet/virtual), 'hybrid' (both online and offline components). Default to 'offline' if a physical venue is mentioned.",
  "hostingOrg": "Organization hosting the quiz or null",
  "quizMasters": ["Array of quiz master names, empty array if not mentioned"],
  "poc": {
    "name": "Contact person name or null",
    "phone": "Phone number or null",
    "whatsapp": "WhatsApp number if separately mentioned. If only one phone number is found and no separate WhatsApp is listed, set whatsapp to that same phone number."
  },
  "regLink": "Registration link or null",
  "instagramLink": "Instagram link or null",
  "city": "City where the quiz is happening. Infer from venue, college/university, organizer, or any location clues. Return the commonly used English city name (e.g., Delhi, Bangalore, Kolkata, Pune, Hyderabad, Indore). You may return ANY Indian city. For Delhi NCR areas (Noida, Gurgaon, Gurugram), return 'Delhi'. For Bengaluru, return 'Bangalore'. Return null if online-only or if the city truly cannot be determined.",
  "confidence": 0.85,
  "extractedFields": ["list", "of", "fields", "that", "were", "actually", "found"]
}

Rules:
- confidence: 0.0-1.0 based on how much information you could extract. Below 0.5 if only name found. Above 0.8 if most fields found.
- extractedFields: only list fields where you found actual data, not nulls.
- eligibility: The raw human-readable text as written in the announcement.
- eligibilityCategories: Pick from ONLY these values: Open, U18, U23, U25, U30, UG, PG, Research, DU Only. If "Under 23" or "U-23" -> "U23". If "open to all" -> "Open". If "UG students" -> "UG". Apply all that match. Empty array if nothing matches.
- teamSize: Extract from phrases like "team of 2", "lone wolf", "solo", "teams of 3", "1 to 3 members". Return the maximum allowed team size as a number.
- crossCollege: Look for "cross-college", "inter-college", "cross institution", "open to all colleges".
- mode: "offline" if there's a physical venue/college/room. "online" if Zoom/Meet/virtual/online-only. "hybrid" if both. Default to "offline" when a venue is present.
- city: Infer the city from venue address, college/university name, organizer name, or any location clues. Return the commonly used English name. Normalize: Delhi NCR (Noida/Gurgaon/Gurugram/Faridabad) → "Delhi", Bengaluru → "Bangalore", Bombay → "Mumbai", Madras → "Chennai", Calcutta → "Kolkata". You may return ANY Indian city. If online-only (Zoom/Meet/virtual), set city to null. If you truly cannot determine the city, set to null. Do NOT assume the city from the source — infer it from the content.
- For dates, use the current year (2026) if only month/day mentioned.
- Return ONLY the JSON object, nothing else.`;

export async function extractQuizFromMessage(captionText, imagePath, sourceContext) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  const userContent = [];

  // Source context helps GPT but should NOT bias city extraction
  if (sourceContext) {
    const src = sourceContext;
    userContent.push({
      type: 'text',
      text: `Source: ${src.name}${src.city ? ` (${src.city})` : ''} on ${src.platform}. Note: the quiz may be about an event in a different city than the source.`,
    });
  }

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
    model: 'gpt-4o',
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

  return raw;
}
