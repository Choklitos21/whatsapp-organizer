'use strict';

// ---------------------------------------------------------------------------
// DOM References
// ---------------------------------------------------------------------------
const screenQR      = document.getElementById('screen-qr');
const screenMain    = document.getElementById('screen-main');
const screenError   = document.getElementById('screen-error');
const screenLoading = document.getElementById('screen-loading');

const qrImg         = document.getElementById('qr-img');
const qrPlaceholder = document.getElementById('qr-placeholder');

const statusDot     = document.getElementById('status-dot');
const statusText    = document.getElementById('status-text');
const statusSpinner = document.getElementById('status-spinner');

const statToday   = document.getElementById('stat-today');
const statTotal   = document.getElementById('stat-total');
const statPath    = document.getElementById('stat-path');
const cardPath    = document.getElementById('card-path');

const logEmpty = document.getElementById('log-empty');
const logList  = document.getElementById('log-list');
const logCount = document.getElementById('log-count');

const btnOpenFolder = document.getElementById('btn-open-folder');
const btnClean      = document.getElementById('btn-clean');
const errorTitle    = document.getElementById('error-title');
const errorDesc     = document.getElementById('error-desc');
const daysInput     = document.getElementById('days-search');
const btnSweep      = document.getElementById('btn-sweep');
const checksMedia   = document.querySelectorAll('.media-check input[type="checkbox"]');
const btnLogout     = document.getElementById('btn-logout');
const initBarFill   = document.getElementById('init-bar-fill');
const initBarText   = document.getElementById('init-bar-text');
const initBar       = document.getElementById('init-bar');

// ---------------------------------------------------------------------------
// Local state
// ---------------------------------------------------------------------------
let countToday   = 0;
let countTotal   = 0;
let isSweeping   = false;
const todayDate  = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Screen navigation helpers
// ---------------------------------------------------------------------------
function showScreen(name) {
  screenQR     .classList.add('hidden');
  screenMain   .classList.add('hidden');
  screenError  .classList.add('hidden');
  screenLoading.classList.add('hidden');

  if (name === 'qr')      screenQR     .classList.remove('hidden');
  if (name === 'main')    screenMain   .classList.remove('hidden');
  if (name === 'error')   screenError  .classList.remove('hidden');
  if (name === 'loading') screenLoading.classList.remove('hidden');
}

function setStatus(dot, text) {
  statusDot.className  = 'status-dot ' + dot;
  statusText.textContent = text;
  const isLoading = dot === 'yellow';
  statusSpinner.style.display = isLoading ? 'block' : 'none';
  statusDot.style.display     = isLoading ? 'none'   : 'block';
}

function setProgress(pct, text) {
  initBarFill.style.width = pct + '%';
  initBarText.textContent = text;
}

// ---------------------------------------------------------------------------
// Event: QR received
// ---------------------------------------------------------------------------
window.api.onQR(qrDataUrl => {
  showScreen('qr');
  setStatus('yellow', 'Esperando escaneo...');
  setProgress(30, 'Cargando QR...');
  qrPlaceholder.style.display = 'none';
  qrImg.style.display         = 'block';
  qrImg.src                   = qrDataUrl;
});

