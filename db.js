const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const dbPath = path.join(__dirname, "notes.db");
const db = new Database(dbPath);

function initializeDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      extracted_text TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      title TEXT,
      summary_text TEXT NOT NULL,
      keywords TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  const admin = db.prepare("SELECT id FROM users WHERE email = ?").get("admin@notes.com");
  if (!admin) {
    const passwordHash = bcrypt.hashSync("admin123", 10);
    db.prepare(`
      INSERT INTO users (name, email, password, role)
      VALUES (?, ?, ?, ?)
    `).run("System Admin", "admin@notes.com", passwordHash, "admin");
  }
}

function createUser({ name, email, password }) {
  const hashedPassword = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (name, email, password, role)
    VALUES (?, ?, ?, ?)
  `).run(name, email.trim().toLowerCase(), hashedPassword, "user");

  return getUserById(result.lastInsertRowid);
}

function getUserByEmail(email) {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(String(email).trim().toLowerCase());
}

function getUserById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(Number(id));
}

function getAllUsers() {
  return db.prepare("SELECT id, name, email, role, created_at FROM users ORDER BY id DESC").all();
}

function createDocument({ userId, fileName, originalName, fileType, fileSize, extractedText }) {
  const result = db.prepare(`
    INSERT INTO documents (user_id, file_name, original_name, file_type, file_size, extracted_text)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, fileName, originalName, fileType, fileSize, extractedText || "");

  return db.prepare("SELECT * FROM documents WHERE id = ?").get(result.lastInsertRowid);
}

function getMyDocuments(userId) {
  return db.prepare(`
    SELECT * FROM documents
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId);
}

function getDocumentById(id) {
  return db.prepare("SELECT * FROM documents WHERE id = ?").get(Number(id));
}

function saveSummary({ documentId, userId, summaryText, keywords }) {
  const result = db.prepare(`
    INSERT INTO summaries (document_id, user_id, summary_text, keywords)
    VALUES (?, ?, ?, ?)
  `).run(documentId, userId, summaryText, keywords || "");

  return db.prepare("SELECT * FROM summaries WHERE id = ?").get(result.lastInsertRowid);
}

function getMySummaries(userId) {
  return db.prepare(`
    SELECT s.*, d.original_name as document_name
    FROM summaries s
    JOIN documents d ON d.id = s.document_id
    WHERE s.user_id = ?
    ORDER BY s.created_at DESC
  `).all(userId);
}

function getAdminDashboard() {
  const totalUsers = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  const totalDocuments = db.prepare("SELECT COUNT(*) AS count FROM documents").get().count;
  const totalSummaries = db.prepare("SELECT COUNT(*) AS count FROM summaries").get().count;

  const recentDocuments = db.prepare(`
    SELECT d.*, u.name AS user_name
    FROM documents d
    JOIN users u ON u.id = d.user_id
    ORDER BY d.created_at DESC
    LIMIT 5
  `).all();

  const recentSummaries = db.prepare(`
    SELECT s.*, u.name AS user_name, d.original_name AS document_name
    FROM summaries s
    JOIN users u ON u.id = s.user_id
    JOIN documents d ON d.id = s.document_id
    ORDER BY s.created_at DESC
    LIMIT 5
  `).all();

  return {
    totalUsers,
    totalDocuments,
    totalSummaries,
    recentDocuments,
    recentSummaries
  };
}

module.exports = {
  initializeDb,
  createUser,
  getUserByEmail,
  getUserById,
  getAllUsers,
  createDocument,
  getMyDocuments,
  getDocumentById,
  saveSummary,
  getMySummaries,
  getAdminDashboard
};
