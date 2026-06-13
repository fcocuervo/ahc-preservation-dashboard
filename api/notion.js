module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { dbId, action, properties } = req.body || {};

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  if (!NOTION_TOKEN) return res.status(500).json({ error: 'Token not configured' });

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

  // DEFAULT: QUERY action
  if (!dbId) return res.status(400).json({ error: 'Missing dbId' });

  try {
    const response = await fetch(
      `https://api.notion.com/v1/databases/${dbId}/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ page_size: 100 })
      }
    );
    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
