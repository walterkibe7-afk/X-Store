/* Elle Admin core — taxonomy enforced, API-driven with localStorage fallback. */
const Admin = (() => {
  const TAXONOMY = { Intimate: ['Toys','Lubricants'], Wellness: ['Body & Massage','Gummies','Self-Care'] };
  const MOCK_PRODUCTS = [
    { id:'silk-touch', name:'Silk Touch', category:'Intimate', subcategory:'Toys', price:59, active:1, badge:'BEST SELLER', updated:'Oct 7' },
    { id:'after-dark-oil', name:'After Dark Oil', category:'Wellness', subcategory:'Body & Massage', price:28, active:1, badge:'', updated:'Oct 6' },
    { id:'midnight-gummies', name:'Midnight Gummies', category:'Wellness', subcategory:'Gummies', price:24, active:1, badge:'NEW', updated:'Oct 5' }
  ];
  
  async function apiFetch(path, options = {}) {
    try {
      const res = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
      if (res.status === 401 && !path.includes('/login')) {
        location.href = 'login.html';
        return null;
      }
      return await res.json();
    } catch {
      return null;
    }
  }
  
  async function requireAuth() {
    const data = await apiFetch('/api/admin/me');
    if (!data || !data.admin) {
      if (!location.pathname.endsWith('login.html')) location.href = 'login.html';
      return false;
    }
    return true;
  }
  
  async function logout() {
    await apiFetch('/api/admin/logout', { method: 'POST' });
    location.href = 'login.html';
  }

  function shell(active, title, sub, actions, content) {
    const nav = [['dashboard','Dashboard','index.html'],['products','Products','products.html'],['orders','Orders','orders.html'],['customers','Customers','customers.html'],['settings','Settings','settings.html']];
    const icons = { dashboard:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>', products:'<path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>', orders:'<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>', customers:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', settings:'<circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.2 4.2l2.8 2.8M17 17l2.8 2.8M1 12h4M19 12h4M4.2 19.8L7 17M17 7l2.8-2.8"/>' };
    return '<div class="admin-layout"><aside class="admin-sidebar" id="sidebar">'
      + '<div class="brand"><div class="brand-mark">Elle</div><div class="brand-sub">Admin</div></div>'
      + '<nav class="sidebar-nav">' + nav.map(n => '<a class="nav-link' + (n[0]===active?' active':'') + '" href="'+n[2]+'"><svg viewBox="0 0 24 24">'+icons[n[0]]+'</svg>'+n[1]+'</a>').join('')
      + '<div class="nav-sep"></div>'
      + '<a class="nav-link" href="../index.html" target="_blank"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/></svg>View Store</a>'
      + '<button class="nav-link" data-logout><svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>Logout</button></nav>'
      + '<div class="sidebar-foot"><div class="admin-profile"><div class="avatar">A</div><div><strong>Admin</strong><span>Store Administrator</span></div></div></aside>'
      + '<div class="overlay" id="overlay"></div>'
      + '<main class="admin-main"><header class="admin-top"><button class="menu-btn" id="menuBtn" aria-label="Menu"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button><strong>'+title+'</strong></header>'
      + '<div class="page"><div class="page-head"><div><h1>'+title+'</h1><p>'+sub+'</p></div><div class="head-actions">'+actions+'</div></div>'
      + content + '</div></main></div><div class="toast-wrap" id="toasts"></div>';
  }
  function mount(active, title, sub, actions, content) {
    document.body.innerHTML = shell(active, title, sub, actions, content);
    const sb = document.getElementById('sidebar'), ov = document.getElementById('overlay');
    document.getElementById('menuBtn').onclick = () => { sb.classList.add('open'); ov.classList.add('open'); };
    ov.onclick = () => { sb.classList.remove('open'); ov.classList.remove('open'); };
    document.querySelector('[data-logout]').onclick = logout;
    document.querySelectorAll('.kebab > button').forEach(b => b.onclick = e => { e.stopPropagation(); b.parentElement.classList.toggle('open'); });
    document.addEventListener('click', () => document.querySelectorAll('.kebab.open').forEach(k => k.classList.remove('open')));
  }
  function toast(msg) { const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.getElementById('toasts').appendChild(t); setTimeout(()=>t.remove(),2600); }
  function esc(s){ return String(s||'').replace(/[&<>"]/g, c => ({'&':'&','<':'<','>':'>','"':'"'}[c])); }
  function pill(status){ return '<span class="pill p-'+status.toLowerCase()+'">'+esc(status)+'</span>'; }
  function badgeTag(b){ return b ? '<span class="badge-tag">'+esc(b)+'</span>' : '<span style="color:var(--text-2)">—</span>'; }
  function thumb(label){ return '<div class="thumb">'+esc(label||'Elle')+'</div>'; }
  return { TAXONOMY, MOCK_PRODUCTS, mount, toast, esc, pill, badgeTag, thumb, requireAuth, apiFetch, logout };
})();
window.Admin = Admin;
