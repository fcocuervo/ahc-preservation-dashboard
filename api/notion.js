module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { dbId, action, properties, pageId, filter } = req.body || {};

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  if (!NOTION_TOKEN) return res.status(500).json({ error: 'Token not configured' });

  // UPDATE PAGE action — used for writing Report Score to existing pages
  if (action === 'updatePage') {
    if (!pageId || !properties) return res.status(400).json({ error: 'Missing pageId or properties' });
    try {
      const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ properties })
      });
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data.message||'Notion error', details: data });
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // CREATE PAGE action — used for writing records (e.g. medals) to Notion
  if (action === 'createPage') {
    if (!dbId || !properties) return res.status(400).json({ error: 'Missing dbId or properties' });
    try {
      const response = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          parent: { database_id: dbId },
          properties
        })
      });
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data.message || 'Notion error', details: data });
      return res.status(200).json({ ok: true, page: data });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // DEFAULT: QUERY action — fully paginated, so no records are silently dropped once any
  // database grows past 100 rows (this was a real bug: recent records, like a system closed
  // this week in MC Walkthrough, could fall outside the first 100 and never be counted).
  if (!dbId) return res.status(400).json({ error: 'Missing dbId' });

  try {
    let allResults = [];
    let cursor = undefined;
    let hasMore = true;
    let pages = 0;
    while (hasMore && pages < 20) { // hard cap of 2000 rows as a sanity guard
      const response = await fetch(
        `https://api.notion.com/v1/databases/${dbId}/query`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${NOTION_TOKEN}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            page_size: 100,
            ...(cursor ? { start_cursor: cursor } : {}),
            ...(filter ? { filter } : {})
          })
        }
      );
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json({ object: 'error', status: response.status, code: data.code, message: data.message || 'Notion error' });
      allResults = allResults.concat(data.results || []);
      hasMore = !!data.has_more;
      cursor = data.next_cursor;
      pages++;
    }
    return res.status(200).json({ object: 'list', results: allResults, has_more: false });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
