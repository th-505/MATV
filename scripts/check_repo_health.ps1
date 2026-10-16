# check_repo_health.ps1 - Windows PowerShell Health Check
$MaxFileSizeMB = 2.0
$ForbiddenExtensions = @('.zip', '.rar', '.7z', '.symbols', '.bak')
$IgnoredDirs = @('.git', 'node_modules', '.dart_tool', 'tmp', '.gemini')

Write-Host "Scanning repository files for bloat and forbidden files..." -ForegroundColor Cyan

$errors = @()
$files = Get-ChildItem -Path . -Recurse -File

foreach ($file in $files) {
    $skip = $false
    foreach ($dir in $IgnoredDirs) {
        if ($file.FullName -like "*\$dir\*") {
            $skip = $true
            break
        }
    }
    if ($skip) { continue }

    # 1. Check forbidden extensions
    foreach ($ext in $ForbiddenExtensions) {
        if ($file.Name.EndsWith($ext)) {
            $errors += "[FORBIDDEN EXTENSION] ($ext): $($file.FullName)"
        }
    }

    # 2. Check file size
    $sizeMB = $file.Length / (1024 * 1024)
    if ($sizeMB -gt $MaxFileSizeMB -and -not ($file.Name.EndsWith('.wasm') -or $file.Name -eq 'main.dart.js')) {
        $formatted = "{0:N2}" -f $sizeMB
        $errors += "[EXCESSIVE SIZE] ($formatted MB): $($file.FullName)"
    }
}

if ($errors.Count -gt 0) {
    Write-Host "`n[ALERT] Found issues that must be resolved before pushing to GitHub:" -ForegroundColor Red
    foreach ($err in $errors) {
        Write-Host "  $err" -ForegroundColor Yellow
    }
    exit 1
} else {
    Write-Host "`n[SUCCESS] Repository is clean and ready for GitHub push!" -ForegroundColor Green
    exit 0
}
