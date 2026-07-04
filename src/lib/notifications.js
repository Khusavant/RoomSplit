// ============================================================
// Toast Notification System — Room Split
// ============================================================

let toastId = 0;

/**
 * Show a toast notification
 * @param {string} title
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {number} duration - auto-dismiss in ms (0 = manual dismiss)
 */
export function showToast(title, message = '', type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const id = ++toastId;
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.id = `toast-${id}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      ${message ? `<div class="toast-message">${message}</div>` : ''}
    </div>
    <button class="toast-close" onclick="this.closest('.toast').remove()">✕</button>
  `;

  container.appendChild(toast);

  // Auto-dismiss
  if (duration > 0) {
    setTimeout(() => {
      const el = document.getElementById(`toast-${id}`);
      if (el) {
        el.classList.add('toast-exit');
        setTimeout(() => el.remove(), 300);
      }
    }, duration);
  }

  return id;
}

// ============================================================
// Modal System
// ============================================================

let activeModal = null;

/**
 * Show a modal
 * @param {Object} options - { title, content (HTML string), onConfirm, onCancel, confirmText, cancelText, size }
 */
export function showModal(options = {}) {
  closeModal(); // Close any existing

  const container = document.getElementById('modal-container');
  if (!container) return;

  const {
    title = '',
    content = '',
    onConfirm,
    onCancel,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    showFooter = true,
    size = 'default',
    className = ''
  } = options;

  const sizeClass = size === 'full' ? 'modal-fullpage' : '';

  container.innerHTML = `
    <div class="modal-overlay ${className}" id="modal-overlay">
      <div class="modal ${sizeClass}" id="active-modal">
        ${title ? `
          <div class="modal-header">
            <h3 class="modal-title">${title}</h3>
            <button class="modal-close" id="modal-close-btn">✕</button>
          </div>
        ` : ''}
        <div class="modal-body">
          ${content}
        </div>
        ${showFooter ? `
          <div class="modal-footer">
            <button class="btn btn-secondary" id="modal-cancel-btn">${cancelText}</button>
            ${onConfirm ? `<button class="btn btn-primary" id="modal-confirm-btn">${confirmText}</button>` : ''}
          </div>
        ` : ''}
      </div>
    </div>
  `;

  // Event handlers
  const overlay = document.getElementById('modal-overlay');
  const closeBtn = document.getElementById('modal-close-btn');
  const cancelBtn = document.getElementById('modal-cancel-btn');
  const confirmBtn = document.getElementById('modal-confirm-btn');

  const close = () => {
    if (onCancel) onCancel();
    closeModal();
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  if (closeBtn) closeBtn.addEventListener('click', close);
  if (cancelBtn) cancelBtn.addEventListener('click', close);
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      if (onConfirm) onConfirm();
      closeModal();
    });
  }

  // Escape key
  activeModal = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', activeModal);
}

export function closeModal() {
  const container = document.getElementById('modal-container');
  if (container) container.innerHTML = '';
  if (activeModal) {
    document.removeEventListener('keydown', activeModal);
    activeModal = null;
  }
}

/**
 * Show a confirm dialog
 */
export function confirmDialog(title, message) {
  return new Promise((resolve) => {
    showModal({
      title,
      content: `<p style="color: var(--text-secondary)">${message}</p>`,
      confirmText: 'Yes, Confirm',
      cancelText: 'Cancel',
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false)
    });
  });
}
