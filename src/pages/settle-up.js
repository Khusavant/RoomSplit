// ============================================================
// Settle Up Page — Room Split
// ============================================================

import { getRoom, getUser, getExpenses, getSettlements, createSettlement, getProfile, getAllProfiles } from '../lib/supabase.js';
import { calculateNetBalances, simplifyDebts, getUserDebts, explainDebtChain, formatCurrency } from '../lib/debt-engine.js';
import { showToast, showModal } from '../lib/notifications.js';
import { navigate } from '../lib/router.js';
import { renderSettlementCard } from '../lib/upi.js';
import { explainDebt } from '../lib/ai.js';

export async function renderSettleUp(params) {
  const { id: roomId } = params;
  const app = document.getElementById('app');
  const user = await getUser();
  if (!user) { navigate('/'); return; }

  // Parse query params
  const hashParts = location.hash.split('?');
  const searchParams = new URLSearchParams(hashParts[1] || '');
  const preselectedToUser = searchParams.get('to');
  const preselectedAmount = parseFloat(searchParams.get('amount')) || 0;

  // Load data
  const [roomRes, expensesRes, settlementsRes, profileRes, allProfilesRes] = await Promise.all([
    getRoom(roomId),
    getExpenses(roomId),
    getSettlements(roomId),
    getProfile(user.id),
    getAllProfiles()
  ]);

  const room = roomRes.data;
  if (!room) { navigate('/dashboard'); return; }

  const expenses = expensesRes.data || [];
  const settlements = settlementsRes.data || [];
  const allProfiles = allProfilesRes.data || [];

  const members = (room.room_members || []).map(m => ({
    user_id: m.user_id,
    name: m.profiles?.name || 'Unknown',
    upi_id: m.profiles?.upi_id || ''
  }));

  const balances = calculateNetBalances(expenses, settlements, members);
  const simplified = simplifyDebts(balances);
  const myDebts = getUserDebts(simplified, user.id);

  // If pre-selected, find the recipient
  let selectedToUser = preselectedToUser || (myDebts.owes[0]?.to.userId || '');
  let settleAmount = preselectedAmount || (myDebts.owes[0]?.amount || 0);

  app.innerHTML = `
    <div style="min-height: 100vh; background: var(--bg-primary);">
      <div class="app-navbar">
        <button class="btn btn-ghost" id="back-btn">← Back</button>
        <h3 style="flex: 1; text-align: center; font-family: var(--font-heading); font-weight: var(--fw-semibold);">Settle Up</h3>
        <div style="width: 80px;"></div>
      </div>

      <div style="max-width: 480px; margin: 0 auto; padding: var(--space-4);">
        ${myDebts.owes.length > 0 ? `
          <!-- Debts you owe -->
          <h3 style="margin-bottom: var(--space-4); font-size: var(--fs-lg);">💸 You Owe</h3>
          ${myDebts.owes.map(debt => {
            const recipient = members.find(m => m.user_id === debt.to.userId);
            return `
              <div class="debt-card ${debt.to.userId === selectedToUser ? 'card-accent' : ''}" 
                   data-user-id="${debt.to.userId}" 
                   data-amount="${debt.amount}"
                   style="cursor: pointer;">
                <div class="debt-info">
                  <div class="avatar avatar-lg avatar-2">${debt.to.name[0]}</div>
                  <div>
                    <div style="font-weight: var(--fw-semibold);">${debt.to.name}</div>
                    <div class="debt-amount balance-negative" style="font-size: var(--fs-2xl);">${formatCurrency(debt.amount)}</div>
                    ${recipient?.upi_id ? `<div class="text-muted" style="font-size: var(--fs-xs);">UPI: ${recipient.upi_id}</div>` : ''}
                  </div>
                </div>
                <div class="flex flex-col gap-2">
                  <button class="btn btn-primary btn-sm settle-now-btn" data-user-id="${debt.to.userId}" data-amount="${debt.amount}">
                    Pay Now
                  </button>
                  <button class="btn btn-ghost btn-sm explain-debt-btn" data-user-id="${debt.to.userId}" data-user-name="${debt.to.name}" data-amount="${debt.amount}">
                    🤖 Why?
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        ` : `
          <div class="empty-state" style="padding: var(--space-8) 0;">
            <div class="empty-state-icon">🎉</div>
            <h3 class="empty-state-title">You're all settled!</h3>
            <p class="empty-state-text">You don't owe anyone in this room.</p>
          </div>
        `}

        ${myDebts.isOwed.length > 0 ? `
          <h3 style="margin: var(--space-6) 0 var(--space-4); font-size: var(--fs-lg);">💰 Owed to You</h3>
          ${myDebts.isOwed.map(debt => `
            <div class="debt-card">
              <div class="debt-info">
                <div class="avatar avatar-lg avatar-3">${debt.from.name[0]}</div>
                <div>
                  <div style="font-weight: var(--fw-semibold);">${debt.from.name}</div>
                  <div class="debt-amount balance-positive" style="font-size: var(--fs-2xl);">${formatCurrency(debt.amount)}</div>
                </div>
              </div>
              <button class="btn btn-ghost btn-sm" onclick="location.hash='#/ai-chat'">
                Send Reminder →
              </button>
            </div>
          `).join('')}
        ` : ''}

        <!-- Settlement QR/UPI Section (shown when settling) -->
        <div id="settlement-section" class="hidden mt-6">
          <div class="card card-accent">
            <div id="settlement-card-content"></div>
            <div style="margin-top: var(--space-4);">
              <div class="form-group">
                <label class="form-label">Payment Method</label>
                <select class="form-select" id="settle-method">
                  <option value="upi">📱 UPI</option>
                  <option value="cash">💵 Cash</option>
                  <option value="bank_transfer">🏦 Bank Transfer</option>
                  <option value="other">📋 Other</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Amount</label>
                <input type="number" id="settle-amount" class="form-input" step="0.01" />
              </div>
              <div class="form-group">
                <label class="form-label">Note (optional)</label>
                <input type="text" id="settle-note" class="form-input" placeholder="e.g., Paid via Google Pay" />
              </div>
              <button class="btn btn-primary btn-block btn-lg" id="confirm-settle-btn">
                ✅ Confirm Settlement
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Events
  document.getElementById('back-btn').addEventListener('click', () => {
    navigate(`/room/${roomId}`);
  });

  // Settle now buttons
  document.querySelectorAll('.settle-now-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const toUserId = btn.dataset.userId;
      const amount = parseFloat(btn.dataset.amount);
      showSettlementSection(toUserId, amount);
    });
  });

  // Explain debt with AI
  document.querySelectorAll('.explain-debt-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const toUserId = btn.dataset.userId;
      const toName = btn.dataset.userName;
      const amount = btn.dataset.amount;

      btn.disabled = true;
      btn.textContent = '⏳ Analyzing...';

      const debtReasons = explainDebtChain(expenses, settlements, user.id, toUserId, members);
      const result = await explainDebt(
        profileRes.data?.name || 'You',
        toName,
        debtReasons,
        amount
      );

      showModal({
        title: `🤖 Why you owe ${toName}`,
        content: `
          <div style="white-space: pre-wrap; line-height: 1.7; font-size: var(--fs-base); color: var(--text-secondary);">
            ${result.content}
          </div>
        `,
        showFooter: false
      });

      btn.disabled = false;
      btn.textContent = '🤖 Why?';
    });
  });

  function showSettlementSection(toUserId, amount) {
    const section = document.getElementById('settlement-section');
    const content = document.getElementById('settlement-card-content');
    const amountInput = document.getElementById('settle-amount');

    section.classList.remove('hidden');
    amountInput.value = amount.toFixed(2);

    // Find recipient profile
    const recipient = allProfiles.find(p => p.id === toUserId);
    if (recipient) {
      renderSettlementCard(content, recipient, amount);
    }

    selectedToUser = toUserId;

    // Confirm settlement
    document.getElementById('confirm-settle-btn').addEventListener('click', async () => {
      const settleAmt = parseFloat(amountInput.value);
      const method = document.getElementById('settle-method').value;
      const note = document.getElementById('settle-note').value.trim();

      if (!settleAmt || settleAmt <= 0) {
        showToast('Error', 'Enter a valid amount', 'error');
        return;
      }

      const btn = document.getElementById('confirm-settle-btn');
      btn.disabled = true;
      btn.textContent = 'Processing...';

      try {
        const { error } = await createSettlement(roomId, user.id, toUserId, settleAmt, method, note);
        if (error) throw error;

        showToast('Payment Recorded!', `${formatCurrency(settleAmt)} settled`, 'success');
        navigate(`/room/${roomId}`);
      } catch (err) {
        showToast('Error', err.message, 'error');
        btn.disabled = false;
        btn.textContent = '✅ Confirm Settlement';
      }
    });

    // Scroll to settlement section
    section.scrollIntoView({ behavior: 'smooth' });
  }

  // If pre-selected, auto-show
  if (preselectedToUser && preselectedAmount) {
    showSettlementSection(preselectedToUser, preselectedAmount);
  }
}
