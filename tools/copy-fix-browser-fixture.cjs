// Local-only browser acceptance fixture. Optional --live takes a temporary DOM
// capture; the capture and its copied contents must never be checked into Git.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const liveIndex = process.argv.indexOf('--live');
const liveFile = liveIndex >= 0 ? process.argv[liveIndex + 1] : null;
const source = fs.readFileSync(path.join(root, 'scripts/chatgpt-copy-fix.user.js'), 'utf8');
const sample = `<div data-turn-key="sample"><div data-content-search-turn-key="sample">
<div data-markdown-text-style="assistant-message"><h2>Markdown / LaTeX</h2>
<p>Inline <span data-math-source="x^2" data-math-display="false"><span class="katex">x²</span></span>.</p>
<span data-math-source="\\frac{a}{b} =\n c" data-math-display="true"><span class="katex"><span class="katex-html"><span id="partial">a/b = c</span></span></span></span>
<ul><li>Parent<ul><li>Child</li></ul></li><li>Next</li></ul>
<div class="tableWrapper-new"><table><tr><th>Key</th><th>Value</th></tr><tr><td>A|B</td><td><span data-math-source="x">x</span></td></tr></table><button aria-label="复制表格">复制表格</button></div>
<pre><code class="language-html">&lt;div&gt;\n    &lt;span&gt;hello&lt;/span&gt;\n&lt;/div&gt;</code><button aria-label="复制代码">复制代码（原生）</button></pre>
</div><div class="turn-action-controls"><button aria-label="复制">复制</button></div></div></div>`;

function body(mode) {
    const dom = new JSDOM(mode === 'live' && liveFile ? fs.readFileSync(liveFile, 'utf8') : sample);
    for (const node of dom.window.document.querySelectorAll('script,style')) node.remove();
    const html = dom.window.document.body.innerHTML;
    dom.window.close();
    return html;
}

function document(mode) {
    return `<!doctype html><html lang="zh"><meta charset="utf-8"><title>ChatGPT Copy Fix 浏览器验收</title>
<style>body{font:16px/1.6 system-ui;margin:24px auto;max-width:900px;color:#172330;background:#f5f7fa}header,main,aside{background:white;padding:20px;border:1px solid #d9e1e8;border-radius:8px;margin:12px 0}button,a{margin:4px;padding:6px 10px}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:6px}.katex-mathml{display:none}[data-math-display="true"]{display:block;margin:12px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eef2f6;padding:12px}#status{color:#17633b;font-weight:600}svg{width:18px;height:18px}</style>
<header><h1>ChatGPT Copy Fix 3.4.11</h1><p>${mode === 'live' ? '当前 ChatGPT 回复的真实 DOM 副本（仅本地）' : '新版 DOM：公式、表格、代码与嵌套列表'}</p>
<a href="/">结构测试</a><a href="/live">真实 DOM 测试</a><button id="select-all">选择整段回复</button><button id="select-math">选择公式局部</button><div id="status">等待复制验证</div></header>
<main id="fixture">${body(mode)}</main><aside><h2>剪贴板实际写入</h2><pre id="result">点击回复的“复制”按钮。</pre></aside>
<script>
const nativeWrite = navigator.clipboard.writeText.bind(navigator.clipboard);
navigator.clipboard.writeText = async text => { await nativeWrite(text); document.getElementById('result').textContent = text; document.getElementById('status').textContent = '复制成功 · ' + text.length + ' 字符 · ' + (text.match(/\\$\\$[^\\n]*?\\$\\$/g)||[]).length + ' 个展示公式'; };
document.getElementById('select-all').onclick = () => { const r=document.createRange();r.selectNodeContents(document.querySelector('[data-markdown-text-style="assistant-message"]'));const s=getSelection();s.removeAllRanges();s.addRange(r);document.getElementById('status').textContent='整段已选中，请按 Ctrl+C / Cmd+C'; };
document.getElementById('select-math').onclick = () => { const n=document.querySelector('[data-math-display="true"] .katex-html span:last-child');if(!n)return;const walker=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);const text=walker.nextNode();if(!text)return;const r=document.createRange();r.setStart(text,0);r.setEnd(text,Math.min(1,text.length));const s=getSelection();s.removeAllRanges();s.addRange(r);document.getElementById('status').textContent='公式局部已选中，请按 Ctrl+C / Cmd+C'; };
</script><script src="/copy-fix.js"></script></html>`;
}

const server = http.createServer((req, res) => {
    if (req.url === '/copy-fix.js') { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }); res.end(source); }
    else if (req.url === '/' || req.url === '/live') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(document(req.url === '/live' ? 'live' : 'sample')); }
    else { res.writeHead(404); res.end('Not found'); }
});
server.listen(18367, '127.0.0.1', () => console.log('Copy fixture ready: http://127.0.0.1:18367'));
