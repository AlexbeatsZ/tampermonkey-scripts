const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const script = fs.readFileSync(path.join(__dirname, '../scripts/chatgpt-copy-fix.user.js'), 'utf8');
const toolbar = '<div class="turn-action-controls"><button aria-label="复制"><span>Copy</span></button></div>';
const currentTurn = (body, extra = '') => `<div data-turn-key="one"><div data-markdown-text-style="user-message">USER ONLY</div><div data-content-search-turn-key="one"><div data-markdown-text-style="assistant-message">${body}</div>${extra}${toolbar}</div></div>`;

function page(html) {
    const dom = new JSDOM(html, { url: 'https://chatgpt.com/c/test', runScripts: 'outside-only', pretendToBeVisual: true });
    const { window } = dom;
    const writes = [];
    Object.defineProperty(window.navigator, 'clipboard', { value: { async writeText(text) { writes.push(text); } } });
    window.eval(script);
    return { window, document: window.document, writes, close: () => window.close() };
}

function click(p, selector = '.turn-action-controls button') {
    const button = p.document.querySelector(selector);
    const event = new p.window.MouseEvent('click', { bubbles: true, cancelable: true });
    button.dispatchEvent(event);
    return { text: p.writes[0], event };
}

function selectionCopy(p, select) {
    const range = p.document.createRange();
    select(range, p.document);
    const selection = p.window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const data = new Map();
    const event = new p.window.Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { setData(type, value) { data.set(type, value); } } });
    p.document.dispatchEvent(event);
    return { text: data.get('text/plain'), data, event };
}

test('new renderer: reply toolbar copies assistant Markdown and compact LaTeX', () => {
    const p = page(currentTurn('<h2>Result</h2><p>Inline <span data-math-source="x+1" data-math-display="false"><span class="katex">glyph</span></span>.</p><span data-math-source="a =\n b" data-math-display="true"><span class="katex">glyph</span></span>'));
    try {
        const { text, event } = click(p);
        assert.equal(text, '## Result\n\nInline $x+1$.\n$$a = b$$');
        assert.equal(event.defaultPrevented, true);
        assert.doesNotMatch(text, /USER ONLY|glyph|Copy/);
    } finally { p.close(); }
});

test('legacy renderer and test-ID button remain supported', () => {
    const p = page('<article data-testid="conversation-turn-1"><div data-message-author-role="assistant"><div class="markdown"><p>Old <strong>reply</strong>.</p></div></div><button data-testid="copy-turn-action-button"></button></article>');
    try { assert.equal(click(p, 'button').text, 'Old **reply**.'); } finally { p.close(); }
});

test('all assistant segments in one turn are included exactly once', () => {
    const p = page(currentTurn('<p>First.</p>', '<div data-markdown-text-style="assistant-message"><p>Last.</p></div>'));
    try { assert.equal(click(p).text, 'First.\nLast.'); } finally { p.close(); }
});

test('copy is confined to the clicked turn', () => {
    const p = page(currentTurn('<p>First turn.</p>') + currentTurn('<p>Second turn.</p>'));
    try { assert.equal(click(p).text, 'First turn.'); } finally { p.close(); }
});

test('English accessible copy label and clicks on descendants work', () => {
    const p = page(currentTurn('<p>English.</p>').replace('aria-label="复制"', 'aria-label="Copy response"'));
    try { assert.equal(click(p, '.turn-action-controls button span').text, 'English.'); } finally { p.close(); }
});

test('empty reply leaves the native handler available', () => {
    const p = page(currentTurn(''));
    try {
        assert.equal(click(p).event.defaultPrevented, false);
        assert.equal(p.writes.length, 0);
    } finally { p.close(); }
});

test('selection works without old message-role attributes and writes plain text only', () => {
    const p = page(currentTurn('<h3>Selected</h3><p>Value <span data-math-source="x">glyph</span>.</p>'));
    try {
        const { text, data, event } = selectionCopy(p, (range, doc) => range.selectNodeContents(doc.querySelector('[data-markdown-text-style="assistant-message"]')));
        assert.equal(text, '### Selected\n\nValue $x$.');
        assert.equal(event.defaultPrevented, true);
        assert.deepEqual([...data.keys()], ['text/plain']);
    } finally { p.close(); }
});

