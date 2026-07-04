// ============================================================
// AI Chat Page — Room Split AI Mentor
// ============================================================

import { getUser, getProfile, getRooms, getExpenses, getSettlements, getNotifications, saveAIMessage, getAIConversations } from '../lib/supabase.js';
import { chatWithAI } from '../lib/ai.js';
import { calculateNetBalances, simplifyDebts, formatCurrency } from '../lib/debt-engine.js';
import { showToast } from '../lib/notifications.js';
import { navigate } from '../lib/router.js';
import { renderSidebar } from '../components/sidebar.js';
import { renderNavbar } from '../components/navbar.js';

export async function renderAIChat() {
  const app = document.getElementById('app');
  const user = await getUser();
  if (!user) { navigate('/'); return; }

  const [profileRes, roomsRes, notifRes, conversationsRes] = await Promise.all([
    getProfile(user.id),
    getRooms(),
    getNotifications(user.id),
    getAIConversations(user.id, null, 50)
  ]);

  const profile = profileRes.data;
  const rooms = roomsRes.data || [];
  const notifications = notifRes.data || [];

  // Build financial context
  let financialContext = await buildFinancialContext(user.id, rooms);

  // Chat messages
  let messages = (conversationsRes.data || []).map(m => ({
    role: m.role,
    content: m.content
  }));

  app.innerHTML = `
    <div class="app-layout">
      <div id="sidebar-container"></div>
      <div class="sidebar-overlay" id="sidebar-overlay"></div>
      <div class="app-main">
        <div id="navbar-container"></div>
        <div class="ai-chat-layout with-bottom-nav" style="display: flex; flex-direction: column; height: 100dvh; background: #f3f4f6;">
          <div class="ai-chat-header" style="padding: var(--space-4) var(--space-6); background: var(--glass-bg); backdrop-filter: blur(var(--glass-blur)); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="background: #10a37f; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px;">✦</div>
              <h1 style="font-size: var(--fs-xl); font-family: var(--font-heading); margin: 0;">AI</h1>
            </div>
            <p class="text-muted" style="font-size: var(--fs-sm); margin: 0;">Your smart financial assistant</p>
          </div>

          <!-- Suggestions -->
          <div class="ai-suggestions" style="padding: 0 var(--space-6);" id="suggestions-bar">
            <button class="ai-suggestion-chip" data-prompt="Summarize my spending this month">📊 Monthly Summary</button>
            <button class="ai-suggestion-chip" data-prompt="Who owes whom and why? Give a complete breakdown.">💸 Debt Breakdown</button>
            <button class="ai-suggestion-chip" data-prompt="What are my top spending categories? How can I save money?">💡 Saving Tips</button>
            <button class="ai-suggestion-chip" data-prompt="Give me a detailed analysis of spending by each person">👥 Person Analysis</button>
            <button class="ai-suggestion-chip" data-prompt="Are there any unusual or unexpected expenses this month?">🔍 Anomalies</button>
            <button class="ai-suggestion-chip" data-prompt="When should we settle our debts? Create a payment plan.">📅 Payment Plan</button>
          </div>

          <div class="ai-chat-messages" id="chat-messages" style="padding: var(--space-4) var(--space-6); flex: 1; overflow-y: auto;">
            ${messages.length === 0 ? `
              <div class="text-center" style="padding: var(--space-8) 0; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <div style="width: 48px; height: 48px; background: #10a37f; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; margin-bottom: var(--space-4);">✦</div>
                <h2 style="font-size: var(--fs-xl); margin-bottom: var(--space-2);">How can I help you today?</h2>
              </div>
            ` : messages.map(m => renderMessage(m)).join('')}
          </div>

          <!-- Chat Input -->
          <div class="ai-chat-input" style="padding: var(--space-4) var(--space-6); background: rgba(255,255,255,0.05); backdrop-filter: blur(12px); border-top: 1px solid rgba(255,255,255,0.1); flex-shrink: 0; display: flex; gap: var(--space-3); align-items: center;">
            <input 
              type="text" 
              id="chat-input" 
              placeholder="Ask me anything about your expenses..." 
              autocomplete="off"
            />
            <button class="btn btn-primary btn-icon" id="send-btn" style="border-radius: var(--radius-full);">
              ➤
            </button>
          </div>
        </div>

        <nav class="bottom-nav">
          <div class="bottom-nav-item" onclick="location.hash='#/dashboard'">
            <span class="bottom-nav-item-icon">🏠</span><span>Home</span>
          </div>
          <div class="bottom-nav-item" onclick="location.hash='#/reports'">
            <span class="bottom-nav-item-icon">📊</span><span>Reports</span>
          </div>
          <div class="bottom-nav-item active" onclick="location.hash='#/ai-chat'">
            <span class="bottom-nav-item-icon">✦</span><span>AI</span>
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

  // Scroll to bottom
  const chatContainer = document.getElementById('chat-messages');
  chatContainer.scrollTop = chatContainer.scrollHeight;

  // Send message
  async function sendMessage(prompt) {
    if (!prompt.trim()) return;

    // Add user message to UI
    messages.push({ role: 'user', content: prompt });
    chatContainer.innerHTML = messages.map(m => renderMessage(m)).join('');

    // Add loading indicator
    const loadingId = 'loading-' + Date.now();
    chatContainer.innerHTML += `
      <div class="ai-message assistant" id="${loadingId}">
        <div class="avatar avatar-sm" style="background: linear-gradient(135deg, #4ade80, #22c55e);">🤖</div>
        <div class="ai-message-bubble">
          <div class="flex items-center gap-2">
            <div class="spinner" style="width: 16px; height: 16px;"></div>
            <span class="text-muted">Thinking...</span>
          </div>
        </div>
      </div>
    `;
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // Clear input
    document.getElementById('chat-input').value = '';
    document.getElementById('suggestions-bar').classList.add('hidden');

    // Save user message
    await saveAIMessage(user.id, null, 'user', prompt);

    // Call AI
    const result = await chatWithAI(
      messages.filter(m => m.role !== 'system').slice(-10),
      financialContext
    );

    // Remove loading
    document.getElementById(loadingId)?.remove();

    // Add AI response
    messages.push({ role: 'assistant', content: result.content });
    chatContainer.innerHTML = messages.map(m => renderMessage(m)).join('');
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // Save AI response
    await saveAIMessage(user.id, null, 'assistant', result.content);
  }

  // Event handlers
  document.getElementById('send-btn').addEventListener('click', () => {
    const input = document.getElementById('chat-input');
    sendMessage(input.value);
  });

  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e.target.value);
    }
  });

  // Suggestion chips
  document.querySelectorAll('.ai-suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      sendMessage(chip.dataset.prompt);
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
}

function renderMessage(msg) {
  if (msg.role === 'user') {
    return `
      <div class="ai-message user" style="display: flex; justify-content: flex-end; margin-bottom: 24px;">
        <div class="ai-message-bubble" style="background: rgba(79, 70, 229, 0.2); backdrop-filter: blur(12px); border: 1px solid rgba(79, 70, 229, 0.3); color: var(--text-primary); border-radius: 16px; padding: 12px 16px; max-width: 80%; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">${escapeHtml(msg.content)}</div>
      </div>
    `;
  } else {
    return `
      <div class="ai-message assistant" style="display: flex; align-items: flex-start; margin-bottom: 24px; gap: 12px;">
        <div style="background: linear-gradient(135deg, #10a37f, #0d8266); color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; margin-top: 4px; box-shadow: 0 4px 12px rgba(16, 163, 127, 0.3);">✦</div>
        <div class="ai-message-bubble" style="background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; padding: 12px 16px; color: var(--text-primary); max-width: calc(100% - 44px); font-size: 15px; line-height: 1.6; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">${formatAIResponse(msg.content)}</div>
      </div>
    `;
  }
}

function formatAIResponse(text) {
  // Simple markdown-like formatting
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code style="background: var(--bg-glass); padding: 2px 6px; border-radius: 4px;">$1</code>')
    .replace(/\n/g, '<br>')
    .replace(/• /g, '&bull; ')
    .replace(/- /g, '&ndash; ');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function buildFinancialContext(userId, rooms) {
  const context = {
    currentUser: userId,
    rooms: [],
    totalOwed: 0,
    totalOwe: 0
  };

  for (const room of rooms) {
    const [expRes, setRes] = await Promise.all([
      getExpenses(room.id),
      getSettlements(room.id)
    ]);

    const expenses = expRes.data || [];
    const settlements = setRes.data || [];
    const members = (room.room_members || []).map(m => ({
      user_id: m.user_id,
      name: m.profiles?.name || 'Unknown'
    }));

    const balances = calculateNetBalances(expenses, settlements, members);
    const simplified = simplifyDebts(balances);

    context.rooms.push({
      name: room.name,
      members: members.map(m => m.name),
      totalExpenses: expenses.length,
      totalSpent: expenses.reduce((s, e) => s + parseFloat(e.amount), 0),
      recentExpenses: expenses.slice(0, 10).map(e => ({
        description: e.description,
        amount: e.amount,
        payer: e.profiles?.name,
        category: e.categories?.name,
        date: e.expense_date
      })),
      debts: simplified.map(d => ({
        from: d.from.name,
        to: d.to.name,
        amount: d.amount
      }))
    });
  }

  return context;
}
