import { getDatabase } from '@netlify/database';
import { normalizeState, verifyTreasurerPassword } from '../../kas-logic.js';

const ROW_ID = 'pplg1';
const JSON_HEADERS = {
  'Cache-Control': 'no-store',
};

function isAuthorized(password) {
  const envPassword =
    typeof Netlify !== 'undefined' && Netlify?.env?.get
      ? Netlify.env.get('TREASURER_PASSWORD')
      : undefined;
  if (envPassword) {
    return String(password || '') === envPassword;
  }
  return verifyTreasurerPassword(password);
}

export default async (req) => {
  const db = getDatabase();

  if (req.method === 'GET') {
    try {
      const rows = await db.sql`
        SELECT data, updated_at
        FROM kas_state
        WHERE id = ${ROW_ID}
        LIMIT 1
      `;

      if (rows.length === 0) {
        return Response.json({ exists: false, state: null, updatedAt: null }, { headers: JSON_HEADERS });
      }

      const normalized = normalizeState(rows[0].data);
      return Response.json(
        {
          exists: true,
          state: normalized,
          updatedAt: rows[0].updated_at ? new Date(rows[0].updated_at).toISOString() : null,
        },
        { headers: JSON_HEADERS }
      );
    } catch {
      return Response.json({ error: 'Gagal membaca database' }, { status: 500, headers: JSON_HEADERS });
    }
  }

  if (req.method === 'POST') {
    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Format JSON tidak valid' }, { status: 400, headers: JSON_HEADERS });
    }

    if (!isAuthorized(body?.password)) {
      return Response.json(
        { error: 'Password bendahara salah' },
        { status: 401, headers: JSON_HEADERS }
      );
    }

    const normalized = normalizeState(body?.state);
    const payload = JSON.stringify(normalized);

    try {
      const rows = await db.sql`
        INSERT INTO kas_state (id, data, updated_at)
        VALUES (${ROW_ID}, ${payload}::jsonb, NOW())
        ON CONFLICT (id) DO UPDATE
          SET data = EXCLUDED.data,
              updated_at = NOW()
        RETURNING updated_at
      `;

      return Response.json(
        {
          ok: true,
          state: normalized,
          updatedAt: rows[0]?.updated_at ? new Date(rows[0].updated_at).toISOString() : null,
        },
        { headers: JSON_HEADERS }
      );
    } catch {
      return Response.json({ error: 'Gagal menyimpan ke database' }, { status: 500, headers: JSON_HEADERS });
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
};

export const config = {
  path: '/api/kas',
  method: ['GET', 'POST'],
};
