' Abre a Lorex Engine 2D sem janela de terminal (o atalho da area de trabalho aponta para este arquivo).
' A saida fica em lorex.log, nesta pasta, para conferir se algo der errado.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run "cmd /c node scripts\iniciar.cjs > lorex.log 2>&1", 0, False
