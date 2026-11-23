;; Uninstall extras. Neither runs on updates, where the old version's uninstaller runs too.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    ;; The "Start at login" entry from Electron's setLoginItemSettings (name "Tributary", see electron/main.cjs).
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Tributary"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "Tributary"

    ;; Your data: inboxes, encrypted passwords and sign-in tokens, rules, cached mail, sign-in keys (.env).
    ;; Kept unless you say so, so reinstalling picks up where you left off. Silent uninstalls (/S) keep it.
    SetShellVarContext current
    ${if} ${FileExists} "$APPDATA\Tributary\*.*"
      MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 \
        "Also delete your Tributary data?$\r$\n$\r$\nThis removes your inboxes, saved passwords and sign-in tokens, rules, cached mail and sign-in keys from this PC:$\r$\n$APPDATA\Tributary$\r$\n$\r$\nYour email itself stays with your providers. Choose No to keep it for a reinstall." \
        /SD IDNO IDNO keepData
        RMDir /r "$APPDATA\Tributary"
      keepData:
    ${endIf}
  ${endIf}
!macroend
