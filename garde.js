// ════════════════════════════════════════════════════════
//  garde.js — Profil utilisateur + Notifications
//  Protection double-chargement incluse
// ════════════════════════════════════════════════════════
if (window._ksiGardeCharge) { /* déjà chargé, on arrête */ }
else {
window._ksiGardeCharge = true;
(function() {
  const API = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3000'
    : 'https://king-s-school.onrender.com';

  const userStr = localStorage.getItem('ksi_user');
  const token   = localStorage.getItem('ksi_token');
  const btnNav  = document.getElementById('nav-auth-btn');

  if (!userStr) {
    if (btnNav) { btnNav.textContent = 'Connexion'; btnNav.href = 'portail.html'; }
    return;
  }

  const user = JSON.parse(userStr);
  let notifCount = 0, notifData = [];

  const ICONS   = { succes:'✅', alerte:'⚠️', promotion:'🎁', info:'ℹ️' };
  const COLORS  = { succes:'#16a34a', alerte:'#d97706', promotion:'#b45309', info:'#2563eb' };
  const BGSICON = { succes:'#f0fdf4', alerte:'#fffbeb', promotion:'#fef3c7', info:'#eff6ff' };
  const LABELS  = { succes:'Succès', alerte:'Alerte', promotion:'Promotion', info:'Info' };

  // ══════════════════════════════════════════════
  //  CSS
  // ══════════════════════════════════════════════
  const css = document.createElement('style');
  css.textContent = `
  /* ── Bouton profil nav ── */
  #ksi-wrap { position:relative; display:inline-flex; align-items:center; }
  #ksi-btn {
    display:inline-flex; align-items:center; gap:.45rem;
    background:none; border:none; padding:0;
    color:#333; font-size:.9rem; font-weight:500;
    cursor:pointer; font-family:inherit; position:relative; white-space:nowrap;
  }
  #ksi-btn:hover { color:#1e3a8a; }
  #ksi-avatar {
    width:30px; height:30px; border-radius:50%;
    background:linear-gradient(135deg,#1e3a8a,#2563eb);
    color:#fff; font-size:.72rem; font-weight:700;
    display:flex; align-items:center; justify-content:center; flex-shrink:0;
  }
  #ksi-badge {
    position:absolute; top:-6px; right:-8px;
    background:#ef4444; color:#fff; border-radius:50%;
    width:16px; height:16px; font-size:.58rem; font-weight:800;
    display:none; align-items:center; justify-content:center; line-height:1;
  }

  /* ── Dropdown ── */
  #ksi-drop {
    display:none; position:absolute; top:calc(100% + 14px); right:0;
    background:#fff; border-radius:16px; width:330px;
    box-shadow:0 16px 48px rgba(0,0,0,.15); border:1px solid #e8edf3;
    z-index:10000; overflow:hidden;
  }
  #ksi-drop.open { display:block; animation:ksiFd .15s ease; }
  @keyframes ksiFd { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:none} }

  .ksi-dh {
    padding:.9rem 1.1rem .8rem; display:flex; align-items:center;
    gap:.8rem; border-bottom:1px solid #f0f3f8;
  }
  .ksi-dha {
    width:42px; height:42px; border-radius:50%; flex-shrink:0;
    background:linear-gradient(135deg,#1e3a8a,#2563eb);
    color:#fff; font-size:1rem; font-weight:700;
    display:flex; align-items:center; justify-content:center;
  }
  .ksi-dhn { font-size:.93rem; font-weight:700; color:#1e293b; }
  .ksi-dhe { font-size:.7rem; color:#94a3b8; margin-top:.1rem; }

  .ksi-dsec {
    padding:.6rem 1.1rem .25rem;
    font-size:.64rem; font-weight:700; text-transform:uppercase;
    letter-spacing:.07em; color:#94a3b8;
    display:flex; justify-content:space-between; align-items:center;
  }
  #ksi-btn-all {
    font-size:.66rem; color:#2563eb; cursor:pointer;
    border:none; background:none; font-family:inherit; font-weight:700; padding:0;
  }
  #ksi-btn-all:hover { text-decoration:underline; }

  .ksi-nl { max-height:195px; overflow-y:auto; }
  .ksi-ni {
    padding:.55rem 1.1rem; border-bottom:1px solid #f8fafc;
    display:flex; gap:.65rem; align-items:flex-start;
    cursor:pointer; transition:background .12s;
  }
  .ksi-ni:hover { background:#f8fafc; }
  .ksi-ni.unread { background:#f0f7ff; }
  .ksi-ni.unread:hover { background:#e2effe; }
  .ksi-dot {
    width:7px; height:7px; border-radius:50%;
    flex-shrink:0; margin-top:.38rem; opacity:0;
  }
  .ksi-ni.unread .ksi-dot { opacity:1; }
  .t-info .ksi-dot      { background:#2563eb; }
  .t-succes .ksi-dot    { background:#16a34a; }
  .t-alerte .ksi-dot    { background:#d97706; }
  .t-promotion .ksi-dot { background:#b45309; }
  .ksi-nb { flex:1; min-width:0; }
  .ksi-nt { font-size:.79rem; font-weight:600; color:#1e293b; line-height:1.3; }
  .ksi-nx {
    font-size:.71rem; color:#64748b; margin-top:.08rem; line-height:1.35;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }
  .ksi-ntime { font-size:.63rem; color:#b0bec5; margin-top:.12rem; }
  .ksi-empty { padding:1.1rem; text-align:center; color:#b0bec5; font-size:.8rem; }

  .ksi-act {
    border-top:1px solid #f0f3f8; padding:.35rem .45rem;
    display:flex; gap:.25rem;
  }
  .ksi-abtn {
    display:flex; align-items:center; gap:.5rem; flex:1;
    padding:.55rem .7rem; background:none; border:none; border-radius:9px;
    font-size:.78rem; font-weight:500; color:#374151;
    cursor:pointer; font-family:inherit; transition:background .12s;
  }
  .ksi-abtn:hover { background:#f1f5f9; }
  .ksi-abtn.dng { color:#dc2626; }
  .ksi-abtn.dng:hover { background:#fff1f2; }

  /* ── Overlay commun ── */
  .ksi-overlay {
    display:none; position:fixed; inset:0;
    background:rgba(15,23,42,.52);
    z-index:999998; align-items:center; justify-content:center;
    padding:1rem;
  }
  .ksi-overlay.open { display:flex; animation:ksiFd .17s ease; }

  /* ── Modale notif unique ── */
  #ksi-m1 { z-index:999999; }
  #ksi-m1-box {
    background:#fff; border-radius:20px; width:100%; max-width:460px;
    box-shadow:0 28px 70px rgba(0,0,0,.22); overflow:hidden; position:relative;
  }
  #ksi-m1-head {
    padding:1.2rem 1.3rem 1rem; border-bottom:1px solid #f0f3f8;
    display:flex; gap:.9rem; align-items:flex-start;
  }
  #ksi-m1-ic {
    width:44px; height:44px; border-radius:13px; flex-shrink:0;
    display:flex; align-items:center; justify-content:center; font-size:1.25rem;
  }
  #ksi-m1-type { font-size:.66rem; font-weight:700; text-transform:uppercase; letter-spacing:.07em; margin-bottom:.3rem; }
  #ksi-m1-titre { font-size:1.05rem; font-weight:700; color:#1e293b; line-height:1.35; }
  #ksi-m1-body { padding:1.1rem 1.3rem 1.3rem; }
  #ksi-m1-txt { font-size:.91rem; color:#374151; line-height:1.78; white-space:pre-wrap; }
  #ksi-m1-time {
    font-size:.7rem; color:#94a3b8; margin-top:.9rem;
    padding-top:.7rem; border-top:1px solid #f5f7fa;
  }
  #ksi-m1-close {
    position:absolute; top:.85rem; right:.85rem;
    background:#f1f5f9; border:none; border-radius:50%;
    width:28px; height:28px; font-size:.85rem;
    cursor:pointer; color:#64748b; display:flex; align-items:center; justify-content:center;
  }
  #ksi-m1-close:hover { background:#e2e8f0; color:#1e293b; }

  /* ── Modale toutes notifs ── */
  #ksi-m2 { z-index:999999; }
  #ksi-m2-box {
    background:#fff; border-radius:20px; width:100%; max-width:500px;
    max-height:80vh; box-shadow:0 28px 70px rgba(0,0,0,.22);
    display:flex; flex-direction:column; overflow:hidden;
  }
  #ksi-m2-head {
    padding:1.1rem 1.3rem .9rem; border-bottom:1px solid #f0f3f8;
    display:flex; align-items:center; justify-content:space-between; flex-shrink:0;
  }
  #ksi-m2-head h3 { font-size:1rem; font-weight:700; color:#1e293b; }
  #ksi-m2-sub { font-size:.72rem; color:#94a3b8; margin-top:.15rem; }
  #ksi-m2-close {
    background:#f1f5f9; border:none; border-radius:50%;
    width:28px; height:28px; font-size:.85rem;
    cursor:pointer; color:#64748b; display:flex; align-items:center; justify-content:center; flex-shrink:0;
  }
  #ksi-m2-close:hover { background:#e2e8f0; color:#1e293b; }
  #ksi-m2-list { overflow-y:auto; flex:1; padding:.5rem .8rem .8rem; }

  .ksi-card {
    border:1.5px solid #f0f3f8; border-radius:14px;
    padding:.85rem 1rem; margin-bottom:.5rem;
    display:flex; gap:.85rem; cursor:pointer;
    transition:border-color .14s, box-shadow .14s, background .14s;
    align-items:flex-start;
  }
  .ksi-card:hover { border-color:#bfdbfe; box-shadow:0 4px 16px rgba(37,99,235,.09); background:#fafcff; }
  .ksi-card.unread { background:#f0f7ff; border-color:#bfdbfe; }
  .ksi-card.unread:hover { background:#dbeafe; }
  .ksi-card-ic {
    width:40px; height:40px; border-radius:11px;
    display:flex; align-items:center; justify-content:center;
    font-size:1.15rem; flex-shrink:0;
  }
  .ksi-card-body { flex:1; min-width:0; }
  .ksi-card-title { font-size:.84rem; font-weight:700; color:#1e293b; margin-bottom:.18rem; line-height:1.3; }
  .ksi-card-prev {
    font-size:.76rem; color:#64748b; line-height:1.5;
    display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
  }
  .ksi-card-foot { display:flex; align-items:center; gap:.5rem; margin-top:.35rem; }
  .ksi-card-time { font-size:.65rem; color:#b0bec5; }
  .ksi-badge-type {
    font-size:.58rem; font-weight:700; text-transform:uppercase;
    padding:.1rem .42rem; border-radius:5px; letter-spacing:.04em;
  }

  .ct-info     .ksi-card-ic { background:#eff6ff; }
  .ct-info     .ksi-badge-type { background:#dbeafe; color:#1d4ed8; }
  .ct-succes   .ksi-card-ic { background:#f0fdf4; }
  .ct-succes   .ksi-badge-type { background:#dcfce7; color:#15803d; }
  .ct-alerte   .ksi-card-ic { background:#fffbeb; }
  .ct-alerte   .ksi-badge-type { background:#fef9c3; color:#92400e; }
  .ct-promotion .ksi-card-ic { background:#fdf8e7; }
  .ct-promotion .ksi-badge-type { background:#fef3c7; color:#92400e; }

  .ksi-empty-big {
    text-align:center; padding:2.5rem 1rem; color:#94a3b8; font-size:.88rem;
  }
  .ksi-empty-big em { display:block; font-size:2.2rem; margin-bottom:.6rem; font-style:normal; }
  `;
  document.head.appendChild(css);

  // ══════════════════════════════════════════════
  //  BOUTON NAV
  // ══════════════════════════════════════════════
  const initials = user.name.trim().split(/\s+/).map(n=>n[0]).join('').slice(0,2).toUpperCase();

  const wrap = document.createElement('div');
  wrap.id = 'ksi-wrap';

  const btn = document.createElement('button');
  btn.id = 'ksi-btn';
  const displayName = user.name ? user.name.split(' ')[0] : 'Profil';
  btn.innerHTML = `<span id="ksi-avatar">${initials}</span><span id="ksi-display-name">${escHtml(displayName)}</span><span id="ksi-badge"></span>`;

  const drop = document.createElement('div');
  drop.id = 'ksi-drop';
  drop.innerHTML = `
    <div class="ksi-dh">
      <div class="ksi-dha">${initials}</div>
      <div>
        <div class="ksi-dhn">${escHtml(user.name)}</div>
        <div class="ksi-dhe">${escHtml(user.email)}</div>
      </div>
    </div>
    <div class="ksi-dsec">
      Notifications
      <button id="ksi-btn-all">Tout voir</button>
    </div>
    <div class="ksi-nl" id="ksi-nl">
      <div class="ksi-empty">Chargement…</div>
    </div>
    <div class="ksi-act">
      <button class="ksi-abtn" id="ksi-btn-switch">🔄 Changer de compte</button>
      <button class="ksi-abtn dng" id="ksi-btn-deco">🚪 Déconnexion</button>
    </div>`;

  wrap.appendChild(btn);
  wrap.appendChild(drop);

  if (btnNav && btnNav.parentNode) {
    btnNav.parentNode.replaceChild(wrap, btnNav);
  }

  const banniere = document.getElementById('banniere-inscription');
  if (banniere) banniere.style.display = 'none';

  // Toggle dropdown
  btn.addEventListener('click', e => {
    e.stopPropagation();
    drop.classList.toggle('open');
    if (drop.classList.contains('open')) chargerNotifs();
  });
  document.addEventListener('click', e => {
    if (!wrap.contains(e.target)) drop.classList.remove('open');
  });

  drop.querySelector('#ksi-btn-all').addEventListener('click', () => ouvrirToutesNotifs());
  drop.querySelector('#ksi-btn-switch').addEventListener('click', () => {
    localStorage.removeItem('ksi_user'); localStorage.removeItem('ksi_token');
    location.href = 'portail.html';
  });
  drop.querySelector('#ksi-btn-deco').addEventListener('click', () => {
    if (confirm('Voulez-vous vous déconnecter ?')) {
      localStorage.removeItem('ksi_user'); localStorage.removeItem('ksi_token');
      location.href = 'portail.html';
    }
  });

  // ══════════════════════════════════════════════
  //  MODALE 1 — Détail d'une notification
  // ══════════════════════════════════════════════
  const m1 = document.createElement('div');
  m1.id = 'ksi-m1';
  m1.className = 'ksi-overlay';
  m1.innerHTML = `
    <div id="ksi-m1-box">
      <button id="ksi-m1-close">✕</button>
      <div id="ksi-m1-head">
        <div id="ksi-m1-ic"></div>
        <div>
          <div id="ksi-m1-type"></div>
          <div id="ksi-m1-titre"></div>
        </div>
      </div>
      <div id="ksi-m1-body">
        <div id="ksi-m1-txt"></div>
        <div id="ksi-m1-time"></div>
      </div>
    </div>`;
  document.documentElement.appendChild(m1);
  m1.querySelector('#ksi-m1-close').addEventListener('click', () => m1.classList.remove('open'));
  m1.addEventListener('click', e => { if (e.target === m1) m1.classList.remove('open'); });

  // ══════════════════════════════════════════════
  //  MODALE 2 — Toutes les notifications
  // ══════════════════════════════════════════════
  const m2 = document.createElement('div');
  m2.id = 'ksi-m2';
  m2.className = 'ksi-overlay';
  m2.innerHTML = `
    <div id="ksi-m2-box">
      <div id="ksi-m2-head">
        <div>
          <h3>📬 Mes notifications</h3>
          <div id="ksi-m2-sub"></div>
        </div>
        <button id="ksi-m2-close">✕</button>
      </div>
      <div id="ksi-m2-list"></div>
    </div>`;
  document.documentElement.appendChild(m2);
  m2.querySelector('#ksi-m2-close').addEventListener('click', () => m2.classList.remove('open'));
  m2.addEventListener('click', e => { if (e.target === m2) m2.classList.remove('open'); });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { m1.classList.remove('open'); m2.classList.remove('open'); }
  });

  // ══════════════════════════════════════════════
  //  LOGIQUE NOTIFICATIONS
  // ══════════════════════════════════════════════
  async function chargerNotifs() {
    if (!token) { document.getElementById('ksi-nl').innerHTML = '<div class="ksi-empty">Reconnectez-vous.</div>'; return; }
    try {
      const r = await fetch(`${API}/api/notifications`, { headers:{ 'Authorization':'Bearer '+token } });
      if (!r.ok) throw new Error();
      notifData = await r.json();
      afficherDrop();
    } catch(e) {
      document.getElementById('ksi-nl').innerHTML = '<div class="ksi-empty">⚠️ Serveur inaccessible</div>';
    }
  }

  function afficherDrop() {
    const nl = document.getElementById('ksi-nl');
    if (!notifData.length) {
      nl.innerHTML = '<div class="ksi-empty">Aucune notification</div>';
      majBadge(0); return;
    }
    nl.innerHTML = notifData.slice(0, 8).map((n, i) => `
      <div class="ksi-ni t-${n.type} ${n.lu?'':'unread'}" data-idx="${i}">
        <span class="ksi-dot"></span>
        <div class="ksi-nb">
          <div class="ksi-nt">${escHtml(n.titre)}</div>
          <div class="ksi-nx">${escHtml(n.contenu)}</div>
          <div class="ksi-ntime">${fmtDate(n.created_at)}</div>
        </div>
      </div>`).join('');
    majBadge(notifData.filter(n => !n.lu).length);

    nl.querySelectorAll('.ksi-ni').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx);
        const n = notifData[idx];
        if (!n) return;
        if (el.classList.contains('unread')) marquerLu(n.id, el);
        drop.classList.remove('open');
        ouvrirDetail(n);
      });
    });
  }

  function ouvrirDetail(n) {
    const ic    = ICONS[n.type]  || 'ℹ️';
    const col   = COLORS[n.type] || '#2563eb';
    const bg    = BGSICON[n.type]|| '#eff6ff';
    const label = LABELS[n.type] || 'Info';

    const icEl = document.getElementById('ksi-m1-ic');
    icEl.textContent = ic;
    icEl.style.background = bg;

    const tpEl = document.getElementById('ksi-m1-type');
    tpEl.textContent = label;
    tpEl.style.color = col;

    document.getElementById('ksi-m1-titre').textContent = n.titre;
    document.getElementById('ksi-m1-txt').textContent   = n.contenu;
    document.getElementById('ksi-m1-time').textContent  = '🕐 ' + fmtDate(n.created_at);

    m1.classList.add('open');
  }

  function ouvrirToutesNotifs() {
    drop.classList.remove('open');

    // Marquer tout comme lu
    if (token) {
      fetch(`${API}/api/notifications/lu/all`, { method:'PUT', headers:{ 'Authorization':'Bearer '+token } })
        .then(() => { notifData.forEach(n => n.lu = 1); afficherDrop(); })
        .catch(() => {});
    }

    const list = document.getElementById('ksi-m2-list');
    const sub  = document.getElementById('ksi-m2-sub');

    if (!notifData.length) {
      sub.textContent = '';
      list.innerHTML = `<div class="ksi-empty-big"><em>📭</em>Aucune notification pour l'instant</div>`;
    } else {
      sub.textContent = `${notifData.length} notification${notifData.length>1?'s':''}`;
      list.innerHTML = notifData.map((n, i) => `
        <div class="ksi-card ct-${n.type} ${n.lu?'':'unread'}" data-idx="${i}">
          <div class="ksi-card-ic">${ICONS[n.type]||'ℹ️'}</div>
          <div class="ksi-card-body">
            <div class="ksi-card-title">${escHtml(n.titre)}</div>
            <div class="ksi-card-prev">${escHtml(n.contenu)}</div>
            <div class="ksi-card-foot">
              <span class="ksi-card-time">${fmtDate(n.created_at)}</span>
              <span class="ksi-badge-type">${LABELS[n.type]||'Info'}</span>
            </div>
          </div>
        </div>`).join('');

      list.querySelectorAll('.ksi-card').forEach(el => {
        el.addEventListener('click', () => {
          const n = notifData[parseInt(el.dataset.idx)];
          if (!n) return;
          m2.classList.remove('open');
          setTimeout(() => ouvrirDetail(n), 100);
        });
      });
    }

    m2.classList.add('open');
  }

  async function marquerLu(id, el) {
    el.classList.remove('unread');
    notifCount = Math.max(0, notifCount - 1);
    majBadge(notifCount);
    try {
      await fetch(`${API}/api/notifications/${id}/lu`, { method:'PUT', headers:{ 'Authorization':'Bearer '+token } });
    } catch(e) {}
  }

  function majBadge(n) {
    notifCount = n;
    const b = document.getElementById('ksi-badge');
    if (!b) return;
    if (n > 0) { b.style.display = 'flex'; b.textContent = n > 9 ? '9+' : n; }
    else b.style.display = 'none';
  }

  function escHtml(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function fmtDate(s) {
    if (!s) return '';
    const d = new Date(s), diff = Math.floor((Date.now() - d) / 1000);
    if (diff < 60)   return 'À l\'instant';
    if (diff < 3600) return `Il y a ${Math.floor(diff/60)} min`;
    if (diff < 86400)return `Il y a ${Math.floor(diff/3600)}h`;
    return d.toLocaleDateString('fr-FR', {day:'2-digit', month:'short', year:'numeric'});
  }

  // Badge initial
  if (token) {
    fetch(`${API}/api/notifications`, { headers:{ 'Authorization':'Bearer '+token } })
      .then(r => r.ok ? r.json() : [])
      .then(data => { notifData = data; majBadge(data.filter(n=>!n.lu).length); })
      .catch(() => {});
  }

  // Exports globaux — accessibles depuis index.html (overlays)
  window.ksiOuvrirDetail       = ouvrirDetail;
  window.ksiOuvrirToutesNotifs = ouvrirToutesNotifs;
  window.ksiGetNotifData       = () => notifData;

  window.ksiDeconnexion = window.deconnexion = () => {
    if (confirm('Voulez-vous vous déconnecter ?')) {
      localStorage.removeItem('ksi_user'); localStorage.removeItem('ksi_token');
      location.href = 'portail.html';
    }
  };

})();
} // fin protection double-chargement
