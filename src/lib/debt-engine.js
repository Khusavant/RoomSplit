// ============================================================
// Debt Engine — Room Split
// Smart debt simplification (the core algorithm)
// ============================================================

/**
 * Calculate net balances for each member in a room.
 * Net = (total paid by user) - (total share owed by user) + (settlements received) - (settlements sent)
 * Positive = others owe you. Negative = you owe others.
 */
export function calculateNetBalances(expenses, settlements, members) {
  const balances = {};

  // Initialize all members
  members.forEach(m => {
    const userId = m.user_id || m.id;
    balances[userId] = {
      userId,
      name: m.name || m.profiles?.name || 'Unknown',
      totalPaid: 0,
      totalOwed: 0,
      settledSent: 0,
      settledReceived: 0,
      net: 0
    };
  });

  // Process expenses
  expenses.forEach(expense => {
    if (expense.is_deleted) return;

    const payerId = expense.payer_id;
    const amount = parseFloat(expense.amount);

    // Payer paid this amount
    if (balances[payerId]) {
      balances[payerId].totalPaid += amount;
    }

    // Each split participant owes their share
    if (expense.expense_splits) {
      expense.expense_splits.forEach(split => {
        const userId = split.user_id;
        const shareAmount = parseFloat(split.share_amount);
        if (balances[userId]) {
          balances[userId].totalOwed += shareAmount;
        }
      });
    }
  });

  // Process settlements
  settlements.forEach(settlement => {
    const fromUser = settlement.from_user;
    const toUser = settlement.to_user;
    const amount = parseFloat(settlement.amount);

    if (balances[fromUser]) {
      balances[fromUser].settledSent += amount;
    }
    if (balances[toUser]) {
      balances[toUser].settledReceived += amount;
    }
  });

  // Calculate net balance for each person
  // Net = paid + sent_settlements - owed - received_settlements
  Object.values(balances).forEach(b => {
    b.net = b.totalPaid + b.settledSent - b.totalOwed - b.settledReceived;
    b.net = Math.round(b.net * 100) / 100; // Avoid floating point issues
  });

  return balances;
}

/**
 * Simplify debts — minimize the number of transactions.
 * Uses a greedy approach: match the biggest debtor with the biggest creditor.
 *
 * Example: If C owes A ₹1000 and A owes B ₹1000,
 * instead of two transactions, simplify to: C pays B ₹1000 directly.
 *
 * Returns array of { from, to, amount } objects.
 */
export function simplifyDebts(balances) {
  const debtors = []; // people who owe money (negative net)
  const creditors = []; // people who are owed money (positive net)

  Object.values(balances).forEach(b => {
    if (b.net < -0.01) {
      debtors.push({ userId: b.userId, name: b.name, amount: Math.abs(b.net) });
    } else if (b.net > 0.01) {
      creditors.push({ userId: b.userId, name: b.name, amount: b.net });
    }
  });

  // Sort descending by amount for efficiency
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const transferAmount = Math.min(debtor.amount, creditor.amount);

    if (transferAmount > 0.01) {
      transactions.push({
        from: { userId: debtor.userId, name: debtor.name },
        to: { userId: creditor.userId, name: creditor.name },
        amount: Math.round(transferAmount * 100) / 100
      });
    }

    debtor.amount -= transferAmount;
    creditor.amount -= transferAmount;

    // Round to avoid floating point drift
    debtor.amount = Math.round(debtor.amount * 100) / 100;
    creditor.amount = Math.round(creditor.amount * 100) / 100;

    if (debtor.amount < 0.01) i++;
    if (creditor.amount < 0.01) j++;
  }

  return transactions;
}

/**
 * Get what a specific user owes or is owed.
 * Returns: { owes: [{to, amount}], isOwed: [{from, amount}] }
 */
export function getUserDebts(simplifiedDebts, userId) {
  const owes = [];   // user needs to pay these people
  const isOwed = []; // these people owe the user

  simplifiedDebts.forEach(t => {
    if (t.from.userId === userId) {
      owes.push({ to: t.to, amount: t.amount });
    }
    if (t.to.userId === userId) {
      isOwed.push({ from: t.from, amount: t.amount });
    }
  });

  return { owes, isOwed };
}

/**
 * Generate a human-readable explanation of a debt chain.
 * Useful for the AI mentor to explain why money is owed.
 */
export function explainDebtChain(expenses, settlements, fromUserId, toUserId, members) {
  const memberMap = {};
  members.forEach(m => {
    const id = m.user_id || m.id;
    memberMap[id] = m.name || m.profiles?.name || 'Someone';
  });

  const reasons = [];

  // Find expenses where toUser paid and fromUser was a participant
  expenses.forEach(expense => {
    if (expense.is_deleted) return;
    if (expense.payer_id === toUserId) {
      const split = expense.expense_splits?.find(s => s.user_id === fromUserId);
      if (split) {
        reasons.push({
          type: 'expense',
          description: expense.description,
          amount: parseFloat(split.share_amount),
          date: expense.expense_date,
          payer: memberMap[toUserId]
        });
      }
    }
  });

  // Find settlements already made
  settlements.forEach(s => {
    if (s.from_user === fromUserId && s.to_user === toUserId) {
      reasons.push({
        type: 'settlement',
        description: `Payment to ${memberMap[toUserId]}`,
        amount: -parseFloat(s.amount),
        date: s.created_at
      });
    }
  });

  return reasons;
}

/**
 * Format currency for display
 */
export function formatCurrency(amount, symbol = '₹') {
  const num = parseFloat(amount) || 0;
  const formatted = Math.abs(num).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${symbol}${formatted}`;
}

/**
 * Format a relative date
 */
export function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}

export function formatFullDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}
