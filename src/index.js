export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle /get endpoint
    if (url.pathname === '/get') {
      return new Response('OK', {
        headers: { 'Content-Type': 'text/plain' }
      });
    }
    
    // Handle /admin endpoint
    if (url.pathname === '/admin') {
      // Handle POST request for authentication
      if (request.method === 'POST') {
        const formData = await request.formData();
        const username = formData.get('username');
        const password = formData.get('password');
        
        // Get stored credentials from KV
        const storedUsername = await env.AUTH_KV.get('username');
        const storedPassword = await env.AUTH_KV.get('password');
        
        if (username === storedUsername && password === storedPassword) {
          return new Response('Authentication successful!', {
            headers: { 'Content-Type': 'text/plain' }
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
    
    // Handle unknown paths
    return new Response('Not Found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}; 