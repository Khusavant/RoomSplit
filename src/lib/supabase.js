// ============================================================
// Supabase Client — Room Split
// ============================================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Please check your .env file.');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// ============================================================
// Auth Helpers
// ============================================================

export async function signUp(email, password, name) {
  // Check if max users reached
  const { count } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true });

  const maxUsers = parseInt(import.meta.env.VITE_MAX_USERS || '4');
  if (count >= maxUsers) {
    return { data: null, error: { message: `Maximum ${maxUsers} users allowed. Registration is closed.` } };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name }
    }
  });

  return { data, error };
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  return { data, error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ============================================================
// Profile Helpers
// ============================================================

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return { data, error };
}

export async function getAllProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('name');
  return { data: data || [], error };
}

export async function updateProfile(userId, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();
  return { data, error };
}

// ============================================================
// Room Helpers
// ============================================================

export async function getRooms() {
  const { data, error } = await supabase
    .from('rooms')
    .select(`
      *,
      room_members(user_id, role, profiles(id, name, avatar_url)),
      expenses(id, amount, payer_id, is_deleted)
    `)
    .order('created_at', { ascending: false });
  return { data: data || [], error };
}

export async function getRoom(roomId) {
  const { data, error } = await supabase
    .from('rooms')
    .select(`
      *,
      room_members(user_id, role, profiles(id, name, avatar_url, upi_id))
    `)
    .eq('id', roomId)
    .single();
  return { data, error };
}

export async function createRoom(name, description, imageUrl) {
  const user = await getUser();
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .insert({ name, description, image_url: imageUrl, created_by: user.id })
    .select()
    .single();

  if (roomError) {
    if (roomError.code === '23505') { // Postgres unique_violation code
      return { data: null, error: new Error(`The room name "${name}" is already taken. Please choose a different name or ask the creator to add you.`) };
    }
    return { data: null, error: roomError };
  }

  // Add creator as admin member with accepted status
  await supabase.from('room_members').insert({
    room_id: room.id,
    user_id: user.id,
    role: 'admin',
    status: 'accepted'
  });

  return { data: room, error: null };
}

export async function addRoomMember(roomId, userId) {
  const { data, error } = await supabase
    .from('room_members')
    .insert({ room_id: roomId, user_id: userId, role: 'member', status: 'pending' })
    .select()
    .single();
  return { data, error };
}

export async function acceptRoomInvite(roomId, notifId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not logged in") };
  
  const { data, error } = await supabase
    .from('room_members')
    .update({ status: 'accepted' })
    .eq('room_id', roomId)
    .eq('user_id', user.id);
    
  if (!error && notifId) {
    await supabase.from('notifications').delete().eq('id', notifId);
  }
  return { data, error };
}

export async function rejectRoomInvite(roomId, notifId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not logged in") };

  const { data, error } = await supabase
    .from('room_members')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', user.id);
    
  if (!error && notifId) {
    await supabase.from('notifications').delete().eq('id', notifId);
  }
  return { data, error };
}

export async function removeRoomMember(roomId, userId) {
  const { error } = await supabase
    .from('room_members')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', userId);
  return { error };
}

// ============================================================
// Expense Helpers
// ============================================================

export async function getExpenses(roomId) {
  const { data, error } = await supabase
    .from('expenses')
    .select(`
      *,
      profiles:payer_id(id, name, avatar_url),
      categories:category_id(id, name, icon, color),
      expense_splits(id, user_id, share_amount, share_percentage, is_settled, profiles:user_id(id, name))
    `)
    .eq('room_id', roomId)
    .eq('is_deleted', false)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false });
  return { data: data || [], error };
}

export async function createExpense(expenseData, splits) {
  // Insert expense
  const { data: expense, error: expenseError } = await supabase
    .from('expenses')
    .insert(expenseData)
    .select()
    .single();

  if (expenseError) return { data: null, error: expenseError };

  // Insert splits
  const splitRecords = splits.map(s => ({
    expense_id: expense.id,
    user_id: s.user_id,
    share_amount: s.share_amount,
    share_percentage: s.share_percentage || null
  }));

  const { error: splitError } = await supabase
    .from('expense_splits')
    .insert(splitRecords);

  if (splitError) return { data: null, error: splitError };

  return { data: expense, error: null };
}

export async function deleteExpense(expenseId) {
  const { error } = await supabase
    .from('expenses')
    .update({ is_deleted: true })
    .eq('id', expenseId);
  return { error };
}

// ============================================================
// Settlement Helpers
// ============================================================

export async function getSettlements(roomId) {
  const { data, error } = await supabase
    .from('settlements')
    .select(`
      *,
      from_profile:from_user(id, name, avatar_url),
      to_profile:to_user(id, name, avatar_url)
    `)
    .eq('room_id', roomId)
    .order('created_at', { ascending: false });
  return { data: data || [], error };
}

export async function createSettlement(roomId, fromUser, toUser, amount, method, note) {
  const { data, error } = await supabase
    .from('settlements')
    .insert({ room_id: roomId, from_user: fromUser, to_user: toUser, amount, method, note })
    .select()
    .single();
  return { data, error };
}

// ============================================================
// Notification Helpers
// ============================================================

export async function getNotifications(userId) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  return { data: data || [], error };
}

export async function markNotificationRead(notificationId) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);
  return { error };
}

export async function markAllNotificationsRead(userId) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);
  return { error };
}

// ============================================================
// Category Helpers
// ============================================================

export async function getCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name');
  return { data: data || [], error };
}

// ============================================================
// Balance Helpers
// ============================================================

export async function getRoomBalanceSummary(roomId) {
  const { data, error } = await supabase
    .from('room_balance_summary')
    .select('*')
    .eq('room_id', roomId);
  return { data: data || [], error };
}

// ============================================================
// AI Conversation Helpers
// ============================================================

export async function saveAIMessage(userId, roomId, role, content) {
  const { data, error } = await supabase
    .from('ai_conversations')
    .insert({ user_id: userId, room_id: roomId, role, content })
    .select()
    .single();
  return { data, error };
}

export async function getAIConversations(userId, roomId, limit = 20) {
  let query = supabase
    .from('ai_conversations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (roomId) {
    query = query.eq('room_id', roomId);
  }

  const { data, error } = await query;
  return { data: data || [], error };
}
// ============================================================
// AI Memory Helpers
// ============================================================

export async function getAIMemories(userId) {
  const { data, error } = await supabase
    .from('ai_memory')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  return { data: data || [], error };
}

export async function saveAIMemory(userId, memoryText) {
  const { data, error } = await supabase
    .from('ai_memory')
    .insert({ user_id: userId, memory_text: memoryText })
    .select()
    .single();
  return { data, error };
}

export async function deleteAIMemory(memoryId) {
  const { data, error } = await supabase
    .from('ai_memory')
    .delete()
    .eq('id', memoryId);
  return { data, error };
}

export async function deleteRoom(roomId) {
  const { data, error } = await supabase
    .from('rooms')
    .delete()
    .eq('id', roomId);
  return { data, error };
}
