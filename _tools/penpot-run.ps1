<#
.SYNOPSIS
    Runs a JavaScript file against the Penpot MCP execute_code tool.
.PARAMETER JsFile
    Path to a .js file whose contents will be sent as `code`.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$JsFile
)
$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$code = Get-Content -LiteralPath $JsFile -Raw -Encoding UTF8
& "$scriptDir\penpot-mcp.ps1" -Tool 'execute_code' -Args @{ code = $code }
