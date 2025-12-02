# PowerShell Script to safely start or restart backend and frontend with cache clearing

# Function to check if a process is running by port
function Stop-If-Port-In-Use {
    param([int]$port)
    $used = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($used) {
        Write-Host "Port $port is in use. Killing process..."
        $pid = (Get-Process -Id $used.OwningProcess -ErrorAction SilentlyContinue).Id
        if ($pid) {
            Stop-Process -Id $pid -Force
            Write-Host "Killed process $pid on port $port."
        }
    }
}

Write-Host "`n=== Stopping existing processes ===`n"

# Kill backend and Expo ports
Stop-If-Port-In-Use -port 3000     # backend
Stop-If-Port-In-Use -port 19006    # Expo web UI
Stop-If-Port-In-Use -port 19000    # Classic Expo
Stop-If-Port-In-Use -port 8081     # Metro Bundler
Stop-If-Port-In-Use -port 19001    # Expo dev tools
Stop-If-Port-In-Use -port 19002    # Expo dev tools

Write-Host "`n=== Clearing Metro / Expo cache ===`n"

# Delete Metro cache folders if they exist
$metroCache = "$env:LOCALAPPDATA\Temp\metro-cache"
if (Test-Path $metroCache) {
    Remove-Item $metroCache -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Deleted Metro cache at $metroCache"
}

# Delete Expo CLI web build cache
$expoWebCache = "$env:LOCALAPPDATA\Temp\expo-web-cache"
if (Test-Path $expoWebCache) {
    Remove-Item $expoWebCache -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Deleted Expo web cache at $expoWebCache"
}

# Clear node_modules/.cache for frontend
$frontendCache = "./frontend/node_modules/.cache"
if (Test-Path $frontendCache) {
    Remove-Item $frontendCache -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Deleted frontend Metro cache folder"
}

# Clear watchman (if installed)
if (Get-Command "watchman" -ErrorAction SilentlyContinue) {
    watchman watch-del-all
    Write-Host "Cleared Watchman cache"
}

Write-Host "`n=== Starting backend ===`n"

Start-Process powershell `
    -ArgumentList "cd ./backend; npm start" `
    -NoNewWindow

Write-Host "`n=== Starting frontend (Expo) with cleared cache ===`n"

Start-Process powershell `
    -ArgumentList "cd ./frontend; npx expo start --tunnel --clear" `
    -NoNewWindow

Write-Host "`n🚀 Backend and Frontend started cleanly with full cache reset!`n"
