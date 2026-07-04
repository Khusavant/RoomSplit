// ============================================================
// Room Split — Main Entry Point
// ============================================================

import './styles/global.css';
import { supabase, getSession } from './lib/supabase.js';
import { initRouter, registerRoute, navigate } from './lib/router.js';
import { setState } from './lib/store.js';

// Page imports
import { renderAuthPage } from './pages/auth.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderRoomDetail } from './pages/room-detail.js';
import { renderAddExpense } from './pages/add-expense.js';
import { renderSettleUp } from './pages/settle-up.js';
import { renderReports } from './pages/reports.js';
import { renderSettings } from './pages/settings.js';
import { renderAIChat } from './pages/ai-chat.js';

// ============================================================
// Route Registration
// ============================================================

// Auth
registerRoute('/', async () => {
  const session = await getSession();
  if (session) {
    navigate('/dashboard');
    return;
  }
  renderAuthPage();
});

// Authenticated routes (with guard)
async function authGuard(handler, params) {
  const session = await getSession();
  if (!session) {
    navigate('/');
    return;
  }
  return handler(params);
}

registerRoute('/dashboard', (params) => authGuard(renderDashboard, params));
registerRoute('/room/:id', (params) => authGuard(renderRoomDetail, params));
registerRoute('/room/:id/add-expense', (params) => authGuard(renderAddExpense, params));
registerRoute('/room/:id/settle', (params) => authGuard(renderSettleUp, params));
registerRoute('/reports', (params) => authGuard(renderReports, params));
registerRoute('/settings', (params) => authGuard(renderSettings, params));
registerRoute('/ai-chat', (params) => authGuard(renderAIChat, params));

// ============================================================
// Auth State Listener
// ============================================================

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    setState('user', session?.user || null);
    const hash = window.location.hash;
    if (!hash || hash === '#/' || hash === '#') {
      navigate('/dashboard');
    }
  } else if (event === 'SIGNED_OUT') {
    setState('user', null);
    setState('profile', null);
    setState('rooms', []);
    navigate('/');
  }
});

// ============================================================
// Initialize App
// ============================================================

async function init() {
  // Small delay for splash screen effect
  await new Promise(resolve => setTimeout(resolve, 800));

  // Check for existing session
  const session = await getSession();
  if (session) {
    setState('user', session.user);
  }

  // Start router
  initRouter();
}

init().catch(err => {
  console.error('App init error:', err);
  const splash = document.getElementById('splash-loader');
  if (splash) {
    splash.innerHTML = `
      <div class="splash-content">
        <div class="empty-state-icon">⚠️</div>
        <h2>Failed to load</h2>
        <p class="text-muted">${err.message}</p>
        <button class="btn btn-primary mt-4" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
});
