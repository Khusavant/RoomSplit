// ============================================================
// Room Detail Page — Room Split
// ============================================================

import { getRoom, getExpenses, getSettlements, getUser, getProfile, getRooms, getNotifications, getAllProfiles, deleteExpense, addRoomMember, deleteRoom } from '../lib/supabase.js';
import { calculateNetBalances, simplifyDebts, getUserDebts, formatCurrency, formatDate, formatFullDate } from '../lib/debt-engine.js';
import { getState, setState } from '../lib/store.js';
import { showToast, showModal, confirmDialog } from '../lib/notifications.js';
import { navigate } from '../lib/router.js';
import { renderSidebar } from '../components/sidebar.js';
import { renderNavbar } from '../components/navbar.js';
import { supabase } from '../lib/supabase.js';

export async function renderRoomDetail(params) {
  const { id: roomId } = params;
  const app = document.getElementById('app');
  const user = await getUser();
  if (!user) { navigate('/'); return; }

  // Load data
  const [roomRes, expensesRes, settlementsRes, profileRes, roomsRes, notifRes, allProfilesRes] = await Promise.all([
    getRoom(roomId),
    getExpenses(roomId),
    getSettlements(roomId),
    getProfile(user.id),
    getRooms(),
    getNotifications(user.id),
    getAllProfiles()
  ]);

  const room = roomRes.data;
  if (!room) {
    showToast('Error', 'Room not found', 'error');
    navigate('/dashboard');
    return;
  }

  const expenses = expensesRes.data || [];
  const settlements = settlementsRes.data || [];
  const profile = profileRes.data;
  const rooms = roomsRes.data || [];
  const notifications = notifRes.data || [];
  const allProfiles = allProfilesRes.data || [];

  const members = (room.room_members || []).map(m => ({
    user_id: m.user_id,
    name: m.profiles?.name || 'Unknown',
    upi_id: m.profiles?.upi_id || '',
    avatar_url: m.profiles?.avatar_url,
    role: m.role
  }));

  // Calculate balances
  const balances = calculateNetBalances(expenses, settlements, members);
  const simplified = simplifyDebts(balances);
  const myDebts = getUserDebts(simplified, user.id);

  // State
  let activeTab = 'expenses';

  setState('activeRoom', room);
  setState('activeRoomExpenses', expenses);
  setState('activeRoomSettlements', settlements);

  const totalSpent = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);

  function render() {
    app.innerHTML = `
      <div class="app-layout">
        <div id="sidebar-container"></div>
        <div class="sidebar-overlay" id="sidebar-overlay"></div>
        <div class="app-main">
          <div id="navbar-container"></div>
          <div class="app-content">
            <div class="page-container">
              <!-- Room Header -->
              <div class="flex items-center gap-4 mb-6">
                <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Back</button>
                <div style="flex: 1;">
                  <div class="flex items-center gap-3">
                    <span style="font-size: 2rem;">${room.image_url || '🏠'}</span>
                    <div>
                      <h1 style="font-size: var(--fs-2xl); font-weight: var(--fw-bold);">${room.name}</h1>
                      ${room.description ? `<p class="text-muted" style="font-size: var(--fs-sm);">${room.description}</p>` : ''}
                    </div>
                  </div>
                </div>
                <div class="flex gap-2">
                  ${user.id === room.created_by 
                    ? `<button class="btn btn-danger" id="delete-room-btn" title="Delete Room">🗑️ Delete</button>` 
                    : `<button class="btn btn-danger" id="leave-room-btn" title="Leave Room">🚪 Leave</button>`}
                  <button class="btn btn-secondary btn-sm" id="add-member-btn" title="Add Member">👥+</button>
                </div>
              </div>

              <!-- Members & Balance Overview -->
              <div class="card card-accent mb-6">
                <div class="flex items-center justify-between mb-4">
                  <div>
                    <div class="text-muted" style="font-size: var(--fs-sm);">Total Group Spending</div>
                    <div style="font-family: var(--font-heading); font-size: var(--fs-3xl); font-weight: var(--fw-bold);">
                      <span id="total-spending-amount" data-value="${totalSpent}">${formatCurrency(0)}</span>
                    </div>
                  </div>
                  <div class="avatar-stack">
                    ${members.map((m, i) => `
                      <div class="avatar avatar-md avatar-${(i % 4) + 1} glow-on-hover" title="${m.name} - ${formatCurrency(balances[m.user_id]?.net || 0)}">
                        ${m.name[0]}
                      </div>
                    `).join('')}
                  </div>
                </div>

                <!-- Per-member balances -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--space-3);">
                  ${members.map((m, i) => {
                    const bal = balances[m.user_id];
                    const net = bal ? bal.net : 0;
                    return `
                      <div class="card-hover" style="background: #F9FAFB; padding: var(--space-4); border-left: 6px solid ${net >= 0 ? '#16A34A' : '#DC2626'}; border-radius: var(--radius-lg); box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                        <div class="flex items-center gap-2 mb-3">
                          <div class="avatar avatar-sm avatar-${(i % 4) + 1}">${m.name[0]}</div>
                          <span style="font-size: var(--fs-sm); font-weight: var(--fw-semibold); color: #1F2937;">${m.name}${m.user_id === user.id ? ' (You)' : ''}</span>
                        </div>
                        <div style="font-family: var(--font-heading); font-weight: var(--fw-bold); font-size: var(--fs-2xl); color: ${net >= 0 ? '#16A34A' : '#DC2626'};">
                          ${net >= 0 ? '+' : ''}${formatCurrency(net)}
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>

              <!-- Tabs -->
              <div class="tabs mb-4" data-active="${activeTab === 'expenses' ? 0 : activeTab === 'balances' ? 1 : 2}">
                <div class="tab ${activeTab === 'expenses' ? 'active' : ''}" data-tab="expenses">Expenses</div>
                <div class="tab ${activeTab === 'balances' ? 'active' : ''}" data-tab="balances">Who Owes Whom</div>
                <div class="tab ${activeTab === 'settlements' ? 'active' : ''}" data-tab="settlements">Settlements</div>
              </div>

              <!-- Tab Content -->
              <div id="tab-content">
                ${renderTabContent(activeTab, expenses, settlements, simplified, myDebts, members, user, roomId)}
              </div>
            </div>
          </div>

          <!-- FAB: Add Expense -->
          <button class="fab" id="add-expense-fab" title="Add Expense">+</button>

          <!-- Bottom Nav -->
          <nav class="bottom-nav">
            <div class="bottom-nav-item" onclick="location.hash='#/dashboard'">
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
    renderSidebar(document.getElementById('sidebar-container'), rooms, roomId, user, profile);
    renderNavbar(document.getElementById('navbar-container'), profile, notifications);

    // Bind tab events
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        activeTab = tab.dataset.tab;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update data-active on parent for sliding underline
        const tabsContainer = tab.closest('.tabs');
        if (tabsContainer) {
          const tabIndex = activeTab === 'expenses' ? 0 : activeTab === 'balances' ? 1 : 2;
          tabsContainer.setAttribute('data-active', tabIndex);
        }

        document.getElementById('tab-content').innerHTML =
          renderTabContent(activeTab, expenses, settlements, simplified, myDebts, members, user, roomId);
        bindTabEvents(roomId, user, expenses, settlements, members);
      });
    });

    // FAB
    document.getElementById('add-expense-fab').addEventListener('click', () => {
      navigate(`/room/${roomId}/add-expense`);
    });

    // Add member button
    document.getElementById('add-member-btn')?.addEventListener('click', () => {
      showAddMemberModal(roomId, members, allProfiles);
    });

    // Delete room button
    document.getElementById('delete-room-btn')?.addEventListener('click', () => {
      confirmDialog('Delete Room', 'Are you sure you want to delete this room? This will permanently delete all expenses and settlements.', async () => {
        const { error } = await deleteRoom(roomId);
        if (error) {
          showToast('Error', 'Failed to delete room: ' + error.message, 'error');
        } else {
          showToast('Success', 'Room deleted successfully', 'success');
          navigate('/dashboard');
        }
      });
    });

    // Leave room button
    document.getElementById('leave-room-btn')?.addEventListener('click', () => {
      confirmDialog('Leave Room', 'Are you sure you want to leave this room? You will lose access to all expenses and settlements.', async () => {
        const { removeRoomMember } = await import('../lib/supabase.js');
        const { error } = await removeRoomMember(roomId, user.id);
        if (error) {
          showToast('Error', 'Failed to leave room: ' + error.message, 'error');
        } else {
          showToast('Success', 'You have left the room', 'success');
          navigate('/dashboard');
        }
      });
    });

    // Sidebar overlay
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    if (sidebarOverlay) {
      sidebarOverlay.addEventListener('click', () => {
        document.querySelector('.app-sidebar')?.classList.remove('open');
        sidebarOverlay.classList.remove('open');
      });
    }

    bindTabEvents(roomId, user, expenses, settlements, members);

    // Animate total spending
    setTimeout(() => {
      const el = document.getElementById('total-spending-amount');
      if (el) {
        const endValue = parseFloat(el.getAttribute('data-value')) || 0;
        const duration = 1500;
        let start = null;
        function step(timestamp) {
          if (!start) start = timestamp;
          const progress = Math.min((timestamp - start) / duration, 1);
          // Easing easeOutQuart
          const easeProgress = 1 - Math.pow(1 - progress, 4);
          el.innerText = formatCurrency(easeProgress * endValue);
          if (progress < 1) {
            window.requestAnimationFrame(step);
          } else {
            el.innerText = formatCurrency(endValue);
          }
        }
        window.requestAnimationFrame(step);
      }
    }, 100);
  }

  render();

  // Realtime
  const channel = supabase.channel(`room-${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `room_id=eq.${roomId}` }, () => {
      renderRoomDetail(params);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements', filter: `room_id=eq.${roomId}` }, () => {
      renderRoomDetail(params);
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}

function renderTabContent(tab, expenses, settlements, simplified, myDebts, members, user, roomId) {
  switch (tab) {
    case 'expenses':
      return renderExpensesList(expenses, user);
    case 'balances':
      return renderBalancesTab(simplified, myDebts, members, user, roomId);
    case 'settlements':
      return renderSettlementsTab(settlements);
    default:
      return '';
  }
}

function renderExpensesList(expenses, user) {
  if (expenses.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <h3 class="empty-state-title">No expenses yet</h3>
        <p class="empty-state-text">Tap the + button to add your first expense.</p>
      </div>
    `;
  }

  // Group by date
  const grouped = {};
  expenses.forEach(e => {
    const dateKey = e.expense_date;
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(e);
  });

  let html = '<div>';
  let i = 0;
  Object.entries(grouped).forEach(([date, exps]) => {
    html += `<div style="padding: var(--space-3) 0; font-size: var(--fs-sm); color: var(--text-muted); font-weight: var(--fw-medium);">${formatFullDate(date)}</div>`;
    exps.forEach(expense => {
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

      const payerName = expense.profiles?.name || 'Unknown';
      const isMyExpense = expense.payer_id === user.id;
      const splitCount = expense.expense_splits?.length || 0;

      html += `
        <div class="list-item" data-expense-id="${expense.id}" style="animation-delay: ${i * 0.05}s">
          <div class="list-item-icon" style="background: ${bgColor}30; font-size: 24px;">
            ${icon}
          </div>
          <div style="flex: 1;">
            <div style="font-weight: var(--fw-medium); color: var(--text-primary);">${expense.description}</div>
            <div style="font-size: var(--fs-xs); color: var(--text-muted); margin-top: 2px;">
              ${isMyExpense ? 'You' : payerName} paid · Split ${splitCount} ways
              ${expense.is_recurring ? ' · 🔄 Recurring' : ''}
            </div>
          </div>
          <div style="text-align: right; margin-right: var(--space-3);">
            <div style="font-weight: var(--fw-bold); color: var(--text-primary);">${formatCurrency(expense.amount)}</div>
            <div style="font-size: var(--fs-xs); color: var(--text-muted);">
              ${splitCount > 0 ? `${formatCurrency(parseFloat(expense.amount) / splitCount)} each` : ''}
            </div>
          </div>
          <div class="list-item-chevron">›</div>
        </div>
      `;
      i++;
    });
  });
  html += '</div>';
  return html;
}

