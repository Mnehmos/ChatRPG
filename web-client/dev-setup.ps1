# Local Development Setup Script for ChatRPG Web Client (PowerShell)

Write-Host "ChatRPG Web Client - Local Development Setup" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Check if .env.local exists
if (-not (Test-Path ".env.local")) {
    Write-Host "❌ .env.local not found!" -ForegroundColor Red
    Write-Host "📝 Creating .env.local from template..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env.local"
    Write-Host "✅ Created .env.local" -ForegroundColor Green
    Write-Host ""
    Write-Host "⚠️  Please edit .env.local with your settings:" -ForegroundColor Yellow
    Write-Host "   - CHATRPG_SERVER_URL"
    Write-Host "   - CHATRPG_API_KEY (optional)"
    Write-Host ""
    exit 1
}

# Read environment variables
Get-Content ".env.local" | ForEach-Object {
    if ($_ -match "^([^=]+)=(.*)$") {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim()
        Set-Variable -Name $name -Value $value -Scope Script
    }
}

# Validate configuration
if (-not $CHATRPG_SERVER_URL) {
    Write-Host "❌ CHATRPG_SERVER_URL not set in .env.local" -ForegroundColor Red
    exit 1
}

Write-Host "📋 Configuration:" -ForegroundColor Cyan
Write-Host "   Server URL: $CHATRPG_SERVER_URL"
if ($CHATRPG_API_KEY) {
    Write-Host "   API Key: ***SET***"
}
Write-Host ""

# Create development version of index.html
Write-Host "🔧 Creating index-dev.html..." -ForegroundColor Yellow
Copy-Item "index.html" "index-dev.html" -Force

# Inject configuration
$content = Get-Content "index-dev.html" -Raw
$content = $content -replace '{{SERVER_URL}}', $CHATRPG_SERVER_URL
$content = $content -replace '{{API_KEY}}', $(if ($CHATRPG_API_KEY) { $CHATRPG_API_KEY } else { '' })
Set-Content "index-dev.html" $content

Write-Host "✅ Created index-dev.html with your configuration" -ForegroundColor Green
Write-Host ""

# Start local server
Write-Host "🚀 Starting local development server..." -ForegroundColor Cyan
Write-Host "📱 Open http://localhost:8000/index-dev.html in your browser" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Try different server options
if (Get-Command python -ErrorAction SilentlyContinue) {
    python -m http.server 8000
}
elseif (Get-Command python3 -ErrorAction SilentlyContinue) {
    python3 -m http.server 8000
}
elseif (Get-Command npx -ErrorAction SilentlyContinue) {
    npx serve . -l 8000
}
else {
    Write-Host "❌ No suitable HTTP server found!" -ForegroundColor Red
    Write-Host "   Install Python or Node.js to run a local server"
    Write-Host ""
    Write-Host "   Or manually open: file://$PWD/index-dev.html"
}
