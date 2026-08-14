; Custom NSIS installer script for Better Skill Recorder
; Adds a progress bar during file extraction

!include "MUI2.nsh"
!include "nsDialogs.nsh"

; Show installation progress details by default
ShowInstDetails show
ShowUninstDetails show

; Override the instfiles page to show a detailed progress bar
!macro customInstall
  DetailPrint "Installation complete."
!macroend
