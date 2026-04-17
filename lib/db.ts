import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import path from "node:path";
import fs from "node:fs";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "memoria.db");
const EMBED_DIM = Number(process.env.EMBED_DIM ?? 1536);

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  sqliteVec.load(db);
  ensureSchema(db);
  _db = db;
  return db;
}

function ensureSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raw TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      processed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS atoms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      heading TEXT,
      summary TEXT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_atoms_note ON atoms(note_id);
    CREATE INDEX IF NOT EXISTS idx_atoms_created ON atoms(created_at);

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'topic',
      UNIQUE(name, kind)
    );

    CREATE TABLE IF NOT EXISTS atom_tags (
      atom_id INTEGER NOT NULL REFERENCES atoms(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (atom_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      UNIQUE(name, type)
    );

    CREATE TABLE IF NOT EXISTS atom_entities (
      atom_id INTEGER NOT NULL REFERENCES atoms(id) ON DELETE CASCADE,
      entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      PRIMARY KEY (atom_id, entity_id)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS atom_embeddings USING vec0(
      atom_id INTEGER PRIMARY KEY,
      embedding FLOAT[${EMBED_DIM}]
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS atom_fts USING fts5(
      heading, summary, content, tags, entities,
      content=''
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      atom_id INTEGER NOT NULL REFERENCES atoms(id) ON DELETE CASCADE,
      note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      due_at TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_atom ON tasks(atom_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_note ON tasks(note_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_at);

    CREATE TABLE IF NOT EXISTS topic_cards (
      tag_name TEXT PRIMARY KEY,
      summary TEXT NOT NULL,
      atom_count INTEGER NOT NULL DEFAULT 0,
      hot_score REAL,
      last_atom_id INTEGER NOT NULL DEFAULT 0,
      source_atom_ids TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      archived_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_topic_cards_archived ON topic_cards(archived_at);
    CREATE INDEX IF NOT EXISTS idx_topic_cards_hot ON topic_cards(hot_score DESC);

    CREATE TABLE IF NOT EXISTS topic_prefs (
      tag_name TEXT PRIMARY KEY,
      pinned INTEGER NOT NULL DEFAULT 0,
      hidden INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Back-compat: add source_atom_ids column if the DB predates it
  const cols = db.prepare("PRAGMA table_info(topic_cards)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "source_atom_ids")) {
    db.exec("ALTER TABLE topic_cards ADD COLUMN source_atom_ids TEXT");
  }
}
