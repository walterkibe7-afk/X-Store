$scriptPath = Join-Path $PSScriptRoot "penpot-mcp.ps1"

$code = @'
const pages = penpot.pages.map(p => ({
  id: p.id,
  name: p.name
}));
const boards = penpot.currentPage.findShapes(sh => sh.type === 'board').map(b => ({
  id: b.id,
  name: b.name,
  x: b.x,
  y: b.y,
  width: b.width,
  height: b.height,
  childCount: b.children ? b.children.length : 0
}));
return JSON.stringify({ pages, currentPage: penpot.currentPage.name, boards }, null, 2);
'@

& $scriptPath -Tool execute_code -Args @{ code = $code }
