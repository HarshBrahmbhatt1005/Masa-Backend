import "dotenv/config";
import { Pool, PoolClient, PoolConfig } from "pg";
import { CreateSubmissionInput, Submission, UpdateSubmissionInput } from "./types";

const poolConfig: PoolConfig = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "form_app",
  ssl: process.env.DB_HOST?.includes("neon.tech") ? { rejectUnauthorized: false } : false,
};

const pool = new Pool(poolConfig);

/**
 * Resequence all sr_no values to be gapless (1, 2, 3 …) in ascending order,
 * preserving the original relative ordering of records.
 *
 * Two-phase approach to avoid UNIQUE constraint violations during bulk UPDATE:
 *   Phase 1 – negate every positive sr_no  → moves them into the negative space
 *             so no two rows can collide while Phase 2 runs.
 *   Phase 2 – assign ROW_NUMBER() 1, 2, 3 … ordered by sr_no DESC
 *             (least-negative first = originally-smallest sr_no = gets new value 1).
 *
 * Must be called inside an open transaction.
 */
async function resequenceSrNos(client: PoolClient): Promise<void> {
  // Phase 1: move all positive sr_nos to negative space
  await client.query(`UPDATE submissions SET sr_no = -sr_no WHERE sr_no > 0`);

  // Phase 2: assign final consecutive values 1, 2, 3 …
  // After phase 1 all values are negative.
  // ORDER BY sr_no DESC → least-negative = originally-smallest → gets new_sr_no = 1
  await client.query(`
    UPDATE submissions s
    SET    sr_no = ranked.new_sr_no
    FROM (
      SELECT id,
             ROW_NUMBER() OVER (ORDER BY sr_no DESC) AS new_sr_no
      FROM   submissions
    ) ranked
    WHERE s.id = ranked.id
  `);
}

export async function initDb(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS submissions (
        id          SERIAL  PRIMARY KEY,
        sr_no       INTEGER NOT NULL UNIQUE,
        party_name  TEXT    NOT NULL DEFAULT '',
        date        TEXT    NOT NULL DEFAULT '',
        bill_no     TEXT    NOT NULL DEFAULT '',
        barcode     TEXT    NOT NULL,
        s_m         TEXT    NOT NULL DEFAULT '',
        m_p         NUMERIC DEFAULT NULL,
        amount      NUMERIC NOT NULL DEFAULT 0,
        price       NUMERIC DEFAULT NULL,
        remark      TEXT    DEFAULT NULL,
        status      TEXT    NOT NULL DEFAULT 'UNPAID',
        created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_submissions_date ON submissions(date);
    `);

    // Add columns if they don't exist (for existing databases)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name='submissions' AND column_name='m_p') THEN
          ALTER TABLE submissions ADD COLUMN m_p NUMERIC DEFAULT NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name='submissions' AND column_name='price') THEN
          ALTER TABLE submissions ADD COLUMN price NUMERIC DEFAULT NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name='submissions' AND column_name='remark') THEN
          ALTER TABLE submissions ADD COLUMN remark TEXT DEFAULT NULL;
        END IF;
      END $$;
    `);

    // Fix any existing gaps in sr_no on every startup (runs inside its own
    // implicit transaction since we are not in BEGIN/COMMIT here — wrap it)
    await client.query("BEGIN");
    await resequenceSrNos(client);
    await client.query("COMMIT");

  } catch (error) {
    await client.query("ROLLBACK").catch(() => {/* ignore */});
    throw error;
  } finally {
    client.release();
  }
}

export async function createSubmission(input: CreateSubmissionInput): Promise<Submission> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: maxRows } = await client.query<{ sr_no: number }>(
      "SELECT COALESCE(MAX(sr_no), 0) AS sr_no FROM submissions"
    );
    const nextSrNo = (maxRows[0]?.sr_no ?? 0) + 1;

    const { rows: existingBarcode } = await client.query<{ id: number }>(
      "SELECT id FROM submissions WHERE barcode = $1",
      [input.barcode]
    );
    if (existingBarcode.length > 0) {
      throw new Error("Duplicate barcode");
    }

    const now = new Date().toISOString();

    const { rows } = await client.query(
      `INSERT INTO submissions
         (sr_no, party_name, date, bill_no, barcode, s_m, m_p, amount, price, remark, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        nextSrNo,
        input.party_name,
        input.date,
        input.bill_no,
        input.barcode,
        input.s_m,
        input.m_p,
        input.amount,
        input.price,
        input.remark,
        input.status,
        now,
        now,
      ]
    );

    await client.query("COMMIT");
    return rows[0] as Submission;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listSubmissions(date?: string): Promise<Submission[]> {
  let query = "SELECT * FROM submissions";
  const params: string[] = [];

  if (date) {
    query += " WHERE date = $1";
    params.push(date);
  }

  query += " ORDER BY sr_no DESC";
  const { rows } = await pool.query(query, params);
  return rows as Submission[];
}

export async function getSubmissionById(id: number): Promise<Submission | undefined> {
  const { rows } = await pool.query("SELECT * FROM submissions WHERE id = $1", [id]);
  return rows[0] as Submission | undefined;
}

export async function updateSubmission(
  id: number,
  input: UpdateSubmissionInput
): Promise<Submission | undefined> {
  const { rows: existingBarcode } = await pool.query<{ id: number }>(
    "SELECT id FROM submissions WHERE barcode = $1 AND id != $2",
    [input.barcode, id]
  );
  if (existingBarcode.length > 0) {
    throw new Error("Duplicate barcode");
  }

  const now = new Date().toISOString();

  const { rows } = await pool.query(
    `UPDATE submissions
     SET sr_no=$1, party_name=$2, date=$3, bill_no=$4, barcode=$5,
         s_m=$6, m_p=$7, amount=$8, price=$9, remark=$10, status=$11, updated_at=$12
     WHERE id=$13
     RETURNING *`,
    [
      input.sr_no,
      input.party_name,
      input.date,
      input.bill_no,
      input.barcode,
      input.s_m,
      input.m_p,
      input.amount,
      input.price,
      input.remark,
      input.status,
      now,
      id,
    ]
  );

  return rows[0] as Submission | undefined;
}

export async function deleteSubmission(id: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check record exists
    const { rows } = await client.query<{ sr_no: number }>(
      "SELECT sr_no FROM submissions WHERE id = $1",
      [id]
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return;
    }

    // Delete then immediately resequence
    await client.query("DELETE FROM submissions WHERE id = $1", [id]);
    await resequenceSrNos(client);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
