// ============================================================
// Reactive State Store — Room Split
// ============================================================

const state = {
  user: null,
  profile: null,
  profiles: [],
  rooms: [],
  activeRoom: null,
  activeRoomExpenses: [],
  activeRoomSettlements: [],
  activeRoomBalances: [],
  categories: [],
  notifications: [],
  unreadCount: 0,
  sidebarOpen: false,
  notificationPanelOpen: false,
  loading: {}
};

const listeners = {};

export function getState(key) {
  if (key) return state[key];
  return { ...state };
}

export function setState(key, value) {
  const oldValue = state[key];
  state[key] = value;

  // Notify listeners
  if (listeners[key]) {
    listeners[key].forEach(cb => {
      try {
        cb(value, oldValue);
      } catch (e) {
        console.error(`State listener error for "${key}":`, e);
      }
    });
  }

  // Global listeners
  if (listeners['*']) {
    listeners['*'].forEach(cb => {
      try {
        cb(key, value, oldValue);
      } catch (e) {
        console.error('Global state listener error:', e);
      }
    });
  }
}

export function subscribe(key, callback) {
  if (!listeners[key]) listeners[key] = [];
  listeners[key].push(callback);

  // Return unsubscribe function
  return () => {
    listeners[key] = listeners[key].filter(cb => cb !== callback);
  };
}

export function setLoading(key, isLoading) {
  const loading = { ...state.loading, [key]: isLoading };
  setState('loading', loading);
}

export function isLoading(key) {
  return state.loading[key] || false;
}

// ============================================================
// Computed Helpers
// ============================================================

export function getMyBalance(roomBalances, userId) {
  if (!roomBalances || !userId) return { totalPaid: 0, totalShare: 0, net: 0 };

  const myBalance = roomBalances.find(b => b.user_id === userId);
  if (!myBalance) return { totalPaid: 0, totalShare: 0, net: 0 };

  const totalPaid = parseFloat(myBalance.total_paid) || 0;
  const totalShare = parseFloat(myBalance.total_share) || 0;
  const settledSent = parseFloat(myBalance.total_settled_sent) || 0;
  const settledReceived = parseFloat(myBalance.total_settled_received) || 0;

  // Net = what I paid + what I received in settlements - what I owe - what I settled
  const net = totalPaid + settledReceived - totalShare - settledSent;

  return { totalPaid, totalShare, net, settledSent, settledReceived };
}

export function getOverallBalance(rooms, userId) {
  let totalOwed = 0; // others owe me
  let totalOwe = 0;  // I owe others

  // This is a simplified version; the real calculation is done per-room
  return { totalOwed, totalOwe, net: totalOwed - totalOwe };
}
