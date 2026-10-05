param(
    [Parameter(Mandatory = $true)][string]$Code
)

$scriptPath = Join-Path $PSScriptRoot "penpot-mcp.ps1"
$argsObj = @{ code = $Code }
& $scriptPath -Tool execute_code -Args $argsObj
