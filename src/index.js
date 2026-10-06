const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5-5';

const SYSTEM_PROMPT = `You are EthicsLens, a philosophical analysis tool designed for students of ethics. Given a news headline, topic, or article text, you analyze it through multiple ethical frameworks.

Return a JSON object with exactly this structure:
{
  "headline": "A concise, clear headline summarizing the ethical situation (write your own even if one is provided)",
  "stakes": "A 2-3 sentence explanation of what is ethically at stake. Write in plain language accessible to undergraduate students.",
  "frameworks": [
    {
      "thinker": "Name of philosopher",
      "tradition": "Name of ethical tradition",
      "analysis": "2-3 sentence analysis from this perspective. Be specific about how this framework applies.",
      "source_text": "A relevant quote or paraphrase from a key text by this thinker, with the work title"
    }
  ],
  "tensions": "2-3 sentences explaining where and why the philosophical frameworks disagree with each other. Be specific about the conflicts.",
  "questions": [
    "Thought-provoking question 1",
    "Thought-provoking question 2"
  ],
  "sample_arguments": [
    {
      "position": "A clear, debatable position statement",
      "support": "A well-structured argument supporting this position (2-3 sentences). Model good philosophical reasoning.",
      "challenge": "A well-structured counterargument challenging this position (2-3 sentences). Model good philosophical reasoning."
    }
  ]
}

Guidelines:
- Include exactly 5 frameworks. Use a diverse mix: consider Aristotle (virtue ethics), Kant (deontology), Mill/Bentham (utilitarianism), Rawls (justice as fairness), de Beauvoir/Sartre (existentialism), Confucius (Confucian ethics), care ethics (Noddings/Gilligan), Levinas (ethics of the Other), Ubuntu philosophy, or others as appropriate to the topic.
- Include exactly 5 questions that push students to think deeper. Questions should be open-ended and genuinely challenging.
- Include exactly 3 sample_arguments with different positions. These should model the kind of arguments students might make in a philosophy class. The positions should represent genuinely different viewpoints on the issue. The support and challenge for each should demonstrate rigorous reasoning.
- All source_text entries should reference real works by the named thinker.
- Write at an undergraduate level: clear, substantive, not oversimplified.
- Return ONLY valid JSON. No markdown, no code fences, no extra text.`;

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

async function fetchArticleContent(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EthicsLens/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch article: ${response.status}`);
    }

    const html = await response.text();

    // Basic content extraction — strip non-content tags, then all tags
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    // Truncate to stay within reasonable token limits
    return text.slice(0, 4000);
  } catch {
    throw new Error(
      'Could not fetch the article. Please check the URL and try again.',
    );
  }
}

async function analyzeWithClaude(content, mode, apiKey) {
  const userMessage =
    mode === 'url'
      ? `Analyze the ethical dimensions of this article:\n\n${content}`
      : `Analyze the ethical dimensions of this topic or headline:\n\n${content}`;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('Anthropic API error:', err);
    throw new Error(
      'Analysis service is temporarily unavailable. Please try again.',
    );
  }

  const data = await response.json();
  const text = data.content[0].text;

  try {
    return JSON.parse(text);
  } catch {
    // Try to extract JSON from the response if it has extra wrapping
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Failed to parse analysis results.');
  }
}

async function handleAnalyze(request, env) {
  const origin = request.headers.get('Origin') || '*';

  try {
    const { input, mode } = await request.json();

    if (!input || !mode) {
      return Response.json(
        { error: 'Missing required fields: input and mode' },
        { status: 400, headers: corsHeaders(origin) },
      );
    }

    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: 'Service not configured. Missing API key.' },
        { status: 500, headers: corsHeaders(origin) },
      );
    }

    let content = input;

    if (mode === 'url') {
      content = await fetchArticleContent(input);
    }

    const result = await analyzeWithClaude(content, mode, apiKey);

    // Attach source URL if the input was a URL
    if (mode === 'url') {
      result.source = input;
    }

    return Response.json(result, {
      headers: corsHeaders(origin),
    });
  } catch (err) {
    console.error('Analysis error:', err);
    return Response.json(
      { error: err.message || 'Something went wrong. Please try again.' },
      { status: 500, headers: corsHeaders(origin) },
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request.headers.get('Origin') || '*'),
      });
    }

    // API route
    if (url.pathname === '/api/analyze' && request.method === 'POST') {
      return handleAnalyze(request, env);
    }

    // Everything else: serve static assets
    return env.ASSETS.fetch(request);
  },
};
