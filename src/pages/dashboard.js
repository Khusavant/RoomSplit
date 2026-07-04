// ============================================================
// Dashboard Page — Room Split
// ============================================================

import { getRooms, getExpenses, getSettlements, getNotifications, getUser, getProfile, getAllProfiles, getCategories } from '../lib/supabase.js';
import { calculateNetBalances, simplifyDebts, getUserDebts, formatCurrency, formatDate } from '../lib/debt-engine.js';
import { getState, setState } from '../lib/store.js';
import { showToast, showModal, closeModal } from '../lib/notifications.js';
import { navigate } from '../lib/router.js';
import { renderSidebar } from '../components/sidebar.js';
import { renderNavbar } from '../components/navbar.js';
import { createRoom, addRoomMember } from '../lib/supabase.js';
import { supabase } from '../lib/supabase.js';

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function renderDashboard() {
  const app = document.getElementById('app');
  const user = await getUser();
  if (!user) { navigate('/'); return; }

  // Load data
  const [profileRes, allProfilesRes, roomsRes, categoriesRes, notifRes] = await Promise.all([
    getProfile(user.id),
    getAllProfiles(),
    getRooms(),
    getCategories(),
    getNotifications(user.id)
  ]);

  const profile = profileRes.data;
  const allProfiles = allProfilesRes.data || [];
  const rooms = roomsRes.data || [];
  const categories = categoriesRes.data || [];
  const notifications = notifRes.data || [];

  setState('user', user);
  setState('profile', profile);
  setState('profiles', allProfiles);
  setState('rooms', rooms);
  setState('categories', categories);
  setState('notifications', notifications);
  setState('unreadCount', notifications.filter(n => !n.is_read).length);

  // Calculate overall balances across all rooms
  let totalOwedToMe = 0;
  let totalIOwe = 0;
  const roomBalances = {};

  for (const room of rooms) {
    const members = room.room_members || [];
    const [expensesRes, settlementsRes] = await Promise.all([
      getExpenses(room.id),
      getSettlements(room.id)
    ]);

    const expenses = expensesRes.data || [];
    const settlements = settlementsRes.data || [];
    const memberList = members.map(m => ({
      user_id: m.user_id,
      name: m.profiles?.name || 'Unknown'
    }));

    const balances = calculateNetBalances(expenses, settlements, memberList);
    const simplified = simplifyDebts(balances);
    const myDebts = getUserDebts(simplified, user.id);

    roomBalances[room.id] = {
      balances,
      simplified,
      myDebts,
      expenses,
      settlements
    };

    myDebts.owes.forEach(d => { totalIOwe += d.amount; });
    myDebts.isOwed.forEach(d => { totalOwedToMe += d.amount; });
  }

  // Get greeting
  const hour = new Date().getHours();
  let greeting = 'Good morning';
  if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
  else if (hour >= 17) greeting = 'Good evening';

  app.innerHTML = `
    <div class="app-layout">
      <div id="sidebar-container"></div>
      <div class="sidebar-overlay" id="sidebar-overlay"></div>
      <div class="app-main">
        <div id="navbar-container"></div>
        <div class="app-content">
          <div class="page-container">
            <!-- Header -->
            <div class="dashboard-header">
              <h1 class="dashboard-greeting">${greeting}, ${profile?.name || 'there'} 👋</h1>
              <p class="dashboard-subtitle">Here's your expense summary</p>
            </div>

            <!-- Balance Cards -->
            <div class="balance-cards">
              <div class="balance-card owed">
                <div class="balance-card-label">You are owed</div>
                <div class="balance-card-value balance-positive animated-counter" data-value="${totalOwedToMe}">${formatCurrency(0)}</div>
              </div>
              <div class="balance-card owe">
                <div class="balance-card-label">You owe</div>
                <div class="balance-card-value balance-negative animated-counter" data-value="${totalIOwe}">${formatCurrency(0)}</div>
              </div>
              <div class="balance-card total">
                <div class="balance-card-label">Net Balance</div>
                <div class="balance-card-value ${totalOwedToMe - totalIOwe >= 0 ? 'balance-positive' : 'balance-negative'} animated-counter" data-value="${totalOwedToMe - totalIOwe}">
                  ${formatCurrency(0)}
                </div>
              </div>
            </div>

            <!-- Quick Actions -->
            <div class="flex gap-3 mb-6">
              <button class="btn btn-primary" id="create-room-btn">
                ➕ Create Room
              </button>
              <button class="btn btn-secondary" id="ai-mentor-btn">
                ✦ AI Assistant
              </button>
            </div>

            <!-- Rooms Grid -->
            <div style="margin-bottom: var(--space-4);">
              <h2 style="font-size: var(--fs-xl); margin-bottom: var(--space-4);">Your Rooms</h2>
            </div>

            ${rooms.length > 0 ? `
              <div class="rooms-grid" id="rooms-grid">
                ${rooms.map(room => {
    const rb = roomBalances[room.id];
    const myNet = rb?.balances[user.id]?.net || 0;
    const members = room.room_members || [];
    const expenseCount = rb?.expenses?.length || 0;

    return `
                    <div class="room-card" data-room-id="${room.id}">
                      <div class="room-card-header">
                        <div class="room-card-icon">${room.image_url || '🏠'}</div>
                        <div>
                          <div class="room-card-name">${room.name}</div>
                          ${room.description ? `<div class="room-card-desc">${room.description}</div>` : ''}
                        </div>
                      </div>
                      <div class="flex items-center gap-2 mb-4">
                        <div class="avatar-stack">
                          ${members.slice(0, 4).map((m, i) => `
                            <div class="avatar avatar-sm avatar-${(i % 4) + 1}" title="${m.profiles?.name || ''}">
                              ${(m.profiles?.name || '?')[0]}
                            </div>
                          `).join('')}
                        </div>
                        <span class="text-muted" style="font-size: var(--fs-sm)">
                          ${members.length} member${members.length !== 1 ? 's' : ''} · ${expenseCount} expense${expenseCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div class="room-card-footer">
                        <div>
                          <span class="text-muted" style="font-size: var(--fs-xs)">Your balance</span>
                          <div class="room-card-balance ${myNet >= 0 ? 'balance-positive' : 'balance-negative'}">
                            ${myNet >= 0 ? '+' : ''}${formatCurrency(myNet)}
                          </div>
                        </div>
                        <button class="btn btn-ghost btn-sm">View →</button>
                      </div>
                    </div>
                  `;
  }).join('')}

                <!-- Create Room Card -->
                <div class="room-card card-hover" id="create-room-card" style="display: flex; align-items: center; justify-content: center; min-height: 180px; border-style: dashed; cursor: pointer;">
                  <div class="text-center">
                    <div style="font-size: 2rem; margin-bottom: var(--space-2); opacity: 0.5;">➕</div>
                    <div class="text-muted">Create New Room</div>
                  </div>
                </div>
              </div>
            ` : `
              <div class="empty-state">
                <div class="empty-state-icon">🏠</div>
                <h3 class="empty-state-title">No rooms yet</h3>
                <p class="empty-state-text">Create your first room to start splitting expenses with your roommates.</p>
                <button class="btn btn-primary" id="empty-create-room-btn">➕ Create Your First Room</button>
              </div>
            `}

            <!-- Recent Activity -->
            ${rooms.length > 0 ? `
              <div style="margin-top: var(--space-8);">
                <h2 style="font-size: var(--fs-xl); margin-bottom: var(--space-4);">Recent Activity</h2>
                <div class="card">
                  ${getRecentActivity(roomBalances, rooms, user.id)}
                </div>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Bottom Nav for Mobile -->
        <nav class="bottom-nav">
          <div class="bottom-nav-item active" onclick="location.hash='#/dashboard'">
            <span class="bottom-nav-item-icon">🏠</span>
            <span>Home</span>
          </div>
          <div class="bottom-nav-item" onclick="location.hash='#/reports'">
            <span class="bottom-nav-item-icon">📊</span>
            <span>Reports</span>
          </div>
          <div class="bottom-nav-item" onclick="location.hash='#/ai-chat'">
            <span class="bottom-nav-item-icon">🤖</span>
            <span>AI</span>
          </div>
          <div class="bottom-nav-item" onclick="location.hash='#/settings'">
            <span class="bottom-nav-item-icon">⚙️</span>
            <span>Settings</span>
          </div>
        </nav>
      </div>
    </div>
  `;

  // Render sidebar and navbar
  renderSidebar(document.getElementById('sidebar-container'), rooms, null, user, profile);
  renderNavbar(document.getElementById('navbar-container'), profile, notifications);

  // Bind events
  document.querySelectorAll('.room-card[data-room-id]').forEach(card => {
    card.addEventListener('click', () => {
      navigate(`/room/${card.dataset.roomId}`);
    });
  });

  const createRoomBtn = document.getElementById('create-room-btn');
  const createRoomCard = document.getElementById('create-room-card');
  const emptyCreateBtn = document.getElementById('empty-create-room-btn');

  [createRoomBtn, createRoomCard, emptyCreateBtn].forEach(btn => {
    if (btn) btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showCreateRoomModal(allProfiles, user.id);
    });
  });

  const aiBtn = document.getElementById('ai-mentor-btn');
  if (aiBtn) aiBtn.addEventListener('click', () => navigate('/ai-chat'));

  // Sidebar overlay
  const overlay = document.getElementById('sidebar-overlay');
  const sidebar = document.querySelector('.sidebar');
  if (overlay && sidebar) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('open');
    });
  }

  // Animate stat counters
  setTimeout(() => {
    document.querySelectorAll('.animated-counter').forEach(el => {
      const endValue = parseFloat(el.getAttribute('data-value')) || 0;
      const duration = 1500;
      let start = null;
      function step(timestamp) {
        if (!start) start = timestamp;
        const progress = Math.min((timestamp - start) / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 4); // easeOutQuart
        const current = easeProgress * endValue;

        el.innerText = formatCurrency(current);

        if (progress < 1) {
          window.requestAnimationFrame(step);
        } else {
          el.innerText = formatCurrency(endValue);
        }
      }
      window.requestAnimationFrame(step);
    });
  }, 100);

  // ============================================================
  // Realtime Subscriptions for Dashboard
  // ============================================================
  if (window.dashboardSubscription) {
    window.dashboardSubscription.unsubscribe();
  }

  window.dashboardSubscription = supabase.channel('dashboard-channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: `user_id=eq.${user.id}` }, () => {
      // Re-render dashboard when user is added/removed from a room
      renderDashboard();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
      // Re-render when room details change
      renderDashboard();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => {
      // Re-render when expenses change to update balances
      renderDashboard();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements' }, () => {
      // Re-render when settlements change
      renderDashboard();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
      if (payload.new.user_id === user.id) {
        showToast(payload.new.title, payload.new.message, 'info');
      }
    })
    .subscribe();

  // Cleanup
  return () => {
    if (window.dashboardSubscription) {
      supabase.removeChannel(window.dashboardSubscription);
      window.dashboardSubscription = null;
    }
  };
}

function getRecentActivity(roomBalances, rooms, userId) {
  const allExpenses = [];

  rooms.forEach(room => {
    const rb = roomBalances[room.id];
    if (!rb) return;
    rb.expenses.slice(0, 5).forEach(e => {
      allExpenses.push({ ...e, roomName: room.name });
    });
  });

  allExpenses.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const recent = allExpenses.slice(0, 8);

  if (recent.length === 0) {
    return '<p class="text-muted" style="padding: var(--space-4); text-align: center;">No recent activity</p>';
  }

  return recent.map(expense => {
    // Explicit mapping based on category name or description fallback
    const catName = expense.categories?.name || 'Default';
    let icon = '🧾';
    let bgColor = '#9ca3af'; // gray

    if (catName.includes('Food') || catName.includes('Dining')) {
      icon = '🍕'; bgColor = '#fb923c'; // orange
    } else if (catName.includes('Education') || catName.includes('Fees')) {
      icon = '📚'; bgColor = '#60a5fa'; // blue
    } else if (catName.includes('Entertainment')) {
      icon = '🎬'; bgColor = '#c084fc'; // purple
    } else if (catName.includes('Personal') || catName.includes('Health') || catName.includes('Care')) {
      icon = '💊'; bgColor = '#f472b6'; // pink
    } else if (catName.includes('Utilities') || catName.includes('Rent')) {
      icon = '💡'; bgColor = '#fde047'; // yellow
    }

    const payerName = expense.profiles?.name || 'Someone';
    const isMyExpense = expense.payer_id === userId;

    return `
      <div class="expense-item">
        <div class="expense-icon" style="background: ${bgColor}30;">
          ${icon}
        </div>
        <div class="expense-info">
          <div class="expense-description">${escapeHtml(expense.description)}</div>
          <div class="expense-meta">
            ${isMyExpense ? 'You' : escapeHtml(payerName)} paid · ${escapeHtml(expense.roomName)} · ${formatDate(expense.expense_date)}
          </div>
        </div>
        <div class="expense-amount">
          <div class="expense-amount-value">${formatCurrency(expense.amount)}</div>
        </div>
      </div>
    `;
  }).join('');
}

function showCreateRoomModal(allProfiles, currentUserId) {
  const otherProfiles = allProfiles.filter(p => p.id !== currentUserId);

  showModal({
    title: 'Create New Room',
    content: `
      <form id="create-room-form">
        <div class="form-group">
          <label class="form-label" for="room-icon">Room Icon</label>
          <div class="flex gap-2" id="icon-picker">
            ${['🏠', '🏢', '✈️', '🎉', '🍕', '💼', '🎮', '📚'].map((icon, i) => `
              <button type="button" class="category-item ${i === 0 ? 'selected' : ''}" data-icon="${icon}" style="padding: var(--space-2); font-size: var(--fs-xl);">
                ${icon}
              </button>
            `).join('')}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="room-name">Room Name *</label>
          <input type="text" id="room-name" class="form-input" placeholder="e.g., Home Expenses" required />
        </div>

        <div class="form-group">
          <label class="form-label" for="room-desc">Description</label>
          <input type="text" id="room-desc" class="form-input" placeholder="e.g., Monthly bills for our flat" />
        </div>

        <div class="form-group">
          <label class="form-label">Add Members</label>
          ${otherProfiles.length > 0 ? otherProfiles.map((p, i) => `
            <label class="form-checkbox">
              <input type="checkbox" value="${p.id}" name="room-members" />
              <div class="avatar avatar-sm avatar-${(i % 4) + 1}">${p.name[0]}</div>
              <div style="flex: 1; min-width: 0;">
                <div style="font-weight: var(--fw-medium); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.name}</div>
                <div class="text-muted" style="font-size: var(--fs-xs); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.email}</div>
              </div>
            </label>
          `).join('') : '<p class="text-muted" style="font-size: var(--fs-sm);">No other users registered yet. They can join later.</p>'}
        </div>
      </form>
    `,
    confirmText: 'Create Room',
    onConfirm: async () => {
      const name = document.getElementById('room-name').value.trim();
      const desc = document.getElementById('room-desc').value.trim();
      const selectedIcon = document.querySelector('#icon-picker .selected')?.dataset.icon || '🏠';
      const memberCheckboxes = document.querySelectorAll('input[name="room-members"]:checked');
      const memberIds = Array.from(memberCheckboxes).map(cb => cb.value);

      if (!name) {
        showToast('Error', 'Room name is required', 'error');
        return;
      }

      try {
        const { data: room, error } = await createRoom(name, desc, selectedIcon);
        if (error) throw error;

        // Add members
        for (const memberId of memberIds) {
          await addRoomMember(room.id, memberId);
        }

        showToast('Room Created!', `"${name}" is ready`, 'success');
        navigate(`/room/${room.id}`);
      } catch (err) {
        showToast('Error', err.message, 'error');
      }
    }
  });

  // Icon picker interaction
  setTimeout(() => {
    document.querySelectorAll('#icon-picker .category-item').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#icon-picker .category-item').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  }, 100);
}
