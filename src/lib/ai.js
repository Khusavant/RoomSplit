// ============================================================
// Groq AI Integration — Room Split
// AI Mentor: spending insights, debt explanations, smart assistant
// ============================================================

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
import { getUser, getAIMemories, saveAIMemory, deleteAIMemory } from './supabase.js';

function getApiKey() {
  return import.meta.env.VITE_GROQ_API_KEY;
}

function getModel() {
  return import.meta.env.VITE_GROQ_MODEL || 'llama-3.3-70b-versatile';
}

const SYSTEM_PROMPT = `You are Room Split AI — an intelligent financial assistant embedded in an expense-splitting app used by a group of roommates/friends in India. You are like Apple Intelligence: smart, contextual, proactive, and deeply helpful.

Your role:
1. **Expense Insights**: Analyze spending patterns, identify trends, suggest savings
2. **Debt Explanations**: When asked "why do I owe X?", trace the exact expenses that led to the debt
3. **Smart Summaries**: Provide clear monthly/weekly spending summaries
4. **Payment Reminders**: Remind about pending dues and suggest when to settle
5. **Categorization Help**: Suggest categories for expenses based on descriptions
6. **Financial Tips**: Give practical budgeting advice relevant to Indian roommates
7. **Long-Term Memory**: If the user tells you a preference, fact, or something they want you to remember (e.g. "I am vegetarian", "I hate splitwise", "I owe Yash ₹500 extra"), you MUST store it using the memory command. If they ask you to forget something, delete it.

Guidelines:
- Use ₹ (Indian Rupees) for all currency
- Be concise and friendly, not overly formal
- Use emojis sparingly but effectively
- When explaining debts, show the exact expense trail
- If data is provided, analyze it specifically — don't give generic advice
- Format amounts nicely (e.g., ₹1,500.00)
- When providing summaries, use bullet points and clear structure

--- MEMORY COMMANDS (STRICT INSTRUCTIONS) ---
To remember a fact, you MUST output exactly:
[SAVE_MEMORY: "fact to remember"]
To forget a fact (if you see its ID in the context), you MUST output exactly:
[DELETE_MEMORY: "uuid-of-memory"]
You can include these commands anywhere in your response, and they will be silently processed and removed from the user's view. Use these commands proactively to optimize your knowledge of the user!`;

/**
 * Send a message to Groq AI and get a response
 */
export async function chatWithAI(messages, contextData = null) {
  const apiKey = getApiKey();
  if (!apiKey || apiKey === 'your_groq_api_key_here') {
    return {
      content: '⚠️ AI is not configured. Please add your Groq API key to the .env file (VITE_GROQ_API_KEY).',
      error: true
    };
  }

  // Fetch user memories
  const user = await getUser();
  let memories = [];
  if (user) {
    const memoryRes = await getAIMemories(user.id);
    if (memoryRes.data) memories = memoryRes.data;
  }

  // Build system message with context
  let systemMessage = SYSTEM_PROMPT;
  if (memories.length > 0) {
    systemMessage += `\n\n--- YOUR MEMORY OF THE USER ---\n`;
    memories.forEach(m => {
      systemMessage += `ID: ${m.id} | Fact: ${m.memory_text}\n`;
    });
  }

  if (contextData) {
    systemMessage += `\n\n--- CURRENT CONTEXT ---\n${JSON.stringify(contextData, null, 2)}`;
  }

  const allMessages = [
    { role: 'system', content: systemMessage },
    ...messages
  ];

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: getModel(),
        messages: allMessages,
        temperature: 0.7,
        max_tokens: 1024,
        top_p: 0.9
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    let content = data.choices[0].message.content;

    // Parse and execute memory commands silently
    if (user) {
      const saveRegex = /\[SAVE_MEMORY:\s*"([^"]+)"\]/g;
      const deleteRegex = /\[DELETE_MEMORY:\s*"([^"]+)"\]/g;

      let match;
      while ((match = saveRegex.exec(content)) !== null) {
        await saveAIMemory(user.id, match[1]);
      }
      while ((match = deleteRegex.exec(content)) !== null) {
        await deleteAIMemory(match[1]);
      }

      // Strip commands from output
      content = content.replace(/\[SAVE_MEMORY:\s*"([^"]+)"\]/g, '');
      content = content.replace(/\[DELETE_MEMORY:\s*"([^"]+)"\]/g, '');
      content = content.trim();
    }

    return {
      content,
      error: false
    };
  } catch (err) {
    console.error('Groq AI Error:', err);
    return {
      content: `❌ AI Error: ${err.message}`,
      error: true
    };
  }
}

/**
 * Get spending insights for a room
 */
export async function getSpendingInsights(expenses, settlements, members, period = 'month') {
  const contextData = {
    period,
    totalExpenses: expenses.length,
    members: members.map(m => ({
      name: m.name || m.profiles?.name,
      id: m.user_id || m.id
    })),
    recentExpenses: expenses.slice(0, 20).map(e => ({
      description: e.description,
      amount: e.amount,
      payer: e.profiles?.name || e.payer_id,
      category: e.categories?.name || 'Uncategorized',
      date: e.expense_date
    })),
    totalSpent: expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0),
    settlementCount: settlements.length
  };

  return chatWithAI([{
    role: 'user',
    content: `Analyze our group's spending and give a smart summary. Include: total spent, top categories, who spends most, any unusual patterns, and tips to save money. Be specific with the data provided.`
  }], contextData);
}

/**
 * Explain why a user owes money (debt trail)
 */
export async function explainDebt(fromUser, toUser, debtReasons, totalOwed) {
  const contextData = {
    debtor: fromUser,
    creditor: toUser,
    totalOwed,
    reasons: debtReasons
  };

  return chatWithAI([{
    role: 'user',
    content: `Explain clearly why ${fromUser} owes ₹${totalOwed} to ${toUser}. Break down each expense that contributed to this debt, and suggest how to settle. Use the debt reasons data provided.`
  }], contextData);
}

/**
 * Suggest a smart description for an expense
 */
export async function suggestDescription(amount, category) {
  return chatWithAI([{
    role: 'user',
    content: `I'm adding an expense of ₹${amount} in the "${category}" category. Suggest a brief, natural description (just the description text, nothing else, max 5 words).`
  }]);
}

/**
 * Get monthly spending summary
 */
export async function getMonthlySummary(expenses, month, year) {
  const monthExpenses = expenses.filter(e => {
    const d = new Date(e.expense_date);
    return d.getMonth() === month && d.getFullYear() === year;
  });

  const contextData = {
    month: new Date(year, month).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    expenses: monthExpenses.map(e => ({
      description: e.description,
      amount: e.amount,
      category: e.categories?.name || 'Other',
      date: e.expense_date,
      payer: e.profiles?.name
    })),
    total: monthExpenses.reduce((s, e) => s + parseFloat(e.amount), 0)
  };

  return chatWithAI([{
    role: 'user',
    content: `Give me a detailed monthly report for ${contextData.month}. Include spending by category, per-person breakdown, comparison insights, and actionable tips.`
  }], contextData);
}
