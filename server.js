// ════════════════════════════════════════════════════════
//  King's School International — Serveur Backend v6
//  Node.js + Express + SQLite3 + bcryptjs + JWT
//  PHASE 4 : Notifications utilisateurs + Rôle Technicien
// ════════════════════════════════════════════════════════

require('dotenv').config();

const express     = require('express');
const sqlite3     = require('sqlite3').verbose();
const bcrypt      = require('bcryptjs');
const jwt         = require('jsonwebtoken');
const cors        = require('cors');
const path        = require('path');
const fs          = require('fs');
const multer      = require('multer');
const ExcelJS     = require('exceljs');
const PDFDocument = require('pdfkit');

// ════ Multer — stockage des images uploadées ════
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext)
                     .replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 40);
    cb(null, `${Date.now()}_${base}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 Mo max
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Type de fichier non autorisé. Utilisez JPG, PNG, GIF ou WEBP.'));
  }
});

const app  = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET     = process.env.JWT_SECRET || 'ksi_secret_jwt_kings_school_2024';
const JWT_EXPIRES_IN = '7d';
const ADMIN_EMAIL    = (process.env.ADMIN_EMAIL || 'admin@kingsschool.cd').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const MAX_ATTEMPTS     = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
// ★ Ajout du rôle 'technicien'
const ROLES_VALIDES    = ['user', 'moderateur', 'editeur', 'technicien', 'admin'];

if (!process.env.JWT_SECRET) console.warn('⚠️  JWT_SECRET non défini dans .env — clé par défaut utilisée (ok en local, changez en production).');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use('/uploads', express.static(UPLOAD_DIR));

// Chemin DB : dossier persistant sur Render, sinon dossier local
// Sur Render : créer un Disk monté sur /data, puis définir DB_PATH=/data/database.db dans les variables d'env
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'database.db');

const db = new sqlite3.Database(DB_PATH, err => {
  if (err) console.error('❌ Erreur base de données :', err.message);
  else console.log('✅ Base de données connectée');
});

const dbRun = (sql, p=[]) => new Promise((res,rej) => db.run(sql, p, function(e){ e?rej(e):res(this); }));
const dbGet = (sql, p=[]) => new Promise((res,rej) => db.get(sql, p, (e,r) => e?rej(e):res(r)));
const dbAll = (sql, p=[]) => new Promise((res,rej) => db.all(sql, p, (e,r) => e?rej(e):res(r)));

function nettoyerTexte(str, maxLen=500) {
  if (typeof str !== 'string') return '';
  return str.trim().replace(/[<>]/g,'').slice(0,maxLen);
}
function emailValide(e) { return typeof e==='string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length<=254; }
function clampPagination(pageRaw, limitRaw) {
  let page=parseInt(pageRaw,10), limit=parseInt(limitRaw,10);
  if(!Number.isFinite(page)||page<1) page=1;
  if(!Number.isFinite(limit)||limit<1) limit=10;
  if(limit>100) limit=100;
  return { page, limit, offset:(page-1)*limit };
}

async function enregistrerActivite(user, action, details='') {
  try { await dbRun('INSERT INTO activity_log (user_id,user_name,action,details) VALUES (?,?,?,?)',[user.id,user.name,action,details]); }
  catch(e) { console.error('Erreur journal:',e.message); }
}

let sseClients=[];
function envoyerNotification(type, payload={}) {
  const data=`data: ${JSON.stringify({type,...payload,ts:Date.now()})}\n\n`;
  sseClients.forEach(c=>c.res.write(data));
}

// ════════ Initialisation tables ════════
async function initDb() {
  await dbRun(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  await dbRun(`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL, telephone TEXT DEFAULT '', message TEXT NOT NULL, lu INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  await dbRun(`CREATE TABLE IF NOT EXISTS login_attempts (email TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, locked_until TEXT)`);
  await dbRun(`CREATE TABLE IF NOT EXISTS activity_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, user_name TEXT NOT NULL, action TEXT NOT NULL, details TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  await dbRun(`CREATE TABLE IF NOT EXISTS actualites (id INTEGER PRIMARY KEY AUTOINCREMENT, titre TEXT NOT NULL, contenu TEXT NOT NULL, image TEXT DEFAULT '', auteur TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  await dbRun(`CREATE TABLE IF NOT EXISTS equipe (id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL, poste TEXT NOT NULL, photo TEXT DEFAULT '', bio TEXT DEFAULT '', ordre INTEGER DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  await dbRun(`CREATE TABLE IF NOT EXISTS temoignages (id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL, role TEXT NOT NULL, texte TEXT NOT NULL, photo TEXT DEFAULT '', note INTEGER DEFAULT 5, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  await dbRun(`CREATE TABLE IF NOT EXISTS faq (id INTEGER PRIMARY KEY AUTOINCREMENT, question TEXT NOT NULL, reponse TEXT NOT NULL, categorie TEXT DEFAULT 'general', ordre INTEGER DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  await dbRun(`CREATE TABLE IF NOT EXISTS preinscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, nom_enfant TEXT NOT NULL, age INTEGER, classe_visee TEXT NOT NULL, nom_parent TEXT NOT NULL, email_parent TEXT NOT NULL, telephone TEXT DEFAULT '', message TEXT DEFAULT '', statut TEXT DEFAULT 'nouveau', created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  await dbRun(`CREATE TABLE IF NOT EXISTS galerie (id INTEGER PRIMARY KEY AUTOINCREMENT, image TEXT NOT NULL, titre TEXT DEFAULT '', description TEXT DEFAULT '', categorie TEXT DEFAULT 'general', ordre INTEGER DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);

  // Notifications utilisateurs
  await dbRun(`CREATE TABLE IF NOT EXISTS user_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    user_email TEXT,
    titre TEXT NOT NULL,
    contenu TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'info',
    lu INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  // Données galerie par défaut si vide
  const galCount = await dbGet('SELECT COUNT(*) as c FROM galerie');
  if (!galCount.c) {
    const galDef = [
      ['images/classroom.jpg','Salles de Classe Modernes','Des espaces d\'apprentissage conçus pour l\'excellence.','infrastructure',1],
      ['images/activities.jpg','Activités Scolaires','Des activités variées pour développer tous les talents.','vie-scolaire',2],
      ['images/humanitarian.jpg','Engagement Humanitaire','Nos élèves apprennent à servir leur communauté.','humanitaire',3],
      ['images/ceremonies.jpg','Cérémonies & Célébrations','Nous célébrons les réussites de chaque élève.','ceremonie',4],
    ];
    for (const [image,titre,description,categorie,ordre] of galDef)
      await dbRun('INSERT INTO galerie (image,titre,description,categorie,ordre) VALUES (?,?,?,?,?)',[image,titre,description,categorie,ordre]);
  }

  // Table CMS contenu statique du site
  await dbRun(`CREATE TABLE IF NOT EXISTS site_content (
    cle TEXT PRIMARY KEY,
    valeur TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'text',
    section TEXT NOT NULL DEFAULT 'general',
    libelle TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  // Insérer les valeurs par défaut si elles n'existent pas encore
  const defaults = [
    ['hero_titre','King\'s School International','text','hero','Titre principal'],
    ['hero_description','Une éducation d\'excellence basée sur la foi chrétienne, la discipline et le leadership pour préparer la prochaine génération à changer le monde.','textarea','hero','Description hero'],
    ['hero_image','images/jo1.jpg','text','hero','Image de fond (URL)'],
    ['hero_btn1_texte','Découvrir l\'école','text','hero','Bouton 1 — Texte'],
    ['hero_btn2_texte','Nous contacter','text','hero','Bouton 2 — Texte'],
    ['hero_phrases','Former des Leaders, Transformer des Nations|Excellence Académique & Foi Chrétienne|Discipline, Intégrité & Leadership|Un Congo Prospère, une Afrique Transformée','textarea','hero','Phrases typewriter (séparées par |)'],
    ['chiffres_titre','King\'s School en Chiffres','text','chiffres','Titre section chiffres'],
    ['chiffres_sous_titre','Une école qui grandit, des résultats qui parlent','text','chiffres','Sous-titre chiffres'],
    ['chiffre_fondation','2015','text','chiffres','Année de fondation'],
    ['chiffre_eleves','450','text','chiffres','Nombre d\'élèves inscrits'],
    ['chiffre_reussite','95','text','chiffres','Taux de réussite (%)'],
    ['chiffre_profs','30','text','chiffres','Nombre d\'enseignants'],
    ['apropos_titre','À Propos de King\'s School International','text','apropos','Titre section À propos'],
    ['apropos_p1','King\'s School International, membre de Metanoia Ministries International, est une école chrétienne engagée dans la formation internationale de la prochaine génération de leaders.','textarea','apropos','Paragraphe 1'],
    ['apropos_p2','Nous croyons que l\'éducation ne consiste pas seulement à transmettre des connaissances, mais à façonner le caractère, développer l\'esprit critique et préparer les jeunes à changer leur communauté, leur pays et le monde.','textarea','apropos','Paragraphe 2'],
    ['apropos_citation','"L\'éducation est l\'arme la plus puissante pour changer le monde."','textarea','apropos','Citation'],
    ['apropos_citation_auteur','Nelson Mandela','text','apropos','Auteur de la citation'],
    ['apropos_p3','À King\'s School International, cette arme est utilisée pour construire, servir et transformer.','textarea','apropos','Paragraphe 3'],
    ['apropos_image','images/jo20.jpg','text','apropos','Image (URL)'],
    ['valeurs_titre','Nos Valeurs Fondamentales','text','valeurs','Titre section valeurs'],
    ['valeurs_sous_titre','Ce qui nous guide chaque jour','text','valeurs','Sous-titre valeurs'],
    ['valeurs_items','[{"icon":"🎓","titre":"Excellence Académique","texte":"Nous visons l\'excellence dans tous les domaines de l\'apprentissage, préparant nos élèves aux défis nationaux et internationaux."},{"icon":"✝️","titre":"Foi Chrétienne","texte":"Notre fondement spirituel guide notre mission éducative et façonne le caractère de nos élèves."},{"icon":"⚖️","titre":"Discipline & Intégrité","texte":"Nous cultivons la rigueur, la responsabilité et l\'honnêteté comme piliers de la réussite."},{"icon":"❤️","titre":"Amour & Compassion","texte":"Nous enseignons l\'empathie, le respect et le service envers les autres."},{"icon":"🤝","titre":"Service Communautaire","texte":"Nos élèves apprennent à servir leur communauté et à faire une différence concrète."},{"icon":"👑","titre":"Leadership","texte":"Nous formons des leaders qui transformeront le Congo, l\'Afrique et le monde."},{"icon":"🌍","titre":"Vision Internationale","texte":"Notre programme prépare les élèves à exceller partout dans le monde."}]','json','valeurs','Cards valeurs (JSON)'],
    ['programmes_titre','Nos Programmes','text','programmes','Titre section programmes'],
    ['programmes_sous_titre','Une formation complète pour un avenir brillant','text','programmes','Sous-titre programmes'],
    ['programmes_items','[{"icon":"📚","titre":"Enseignement Général","items":["Programme primaire et secondaire","Curriculum international","Pédagogie moderne et innovante","Suivi personnalisé"]},{"icon":"🌐","titre":"Langues","items":["Anglais intensif","Enseignement bilingue","Français académique","Communication internationale"]},{"icon":"💻","titre":"Sciences & Technologies","items":["Initiation informatique","Sciences appliquées","Mathématiques avancées","Innovation et créativité"]},{"icon":"👑","titre":"Leadership","items":["Développement personnel","Prise de parole en public","Gestion de projets","Esprit d\'équipe"]},{"icon":"✝️","titre":"Formation Chrétienne","items":["Enseignement biblique","Éducation morale et spirituelle","Valeurs chrétiennes","Service et compassion"]},{"icon":"🎨","titre":"Arts & Sport","items":["Éducation artistique","Musique et chant","Sport et activités physiques","Expression créative"]}]','json','programmes','Cards programmes (JSON)'],
    ['galerie_titre','Galerie Photo','text','galerie','Titre section galerie'],
    ['galerie_sous_titre','Découvrez la vie à King\'s School','text','galerie','Sous-titre galerie'],
    ['galerie_items','[{"image":"images/classroom.jpg","titre":"Salles de classe modernes","description":"Nos salles équipées pour un apprentissage optimal."},{"image":"images/activities.jpg","titre":"Activités scolaires","description":"Des activités variées pour développer tous les talents."},{"image":"images/trips.jpg","titre":"Sorties éducatives","description":"Des sorties pour apprendre en dehors de la classe."},{"image":"images/events.jpg","titre":"Événements spéciaux","description":"Célébrons ensemble nos réussites."},{"image":"images/humanitarian.jpg","titre":"Visite Kanvivira","description":"Notre engagement humanitaire au service de la communauté."},{"image":"images/ceremonies.jpg","titre":"Cérémonies","description":"Moments forts de l\'année scolaire."}]','json','galerie','Photos de la galerie (JSON)'],
    ['contact_adresse','Uvira, Sud-Kivu, RDC','text','contact','Adresse'],
    ['contact_telephone','+243 XXX XXX XXX','text','contact','Téléphone / WhatsApp'],
    ['contact_email','contact@kingsschool.cd','text','contact','Email'],
    ['contact_horaires','Lundi – Vendredi : 7h30 – 16h00','text','contact','Heures d\'ouverture'],
    ['contact_facebook','https://www.facebook.com/kingschoolinternational','text','contact','Facebook URL'],
    ['contact_instagram','https://www.instagram.com/metanoia_ministries/','text','contact','Instagram URL'],
    ['contact_whatsapp','https://wa.me/243XXXXXXXXX','text','contact','WhatsApp URL'],
    ['contact_youtube','https://youtube.com','text','contact','YouTube URL'],
    ['contact_twitter','','text','contact','Twitter / X URL'],
    ['contact_tiktok','','text','contact','TikTok URL'],
    // ── Contenu page À Propos étendue ──
    ['apropos_mission','<p>King\'s School International, membre de <strong>Metanoia Ministries International</strong>, est une école chrétienne engagée dans la formation internationale de la prochaine génération de leaders. Notre mission est de former des esprits brillants, des cœurs intègres et des mains capables de servir.</p>','textarea','apropos','Page À Propos — Mission (HTML)'],
    ['apropos_vision','<p>Nous croyons en un Congo prospère, une Afrique transformée par une génération de leaders instruits, ancrés dans des valeurs bibliques et porteurs d\'une vision internationale. Chaque élève qui sort de nos portes porte en lui le potentiel de changer son milieu.</p>','textarea','apropos','Page À Propos — Vision (HTML)'],
    ['apropos_histoire','<p>Fondée avec la conviction profonde que l\'éducation de qualité est le pilier du développement national, King\'s School International a ouvert ses portes en 2015 sous l\'impulsion de Metanoia Ministries International.</p><p>Depuis ses débuts, l\'école n\'a cessé de grandir — en nombre d\'élèves, en qualité d\'enseignement, et en impact communautaire. Aujourd\'hui, elle accueille des élèves de la maternelle au secondaire dans un environnement académique rigoureux, chaleureux et profondément ancré dans la foi chrétienne.</p>','textarea','apropos','Page À Propos — Histoire (HTML)'],
    ['apropos_valeurs','[{"icon":"🎓","titre":"Excellence Académique"},{"icon":"✝️","titre":"Foi Chrétienne"},{"icon":"⚖️","titre":"Discipline & Intégrité"},{"icon":"👑","titre":"Leadership Serviteur"},{"icon":"🌍","titre":"Vision Internationale"},{"icon":"❤️","titre":"Service Communautaire"},{"icon":"🤝","titre":"Esprit d\'Équipe"},{"icon":"💡","titre":"Innovation"}]','json','apropos','Page À Propos — Valeurs (JSON)'],
    ['apropos_video_titre','Découvrez King\'s School en vidéo','text','apropos','Page À Propos — Titre section vidéos'],
    ['apropos_videos','[]','json','apropos','Page À Propos — Liens vidéos (JSON: [{url,titre,description}])'],
    ['apropos_galerie_extra','[]','json','apropos','Page À Propos — Photos supplémentaires (JSON: [url,...])'],
    ['apropos_cta_titre','Rejoignez la famille King\'s School','text','apropos','Page À Propos — Titre CTA'],
    ['apropos_cta_texte','Inscrivez votre enfant dès aujourd\'hui et offrez-lui une éducation d\'excellence ancrée dans des valeurs chrétiennes.','textarea','apropos','Page À Propos — Texte CTA'],
    ['apropos_stat_eleves','450+','text','apropos','Page À Propos — Stat élèves'],
    ['apropos_stat_profs','30+','text','apropos','Page À Propos — Stat enseignants'],
    ['apropos_stat_reussite','95%','text','apropos','Page À Propos — Stat réussite'],
    ['apropos_stat_annees','10+','text','apropos','Page À Propos — Stat années'],
  ];
  for (const [cle,valeur,type,section,libelle] of defaults) {
    const exists = await dbGet('SELECT cle FROM site_content WHERE cle=?',[cle]);
    if (!exists) await dbRun('INSERT INTO site_content (cle,valeur,type,section,libelle) VALUES (?,?,?,?,?)',[cle,valeur,type,section,libelle]);
  }

  const admin = await dbGet('SELECT id FROM users WHERE email=?',[ADMIN_EMAIL]);
  if(!admin) {
    const hash=bcrypt.hashSync(ADMIN_PASSWORD,10);
    await dbRun("INSERT INTO users (name,email,password,role) VALUES (?,?,?,'admin')",['Administrateur',ADMIN_EMAIL,hash]);
    console.log(`✅ Compte admin créé : ${ADMIN_EMAIL}`);
  }

  console.log('\n╔════════════════════════════════════════╗');
  console.log("║  King's School — Serveur démarré ✅    ║");
  console.log(`║  http://localhost:${PORT}                  ║`);
  console.log('╚════════════════════════════════════════╝\n');
}

initDb().catch(e => { console.error('❌ Erreur initialisation BD :', e.message); process.exit(1); });

// ════════ Auth middlewares ════════
function verifierToken(req,res,next) {
  const token=(req.headers['authorization']||'').split(' ')[1];
  if(!token) return res.status(401).json({message:'Authentification requise.'});
  jwt.verify(token,JWT_SECRET,(err,decoded)=>{
    if(err) return res.status(401).json({message:'Session expirée. Reconnectez-vous.'});
    req.user=decoded; next();
  });
}
function verifierRoles(...roles) {
  return (req,res,next)=>verifierToken(req,res,()=>{
    if(!roles.includes(req.user.role)) return res.status(403).json({message:'Accès refusé pour votre rôle.'});
    next();
  });
}

// ════════ Routes publiques Auth ════════
app.post('/api/register', async (req,res)=>{
  const name=nettoyerTexte(req.body.name,100), email=(req.body.email||'').toLowerCase().trim(), password=req.body.password||'';
  if(name.length<2) return res.status(400).json({message:'Nom trop court.'});
  if(!emailValide(email)) return res.status(400).json({message:'Email invalide.'});
  if(password.length<6) return res.status(400).json({message:'Mot de passe trop court.'});
  try {
    if(await dbGet('SELECT id FROM users WHERE email=?',[email])) return res.status(409).json({message:'Email déjà utilisé.'});
    const hash=bcrypt.hashSync(password,10);
    const r=await dbRun("INSERT INTO users (name,email,password,role) VALUES (?,?,?,'user')",[name,email,hash]);
    console.log(`[INSCRIPTION] ${name} (${email})`);
    res.status(201).json({message:'Compte créé.',user:{id:r.lastID,name,email}});
  } catch(e) { res.status(500).json({message:'Erreur serveur.'}); }
});

app.post('/api/login', async (req,res)=>{
  const email=(req.body.email||'').toLowerCase().trim(), password=req.body.password||'';
  if(!email||!password) return res.status(400).json({message:'Email et mot de passe requis.'});
  try {
    const attempt=await dbGet('SELECT * FROM login_attempts WHERE email=?',[email]);
    if(attempt?.locked_until && new Date(attempt.locked_until)>new Date()) {
      const mins=Math.ceil((new Date(attempt.locked_until)-new Date())/60000);
      return res.status(429).json({message:`Compte bloqué. Réessayez dans ${mins} minute(s).`});
    }
    const user=await dbGet('SELECT * FROM users WHERE email=?',[email]);
    if(!user||!bcrypt.compareSync(password,user.password)) {
      const nb=(attempt?.attempts||0)+1;
      const locked=nb>=MAX_ATTEMPTS?new Date(Date.now()+LOCK_DURATION_MS).toISOString():null;
      if(attempt) await dbRun('UPDATE login_attempts SET attempts=?,locked_until=? WHERE email=?',[nb,locked,email]);
      else await dbRun('INSERT INTO login_attempts (email,attempts,locked_until) VALUES (?,?,?)',[email,nb,locked]);
      return res.status(401).json({message:'Email ou mot de passe incorrect.'});
    }
    await dbRun('DELETE FROM login_attempts WHERE email=?',[email]);
    const token=jwt.sign({id:user.id,name:user.name,email:user.email,role:user.role},JWT_SECRET,{expiresIn:JWT_EXPIRES_IN});
    console.log(`[CONNEXION] ${user.name}`);
    res.json({message:'Connexion réussie.',token,user:{id:user.id,name:user.name,email:user.email,role:user.role}});
  } catch(e) { res.status(500).json({message:'Erreur serveur.'}); }
});

// ════════ Contact public ════════
app.post('/api/contact', async (req,res)=>{
  const {name,email,telephone,message}=req.body;
  if(!name||!email||!message) return res.status(400).json({message:'Champs requis manquants.'});
  if(!emailValide(email)) return res.status(400).json({message:'Email invalide.'});
  try {
    await dbRun('INSERT INTO messages (name,email,telephone,message) VALUES (?,?,?,?)',[nettoyerTexte(name,100),email.toLowerCase(),nettoyerTexte(telephone||'',30),nettoyerTexte(message,2000)]);
    envoyerNotification('nouveau_message',{from:name});
    res.status(201).json({message:'Message envoyé.'});
  } catch(e) { res.status(500).json({message:'Erreur serveur.'}); }
});

// ════════ Pré-inscription publique ════════
app.post('/api/preinscription', async (req,res)=>{
  const {nom_enfant,age,classe_visee,nom_parent,email_parent,telephone,message}=req.body;
  if(!nom_enfant||!classe_visee||!nom_parent||!email_parent) return res.status(400).json({message:'Champs requis manquants.'});
  if(!emailValide(email_parent)) return res.status(400).json({message:'Email invalide.'});
  try {
    await dbRun('INSERT INTO preinscriptions (nom_enfant,age,classe_visee,nom_parent,email_parent,telephone,message) VALUES (?,?,?,?,?,?,?)',
      [nettoyerTexte(nom_enfant,100),parseInt(age)||null,nettoyerTexte(classe_visee,100),nettoyerTexte(nom_parent,100),email_parent.toLowerCase(),nettoyerTexte(telephone,30),nettoyerTexte(message,1000)]);
    envoyerNotification('nouvelle_preinscription',{nom:nom_enfant});
    res.status(201).json({message:'Pré-inscription reçue.'});
  } catch(e) { res.status(500).json({message:'Erreur serveur.'}); }
});

// ════════ Routes publiques CMS ════════
app.get('/api/actualites', async (req,res)=>{
  try {
    const {page,limit,offset}=clampPagination(req.query.page,req.query.limit||6);
    const total=await dbGet('SELECT COUNT(*) as c FROM actualites');
    const items=await dbAll('SELECT * FROM actualites ORDER BY created_at DESC LIMIT ? OFFSET ?',[limit,offset]);
    res.json({actualites:items,total:total.c,page,limit,totalPages:Math.max(1,Math.ceil(total.c/limit))});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});
app.get('/api/equipe', async (_,res)=>{
  try { res.json(await dbAll('SELECT * FROM equipe ORDER BY ordre ASC, created_at ASC')); }
  catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});
app.get('/api/temoignages', async (_,res)=>{
  try { res.json(await dbAll('SELECT * FROM temoignages ORDER BY created_at DESC')); }
  catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});
app.get('/api/faq', async (_,res)=>{
  try { res.json(await dbAll('SELECT * FROM faq ORDER BY ordre ASC, created_at ASC')); }
  catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

// ════════ SSE Notifications (admin) ════════
app.get('/api/admin/notifications/stream', (req, res) => {
  // EventSource ne peut pas envoyer d'Authorization header
  // → on accepte le token en query param ?token=xxx
  const token = (req.headers['authorization'] || '').split(' ')[1] || req.query.token || '';
  if (!token) { res.status(401).end(); return; }
  let decoded;
  try { decoded = jwt.verify(token, JWT_SECRET); }
  catch(e) { res.status(401).end(); return; }
  if (!['admin','moderateur','editeur','technicien'].includes(decoded.role)) {
    res.status(403).end(); return;
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();
  // Envoyer un ping initial pour confirmer la connexion
  res.write('data: {"type":"ping"}\n\n');
  const client = { id: Date.now(), res };
  sseClients.push(client);
  req.on('close', () => { sseClients = sseClients.filter(c => c.id !== client.id); });
});

// ════════ Notifications utilisateurs — routes ════════

// Récupérer ses propres notifications (utilisateur connecté)
app.get('/api/notifications', verifierToken, async (req,res)=>{
  try {
    const notifs = await dbAll(
      `SELECT * FROM user_notifications
       WHERE (user_id=? OR user_email=? OR user_id IS NULL)
       ORDER BY created_at DESC LIMIT 50`,
      [req.user.id, req.user.email]
    );
    res.json(notifs);
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

// Marquer une notification comme lue
app.put('/api/notifications/:id/lu', verifierToken, async (req,res)=>{
  try {
    await dbRun('UPDATE user_notifications SET lu=1 WHERE id=? AND (user_id=? OR user_id IS NULL)', [req.params.id, req.user.id]);
    res.json({message:'Notification lue.'});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

// Marquer toutes comme lues
app.put('/api/notifications/lu/all', verifierToken, async (req,res)=>{
  try {
    await dbRun('UPDATE user_notifications SET lu=1 WHERE (user_id=? OR user_email=? OR user_id IS NULL)', [req.user.id, req.user.email]);
    res.json({message:'Toutes les notifications marquées comme lues.'});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

// ★ Admin : envoyer une notification (à tous, à un user précis, ou par email)
// Rôles autorisés : admin, technicien, moderateur
app.post('/api/admin/notifications/envoyer', verifierRoles('admin','technicien','moderateur'), async (req,res)=>{
  const { titre, contenu, type, cible, user_id, user_email } = req.body;
  if(!titre||!contenu) return res.status(400).json({message:'Titre et contenu requis.'});
  const typeValide = ['info','succes','alerte','promotion'].includes(type) ? type : 'info';
  try {
    if(cible === 'tous') {
      // Notif globale (user_id NULL = pour tout le monde)
      await dbRun('INSERT INTO user_notifications (user_id, user_email, titre, contenu, type) VALUES (NULL, NULL, ?, ?, ?)',
        [nettoyerTexte(titre,200), nettoyerTexte(contenu,1000), typeValide]);
    } else if(cible === 'user' && user_id) {
      const u = await dbGet('SELECT id,email FROM users WHERE id=?',[user_id]);
      if(!u) return res.status(404).json({message:'Utilisateur introuvable.'});
      await dbRun('INSERT INTO user_notifications (user_id, user_email, titre, contenu, type) VALUES (?, ?, ?, ?, ?)',
        [u.id, u.email, nettoyerTexte(titre,200), nettoyerTexte(contenu,1000), typeValide]);
    } else if(cible === 'email' && user_email) {
      const u = await dbGet('SELECT id FROM users WHERE email=?',[user_email.toLowerCase()]);
      await dbRun('INSERT INTO user_notifications (user_id, user_email, titre, contenu, type) VALUES (?, ?, ?, ?, ?)',
        [u?.id||null, user_email.toLowerCase(), nettoyerTexte(titre,200), nettoyerTexte(contenu,1000), typeValide]);
    } else {
      return res.status(400).json({message:'Cible invalide.'});
    }
    await enregistrerActivite(req.user,'envoi_notification',titre.slice(0,60));
    res.status(201).json({message:'Notification envoyée.'});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

// ★ Admin : liste des notifications envoyées
app.get('/api/admin/notifications', verifierRoles('admin','technicien','moderateur'), async (req,res)=>{
  try {
    const {page,limit,offset}=clampPagination(req.query.page,req.query.limit||20);
    const total=await dbGet('SELECT COUNT(*) as c FROM user_notifications');
    const items=await dbAll('SELECT * FROM user_notifications ORDER BY created_at DESC LIMIT ? OFFSET ?',[limit,offset]);
    res.json({notifications:items,total:total.c,page,limit,totalPages:Math.max(1,Math.ceil(total.c/limit))});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

// ★ Admin : supprimer une notification
app.delete('/api/admin/notifications/:id', verifierRoles('admin','technicien'), async (req,res)=>{
  try {
    await dbRun('DELETE FROM user_notifications WHERE id=?',[req.params.id]);
    res.json({message:'Notification supprimée.'});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

// ════════ Admin — Stats ════════
app.get('/api/admin/stats', verifierRoles('admin','moderateur','editeur','technicien'), async (req,res)=>{
  try {
    const total    =await dbGet("SELECT COUNT(*) as c FROM users WHERE role='user'");
    const today    =await dbGet("SELECT COUNT(*) as c FROM users WHERE date(created_at)=date('now') AND role='user'");
    const week     =await dbGet("SELECT COUNT(*) as c FROM users WHERE created_at>=datetime('now','-7 days') AND role='user'");
    const messages =await dbGet('SELECT COUNT(*) as c FROM messages');
    const unread   =await dbGet('SELECT COUNT(*) as c FROM messages WHERE lu=0');
    const actus    =await dbGet('SELECT COUNT(*) as c FROM actualites');
    const equipe   =await dbGet('SELECT COUNT(*) as c FROM equipe');
    const preinsc  =await dbGet('SELECT COUNT(*) as c FROM preinscriptions');
    const preinscNew=await dbGet("SELECT COUNT(*) as c FROM preinscriptions WHERE statut='nouveau'");
    const notifCount=await dbGet('SELECT COUNT(*) as c FROM user_notifications');
    const faqCount  =await dbGet('SELECT COUNT(*) as c FROM faq');
    const galerieCount=await dbGet('SELECT COUNT(*) as c FROM galerie');
    const temoCount =await dbGet('SELECT COUNT(*) as c FROM temoignages');
    const inscriptions14=await dbAll(`SELECT date(created_at) as jour, COUNT(*) as nb FROM users WHERE created_at>=datetime('now','-14 days') AND role='user' GROUP BY jour ORDER BY jour ASC`);
    const msgParMois=await dbAll(`SELECT strftime('%Y-%m',created_at) as mois, COUNT(*) as nb FROM messages WHERE created_at>=datetime('now','-6 months') GROUP BY mois ORDER BY mois ASC`);
    const roles=await dbAll("SELECT role, COUNT(*) as nb FROM users GROUP BY role");
    // Taille de la base de données
    let dbSize = '—';
    try {
      const s = require('fs').statSync(DB_PATH);
      dbSize = s.size < 1024*1024 ? Math.round(s.size/1024)+' Ko' : Math.round(s.size/1024/1024)+' Mo';
    } catch(_) {}
    res.json({total:total.c,today:today.c,week:week.c,messages:messages.c,unread:unread.c,actus:actus.c,equipe:equipe.c,preinscriptions:preinsc.c,preinscriptionsNouvelles:preinscNew.c,notifications:notifCount.c,faq:faqCount.c,galerie:galerieCount.c,temoignages:temoCount.c,dbSize,inscriptions14,msgParMois,roles});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

// ════════ Admin — Utilisateurs ════════
app.get('/api/admin/users', verifierRoles('admin','technicien'), async (req,res)=>{
  try {
    const {page,limit,offset}=clampPagination(req.query.page,req.query.limit||20);
    const search=`%${(req.query.search||'').trim()}%`;
    const role=req.query.role||'';
    const where=role?`AND role=?`:'';
    const params=role?[search,search,role,limit,offset]:[search,search,limit,offset];
    const total=await dbGet(`SELECT COUNT(*) as c FROM users WHERE (name LIKE ? OR email LIKE ?) ${where}`,[search,search,...(role?[role]:[])]);
    const users=await dbAll(`SELECT id,name,email,role,created_at FROM users WHERE (name LIKE ? OR email LIKE ?) ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,params);
    res.json({users,total:total.c,page,limit,totalPages:Math.max(1,Math.ceil(total.c/limit))});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

app.put('/api/admin/users/:id/role', verifierRoles('admin'), async (req,res)=>{
  const role=req.body.role;
  if(!ROLES_VALIDES.includes(role)) return res.status(400).json({message:'Rôle invalide.'});
  try {
    const user=await dbGet('SELECT name FROM users WHERE id=?',[req.params.id]);
    await dbRun('UPDATE users SET role=? WHERE id=?',[role,req.params.id]);
    await enregistrerActivite(req.user,'changement_role',`${user?.name} → ${role}`);
    res.json({message:'Rôle mis à jour.'});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

app.put('/api/admin/users/:id', verifierRoles('admin'), async (req,res)=>{
  const {name,email,password} = req.body;
  if(!name||!email) return res.status(400).json({message:'Nom et email requis.'});
  try {
    const existing = await dbGet('SELECT id FROM users WHERE email=? AND id!=?',[email.toLowerCase(),req.params.id]);
    if(existing) return res.status(409).json({message:'Cet email est déjà utilisé.'});
    if(password && password.length>=6) {
      const hash = bcrypt.hashSync(password,10);
      await dbRun('UPDATE users SET name=?,email=?,password=? WHERE id=?',[nettoyerTexte(name,100),email.toLowerCase(),hash,req.params.id]);
    } else {
      await dbRun('UPDATE users SET name=?,email=? WHERE id=?',[nettoyerTexte(name,100),email.toLowerCase(),req.params.id]);
    }
    await enregistrerActivite(req.user,'modification_utilisateur',name);
    res.json({message:'Utilisateur mis à jour.'});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

app.delete('/api/admin/users/:id', verifierRoles('admin'), async (req,res)=>{
  try {
    const user=await dbGet('SELECT name FROM users WHERE id=?',[req.params.id]);
    await dbRun("DELETE FROM users WHERE id=? AND role!='admin'",[req.params.id]);
    await enregistrerActivite(req.user,'suppression_utilisateur',user?.name||'');
    res.json({message:'Utilisateur supprimé.'});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

// ════════ Techniciens — gestion multi (max 5, admin uniquement) ════════
const MAX_TECHNICIENS = 5;

// Liste tous les techniciens
app.get('/api/admin/techniciens', verifierRoles('admin'), async (_,res)=>{
  try {
    const list=await dbAll("SELECT id,name,email,created_at FROM users WHERE role='technicien' ORDER BY created_at ASC");
    res.json(list);
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

// Créer un technicien (max 5)
app.post('/api/admin/techniciens', verifierRoles('admin'), async (req,res)=>{
  const name=nettoyerTexte(req.body.name||'',100);
  const email=(req.body.email||'').toLowerCase().trim();
  const password=req.body.password||'';
  if(name.length<2) return res.status(400).json({message:'Nom trop court (min. 2 caractères).'});
  if(!emailValide(email)) return res.status(400).json({message:'Email invalide.'});
  if(password.length<6) return res.status(400).json({message:'Mot de passe requis (min. 6 caractères).'});
  if(email===ADMIN_EMAIL) return res.status(400).json({message:'Cet email est réservé à l\'administrateur.'});
  try {
    const count=await dbGet("SELECT COUNT(*) as c FROM users WHERE role='technicien'");
    if(count.c>=MAX_TECHNICIENS) return res.status(400).json({message:`Maximum ${MAX_TECHNICIENS} techniciens autorisés.`});
    // Vérifier conflit email avec n'importe quel autre compte (technicien ou non)
    const conflict=await dbGet('SELECT id,name,role FROM users WHERE email=?',[email]);
    if(conflict && conflict.role==='technicien') return res.status(409).json({message:'Un technicien avec cet email existe déjà. Modifiez-le plutôt que d\'en créer un nouveau.'});
    if(conflict && conflict.role==='admin') return res.status(409).json({message:'Cet email est réservé au compte administrateur.'});
    if(conflict && conflict.role==='user') return res.status(409).json({message:`Cet email est déjà utilisé par un compte inscrit (${conflict.name}). Allez dans "Utilisateurs" et changez son rôle en "technicien", ou utilisez un autre email.`});
    if(conflict) return res.status(409).json({message:'Cet email est déjà utilisé par un autre compte.'});
    const hash=bcrypt.hashSync(password,10);
    const r=await dbRun("INSERT INTO users (name,email,password,role) VALUES (?,?,?,'technicien')",[name,email,hash]);
    await enregistrerActivite(req.user,'creation_technicien',`${name} (${email})`);
    res.status(201).json({message:'Compte technicien créé.',id:r.lastID});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

// Modifier un technicien (nom, email, mdp optionnel)
app.put('/api/admin/techniciens/:id', verifierRoles('admin'), async (req,res)=>{
  const id=parseInt(req.params.id);
  const name=nettoyerTexte(req.body.name||'',100);
  const email=(req.body.email||'').toLowerCase().trim();
  const password=req.body.password||'';
  if(name.length<2) return res.status(400).json({message:'Nom trop court.'});
  if(!emailValide(email)) return res.status(400).json({message:'Email invalide.'});
  if(email===ADMIN_EMAIL) return res.status(400).json({message:'Cet email est réservé à l\'administrateur.'});
  try {
    const tech=await dbGet("SELECT id,email FROM users WHERE id=? AND role='technicien'",[id]);
    if(!tech) return res.status(404).json({message:'Technicien introuvable.'});
    // Conflit : un autre compte utilise déjà ce nouvel email (en excluant le technicien lui-même)
    const conflict=await dbGet('SELECT id,name,role FROM users WHERE email=? AND id!=?',[email,id]);
    if(conflict) {
      if(conflict.role==='technicien') {
        // Doublon technicien (héritage ancien système) : supprimer le doublon silencieusement
        await dbRun('DELETE FROM users WHERE id=?',[conflict.id]);
      } else if(conflict.role==='admin') {
        return res.status(409).json({message:'Cet email est réservé au compte administrateur.'});
      } else {
        // Compte utilisateur normal (inscrit via le portail) qui possède cet email :
        // on le met à jour en technicien pour éviter le doublon
        if(password && password.length>=6) {
          const hash=bcrypt.hashSync(password,10);
          await dbRun("UPDATE users SET name=?,role='technicien',password=? WHERE id=?",[name,hash,conflict.id]);
        } else {
          await dbRun("UPDATE users SET name=?,role='technicien' WHERE id=?",[name,conflict.id]);
        }
        // Supprimer l'ancien enregistrement technicien (l'ID change vers conflict.id)
        await dbRun('DELETE FROM users WHERE id=?',[id]);
        await enregistrerActivite(req.user,'modification_technicien',`${name} (${email}) — fusion compte existant`);
        return res.json({message:'Technicien mis à jour (compte existant réutilisé).'});
      }
    }
    // Mise à jour normale
    if(password){
      if(password.length<6) return res.status(400).json({message:'Mot de passe trop court (min. 6 caractères).'});
      const hash=bcrypt.hashSync(password,10);
      await dbRun('UPDATE users SET name=?,email=?,password=? WHERE id=?',[name,email,hash,id]);
      await enregistrerActivite(req.user,'reset_mdp_technicien',`${name} (${email})`);
    } else {
      await dbRun('UPDATE users SET name=?,email=? WHERE id=?',[name,email,id]);
    }
    await enregistrerActivite(req.user,'modification_technicien',`${name} (${email})`);
    res.json({message:'Technicien mis à jour.'});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

// Supprimer un technicien
app.delete('/api/admin/techniciens/:id', verifierRoles('admin'), async (req,res)=>{
  try {
    const tech=await dbGet("SELECT id,name,email FROM users WHERE id=? AND role='technicien'",[req.params.id]);
    if(!tech) return res.status(404).json({message:'Technicien introuvable.'});
    await dbRun('DELETE FROM users WHERE id=?',[tech.id]);
    await enregistrerActivite(req.user,'suppression_technicien',`${tech.name} (${tech.email})`);
    res.json({message:'Compte technicien supprimé.'});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

// ════════ Mon Compte — Changer son propre mot de passe (admin ou technicien) ════════
app.put('/api/admin/mon-compte/password', verifierRoles('admin','technicien'), async (req,res)=>{
  const {ancien_password, nouveau_password} = req.body;
  if(!ancien_password||!nouveau_password) return res.status(400).json({message:'Ancien et nouveau mot de passe requis.'});
  if(nouveau_password.length<6) return res.status(400).json({message:'Nouveau mot de passe trop court (min. 6 caractères).'});
  if(ancien_password===nouveau_password) return res.status(400).json({message:'Le nouveau mot de passe doit être différent de l\'ancien.'});
  try {
    const user=await dbGet('SELECT * FROM users WHERE id=?',[req.user.id]);
    if(!user) return res.status(404).json({message:'Compte introuvable.'});
    if(!bcrypt.compareSync(ancien_password,user.password)) return res.status(401).json({message:'Mot de passe actuel incorrect.'});
    const hash=bcrypt.hashSync(nouveau_password,10);
    await dbRun('UPDATE users SET password=? WHERE id=?',[hash,user.id]);
    await enregistrerActivite(req.user,'changement_mot_de_passe',user.role==='technicien'?`Technicien : ${user.name} (${user.email})`:'');
    // Si c'est un technicien, insérer une notification pour l'admin
    if(user.role==='technicien'){
      const adminUser=await dbGet("SELECT id,email FROM users WHERE role='admin' LIMIT 1");
      if(adminUser) await dbRun('INSERT INTO user_notifications (user_id,user_email,titre,contenu,type) VALUES (?,?,?,?,?)',
        [adminUser.id,adminUser.email,'🔐 Changement de mot de passe technicien',
        `Le technicien ${user.name} (${user.email}) vient de changer son mot de passe.\n\n📋 Nouveau mot de passe : ${nouveau_password}\n\n⚠️ Notez ce mot de passe dans un endroit sûr si vous en avez besoin pour administrer ce compte.`,'alerte']);
    }
    res.json({message:'Mot de passe mis à jour avec succès.'});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

// Changer son propre email (admin uniquement — confirmation par mot de passe)
app.put('/api/admin/mon-compte/email', verifierRoles('admin'), async (req,res)=>{
  const {password, nouvel_email} = req.body;
  const email = (nouvel_email||'').toLowerCase().trim();
  if(!password) return res.status(400).json({message:'Mot de passe requis pour confirmer le changement.'});
  if(!emailValide(email)) return res.status(400).json({message:'Nouvel email invalide.'});
  try {
    const user=await dbGet('SELECT * FROM users WHERE id=?',[req.user.id]);
    if(!user) return res.status(404).json({message:'Compte introuvable.'});
    if(!bcrypt.compareSync(password,user.password)) return res.status(401).json({message:'Mot de passe incorrect.'});
    if(email===user.email) return res.status(400).json({message:'Ce nouvel email est identique à l\'email actuel.'});
    const conflict=await dbGet('SELECT id FROM users WHERE email=? AND id!=?',[email,user.id]);
    if(conflict) return res.status(409).json({message:'Cet email est déjà utilisé par un autre compte.'});
    await dbRun('UPDATE users SET email=? WHERE id=?',[email,user.id]);
    await enregistrerActivite(req.user,'changement_email',`→ ${email}`);
    res.json({message:'Email mis à jour avec succès.', nouvel_email: email});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

// ════════ Admin — Messages ════════
app.get('/api/admin/messages', verifierRoles('admin','moderateur','technicien'), async (req,res)=>{
  try {
    const {page,limit,offset}=clampPagination(req.query.page,req.query.limit||20);
    const search=`%${(req.query.search||'').trim()}%`;
    const lu=req.query.lu;
    const where=lu!==undefined&&lu!==''?`AND lu=?`:'';
    const params=lu!==undefined&&lu!==''?[search,search,parseInt(lu),limit,offset]:[search,search,limit,offset];
    const total=await dbGet(`SELECT COUNT(*) as c FROM messages WHERE (name LIKE ? OR email LIKE ?) ${where}`,[search,search,...(lu!==undefined&&lu!==''?[parseInt(lu)]:[])]);
    const msgs=await dbAll(`SELECT * FROM messages WHERE (name LIKE ? OR email LIKE ?) ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,params);
    res.json({messages:msgs,total:total.c,page,limit,totalPages:Math.max(1,Math.ceil(total.c/limit))});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

app.put('/api/admin/messages/:id/lu', verifierRoles('admin','moderateur','technicien'), async (req,res)=>{
  try {
    await dbRun('UPDATE messages SET lu=1 WHERE id=?',[req.params.id]);
    res.json({message:'Marqué comme lu.'});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

app.delete('/api/admin/messages/:id', verifierRoles('admin','moderateur','technicien'), async (req,res)=>{
  try {
    await dbRun('DELETE FROM messages WHERE id=?',[req.params.id]);
    await enregistrerActivite(req.user,'suppression_message',`Message #${req.params.id}`);
    res.json({message:'Message supprimé.'});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

// ════════ Admin — Actualités ════════
app.get('/api/admin/actualites', verifierRoles('admin','editeur','technicien'), async (req,res)=>{
  try {
    const {page,limit,offset}=clampPagination(req.query.page,req.query.limit||9);
    const total=await dbGet('SELECT COUNT(*) as c FROM actualites');
    const items=await dbAll('SELECT * FROM actualites ORDER BY created_at DESC LIMIT ? OFFSET ?',[limit,offset]);
    res.json({actualites:items,total:total.c,page,limit,totalPages:Math.max(1,Math.ceil(total.c/limit))});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});
app.post('/api/admin/actualites', verifierRoles('admin','editeur','technicien'), async (req,res)=>{
  const titre=nettoyerTexte(req.body.titre,200),contenu=nettoyerTexte(req.body.contenu,5000),image=nettoyerTexte(req.body.image,300);
  if(!titre||!contenu) return res.status(400).json({message:'Titre et contenu requis.'});
  try {
    const r=await dbRun('INSERT INTO actualites (titre,contenu,image,auteur) VALUES (?,?,?,?)',[titre,contenu,image,req.user.name]);
    await enregistrerActivite(req.user,'creation_actualite',titre);
    envoyerNotification('nouvelle_actualite',{titre});
    res.status(201).json({message:'Actualité publiée.',id:r.lastID});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});
app.put('/api/admin/actualites/:id', verifierRoles('admin','editeur','technicien'), async (req,res)=>{
  const titre=nettoyerTexte(req.body.titre,200),contenu=nettoyerTexte(req.body.contenu,5000),image=nettoyerTexte(req.body.image,300);
  if(!titre||!contenu) return res.status(400).json({message:'Titre et contenu requis.'});
  try {
    await dbRun("UPDATE actualites SET titre=?,contenu=?,image=?,updated_at=datetime('now') WHERE id=?",[titre,contenu,image,req.params.id]);
    await enregistrerActivite(req.user,'modification_actualite',titre);
    res.json({message:'Actualité mise à jour.'});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});
app.delete('/api/admin/actualites/:id', verifierRoles('admin','editeur','technicien'), async (req,res)=>{
  try {
    const item=await dbGet('SELECT titre FROM actualites WHERE id=?',[req.params.id]);
    await dbRun('DELETE FROM actualites WHERE id=?',[req.params.id]);
    if(item) await enregistrerActivite(req.user,'suppression_actualite',item.titre);
    res.json({message:'Actualité supprimée.'});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

// ════════ Admin — Équipe ════════
app.get('/api/admin/equipe', verifierRoles('admin','editeur','technicien'), async (_,res)=>{
  try { res.json(await dbAll('SELECT * FROM equipe ORDER BY ordre ASC')); }
  catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});
app.post('/api/admin/equipe', verifierRoles('admin','editeur','technicien'), async (req,res)=>{
  const {nom,poste,photo,bio,ordre}=req.body;
  if(!nom||!poste) return res.status(400).json({message:'Nom et poste requis.'});
  try {
    const r=await dbRun('INSERT INTO equipe (nom,poste,photo,bio,ordre) VALUES (?,?,?,?,?)',[nettoyerTexte(nom,100),nettoyerTexte(poste,150),nettoyerTexte(photo,300),nettoyerTexte(bio,500),parseInt(ordre)||0]);
    await enregistrerActivite(req.user,'creation_membre_equipe',nom);
    res.status(201).json({message:'Membre ajouté.',id:r.lastID});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});
app.put('/api/admin/equipe/:id', verifierRoles('admin','editeur','technicien'), async (req,res)=>{
  const {nom,poste,photo,bio,ordre}=req.body;
  if(!nom||!poste) return res.status(400).json({message:'Nom et poste requis.'});
  try {
    await dbRun('UPDATE equipe SET nom=?,poste=?,photo=?,bio=?,ordre=? WHERE id=?',[nettoyerTexte(nom,100),nettoyerTexte(poste,150),nettoyerTexte(photo,300),nettoyerTexte(bio,500),parseInt(ordre)||0,req.params.id]);
    res.json({message:'Membre mis à jour.'});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});
app.delete('/api/admin/equipe/:id', verifierRoles('admin','editeur','technicien'), async (req,res)=>{
  try { await dbRun('DELETE FROM equipe WHERE id=?',[req.params.id]); res.json({message:'Membre supprimé.'}); }
  catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

// ════════ Admin — FAQ ════════
app.get('/api/admin/faq', verifierRoles('admin','editeur','technicien'), async (_,res)=>{
  try { res.json(await dbAll('SELECT * FROM faq ORDER BY ordre ASC')); }
  catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});
app.post('/api/admin/faq', verifierRoles('admin','editeur','technicien'), async (req,res)=>{
  const {question,reponse,categorie,ordre}=req.body;
  if(!question||!reponse) return res.status(400).json({message:'Question et réponse requises.'});
  try {
    const r=await dbRun('INSERT INTO faq (question,reponse,categorie,ordre) VALUES (?,?,?,?)',[nettoyerTexte(question,300),nettoyerTexte(reponse,2000),nettoyerTexte(categorie,100)||'general',parseInt(ordre)||0]);
    await enregistrerActivite(req.user,'creation_faq',question.slice(0,60));
    res.status(201).json({message:'FAQ ajoutée.',id:r.lastID});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});
app.put('/api/admin/faq/:id', verifierRoles('admin','editeur','technicien'), async (req,res)=>{
  const {question,reponse,categorie,ordre}=req.body;
  if(!question||!reponse) return res.status(400).json({message:'Question et réponse requises.'});
  try {
    await dbRun('UPDATE faq SET question=?,reponse=?,categorie=?,ordre=? WHERE id=?',[nettoyerTexte(question,300),nettoyerTexte(reponse,2000),nettoyerTexte(categorie,100)||'general',parseInt(ordre)||0,req.params.id]);
    res.json({message:'FAQ mise à jour.'});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});
app.delete('/api/admin/faq/:id', verifierRoles('admin','editeur','technicien'), async (req,res)=>{
  try { await dbRun('DELETE FROM faq WHERE id=?',[req.params.id]); res.json({message:'FAQ supprimée.'}); }
  catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

// ════════ Admin — Témoignages ════════
app.get('/api/admin/temoignages', verifierRoles('admin','editeur','technicien'), async (_,res)=>{
  try { res.json(await dbAll('SELECT * FROM temoignages ORDER BY created_at DESC')); }
  catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});
app.post('/api/admin/temoignages', verifierRoles('admin','editeur','technicien'), async (req,res)=>{
  const {nom,role,texte,photo,note}=req.body;
  if(!nom||!texte) return res.status(400).json({message:'Nom et texte requis.'});
  try {
    const r=await dbRun('INSERT INTO temoignages (nom,role,texte,photo,note) VALUES (?,?,?,?,?)',[nettoyerTexte(nom,100),nettoyerTexte(role,100),nettoyerTexte(texte,1000),nettoyerTexte(photo,300),Math.min(5,Math.max(1,parseInt(note)||5))]);
    res.status(201).json({message:'Témoignage ajouté.',id:r.lastID});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});
app.put('/api/admin/temoignages/:id', verifierRoles('admin','editeur','technicien'), async (req,res)=>{
  const {nom,role,texte,photo,note}=req.body;
  if(!nom||!texte) return res.status(400).json({message:'Nom et texte requis.'});
  try {
    await dbRun('UPDATE temoignages SET nom=?,role=?,texte=?,photo=?,note=? WHERE id=?',[nettoyerTexte(nom,100),nettoyerTexte(role,100),nettoyerTexte(texte,1000),nettoyerTexte(photo,300),Math.min(5,Math.max(1,parseInt(note)||5)),req.params.id]);
    res.json({message:'Témoignage mis à jour.'});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});
app.delete('/api/admin/temoignages/:id', verifierRoles('admin','editeur','technicien'), async (req,res)=>{
  try { await dbRun('DELETE FROM temoignages WHERE id=?',[req.params.id]); res.json({message:'Témoignage supprimé.'}); }
  catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

// ════════ Admin — Pré-inscriptions ════════
app.get('/api/admin/preinscriptions', verifierRoles('admin','moderateur','technicien'), async (req,res)=>{
  try {
    const {page,limit,offset}=clampPagination(req.query.page,req.query.limit||20);
    const statut=req.query.statut||'';
    const where=statut?'WHERE statut=?':'';
    const total=await dbGet(`SELECT COUNT(*) as c FROM preinscriptions ${where}`,statut?[statut]:[]);
    const items=await dbAll(`SELECT * FROM preinscriptions ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,statut?[statut,limit,offset]:[limit,offset]);
    res.json({preinscriptions:items,total:total.c,page,limit,totalPages:Math.max(1,Math.ceil(total.c/limit))});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});
app.put('/api/admin/preinscriptions/:id', verifierRoles('admin','moderateur','technicien'), async (req,res)=>{
  const {nom_enfant,age,classe_visee,nom_parent,email_parent,telephone,message,statut} = req.body;
  if(!nom_enfant||!classe_visee||!nom_parent||!email_parent) return res.status(400).json({message:'Champs requis manquants.'});
  try {
    await dbRun('UPDATE preinscriptions SET nom_enfant=?,age=?,classe_visee=?,nom_parent=?,email_parent=?,telephone=?,message=?,statut=? WHERE id=?',
      [nettoyerTexte(nom_enfant,100),parseInt(age)||null,nettoyerTexte(classe_visee,100),nettoyerTexte(nom_parent,100),email_parent.toLowerCase(),nettoyerTexte(telephone||'',30),nettoyerTexte(message||'',1000),statut||'nouveau',req.params.id]);
    await enregistrerActivite(req.user,'modification_preinscription',nom_enfant);
    res.json({message:'Pré-inscription mise à jour.'});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

// ★ Mise à jour du statut + envoi automatique d'une notification à l'email parent
app.put('/api/admin/preinscriptions/:id/statut', verifierRoles('admin','moderateur','technicien'), async (req,res)=>{
  const statut=req.body.statut;
  if(!['nouveau','en_cours','accepte','refuse'].includes(statut)) return res.status(400).json({message:'Statut invalide.'});
  try {
    const preinsc = await dbGet('SELECT * FROM preinscriptions WHERE id=?',[req.params.id]);
    if(!preinsc) return res.status(404).json({message:'Pré-inscription introuvable.'});
    await dbRun('UPDATE preinscriptions SET statut=? WHERE id=?',[statut,req.params.id]);
    await enregistrerActivite(req.user,'maj_preinscription',`#${req.params.id} → ${statut}`);

    // ★ Envoi automatique de la notification à l'email du parent
    const user = await dbGet('SELECT id FROM users WHERE email=?',[preinsc.email_parent]);
    let titreNotif, contenuNotif;
    if(statut === 'accepte') {
      titreNotif = `✅ Pré-inscription acceptée — ${preinsc.nom_enfant}`;
      contenuNotif = `Bonjour ${preinsc.nom_parent}, nous avons le plaisir de vous informer que la pré-inscription de ${preinsc.nom_enfant} pour la classe de ${preinsc.classe_visee} a été acceptée. Notre équipe va vous recontacter prochainement pour finaliser l'inscription. Bienvenue dans la famille King's School International !`;
    } else if(statut === 'refuse') {
      titreNotif = `❌ Pré-inscription non retenue — ${preinsc.nom_enfant}`;
      contenuNotif = `Bonjour ${preinsc.nom_parent}, après étude de votre dossier, nous sommes au regret de vous informer que la pré-inscription de ${preinsc.nom_enfant} pour la classe de ${preinsc.classe_visee} n'a pas pu être retenue cette année. Nous vous remercions de l'intérêt que vous portez à King's School International.`;
    } else if(statut === 'en_cours') {
      titreNotif = `⏳ Dossier en cours d'examen — ${preinsc.nom_enfant}`;
      contenuNotif = `Bonjour ${preinsc.nom_parent}, nous vous informons que le dossier de pré-inscription de ${preinsc.nom_enfant} est actuellement en cours d'examen par notre équipe. Nous reviendrons vers vous prochainement.`;
    }
    if(titreNotif) {
      await dbRun('INSERT INTO user_notifications (user_id, user_email, titre, contenu, type) VALUES (?, ?, ?, ?, ?)',
        [user?.id||null, preinsc.email_parent, titreNotif, contenuNotif,
         statut==='accepte'?'succes':statut==='refuse'?'alerte':'info']);
    }
    res.json({message:'Statut mis à jour.', notificationEnvoyee: !!titreNotif});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

app.delete('/api/admin/preinscriptions/:id', verifierRoles('admin'), async (req,res)=>{
  try { await dbRun('DELETE FROM preinscriptions WHERE id=?',[req.params.id]); res.json({message:'Supprimée.'}); }
  catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

// ════════ Admin — Journal ════════
app.get('/api/admin/activity', verifierRoles('admin'), async (req,res)=>{
  try {
    const {page,limit,offset}=clampPagination(req.query.page,req.query.limit||20);
    const total=await dbGet('SELECT COUNT(*) as c FROM activity_log');
    const logs=await dbAll('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ? OFFSET ?',[limit,offset]);
    res.json({logs,total:total.c,page,limit,totalPages:Math.max(1,Math.ceil(total.c/limit))});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

// ════════ Admin — Export ════════
app.get('/api/admin/export/:type/:format', verifierRoles('admin'), async (req,res)=>{
  const {type,format}=req.params;
  if(!['users','messages','preinscriptions'].includes(type)) return res.status(400).json({message:'Type invalide.'});
  if(!['xlsx','pdf'].includes(format)) return res.status(400).json({message:'Format invalide.'});
  try {
    let data, columns, title;
    if(type==='users') {
      data=await dbAll('SELECT id,name,email,role,created_at FROM users ORDER BY created_at DESC');
      columns=[{header:'ID',key:'id',width:8},{header:'Nom',key:'name',width:28},{header:'Email',key:'email',width:32},{header:'Rôle',key:'role',width:15},{header:'Inscrit le',key:'created_at',width:20}];
      title="Liste des utilisateurs";
    } else if(type==='messages') {
      data=await dbAll('SELECT * FROM messages ORDER BY created_at DESC');
      columns=[{header:'ID',key:'id',width:8},{header:'Nom',key:'name',width:25},{header:'Email',key:'email',width:30},{header:'Téléphone',key:'telephone',width:18},{header:'Message',key:'message',width:50},{header:'Lu',key:'lu',width:8},{header:'Reçu le',key:'created_at',width:20}];
      title="Messages reçus";
    } else {
      data=await dbAll('SELECT * FROM preinscriptions ORDER BY created_at DESC');
      columns=[{header:'ID',key:'id',width:8},{header:'Enfant',key:'nom_enfant',width:25},{header:'Âge',key:'age',width:8},{header:'Classe',key:'classe_visee',width:15},{header:'Parent',key:'nom_parent',width:25},{header:'Email',key:'email_parent',width:30},{header:'Tél.',key:'telephone',width:15},{header:'Statut',key:'statut',width:12},{header:'Date',key:'created_at',width:20}];
      title="Pré-inscriptions";
    }
    if(format==='xlsx') {
      const wb=new ExcelJS.Workbook();
      const sh=wb.addWorksheet(title);
      sh.columns=columns;
      sh.getRow(1).font={bold:true};
      data.forEach(r=>sh.addRow(r));
      res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition',`attachment; filename=${type}.xlsx`);
      await wb.xlsx.write(res); res.end();
    } else {
      res.setHeader('Content-Type','application/pdf');
      res.setHeader('Content-Disposition',`attachment; filename=${type}.pdf`);
      const doc=new PDFDocument({margin:40}); doc.pipe(res);
      doc.fontSize(16).text(`King's School International — ${title}`,{align:'center'}).moveDown().fontSize(9);
      data.forEach((r,i)=>{ doc.text(`${i+1}. ${JSON.stringify(r)}`).moveDown(0.3); });
      doc.end();
    }
    await enregistrerActivite(req.user,'export',`${type} (${format})`);
  } catch(e){ if(!res.headersSent) res.status(500).json({message:'Erreur export.'}); }
});

// ════════ Site Content — Route publique ════════
app.get('/api/site-content', async (_,res)=>{
  try {
    res.set('Cache-Control','no-store');
    const rows = await dbAll('SELECT cle,valeur FROM site_content');
    const obj = {};
    rows.forEach(r => obj[r.cle] = r.valeur);
    res.json(obj);
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

// ════════ Site Content — Admin ════════
app.get('/api/admin/site-content', verifierRoles('admin','editeur','technicien'), async (_,res)=>{
  try {
    const rows = await dbAll('SELECT * FROM site_content ORDER BY section ASC, libelle ASC');
    res.json(rows);
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

app.put('/api/admin/site-content/:cle', verifierRoles('admin','editeur','technicien'), async (req,res)=>{
  const valeur = req.body.valeur ?? '';
  const cle    = req.params.cle;
  // Liste blanche des clés autorisées (toutes celles déclarées dans les defaults)
  const CLES_AUTORISEES = [
    // Hero
    'hero_titre','hero_description','hero_image','hero_btn1_texte','hero_btn2_texte','hero_phrases',
    // Chiffres
    'chiffres_titre','chiffres_sous_titre','chiffre_fondation','chiffre_eleves','chiffre_reussite','chiffre_profs',
    // À propos (section principale)
    'apropos_titre','apropos_p1','apropos_p2','apropos_citation','apropos_citation_auteur','apropos_p3','apropos_image',
    // Valeurs, programmes, galerie
    'valeurs_titre','valeurs_sous_titre','valeurs_items',
    'programmes_titre','programmes_sous_titre','programmes_items',
    'galerie_titre','galerie_sous_titre','galerie_items',
    // Contact — coordonnées + réseaux sociaux (liste complète)
    'contact_adresse','contact_telephone','contact_email','contact_horaires',
    'contact_facebook','contact_instagram','contact_whatsapp','contact_youtube','contact_twitter','contact_tiktok',
    // Page À Propos étendue
    'apropos_mission','apropos_vision','apropos_histoire','apropos_valeurs',
    'apropos_video_titre','apropos_videos','apropos_galerie_extra',
    'apropos_cta_titre','apropos_cta_texte',
    'apropos_stat_eleves','apropos_stat_profs','apropos_stat_reussite','apropos_stat_annees',
  ];
  if (!CLES_AUTORISEES.includes(cle)) return res.status(404).json({message:'Clé inconnue.'});
  try {
    // Upsert : met à jour si existe, insère sinon (utile si la DB existait avant l'ajout de certains champs)
    const existing = await dbGet('SELECT cle FROM site_content WHERE cle=?',[cle]);
    if (existing) {
      await dbRun("UPDATE site_content SET valeur=?,updated_at=datetime('now') WHERE cle=?",[String(valeur).slice(0,10000),cle]);
    } else {
      await dbRun("INSERT INTO site_content (cle,valeur,type,section,libelle) VALUES (?,?,'text','apropos',?)",[cle,String(valeur).slice(0,10000),cle]);
    }
    await enregistrerActivite(req.user,'maj_contenu_site',cle);
    res.json({message:'Contenu mis à jour.'});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

// ════════ Upload image depuis l'ordi local ════════
app.post('/api/admin/upload', verifierRoles('admin','editeur','technicien'), upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Aucun fichier reçu.' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url, filename: req.file.filename, size: req.file.size });
});

// ════════ Galerie — Route publique ════════
app.get('/api/galerie', async (_,res)=>{
  try { res.json(await dbAll('SELECT * FROM galerie ORDER BY ordre ASC, created_at ASC')); }
  catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

// ════════ Admin — Galerie CRUD ════════
app.get('/api/admin/galerie', verifierRoles('admin','editeur','technicien'), async (_,res)=>{
  try { res.json(await dbAll('SELECT * FROM galerie ORDER BY ordre ASC, created_at ASC')); }
  catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

app.post('/api/admin/galerie', verifierRoles('admin','editeur','technicien'), async (req,res)=>{
  const {image,titre,description,categorie,ordre} = req.body;
  if(!image) return res.status(400).json({message:'URL de l\'image requise.'});
  try {
    const maxOrdre = await dbGet('SELECT MAX(ordre) as m FROM galerie');
    const nextOrdre = (maxOrdre.m || 0) + 1;
    const r = await dbRun(
      'INSERT INTO galerie (image,titre,description,categorie,ordre) VALUES (?,?,?,?,?)',
      [nettoyerTexte(image,500), nettoyerTexte(titre||'',150), nettoyerTexte(description||'',500), nettoyerTexte(categorie||'general',50), parseInt(ordre)||nextOrdre]
    );
    await enregistrerActivite(req.user,'ajout_galerie',titre||image);
    res.status(201).json({message:'Photo ajoutée.',id:r.lastID});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

app.put('/api/admin/galerie/:id', verifierRoles('admin','editeur','technicien'), async (req,res)=>{
  const {image,titre,description,categorie,ordre} = req.body;
  if(!image) return res.status(400).json({message:'URL de l\'image requise.'});
  try {
    await dbRun(
      'UPDATE galerie SET image=?,titre=?,description=?,categorie=?,ordre=? WHERE id=?',
      [nettoyerTexte(image,500), nettoyerTexte(titre||'',150), nettoyerTexte(description||'',500), nettoyerTexte(categorie||'general',50), parseInt(ordre)||0, req.params.id]
    );
    res.json({message:'Photo mise à jour.'});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

app.delete('/api/admin/galerie/:id', verifierRoles('admin','editeur','technicien'), async (req,res)=>{
  try {
    await dbRun('DELETE FROM galerie WHERE id=?',[req.params.id]);
    await enregistrerActivite(req.user,'suppression_galerie',`Photo #${req.params.id}`);
    res.json({message:'Photo supprimée.'});
  } catch(e){ res.status(500).json({message:'Erreur serveur.'}); }
});

app.listen(PORT);
