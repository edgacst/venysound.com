param(
  # JDK만 있고 Android SDK가 없을 때: Google cmdline-tools 다운로드 후 platform-tools / API 36 / build-tools 설치 (인터넷 필요)
  [switch]$InstallSdk
)

# Veny Sound TWA - release AAB (PowerShell)
# UTF-8: avoid mojibake in some consoles
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false) } catch {}

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Test-JavaHome([string]$dir) {
  if (-not $dir) { return $false }
  $java = Join-Path $dir "bin\java.exe"
  return (Test-Path -LiteralPath $java)
}

function Find-JavaHomeFromRegistry {
  foreach ($root in @("HKLM:\SOFTWARE\JavaSoft\JDK", "HKLM:\SOFTWARE\WOW6432Node\JavaSoft\JDK", "HKCU:\SOFTWARE\JavaSoft\JDK")) {
    if (-not (Test-Path $root)) { continue }
    Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue | ForEach-Object {
      $jh = (Get-ItemProperty -LiteralPath $_.PSPath -Name JavaHome -ErrorAction SilentlyContinue).JavaHome
      if (Test-JavaHome $jh) { return $jh }
    }
  }
  $adopt = "HKLM:\SOFTWARE\Eclipse Adoptium\JDK"
  if (Test-Path $adopt) {
    Get-ChildItem -LiteralPath $adopt -ErrorAction SilentlyContinue | ForEach-Object {
      $p = Join-Path $_.PSPath "MSI"
      if (Test-Path $p) {
        $path = (Get-ItemProperty -LiteralPath $p -Name Path -ErrorAction SilentlyContinue).Path
        if (Test-JavaHome $path) { return $path }
      }
    }
  }
  return $null
}

function Find-JavaHomeDeepUnderAndroidStudio {
  $studioRoots = @(
    "${env:ProgramFiles}\Android\Android Studio",
    "${env:LOCALAPPDATA}\Programs\Android Studio"
  )
  foreach ($root in $studioRoots) {
    if (-not (Test-Path -LiteralPath $root)) { continue }
    $direct = Join-Path $root "jbr\bin\java.exe"
    if (Test-Path -LiteralPath $direct) {
      return (Join-Path $root "jbr")
    }
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    $jbrDirs = Get-ChildItem -LiteralPath $root -Directory -Recurse -Depth 6 | Where-Object { $_.Name -eq "jbr" }
    $ErrorActionPreference = $prev
    foreach ($dir in $jbrDirs) {
      $java = Join-Path $dir.FullName "bin\java.exe"
      if (Test-Path -LiteralPath $java) {
        return $dir.FullName
      }
    }
  }
  return $null
}

