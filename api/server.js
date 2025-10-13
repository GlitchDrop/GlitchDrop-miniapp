import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';

const { Pool } = pg;
const app = express();

app.use(express.json());
app.use(cors()); // если фронт (index.html) на другом домене

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// создаём таблицу, если её нет
await pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id BIGINT PRIMARY KEY,
    uid8 CHAR(8) UNIQUE NOT NULL
  );
`);

function genUid8() {
  return String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
}

app.post('/api/uid8', async (req, res) => {
  try {
    let { telegram_id } = req.body || {};
    if (typeof telegram_id !== 'string' || !/^\d+$/.test(telegram_id)) {
      return res.status(400).json({ error: 'Bad telegram_id' });
    }

    const existed = await pool.query(
      'SELECT uid8 FROM users WHERE telegram_id = $1',
      [telegram_id]
    );
    if (existed.rows.length) {
      return res.json({ uid8: existed.rows[0].uid8 });
    }

    for (let i = 0; i < 10; i++) {
      const candidate = genUid8();
      try {
        const inserted = await pool.query(
          'INSERT INTO users (telegram_id, uid8) VALUES ($1::BIGINT, $2) RETURNING uid8',
          [telegram_id, candidate]
        );
        return res.json({ uid8: inserted.rows[0].uid8 });
      } catch (e) {
        if (!String(e?.message || '').toLowerCase().includes('duplicate')) {
          throw e;
        }
      }
    }

    return res.status(500).json({ error: 'Could not allocate uid8' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('API listening on :' + PORT));
