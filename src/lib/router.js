// ============================================================
// SPA Hash Router — Room Split
// ============================================================

const routes = {};
let currentCleanup = null;
let currentRoute = null;

export function registerRoute(path, handler) {
  routes[path] = handler;
}

export function navigate(path) {
  window.location.hash = path;
}

export function getCurrentRoute() {
  return currentRoute;
}

// Parse hash: #/room/123?to=abc → { path: '/room/:id', params: { id: '123' } }
function matchRoute(hash) {
  const [pathWithHash] = hash.split('?');
  const path = pathWithHash.replace('#', '') || '/';

  // Try exact match first
  if (routes[path]) {
    return { path, params: {}, handler: routes[path] };
  }

  // Try parameterized routes
  for (const routePath of Object.keys(routes)) {
    const routeParts = routePath.split('/');
    const pathParts = path.split('/');

    if (routeParts.length !== pathParts.length) continue;

    const params = {};
    let match = true;

    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(':')) {
        params[routeParts[i].slice(1)] = pathParts[i];
      } else if (routeParts[i] !== pathParts[i]) {
        match = false;
        break;
      }
    }

    if (match) {
      return { path: routePath, params, handler: routes[routePath] };
    }
  }

  return null;
}

async function handleRouteChange() {
  const hash = window.location.hash || '#/';
  const matched = matchRoute(hash);

  if (!matched) {
    navigate('/');
    return;
  }

  // Cleanup previous route
  if (currentCleanup && typeof currentCleanup === 'function') {
    currentCleanup();
  }

  currentRoute = { ...matched, hash };

  // Get app container
  const app = document.getElementById('app');

  // Remove splash if still there
  const splash = document.getElementById('splash-loader');
  if (splash) splash.classList.add('hidden');

  // Render new route with animation
  try {
    const result = await matched.handler(matched.params);
    if (typeof result === 'function') {
      currentCleanup = result;
    } else {
      currentCleanup = null;
    }
  } catch (err) {
    console.error('Route handler error:', err);
    app.innerHTML = `
      <div class="page-container" style="padding: 2rem; text-align: center;">
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <h2 class="empty-state-title">Something went wrong</h2>
          <p class="empty-state-text">${err.message}</p>
          <button class="btn btn-primary" onclick="location.hash='#/'">Go Home</button>
        </div>
      </div>
    `;
  }
}

export function initRouter() {
  window.addEventListener('hashchange', handleRouteChange);

  // Handle initial route
  if (!window.location.hash) {
    window.location.hash = '#/';
  } else {
    handleRouteChange();
  }
}

export function destroyRouter() {
  window.removeEventListener('hashchange', handleRouteChange);
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }
}
