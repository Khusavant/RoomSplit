// ============================================================
// Reports Page — Room Split
// ============================================================

import { getRooms, getExpenses, getSettlements, getUser, getProfile, getNotifications } from '../lib/supabase.js';
import { formatCurrency, formatDate } from '../lib/debt-engine.js';
import { getSpendingInsights, getMonthlySummary } from '../lib/ai.js';
import { showToast } from '../lib/notifications.js';
import { navigate } from '../lib/router.js';
import { renderSidebar } from '../components/sidebar.js';
import { renderNavbar } from '../components/navbar.js';

export async function renderReports() {
  const app = document.getElementById('app');
  const user = await getUser();
  if (!user) { navigate('/'); return; }

  const [profileRes, roomsRes, notifRes] = await Promise.all([
    getProfile(user.id),
    getRooms(),
    getNotifications(user.id)
  ]);

  const profile = profileRes.data;
  const rooms = roomsRes.data || [];
  const notifications = notifRes.data || [];

  // Gather all expenses across rooms
  let allExpenses = [];
  let allSettlements = [];
  let allMembers = [];

  for (const room of rooms) {
    const [expRes, setRes] = await Promise.all([
      getExpenses(room.id),
      getSettlements(room.id)
    ]);
    const expenses = (expRes.data || []).map(e => ({ ...e, roomName: room.name }));
    allExpenses.push(...expenses);
    allSettlements.push(...(setRes.data || []));
    allMembers.push(...(room.room_members || []).map(m => ({
      user_id: m.user_id,
      name: m.profiles?.name || 'Unknown'
    })));
  }

  // Deduplicate members
  const memberMap = {};
  allMembers.forEach(m => { memberMap[m.user_id] = m; });
  allMembers = Object.values(memberMap);

  // Category breakdown
  const categorySpending = {};
  allExpenses.forEach(e => {
    const catName = e.categories?.name || 'Other';
    const catIcon = e.categories?.icon || '📦';
    const catColor = e.categories?.color || '#6b7280';
    if (!categorySpending[catName]) {
      categorySpending[catName] = { total: 0, icon: catIcon, color: catColor, count: 0 };
    }
    categorySpending[catName].total += parseFloat(e.amount);
    categorySpending[catName].count++;
  });

  const sortedCategories = Object.entries(categorySpending)
    .sort((a, b) => b[1].total - a[1].total);

  const totalSpent = allExpenses.reduce((s, e) => s + parseFloat(e.amount), 0);

  // Per-person spending
  const personSpending = {};
  allExpenses.forEach(e => {
    const payerName = e.profiles?.name || 'Unknown';
    if (!personSpending[payerName]) personSpending[payerName] = 0;
    personSpending[payerName] += parseFloat(e.amount);
  });
  const sortedPersons = Object.entries(personSpending).sort((a, b) => b[1] - a[1]);

  // Monthly data
  const monthlySpending = {};
  allExpenses.forEach(e => {
    const d = new Date(e.expense_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlySpending[key]) monthlySpending[key] = 0;
    monthlySpending[key] += parseFloat(e.amount);
  });
  const sortedMonths = Object.entries(monthlySpending).sort((a, b) => a[0].localeCompare(b[0]));

  app.innerHTML = `
    <div class="app-layout">
      <div id="sidebar-container"></div>
      <div class="sidebar-overlay" id="sidebar-overlay"></div>
      <div class="app-main">
        <div id="navbar-container"></div>
        <div class="app-content">
          <div class="page-container">
            <div class="flex items-center justify-between mb-6">
              <h1 style="font-size: var(--fs-2xl);">📊 Reports</h1>
              <button class="btn btn-secondary" id="ai-insights-btn">
                🤖 AI Insights
              </button>
            </div>

            <!-- Summary Cards -->
            <div class="balance-cards mb-6">
              <div class="balance-card total">
                <div style="font-size: 24px; position: absolute; right: 16px; top: 16px; opacity: 0.3; animation: bounceIn 1s cubic-bezier(0.34, 1.56, 0.64, 1);">💸</div>
                <div class="balance-card-label">Total Spent</div>
                <div class="balance-card-value animated-counter" data-value="${totalSpent}">${formatCurrency(0)}</div>
              </div>
              <div class="balance-card owe">
                <div style="font-size: 24px; position: absolute; right: 16px; top: 16px; opacity: 0.3; animation: bounceIn 1s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s;">📝</div>
                <div class="balance-card-label">Expenses</div>
                <div class="balance-card-value animated-counter" data-value="${allExpenses.length}" data-type="number">0</div>
              </div>
              <div class="balance-card owed">
                <div style="font-size: 24px; position: absolute; right: 16px; top: 16px; opacity: 0.3; animation: bounceIn 1s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s;">🤝</div>
                <div class="balance-card-label">Settlements</div>
                <div class="balance-card-value animated-counter" data-value="${allSettlements.length}" data-type="number">0</div>
              </div>
            </div>

            <div id="ai-insights-panel" class="hidden card card-accent mb-6">
              <div class="card-header">
                <h3 class="card-title">🤖 AI Spending Insights</h3>
                <button class="btn btn-ghost btn-sm" onclick="document.getElementById('ai-insights-panel').classList.add('hidden')">✕</button>
              </div>
              <div id="ai-insights-content" style="white-space: pre-wrap; line-height: 1.7; color: var(--text-inverse);">
                <div class="flex items-center gap-2">
                  <div class="spinner"></div>
                  <span>Analyzing your spending patterns...</span>
                </div>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
              <!-- Spending by Category -->
              <div class="card">
                <h3 class="card-title mb-4">Spending by Category</h3>
                ${sortedCategories.length > 0 ? `
                  <div id="category-chart-container" style="margin-bottom: var(--space-4);">
                    <canvas id="category-chart"></canvas>
                  </div>
                  ${sortedCategories.map(([name, data]) => `
                    <div class="flex items-center justify-between" style="padding: var(--space-2) 0; border-bottom: 1px solid var(--glass-border);">
                      <div class="flex items-center gap-2">
                        <div style="width: 12px; height: 12px; border-radius: 50%; background-color: ${data.color};"></div>
                        <span>${data.icon}</span>
                        <span style="font-size: var(--fs-sm);">${name}</span>
                      </div>
                      <div class="text-right">
                        <span style="font-weight: var(--fw-semibold); font-size: var(--fs-sm);">${formatCurrency(data.total)}</span>
                        <span class="text-muted" style="font-size: var(--fs-xs); margin-left: var(--space-2);">
                          ${totalSpent > 0 ? Math.round(data.total / totalSpent * 100) : 0}%
                        </span>
                      </div>
                    </div>
                  `).join('')}
                ` : '<p class="text-muted">No expense data yet</p>'}
              </div>

              <!-- Spending by Person -->
              <div class="card">
                <h3 class="card-title mb-4">Spending by Person</h3>
                ${sortedPersons.length > 0 ? `
                  <div id="person-chart-container" style="margin-bottom: var(--space-4);">
                    <canvas id="person-chart"></canvas>
                  </div>
                  ${sortedPersons.map(([name, total]) => {
                    const pct = totalSpent > 0 ? (total / totalSpent * 100) : 0;
                    return `
                      <div style="padding: var(--space-3) 0; border-bottom: 1px solid var(--glass-border);">
                        <div class="flex items-center justify-between mb-2">
                          <span style="font-size: var(--fs-sm); font-weight: var(--fw-medium);">${name}</span>
                          <span style="font-weight: var(--fw-semibold); font-size: var(--fs-sm);">${formatCurrency(total)}</span>
                        </div>
                        <div class="balance-bar">
                          <div class="balance-bar-fill positive" style="width: ${pct}%;"></div>
                        </div>
                      </div>
                    `;
                  }).join('')}
                ` : '<p class="text-muted">No expense data yet</p>'}
              </div>
            </div>

            <!-- Monthly Trend -->
            <div class="card mt-4">
              <h3 class="card-title mb-4">Monthly Spending Trend</h3>
              ${sortedMonths.length > 0 ? `
                <div id="monthly-chart-container">
                  <canvas id="monthly-chart"></canvas>
                </div>
              ` : '<p class="text-muted">Not enough data for monthly trends</p>'}
            </div>

            <!-- Expense History -->
            <div class="card mt-4">
              <h3 class="card-title mb-4">Full Expense History</h3>
              <div style="max-height: 400px; overflow-y: auto;">
                ${allExpenses.slice(0, 50).map(e => `
                  <div class="expense-item">
                    <div class="expense-icon" style="background: ${(e.categories?.color || '#4ade80')}20; font-size: var(--fs-md);">
                      ${e.categories?.icon || '📦'}
                    </div>
                    <div class="expense-info">
                      <div class="expense-description">${e.description}</div>
                      <div class="expense-meta">${e.profiles?.name || 'Unknown'} · ${e.roomName} · ${formatDate(e.expense_date)}</div>
                    </div>
                    <div class="expense-amount">
                      <div class="expense-amount-value" style="font-size: var(--fs-md);">${formatCurrency(e.amount)}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>

        <nav class="bottom-nav">
          <div class="bottom-nav-item" onclick="location.hash='#/dashboard'">
            <span class="bottom-nav-item-icon">🏠</span><span>Home</span>
          </div>
          <div class="bottom-nav-item active" onclick="location.hash='#/reports'">
            <span class="bottom-nav-item-icon">📊</span><span>Reports</span>
          </div>
          <div class="bottom-nav-item" onclick="location.hash='#/ai-chat'">
            <span class="bottom-nav-item-icon">🤖</span><span>AI</span>
          </div>
          <div class="bottom-nav-item" onclick="location.hash='#/settings'">
            <span class="bottom-nav-item-icon">⚙️</span><span>Settings</span>
          </div>
        </nav>
      </div>
    </div>
  `;

  renderSidebar(document.getElementById('sidebar-container'), rooms, null, user, profile);
  renderNavbar(document.getElementById('navbar-container'), profile, notifications);

  // Render charts
  renderCharts(sortedCategories, sortedPersons, sortedMonths);

  // Animate stat counters
  setTimeout(() => {
    document.querySelectorAll('.animated-counter').forEach(el => {
      const endValue = parseFloat(el.getAttribute('data-value')) || 0;
      const isNumber = el.getAttribute('data-type') === 'number';
      const duration = 1500;
      let start = null;
      function step(timestamp) {
        if (!start) start = timestamp;
        const progress = Math.min((timestamp - start) / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 4); // easeOutQuart
        const current = easeProgress * endValue;
        
        if (isNumber) {
          el.innerText = Math.round(current);
        } else {
          el.innerText = formatCurrency(current);
        }
        
        if (progress < 1) {
          window.requestAnimationFrame(step);
        } else {
          el.innerText = isNumber ? Math.round(endValue) : formatCurrency(endValue);
        }
      }
      window.requestAnimationFrame(step);
    });
  }, 100);

  // AI Insights button
  document.getElementById('ai-insights-btn').addEventListener('click', async () => {
    const panel = document.getElementById('ai-insights-panel');
    panel.classList.remove('hidden');
    panel.scrollIntoView({ behavior: 'smooth' });

    const result = await getSpendingInsights(allExpenses, allSettlements, allMembers);
    document.getElementById('ai-insights-content').innerHTML = result.content;
  });

  // Sidebar overlay
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', () => {
      document.querySelector('.app-sidebar')?.classList.remove('open');
      sidebarOverlay.classList.remove('open');
    });
  }
}

async function renderCharts(categories, persons, months) {
  try {
    const { Chart, registerables } = await import('chart.js');
    Chart.register(...registerables);

    // Category donut chart
    const catCanvas = document.getElementById('category-chart');
    if (catCanvas && categories.length > 0) {
      new Chart(catCanvas, {
        type: 'doughnut',
        data: {
          labels: categories.map(([name]) => name),
          datasets: [{
            data: categories.map(([, data]) => data.total),
            backgroundColor: categories.map(([, data]) => data.color + 'cc'),
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 2,
            hoverOffset: 10
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          animation: {
            animateScale: true,
            animateRotate: true,
            duration: 1500,
            easing: 'easeOutQuart'
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              titleColor: '#fff',
              bodyColor: '#fff',
              borderColor: 'rgba(255, 255, 255, 0.25)',
              borderWidth: 1,
              padding: 12,
              displayColors: false,
              callbacks: {
                label: (ctx) => `${ctx.label}: ₹${ctx.raw.toLocaleString('en-IN')}`
              }
            }
          },
          cutout: '65%'
        }
      });
    }

    // Person bar chart
    const personCanvas = document.getElementById('person-chart');
    if (personCanvas && persons.length > 0) {
      const ctx = personCanvas.getContext('2d');
      const gradientTeal = ctx.createLinearGradient(0, 0, 0, 300);
      gradientTeal.addColorStop(0, 'rgba(74, 222, 128, 0.9)');
      gradientTeal.addColorStop(1, 'rgba(16, 185, 129, 0.6)');

      const gradientBlue = ctx.createLinearGradient(0, 0, 0, 300);
      gradientBlue.addColorStop(0, 'rgba(96, 165, 250, 0.9)');
      gradientBlue.addColorStop(1, 'rgba(59, 130, 246, 0.6)');
      
      const gradientOrange = ctx.createLinearGradient(0, 0, 0, 300);
      gradientOrange.addColorStop(0, 'rgba(251, 146, 60, 0.9)');
      gradientOrange.addColorStop(1, 'rgba(249, 115, 22, 0.6)');

      const gradients = [gradientTeal, gradientBlue, gradientOrange, gradientTeal];

      new Chart(personCanvas, {
        type: 'bar',
        data: {
          labels: persons.map(([name]) => name),
          datasets: [{
            data: persons.map(([, total]) => total),
            backgroundColor: persons.map((_, i) => gradients[i % gradients.length]),
            borderRadius: 8,
            borderSkipped: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          animation: {
            duration: 1500,
            easing: 'easeOutQuart'
          },
          plugins: { 
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              titleColor: '#fff',
              bodyColor: '#fff',
              borderColor: 'rgba(255, 255, 255, 0.25)',
              borderWidth: 1,
              padding: 12
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(0,0,0,0.05)' },
              ticks: { color: '#374151', font: { weight: '500' }, callback: v => '₹' + v.toLocaleString('en-IN') }
            },
            x: {
              grid: { display: false },
              ticks: { color: '#374151', font: { weight: '500' } }
            }
          }
        }
      });
    }

    // Monthly line chart
    const monthCanvas = document.getElementById('monthly-chart');
    if (monthCanvas && months.length > 1) {
      new Chart(monthCanvas, {
        type: 'line',
        data: {
          labels: months.map(([key]) => {
            const [y, m] = key.split('-');
            return new Date(y, m - 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
          }),
          datasets: [{
            data: months.map(([, total]) => total),
            borderColor: '#4ade80',
            backgroundColor: 'rgba(74, 222, 128, 0.1)',
            fill: true,
            tension: 0.4,
            pointBackgroundColor: '#4ade80',
            pointBorderColor: '#1a1a1a',
            pointBorderWidth: 2,
            pointRadius: 5
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(0,0,0,0.05)' },
              ticks: { color: '#374151', font: { weight: '500' }, callback: v => '₹' + v.toLocaleString('en-IN') }
            },
            x: {
              grid: { display: false },
              ticks: { color: '#374151', font: { weight: '500' } }
            }
          }
        }
      });
    }
  } catch (err) {
    console.error('Chart rendering error:', err);
  }
}