function Find-JavaHome {
  # setx / Windows "환경 변수"로 넣은 값은 새 터미널 전까지 $env:에 없을 수 있음 → 레지스트리에서 읽음
  foreach ($scope in @("Process", "User", "Machine")) {
    try {
      $jh = [System.Environment]::GetEnvironmentVariable("JAVA_HOME", $scope)
      if (Test-JavaHome $jh) { return $jh }
    } catch {}
  }

  $reg = Find-JavaHomeFromRegistry
  if ($reg) { return $reg }

  # JAVA_HOME이 잘못된 경로를 가리키는 경우(폴더는 있는데 bin\java.exe 없음) 실제 jbr 검색
  $deep = Find-JavaHomeDeepUnderAndroidStudio
  if ($deep) { return $deep }

  if (Test-JavaHome $env:JAVA_HOME) { return $env:JAVA_HOME }

  $candidates = @(
    "${env:ProgramFiles}\Android\Android Studio\jbr",
    "${env:ProgramFiles}\Android\Android Studio\jbr\Contents\Home",
    "${env:LOCALAPPDATA}\Programs\Android Studio\jbr",
    "${env:LOCALAPPDATA}\Programs\Android Studio\jbr\Contents\Home"
  )
  foreach ($d in $candidates) {
    if (Test-JavaHome $d) { return $d }
  }

  $jb = Join-Path $env:ProgramFiles "JetBrains"
  if (Test-Path $jb) {
    Get-ChildItem -LiteralPath $jb -Directory -ErrorAction SilentlyContinue | ForEach-Object {
      $jbr = Join-Path $_.FullName "jbr"
      if (Test-JavaHome $jbr) { return $jbr }
    }
  }

  $ms = Join-Path $env:ProgramFiles "Microsoft"
  if (Test-Path $ms) {
    Get-ChildItem -LiteralPath $ms -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "jdk*" } | ForEach-Object {
      if (Test-JavaHome $_.FullName) { return $_.FullName }
    }
  }

  $jdks = Join-Path $env:USERPROFILE ".jdks"
  if (Test-Path $jdks) {
    Get-ChildItem -LiteralPath $jdks -Directory -ErrorAction SilentlyContinue | Sort-Object { $_.Name } -Descending | ForEach-Object {
      if (Test-JavaHome $_.FullName) { return $_.FullName }
    }
  }

  $androidRoot = Join-Path $env:ProgramFiles "Android"
  if (Test-Path $androidRoot) {
    Get-ChildItem -Path $androidRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
      $jbr = Join-Path $_.FullName "jbr"
      if (Test-JavaHome $jbr) { return $jbr }
    }
  }

  foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
    if (-not $base) { continue }
    $javaDir = Join-Path $base "Java"
    if (Test-Path $javaDir) {
      Get-ChildItem -Path $javaDir -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        if (Test-JavaHome $_.FullName) { return $_.FullName }
      }
    }
    $adopt = Join-Path $base "Eclipse Adoptium"
    if (Test-Path $adopt) {
      Get-ChildItem -Path $adopt -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        if (Test-JavaHome $_.FullName) { return $_.FullName }
      }
    }
  }

  $cmd = Get-Command java -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) {
    if ($cmd.Source -match "WindowsApps") {
      # 스토어 "가짜" java — 실제 JDK 아님
    } else {
      $bin = Split-Path -Parent $cmd.Source
      $home = Split-Path -Parent $bin
      if (Test-JavaHome $home) { return $home }
    }
  }

  $scoopJdk = Join-Path $env:USERPROFILE "scoop\apps\openjdk\current"
  if (Test-JavaHome $scoopJdk) { return $scoopJdk }
  $scoopGlob = Join-Path $env:USERPROFILE "scoop\apps"
  if (Test-Path $scoopGlob) {
    Get-ChildItem -LiteralPath $scoopGlob -Directory -Filter "openjdk*" -ErrorAction SilentlyContinue | ForEach-Object {
      $cur = Join-Path $_.FullName "current"
      if (Test-JavaHome $cur) { return $cur }
    }
  }

  return $null
}

