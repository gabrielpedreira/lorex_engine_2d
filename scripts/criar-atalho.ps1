# Cria o atalho "Lorex Engine 2D" na área de trabalho, com o ícone da engine.
# Uso (uma vez, dentro da pasta lorex_engine_2d):
#   powershell -ExecutionPolicy Bypass -File scripts\criar-atalho.ps1
$pasta = Split-Path -Parent $PSScriptRoot
$areaDeTrabalho = [Environment]::GetFolderPath('Desktop')
$destino = Join-Path $areaDeTrabalho 'Lorex Engine 2D.lnk'

$shell = New-Object -ComObject WScript.Shell
$atalho = $shell.CreateShortcut($destino)
$atalho.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$atalho.Arguments = '"' + (Join-Path $pasta 'iniciar.vbs') + '"'
$atalho.WorkingDirectory = $pasta
$atalho.IconLocation = (Join-Path $pasta 'public\marca\icone.ico') + ',0'
$atalho.Description = 'Abrir a Lorex Engine 2D'
$atalho.Save()

Write-Output "Atalho criado: $destino"
