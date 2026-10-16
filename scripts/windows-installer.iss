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
AppName=MA TV
AppVersion={#AppVersion}
AppPublisher=MA TV
DefaultDirName={localappdata}\Programs\MA TV
DefaultGroupName=MA TV
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
Name: "{autoprograms}\MA TV"; Filename: "{app}\mitv.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\MA TV"; Filename: "{app}\mitv.exe"; WorkingDir: "{app}"; Tasks: desktopicon
[Run]
Filename: "{app}\mitv.exe"; Description: "Launch MA TV"; Flags: nowait postinstall skipifsilent
