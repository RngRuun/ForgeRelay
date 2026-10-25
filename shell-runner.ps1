$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
$relayInput = [Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type @'
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
public static class RelayProcessJob {
  [StructLayout(LayoutKind.Sequential)] struct Basic {
    public long ProcessTime, JobTime; public uint Flags;
    public UIntPtr MinWorkingSet, MaxWorkingSet; public uint ActiveProcesses;
    public UIntPtr Affinity; public uint PriorityClass, SchedulingClass;
  }
  [StructLayout(LayoutKind.Sequential)] struct Io { public ulong ROp, WOp, OOp, RBytes, WBytes, OBytes; }
  [StructLayout(LayoutKind.Sequential)] struct Extended {
    public Basic Basic; public Io Io;
    public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
  }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attrs, string name);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int kind, ref Extended info, uint size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  public static IntPtr Handle;
  public static void Initialize(int parentPid) {
    Handle=CreateJobObject(IntPtr.Zero,null);
    if(Handle==IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
    var info=new Extended();info.Basic.Flags=0x2000;
    if(!SetInformationJobObject(Handle,9,ref info,(uint)Marshal.SizeOf(typeof(Extended)))) throw new Win32Exception(Marshal.GetLastWin32Error());
    if(!AssignProcessToJobObject(Handle,GetCurrentProcess())) throw new Win32Exception(Marshal.GetLastWin32Error());
    if(parentPid>0) {
      var parent=Process.GetProcessById(parentPid);
      // Hold the real parent handle so PID reuse cannot keep an orphan alive.
      var parentHandle=parent.Handle;
      var watcher=new Thread(()=>{try{parent.WaitForExit();}finally{Environment.Exit(0);}});
      watcher.IsBackground=true;watcher.Start();
    }
  }
}
'@
[RelayProcessJob]::Initialize([int]$relayInput.parentPid)
[Console]::Error.WriteLine('__RELAY_PROCESS_READY__')
$global:LASTEXITCODE = 0
try {
  & ([scriptblock]::Create([string]$relayInput.command))
  $relayCommandSucceeded = $?
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  if (-not $relayCommandSucceeded) { exit 1 }
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
