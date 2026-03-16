// AI Comment Generator — OpenAI-compatible API
const AI = (() => {

  async function generateComment(articleTitle, articleContent, targetWebsite, apiKey, apiEndpoint, model) {
    if (!apiKey || !apiEndpoint) return null;

    const systemPrompt = `You are writing a blog comment as a real person. Rules:
- Write 2-4 sentences that are relevant to the article content
- Sound natural and authentic, like a genuine reader
- If appropriate, naturally mention or reference the website: ${targetWebsite}
- Do NOT sound like marketing or spam
- Do NOT use phrases like "great article" or "thanks for sharing" as openers
- Write in the same language as the article`;

    const userPrompt = `Article title: ${articleTitle}\n\nArticle excerpt: ${articleContent}\n\nWrite a natural blog comment:`;

    try {
      const endpoint = apiEndpoint.replace(/\/$/, '');
      const url = endpoint.includes('/chat/completions') ? endpoint : `${endpoint}/chat/completions`;

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.8,
          max_tokens: 200
        })
      });

      if (!resp.ok) {
        console.error('AI API error:', resp.status, await resp.text());
        return null;
      }

      const data = await resp.json();
      return data.choices?.[0]?.message?.content?.trim() || null;
    } catch (err) {
      console.error('AI generation failed:', err);
      return null;
    }
  }

  return { generateComment };
})();

if (typeof globalThis !== 'undefined') globalThis.AI = AI;
