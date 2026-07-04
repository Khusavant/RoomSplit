// ============================================================
// Add Expense Page — Room Split
// ============================================================

import { getRoom, getUser, getCategories, createExpense } from '../lib/supabase.js';
import { showToast } from '../lib/notifications.js';
import { navigate } from '../lib/router.js';
import { formatCurrency } from '../lib/debt-engine.js';
import { suggestDescription } from '../lib/ai.js';

export async function renderAddExpense(params) {
  const { id: roomId } = params;
  const app = document.getElementById('app');
  const user = await getUser();
  if (!user) { navigate('/'); return; }

  const [roomRes, categoriesRes] = await Promise.all([
    getRoom(roomId),
    getCategories()
  ]);

  const room = roomRes.data;
  if (!room) { navigate('/dashboard'); return; }

  const categories = categoriesRes.data || [];
  const members = (room.room_members || []).map(m => ({
    user_id: m.user_id,
    name: m.profiles?.name || 'Unknown'
  }));

  // State
  let splitType = 'equal';
  let selectedCategory = categories[0]?.id || null;
  let selectedPayer = user.id;
  let selectedParticipants = members.map(m => m.user_id);
  let customSplits = {};

  function render() {
    app.innerHTML = `
      <div style="min-height: 100vh; background: var(--bg-primary);">
        <!-- Header -->
        <div class="app-navbar">
          <button class="btn btn-secondary btn-sm" id="back-btn" style="padding: var(--space-2) var(--space-3);">✕</button>
          <h3 style="flex: 1; text-align: center; font-family: var(--font-heading); font-weight: var(--fw-semibold);">Add Expense</h3>
          <button class="btn btn-primary btn-sm" id="save-expense-btn">Save</button>
        </div>

        <div style="max-width: 480px; margin: 0 auto; padding: var(--space-4);">
          <!-- Amount -->
          <div class="amount-input-wrapper">
            <span class="currency-symbol">₹</span>
            <input 
              type="number" 
              id="expense-amount" 
              class="amount-input" 
              placeholder="0.00" 
              step="0.01" 
              min="0.01"
              inputmode="decimal"
              autofocus
            />
          </div>

          <!-- Description -->
          <div class="form-group">
            <label class="form-label">Description</label>
            <div class="flex gap-2">
              <input 
                type="text" 
                id="expense-desc" 
                class="form-input" 
                placeholder="What was this expense for?"
                style="flex: 1;"
              />
              <button class="btn btn-secondary btn-sm" id="ai-suggest-btn" title="AI Suggest">
                🤖
              </button>
            </div>
          </div>

          <!-- Category Picker -->
          <div class="form-group">
            <label class="form-label">Category</label>
            <div class="category-grid" id="category-grid">
              ${categories.map(cat => `
                <div class="category-item ${cat.id === selectedCategory ? 'selected' : ''}" data-cat-id="${cat.id}">
                  <span class="category-icon">${cat.icon}</span>
                  <span class="category-name">${cat.name}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Paid By -->
          <div class="form-group">
            <label class="form-label">Paid by</label>
            <select class="form-select" id="payer-select">
              ${members.map(m => `
                <option value="${m.user_id}" ${m.user_id === selectedPayer ? 'selected' : ''}>
                  ${m.user_id === user.id ? 'You' : m.name}
                </option>
              `).join('')}
            </select>
          </div>

          <!-- Date -->
          <div class="form-group">
            <label class="form-label">Date</label>
            <input type="date" id="expense-date" class="form-input" value="${new Date().toISOString().split('T')[0]}" />
          </div>

          <!-- Split Type -->
          <div class="form-group">
            <label class="form-label">Split Type</label>
            <div class="split-type-selector" id="split-selector">
              <div class="split-type-option ${splitType === 'equal' ? 'active' : ''}" data-type="equal">
                ⚖️ Equal
              </div>
              <div class="split-type-option ${splitType === 'percentage' ? 'active' : ''}" data-type="percentage">
                📊 Percentage
              </div>
              <div class="split-type-option ${splitType === 'exact' ? 'active' : ''}" data-type="exact">
                🔢 Exact
              </div>
            </div>
          </div>

          <!-- Participants -->
          <div class="form-group">
            <label class="form-label">Split among</label>
            <div id="participants-list">
              ${members.map((m, i) => `
                <label class="form-checkbox">
                  <input 
                    type="checkbox" 
                    value="${m.user_id}" 
                    name="participants" 
                    ${selectedParticipants.includes(m.user_id) ? 'checked' : ''}
                  />
                  <div class="avatar avatar-sm avatar-${(i % 4) + 1}">${m.name[0]}</div>
                  <span style="flex: 1;">${m.user_id === user.id ? 'You' : m.name}</span>
                  <span id="share-${m.user_id}" class="text-muted" style="font-size: var(--fs-sm);"></span>
                </label>
              `).join('')}
            </div>
          </div>

          <!-- Custom Split Inputs (shown for percentage/exact) -->
          <div id="custom-split-section" class="${splitType === 'equal' ? 'hidden' : ''}">
            <div class="split-preview" id="split-inputs">
              ${renderCustomSplitInputs(members, splitType, customSplits, user.id)}
            </div>
          </div>

          <!-- Split Preview -->
          <div class="split-preview mt-4" id="split-preview">
            <div class="flex justify-between mb-2">
              <span class="text-muted" style="font-size: var(--fs-sm);">Split Preview</span>
              <span id="split-total" class="text-muted" style="font-size: var(--fs-sm);"></span>
            </div>
            <div id="preview-rows"></div>
          </div>

          <!-- Recurring -->
          <div class="form-group mt-4">
            <label class="form-checkbox">
              <input type="checkbox" id="is-recurring" />
              <span>🔄 Make this recurring</span>
            </label>
            <div id="recurrence-options" class="hidden" style="margin-top: var(--space-3);">
              <select class="form-select" id="recurrence-interval">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly" selected>Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
          </div>

          <!-- Notes -->
          <div class="form-group">
            <label class="form-label">Notes (optional)</label>
            <textarea id="expense-notes" class="form-input form-textarea" placeholder="Any additional details..."></textarea>
          </div>

          <!-- Save Button (bottom) -->
          <button class="btn btn-primary btn-block btn-lg mt-6" id="save-expense-bottom">
            Add Expense
          </button>
        </div>
      </div>
    `;

    bindEvents();
    updatePreview();
  }

  function bindEvents() {
    // Back
    document.getElementById('back-btn').addEventListener('click', () => {
      navigate(`/room/${roomId}`);
    });

    // Category picker
    document.querySelectorAll('#category-grid .category-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('#category-grid .category-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        selectedCategory = item.dataset.catId;
      });
    });

    // Split type
    document.querySelectorAll('#split-selector .split-type-option').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('#split-selector .split-type-option').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        splitType = opt.dataset.type;

        const customSection = document.getElementById('custom-split-section');
        if (splitType === 'equal') {
          customSection.classList.add('hidden');
        } else {
          customSection.classList.remove('hidden');
          document.getElementById('split-inputs').innerHTML =
            renderCustomSplitInputs(members, splitType, customSplits, user.id);
          bindCustomSplitEvents();
        }
        updatePreview();
      });
    });

    // Participants
    document.querySelectorAll('input[name="participants"]').forEach(cb => {
      cb.addEventListener('change', () => {
        selectedParticipants = Array.from(document.querySelectorAll('input[name="participants"]:checked'))
          .map(c => c.value);
        updatePreview();
      });
    });

    // Description auto-category
    document.getElementById('expense-desc').addEventListener('input', (e) => {
      const desc = e.target.value.toLowerCase();
      let matchedCategory = null;

      const rules = [
        { name: 'Groceries', keywords: ['grocery', 'groceries', 'supermarket', 'mart', 'market', 'bigbasket', 'blinkit', 'milk', 'bread'] },
        { name: 'Rent', keywords: ['rent', 'lease', 'deposit'] },
        { name: 'Utilities', keywords: ['electricity', 'water', 'bill', 'internet', 'wifi', 'broadband', 'mobile', 'recharge', 'gas'] },
        { name: 'Transport', keywords: ['uber', 'ola', 'taxi', 'cab', 'bus', 'train', 'flight', 'petrol', 'fuel'] },
        { name: 'Entertainment', keywords: ['movie', 'ticket', 'concert', 'netflix', 'prime', 'spotify', 'game'] },
        { name: 'Shopping', keywords: ['amazon', 'flipkart', 'myntra', 'shoes', 'clothes', 'shirt', 'dress', 'shopping'] },
        { name: 'Health', keywords: ['doctor', 'hospital', 'medicine', 'pharmacy', 'clinic', 'gym', 'health'] },
        { name: 'Travel', keywords: ['hotel', 'stay', 'airbnb', 'trip', 'tour'] },
        { name: 'Education', keywords: ['tuition', 'school', 'college', 'fee', 'course', 'book'] }
      ];

      for (const rule of rules) {
        // match word boundary if possible, but basic includes works fine for these keywords
        if (rule.keywords.some(k => new RegExp('\\\\b' + k + '\\\\b').test(desc))) {
          matchedCategory = categories.find(c => c.name === rule.name);
          break;
        }
      }

      if (matchedCategory && matchedCategory.id !== selectedCategory) {
        selectedCategory = matchedCategory.id;
        document.querySelectorAll('#category-grid .category-item').forEach(i => i.classList.remove('selected'));
        const item = document.querySelector(`#category-grid .category-item[data-cat-id="${matchedCategory.id}"]`);
        if (item) item.classList.add('selected');
      }
    });

    // Amount change
    document.getElementById('expense-amount').addEventListener('input', updatePreview);

    // Payer change
    document.getElementById('payer-select').addEventListener('change', (e) => {
      selectedPayer = e.target.value;
    });

    // Recurring toggle
    document.getElementById('is-recurring').addEventListener('change', (e) => {
      document.getElementById('recurrence-options').classList.toggle('hidden', !e.target.checked);
    });

    // AI suggest
    document.getElementById('ai-suggest-btn').addEventListener('click', async () => {
      const amount = document.getElementById('expense-amount').value;
      const catName = categories.find(c => c.id === selectedCategory)?.name || 'Other';
      const btn = document.getElementById('ai-suggest-btn');
      btn.disabled = true;
      btn.textContent = '⏳';

      const result = await suggestDescription(amount || '0', catName);
      if (!result.error) {
        document.getElementById('expense-desc').value = result.content.replace(/["']/g, '').trim();
      }
      btn.disabled = false;
      btn.textContent = '🤖';
    });

    // Save buttons
    document.getElementById('save-expense-btn').addEventListener('click', saveExpense);
    document.getElementById('save-expense-bottom').addEventListener('click', saveExpense);

    bindCustomSplitEvents();
  }

  function bindCustomSplitEvents() {
    document.querySelectorAll('.custom-split-input').forEach(input => {
      input.addEventListener('input', (e) => {
        customSplits[e.target.dataset.userId] = parseFloat(e.target.value) || 0;
        updatePreview();
      });
    });
  }

  function updatePreview() {
    const amount = parseFloat(document.getElementById('expense-amount').value) || 0;
    const previewRows = document.getElementById('preview-rows');
    const splitTotal = document.getElementById('split-total');

    const checkedParticipants = selectedParticipants.filter(p =>
      members.find(m => m.user_id === p)
    );

    if (checkedParticipants.length === 0 || amount === 0) {
      previewRows.innerHTML = '<p class="text-muted" style="font-size: var(--fs-sm); text-align: center;">Enter amount and select participants</p>';
      return;
    }

    let splits = [];
    if (splitType === 'equal') {
      const share = Math.round((amount / checkedParticipants.length) * 100) / 100;
      splits = checkedParticipants.map(userId => ({
        user_id: userId,
        name: members.find(m => m.user_id === userId)?.name || 'Unknown',
        share_amount: share
      }));
      // Adjust last person for rounding
      const totalSplit = splits.reduce((s, sp) => s + sp.share_amount, 0);
      if (splits.length > 0) {
        splits[splits.length - 1].share_amount += Math.round((amount - totalSplit) * 100) / 100;
      }
    } else if (splitType === 'percentage') {
      splits = checkedParticipants.map(userId => {
        const pct = customSplits[userId] || (100 / checkedParticipants.length);
        return {
          user_id: userId,
          name: members.find(m => m.user_id === userId)?.name || 'Unknown',
          share_amount: Math.round((amount * pct / 100) * 100) / 100,
          share_percentage: pct
        };
      });
    } else {
      splits = checkedParticipants.map(userId => ({
        user_id: userId,
        name: members.find(m => m.user_id === userId)?.name || 'Unknown',
        share_amount: customSplits[userId] || 0
      }));
    }

    const total = splits.reduce((s, sp) => s + sp.share_amount, 0);

    previewRows.innerHTML = splits.map(s => `
      <div class="split-row">
        <span>${s.user_id === user.id ? 'You' : s.name}</span>
        <span style="font-weight: var(--fw-semibold);">${formatCurrency(s.share_amount)}</span>
      </div>
    `).join('');

    const diff = Math.round((amount - total) * 100) / 100;
    splitTotal.innerHTML = splitType !== 'equal' && diff !== 0
      ? `<span class="text-danger">Difference: ${formatCurrency(Math.abs(diff))}</span>`
      : `<span class="text-success">✓ Balanced</span>`;

    // Update share displays next to checkboxes
    splits.forEach(s => {
      const shareEl = document.getElementById(`share-${s.user_id}`);
      if (shareEl) shareEl.textContent = formatCurrency(s.share_amount);
    });
  }

  async function saveExpense() {
    const amount = parseFloat(document.getElementById('expense-amount').value);
    const description = document.getElementById('expense-desc').value.trim();
    const date = document.getElementById('expense-date').value;
    const isRecurring = document.getElementById('is-recurring').checked;
    const recurrenceInterval = isRecurring ? document.getElementById('recurrence-interval').value : null;
    const notes = document.getElementById('expense-notes').value.trim();

    // Validation
    if (!amount || amount <= 0) {
      showToast('Error', 'Please enter a valid amount', 'error');
      return;
    }
    if (!description) {
      showToast('Error', 'Please enter a description', 'error');
      return;
    }
    if (selectedParticipants.length === 0) {
      showToast('Error', 'Please select at least one participant', 'error');
      return;
    }

    // Calculate splits
    let splits = [];
    if (splitType === 'equal') {
      const share = Math.round((amount / selectedParticipants.length) * 100) / 100;
      splits = selectedParticipants.map(userId => ({ user_id: userId, share_amount: share }));
      const totalSplit = splits.reduce((s, sp) => s + sp.share_amount, 0);
      if (splits.length > 0) {
        splits[splits.length - 1].share_amount += Math.round((amount - totalSplit) * 100) / 100;
      }
    } else if (splitType === 'percentage') {
      splits = selectedParticipants.map(userId => {
        const pct = customSplits[userId] || (100 / selectedParticipants.length);
        return {
          user_id: userId,
          share_amount: Math.round((amount * pct / 100) * 100) / 100,
          share_percentage: pct
        };
      });
    } else {
      splits = selectedParticipants.map(userId => ({
        user_id: userId,
        share_amount: customSplits[userId] || 0
      }));

      const totalSplit = splits.reduce((s, sp) => s + sp.share_amount, 0);
      if (Math.abs(totalSplit - amount) > 0.01) {
        showToast('Error', `Split amounts (${formatCurrency(totalSplit)}) don't match total (${formatCurrency(amount)})`, 'error');
        return;
      }
    }

    // Disable buttons
    const btns = document.querySelectorAll('#save-expense-btn, #save-expense-bottom');
    btns.forEach(b => { b.disabled = true; b.textContent = 'Saving...'; });

    try {
      const expenseData = {
        room_id: roomId,
        payer_id: selectedPayer,
        amount,
        description,
        category_id: selectedCategory,
        expense_date: date,
        is_recurring: isRecurring,
        recurrence_interval: recurrenceInterval,
        notes
      };

      const { data, error } = await createExpense(expenseData, splits);
      if (error) throw error;

      showToast('Expense Added!', `${formatCurrency(amount)} for "${description}"`, 'success');
      navigate(`/room/${roomId}`);
    } catch (err) {
      showToast('Error', err.message, 'error');
      btns.forEach(b => { b.disabled = false; b.textContent = 'Save'; });
    }
  }

  render();
}

function renderCustomSplitInputs(members, splitType, customSplits, currentUserId) {
  const label = splitType === 'percentage' ? '%' : '₹';
  const placeholder = splitType === 'percentage' ? '25' : '0.00';

  return members.map((m, i) => `
    <div class="split-row" style="padding: var(--space-3) 0;">
      <div class="flex items-center gap-2">
        <div class="avatar avatar-sm avatar-${(i % 4) + 1}">${m.name[0]}</div>
        <span>${m.user_id === currentUserId ? 'You' : m.name}</span>
      </div>
      <div class="flex items-center gap-2">
        <input 
          type="number" 
          class="form-input custom-split-input" 
          data-user-id="${m.user_id}"
          value="${customSplits[m.user_id] || ''}"
          placeholder="${placeholder}"
          step="${splitType === 'percentage' ? '1' : '0.01'}"
          style="width: 100px; text-align: right;"
        />
        <span class="text-muted">${label}</span>
      </div>
    </div>
  `).join('');
}
