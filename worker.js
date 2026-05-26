export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const body = await request.json();

      // Special handler: if action = 'parse_url', fetch the page first
      if (body.action === 'parse_url') {
        const pageResp = await fetch(body.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'ru-RU,ru;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          }
        });

        const html = await pageResp.text();

        // Strip HTML tags and collapse whitespace for a clean text payload
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 12000); // keep within token limits

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`;

        const geminiBody = {
          contents: [{
            role: 'user',
            parts: [{ text: `You are a real estate listing parser. Extract property details from this realt.by page text and return ONLY valid JSON with these fields: type (string, e.g. "3-комнатная квартира"), price (string, e.g. "205 000 $"), area (string, e.g. "122.1"), floor (string, e.g. "5 / 12"), address (string, full address in Russian), features (string, comma-separated key features in Russian), description (string, 1-2 sentence summary in Russian). No markdown, no explanation, only raw JSON.\n\nPage content:\n${text}` }]
          }],
          generationConfig: { maxOutputTokens: 800, temperature: 0.1 }
        };

        const geminiResp = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiBody),
        });

        const geminiData = await geminiResp.json();
        const resultText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

        return new Response(JSON.stringify({
          content: [{ type: 'text', text: resultText }]
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      // Default handler: forward to Gemini for post generation
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`;

      const geminiBody = {
        contents: body.messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        })),
        systemInstruction: body.system ? { parts: [{ text: body.system }] } : undefined,
        generationConfig: {
          maxOutputTokens: body.max_tokens || 2000,
          temperature: 0.8,
        }
      };

      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      });

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      return new Response(JSON.stringify({
        content: [{ type: 'text', text }]
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};
