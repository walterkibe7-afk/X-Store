<#
.SYNOPSIS
    Push X-store design to Penpot via MCP execute_code.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Invoke-PenpotCode {
    param([string]$Code)
    & "$scriptDir\penpot-mcp.ps1" -Tool 'execute_code' -Args @{ code = $Code }
}

# Step 1: List existing pages
$listCode = @'
const pages = penpot.currentFile.pages;
const info = pages.map(p => p.name);
return JSON.stringify(info);
'@

Invoke-PenpotCode $listCode
