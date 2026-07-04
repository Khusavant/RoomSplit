// ============================================================
// UPI & QR Code — Room Split
// Generate UPI links and QR codes for settlements
// ============================================================

/**
 * Generate a UPI deep link
 * @param {string} upiId - Recipient UPI ID (e.g., user@paytm)
 * @param {string} name - Recipient name
 * @param {number} amount - Amount in INR
 * @param {string} note - Transaction note
 * @returns {string} UPI deep link URL
 */
export function generateUPILink(upiId, name, amount, note = 'Room Split Settlement') {
  if (!upiId) return null;

  const params = new URLSearchParams({
    pa: upiId,
    pn: name,
    am: amount.toFixed(2),
    cu: 'INR',
    tn: note
  });

  return `upi://pay?${params.toString()}`;
}

/**
 * Generate a QR code for a UPI payment
 * Uses the qrcode library
 * @param {string} upiId - Recipient UPI ID
 * @param {string} name - Recipient name
 * @param {number} amount - Amount in INR
 * @param {HTMLElement} container - DOM element to render QR into
 */
export async function generateQRCode(upiId, name, amount, container) {
  const upiLink = generateUPILink(upiId, name, amount);
  if (!upiLink) {
    container.innerHTML = '<p class="text-muted">No UPI ID configured</p>';
    return;
  }

  try {
    // Dynamic import of qrcode
    const QRCode = await import('qrcode');

    // Create canvas for QR code
    const canvas = document.createElement('canvas');
    await QRCode.toCanvas(canvas, upiLink, {
      width: 200,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });

    container.innerHTML = '';
    container.appendChild(canvas);
  } catch (err) {
    console.error('QR generation error:', err);
    container.innerHTML = '<p class="text-muted">Could not generate QR code</p>';
  }
}

/**
 * Copy UPI ID to clipboard
 */
export async function copyUPIId(upiId) {
  try {
    await navigator.clipboard.writeText(upiId);
    return true;
  } catch (err) {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = upiId;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return true;
  }
}

/**
 * Render a UPI settlement card with QR code and copyable UPI ID
 */
export function renderSettlementCard(container, recipientProfile, amount) {
  const upiId = recipientProfile.upi_id;
  const name = recipientProfile.name;

  container.innerHTML = `
    <div class="qr-container">
      <h3 style="margin-bottom: var(--space-4)">Pay ${name}</h3>
      <div class="balance-card-value balance-negative" style="margin-bottom: var(--space-6); font-size: var(--fs-4xl)">
        ₹${parseFloat(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
      </div>

      ${upiId ? `
        <div id="qr-code-display" class="qr-code" style="margin: 0 auto var(--space-4);">
          <div class="spinner" style="margin: 2rem auto;"></div>
        </div>

        <p class="text-muted" style="font-size: var(--fs-sm); margin-bottom: var(--space-4)">
          Scan QR code or copy UPI ID below
        </p>

        <div class="upi-id-display" id="copy-upi-btn" title="Click to copy UPI ID">
          <span class="upi-id-text">${upiId}</span>
          <span class="copy-btn">📋</span>
        </div>
        <p id="copy-feedback" class="text-success" style="font-size: var(--fs-xs); margin-top: var(--space-2); opacity: 0; transition: opacity 0.3s;"></p>
        
        <a href="${generateUPILink(upiId, name, amount)}" class="btn btn-primary" style="margin-top: var(--space-4); display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; text-decoration: none;">
          <span>📱</span> Pay with UPI App
        </a>
      ` : `
        <div class="empty-state" style="padding: var(--space-6) 0;">
          <div class="empty-state-icon">💳</div>
          <p class="empty-state-text">${name} hasn't added a UPI ID yet. You can settle via cash or bank transfer.</p>
        </div>
      `}
    </div>
  `;

  // Generate QR code if UPI ID exists
  if (upiId) {
    const qrContainer = container.querySelector('#qr-code-display');
    generateQRCode(upiId, name, parseFloat(amount), qrContainer);

    // Copy handler
    const copyBtn = container.querySelector('#copy-upi-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        await copyUPIId(upiId);
        const feedback = container.querySelector('#copy-feedback');
        if (feedback) {
          feedback.textContent = '✅ UPI ID copied!';
          feedback.style.opacity = '1';
          setTimeout(() => { feedback.style.opacity = '0'; }, 2000);
        }
      });
    }
  }
}