// ---------------------------------------------------------------------------
// Event: status change
// ---------------------------------------------------------------------------
window.api.onStatus(async status => {
  switch (status) {

    case 'starting':
      showScreen('loading');
      setStatus('yellow', 'Iniciando...');
      setProgress(10, 'Verificando sesión...');
      // If still loading after 5s, update text
      setTimeout(() => {
        if (!screenLoading.classList.contains('hidden')) {
          setProgress(20, 'Cargando WhatsApp Web...');
        }
      }, 5000);
      break;

    case 'authenticated':
      setStatus('yellow', 'Autenticando...');
      setProgress(70, 'Autenticando...');
      setTimeout(() => {
        if (statusText.textContent === 'Autenticando...') {
          setProgress(80, 'Guardando sesión...');
        }
      }, 15000);
      break;

    case 'ready':
      setStatus('yellow', 'Accediendo...');
      setProgress(100, 'Accediendo a la app...');
      setTimeout(() => {
        initBar.style.display = 'none';
      }, 600);
      break;

    case 'sweeping':
      isSweeping = true;
      showScreen('main');
      setStatus('yellow', 'Revisando mensajes anteriores...');
      btnSweep.textContent = 'Detener búsqueda';
      btnSweep.className   = 'btn btn-danger';
      // Load destination path the first time the panel appears
      try {
        const path = await window.api.getBasePath();
        statPath.textContent  = path;
        cardPath.title        = path;
      } catch {
        statPath.textContent = 'No disponible';
      }
      break;

    case 'connected':
      isSweeping = false;
      initBar.style.display = 'none';
      showScreen('main');
      setStatus('green', 'Conectado');
      btnSweep.textContent = 'Re-buscar mensajes antiguos';
      btnSweep.className   = 'btn btn-secondary';
      btnSweep.disabled    = false;
      try {
        const cfg = await window.api.getConfig();
        if (cfg.daysSearch) daysInput.value = cfg.daysSearch;
        if (cfg.mediaTypes) {
          checksMedia.forEach(cb => {
            cb.checked = cfg.mediaTypes.includes(cb.value);
          });
        }
      } catch {}
      break;

    case 'disconnected':
      showScreen('loading');
      setStatus('red', 'Desconectado');
      qrImg.style.display         = 'none';
      qrPlaceholder.style.display = 'flex';
      qrPlaceholder.innerHTML     = '<div class="spinner"></div><span>Generando QR...</span>';
      initBar.style.display       = 'flex';
      setProgress(10, 'Verificando sesión...');
      break;

    case 'error-auth':
      showScreen('error');
      setStatus('red', 'Error');
      errorTitle.textContent = 'Error de autenticación';
      errorDesc.textContent  =
        'WhatsApp rechazó la sesión. Borra la carpeta wwebjs_auth y reinicia la app.';
      break;

    case 'error-init':
      showScreen('error');
      setStatus('red', 'Error');
      errorTitle.textContent = 'Error al iniciar';
      errorDesc.textContent  =
        'No se pudo iniciar el cliente de WhatsApp. Revisa la consola para más detalles.';
      break;
  }
});

// ---------------------------------------------------------------------------
// Event: new file received
// ---------------------------------------------------------------------------
window.api.onNewFile(({ company, date, name, time, fullPath }) => {
  // Update counters
  countTotal++;
  if (date === todayDate) countToday++;
  statTotal.textContent = countTotal;
  statToday.textContent = countToday;

  // Update counter text in the log header
  logCount.textContent = countTotal + (countTotal === 1 ? ' archivo' : ' archivos');

  // Hide empty message
  logEmpty.style.display = 'none';

  // Create log item
  const li = document.createElement('li');
  li.className = 'log-item';
  li.innerHTML = `
    <span class="log-time">${time}</span>
    <div class="log-info">
      <span class="log-company">${escapeHtml(company)}</span>
      <span class="log-file">${escapeHtml(name)}</span>
    </div>
    <div class="log-actions">
      <button class="log-action-btn" title="Abrir archivo"
              data-path="${escapeHtml(fullPath)}" data-action="file">📄</button>
      <button class="log-action-btn" title="Abrir carpeta del archivo"
              data-path="${escapeHtml(fullPath)}" data-action="folder">📂</button>
    </div>
    <span class="log-badge">Nuevo</span>
  `;

  // Insert at the top of the list (most recent first)
  logList.prepend(li);

  // Remove the "Nuevo" badge after 5 seconds
  setTimeout(() => {
    const badge = li.querySelector('.log-badge');
    if (badge) badge.style.display = 'none';
  }, 5000);
});

// Event delegation for file action buttons
logList.addEventListener('click', e => {
  const btn = e.target.closest('.log-action-btn');
  if (!btn) return;
  const path = btn.dataset.path;
  const action = btn.dataset.action;
  if (!path) return;

  if (action === 'file') {
    window.api.openFile(path);
  } else if (action === 'folder') {
    window.api.showInFolder(path);
  }
});

// ---------------------------------------------------------------------------
// Client management modal
// ---------------------------------------------------------------------------
const modalClients    = document.getElementById('modal-clients');
const modalClose      = document.getElementById('modal-close');
const btnClients      = document.getElementById('btn-clients');
const searchContacts  = document.getElementById('search-contacts');
const contactsList    = document.getElementById('contacts-list');
const clientsList     = document.getElementById('clients-list');

let contactsCache = [];  // unclassified contacts (filtered)
let allContacts   = [];  // all contacts (master)
let clientsCache  = {};  // local copy of clientes.json

function closeModal() {
  modalClients.classList.add('hidden');
  searchContacts.value = '';
}

