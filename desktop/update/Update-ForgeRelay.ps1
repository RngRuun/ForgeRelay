[CmdletBinding()]
param(
    [string]$Source = $PSScriptRoot,
    [string]$Destination,
    [switch]$NonInteractive,
    [switch]$NoLaunch,
    [switch]$SkipShortcuts
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
# A PowerShell 7 host may pass a PSModulePath that omits Windows PowerShell's builtin modules.
$env:PSModulePath = (Join-Path $PSHOME 'Modules') + [IO.Path]::PathSeparator + $env:PSModulePath
$stage = $null
$backup = $null
$applied = [System.Collections.Generic.List[object]]::new()
$expectedFiles = @('ForgeRelay.exe','Update-ForgeRelay.ps1','Update-ForgeRelay.cmd','README.txt','CHANGELOG.md')
function Child-Path([string]$Parent, [string]$Name) {
    $prefix = [IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
    $result = [IO.Path]::GetFullPath((Join-Path $Parent $Name))
    if (-not $result.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) { throw '更新路径超出应用文件夹。' }
    return $result
}
function File-Hash([string]$File) {
    $stream = [IO.File]::OpenRead($File)
    $digest = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($digest.ComputeHash($stream))).Replace('-','').ToLowerInvariant() }
    finally { $stream.Dispose(); $digest.Dispose() }
}
function Replace-File([string]$From, [string]$To) {
    if ([IO.File]::Exists($To)) { [IO.File]::Replace($From,$To,[NullString]::Value) }
    else { [IO.File]::Move($From,$To) }
}
try {
    $Source = [IO.Path]::GetFullPath($Source)
    $manifestFile = Join-Path $Source 'release-manifest.json'
    $manifest = [IO.File]::ReadAllText($manifestFile,[Text.Encoding]::UTF8) | ConvertFrom-Json
    if ($manifest.product -ne 'ForgeRelay' -or $manifest.architecture -ne 'x64' -or $manifest.version -notmatch '^\d+\.\d+\.\d+$') { throw '这不是有效的 ForgeRelay Windows 更新包。' }
    $names = @($manifest.files | ForEach-Object { $_.path })
    if ($names.Count -ne $expectedFiles.Count -or @($names | Select-Object -Unique).Count -ne $names.Count) { throw '更新文件清单不完整或包含重复项。' }
    foreach ($entry in $manifest.files) {
        if ($entry.path -cnotin $expectedFiles -or $entry.sha256 -notmatch '^[a-f0-9]{64}$') { throw '更新文件清单包含非法路径或校验值。' }
        $file = Child-Path $Source $entry.path
        if ((Get-Item -LiteralPath $file).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw '更新包不得包含符号链接。' }
        if ((File-Hash $file) -ne $entry.sha256 -or (Get-Item -LiteralPath $file).Length -ne $entry.bytes) { throw ('文件损坏，请重新下载更新包：' + $entry.path) }
    }
    if (-not $Destination) {
        if ($NonInteractive) { throw '非交互更新必须提供 -Destination。' }
        Add-Type -AssemblyName System.Windows.Forms
        $picker = New-Object System.Windows.Forms.FolderBrowserDialog
        $picker.Description = '选择原来的 ForgeRelay 应用文件夹。会保留个人配置、会话和项目数据。'
        $picker.SelectedPath = $Source
        if ($picker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }
        $Destination = $picker.SelectedPath
        $picker.Dispose()
    }
    $Destination = [IO.Path]::GetFullPath($Destination).TrimEnd('\')
    if ($Destination -eq [IO.Path]::GetPathRoot($Destination).TrimEnd('\')) { throw '请选择应用文件夹，不能选择磁盘根目录。' }
    if (-not (Test-Path -LiteralPath $Destination)) { [void][IO.Directory]::CreateDirectory($Destination) }
    if ((Get-Item -LiteralPath $Destination).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw '请选择实际应用文件夹，不要使用目录链接。' }
    $legacy = @(Get-ChildItem -LiteralPath $Destination -File | Where-Object { $_.Name -match '^ForgeRelay-\d+\.\d+\.\d+-Windows-x64\.exe$' })
    if (@(Get-ChildItem -LiteralPath $Destination -Force).Count -gt 0 -and -not (Test-Path -LiteralPath (Join-Path $Destination 'ForgeRelay.exe')) -and $legacy.Count -eq 0) { throw '目标不是 ForgeRelay 应用文件夹，请重新选择。' }
    $installedManifest = Join-Path $Destination 'release-manifest.json'
    if (Test-Path -LiteralPath $installedManifest) {
        $installed = [IO.File]::ReadAllText($installedManifest,[Text.Encoding]::UTF8) | ConvertFrom-Json
        if ($installed.product -eq 'ForgeRelay' -and $installed.version -match '^\d+\.\d+\.\d+$' -and [Version]$manifest.version -lt [Version]$installed.version) { throw '不支持覆盖降级。请在另一个文件夹运行旧版，保留当前应用和数据。' }
    }
    # Refuse to modify an application that is still running. Do not kill unrelated engines or work.
    $processes = @(Get-CimInstance Win32_Process)
    $active = @($processes | Where-Object { $_.ExecutablePath -and [IO.Path]::GetDirectoryName($_.ExecutablePath).TrimEnd('\') -ieq $Destination -and [IO.Path]::GetFileName($_.ExecutablePath) -match '^ForgeRelay(?:-\d+\.\d+\.\d+-Windows-x64)?\.exe$' })
    if (@($processes | Where-Object { $_.Name -match '^ForgeRelay.*\.exe$' -and -not $_.ExecutablePath }).Count -gt 0) { throw '无法确认一个 ForgeRelay 进程的路径，请先退出正在运行的 ForgeRelay 后重试。' }
    if ($active.Count -gt 0) { throw 'ForgeRelay 仍在运行。请从系统托盘退出旧版本，再重新更新；仅关闭或最小化窗口可能仍会保留后台。' }
    $stage = Child-Path $Destination ('.forgerelay-update-' + [Guid]::NewGuid().ToString('N'))
    [void][IO.Directory]::CreateDirectory($stage)
    $changes = [System.Collections.Generic.List[object]]::new()
    foreach ($entry in $manifest.files) { $changes.Add([pscustomobject]@{Name=$entry.path;From=(Child-Path $Source $entry.path);Hash=$entry.sha256}) }
    $changes.Add([pscustomobject]@{Name='release-manifest.json';From=$manifestFile;Hash=(File-Hash $manifestFile)})
    $exeHash = ($manifest.files | Where-Object { $_.path -ceq 'ForgeRelay.exe' }).sha256
    # Upgrade old versioned entry points too, so existing shortcuts cannot launch stale code.
    foreach ($alias in $legacy) { $changes.Add([pscustomobject]@{Name=$alias.Name;From=(Child-Path $Source 'ForgeRelay.exe');Hash=$exeHash}) }
    foreach ($change in $changes) {
        $target = Child-Path $Destination $change.Name
        if ((Test-Path -LiteralPath $target) -and ((Get-Item -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw '目标文件不能是符号链接。' }
        if ((Test-Path -LiteralPath $target) -and (File-Hash $target) -eq $change.Hash) { continue }
        $temporary = Child-Path $stage $change.Name
        [IO.File]::Copy($change.From,$temporary,$false)
        if ((File-Hash $temporary) -ne $change.Hash) { throw '暂存文件校验失败。' }
        $changesItem = [pscustomobject]@{Name=$change.Name;Target=$target;Temporary=$temporary;Hash=$change.Hash;Existed=[IO.File]::Exists($target);Previous=$null}
        if ($changesItem.Existed) {
            if (-not $backup) {
                $backupRoot = Child-Path $Destination '.forgerelay-backups'
                if ((Test-Path -LiteralPath $backupRoot) -and ((Get-Item -LiteralPath $backupRoot).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw '备份目录不能是目录链接。' }
                $backup = Child-Path $backupRoot ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8))
                [void][IO.Directory]::CreateDirectory($backup)
            }
            $changesItem.Previous = Child-Path $backup $change.Name
            [IO.File]::Copy($target,$changesItem.Previous,$false)
        }
        Replace-File $temporary $target
        $applied.Add($changesItem)
        if ((File-Hash $target) -ne $change.Hash) { throw '更新后文件校验失败。' }
    }
    if (-not $SkipShortcuts) {
        $linkShell = New-Object -ComObject WScript.Shell
        foreach ($folder in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('StartMenu'))) {
            foreach ($link in @(Get-ChildItem -LiteralPath $folder -Filter '*ForgeRelay*.lnk' -File -ErrorAction SilentlyContinue)) {
                try {
                    $shortcut = $linkShell.CreateShortcut($link.FullName)
                    if ([IO.Path]::GetDirectoryName($shortcut.TargetPath).TrimEnd('\') -ieq $Destination -and [IO.Path]::GetFileName($shortcut.TargetPath) -match '^ForgeRelay(?:-\d+\.\d+\.\d+-Windows-x64)?\.exe$') {
                        $shortcut.TargetPath = Join-Path $Destination 'ForgeRelay.exe'
                        $shortcut.WorkingDirectory = $Destination
                        $shortcut.IconLocation = $shortcut.TargetPath + ',0'
                        $shortcut.Save()
                    }
                } catch { Write-Warning '有一个快捷方式未能更新；原有版本入口已更新为相同程序。' }
            }
        }
    }
    [pscustomobject]@{success=$true;version=$manifest.version;destination=$Destination;changed=$applied.Count;backup=$backup;dataPreserved=$true} | ConvertTo-Json -Compress
    if (-not $NoLaunch) { Start-Process -FilePath (Join-Path $Destination 'ForgeRelay.exe') -WorkingDirectory $Destination }
} catch {
    $failure = $_.Exception.Message
    for ($index=$applied.Count-1; $index -ge 0; $index--) {
        $item = $applied[$index]
        try {
            if ($item.Existed) {
                $restore = Child-Path $stage ($item.Name + '.rollback')
                [IO.File]::Copy($item.Previous,$restore,$true)
                Replace-File $restore $item.Target
            } else { Remove-Item -LiteralPath $item.Target -Force }
        } catch { $failure += ' 有文件未能自动回滚，请从备份恢复：' + $item.Name }
    }
    Write-Error ('ForgeRelay 更新未完成：' + $failure) -ErrorAction Continue
    exit 1
} finally {
    if ($stage -and (Test-Path -LiteralPath $stage)) {
        $safeStage = Child-Path $Destination ([IO.Path]::GetFileName($stage))
        if ($safeStage -eq $stage -and [IO.Path]::GetFileName($stage).StartsWith('.forgerelay-update-')) { Remove-Item -LiteralPath $safeStage -Recurse -Force }
    }
}
