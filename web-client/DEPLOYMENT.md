# ChatRPG Web Client - Deployment Guide

## Quick Start: Deploy to GitHub Pages

### Step 1: Configure GitHub Secrets

1. Go to your GitHub repository: `https://github.com/Mnehmos/ChatRPG`
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** and add:

   **Secret 1:**
   - Name: `MCP_SERVER_URL`
   - Value: `https://chatrpg-production.up.railway.app/sse`

   **Secret 2:**
   - Name: `OPENAI_API_KEY`
   - Value: Your OpenAI API key (from https://platform.openai.com/api-keys)

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
   MCP_SERVER_URL=https://chatrpg-production.up.railway.app/sse
   OPENAI_API_KEY=sk-proj-your-openai-api-key-here
   ```

3. **Create dev HTML:**
   ```bash
   cp index.html index-dev.html
   ```

4. **Inject config (PowerShell):**
   ```powershell
   $env:MCP_SERVER_URL = "https://chatrpg-production.up.railway.app/sse"
   $env:OPENAI_API_KEY = "sk-proj-your-openai-api-key"

   (Get-Content index-dev.html) -replace '{{MCP_SERVER_URL}}', $env:MCP_SERVER_URL | Set-Content index-dev.html
   (Get-Content index-dev.html) -replace '{{OPENAI_API_KEY}}', $env:OPENAI_API_KEY | Set-Content index-dev.html
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
- Both `MCP_SERVER_URL` and `OPENAI_API_KEY` should be listed

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

**OpenAI API connection fails:**

1. Verify the configuration in browser console:
   ```javascript
   window.CHATRPG_CONFIG.mcpServerUrl
   window.CHATRPG_CONFIG.openaiApiKey // Will be redacted in console
   ```

2. Test the MCP server endpoint directly:
   ```bash
   curl https://chatrpg-production.up.railway.app/sse
   ```

3. Check browser console for OpenAI API errors

### API Key Issues

**OpenAI API key not working:**

1. Verify it's set in GitHub Secrets (check for typos)
2. View page source after deployment - should NOT see `{{OPENAI_API_KEY}}`
3. Check browser console for OpenAI authentication errors
4. Verify the key starts with `sk-proj-` or `sk-`
5. Check the key has sufficient credits at https://platform.openai.com/usage

**Important:**

This web client requires a valid OpenAI API key to function. The key is used to call OpenAI's Chat Completions API, which then connects to the ChatRPG MCP server as a remote tool.

## Testing

### Test the OpenAI API Integration

Open browser DevTools console:

```javascript
// View configuration (API key will be visible in source, but should be valid)
window.CHATRPG_CONFIG
// Should show: { mcpServerUrl: "...", openaiApiKey: "sk-..." }

// The app automatically calls OpenAI API when you send messages
// OpenAI then uses ChatRPG as a remote MCP tool
// Check the Network tab to see API calls to api.openai.com

// Try sending a message like:
// "Create a level 1 fighter named Test"
```

### Test Without Secrets Locally

For quick testing, edit `index.html` directly:

```javascript
window.CHATRPG_CONFIG = {
    mcpServerUrl: 'https://chatrpg-production.up.railway.app/sse',
    openaiApiKey: 'sk-proj-your-actual-openai-key'
};
```

Then open `index.html` directly in your browser. **Note:** The OpenAI API key is required for the client to function.

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