function renderBalancesTab(simplified, myDebts, members, user, roomId) {
  if (simplified.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">✅</div>
        <h3 class="empty-state-title">All settled up!</h3>
        <p class="empty-state-text">No outstanding debts in this room. 🎉</p>
      </div>
    `;
  }

  let html = '';

  // My debts first
  if (myDebts.owes.length > 0) {
    html += `<h3 style="font-size: var(--fs-md); margin-bottom: var(--space-3); color: var(--danger);">You Owe</h3>`;
    myDebts.owes.forEach(debt => {
      html += `
        <div class="debt-card">
          <div class="debt-info">
            <div class="avatar avatar-md avatar-1">${(user.email || 'Y')[0].toUpperCase()}</div>
            <span class="debt-arrow">→</span>
            <div class="avatar avatar-md avatar-2">${debt.to.name[0]}</div>
            <div>
              <div style="font-weight: var(--fw-medium);">You → ${debt.to.name}</div>
              <div class="debt-amount balance-negative">${formatCurrency(debt.amount)}</div>
            </div>
          </div>
          <button class="btn btn-primary btn-sm settle-btn" data-to-user="${debt.to.userId}" data-amount="${debt.amount}">
            Settle Up
          </button>
        </div>
      `;
    });
  }

  if (myDebts.isOwed.length > 0) {
    html += `<h3 style="font-size: var(--fs-md); margin: var(--space-4) 0 var(--space-3); color: var(--success);">Owed to You</h3>`;
    myDebts.isOwed.forEach(debt => {
      html += `
        <div class="debt-card">
          <div class="debt-info">
            <div class="avatar avatar-md avatar-3">${debt.from.name[0]}</div>
            <span class="debt-arrow">→</span>
            <div class="avatar avatar-md avatar-1">${(user.email || 'Y')[0].toUpperCase()}</div>
            <div>
              <div style="font-weight: var(--fw-medium);">${debt.from.name} → You</div>
              <div class="debt-amount balance-positive">${formatCurrency(debt.amount)}</div>
            </div>
          </div>
        </div>
      `;
    });
  }

  // All simplified debts
  const otherDebts = simplified.filter(d => d.from.userId !== user.id && d.to.userId !== user.id);
  if (otherDebts.length > 0) {
    html += `<h3 style="font-size: var(--fs-md); margin: var(--space-4) 0 var(--space-3); color: var(--text-muted);">Other Settlements Needed</h3>`;
    otherDebts.forEach(debt => {
      html += `
        <div class="debt-card" style="opacity: 0.7;">
          <div class="debt-info">
            <div class="avatar avatar-md avatar-3">${debt.from.name[0]}</div>
            <span class="debt-arrow">→</span>
            <div class="avatar avatar-md avatar-2">${debt.to.name[0]}</div>
            <div>
              <div style="font-weight: var(--fw-medium);">${debt.from.name} → ${debt.to.name}</div>
              <div class="debt-amount">${formatCurrency(debt.amount)}</div>
            </div>
          </div>
        </div>
      `;
    });
  }

  return html;
}

function renderSettlementsTab(settlements) {
  if (settlements.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">💸</div>
        <h3 class="empty-state-title">No settlements yet</h3>
        <p class="empty-state-text">Settlements will appear here when someone pays their share.</p>
      </div>
    `;
  }

  let html = '<div class="card" style="padding: 0;">';
  settlements.forEach(s => {
    const fromName = s.from_profile?.name || 'Unknown';
    const toName = s.to_profile?.name || 'Unknown';
    const method = s.method === 'upi' ? '📱 UPI' : s.method === 'cash' ? '💵 Cash' : '🏦 Transfer';

    html += `
      <div class="expense-item">
        <div class="expense-icon" style="background: var(--success-bg);">
          ✅
        </div>
        <div class="expense-info">
          <div class="expense-description">${fromName} paid ${toName}</div>
          <div class="expense-meta">${method} · ${formatDate(s.created_at)}${s.note ? ` · ${s.note}` : ''}</div>
        </div>
        <div class="expense-amount">
          <div class="expense-amount-value balance-positive">${formatCurrency(s.amount)}</div>
        </div>
      </div>
    `;
  });
  html += '</div>';
  return html;
}

