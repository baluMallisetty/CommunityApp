# PowerShell Script to safely start or restart backend and frontend

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

# Kill backend (port 3000) and frontend/Expo (port 19006) if already running
Stop-If-Port-In-Use -port 3000      # backend default
Stop-If-Port-In-Use -port 19006     # Expo web default
Stop-If-Port-In-Use -port 8081      # Metro Bundler

# Start backend
Start-Process powershell -ArgumentList "cd ./backend; npm start" -NoNewWindow

# Start frontend (Expo web)
Start-Process powershell -ArgumentList "cd ./frontend; npx expo start --tunnel" -NoNewWindow #-web

Write-Host "Backend and Frontend started (or restarted cleanly)"