# =========================================================
# سكربت فحص ومزامنة التعديلات مع GitHub
# المتغيرات القابلة للتعديل:
# $CommitMessage : نص الرسالة التي توضح ما قمت بإنجازه
# $BranchName    : اسم الفرع الرئيسي في المستودع (غالباً main)
# =========================================================

$CommitMessage = "chore: clean repo bloat, remove symbols/zip, and unify MA TV branding"
$BranchName = "main"

# التحقق من توفر أداة git وتحديد مسارها إن لم تكن في متغيرات البيئة
$gitExecutable = "git"
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    $desktopGit = Get-ChildItem "C:\Users\*\AppData\Local\GitHubDesktop\app-*\resources\app\git\cmd\git.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
    if ($desktopGit) {
        $gitExecutable = $desktopGit
    } else {
        Write-Host "[خطأ] لم يتم العثور على أداة git في مسار النظام أو GitHub Desktop!" -ForegroundColor Red
        exit 1
    }
}

function Invoke-Git {
    & $gitExecutable @args
}

Write-Host "1. جاري تشغيل فحص سلامة المستودع أولاً..." -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File .\scripts\check_repo_health.ps1

# التحقق مما إذا كان الفحص قد نجح (رمز الخروج 0 يعني نجاح)
if ($LASTEXITCODE -ne 0) {
    Write-Host "[خطأ] أوقفنا الرفع لأن المستودع لا يزال يحتوي على ملفات مخالفة!" -ForegroundColor Red
    exit 1
}

Write-Host "2. جاري تسجيل جميع التعديلات والملفات المحذوفة في Git..." -ForegroundColor Cyan
# الخيار -A يخبر Git بتسجيل الملفات الجديدة والمعدلة والمحذوفة معاً
Invoke-Git add -A

Write-Host "3. عرض حالة الملفات التي سيتم رفعها:" -ForegroundColor Yellow
Invoke-Git status --short

Write-Host "4. جاري حفظ التعديلات (Commit)..." -ForegroundColor Cyan
Invoke-Git commit -m "$CommitMessage"

Write-Host "5. جاري رفع التحديثات إلى GitHub (Push)..." -ForegroundColor Cyan
Invoke-Git push origin $BranchName

Write-Host "[تم بنجاح] تم رفع جميع إصلاحاتك إلى GitHub يا شرقاوي!" -ForegroundColor Green
