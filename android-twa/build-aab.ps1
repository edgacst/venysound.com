# Veny Sound TWA — release AAB (PowerShell)
# Android Studio 설치 시: JBR 경로를 JAVA_HOME 으로 사용
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not $env:JAVA_HOME) {
  $jbr = "${env:ProgramFiles}\Android\Android Studio\jbr"
  if (Test-Path "$jbr\bin\java.exe") {
    $env:JAVA_HOME = $jbr
    Write-Host "JAVA_HOME=$jbr"
  }
}
if (-not $env:JAVA_HOME -or -not (Test-Path "$env:JAVA_HOME\bin\java.exe")) {
  Write-Host "JAVA_HOME 이 없습니다. JDK 17+ 또는 Android Studio 의 jbr 경로를 설정하세요."
  Write-Host "예: `$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'"
  exit 1
}

.\gradlew.bat bundleRelease --no-daemon
$src = "app\build\outputs\bundle\release\app-release.aab"
if (-not (Test-Path $src)) {
  Write-Host "AAB 가 생성되지 않았습니다: $src"
  exit 1
}
$ver = (Select-String -Path "app\build.gradle" -Pattern 'versionName\s+"([^"]+)"' | ForEach-Object { $_.Matches.Groups[1].Value } | Select-Object -First 1)
$dest = Join-Path $root "venysound-$ver.aab"
Copy-Item -Force $src $dest
Write-Host "OK: $dest"
