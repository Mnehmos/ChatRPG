# ChatRPG Web Client - Deployment Guide

## Quick Start: Deploy to GitHub Pages

### Step 1: Configure GitHub Secrets

1. Go to your GitHub repository: `https://github.com/Mnehmos/ChatRPG`
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** and add:

   **Secret 1:**
   - Name: `CHATRPG_SERVER_URL`
   - Value: `https://chatrpg-production.up.railway.app/sse`

   **Secret 2 (Optional):**
   - Name: `CHATRPG_API_KEY`
   - Value: Your demo API key (or leave empty if not needed)

### Step 2: Enable GitHub Pages

1. Go to **Settings** → **Pages**
2. Under **Source**, select: **GitHub Actions**
3. Save the settings

### Step 3: Move Workflow File

The GitHub Actions workflow needs to be in the repository root:

```bash
# Move the workflow file
mkdir -p .github/workflows
mv web-client/.github/workflows/deploy.yml .github/workflows/web-client-deploy.yml

# Update the paths in the workflow
```

Or manually create `.github/workflows/web-client-deploy.yml` with the contents from `web-client/.github/workflows/deploy.yml`.

### Step 4: Deploy

```bash
# Commit and push to main branch (or merge from development)
git checkout main
git merge development
git push origin main
```

The GitHub Action will automatically:
1. Inject your secrets into `index.html`
2. Build the site
3. Deploy to GitHub Pages

### Step 5: Access Your Site

Your chatbot will be available at:
```
https://mnehmos.github.io/ChatRPG/
```

## Local Development

### Windows (PowerShell)

```powershell
cd web-client
.\dev-setup.ps1
```

### Mac/Linux (Bash)

```bash
cd web-client
./dev-setup.sh
```

The script will:
1. Create `.env.local` from template (first run only)
2. Inject configuration into `index-dev.html`
3. Start a local web server
4. Open `http://localhost:8000/index-dev.html`

## Manual Local Setup

If you prefer manual setup:

1. **Create environment file:**
   ```bash
   cp .env.example .env.local
   ```

2. **Edit `.env.local`:**
   ```env
   CHATRPG_SERVER_URL=https://chatrpg-production.up.railway.app/sse
   CHATRPG_API_KEY=your-key-here
   ```

3. **Create dev HTML:**
   ```bash
   cp index.html index-dev.html
   ```

4. **Inject config (PowerShell):**
   ```powershell
   $env:CHATRPG_SERVER_URL = "https://chatrpg-production.up.railway.app/sse"
   $env:CHATRPG_API_KEY = "your-key"

   (Get-Content index-dev.html) -replace '{{SERVER_URL}}', $env:CHATRPG_SERVER_URL | Set-Content index-dev.html
   (Get-Content index-dev.html) -replace '{{API_KEY}}', $env:CHATRPG_API_KEY | Set-Content index-dev.html
   ```

5. **Start server:**
   ```bash
   python -m http.server 8000
   # or
   npx serve . -l 8000
   ```

6. **Open:** `http://localhost:8000/index-dev.html`

## Troubleshooting

### GitHub Action Fails

**Check workflow file location:**
- Should be at: `.github/workflows/web-client-deploy.yml`
- Not at: `web-client/.github/workflows/deploy.yml`

**Verify secrets are set:**
- Go to Settings → Secrets and variables → Actions
- Both `CHATRPG_SERVER_URL` and `CHATRPG_API_KEY` should be listed

**Check workflow logs:**
- Go to Actions tab
- Click on the failed workflow
- Review the build logs

### Connection Issues

**CORS errors in browser:**

Your Railway server needs to allow your GitHub Pages domain. Add to your server's CORS configuration:

```javascript
// In your server setup
app.use(cors({
  origin: [
    'https://mnehmos.github.io',
    'http://localhost:8000'
  ]
}));
```

**SSE connection fails:**

1. Verify the server URL in browser console:
   ```javascript
   window.CHATRPG_CONFIG.serverUrl
   ```

2. Test the SSE endpoint directly:
   ```bash
   curl https://chatrpg-production.up.railway.app/sse
   ```

3. Check Railway logs for errors

### API Key Issues

**Key not working:**

1. Verify it's set in GitHub Secrets (check for typos)
2. View page source after deployment - should NOT see `{{API_KEY}}`
3. Check browser console for authentication errors

**No API key needed:**

If your server doesn't require authentication, you can skip setting `CHATRPG_API_KEY`. The workflow will inject an empty string.

## Testing

### Test the SSE Connection

Open browser DevTools console:

```javascript
// Check connection status
chatApp.client.isConnected()
// Should return: true

// View configuration
window.CHATRPG_CONFIG
// Should show your server URL (API key redacted in logs)

// Send test message
chatApp.client.callTool('get_session_context', {})
```

### Test Without Secrets Locally

For quick testing, edit `index.html` directly:

```javascript
window.CHATRPG_CONFIG = {
    serverUrl: 'https://chatrpg-production.up.railway.app/sse',
    apiKey: '' // Empty if not needed
};
```

Then open `index.html` directly in your browser.

## Updating

To update the deployed site:

1. Make changes to files in `web-client/`
2. Commit and push to `main` branch
3. GitHub Actions automatically redeploys

## Security Checklist

- [ ] API keys are stored in GitHub Secrets, not in code
- [ ] `.env.local` is in `.gitignore`
- [ ] `index-dev.html` is in `.gitignore`
- [ ] CORS is properly configured on the server
- [ ] Using a demo/limited API key, not production keys
- [ ] Server has rate limiting enabled

## Next Steps

1. **Customize the UI:**
   - Edit `css/style.css` for styling
   - Modify `index.html` for layout
   - Update `js/app.js` for behavior

2. **Add Features:**
   - Tool-specific UI components
   - Character sheet viewer
   - Combat visualizer
   - Dice roller interface

3. **Optimize:**
   - Add service worker for offline support
   - Implement message caching
   - Add typing indicators
   - Support file uploads

## Support

- **Documentation:** See [README.md](README.md)
- **Issues:** https://github.com/Mnehmos/ChatRPG/issues
- **MCP Docs:** https://modelcontextprotocol.io

## License

Same as the main ChatRPG project.
