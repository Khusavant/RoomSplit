// ============================================================
// Settings Page — Room Split
// ============================================================

import { getUser, getProfile, updateProfile, getAllProfiles, getNotifications, getRooms } from '../lib/supabase.js';
import { showToast } from '../lib/notifications.js';
import { navigate } from '../lib/router.js';
import { renderSidebar } from '../components/sidebar.js';
import { renderNavbar } from '../components/navbar.js';
import { signOut } from '../lib/supabase.js';

export async function renderSettings() {
  const app = document.getElementById('app');
  const user = await getUser();
  if (!user) { navigate('/'); return; }

  const [profileRes, allProfilesRes, roomsRes, notifRes] = await Promise.all([
    getProfile(user.id),
    getAllProfiles(),
    getRooms(),
    getNotifications(user.id)
  ]);

  const profile = profileRes.data;
  const allProfiles = allProfilesRes.data || [];
  const rooms = roomsRes.data || [];
  const notifications = notifRes.data || [];

  app.innerHTML = `
    <div class="app-layout">
      <div id="sidebar-container"></div>
      <div class="sidebar-overlay" id="sidebar-overlay"></div>
      <div class="app-main">
        <div id="navbar-container"></div>
        <div class="app-content">
          <div class="page-container">
            <h1 style="font-size: var(--fs-2xl); margin-bottom: var(--space-6);">⚙️ Settings</h1>

            <!-- Profile Section -->
            <div class="settings-section">
              <h2 class="settings-section-title">Profile</h2>
              <div class="card">
                <div class="flex items-center gap-4 mb-6">
                  <div class="avatar avatar-xl avatar-1" style="font-size: var(--fs-2xl);">
                    ${(profile?.name || 'U')[0]}
                  </div>
                  <div style="min-width: 0; flex: 1;">
                    <h3 style="font-size: var(--fs-xl); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${profile?.name || 'User'}</h3>
                  </div>
                </div>

                <form id="profile-form">
                  <div class="form-group">
                    <label class="form-label" for="setting-name">Display Name</label>
                    <input type="text" id="setting-name" class="form-input" value="${profile?.name || ''}" />
                  </div>

                  <div class="form-group">
                    <label class="form-label" for="setting-upi">UPI ID</label>
                    <input type="text" id="setting-upi" class="form-input" value="${profile?.upi_id || ''}" placeholder="yourname@paytm" />
                    <p class="form-hint">Others will use this to pay you via UPI</p>
                  </div>

                  <div class="form-group">
                    <label class="form-label" for="setting-phone">Phone Number</label>
                    <input type="tel" id="setting-phone" class="form-input" value="${profile?.phone || ''}" placeholder="+91 XXXXX XXXXX" />
                  </div>

                  <button type="submit" class="btn btn-primary" id="save-profile-btn">
                    Save Changes
                  </button>
                </form>
              </div>
            </div>

            <!-- Members Section -->
            <div class="settings-section">
              <h2 class="settings-section-title">All Members (${allProfiles.length}/4)</h2>
              <div class="card">
                ${allProfiles.map((p, i) => `
                  <div class="settings-item">
                    <div class="flex items-center gap-3">
                      <div class="avatar avatar-md avatar-${(i % 4) + 1}">${p.name[0]}</div>
                      <div>
                        <div class="settings-item-label">${p.name} ${p.id === user.id ? '(You)' : ''}</div>
                        <div class="settings-item-desc">${p.email}</div>
                        ${p.upi_id ? `<div style="font-size: var(--fs-xs); color: var(--accent);">UPI: ${p.upi_id}</div>` : ''}
                      </div>
                    </div>
                    ${p.id === user.id ? '<span class="badge badge-accent">You</span>' : ''}
                  </div>
                `).join('')}
                ${allProfiles.length < 4 ? `
                  <div style="padding: var(--space-4); text-align: center;">
                    <p class="text-muted" style="font-size: var(--fs-sm);">
                      ${4 - allProfiles.length} more user(s) can register. Share the app link with your roommates!
                    </p>
                  </div>
                ` : ''}
              </div>
            </div>

            <!-- App Info Section -->
            <div class="settings-section">
              <h2 class="settings-section-title">About</h2>
              <div class="card">
                <div class="settings-item">
                  <div>
                    <div class="settings-item-label">Room Split</div>
                    <div class="settings-item-desc">Version 1.0.0</div>
                  </div>
                  <span class="badge badge-accent">Beta</span>
                </div>
                <div class="settings-item">
                  <div>
                    <div class="settings-item-label">AI Model</div>
                    <div class="settings-item-desc">${import.meta.env.VITE_GROQ_MODEL || 'llama-3.3-70b-versatile'} via Groq</div>
                  </div>
                  <span>🤖</span>
                </div>
                <div class="settings-item">
                  <div>
                    <div class="settings-item-label">Database</div>
                    <div class="settings-item-desc">Supabase (PostgreSQL)</div>
                  </div>
                  <span>🗄️</span>
                </div>
                <div class="settings-item">
                  <div>
                    <div class="settings-item-label">Currency</div>
                    <div class="settings-item-desc">Indian Rupees (₹)</div>
                  </div>
                  <span>💰</span>
                </div>
              </div>
            </div>

            <!-- Danger Zone -->
            <div class="settings-section">
              <h2 class="settings-section-title" style="color: var(--danger);">Account</h2>
              <div class="card" style="border-color: rgba(239, 68, 68, 0.2);">
                <div class="settings-item">
                  <div>
                    <div class="settings-item-label">Sign Out</div>
                    <div class="settings-item-desc">Sign out of your account</div>
                  </div>
                  <button class="btn btn-danger btn-sm" id="signout-btn">Sign Out</button>
                </div>
              </div>
            </div>

          </div>
        </div>

        <nav class="bottom-nav">
          <div class="bottom-nav-item" onclick="location.hash='#/dashboard'">
            <span class="bottom-nav-item-icon">🏠</span><span>Home</span>
          </div>
          <div class="bottom-nav-item" onclick="location.hash='#/reports'">
            <span class="bottom-nav-item-icon">📊</span><span>Reports</span>
          </div>
          <div class="bottom-nav-item" onclick="location.hash='#/ai-chat'">
            <span class="bottom-nav-item-icon">🤖</span><span>AI</span>
          </div>
          <div class="bottom-nav-item active" onclick="location.hash='#/settings'">
            <span class="bottom-nav-item-icon">⚙️</span><span>Settings</span>
          </div>
        </nav>
      </div>
    </div>
  `;

  renderSidebar(document.getElementById('sidebar-container'), rooms, null, user, profile);
  renderNavbar(document.getElementById('navbar-container'), profile, notifications);

  // Save profile
  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('setting-name').value.trim();
    const upi_id = document.getElementById('setting-upi').value.trim();
    const phone = document.getElementById('setting-phone').value.trim();

    if (!name) {
      showToast('Error', 'Name is required', 'error');
      return;
    }

    const btn = document.getElementById('save-profile-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const { error } = await updateProfile(user.id, { name, upi_id, phone });
      if (error) throw error;
      showToast('Profile Updated', 'Your changes have been saved', 'success');
    } catch (err) {
      showToast('Error', err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  });

  // Sign out
  document.getElementById('signout-btn').addEventListener('click', async () => {
    await signOut();
    showToast('Signed Out', 'See you later!', 'info');
    navigate('/');
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
