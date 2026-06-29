const Database = require('better-sqlite3');
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

let db;

function initDatabase() {
  // Resolve paths lazily — app.getPath is only valid after the app is ready,
  // so this must run inside whenReady (where initDatabase is called), not at
  // module load time.
  const APP_DATA_PATH = app.getPath('userData');
  const DB_PATH = path.join(APP_DATA_PATH, 'geomoz.db');

  // Ensure app data directory exists
  if (!fs.existsSync(APP_DATA_PATH)) {
    fs.mkdirSync(APP_DATA_PATH, { recursive: true });
  }

  // Initialize database connection
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL'); // Better performance

  // Create tables
  createTables();
}

function createTables() {
  // Saved views/analyses
  db.exec(`
    CREATE TABLE IF NOT EXISTS saved_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      province TEXT,
      district TEXT,
      layers TEXT,
      color_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Cached geospatial data
  db.exec(`
    CREATE TABLE IF NOT EXISTS cached_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data_type TEXT NOT NULL,
      key TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      UNIQUE(data_type, key)
    )
  `);

  // Export history
  db.exec(`
    CREATE TABLE IF NOT EXISTS export_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      export_type TEXT NOT NULL,
      file_path TEXT NOT NULL,
      parameters TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // User settings
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cached_data_type ON cached_data(data_type);
    CREATE INDEX IF NOT EXISTS idx_cached_data_key ON cached_data(key);
    CREATE INDEX IF NOT EXISTS idx_cached_data_expires ON cached_data(expires_at);
    CREATE INDEX IF NOT EXISTS idx_export_history_type ON export_history(export_type);
  `);
}

// Database operations
const dbOperations = {
  // Saved views
  saveView: (viewData) => {
    const stmt = db.prepare(`
      INSERT INTO saved_views (name, description, province, district, layers, color_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      viewData.name,
      viewData.description || null,
      viewData.province || null,
      viewData.district || null,
      JSON.stringify(viewData.layers),
      viewData.colorBy || null
    ).lastInsertRowid;
  },

  getViews: () => {
    const stmt = db.prepare('SELECT * FROM saved_views ORDER BY updated_at DESC');
    const rows = stmt.all();
    return rows.map(row => ({
      ...row,
      layers: JSON.parse(row.layers)
    }));
  },

  deleteView: (id) => {
    const stmt = db.prepare('DELETE FROM saved_views WHERE id = ?');
    return stmt.run(id).changes > 0;
  },

  // Cached data
  cacheData: (dataType, key, data, ttlSeconds = 3600) => {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO cached_data (data_type, key, data, expires_at)
      VALUES (?, ?, ?, ?)
    `);
    return stmt.run(dataType, key, JSON.stringify(data), expiresAt);
  },

  getCachedData: (dataType, key) => {
    const stmt = db.prepare(`
      SELECT data, expires_at FROM cached_data
      WHERE data_type = ? AND key = ? AND (expires_at IS NULL OR expires_at > datetime('now'))
    `);
    const row = stmt.get(dataType, key);
    if (row) {
      return JSON.parse(row.data);
    }
    return null;
  },

  clearExpiredCache: () => {
    const stmt = db.prepare('DELETE FROM cached_data WHERE expires_at < datetime("now")');
    return stmt.run().changes;
  },

  // Export history
  addExportHistory: (exportType, filePath, parameters) => {
    const stmt = db.prepare(`
      INSERT INTO export_history (export_type, file_path, parameters)
      VALUES (?, ?, ?)
    `);
    return stmt.run(exportType, filePath, JSON.stringify(parameters)).lastInsertRowid;
  },

  getExportHistory: (limit = 50) => {
    const stmt = db.prepare(`
      SELECT * FROM export_history
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(limit).map(row => ({
      ...row,
      parameters: JSON.parse(row.parameters)
    }));
  },

  // Settings
  setSetting: (key, value) => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO settings (key, value)
      VALUES (?, ?)
    `);
    return stmt.run(key, JSON.stringify(value));
  },

  getSetting: (key) => {
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    const row = stmt.get(key);
    if (row) {
      return JSON.parse(row.value);
    }
    return null;
  },

  getAllSettings: () => {
    const stmt = db.prepare('SELECT key, value FROM settings');
    const rows = stmt.all();
    const settings = {};
    rows.forEach(row => {
      settings[row.key] = JSON.parse(row.value);
    });
    return settings;
  }
};

function closeDatabase() {
  if (db) {
    db.close();
  }
}

module.exports = {
  initDatabase,
  closeDatabase,
  ...dbOperations
};