test('selection inside a rendered glyph expands to the full display source wrapper', () => {
    const p = page(currentTurn('<span data-math-source="\\frac{x}{2}" data-math-display="true"><span class="katex"><span class="katex-html"><span id="glyph">xyz</span></span></span></span>'));
    try {
        const { text } = selectionCopy(p, (range, doc) => { const node = doc.getElementById('glyph').firstChild; range.setStart(node, 1); range.setEnd(node, 2); });
        assert.equal(text, '$$\\frac{x}{2}$$');
    } finally { p.close(); }
});

test('MathML annotation source is emitted once', () => {
    const p = page(currentTurn('<p><span class="katex"><span class="katex-mathml"><math><semantics><mi>x</mi><annotation encoding="application/x-tex">x^2</annotation></semantics></math></span><span class="katex-html">x2</span></span></p>'));
    try { assert.equal(click(p).text, '$x^2$'); } finally { p.close(); }
});

test('tables preserve rows, escapes and formulas through the table copy button', () => {
    const p = page(currentTurn('<div class="tableWrapper-new"><table><thead><tr><th>Key</th><th>Value</th></tr></thead><tbody><tr><td>A|B</td><td><span data-math-source="x">glyph</span><br>next</td></tr></tbody></table><button aria-label="复制表格">Copy table</button></div>'));
    try {
        assert.equal(click(p, '[aria-label="复制表格"]').text, '| Key | Value |\n| --- | --- |\n| A\\|B | $x$<br>next |');
    } finally { p.close(); }
});

test('code copies and generic buttons outside reply toolbars remain native', () => {
    const p = page(currentTurn('<pre><code>hello</code><button aria-label="复制">Code</button></pre><button aria-label="复制">Other</button>') + '<button id="outside" aria-label="Copy">Outside</button>');
    try {
        for (const selector of ['pre button', '[data-markdown-text-style] > button', '#outside']) {
            assert.equal(click(p, selector).event.defaultPrevented, false);
        }
        assert.equal(p.writes.length, 0);
    } finally { p.close(); }
});

test('editable and unrelated selections are not changed', () => {
    const p = page(currentTurn('<div contenteditable="true">draft</div>') + '<p id="outside">other</p>');
    try {
        for (const selector of ['[contenteditable]', '#outside']) {
            const { text, event } = selectionCopy(p, (r, d) => r.selectNodeContents(d.querySelector(selector)));
            assert.equal(text, undefined);
            assert.equal(event.defaultPrevented, false);
        }
    } finally { p.close(); }
});

test('literal HTML, entity text, indentation and blank lines inside code survive', () => {
    const p = page(currentTurn('<pre><code class="language-html">&lt;div&gt;\n    &amp;amp;\n\n\n    &lt;span&gt;x&lt;/span&gt;\n&lt;/div&gt;</code></pre>'));
    try { assert.equal(click(p).text, '```html\n<div>\n    &amp;\n\n\n    <span>x</span>\n</div>\n```'); } finally { p.close(); }
});

test('nested lists retain their indentation', () => {
    const p = page(currentTurn('<ul><li>Parent<ul><li>Child</li></ul></li><li>Next</li></ul>'));
    try { assert.equal(click(p).text, '- Parent\n  - Child\n- Next'); } finally { p.close(); }
});

test('fallback clipboard copy restores focus and selection', async () => {
    const p = page(currentTurn('<p>Copied.</p>') + '<input id="focus" value="draft">');
    try {
        p.window.navigator.clipboard.writeText = async () => { throw new Error('denied'); };
        const input = p.document.getElementById('focus');
        input.focus();
        p.document.execCommand = () => true;
        click(p);
        await new Promise(resolve => setTimeout(resolve, 10));
        assert.equal(p.document.activeElement, input);
        assert.equal(p.document.querySelector('textarea'), null);
    } finally { p.close(); }
});

test('one button click writes once and cannot overwrite a subsequent copy', async () => {
    const p = page(currentTurn('<p>First copy.</p>'));
    try {
        let nativeCalls = 0;
        p.document.querySelector('.turn-action-controls button').addEventListener('click', () => nativeCalls++);
        click(p);
        await p.window.navigator.clipboard.writeText('Later copy.');
        await new Promise(resolve => setTimeout(resolve, 220));
        assert.deepEqual(p.writes, ['First copy.', 'Later copy.']);
        assert.equal(nativeCalls, 0);
    } finally { p.close(); }
});
