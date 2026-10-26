#ifndef AppVersion
  #define AppVersion "1.0.44"
#endif
#ifndef SourceRoot
  #define SourceRoot "..\flutter_app\build\windows\x64\runner\Release"
#endif
#ifndef OutputRoot
  #define OutputRoot "..\trial"
#endif
[Setup]
AppId={{49F9B50D-B1EE-49BD-BEBE-EF6FF8B6DE5B}
AppName=T-A-TV
AppVersion={#AppVersion}
AppPublisher=T-A-TV
DefaultDirName={localappdata}\Programs\T-A-TV
DefaultGroupName=T-A-TV
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputRoot}
OutputBaseFilename=MA-TV-Windows-x64-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile=..\flutter_app\windows\runner\resources\app_icon.ico
UninstallDisplayIcon={app}\mitv.exe
[Files]
Source: "{#SourceRoot}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Tasks]
Name: desktopicon; Description: "Create a desktop shortcut"; Flags: unchecked
[Icons]
Name: "{autoprograms}\T-A-TV"; Filename: "{app}\mitv.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\T-A-TV"; Filename: "{app}\mitv.exe"; WorkingDir: "{app}"; Tasks: desktopicon
[Run]
Filename: "{app}\mitv.exe"; Description: "Launch T-A-TV"; Flags: nowait postinstall skipifsilent
