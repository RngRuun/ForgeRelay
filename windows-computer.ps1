$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class RelayComputer {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extra);
}
'@
[RelayComputer]::SetProcessDPIAware() | Out-Null
$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
if ($request.action -eq 'click') {
  if ($null -eq $request.x -or $null -eq $request.y) { throw 'Click requires x and y.' }
  if ($request.x -lt 0 -or $request.y -lt 0 -or $request.x -ge $bounds.Width -or $request.y -ge $bounds.Height) { throw 'Click is outside the current screenshot.' }
  [RelayComputer]::SetCursorPos([int]$request.x + $bounds.Left, [int]$request.y + $bounds.Top) | Out-Null
  [RelayComputer]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
  [RelayComputer]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
}
elseif ($request.action -eq 'type') {
  $literal = [string]$request.text
  if ($literal.Length -gt 4000) { throw 'Text input limit is 4000 characters.' }
  $escaped = -join ($literal.ToCharArray() | ForEach-Object { if ('+^%~(){}[]'.Contains($_)) { '{' + $_ + '}' } elseif ($_ -eq "`n") { '{ENTER}' } elseif ($_ -ne "`r") { $_ } })
  [System.Windows.Forms.SendKeys]::SendWait($escaped)
}
elseif ($request.action -eq 'press') {
  $keys = @{ 'enter'='{ENTER}'; 'escape'='{ESC}'; 'tab'='{TAB}'; 'backspace'='{BACKSPACE}'; 'delete'='{DELETE}'; 'up'='{UP}'; 'down'='{DOWN}'; 'left'='{LEFT}'; 'right'='{RIGHT}'; 'ctrl+a'='^a'; 'ctrl+c'='^c'; 'ctrl+v'='^v'; 'ctrl+s'='^s'; 'ctrl+enter'='^{ENTER}'; 'alt+tab'='%{TAB}'; 'alt+f4'='%{F4}' }
  $key = ([string]$request.key).ToLowerInvariant()
  if (-not $keys.ContainsKey($key)) { throw 'Unsupported key combination.' }
  [System.Windows.Forms.SendKeys]::SendWait($keys[$key])
}
elseif ($request.action -eq 'scroll') {
  $delta = [Math]::Min(2000,[Math]::Max(-2000,[int]$request.amount))
  [RelayComputer]::mouse_event(2048,0,0,$delta,[UIntPtr]::Zero)
}
elseif ($request.action -ne 'screenshot') { throw 'Unsupported desktop action.' }
$bitmap = New-Object System.Drawing.Bitmap($bounds.Width,$bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.CopyFromScreen($bounds.Left,$bounds.Top,0,0,$bounds.Size)
  $bitmap.Save([string]$request.output,[System.Drawing.Imaging.ImageFormat]::Png)
} finally { $graphics.Dispose(); $bitmap.Dispose() }
@{ action=$request.action; width=$bounds.Width; height=$bounds.Height; originX=$bounds.Left; originY=$bounds.Top; screenshot=[string]$request.output; actual=$true } | ConvertTo-Json -Compress
