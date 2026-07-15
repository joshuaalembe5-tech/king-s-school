# 👑 King's School International — Guide de démarrage

## 📁 Structure de votre projet

```
king-school/
├── portail.html     ← Page de connexion/inscription (porte d'entrée)
├── index.html       ← Votre site King's School (intact, non modifié)
├── admin.html       ← Panel administrateur
├── server.js        ← Le serveur backend (Node.js)
├── package.json     ← Liste des outils nécessaires
├── LISEZ-MOI.md     ← Ce guide
└── database.db      ← Créé automatiquement au 1er lancement
```

---

## 🚀 Comment démarrer (à faire UNE SEULE FOIS)

### Étape 1 — Installer Node.js
1. Allez sur **https://nodejs.org**
2. Cliquez sur **"LTS"** (version stable)
3. Installez normalement

### Étape 2 — Préparer le dossier
1. Créez un dossier sur votre bureau, par exemple `king-school`
2. Mettez TOUS les fichiers dedans :
   - `portail.html`
   - `index.html` (votre site original)
   - `admin.html`
   - `server.js`
   - `package.json`
   - Votre dossier `images/`

### Étape 3 — Installer les outils (une seule fois)
1. Ouvrez le **Terminal** sur Mac :
   - Appuyez sur `Cmd + Espace`
   - Tapez "Terminal" et appuyez sur Entrée
2. Naviguez vers votre dossier :
   ```
   cd Desktop/king-school
   ```
3. Installez les dépendances :
   ```
   npm install
   ```
   *(attendez que c'est terminé — environ 30 secondes)*

### Étape 4 — Lancer le serveur
```
node server.js
```
Vous verrez :
```
╔════════════════════════════════════════╗
║  King's School — Serveur démarré ✅    ║
║  http://localhost:3000                  ║
╚════════════════════════════════════════╝
```

### Étape 5 — Ouvrir le site
Dans votre navigateur, allez sur :
- **http://localhost:3000/portail.html** → Page de connexion
- **http://localhost:3000/index.html** → Votre site
- **http://localhost:3000/admin.html** → Panel admin

---

## 🔑 Identifiants Admin par défaut

```
Email    : admin@kingsschool.cd
Mot de passe : admin123
```
⚠️ Changez ce mot de passe dans server.js après le premier test !

---

## 🔄 Comment ça fonctionne (explication simple)

```
[Visiteur sur portail.html]
         |
         | Remplit le formulaire
         ↓
[server.js reçoit les données]
         |
         | Vérifie et sauvegarde
         ↓
[database.db stocke l'utilisateur]
         |
         | Redirige vers le site
         ↓
[index.html — Votre site King's School]
```

### Les 4 outils qu'on utilise :
| Outil | Rôle |
|-------|------|
| **Express** | Crée le serveur web (reçoit les demandes) |
| **SQLite** | La base de données (stocke les utilisateurs) |
| **bcryptjs** | Chiffre les mots de passe (sécurité) |
| **cors** | Permet la communication HTML ↔ Serveur |

---

## ⚠️ Notes importantes

- Le serveur doit être **lancé à chaque fois** (`node server.js`)
- Si vous fermez le Terminal, le serveur s'arrête
- La base de données (`database.db`) se crée automatiquement
- Ne supprimez jamais `database.db` — vos données y sont stockées !

---

## 🆘 Problèmes courants

**"Cannot find module"** → Vous avez oublié `npm install`

**"Port already in use"** → Un autre serveur tourne. Tapez :
```
lsof -i :3000
kill -9 [le numéro affiché]
```

**Le site ne charge pas** → Vérifiez que le Terminal affiche bien "Serveur démarré"
