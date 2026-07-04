// ============================================================
// Sidebar Component — Room Split
// ============================================================

import { navigate } from '../lib/router.js';
import { signOut } from '../lib/supabase.js';
import { showToast } from '../lib/notifications.js';

export function renderSidebar(container, rooms = [], activeRoomId = null, user = null, profile = null) {
  if (!container) return;

  container.innerHTML = `
    <aside class="app-sidebar" id="app-sidebar">
      <div class="sidebar-header">
        <span style="font-size: 1.5rem;">💰</span>
        <span class="sidebar-logo">Room<span class="accent">Split</span></span>
      </div>

      <nav class="sidebar-nav">
        <div class="sidebar-section">
          <div class="sidebar-item ${!activeRoomId && location.hash === '#/dashboard' ? 'active' : ''}" data-nav="dashboard">
            <span class="sidebar-item-icon">🏠</span>
            <span>Dashboard</span>
          </div>
          <div class="sidebar-item ${location.hash === '#/reports' ? 'active' : ''}" data-nav="reports">
            <span class="sidebar-item-icon">📊</span>
            <span>Reports</span>
          </div>
          <div class="sidebar-item ${location.hash === '#/ai-chat' ? 'active' : ''}" data-nav="ai-chat">
            <span class="sidebar-item-icon">🤖</span>
            <span>AI Mentor</span>
          </div>
        </div>

        <div class="sidebar-section">
          <div class="sidebar-section-title">Rooms</div>
          ${rooms.map(room => `
            <div class="sidebar-item ${activeRoomId === room.id ? 'active' : ''}" data-room-id="${room.id}">
              <span class="sidebar-item-icon">${room.image_url || '🏠'}</span>
              <span class="truncate">${room.name}</span>
              ${room.room_members ? `
                <span class="sidebar-item-badge badge badge-accent">${room.room_members.length}</span>
              ` : ''}
            </div>
          `).join('')}
          ${rooms.length === 0 ? `
            <div class="sidebar-item text-muted" style="cursor: default; font-size: var(--fs-sm);">
              <span class="sidebar-item-icon">📭</span>
              <span>No rooms yet</span>
            </div>
          ` : ''}
        </div>

        <div class="sidebar-section">
          <div class="sidebar-section-title">Settings</div>
          <div class="sidebar-item ${location.hash === '#/settings' ? 'active' : ''}" data-nav="settings">
            <span class="sidebar-item-icon">⚙️</span>
            <span>Settings</span>
          </div>
        </div>
      </nav>

      <div class="sidebar-footer">
        <div class="sidebar-user" id="sidebar-user">
          <div class="avatar avatar-md avatar-1">
            ${(profile?.name || 'U')[0]}
          </div>
          <div class="sidebar-user-info">
            <div class="sidebar-user-name">${profile?.name || 'User'}</div>
            <div class="sidebar-user-email">${profile?.email || user?.email || ''}</div>
          </div>
          <button class="btn btn-ghost btn-sm" id="logout-btn" title="Sign Out" style="font-size: var(--fs-lg);">
            🚪
          </button>
        </div>
      </div>
    </aside>
  `;

  // Navigation events
  container.querySelectorAll('.sidebar-item[data-nav]').forEach(item => {
    item.addEventListener('click', () => {
      const target = item.dataset.nav;
      navigate(`/${target}`);
      closeSidebar();
    });
  });

  container.querySelectorAll('.sidebar-item[data-room-id]').forEach(item => {
    item.addEventListener('click', () => {
      navigate(`/room/${item.dataset.roomId}`);
      closeSidebar();
    });
  });

  // Logout
  const logoutBtn = container.querySelector('#logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await signOut();
      showToast('Signed out', 'See you later!', 'info');
      navigate('/');
    });
  }
}

function closeSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
}

export function toggleSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('open');
}
