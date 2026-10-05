// Step 1: List existing pages in the Penpot file
const pages = penpot.currentFile.pages;
const info = pages.map(p => p.name);
return JSON.stringify(info);
