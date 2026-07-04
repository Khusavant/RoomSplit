// ============================================================
// Navbar Component — Room Split
// ============================================================

import { toggleSidebar } from './sidebar.js';
import { navigate } from '../lib/router.js';
import { markAllNotificationsRead, acceptRoomInvite, rejectRoomInvite } from '../lib/supabase.js';
import { getState, setState } from '../lib/store.js';

export function renderNavbar(container, profile, notifications = []) {
  if (!container) return;

  const unreadCount = notifications.filter(n => !n.is_read).length;

  container.innerHTML = `
    <header class="app-navbar">
      <button class="btn btn-ghost btn-icon" id="menu-toggle" style="display: none;">
        ☰
      </button>

      <div style="flex: 1;"></div>

      <!-- Notification Bell -->
      <div style="position: relative;">
        <button class="btn btn-ghost btn-icon" id="notif-bell" title="Notifications" style="${unreadCount > 0 ? 'animation: shake 2s infinite;' : ''}">
          🔔
          ${unreadCount > 0 ? `<span class="badge-count" style="position:absolute;top:4px;right:4px;">${unreadCount > 9 ? '9+' : unreadCount}</span>` : ''}
        </button>
      </div>

      <!-- Profile -->
      <div class="avatar avatar-md avatar-1" style="cursor: pointer;" id="nav-avatar" title="${profile?.name || 'Profile'}">
        ${(profile?.name || 'U')[0]}
      </div>
    </header>

    <!-- Notification Panel (hidden by default) -->
    <div class="notification-panel hidden" id="notification-panel">
      <div style="padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between;">
        <h3 style="font-size: var(--fs-lg); font-weight: var(--fw-semibold);">Notifications</h3>
        ${unreadCount > 0 ? `<button class="btn btn-ghost btn-sm" id="mark-all-read">Mark all read</button>` : ''}
      </div>
      <div id="notification-list" style="max-height: 400px; overflow-y: auto;">
        ${notifications.length > 0 ? notifications.slice(0, 20).map(n => `
          <div class="notification-item ${n.is_read ? '' : 'unread'}" data-notif-id="${n.id}">
            <div class="notification-content">
              <div class="notification-text">
                <strong>${n.title}</strong><br/>
                ${n.message}
              </div>
              <div class="notification-time">${formatTimeAgo(n.created_at)}</div>
              ${n.type === 'room_invite' ? `
                <div class="flex gap-2" style="margin-top: var(--space-2);">
                  <button class="btn btn-primary btn-sm accept-invite-btn" data-room-id="${n.metadata?.room_id}">Accept</button>
                  <button class="btn btn-secondary btn-sm reject-invite-btn" data-room-id="${n.metadata?.room_id}">Reject</button>
                </div>
              ` : ''}
            </div>
          </div>
        `).join('') : `
          <div style="padding: var(--space-8); text-align: center; color: var(--text-muted);">
            <div style="font-size: 2rem; margin-bottom: var(--space-2);">🔕</div>
            <p>No notifications yet</p>
          </div>
        `}
      </div>
    </div>
  `;

  // Show menu toggle on mobile
  const menuToggle = container.querySelector('#menu-toggle');
  if (window.innerWidth <= 768 && menuToggle) {
    menuToggle.style.display = 'flex';
  }

  // Events
  if (menuToggle) {
    menuToggle.addEventListener('click', toggleSidebar);
  }

  const notifBell = container.querySelector('#notif-bell');
  const notifPanel = container.querySelector('#notification-panel');
  if (notifBell && notifPanel) {
    notifBell.addEventListener('click', () => {
      notifPanel.classList.toggle('hidden');
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!notifBell.contains(e.target) && !notifPanel.contains(e.target)) {
        notifPanel.classList.add('hidden');
      }
    });
  }

  const markAllBtn = container.querySelector('#mark-all-read');
  if (markAllBtn) {
    markAllBtn.addEventListener('click', async () => {
      const user = getState('user');
      if (user) {
        await markAllNotificationsRead(user.id);
        setState('unreadCount', 0);
        // Remove unread styling
        container.querySelectorAll('.notification-item.unread').forEach(item => {
          item.classList.remove('unread');
        });
        const badge = container.querySelector('.badge-count');
        if (badge) badge.remove();
        markAllBtn.remove();
      }
    });
  }

    const navAvatar = container.querySelector('#nav-avatar');
  if (navAvatar) {
    navAvatar.addEventListener('click', () => navigate('/settings'));
  }

  // Handle accept/reject invites
  container.querySelectorAll('.accept-invite-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const roomId = btn.dataset.roomId;
      const notifItem = btn.closest('.notification-item');
      const notifId = notifItem ? notifItem.dataset.notifId : null;
      
      const { error } = await acceptRoomInvite(roomId, notifId);
      if (error) {
        alert('Failed to accept invite: ' + error.message);
      } else {
        location.reload(); // Refresh fully to show the room on dashboard
      }
    });
  });

  container.querySelectorAll('.reject-invite-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const roomId = btn.dataset.roomId;
      const notifItem = btn.closest('.notification-item');
      const notifId = notifItem ? notifItem.dataset.notifId : null;
      
      const { error } = await rejectRoomInvite(roomId, notifId);
      if (error) {
        alert('Failed to reject invite: ' + error.message);
      } else {
        location.reload(); // Refresh to remove the notification and clear state
      }
    });
  });
}

function formatTimeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
