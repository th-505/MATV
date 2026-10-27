import os
import sys
import subprocess

# الحد الأقصى المسموح به لحجم أي ملف واحد بالميجابايت
MAX_FILE_SIZE_MB = 2.0

# الامتدادات الممنوع وجودها داخل المستودع
FORBIDDEN_EXTENSIONS = ['.zip', '.rar', '.7z', '.symbols', '.bak']

# المجلدات التي نتجاهل فحصها مثل مجلد git الداخلي
IGNORED_DIRS = {'.git', 'node_modules', '.dart_tool', 'tmp', '.gemini'}

def check_repository(root_path="."):
    """
    دالة تقوم بالمرور على جميع ملفات المشروع للتأكد من خلوها
    من الملفات المضغوطة أو الملفات التي تتجاوز الحجم المسموح.
    """
    errors = []
    print("🔍 جاري فحص نظافة وسلامة ملفات المشروع...")

    files = subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=root_path).decode().split('\0')
    for relative in files:
        if not relative: continue
        filepath=os.path.join(root_path,relative)
        filename=os.path.basename(filepath)
        if not os.path.isfile(filepath): continue
        for ext in FORBIDDEN_EXTENSIONS:
            if filename.endswith(ext): errors.append(f"❌ ملف ممنوع ({ext}): {filepath}")
        if 'thmanyah' in relative.lower() and filename.lower().endswith(('.otf','.ttf','.woff','.woff2')):
            errors.append(f"❌ ملف خط خاص ممنوع النشر: {filepath}")
        size_mb=os.path.getsize(filepath)/(1024*1024)
        if size_mb>MAX_FILE_SIZE_MB and not(filename.endswith('.wasm') or filename=='main.dart.js'):
            errors.append(f"⚠️ ملف ضخم جداً ({size_mb:.2f} MB): {filepath}")

    # عرض النتيجة النهائية للمبرمج
    if errors:
        print("\n🚨 تم العثور على مشاكل يجب إصلاحها قبل الرفع إلى GitHub:")
        for err in errors:
            print("  " + err)
        sys.exit(1)
    else:
        print("✅ ممتاز يا شرقاوي! المشروع نظيف وجاهز للرفع على GitHub.")
        sys.exit(0)

if __name__ == "__main__":
    check_repository()