function bindTabEvents(roomId, user, expenses, settlements, members) {
  // Settle buttons
  document.querySelectorAll('.settle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const toUserId = btn.dataset.toUser;
      const amount = btn.dataset.amount;
      navigate(`/room/${roomId}/settle?to=${toUserId}&amount=${amount}`);
    });
  });

  // Expense click for details
  document.querySelectorAll('.expense-item[data-expense-id]').forEach(item => {
    item.addEventListener('click', () => {
      const expenseId = item.dataset.expenseId;
      const expense = expenses.find(e => e.id === expenseId);
      if (expense) showExpenseDetail(expense, user, roomId);
    });
  });
}

function showExpenseDetail(expense, user, roomId) {
    const icon = expense.categories?.icon || '📦';
    const payerName = expense.profiles?.name || 'Unknown';

    showModal({
      title: `${icon} ${expense.description}`,
      content: `
        <div class="flex flex-col gap-4">
          <div class="flex justify-between">
            <span class="text-muted">Amount</span>
            <span style="font-family: var(--font-heading); font-weight: var(--fw-bold); font-size: var(--fs-xl);">${formatCurrency(expense.amount)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted">Paid by</span>
            <span>${expense.payer_id === user.id ? 'You' : payerName}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted">Date</span>
            <span>${formatFullDate(expense.expense_date)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted">Category</span>
            <span>${expense.categories?.name || 'Other'}</span>
          </div>
          ${expense.is_recurring ? `
            <div class="flex justify-between">
              <span class="text-muted">Recurring</span>
              <span class="badge badge-accent">🔄 ${expense.recurrence_interval}</span>
            </div>
          ` : ''}
          <hr style="border-color: var(--border);">
          <h4 style="font-size: var(--fs-base); font-weight: var(--fw-semibold);">Split Details</h4>
          ${(expense.expense_splits || []).map(split => `
            <div class="split-row">
              <span>${split.profiles?.name || 'Unknown'}</span>
              <span style="font-weight: var(--fw-semibold);">${formatCurrency(split.share_amount)}</span>
            </div>
          `).join('')}
        </div>
      `,
      showFooter: expense.payer_id === user.id,
      confirmText: '🗑️ Delete',
      onConfirm: async () => {
        const confirmed = await confirmDialog('Delete Expense', 'Are you sure you want to delete this expense?');
        if (confirmed) {
          const { error } = await deleteExpense(expense.id);
          if (error) {
            showToast('Error', error.message, 'error');
          } else {
            showToast('Deleted', 'Expense removed', 'success');
            renderRoomDetail({ id: roomId });
          }
        }
      }
    });
}