function refreshContactsCache() {
  contactsCache = allContacts.filter(c => !clientsCache[c.number]);
}

function renderContacts() {
  const filter = searchContacts.value.toLowerCase();
  const filtered = contactsCache.filter(c => {
    const n = (c.name || c.pushname || '').toLowerCase();
    return n.includes(filter) || (c.number && c.number.includes(filter));
  });

  if (filtered.length === 0) {
    contactsList.innerHTML = '<p class="modal-empty">No se encontraron contactos.</p>';
    return;
  }

  contactsList.innerHTML = filtered.map(c => `
    <div class="contact-item" data-number="${c.number}">
      <div class="contact-info">
        <span class="contact-name">${escapeHtml(c.name || c.pushname || '(sin nombre)')}</span>
        <span class="contact-number">${escapeHtml(c.number)}</span>
      </div>
      <input type="text" class="contact-input"
             placeholder="Nombre de empresa..."
             value="${escapeHtml(clientsCache[c.number] || '')}">
      <button class="btn btn-sm btn-save-contact">Guardar</button>
    </div>
  `).join('');

  contactsList.querySelectorAll('.btn-save-contact').forEach(btn => {
    btn.addEventListener('click', async () => {
      const item = btn.closest('.contact-item');
      const num  = item.dataset.number;
      const input = item.querySelector('.contact-input');
      const company = input.value.trim();
      if (!company) return;

      clientsCache[num] = company;

      try {
        await window.api.saveClients(clientsCache);
        refreshContactsCache();
        renderContacts();
        renderConfiguredClients();
      } catch (err) {
        console.error('Error saving client:', err);
      }
    });
  });
}

function renderConfiguredClients() {
  const entries = Object.entries(clientsCache);

  if (entries.length === 0) {
    clientsList.innerHTML = '<p class="modal-empty">No hay clientes configurados.</p>';
    return;
  }

  clientsList.innerHTML = entries.map(([num, company]) => `
    <div class="client-item" data-number="${num}">
      <div class="client-info">
        <span class="client-company">${escapeHtml(company)}</span>
        <span class="client-number">${num}</span>
      </div>
      <button class="btn btn-sm btn-delete-client">Eliminar</button>
    </div>
  `).join('');

  clientsList.querySelectorAll('.btn-delete-client').forEach(btn => {
    btn.addEventListener('click', async () => {
      const item = btn.closest('.client-item');
      const num  = item.dataset.number;
      const companyToRemove = clientsCache[num];
      if (!companyToRemove) return;

      // Remove all entries with the same company name
      for (const key of Object.keys(clientsCache)) {
        if (clientsCache[key] === companyToRemove) {
          delete clientsCache[key];
        }
      }
      try {
        await window.api.saveClients(clientsCache);
        refreshContactsCache();
        renderContacts();
        renderConfiguredClients();
      } catch (err) {
        console.error('Error deleting client:', err);
      }
    });
  });
}

async function openClientsModal() {
  modalClients.classList.remove('hidden');
  contactsList.innerHTML = '<p class="modal-empty">Cargando contactos...</p>';
  clientsList.innerHTML  = '<p class="modal-empty">Cargando...</p>';

  try {
    const [contacts, clients] = await Promise.all([
      window.api.getContacts(),
      window.api.getClients(),
    ]);
    console.log('Contacts received:', contacts.length);
    console.log('Clients configured:', Object.keys(clients).length);

    allContacts  = contacts;
    clientsCache = clients;
    refreshContactsCache();

    renderContacts();
    renderConfiguredClients();
  } catch (err) {
    contactsList.innerHTML = `<p class="modal-empty">Error al cargar: ${escapeHtml(err.message)}</p>`;
    clientsList.innerHTML  = '<p class="modal-empty">Error al cargar.</p>';
  }
}

btnClients.addEventListener('click', openClientsModal);
modalClose.addEventListener('click', closeModal);
modalClients.addEventListener('click', e => {
  if (e.target === modalClients) closeModal();
});
searchContacts.addEventListener('input', renderContacts);

daysInput.addEventListener('change', async () => {
  const val = parseInt(daysInput.value, 10);
  if (val >= 1 && val <= 365) {
    try {
      await window.api.setConfig({ daysSearch: val });
    } catch (err) {
      console.error('Error saving config:', err);
    }
  }
});

