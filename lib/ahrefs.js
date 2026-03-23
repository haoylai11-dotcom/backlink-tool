// Ahrefs API client
const Ahrefs = (() => {
  const API_BASE = 'https://api.ahrefs.com/v3/site-explorer';

  async function getBacklinks(domain, apiKey, { limit = 1000, offset = 0, minDR = 10 } = {}) {
    const params = new URLSearchParams({
      select: 'url_from,domain_rating_source,anchor,link_type,is_dofollow,is_nofollow,is_ugc,is_sponsored,traffic,title,name_source,first_seen,last_seen,is_lost,is_content',
      target: domain,
      mode: 'domain',
      limit: String(limit),
      offset: String(offset),
      output: 'json',
      order_by: 'domain_rating_source:desc'
    });

    if (minDR > 0) {
      params.append('where', JSON.stringify({
        and: [
          { field: 'domain_rating_source', is: ['gte', minDR] },
          { field: 'is_lost', is: ['eq', 0] }
        ]
      }));
    }

    const url = `${API_BASE}/all-backlinks?${params.toString()}`;

    try {
      const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });

      if (!resp.ok) {
        const errText = await resp.text();
        return { error: `API error ${resp.status}: ${errText}`, backlinks: [] };
      }

      const data = await resp.json();
      return {
        backlinks: (data.backlinks || []).map(b => ({
          url: b.url_from,
          domain: b.name_source || '',
          anchor_text: b.anchor || '',
          authority_score: Math.round(b.domain_rating_source || 0),
          link_type: b.is_dofollow ? 'dofollow' : 'nofollow',
          traffic: b.traffic || 0,
          title: b.title || '',
          is_content: b.is_content || false,
          first_seen: b.first_seen || '',
          last_seen: b.last_seen || ''
        })),
        error: null
      };
    } catch (err) {
      return { error: err.message, backlinks: [] };
    }
  }

  async function getAllBacklinks(domain, apiKey, options = {}) {
    const limit = 1000;
    let offset = 0;
    let allBacklinks = [];
    let hasMore = true;

    while (hasMore) {
      const result = await getBacklinks(domain, apiKey, { ...options, limit, offset });
      if (result.error) {
        return { backlinks: allBacklinks, error: result.error };
      }
      allBacklinks = allBacklinks.concat(result.backlinks);
      if (result.backlinks.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    return { backlinks: allBacklinks, error: null };
  }

  return { getBacklinks, getAllBacklinks };
})();

if (typeof globalThis !== 'undefined') globalThis.Ahrefs = Ahrefs;
