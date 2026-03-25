import "dotenv/config";
import { Pool, PoolConfig } from "pg";
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

export async function initDb(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS submissions (
        id SERIAL PRIMARY KEY,
        sr_no INTEGER NOT NULL UNIQUE,
        party_name TEXT NOT NULL DEFAULT \x27\x27,
        date TEXT NOT NULL,
        bill_no TEXT NOT NULL,
        barcode TEXT NOT NULL,
        s_m TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_submissions_date ON submissions(date);
    `);
  } finally {
    client.release();
  }
}

export async function createSubmission(input: CreateSubmissionInput): Promise<Submission> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: existingSrNos } = await client.query<{ sr_no: number }>(
      "SELECT COALESCE(MAX(sr_no), 0) AS sr_no FROM submissions"
    );
    const nextSrNo = (existingSrNos[0]?.sr_no ?? 0) + 1;

    const { rows: existingBarcode } = await client.query<{ id: number }>(
      "SELECT id FROM submissions WHERE barcode = $1",
      [input.barcode]
    );
    if (existingBarcode.length > 0) {
      throw new Error("Duplicate barcode");
    }

    const now = new Date().toISOString();

    const query = `
      INSERT INTO submissions (sr_no, party_name, date, bill_no, barcode, s_m, amount, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    const values = [
      nextSrNo,
      input.party_name,
      input.date,
      input.bill_no,
      input.barcode,
      input.s_m,
      input.amount,
      input.status,
      now,
      now
    ];

    const { rows } = await client.query(query, values);
    await client.query("COMMIT");
    return rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listSubmissions(date?: string): Promise<Submission[]> {
  let query = "SELECT * FROM submissions";
  const params = [];

  if (date) {
    query += " WHERE date = $1";
    params.push(date);
  }

  query += " ORDER BY sr_no DESC";
  const { rows } = await pool.query(query, params);
  return rows;
}

export async function getSubmissionById(id: number): Promise<Submission | undefined> {
  const { rows } = await pool.query("SELECT * FROM submissions WHERE id = $1", [id]);
  return rows[0];
}

export async function updateSubmission(id: number, input: UpdateSubmissionInput): Promise<Submission | undefined> {
  const { rows: existingBarcode } = await pool.query<{ id: number }>(
    "SELECT id FROM submissions WHERE barcode = $1 AND id != $2",
    [input.barcode, id]
  );
  if (existingBarcode.length > 0) {
    throw new Error("Duplicate barcode");
  }

  const now = new Date().toISOString();

  const query = `
    UPDATE submissions
    SET sr_no = $1,
        party_name = $2,
        date = $3,
        bill_no = $4,
        barcode = $5,
        s_m = $6,
        amount = $7,
        status = $8,
        updated_at = $9
    WHERE id = $10
    RETURNING *
  `;
  const values = [
    input.sr_no,
    input.party_name,
    input.date,
    input.bill_no,
    input.barcode,
    input.s_m,
    input.amount,
    input.status,
    now,
    id
  ];

  const { rows } = await pool.query(query, values);
  return rows[0];
}

export async function deleteSubmission(id: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Get the sr_no of the record being deleted
    const { rows } = await client.query<{ sr_no: number }>(
      "SELECT sr_no FROM submissions WHERE id = $1",
      [id]
    );

    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return;
    }

    const deletedSrNo = rows[0].sr_no;

    // 2. Delete the record
    await client.query("DELETE FROM submissions WHERE id = $1", [id]);

    // 3. Decrement all sr_no values that were greater than the deleted sr_no
    await client.query(
      "UPDATE submissions SET sr_no = sr_no - 1 WHERE sr_no > $1",
      [deletedSrNo]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
