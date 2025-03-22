// Helper functions for session management
function generateSecureToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function createSession(env, username) {
  const token = generateSecureToken();
  // Store session data with 15-minute TTL
  await env.AUTH_KV.put(
    `session:${token}`, 
    JSON.stringify({ username }), 
    { expirationTtl: 15 * 60 } // 15 minutes in seconds
  );
  return token;
}

async function validateSession(env, token) {
  const sessionData = await env.AUTH_KV.get(`session:${token}`);
  if (!sessionData) return false;
  
  const { username } = JSON.parse(sessionData);
  return username;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle /get endpoint
    if (url.pathname.startsWith('/get/')) {
      // Extract app ID and path from the URL
      const [, , appId, ...pathParts] = url.pathname.split('/');
      const path = pathParts.join('/');
      const proxyToken = url.searchParams.get('proxyToken');

      if (!appId || !proxyToken) {
        return new Response('Missing app ID or proxy token', {
          status: 400,
          headers: { 'Content-Type': 'text/plain' }
        });
      }

      // Get app configuration
      const appData = await env.AUTH_KV.get(`app:${appId}`);
      if (!appData) {
        return new Response('Application not found', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' }
        });
      }

      const app = JSON.parse(appData);

      // Validate proxy token
      if (app.proxyToken !== proxyToken) {
        return new Response('Invalid proxy token', {
          status: 401,
          headers: { 'Content-Type': 'text/plain' }
        });
      }

      // Check if we have a valid access token
      if (!app.accessToken || new Date(app.tokenExpiresAt) < new Date()) {
        return new Response('No valid access token. Please authorize the application first.', {
          status: 401,
          headers: { 'Content-Type': 'text/plain' }
        });
      }

      try {
        // Construct the target URL with all query parameters except proxyToken
        const targetUrl = new URL(path, app.apiPath);
        // Copy all query parameters except proxyToken
        for (const [key, value] of url.searchParams.entries()) {
          if (key !== 'proxyToken') {
            targetUrl.searchParams.set(key, value);
          }
        }

        // Forward the request with the OAuth token
        const response = await fetch(targetUrl.toString(), {
          method: request.method,
          headers: {
            ...Object.fromEntries(request.headers),
            'Authorization': `Bearer ${app.accessToken}`,
            'Host': new URL(app.apiPath).host
          }
        });

        // Return the response with the same status and headers
        return new Response(response.body, {
          status: response.status,
          headers: response.headers
        });
      } catch (error) {
        return new Response('Failed to proxy request: ' + error.message, {
          status: 500,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    }
    
    // Handle /admin endpoint
    if (url.pathname === '/admin') {
      // Handle POST request for authentication
      if (request.method === 'POST' && !url.searchParams.has('action')) {
        const formData = await request.formData();
        const username = formData.get('username');
        const password = formData.get('password');
        
        // Get stored credentials from KV
        const storedUsername = await env.AUTH_KV.get('username');
        const storedPassword = await env.AUTH_KV.get('password');
        
        if (username === storedUsername && password === storedPassword) {
          // Create a secure session
          const token = await createSession(env, username);
          
          // Set a session cookie with secure flags
          return new Response(null, {
            status: 302,
            headers: {
              'Set-Cookie': `session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/`,
              'Location': new URL('/admin/apps', request.url).toString()
            }
          });
        } else {
          return new Response('Invalid credentials', {
            status: 401,
            headers: { 'Content-Type': 'text/plain' }
          });
        }
      }
      
      // Return the login form for GET requests
      return new Response(
        `<!DOCTYPE html>
        <html>
        <head>
          <title>Admin Login</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background-color: #f5f5f5;
            }
            .login-form {
              background: white;
              padding: 2rem;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            .form-group {
              margin-bottom: 1rem;
            }
            label {
              display: block;
              margin-bottom: 0.5rem;
            }
            input {
              width: 100%;
              padding: 0.5rem;
              border: 1px solid #ddd;
              border-radius: 4px;
            }
            button {
              width: 100%;
              padding: 0.5rem;
              background-color: #007bff;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
            }
            button:hover {
              background-color: #0056b3;
            }
            .credentials-info {
              margin-top: 1rem;
              padding: 0.5rem;
              background-color: #f8f9fa;
              border-radius: 4px;
              font-size: 0.9rem;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="login-form">
            <h2>Admin Login</h2>
            <form method="POST">
              <div class="form-group">
                <label for="username">Username:</label>
                <input type="text" id="username" name="username" required>
              </div>
              <div class="form-group">
                <label for="password">Password:</label>
                <input type="password" id="password" name="password" required>
              </div>
              <button type="submit">Login</button>
            </form>
            <div class="credentials-info">
              <p>Development credentials:</p>
              <p>Username: admin</p>
              <p>Password: password123</p>
            </div>
          </div>
        </body>
        </html>`,
        {
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }

    // Handle /admin/apps endpoint
    if (url.pathname === '/admin/apps') {
      // Check authentication
      const session = request.headers.get('Cookie')?.match(/session=([^;]+)/)?.[1];
      if (!session) {
        return new Response(null, {
          status: 302,
          headers: {
            'Location': new URL('/admin', request.url).toString()
          }
        });
      }

      const username = await validateSession(env, session);
      if (!username) {
        return new Response(null, {
          status: 302,
          headers: {
            'Location': new URL('/admin', request.url).toString()
          }
        });
      }

      // Handle application management actions
      if (request.method === 'POST') {
        const formData = await request.formData();
        const action = formData.get('action');
        
        if (action === 'logout') {
          // Delete the session
          await env.AUTH_KV.delete(`session:${session}`);
          return new Response(null, {
            status: 302,
            headers: {
              'Location': new URL('/admin', request.url).toString()
            }
          });
        }
        
        if (action === 'create') {
          const name = formData.get('name');
          const clientId = formData.get('client_id');
          const authPath = formData.get('auth_path');
          const apiPath = formData.get('api_path');
          const scope = formData.get('scope');

          // Check if name already exists
          const existingApp = await env.AUTH_KV.get(`app:${name}`);
          if (existingApp) {
            return new Response('Application name already exists', {
              status: 400,
              headers: { 'Content-Type': 'text/plain' }
            });
          }

          // Generate a secure proxy token
          const proxyToken = generateSecureToken();

          // Store the new application
          await env.AUTH_KV.put(
            `app:${name}`,
            JSON.stringify({ name, clientId, authPath, apiPath, scope, proxyToken })
          );
        } 
        else if (action === 'delete') {
          const name = formData.get('name');
          await env.AUTH_KV.delete(`app:${name}`);
        }
        else if (action === 'edit') {
          const name = formData.get('name');
          const authPath = formData.get('auth_path');
          const apiPath = formData.get('api_path');
          const scope = formData.get('scope');
          
          // Get existing app data
          const existingApp = await env.AUTH_KV.get(`app:${name}`);
          if (!existingApp) {
            return new Response('Application not found', {
              status: 404,
              headers: { 'Content-Type': 'text/plain' }
            });
          }

          const appData = JSON.parse(existingApp);
          // Update only allowed fields
          appData.authPath = authPath;
          appData.apiPath = apiPath;
          appData.scope = scope;
          
          await env.AUTH_KV.put(`app:${name}`, JSON.stringify(appData));
        }
        else if (action === 'regenerate_token') {
          const name = formData.get('name');
          const existingApp = await env.AUTH_KV.get(`app:${name}`);
          if (!existingApp) {
            return new Response('Application not found', {
              status: 404,
              headers: { 'Content-Type': 'text/plain' }
            });
          }

          const appData = JSON.parse(existingApp);
          // Generate a new secure proxy token
          appData.proxyToken = generateSecureToken();
          
          await env.AUTH_KV.put(`app:${name}`, JSON.stringify(appData));
        }
        else if (action === 'authorize') {
          const name = formData.get('name');
          const app = await env.AUTH_KV.get(`app:${name}`);
          if (!app) {
            return new Response('Application not found', {
              status: 404,
              headers: { 'Content-Type': 'text/plain' }
            });
          }

          const appData = JSON.parse(app);
          // Generate state for CSRF protection
          const state = generateSecureToken();
          // Generate PKCE code verifier and challenge
          const codeVerifier = generateSecureToken();
          const codeChallenge = await crypto.subtle.digest('SHA-256', 
            new TextEncoder().encode(codeVerifier))
            .then(hash => btoa(String.fromCharCode(...new Uint8Array(hash)))
              .replace(/\+/g, '-')
              .replace(/\//g, '_')
              .replace(/=+$/, '')
            );

          // Store state and code verifier
          await env.AUTH_KV.put(
            `oauth_state:${state}`,
            JSON.stringify({ 
              appName: name,
              codeVerifier 
            }),
            { expirationTtl: 15 * 60 } // 15 minutes
          );

          // Redirect to OAuth authorization page
          const authUrl = new URL(appData.authPath);
          authUrl.searchParams.set('client_id', appData.clientId);
          authUrl.searchParams.set('redirect_uri', new URL('/oauth/callback', request.url).toString());
          authUrl.searchParams.set('response_type', 'code');
          authUrl.searchParams.set('state', state);
          authUrl.searchParams.set('code_challenge', codeChallenge);
          authUrl.searchParams.set('code_challenge_method', 'S256');
          authUrl.searchParams.set('scope', appData.scope || 'read'); // Use configured scope or default

          return new Response(null, {
            status: 302,
            headers: {
              'Location': authUrl.toString()
            }
          });
        }

        return new Response(null, {
          status: 302,
          headers: {
            'Location': new URL('/admin/apps', request.url).toString()
          }
        });
      }

      // Get all applications
      const apps = [];
      const list = await env.AUTH_KV.list({ prefix: 'app:' });
      for (const key of list.keys) {
        const appData = await env.AUTH_KV.get(key.name);
        if (appData) {
          apps.push(JSON.parse(appData));
        }
      }

      return new Response(
        `<!DOCTYPE html>
        <html>
        <head>
          <title>Manage OAuth Applications</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 2rem;
              background-color: #f5f5f5;
            }
            .container {
              max-width: 1200px;
              margin: 0 auto;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 2rem;
            }
            .form-container {
              background: white;
              padding: 2rem;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
              margin-bottom: 2rem;
            }
            .form-group {
              margin-bottom: 1rem;
            }
            label {
              display: block;
              margin-bottom: 0.5rem;
              font-weight: bold;
            }
            input {
              width: 100%;
              padding: 0.5rem;
              border: 1px solid #ddd;
              border-radius: 4px;
            }
            button {
              padding: 0.5rem 1rem;
              background-color: #007bff;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
            }
            button:hover {
              background-color: #0056b3;
            }
            .apps-list {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
              gap: 1rem;
            }
            .app-card {
              background: white;
              padding: 1rem;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            .app-card h3 {
              margin-top: 0;
              color: #333;
            }
            .app-card p {
              margin: 0.5rem 0;
              color: #666;
            }
            .app-actions {
              display: flex;
              gap: 0.5rem;
              margin-top: 1rem;
            }
            .delete-btn {
              background-color: #dc3545;
            }
            .delete-btn:hover {
              background-color: #c82333;
            }
            .edit-btn {
              background-color: #28a745;
            }
            .edit-btn:hover {
              background-color: #218838;
            }
            .logout-btn {
              background-color: #6c757d;
            }
            .logout-btn:hover {
              background-color: #5a6268;
            }
            .token-info {
              margin-top: 1rem;
              padding: 0.5rem;
              background-color: #f8f9fa;
              border-radius: 4px;
              font-size: 0.9rem;
            }
            .token-info.expired {
              background-color: #fff3cd;
              color: #856404;
            }
            .token-info.valid {
              background-color: #d4edda;
              color: #155724;
            }
            .authorize-btn {
              background-color: #17a2b8;
            }
            .authorize-btn:hover {
              background-color: #138496;
            }
            .callback-url-container {
              display: flex;
              gap: 0.5rem;
              align-items: center;
            }
            .callback-url-container input {
              flex: 1;
              background-color: #f8f9fa;
              cursor: text;
            }
            .copy-btn {
              background-color: #6c757d;
              white-space: nowrap;
            }
            .copy-btn:hover {
              background-color: #5a6268;
            }
            .proxy-token-container {
              display: flex;
              gap: 0.5rem;
              align-items: center;
              margin-top: 0.5rem;
            }
            .proxy-token-container input {
              flex: 1;
              background-color: #f8f9fa;
              cursor: text;
              font-family: monospace;
            }
            .regenerate-btn {
              background-color: #ffc107;
              color: #000;
            }
            .regenerate-btn:hover {
              background-color: #e0a800;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Manage OAuth Applications</h1>
              <form method="POST" style="margin: 0;">
                <input type="hidden" name="action" value="logout">
                <button type="submit" class="logout-btn">Logout</button>
              </form>
            </div>

            <div class="form-container">
              <h2>Add New Application</h2>
              <form method="POST">
                <input type="hidden" name="action" value="create">
                <div class="form-group">
                  <label for="name">Application Name:</label>
                  <input type="text" id="name" name="name" required>
                </div>
                <div class="form-group">
                  <label for="client_id">Client ID:</label>
                  <input type="text" id="client_id" name="client_id" required>
                </div>
                <div class="form-group">
                  <label for="auth_path">OAuth Authorize Path:</label>
                  <input type="text" id="auth_path" name="auth_path" required>
                </div>
                <div class="form-group">
                  <label for="api_path">API Path:</label>
                  <input type="text" id="api_path" name="api_path" required>
                </div>
                <div class="form-group">
                  <label for="scope">OAuth Scopes (space-separated):</label>
                  <input type="text" id="scope" name="scope" placeholder="read" required>
                </div>
                <div class="form-group">
                  <label for="callback_url">Callback URL (copy this to your OAuth application):</label>
                  <div class="callback-url-container">
                    <input type="text" id="callback_url" value="${new URL('/oauth/callback', request.url).toString()}" readonly>
                    <button type="button" onclick="copyCallbackUrl()" class="copy-btn">Copy</button>
                  </div>
                </div>
                <button type="submit">Add Application</button>
              </form>
            </div>

            <div class="apps-list">
              ${apps.map(app => {
                const tokenInfo = app.accessToken ? `
                  <div class="token-info ${new Date(app.tokenExpiresAt) < new Date() ? 'expired' : 'valid'}">
                    <p><strong>Access Token:</strong> ${app.accessToken.substring(0, 10)}...</p>
                    <p><strong>Expires:</strong> ${new Date(app.tokenExpiresAt).toLocaleString()}</p>
                    ${app.refreshToken ? '<p><strong>Refresh Token:</strong> Available</p>' : ''}
                  </div>
                ` : '';
                
                return `
                  <div class="app-card" data-name="${app.name}">
                    <h3>${app.name}</h3>
                    <p><strong>Client ID:</strong> ${app.clientId}</p>
                    <p><strong>Auth Path:</strong> ${app.authPath}</p>
                    <p><strong>API Path:</strong> ${app.apiPath}</p>
                    <p><strong>Scopes:</strong> ${app.scope || 'read'}</p>
                    <div class="proxy-token-container">
                      <input type="text" value="${app.proxyToken}" readonly>
                      <form method="POST" style="display: inline;">
                        <input type="hidden" name="action" value="regenerate_token">
                        <input type="hidden" name="name" value="${app.name}">
                        <button type="submit" class="regenerate-btn">Regenerate</button>
                      </form>
                    </div>
                    ${tokenInfo}
                    <div class="app-actions">
                      <form method="POST" style="display: inline;">
                        <input type="hidden" name="action" value="delete">
                        <input type="hidden" name="name" value="${app.name}">
                        <button type="submit" class="delete-btn">Delete</button>
                      </form>
                      <button class="edit-btn" onclick="showEditForm('${app.name}', '${app.authPath}', '${app.apiPath}', '${app.scope}')">Edit</button>
                      <form method="POST" style="display: inline;">
                        <input type="hidden" name="action" value="authorize">
                        <input type="hidden" name="name" value="${app.name}">
                        <button type="submit" class="authorize-btn">Authorize</button>
                      </form>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <script>
            function copyCallbackUrl() {
              const callbackUrl = document.getElementById('callback_url');
              callbackUrl.select();
              document.execCommand('copy');
              
              // Visual feedback
              const copyBtn = callbackUrl.nextElementSibling;
              const originalText = copyBtn.textContent;
              copyBtn.textContent = 'Copied!';
              setTimeout(() => {
                copyBtn.textContent = originalText;
              }, 2000);
            }

            function showEditForm(name, authPath, apiPath, scope) {
              const appCard = document.querySelector(\`[data-name="\${name}"]\`);
              if (!appCard) return;

              // Remove any existing edit form
              const existingForm = appCard.querySelector('form.edit-form');
              if (existingForm) {
                existingForm.remove();
                return;
              }

              const form = document.createElement('form');
              form.method = 'POST';
              form.className = 'edit-form';
              form.innerHTML = \`
                <input type="hidden" name="action" value="edit">
                <input type="hidden" name="name" value="\${name}">
                <div class="form-group">
                  <label for="edit_auth_path">OAuth Authorize Path:</label>
                  <input type="text" id="edit_auth_path" name="auth_path" value="\${authPath}" required>
                </div>
                <div class="form-group">
                  <label for="edit_api_path">API Path:</label>
                  <input type="text" id="edit_api_path" name="api_path" value="\${apiPath}" required>
                </div>
                <div class="form-group">
                  <label for="edit_scope">OAuth Scopes (space-separated):</label>
                  <input type="text" id="edit_scope" name="scope" value="\${scope || 'read'}" required>
                </div>
                <button type="submit">Save Changes</button>
                <button type="button" onclick="this.closest('form').remove()">Cancel</button>
              \`;
              
              appCard.appendChild(form);
            }
          </script>
        </body>
        </html>`,
        {
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }

    // Handle OAuth callback
    if (url.pathname === '/oauth/callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      
      if (!code || !state) {
        return new Response('Invalid OAuth callback', {
          status: 400,
          headers: { 'Content-Type': 'text/plain' }
        });
      }

      // Validate state
      const stateData = await env.AUTH_KV.get(`oauth_state:${state}`);
      if (!stateData) {
        return new Response('Invalid state', {
          status: 400,
          headers: { 'Content-Type': 'text/plain' }
        });
      }

      const { appName, codeVerifier } = JSON.parse(stateData);
      const appData = await env.AUTH_KV.get(`app:${appName}`);
      if (!appData) {
        return new Response('Application not found', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' }
        });
      }

      const app = JSON.parse(appData);
      
      try {
        // Exchange code for tokens
        const tokenResponse = await fetch(new URL('/oauth2/token', app.apiPath).toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            client_id: app.clientId,
            redirect_uri: new URL('/oauth/callback', request.url).toString(),
            code_verifier: codeVerifier
          }),
        });

        if (!tokenResponse.ok) {
          const responseText = await tokenResponse.text();
          throw new Error(`Failed to exchange code for tokens. Status: ${tokenResponse.status}, Response: ${responseText}, URL: ${tokenResponse.url}`);
        }

        const tokens = await tokenResponse.json();
        
        // Update app with tokens
        app.accessToken = tokens.access_token;
        app.refreshToken = tokens.refresh_token;
        app.tokenExpiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();
        
        await env.AUTH_KV.put(`app:${appName}`, JSON.stringify(app));
        
        // Clean up state
        await env.AUTH_KV.delete(`oauth_state:${state}`);

        // Redirect back to apps page
        return new Response(null, {
          status: 302,
          headers: {
            'Location': new URL('/admin/apps', request.url).toString()
          }
        });
      } catch (error) {
        return new Response('Failed to complete OAuth flow: ' + error.message, {
          status: 500,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    }
    
    // Handle unknown paths
    return new Response('Not Found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}; 