checksMedia.forEach(cb => {
  cb.addEventListener('change', async () => {
    const selected = Array.from(checksMedia)
      .filter(c => c.checked)
      .map(c => c.value);
    try {
      await window.api.setConfig({ mediaTypes: selected });
    } catch (err) {
      console.error('Error saving media types:', err);
    }
  });
});

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
const btnChangePath = document.getElementById('btn-change-path');

btnOpenFolder.addEventListener('click', () => {
  window.api.openFolder();
});

btnChangePath.addEventListener('click', async () => {
  try {
    const folder = await window.api.selectFolder();
    if (!folder) return;
    await window.api.setBasePath(folder);
    statPath.textContent = folder;
    cardPath.title = folder;
  } catch (err) {
    console.error('Error changing folder:', err);
  }
});

btnClean.addEventListener('click', async () => {
  btnClean.disabled     = true;
  btnClean.textContent  = 'Limpiando...';
  try {
    const deleted = await window.api.cleanDB();
    btnClean.textContent = `${deleted} registros eliminados`;
  } catch {
    btnClean.textContent = 'Error al limpiar';
  } finally {
    setTimeout(() => {
      btnClean.disabled    = false;
      btnClean.textContent = 'Limpiar registros antiguos';
    }, 3000);
  }
});

btnSweep.addEventListener('click', async () => {
  if (isSweeping) {
    btnSweep.disabled    = true;
    btnSweep.textContent = 'Cancelando...';
    const cancelled = await window.api.cancelSweep();
    if (cancelled) {
      isSweeping = false;
      btnSweep.textContent = 'Re-buscar mensajes antiguos';
      btnSweep.className   = 'btn btn-secondary';
      btnSweep.disabled    = false;
    }
    return;
  }
  btnSweep.disabled           = true;
  btnSweep.innerHTML          = '<span class="spinner"></span> Buscando...';
  try {
    await window.api.sweepMessages();
  } catch {
    btnSweep.textContent = 'Error';
  } finally {
    setTimeout(() => {
      btnSweep.disabled    = false;
      btnSweep.textContent = 'Re-buscar mensajes antiguos';
    }, 2000);
  }
});

btnLogout.addEventListener('click', async () => {
  btnLogout.disabled    = true;
  btnLogout.textContent = 'Cerrando sesión...';
  try {
    await window.api.logout();
  } catch (err) {
    console.error('Error logging out:', err);
    btnLogout.textContent = 'Error';
  } finally {
    setTimeout(() => {
      btnLogout.disabled    = false;
      btnLogout.textContent = 'Cerrar sesión';
    }, 2000);
  }
});

// ---------------------------------------------------------------------------
// Utility: escape HTML to prevent XSS with malicious filenames
// ---------------------------------------------------------------------------
function escapeHtml(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

// ---------------------------------------------------------------------------
// Theme toggle (light / dark)
// ---------------------------------------------------------------------------
const btnTheme  = document.getElementById('btn-toggle-theme');
const themeIcon = document.getElementById('theme-icon');

function applyTheme(dark) {
  const html = document.documentElement;
  if (dark) {
    html.classList.add('dark');
    themeIcon.textContent = '☀';
    btnTheme.title = 'Cambiar a modo claro';
  } else {
    html.classList.remove('dark');
    themeIcon.textContent = '🌙';
    btnTheme.title = 'Cambiar a modo oscuro';
  }
  localStorage.setItem('theme', dark ? 'dark' : 'light');
}

function toggleTheme() {
  const html = document.documentElement;
  const enableDark = !html.classList.contains('dark');

  // Activate smooth transitions
  html.classList.add('theme-transition');
  applyTheme(enableDark);
  setTimeout(() => html.classList.remove('theme-transition'), 350);
}

// Load saved theme (or system preference)
(function initTheme() {
  let saved = localStorage.getItem('theme');
  // Migrate old localStorage key (Spanish → English)
  if (saved === null) {
    const oldSaved = localStorage.getItem('tema');
    if (oldSaved !== null) {
      saved = oldSaved === 'oscuro' ? 'dark' : 'light';
      localStorage.setItem('theme', saved);
      localStorage.removeItem('tema');
    }
  }
  if (saved === 'dark') {
    applyTheme(true);
  } else if (saved === 'light') {
    applyTheme(false);
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    applyTheme(true);
  } else {
    applyTheme(false);
  }
})();

btnTheme.addEventListener('click', toggleTheme);
