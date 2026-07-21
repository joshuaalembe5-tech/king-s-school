// ════════════════════════════════════════════════════════
//  garde.js — PHASE 0 : Détecteur de session (plus de blocage)
//  Ce fichier n'oblige plus l'utilisateur à se connecter.
//  Il affiche juste le nom de l'utilisateur s'il est connecté.
// ════════════════════════════════════════════════════════

(function() {
  const userStr = localStorage.getItem('ksi_user');

  // Mettre à jour le bouton nav selon l'état de connexion
  const btnNav = document.getElementById('nav-auth-btn');

  if (!userStr) {
    // Visiteur non connecté → afficher "Connexion"
    if (btnNav) {
      btnNav.textContent = 'Connexion';
      btnNav.href = 'portail.html';
    }
    return; // On ne bloque plus — le site est accessible librement
  }

  // ── Utilisateur connecté ──────────────────────────────
  const user = JSON.parse(userStr);

  // Mettre à jour le bouton nav → afficher son prénom
  if (btnNav) {
    btnNav.innerHTML = `👤 ${user.name.split(' ')[0]}`;
    btnNav.href = '#';
    btnNav.onclick = function(e) {
      e.preventDefault();
      if (confirm('Voulez-vous vous déconnecter ?')) {
        localStorage.removeItem('ksi_user');
        localStorage.removeItem('ksi_token');
        window.location.reload();
      }
    };
  }

  // Masquer la bannière d'invitation si elle existe
  const banniere = document.getElementById('banniere-inscription');
  if (banniere) banniere.style.display = 'none';

  // Fonction de déconnexion globale (accessible depuis le HTML si besoin)
  window.deconnexion = function() {
    if (confirm('Voulez-vous vous déconnecter ?')) {
      localStorage.removeItem('ksi_user');
      localStorage.removeItem('ksi_token');
      window.location.reload();
    }
  };
})();
