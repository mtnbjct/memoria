# memoria の本番モード起動スクリプト (Windows)
# Task Scheduler にログオン時トリガーで登録して常駐化させる想定。
# 使い方: powershell -WindowStyle Hidden -File <path>\start-memoria.ps1

$ErrorActionPreference = "Stop"

# このスクリプトと同じフォルダの1つ上 (= プロジェクトルート) を起点にする
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

# ログファイル (プロジェクト内の logs/ に吐く、.gitignoreで除外される想定)
$logDir = Join-Path $projectRoot "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$logFile = Join-Path $logDir ("memoria-{0}.log" -f (Get-Date -Format "yyyyMMdd"))

"[$(Get-Date -Format s)] starting memoria in $projectRoot" | Out-File -FilePath $logFile -Append -Encoding utf8

# .next が無ければ自動ビルド
if (-not (Test-Path (Join-Path $projectRoot ".next"))) {
    "[$(Get-Date -Format s)] .next not found, running npm run build" | Out-File -FilePath $logFile -Append -Encoding utf8
    npm run build *>> $logFile
}

# 本番モード起動
npm start *>> $logFile
