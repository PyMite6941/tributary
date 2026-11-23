;; Remove the "Start at login" entry Electron's setLoginItemSettings wrote (name "Tributary", see electron/main.cjs).
;; Skipped on updates, where the uninstaller runs too but the setting should survive.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Tributary"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "Tributary"
  ${endIf}
!macroend