async function showAddMemberModal(roomId, currentMembers, allProfiles) {

  const currentMemberIds = currentMembers.map(m => m.user_id);
  const availableProfiles = allProfiles.filter(p => !currentMemberIds.includes(p.id));

  showModal({
    title: 'Add Member',
    content: availableProfiles.length > 0 ? `
      <div class="flex flex-col gap-3">
        ${availableProfiles.map((p, i) => `
          <label class="form-checkbox" style="padding: var(--space-3); background: var(--bg-glass); border-radius: var(--radius-md);">
            <input type="checkbox" value="${p.id}" name="new-members" />
            <div class="avatar avatar-md avatar-${(i % 4) + 1}">${p.name[0]}</div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: var(--fw-medium); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.name}</div>
              <div class="text-muted" style="font-size: var(--fs-xs); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.email}</div>
            </div>
          </label>
        `).join('')}
      </div>
    ` : '<p class="text-muted">All registered users are already members of this room.</p>',
    confirmText: 'Add Selected',
    onConfirm: async () => {
      const checkboxes = document.querySelectorAll('input[name="new-members"]:checked');
      for (const cb of checkboxes) {
        await addRoomMember(roomId, cb.value);
      }
      if (checkboxes.length > 0) {
        showToast('Members Added', `${checkboxes.length} member(s) added`, 'success');
        location.reload();
      }
    }
  });
}
