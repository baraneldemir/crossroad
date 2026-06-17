import { getStore } from '@netlify/blobs';

const STORE_KEY = 'scores';

export default async (req) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }

  const store = getStore({ name: 'leaderboard', consistency: 'strong' });

  if (req.method === 'GET') {
    try {
      const data = await store.get(STORE_KEY, { type: 'json' });
      return new Response(JSON.stringify(data || []), { headers });
    } catch {
      return new Response(JSON.stringify([]), { headers });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const name = (body.name || '').trim().substring(0, 20);
      const score = parseInt(body.score, 10);

      if (!name || isNaN(score) || score < 0) {
        return new Response(JSON.stringify({ error: 'Invalid data' }), { status: 400, headers });
      }

      let scores = [];
      try {
        scores = (await store.get(STORE_KEY, { type: 'json' })) || [];
      } catch {}

      const entry = { name, score, date: new Date().toISOString() };
      scores.push(entry);
      scores.sort((a, b) => b.score - a.score);
      const top10 = scores.slice(0, 10);

      await store.set(STORE_KEY, JSON.stringify(top10));

      const rank = top10.findIndex((s) => s.name === name && s.score === score) + 1;
      return new Response(JSON.stringify({ leaderboard: top10, rank }), { headers });
    } catch (err) {
      console.error(err);
      return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
};

export const config = {
  path: '/api/leaderboard',
};
