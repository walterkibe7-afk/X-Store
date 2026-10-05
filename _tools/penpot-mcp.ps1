<#
.SYNOPSIS
    Minimal read/write MCP client for the Penpot remote MCP server.

.DESCRIPTION
    Performs the MCP "initialize" handshake against the Penpot remote MCP
    server, then calls a single tool and prints its result.

    The server URL (which embeds the userToken) is read at runtime from
    Cline's MCP settings, so no secret is stored in this file.

    Available tools on the remote server:
      high_level_overview   - read first (instructions + Penpot API overview)
      penpot_api_info       - Penpot API docs, e.g. -Args @{ type = 'Board' }
      export_shape          - export a shape/page to PNG or SVG (read only)
      execute_code          - run JS in the Penpot plugin context (MODIFIES the file)

.PARAMETER Tool
    Tool name to call.

.PARAMETER Args
    Hashtable of tool arguments, e.g. -Args @{ type = 'Board'; member = 'children' }

.PARAMETER ServerName
    Key of the server in cline_mcp_settings.json. Default: 'Pen Pot'

.PARAMETER SettingsPath
    Path to cline_mcp_settings.json. Default: Cline's global settings file.

.EXAMPLE
    ./penpot-mcp.ps1 -Tool high_level_overview

.EXAMPLE
    ./penpot-mcp.ps1 -Tool penpot_api_info -Args @{ type = 'Board' }
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Tool,
    [hashtable]$Args = @{},
    [string]$ServerName = 'Pen Pot',
    [string]$SettingsPath = (Join-Path $env:USERPROFILE '.cline\data\settings\cline_mcp_settings.json'),

    # When a tool returns image content (e.g. export_shape), decode the base64
    # payload and write it to this path. Omit to just print the byte size.
    [string]$OutImage
)

$ErrorActionPreference = 'Stop'

# Print non-ASCII (★ ♡ © ’) correctly instead of console-codepage mojibake.
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

function Get-McpServerUrl {
    param([string]$Path, [string]$Name)
    if (-not (Test-Path -LiteralPath $Path)) { throw "MCP settings file not found: $Path" }
    $cfg = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    $srv = $cfg.mcpServers.$Name
    if (-not $srv) {
        $keys = ($cfg.mcpServers.PSObject.Properties.Name) -join ', '
        throw "Server '$Name' not found in $Path. Available servers: $keys"
    }
    if (-not $srv.url) { throw "Server '$Name' defines no url (stdio server?)" }
    return $srv.url
}

function ConvertFrom-SseBody {
    param([string]$Body)
    $msgs = @()
    foreach ($line in ($Body -split "`r?`n")) {
        if ($line.StartsWith('data:')) {
            $payload = $line.Substring(5).Trim()
            if ($payload) { $msgs += ($payload | ConvertFrom-Json) }
        }
    }
    return $msgs
}

# PowerShell 5.1 decodes text/event-stream bodies as ISO-8859-1 when the server
# omits a charset, which turns UTF-8 characters into mojibake (star -> "âââââ").
# Re-read the raw bytes as UTF-8 so non-ASCII content is reported accurately.
function Get-Utf8Body {
    param($Response)
    try {
        $ms = $Response.RawContentStream
        if ($ms) {
            $ms.Position = 0
            $reader = New-Object System.IO.StreamReader($ms, [Text.Encoding]::UTF8)
            $text = $reader.ReadToEnd()
            $reader.Dispose()
            return $text
        }
    } catch { }
    return $Response.Content
}

$url = Get-McpServerUrl -Path $SettingsPath -Name $ServerName
Write-Verbose "Endpoint host: $([Uri]$url | Select-Object -ExpandProperty Host)"

$headers = @{
    'Accept'       = 'application/json, text/event-stream'
    'Content-Type' = 'application/json'
}

# 1) initialize -> capture session id
$initBody = @{
    jsonrpc = '2.0'
    id      = 1
    method  = 'initialize'
    params  = @{
        protocolVersion = '2025-06-18'
        capabilities    = @{}
        clientInfo      = @{ name = 'penpot-mcp.ps1'; version = '1.0' }
    }
} | ConvertTo-Json -Depth 10 -Compress

$resp = Invoke-WebRequest -Uri $url -Method Post -Headers $headers -Body $initBody -UseBasicParsing
$sessionId = $resp.Headers['mcp-session-id']
if ($sessionId -is [array]) { $sessionId = $sessionId[0] }

$initMsg = (ConvertFrom-SseBody (Get-Utf8Body $resp) | Where-Object { $_.id -eq 1 } | Select-Object -First 1)
Write-Verbose ("Connected to {0} v{1}" -f $initMsg.result.serverInfo.name, $initMsg.result.serverInfo.version)

if ($sessionId) { $headers['mcp-session-id'] = $sessionId }

# 2) initialized notification
$noteBody = @{ jsonrpc = '2.0'; method = 'notifications/initialized' } | ConvertTo-Json -Compress
Invoke-WebRequest -Uri $url -Method Post -Headers $headers -Body $noteBody -UseBasicParsing | Out-Null

# 3) tools/call
$callBody = @{
    jsonrpc = '2.0'
    id      = 2
    method  = 'tools/call'
    params  = @{ name = $Tool; arguments = $Args }
} | ConvertTo-Json -Depth 10 -Compress

$callResp = Invoke-WebRequest -Uri $url -Method Post -Headers $headers -Body $callBody -UseBasicParsing
$result = (ConvertFrom-SseBody (Get-Utf8Body $callResp) | Where-Object { $_.id -eq 2 } | Select-Object -First 1)

if (-not $result) { throw "No result returned for tool '$Tool'." }
if ($result.error) { throw ("Tool error {0}: {1}" -f $result.error.code, $result.error.message) }

$payload = $result.result
if ($payload.isError) { Write-Warning "Server reported a tool error." }

foreach ($part in $payload.content) {
    switch ($part.type) {
        'text' { Write-Output $part.text }
        'image' {
            $bytes = [Convert]::FromBase64String($part.data)
            if ($OutImage) {
                $full = [IO.Path]::GetFullPath($OutImage)
                $dir = [IO.Path]::GetDirectoryName($full)
                if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
                [IO.File]::WriteAllBytes($full, $bytes)
                Write-Output ("Saved {0} image ({1} bytes) -> {2}" -f $part.mimeType, $bytes.Length, $full)
            } else {
                Write-Output ("[image {0}, {1} bytes - pass -OutImage <path> to save it]" -f $part.mimeType, $bytes.Length)
            }
        }
        default { Write-Output ("[{0} content]" -f $part.type) }
    }
}