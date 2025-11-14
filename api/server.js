// server.js — uid8 + звёзды по UID8 (Postgres)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';

const { Pool } = pg;
const app = express();

app.use(express.json());
app.use(cors());

// --- Секреты для админ-CLI из .env
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// --- Подключение к БД
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// --- Схема БД
// 1) таблица users: telegram_id <-> uid8 (у тебя уже была)
await pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id BIGINT PRIMARY KEY,
    uid8 CHAR(8) UNIQUE NOT NULL
  );
`);

// 2) таблица user_stars: баланс звёзд по uid8
await pool.query(`
  CREATE TABLE IF NOT EXISTS user_stars (
    uid8 CHAR(8) PRIMARY KEY,
    stars BIGINT NOT NULL DEFAULT 0
  );
`);

console.log('DB schema OK');

// ===== Утилиты =====

// генерация uid8 (оставляем твою)
function genUid8() {
  return String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
}

// взять баланс по uid8
async function getStarsByUid8(uid8) {
  const { rows } = await pool.query(
    'SELECT stars FROM user_stars WHERE uid8 = $1',
    [uid8]
  );
  return rows.length ? Number(rows[0].stars) : 0;
}

// добавить звёзды по uid8
async function addStarsByUid8(uid8, delta) {
  const current = await getStarsByUid8(uid8);
  const next = current + delta;

  await pool.query(
    `
    INSERT INTO user_stars(uid8, stars)
    VALUES ($1, $2)
    ON CONFLICT (uid8) DO UPDATE
      SET stars = EXCLUDED.stars
    `,
    [uid8, next]
  );

  return next;
}

// --- Healthcheck
app.get('/health', (_req, res) => {
  res.send('OK');
});

// ====================== API ======================

// 1) /api/uid8 — как у тебя было: выдаём / возвращаем uid8 по telegram_id
app.post('/api/uid8', async (req, res) => {
  try {
    let { telegram_id } = req.body || {};
    if (typeof telegram_id !== 'string' || !/^\d+$/.test(telegram_id)) {
      return res.status(400).json({ error: 'Bad telegram_id' });
    }

    // уже есть uid8?
    const existed = await pool.query(
      'SELECT uid8 FROM users WHERE telegram_id = $1',
      [telegram_id]
    );
    if (existed.rows.length) {
      return res.json({ uid8: existed.rows[0].uid8 });
    }

    // генерим новый uid8 (до 10 попыток)
    for (let i = 0; i < 10; i++) {
      const candidate = genUid8();
      try {
        const inserted = await pool.query(
          'INSERT INTO users (telegram_id, uid8) VALUES ($1::BIGINT, $2) RETURNING uid8',
          [telegram_id, candidate]
        );
        return res.json({ uid8: inserted.rows[0].uid8 });
      } catch (e) {
        const msg = String(e?.message || '').toLowerCase();
        if (!msg.includes('duplicate')) {
          throw e;
        }
        // дубликат uid8 — пробуем ещё раз
      }
    }

    return res.status(500).json({ error: 'Could not allocate uid8' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// 2) Баланс пользователя по его telegram_id (для фронта mini-app)
// GET /api/user-balance?user_id=123456789
app.get('/api/user-balance', async (req, res) => {
  try {
    const userId = String(req.query.user_id || '').trim();
    if (!userId) {
      return res.status(400).json({ ok: false, error: 'no_user_id' });
    }

    // найдём uid8 в таблице users
    const { rows } = await pool.query(
      'SELECT uid8 FROM users WHERE telegram_id = $1::BIGINT',
      [userId]
    );
    if (!rows.length) {
      // ещё нет uid8 → баланс 0
      return res.json({ ok: true, uid8: null, stars: 0 });
    }

    const uid8 = rows[0].uid8;
    const stars = await getStarsByUid8(uid8);

    console.log('API /api/user-balance', { userId, uid8, stars });

    return res.json({
      ok: true,
      uid8,
      stars
    });
  } catch (e) {
    console.error('user-balance error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// 3) CLI-эндпоинт для начисления звёзд по UID8
// POST /api/cli/add-stars
// body: { botToken, password, uid8, amount }
app.post('/api/cli/add-stars', async (req, res) => {
  try {
    const { botToken, password, uid8, amount } = req.body || {};

    // проверка токена бота
    if (!botToken || botToken !== BOT_TOKEN) {
      return res.status(401).json({ ok: false, error: 'bad_bot_token' });
    }

    // проверка пароля
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ ok: false, error: 'bad_password' });
    }

    const cleanUid = String(uid8 || '').trim();
    const delta = Number(amount);

    if (!/^\d{8}$/.test(cleanUid)) {
      return res.status(400).json({ ok: false, error: 'bad_uid8' });
    }

    if (!Number.isFinite(delta) || delta <= 0) {
      return res.status(400).json({ ok: false, error: 'bad_amount' });
    }

    const newBalance = await addStarsByUid8(cleanUid, delta);
    console.log(`⭐ CLI: +${delta} звёзд для UID ${cleanUid} → ${newBalance}`);

    return res.json({
      ok: true,
      uid8: cleanUid,
      added: delta,
      newBalance
    });
  } catch (e) {
    console.error('CLI add-stars error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// 4) (опционально) получить баланс по UID8 напрямую
// GET /api/stars/by-uid8/:uid8
app.get('/api/stars/by-uid8/:uid8', async (req, res) => {
  try {
    const uid8 = String(req.params.uid8 || '').trim();
    if (!/^\d{8}$/.test(uid8)) {
      return res.status(400).json({ ok: false, error: 'bad_uid8' });
    }

    const stars = await getStarsByUid8(uid8);
    return res.json({ ok: true, uid8, stars });
  } catch (e) {
    console.error('get stars error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// --- Запуск
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('API listening on :' + PORT));