function Get-CommandPathsFromWhere([string]$exeName) {
  # where.exe 는 실패 시 stderr 를 내고 PowerShell 5.x 가 오류 레코드로 처리함 → cmd 로만 조회.
  $raw = & cmd.exe /c "where $exeName 2>nul"
  if ([string]::IsNullOrWhiteSpace($raw)) { return @() }
  @($raw -split "[\r\n]+" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

function Write-JavaDiagnostics {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  Write-Host "--- diagnostic (why JDK was not detected) ---"
  Write-Host "Process JAVA_HOME: '$([System.Environment]::GetEnvironmentVariable('JAVA_HOME','Process'))'"
  Write-Host "User JAVA_HOME:    '$([System.Environment]::GetEnvironmentVariable('JAVA_HOME','User'))'"
  Write-Host "Machine JAVA_HOME: '$([System.Environment]::GetEnvironmentVariable('JAVA_HOME','Machine'))'"
  foreach ($scope in @("User", "Process")) {
    $jh = [System.Environment]::GetEnvironmentVariable("JAVA_HOME", $scope)
    if ($jh) {
      $exe = Join-Path $jh "bin\java.exe"
      if (-not (Test-Path -LiteralPath $exe)) {
        Write-Host "JAVA_HOME is set ($scope) but file missing: $exe"
        Write-Host "  -> Remove wrong JAVA_HOME or reinstall Android Studio (JBR)."
      }
    }
  }
  $wj = Get-Command java -ErrorAction SilentlyContinue
  if ($wj) {
    Write-Host "PATH java:         '$($wj.Source)'"
    if ($wj.Source -match "WindowsApps") {
      Write-Host "  ^ This is often the Microsoft Store stub, not a full JDK."
    }
  } else {
    Write-Host "PATH java:         (not found)"
  }
  $whereOut = Get-CommandPathsFromWhere java
  if ($whereOut.Count) { Write-Host "where java:        $($whereOut -join '; ')" }
  $ErrorActionPreference = $prev
  Write-Host "---"
}

function Test-AndroidSdkDir([string]$p) {
  if (-not $p) { return $false }
  if (-not (Test-Path -LiteralPath $p)) { return $false }
  if (Test-Path -LiteralPath (Join-Path $p "platform-tools\adb.exe")) { return $true }
  $bt = Join-Path $p "build-tools"
  if (Test-Path -LiteralPath $bt) {
    if (@(Get-ChildItem -LiteralPath $bt -Directory -ErrorAction SilentlyContinue).Count -gt 0) { return $true }
  }
  $pl = Join-Path $p "platforms"
  if (Test-Path -LiteralPath $pl) {
    if (@(Get-ChildItem -LiteralPath $pl -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "android-*" }).Count -gt 0) { return $true }
  }
  return $false
}

function Get-AndroidSdkFromRegistry {
  foreach ($reg in @(
    "HKLM:\SOFTWARE\Android SDK Tools",
    "HKLM:\SOFTWARE\WOW6432Node\Android SDK Tools"
  )) {
    if (-not (Test-Path -LiteralPath $reg)) { continue }
    $p = (Get-ItemProperty -LiteralPath $reg -Name Path -ErrorAction SilentlyContinue).Path
    if (Test-AndroidSdkDir $p) { return $p }
  }
  return $null
}

function Get-AndroidSdkFromPathAdb {
  $candidates = @()
  $gc = Get-Command adb -ErrorAction SilentlyContinue
  if ($gc -and $gc.Source) { $candidates += $gc.Source }
  foreach ($line in (Get-CommandPathsFromWhere adb)) {
    if ($line -and (Test-Path -LiteralPath $line)) { $candidates += $line }
  }
  foreach ($adbPath in ($candidates | Select-Object -Unique)) {
    if (-not ($adbPath -like "*.exe")) { continue }
    $binDir = Split-Path -LiteralPath $adbPath
    if ((Split-Path -LiteralPath $binDir -Leaf) -ne "platform-tools") { continue }
    $sdk = Split-Path -LiteralPath $binDir
    if (Test-AndroidSdkDir $sdk) { return $sdk }
  }
  return $null
}

function Find-AndroidSdkUnderTree([string]$baseRoot, [int]$maxDepth) {
  if (-not (Test-Path -LiteralPath $baseRoot)) { return $null }
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  $adbs = Get-ChildItem -LiteralPath $baseRoot -Filter "adb.exe" -File -Recurse -Depth $maxDepth
  $ErrorActionPreference = $prev
  foreach ($f in $adbs) {
    if ($f.Directory.Name -ne "platform-tools") { continue }
    $sdk = $f.Directory.Parent.FullName
    if (Test-AndroidSdkDir $sdk) { return $sdk }
  }
  return $null
}

function Find-AndroidSdkByLimitedSearch {
  # Program Files\Android 아래 전체 재귀는 Studio 용량 때문에 제외. AppData·사용자 쪽만 깊게 검색.
  $r1 = Find-AndroidSdkUnderTree (Join-Path $env:LOCALAPPDATA "Android") 16
  if ($r1) { return $r1 }
  $r2 = Find-AndroidSdkUnderTree (Join-Path $env:USERPROFILE "Android") 12
  if ($r2) { return $r2 }
  $pfSdk = Join-Path $env:ProgramFiles "Android\Sdk"
  if (Test-AndroidSdkDir $pfSdk) { return $pfSdk }
  return $null
}

function Get-AndroidSdkFromStudioOptions {
  $google = Join-Path $env:APPDATA "Google"
  if (-not (Test-Path -LiteralPath $google)) { return $null }
  $studioDirs = Get-ChildItem -LiteralPath $google -Directory -Filter "AndroidStudio*" -ErrorAction SilentlyContinue
  foreach ($sd in $studioDirs) {
    $optDir = Join-Path $sd.FullName "options"
    if (-not (Test-Path -LiteralPath $optDir)) { continue }
    foreach ($xf in (Get-ChildItem -LiteralPath $optDir -Filter "*.xml" -File -ErrorAction SilentlyContinue)) {
      $t = Get-Content -LiteralPath $xf.FullName -Raw -ErrorAction SilentlyContinue
      if (-not $t) { continue }
      if ($t -match 'name="android\.sdk\.path"\s+value="([^"]+)"') {
        $p = $matches[1] -replace '/', '\'
        if (Test-AndroidSdkDir $p) { return $p }
      }
      if ($t -match 'android\.sdk\.path[^>]*value="([^"]+)"') {
        $p = $matches[1] -replace '/', '\'
        if (Test-AndroidSdkDir $p) { return $p }
      }
    }
  }
  return $null
}

function Resolve-AndroidSdkDir {
  foreach ($key in @("ANDROID_SDK_ROOT", "ANDROID_HOME")) {
    foreach ($scope in @("Process", "User", "Machine")) {
      $p = [System.Environment]::GetEnvironmentVariable($key, $scope)
      if (Test-AndroidSdkDir $p) { return $p }
    }
  }
  $extra = @(
    (Join-Path $env:LOCALAPPDATA "Android\Sdk"),
    (Join-Path $env:USERPROFILE "Android\Sdk"),
    (Join-Path $env:ProgramFiles "Android\Sdk"),
    "C:\Android\Sdk",
    "D:\Android\Sdk",
    "E:\Android\Sdk"
  )
  foreach ($localSdk in $extra) {
    if (Test-AndroidSdkDir $localSdk) { return $localSdk }
  }
  $fromAdb = Get-AndroidSdkFromPathAdb
  if ($fromAdb) { return $fromAdb }
  $fromReg = Get-AndroidSdkFromRegistry
  if ($fromReg) { return $fromReg }
  $fromStudio = Get-AndroidSdkFromStudioOptions
  if ($fromStudio) { return $fromStudio }
  $fromSearch = Find-AndroidSdkByLimitedSearch
  if ($fromSearch) { return $fromSearch }
  $propsPath = Join-Path $root "local.properties"
  if (Test-Path -LiteralPath $propsPath) {
    Get-Content -LiteralPath $propsPath -ErrorAction SilentlyContinue | ForEach-Object {
      if ($_ -match '^\s*sdk\.dir\s*=\s*(.+)\s*$') {
        $raw = $matches[1].Trim() -replace '^["'']|["'']$', ''
        $expanded = [Environment]::ExpandEnvironmentVariables($raw)
        if (Test-AndroidSdkDir $expanded) { return $expanded }
      }
    }
  }
  return $null
}

function Install-AndroidSdkCommandLine {
  $sdkRoot = Join-Path $env:LOCALAPPDATA "Android\Sdk"
  $cmdlineParent = Join-Path $sdkRoot "cmdline-tools"
  $cmdlineLatest = Join-Path $cmdlineParent "latest"
  $sdkMgrBat = Join-Path $cmdlineLatest "bin\sdkmanager.bat"
  New-Item -ItemType Directory -Path $sdkRoot -Force | Out-Null
  $env:ANDROID_HOME = $sdkRoot
  $env:ANDROID_SDK_ROOT = $sdkRoot

  if (-not (Test-Path -LiteralPath $sdkMgrBat)) {
    Write-Host ""
    Write-Host "Downloading Android SDK command-line tools (Google, ~150MB)..."
    $zipUrl = "https://dl.google.com/android/repository/commandlinetools-win-11391160_latest.zip"
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("android-cmdline-" + [Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    $zipPath = Join-Path $tmp "cmdline-tools.zip"
    try {
      Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
      Expand-Archive -LiteralPath $zipPath -DestinationPath $tmp -Force
      $inner = Join-Path $tmp "cmdline-tools"
      if (-not (Test-Path -LiteralPath (Join-Path $inner "bin\sdkmanager.bat"))) {
        throw "Unexpected cmdline-tools zip layout (expected cmdline-tools\bin\sdkmanager.bat)."
      }
      New-Item -ItemType Directory -Path $cmdlineParent -Force | Out-Null
      if (Test-Path -LiteralPath $cmdlineLatest) {
        Remove-Item -LiteralPath $cmdlineLatest -Recurse -Force
      }
      Move-Item -LiteralPath $inner -Destination $cmdlineLatest
    } finally {
      Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
  }

  if (-not (Test-Path -LiteralPath $sdkMgrBat)) {
    throw "sdkmanager.bat missing: $sdkMgrBat"
  }

  $yesFile = Join-Path ([System.IO.Path]::GetTempPath()) ("android-sdk-yes-" + [Guid]::NewGuid().ToString("N") + ".txt")
  try {
    (1..120 | ForEach-Object { "y" }) | Set-Content -LiteralPath $yesFile -Encoding ASCII
    Write-Host "Accepting SDK licenses..."
    cmd.exe /c "`"$sdkMgrBat`" --licenses < `"$yesFile`""
    if ($LASTEXITCODE -ne 0) {
      Write-Host "(License prompt exit $LASTEXITCODE — continuing; install may still work.)"
    }
  } finally {
    Remove-Item -LiteralPath $yesFile -Force -ErrorAction SilentlyContinue
  }

  Write-Host "Installing platform-tools, platforms;android-36, build-tools..."
  $pkgSets = @(
    @("platform-tools", "platforms;android-36", "build-tools;36.0.0"),
    @("platform-tools", "platforms;android-36", "build-tools;35.0.1")
  )
  $ok = $false
  foreach ($pkgs in $pkgSets) {
    & $sdkMgrBat --install @pkgs
    if ($LASTEXITCODE -eq 0 -or (Test-AndroidSdkDir $sdkRoot)) { $ok = $true; break }
    Write-Host "sdkmanager exit $LASTEXITCODE for $($pkgs -join ', ') — trying next set..."
  }
  if (-not $ok -or -not (Test-AndroidSdkDir $sdkRoot)) {
    throw "sdkmanager --install failed. Install Android Studio and use its SDK Manager, or run: winget install Google.AndroidStudio"
  }
}

function Ensure-AndroidSdk {
  $sdk = Resolve-AndroidSdkDir
  if (-not $sdk) {
    if ($InstallSdk) {
      Write-Host ""
      Write-Host "-InstallSdk: installing SDK under $env:LOCALAPPDATA\Android\Sdk (first run may take several minutes)."
      Install-AndroidSdkCommandLine
      $sdk = Resolve-AndroidSdkDir
    }
    if (-not $sdk) {
      Write-Host ""
      Write-Host "Android SDK not found. JDK is OK; you still need the Android SDK (build-tools, platforms)."
      Write-Host ""
      Write-Host "Option A — automatic (no Studio):"
      Write-Host "  .\build-aab.ps1 -InstallSdk"
      Write-Host ""
      Write-Host "Option B — Android Studio:"
      Write-Host "  winget install Google.AndroidStudio"
      Write-Host "  (open once, finish setup wizard — SDK usually goes to:)"
      Write-Host "  $env:LOCALAPPDATA\Android\Sdk"
      Write-Host ""
      Write-Host "Then run .\build-aab.ps1 again. Or set ANDROID_HOME to your Sdk folder if it is elsewhere."
      exit 1
    }
  }
  $env:ANDROID_HOME = $sdk
  $env:ANDROID_SDK_ROOT = $sdk
  Write-Host "Using ANDROID_HOME=$sdk"
  $propsPath = Join-Path $root "local.properties"
  $sdkLine = "sdk.dir=" + ($sdk -replace '\\', '/')
  $lines = @()
  if (Test-Path -LiteralPath $propsPath) {
    $lines = @(Get-Content -LiteralPath $propsPath -ErrorAction SilentlyContinue | Where-Object { $_ -notmatch '^\s*sdk\.dir\s*=' })
  }
  ($lines + $sdkLine) -join "`r`n" | Set-Content -LiteralPath $propsPath -Encoding UTF8
  try {
    $curUser = [System.Environment]::GetEnvironmentVariable("ANDROID_HOME", "User")
    if ($curUser -ne $sdk) {
      [System.Environment]::SetEnvironmentVariable("ANDROID_HOME", $sdk, "User")
      [System.Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $sdk, "User")
      Write-Host "Saved ANDROID_HOME / ANDROID_SDK_ROOT to user environment (new terminals will pick this up)."
    }
  } catch {}
}

function Get-GradleKeystorePropsPathForInteractiveSigning {
  $kp = Join-Path $root "keystore.properties"
  if (Test-Path -LiteralPath $kp) {
    return $null
  }
  $manifestPath = Join-Path $root "twa-manifest.json"
  if (-not (Test-Path -LiteralPath $manifestPath)) {
    Write-Host "twa-manifest.json not found. Create keystore.properties (see keystore.properties.example)."
    exit 1
  }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $manifestKeyPath = $manifest.signingKey.path
  $keyAlias = $manifest.signingKey.alias
  if (-not $keyAlias) { $keyAlias = "android" }

  $ksInRoot = Join-Path $root "android.keystore"
  $storeFileProp = "android.keystore"
  if (-not (Test-Path -LiteralPath $ksInRoot)) {
    $expanded = if ($manifestKeyPath) { [Environment]::ExpandEnvironmentVariables($manifestKeyPath) } else { "" }
    if (-not $expanded -or -not (Test-Path -LiteralPath $expanded)) {
      Write-Host "Keystore not found. Expected: $ksInRoot or signingKey.path in twa-manifest.json"
      exit 1
    }
    $storeFileProp = ($expanded -replace '\\', '/')
  }

  Write-Host ""
  Write-Host "Release signing: no keystore.properties - passwords only for this run (temp file, not in repo)."
  Write-Host "  storeFile=$storeFileProp  keyAlias=$keyAlias"
  Write-Host "  (Cursor/IDE: password shows as you type - use Windows PowerShell.exe if you need hidden input.)"
  $plainStore = Read-Host "Keystore password"
  if ([string]::IsNullOrEmpty($plainStore)) {
    Write-Host "Keystore password required."
    exit 1
  }
  $keyLine = Read-Host "Key password [Enter = same as keystore]"
  $plainKey = if ([string]::IsNullOrWhiteSpace($keyLine)) { $plainStore } else { $keyLine }

  $tempProps = Join-Path ([System.IO.Path]::GetTempPath()) ("veny-ksp-$PID-" + [Guid]::NewGuid().ToString("N") + ".properties")
  $lines = @(
    "storeFile=$storeFileProp",
    "keyAlias=$keyAlias",
    "storePassword=$plainStore",
    "keyPassword=$plainKey"
  )
  $enc = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllLines($tempProps, $lines, $enc)
  $plainStore = $null
  $plainKey = $null
  return $tempProps
}

function Test-JavaHomeBrokenEnv {
  foreach ($scope in @("User", "Process")) {
    $jh = [System.Environment]::GetEnvironmentVariable("JAVA_HOME", $scope)
    if (-not $jh) { continue }
    if (-not (Test-JavaHome $jh)) { return $true }
  }
  return $false
}

$found = Find-JavaHome
if (-not $found) {
  Write-Host "JAVA_HOME not found (no JDK / Android Studio jbr detected)."
  Write-JavaDiagnostics
  Write-Host ""
  if (Test-JavaHomeBrokenEnv) {
    Write-Host "=== Quick fix: JAVA_HOME points to a folder without bin\java.exe ==="
    Write-Host "Copy and run this ONE line in PowerShell, then close ALL terminals:"
    Write-Host ""
    Write-Host '[System.Environment]::SetEnvironmentVariable("JAVA_HOME",$null,"User")'
    Write-Host ""
    Write-Host "Open a NEW PowerShell window, then:"
    Write-Host "  winget install Microsoft.OpenJDK.17"
    Write-Host "  (wait for finish; then still in that new window)"
    Write-Host "  cd $root"
    Write-Host "  .\build-aab.ps1"
    Write-Host ""
    Write-Host "Alternatively: reinstall Android Studio so that jbr\bin\java.exe exists under Studio."
    Write-Host ""
  } else {
    Write-Host "After installing a JDK, close ALL terminals and open a new PowerShell, then run build-aab.ps1 again."
    Write-Host ""
    Write-Host "  winget install Microsoft.OpenJDK.17"
    Write-Host ""
  }
  Write-Host "(Do not paste help text as commands. Only run: winget ... then cd ... then .\build-aab.ps1)"
  exit 1
}

$env:JAVA_HOME = $found
Write-Host "Using JAVA_HOME=$found"

Ensure-AndroidSdk

$tempKsp = $null
try {
  $tempKsp = Get-GradleKeystorePropsPathForInteractiveSigning
  $gradleArgs = @("bundleRelease", "--no-daemon")
  if ($tempKsp) {
    $pVal = ($tempKsp -replace '\\', '/')
    if ($pVal -match '\s') {
      try {
        $fso = New-Object -ComObject Scripting.FileSystemObject
        $pVal = (($fso.GetFile($tempKsp).ShortPath) -replace '\\', '/')
      } catch {}
    }
    $gradleArgs = @("-PvenysoundKeystoreProperties=$pVal") + $gradleArgs
  }
  & .\gradlew.bat @gradleArgs
} finally {
  if ($tempKsp -and (Test-Path -LiteralPath $tempKsp)) {
    Remove-Item -LiteralPath $tempKsp -Force -ErrorAction SilentlyContinue
  }
}
$gradleExit = $LASTEXITCODE
if ($null -eq $gradleExit) { $gradleExit = 0 }
if ($gradleExit -ne 0) {
  Write-Host ""
  Write-Host "Gradle build FAILED (exit $gradleExit). No AAB copied."
  exit $gradleExit
}

$src = "app\build\outputs\bundle\release\app-release.aab"
if (-not (Test-Path -LiteralPath $src)) {
  Write-Host "AAB not found: $src"
  exit 1
}
$ver = (Select-String -Path "app\build.gradle" -Pattern 'versionName\s+"([^"]+)"' | ForEach-Object { $_.Matches.Groups[1].Value } | Select-Object -First 1)
$dest = Join-Path $root "venysound-$ver.aab"
Copy-Item -Force -LiteralPath $src -Destination $dest
Write-Host "OK: $dest"
