// ============================================================
// Auth Page — Login & Register — Room Split
// ============================================================

import { signIn, signUp, getAllProfiles } from '../lib/supabase.js';
import { showToast } from '../lib/notifications.js';
import { navigate } from '../lib/router.js';

export function renderAuthPage() {
  const app = document.getElementById('app');
  let isLogin = true;

  function render() {
    app.innerHTML = `
      <div class="auth-page">
        <div class="auth-container">
          <div class="auth-card" id="auth-card">
            <div class="auth-logo">
              <span class="logo-icon">💰</span>
              <h1>Room<span class="accent">Split</span></h1>
              <p>${isLogin ? 'Welcome back! Sign in to continue.' : 'Create your account to get started.'}</p>
            </div>

            <form id="auth-form" class="auth-form">
              ${!isLogin ? `
                <div class="form-group">
                  <label class="form-label" for="auth-name">Full Name</label>
                  <input 
                    type="text" 
                    id="auth-name" 
                    class="form-input" 
                    placeholder="Enter your name"
                    required
                    autocomplete="name"
                  />
                </div>
              ` : ''}

              <div class="form-group">
                <label class="form-label" for="auth-email">Email Address</label>
                <input 
                  type="email" 
                  id="auth-email" 
                  class="form-input" 
                  placeholder="you@example.com"
                  required
                  autocomplete="email"
                />
              </div>

              <div class="form-group">
                <label class="form-label" for="auth-password">Password</label>
                <input 
                  type="password" 
                  id="auth-password" 
                  class="form-input" 
                  placeholder="${isLogin ? 'Enter your password' : 'Create a password (min 6 chars)'}"
                  required
                  minlength="6"
                  autocomplete="${isLogin ? 'current-password' : 'new-password'}"
                />
              </div>

              <div id="register-limit-msg" style="display: none;">
                <div class="badge badge-danger" style="padding: 8px 12px; width: 100%; justify-content: center; margin-bottom: var(--space-4);">
                  🔒 Registration is closed (4/4 users registered)
                </div>
              </div>

              <button type="submit" class="btn btn-primary btn-block btn-lg" id="auth-submit-btn">
                ${isLogin ? 'Sign In' : 'Create Account'}
              </button>
            </form>

            <div class="auth-footer">
              ${isLogin 
                ? `Don't have an account? <a href="#" id="toggle-auth">Sign Up</a>`
                : `Already have an account? <a href="#" id="toggle-auth">Sign In</a>`
              }
            </div>
          </div>

          <p style="text-align: center; margin-top: var(--space-4); font-size: var(--fs-xs); color: var(--text-muted);">
            Split the bill, not the friends ✨
          </p>
        </div>
      </div>
    `;

    // Bind events
    document.getElementById('auth-form').addEventListener('submit', handleSubmit);
    document.getElementById('toggle-auth').addEventListener('click', (e) => {
      e.preventDefault();
      isLogin = !isLogin;
      render();
      checkRegistrationLimit();
    });

    if (!isLogin) {
      checkRegistrationLimit();
    }
  }

  async function checkRegistrationLimit() {
    if (isLogin) return;
    try {
      const { data: profiles } = await getAllProfiles();
      const maxUsers = parseInt(import.meta.env.VITE_MAX_USERS || '4');
      if (profiles && profiles.length >= maxUsers) {
        const msg = document.getElementById('register-limit-msg');
        const btn = document.getElementById('auth-submit-btn');
        if (msg) msg.style.display = 'block';
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Registration Closed';
        }
      }
    } catch (e) {
      // Ignore - table might not exist yet
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('auth-submit-btn');
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:20px;height:20px;border-width:2px;"></span>';

    try {
      if (isLogin) {
        const { data, error } = await signIn(email, password);
        if (error) throw error;
        showToast('Welcome back!', 'Signed in successfully', 'success');
        navigate('/dashboard');
      } else {
        const name = document.getElementById('auth-name').value.trim();
        if (!name) {
          showToast('Name required', 'Please enter your full name', 'error');
          return;
        }
        const { data, error } = await signUp(email, password, name);
        if (error) throw error;
        showToast('Account created!', 'Welcome to Room Split', 'success');
        // Auto-login after signup (Supabase does this)
        navigate('/dashboard');
      }
    } catch (err) {
      showToast('Authentication Error', err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = isLogin ? 'Sign In' : 'Create Account';
    }
  }

  render();
}
