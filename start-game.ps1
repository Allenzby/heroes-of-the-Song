# Da Song Ying Xiong Zhuan - Dev Server Launcher
$ErrorActionPreference = 'Stop'

function Find-FreePort {
  $startPort = 1024
  $endPort = 65535

  # 1. Collect Hyper-V excluded port ranges
  $excluded = @()
  $exclLines = netsh interface ipv4 show excludedportrange protocol=tcp 2>$null
  foreach ($line in $exclLines) {
    if ($line -match '^\s*(\d+)\s+(\d+)') {
      $excluded += @{ Start = [int]$Matches[1]; End = [int]$Matches[2] }
    }
  }

  # 2. Collect currently occupied ports
  $usedPorts = @{}
  Get-NetTCPConnection -ErrorAction SilentlyContinue | ForEach-Object { $usedPorts[$_.LocalPort] = $true }

  # 3. Scan for a free port
  for ($port = $startPort; $port -le $endPort; $port++) {
    # Skip excluded ranges
    $inExcluded = $false
    foreach ($range in $excluded) {
      if ($port -ge $range.Start -and $port -le $range.End) { $inExcluded = $true; break }
    }
    if ($inExcluded) { continue }

    # Skip occupied ports
    if ($usedPorts.ContainsKey($port)) { continue }

    # Quick bind test
    try {
      $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
      $listener.Start()
      $listener.Stop()
      return $port
    } catch { }
  }
  return $null
}

$PORT = Find-FreePort
if (-not $PORT) {
  Write-Host ' [X] No available port found.' -ForegroundColor Red
  Read-Host 'Press Enter to exit'
  exit 1
}
$URL = "http://localhost:$PORT/"

Set-Location -LiteralPath $PSScriptRoot
$Host.UI.RawUI.WindowTitle = 'Da Song Ying Xiong Zhuan - Dev Server'

function Line { Write-Host ('=' * 50) -ForegroundColor DarkCyan }

Line
Write-Host '   Da Song Ying Xiong Zhuan' -ForegroundColor Cyan
Line
Write-Host ''

# 1. Check Node.js
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host ' [X] Node.js not found.' -ForegroundColor Red
  Write-Host '     Download LTS from https://nodejs.org/'
  Read-Host 'Press Enter to exit'
  exit 1
}
Write-Host " [OK] Node.js $(& node -v)" -ForegroundColor Green

# 2. Check dependencies
if (-not (Test-Path 'node_modules')) {
  Write-Host ' [..] Installing dependencies...' -ForegroundColor Yellow
  & npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host ' [X] Install failed. Check network and retry.' -ForegroundColor Red
    Read-Host 'Press Enter to exit'
    exit 1
  }
}
Write-Host ' [OK] Dependencies ready' -ForegroundColor Green

# 3. Check if server already running
function Test-Server {
  try {
    $r = Invoke-WebRequest $URL -UseBasicParsing -TimeoutSec 3
    return ($r.StatusCode -eq 200)
  } catch {
    return $false
  }
}

if (Test-Server) {
  Write-Host " [!] Port $PORT already in use, opening browser." -ForegroundColor Yellow
  Start-Process $URL
  Read-Host 'Press Enter to exit'
  exit 0
}

# 4. Kill leftover node processes on the target port
$portUsed = Get-NetTCPConnection -LocalPort $PORT -ErrorAction SilentlyContinue
if ($portUsed) {
  $portUsed | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 1
}

# 5. Start server
Write-Host ''
Write-Host ' [..] Starting server...' -ForegroundColor Yellow

$logFile = Join-Path $PSScriptRoot 'tmp-server.log'
$npmCmd = "cd /d `"$PSScriptRoot`" & npm run dev -- --port $PORT --strictPort > `"$logFile`" 2>&1"
Start-Process cmd -ArgumentList "/c", $npmCmd -WindowStyle Hidden

$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 500
  if (Test-Server) { $ready = $true; break }
}

if ($ready) {
  Write-Host ' [OK] Server started' -ForegroundColor Green
  Start-Process $URL
} else {
  Write-Host ' [!] Server slow to start, please wait...' -ForegroundColor Yellow
}

# 6. Menu
Write-Host ''
Line
Write-Host '   Da Song Ying Xiong Zhuan - Console' -ForegroundColor Cyan
Line
Write-Host ''
Write-Host "   URL: $URL" -ForegroundColor Cyan
Write-Host ''
Write-Host '   Commands:'
Write-Host '     open   - Open browser' -ForegroundColor White
Write-Host '     start  - Restart server' -ForegroundColor White
Write-Host '     exit   - Stop server and quit' -ForegroundColor White
Write-Host ''
Line

# 6. Main loop
while ($true) {
  Write-Host ''
  $input = Read-Host 'Enter command'

  switch ($input.ToLower().Trim()) {
    'open' {
      if (Test-Server) {
        Start-Process $URL
        Write-Host ' [OK] Browser opened' -ForegroundColor Green
      } else {
        Write-Host ' [!] Server not running. Use "start" first.' -ForegroundColor Yellow
      }
    }
    'start' {
      Write-Host ' [..] Stopping old server...' -ForegroundColor Yellow
      Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
      Remove-Item $logFile -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 1

      $newPort = Find-FreePort
      if ($newPort) { $PORT = $newPort; $URL = "http://localhost:$PORT/" }
      $npmCmd = "cd /d `"$PSScriptRoot`" & npm run dev -- --port $PORT --strictPort > `"$logFile`" 2>&1"

      Write-Host " [..] Starting server on port $PORT..." -ForegroundColor Yellow
      Start-Process cmd -ArgumentList "/c", $npmCmd -WindowStyle Hidden
      $ready = $false
      for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Milliseconds 500
        if (Test-Server) { $ready = $true; break }
      }

      if ($ready) {
        Write-Host ' [OK] Server restarted' -ForegroundColor Green
        Start-Process $URL
      } else {
        Write-Host ' [!] Server slow to start, please wait...' -ForegroundColor Yellow
      }
    }
    'exit' {
      Write-Host ''
      Write-Host ' [..] Stopping server...' -ForegroundColor Yellow
      Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
      Write-Host ' [OK] Server stopped' -ForegroundColor Green
      Write-Host ''
      Write-Host 'Goodbye!' -ForegroundColor Cyan
      Start-Sleep -Milliseconds 500
      exit 0
    }
    '' { }
    default {
      Write-Host ' [!] Unknown command. Use: open, start, exit' -ForegroundColor Yellow
    }
  }
}
