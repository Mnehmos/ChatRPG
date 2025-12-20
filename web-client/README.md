# ChatRPG Web Client

A lightweight web interface for the ChatRPG D&D 5e MCP server.

## Features

- 🎲 **Real-time Chat Interface** - Interactive D&D 5e assistant
- 🔌 **SSE Connection** - Server-Sent Events for live updates
- 🎨 **Modern UI** - Clean, responsive design
- 🔒 **Secure Deployment** - API keys injected via GitHub Actions
- 📱 **Mobile Friendly** - Works on all devices

## Quick Start

### Local Development

1. **Copy the example configuration:**
   ```bash
   cp .env.example .env.local
   ```

2. **Edit `.env.local` with your settings:**
   ```env
   CHATRPG_SERVER_URL=https://chatrpg-production.up.railway.app/sse
   CHATRPG_API_KEY=your-api-key
   ```

3. **Create a local config file:**
   ```bash
   # Copy index.html to index-dev.html
   cp index.html index-dev.html
   ```

4. **Inject local configuration:**
   ```bash
   # On Unix/Mac:
   sed -i "s|{{SERVER_URL}}|https://chatrpg-production.up.railway.app/sse|g" index-dev.html
   sed -i "s|{{API_KEY}}|your-api-key|g" index-dev.html

   # On Windows (PowerShell):
   (Get-Content index-dev.html) -replace '{{SERVER_URL}}', 'https://chatrpg-production.up.railway.app/sse' | Set-Content index-dev.html
   (Get-Content index-dev.html) -replace '{{API_KEY}}', 'your-api-key' | Set-Content index-dev.html
   ```

5. **Serve the files:**
   ```bash
   # Using Python
   python -m http.server 8000

   # Using Node.js
   npx serve .

   # Or use any other static file server
   ```

6. **Open in browser:**
   ```
   http://localhost:8000/index-dev.html
   ```

### GitHub Pages Deployment

1. **Set up GitHub Secrets:**
   - Go to your repository settings
   - Navigate to `Settings > Secrets and variables > Actions`
   - Add two secrets:
     - `CHATRPG_SERVER_URL`: Your Railway server URL
     - `CHATRPG_API_KEY`: Your demo API key

2. **Enable GitHub Pages:**
   - Go to `Settings > Pages`
   - Source: `GitHub Actions`

3. **Push to main branch:**
   ```bash
   git add web-client/
   git commit -m "Add ChatRPG web client"
   git push origin main
   ```

4. **The GitHub Action will:**
   - Inject your secrets into the HTML
   - Deploy to GitHub Pages
   - Provide you with a URL (e.g., `https://username.github.io/ChatRPG/`)

## Project Structure

```
web-client/
├── index.html              # Main HTML file (with placeholders)
├── css/
│   └── style.css          # Styling
├── js/
│   ├── mcp-client.js      # MCP/SSE client library
│   └── app.js             # Main application logic
├── .github/
│   └── workflows/
│       └── deploy.yml     # GitHub Actions deployment
├── .env.example           # Example environment variables
└── README.md              # This file
```

## How It Works

### Secret Injection

1. **During Development:**
   - Secrets are manually replaced in a local copy (`index-dev.html`)
   - Never commit `index-dev.html` or `.env.local`

2. **During Deployment:**
   - GitHub Actions reads secrets from repository settings
   - Replaces `{{SERVER_URL}}` and `{{API_KEY}}` placeholders
   - Deploys the processed HTML to GitHub Pages
   - Secrets are never exposed in the repository

### MCP Communication

1. **SSE Connection:**
   - Client opens EventSource to `/sse` endpoint
   - Server sends real-time updates via Server-Sent Events

2. **Tool Calls:**
   - Client POSTs to `/tool` endpoint with tool name and parameters
   - Server processes and responds with results

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `CHATRPG_SERVER_URL` | Your Railway MCP server SSE endpoint | Yes |
| `CHATRPG_API_KEY` | API key for authentication | Optional |

### GitHub Secrets

Set these in `Settings > Secrets and variables > Actions`:

- `CHATRPG_SERVER_URL`: `https://chatrpg-production.up.railway.app/sse`
- `CHATRPG_API_KEY`: Your demo key (or leave empty if not needed)

## Security Notes

⚠️ **Important Security Considerations:**

1. **API Key Protection:**
   - Never commit API keys to the repository
   - Use GitHub Secrets for deployment
   - For local dev, use `.env.local` (gitignored)

2. **Demo Key Limitations:**
   - Use a separate "demo" API key with limited permissions
   - Don't use your production/admin keys
   - Consider rate limiting on the server side

3. **CORS Configuration:**
   - Ensure your Railway server has proper CORS headers
   - Only allow your GitHub Pages domain

## Troubleshooting

### Connection Issues

If the client can't connect:

1. **Check server URL:**
   ```javascript
   console.log(window.CHATRPG_CONFIG.serverUrl);
   ```

2. **Verify CORS headers:**
   - Server must allow `https://your-username.github.io`

3. **Check browser console:**
   - Look for SSE connection errors
   - Verify network tab shows successful `/sse` connection

### API Key Issues

If authentication fails:

1. **Verify secret is set:**
   - Check GitHub repository secrets
   - Ensure no typos in secret names

2. **Check injection worked:**
   - View page source after deployment
   - Should NOT see `{{API_KEY}}` placeholder

## Development Tips

### Testing Locally Without Secrets

Edit `index.html` directly for quick testing:

```javascript
window.CHATRPG_CONFIG = {
    serverUrl: 'https://chatrpg-production.up.railway.app/sse',
    apiKey: '' // Empty if server doesn't require it
};
```

### Debugging

Open browser DevTools and check:

```javascript
// Check connection status
chatApp.client.isConnected()

// View current config
window.CHATRPG_CONFIG

// Send test message
chatApp.client.callTool('get_session_context', {})
```

## Contributing

1. Test locally first with `index-dev.html`
2. Never commit secrets or API keys
3. Ensure `.env.local` and `index-dev.html` are gitignored
4. Test GitHub Actions deployment in a fork first

## License

Same as the main ChatRPG project.

## Links

- [ChatRPG Main Repository](https://github.com/Mnehmos/ChatRPG)
- [Railway Deployment](https://chatrpg-production.up.railway.app)
- [MCP Documentation](https://modelcontextprotocol.io)
