// ════════════════════════════════════════════════════════
//  garde.js — Protection de index.html
//  Ce fichier est chargé par index.html pour vérifier
//  que l'utilisateur est bien connecté.
//  Si non connecté → renvoi vers portail.html
// ════════════════════════════════════════════════════════

(function() {
  const userStr = localStorage.getItem('ksi_user');
  if (!userStr) {
    // Pas connecté → portail
    window.location.href = 'portail.html';
    return;
  }

  // Utilisateur connecté → afficher la barre de bienvenue
  const user = JSON.parse(userStr);

  // Créer la barre en haut du site
  const bar = document.createElement('div');
  bar.id = 'ksi-userbar';
  bar.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 40px;
    background: #0f2460;
    color: white;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 5%;
    z-index: 9999;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 0.82rem;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  `;

  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:0.6rem;">
      <span>👑</span>
      <span style="color:#d4af37;font-weight:600;">King's School International</span>
      <span style="color:rgba(255,255,255,0.4);">|</span>
      <span style="color:rgba(255,255,255,0.8);">Bienvenue, <strong style="color:white;">${user.name}</strong></span>
    </div>
    <div style="display:flex;align-items:center;gap:1rem;">
      <a href="portail.html" style="color:rgba(255,255,255,0.6);text-decoration:none;font-size:0.78rem;transition:color .2s;"
         onmouseover="this.style.color='white'" onmouseout="this.style.color='rgba(255,255,255,0.6)'">
        Mon compte
      </a>
      <button onclick="deconnexion()" style="
        background: rgba(212,175,55,0.15);
        border: 1px solid rgba(212,175,55,0.4);
        color: #d4af37;
        padding: 0.25rem 0.8rem;
        border-radius: 20px;
        cursor: pointer;
        font-size: 0.78rem;
        font-family: inherit;
        transition: all .2s;
      "
      onmouseover="this.style.background='rgba(212,175,55,0.3)'"
      onmouseout="this.style.background='rgba(212,175,55,0.15)'"
      >
        Se déconnecter
      </button>
    </div>
  `;

  // Insérer la barre tout en haut de la page
  document.body.insertBefore(bar, document.body.firstChild);

  // Décaler le header existant pour ne pas qu'il soit caché sous la barre
  const header = document.querySelector('header');
  if (header) {
    const currentTop = parseInt(header.style.top) || 0;
    header.style.top = (currentTop + 40) + 'px';
  }

  // Aussi décaler le hero (margin-top)
  const hero = document.querySelector('.hero');
  if (hero) {
    const currentMargin = parseInt(hero.style.marginTop) || 90;
    hero.style.marginTop = (currentMargin + 40) + 'px';
  }

  // Fonction de déconnexion
  window.deconnexion = function() {
    if (confirm('Voulez-vous vous déconnecter ?')) {
      localStorage.removeItem('ksi_user');
      window.location.href = 'portail.html';
    }
  };
})();
