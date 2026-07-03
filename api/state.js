/* Shared household state via Upstash Redis REST (Vercel KV / Upstash integration).
   Works without it too: returns 503 and the app falls back to per-device storage. */
const KEY = 'family-planner-state';

function env() {
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    return url && token ? { url, token } : null;
}

module.exports = async (req, res) => {
    const kv = env();
    res.setHeader('Cache-Control', 'no-store');
    if (!kv) { res.status(503).json({ error: 'no store configured' }); return; }

    const secret = process.env.PLANNER_KEY;
    if (secret && req.headers['x-planner-key'] !== secret) {
          res.status(401).json({ error: 'unauthorised' }); return;
    }

    try {
          if (req.method === 'GET') {
                  const r = await fetch(kv.url + '/get/' + KEY, { headers: { Authorization: 'Bearer ' + kv.token } });
                  const data = await r.json();
                  res.status(200).json(data && data.result ? JSON.parse(data.result) : {});
                  return;
          }
          if (req.method === 'POST') {
                  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
                  if (body.length > 200000) { res.status(413).json({ error: 'too large' }); return; }
                  const r = await fetch(kv.url + '/set/' + KEY, {
                            method: 'POST',
                            headers: { Authorization: 'Bearer ' + kv.token, 'Content-Type': 'application/json' },
                            body: body
                  });
                  res.status(r.ok ? 200 : 500).json({ ok: r.ok });
                  return;
          }
          res.status(405).json({ error: 'method not allowed' });
    } catch (e) {
          res.status(500).json({ error: String(e) });
    }
};
