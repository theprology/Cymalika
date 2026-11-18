$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
    $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
    Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, WindowsBase, System.Windows.Forms
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CipherWindow {
  public delegate bool EnumProc(IntPtr hwnd, IntPtr parameter);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr parameter);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
  public struct Point { public int X, Y; }
  public struct Rect { public int Left, Top, Right, Bottom; }
}
'@
    function App-Identity($process) { return "$($process.Id):$($process.StartTime.ToUniversalTime().Ticks)" }
    function Running-Apps {
        $result = New-Object System.Collections.Generic.List[object]
        $callback = [CipherWindow+EnumProc]{ param($handle, $parameter)
            if ([CipherWindow]::IsWindowVisible($handle)) {
                [uint32]$targetPid = 0
                [void][CipherWindow]::GetWindowThreadProcessId($handle, [ref]$targetPid)
                if ($targetPid -ne $request.ownPid) {
                    try {
                        $process = Get-Process -Id $targetPid -ErrorAction Stop
                        $element = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
                        $name = $element.Current.Name
                        if ($name) { $result.Add([pscustomobject]@{id=(App-Identity $process); name="$($process.ProcessName) - $name"; handle=$handle.ToInt64(); pid=$targetPid}) }
                    } catch { }
                }
            }
            return $true
        }
        [void][CipherWindow]::EnumWindows($callback, [IntPtr]::Zero)
        return $result.ToArray()
    }
    $operation = $request.operation
    if ($operation -eq 'status') {
        $result = @{accessibility=$true; screenRecording=$true; detail='Windows UI Automation. Protected and elevated windows require their normal OS permissions.'}
    } elseif ($operation -eq 'apps') {
        $result = @(Running-Apps | Group-Object id | ForEach-Object { @{id=$_.Group[0].id; name=$_.Group[0].name} })
    } else {
        $app = @(Running-Apps | Where-Object {$_.id -eq $request.app}) | Select-Object -First 1
        if (-not $app) { throw 'The allowed app exited or restarted. Choose it again in Access.' }
        $handle = [IntPtr][long]$app.handle
        $root = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
        $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
        function Element-Locator($element) {
            return @{runtime=($element.GetRuntimeId() -join '.'); name=$element.Current.Name; role=$element.Current.ControlType.ProgrammaticName}
        }
        function Find-Element($locator) {
            $queue = New-Object System.Collections.Generic.Queue[object]
            $queue.Enqueue($root); $visited = 0
            while ($queue.Count -gt 0 -and $visited -lt 350) {
                $node = $queue.Dequeue(); $visited++
                $current = Element-Locator $node
                if ($current.runtime -eq $locator.runtime -and $current.name -eq $locator.name -and $current.role -eq $locator.role) {
                    if ($node.Current.IsPassword -or $node.Current.ProcessId -ne $app.pid) { throw 'Secure or unrelated element.' }
                    return $node
                }
                $child = $walker.GetFirstChild($node)
                while ($null -ne $child -and $queue.Count -lt 350) { $queue.Enqueue($child); $child = $walker.GetNextSibling($child) }
            }
            throw 'The element changed. Inspect the app again.'
        }
        if ($operation -eq 'read') {
            $rows = New-Object System.Collections.Generic.List[object]
            $queue = New-Object System.Collections.Generic.Queue[object]
            $queue.Enqueue(@{node=$root; depth=0}); $visited = 0
            $warnings=New-Object System.Collections.Generic.List[string]
            while ($queue.Count -gt 0 -and $visited -lt 350 -and $rows.Count -lt 120) {
                $item = $queue.Dequeue(); $node=$item.node; $visited++
                try {
                    if ($node.Current.IsPassword) { $rows.Add(@{role='secure field';label='[redacted]'}); continue }
                    $role=$node.Current.ControlType.ProgrammaticName
                    if (-not $request.include_menus -and $role -eq 'ControlType.MenuBar') { continue }
                    $value=''; $editable=$false; $actions=@(); $pattern=$null
                    if ($node.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern,[ref]$pattern)) {
                        $value=$pattern.Current.Value; $editable=-not $pattern.Current.IsReadOnly
                    } elseif ($node.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern,[ref]$pattern)) { $value=$pattern.DocumentRange.GetText(1200) }
                    if ($node.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$pattern)) { $actions=@('press') }
                    $name=$node.Current.Name
                    if ($name -or $value -or $editable -or $actions.Count) {
                        $rows.Add(@{id=[string]$rows.Count; role=$role;label=([string]$name).Substring(0,[Math]::Min(220,([string]$name).Length));value=([string]$value).Substring(0,[Math]::Min(1200,([string]$value).Length));editable=$editable;actions=$actions;depth=$item.depth;locator=(Element-Locator $node)})
                    }
                    if ($item.depth -lt 14) {
                        $child=$walker.GetFirstChild($node)
                        while ($null -ne $child -and $queue.Count -lt 350) { $queue.Enqueue(@{node=$child;depth=($item.depth+1)});$child=$walker.GetNextSibling($child) }
                    }
                } catch { if ($warnings.Count -lt 5) { $warnings.Add($_.Exception.Message) } }
            }
            $result=@{app=$request.app;warnings=@($warnings.ToArray());elements=@($rows.ToArray());truncated=($visited -ge 350 -or $rows.Count -ge 120)}
        } elseif ($operation -eq 'window') { $result=@{window=[string]$app.handle} }
        elseif ($operation -in @('press','set_text')) {
            $element = Find-Element $request.locator
            if ($operation -eq 'press') { $element.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke() }
            else { $element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue([string]$request.text) }
            $result=@{status='performed';operation=$operation;app=$request.app}
        } else {
            if (-not [CipherWindow]::SetForegroundWindow($handle)) { throw 'Windows did not focus the allowed window. Activate it manually.' }
            Start-Sleep -Milliseconds 120
            if ([CipherWindow]::GetForegroundWindow() -ne $handle) { throw 'Another window is active. No input was sent.' }
            if ($operation -eq 'click') {
                if ($null -eq $request.x -or $null -eq $request.y) { throw 'Click coordinates are required.' }
                $rect=New-Object CipherWindow+Rect
                [void][CipherWindow]::GetWindowRect($handle,[ref]$rect)
                $x=[int]$request.x;$y=[int]$request.y
                if ($x -lt $rect.Left -or $x -ge $rect.Right -or $y -lt $rect.Top -or $y -ge $rect.Bottom) { throw 'Click must be inside the allowed window.' }
                $point=New-Object CipherWindow+Point;$point.X=$x;$point.Y=$y
                $under=[CipherWindow]::GetAncestor([CipherWindow]::WindowFromPoint($point),2)
                if ($under -ne $handle) { throw 'Another window covers this point. No click was sent.' }
                [void][CipherWindow]::SetCursorPos($x,$y)
                [CipherWindow]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[CipherWindow]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
            } elseif ($operation -eq 'key') {
                $keys=@{return='{ENTER}';tab='{TAB}';escape='{ESC}';backspace='{BACKSPACE}';left='{LEFT}';right='{RIGHT}';up='{UP}';down='{DOWN}';a='a';c='c';v='v';s='s';z='z';l='l';w='w'}
                $mods=@{control='^';shift='+';option='%';alt='%'}
                $key=$keys[[string]$request.key]
                if (-not $key) { throw 'Unsupported key.' }
                $prefix=''
                foreach ($modifier in $request.modifiers) { if (-not $mods.ContainsKey($modifier)) { throw 'Unsupported modifier.' };$prefix+=$mods[$modifier] }
                [System.Windows.Forms.SendKeys]::SendWait($prefix+$key)
            } elseif ($operation -eq 'scroll') {
                $amount=[Math]::Max(-20,[Math]::Min(20,[int]$request.amount))
                $rect=New-Object CipherWindow+Rect;[void][CipherWindow]::GetWindowRect($handle,[ref]$rect)
                [void][CipherWindow]::SetCursorPos($rect.Left+30,$rect.Top+30)
                [CipherWindow]::mouse_event(0x800,0,0,$amount*120,[UIntPtr]::Zero)
            } elseif ($operation -ne 'activate') { throw 'Use set_text on an inspected editable field for Windows text entry.' }
            $result=@{status='performed';operation=$operation;app=$request.app}
        }
    }
    ConvertTo-Json -InputObject $result -Depth 30 -Compress
} catch { ConvertTo-Json -InputObject @{error=$_.Exception.Message} -Compress }
