const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'marketing-agent.db');

let db;

async function initialize() {
  const fs = require('fs');
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new sqlite3.Database(DB_PATH);

  const createTables = `
    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      department TEXT,
      specialty TEXT,
      max_capacity INTEGER DEFAULT ${process.env.MAX_TASKS_PER_MEMBER || 5},
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      clickup_id TEXT UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT,
      priority INTEGER,
      due_date TEXT,
      created_at TEXT,
      assigned_to TEXT,
      department TEXT,
      list_id TEXT,
      list_name TEXT,
      sla_deadline TEXT,
      sla_status TEXT DEFAULT 'on_track',
      task_type TEXT,
      requesting_area TEXT,
      tags TEXT,
      url TEXT,
      sync_updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS task_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      assigned_at TEXT NOT NULL,
      assigned_by TEXT DEFAULT 'agent',
      reason TEXT,
      workload_at_assignment INTEGER,
      FOREIGN KEY (task_id) REFERENCES tasks(id),
      FOREIGN KEY (member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS sla_violations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      member_id TEXT,
      violation_type TEXT NOT NULL,
      detected_at TEXT NOT NULL,
      resolved INTEGER DEFAULT 0,
      resolved_at TEXT,
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    );

    CREATE TABLE IF NOT EXISTS agent_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `;

  return new Promise((resolve, reject) => {
    db.exec(createTables, (err) => {
      if (err) return reject(err);
      console.log('Database initialized');
      resolve();
    });
  });
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initialize() first.');
  return db;
}

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function(err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

module.exports = { initialize, query, run, get, getDb };
