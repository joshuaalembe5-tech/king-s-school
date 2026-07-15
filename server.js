// ════════════════════════════════════════════════════════
//  King's School International — Serveur Backend v2
//  Node.js + Express + SQLite3 + bcryptjs
//  Lancez avec : node server.js
// ════════════════════════════════════════════════════════

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt  = require('bcryptjs');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = 3000;

// ── Middleware ────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ── Base de données SQLite ────────────────────────────────
const db = new sqlite3.Database(path.join(__dirname, 'database.db'), (err) => {
  if (err) console.error('❌ Erreur base de données :', err.message);
  else     console.log('✅ Base de données connectée (database.db)');
});

// Helpers Promise
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) { if (err) reject(err); else resolve(this); });
});
const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); });
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows); });
});

// ── Initialisation des tables ─────────────────────────────
db.serialize(async () => {
  // Table utilisateurs
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      email      TEXT NOT NULL UNIQUE,
      password   TEXT NOT NULL,
      role       TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Table messages de contact
  await dbRun(`
    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      email      TEXT NOT NULL,
      subject    TEXT NOT NULL,
      message    TEXT NOT NULL,
      lu         INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Compte admin par défaut
  const admin = await dbGet("SELECT id FROM users WHERE email = 'admin@kingsschool.cd'");
  if (!admin) {
    const hash = bcrypt.hashSync('admin123', 10);
    await dbRun(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'admin')",
      ['Administrateur', 'admin@kingsschool.cd', hash]
    );
    console.log('✅ Compte admin créé : admin@kingsschool.cd / admin123');
  }

  console.log('');
  console.log('╔════════════════════════════════════════╗');
  console.log("║  King's School — Serveur démarré ✅    ║");
  console.log(`║  http://localhost:${PORT}                  ║`);
  console.log('╠════════════════════════════════════════╣');
  console.log('║  portail.html  → Page de connexion     ║');
  console.log('║  index.html    → Votre site (protégé)  ║');
  console.log('║  admin.html    → Panel administrateur  ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');
});

// ════════════════════════════════════════════════════════
//  ROUTES API
// ════════════════════════════════════════════════════════

// ── POST /api/register ────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || name.trim().length < 2)
    return res.status(400).json({ message: 'Le nom doit contenir au moins 2 caractères.' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ message: 'Adresse email invalide.' });
  if (!password || password.length < 6)
    return res.status(400).json({ message: 'Le mot de passe doit avoir au moins 6 caractères.' });

  try {
    const existing = await dbGet('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing)
      return res.status(409).json({ message: 'Cette adresse email est déjà utilisée.' });

    const hashed = bcrypt.hashSync(password, 10);
    const result = await dbRun(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'user')",
      [name.trim(), email.toLowerCase(), hashed]
    );

    console.log(`[INSCRIPTION] ${name} (${email})`);
    res.status(201).json({
      message: 'Compte créé avec succès.',
      user: { id: result.lastID, name: name.trim(), email: email.toLowerCase() }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ── POST /api/login ───────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: 'Email et mot de passe requis.' });

  try {
    const user = await dbGet('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ message: 'Email ou mot de passe incorrect.' });

    console.log(`[CONNEXION] ${user.name} (${user.email})`);
    res.json({
      message: 'Connexion réussie.',
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ── POST /api/contact — Formulaire de contact ─────────────
app.post('/api/contact', async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !subject || !message)
    return res.status(400).json({ message: 'Tous les champs sont requis.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ message: 'Email invalide.' });

  try {
    await dbRun(
      'INSERT INTO messages (name, email, subject, message) VALUES (?, ?, ?, ?)',
      [name.trim(), email.toLowerCase(), subject.trim(), message.trim()]
    );
    console.log(`[MESSAGE] De: ${name} (${email}) — Sujet: ${subject}`);
    res.status(201).json({ message: 'Message envoyé avec succès.' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ── GET /api/admin/users ──────────────────────────────────
app.get('/api/admin/users', async (req, res) => {
  const adminEmail = req.headers['x-admin-email'];
  try {
    const admin = await dbGet('SELECT role FROM users WHERE email = ?', [adminEmail]);
    if (!admin || admin.role !== 'admin')
      return res.status(403).json({ message: 'Accès refusé.' });

    const users = await dbAll(
      'SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC'
    );
    res.json({ users, total: users.length });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ── GET /api/admin/stats ──────────────────────────────────
app.get('/api/admin/stats', async (req, res) => {
  const adminEmail = req.headers['x-admin-email'];
  try {
    const admin = await dbGet('SELECT role FROM users WHERE email = ?', [adminEmail]);
    if (!admin || admin.role !== 'admin')
      return res.status(403).json({ message: 'Accès refusé.' });

    const total    = await dbGet("SELECT COUNT(*) as c FROM users WHERE role='user'");
    const today    = await dbGet("SELECT COUNT(*) as c FROM users WHERE date(created_at)=date('now') AND role='user'");
    const thisWeek = await dbGet("SELECT COUNT(*) as c FROM users WHERE created_at>=datetime('now','-7 days') AND role='user'");
    const messages = await dbGet("SELECT COUNT(*) as c FROM messages");
    const unread   = await dbGet("SELECT COUNT(*) as c FROM messages WHERE lu=0");

    res.json({
      total: total.c, today: today.c, thisWeek: thisWeek.c,
      messages: messages.c, unread: unread.c
    });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ── GET /api/admin/messages ───────────────────────────────
app.get('/api/admin/messages', async (req, res) => {
  const adminEmail = req.headers['x-admin-email'];
  try {
    const admin = await dbGet('SELECT role FROM users WHERE email = ?', [adminEmail]);
    if (!admin || admin.role !== 'admin')
      return res.status(403).json({ message: 'Accès refusé.' });

    const msgs = await dbAll('SELECT * FROM messages ORDER BY created_at DESC');
    res.json({ messages: msgs });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ── PUT /api/admin/messages/:id/lu ───────────────────────
app.put('/api/admin/messages/:id/lu', async (req, res) => {
  const adminEmail = req.headers['x-admin-email'];
  try {
    const admin = await dbGet('SELECT role FROM users WHERE email = ?', [adminEmail]);
    if (!admin || admin.role !== 'admin')
      return res.status(403).json({ message: 'Accès refusé.' });

    await dbRun('UPDATE messages SET lu=1 WHERE id=?', [req.params.id]);
    res.json({ message: 'Marqué comme lu.' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ── DELETE /api/admin/users/:id ───────────────────────────
app.delete('/api/admin/users/:id', async (req, res) => {
  const adminEmail = req.headers['x-admin-email'];
  try {
    const admin = await dbGet('SELECT role FROM users WHERE email = ?', [adminEmail]);
    if (!admin || admin.role !== 'admin')
      return res.status(403).json({ message: 'Accès refusé.' });

    await dbRun("DELETE FROM users WHERE id=? AND role!='admin'", [req.params.id]);
    res.json({ message: 'Utilisateur supprimé.' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ── DELETE /api/admin/messages/:id ───────────────────────
app.delete('/api/admin/messages/:id', async (req, res) => {
  const adminEmail = req.headers['x-admin-email'];
  try {
    const admin = await dbGet('SELECT role FROM users WHERE email = ?', [adminEmail]);
    if (!admin || admin.role !== 'admin')
      return res.status(403).json({ message: 'Accès refusé.' });

    await dbRun('DELETE FROM messages WHERE id=?', [req.params.id]);
    res.json({ message: 'Message supprimé.' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

app.listen(PORT);
