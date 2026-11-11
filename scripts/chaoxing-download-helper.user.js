// ==UserScript==
// @name         超星下载助手
// @namespace    local.chaoxing.courseware
// @version      1.1.1
// @description  下载当前章节的 PDF 课件。
// @homepageURL  https://github.com/AlexbeatsZ/tampermonkey-scripts
// @source       https://github.com/AlexbeatsZ/tampermonkey-scripts/blob/main/scripts/chaoxing-download-helper.user.js
// @supportURL   https://github.com/AlexbeatsZ/tampermonkey-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/AlexbeatsZ/tampermonkey-scripts/main/scripts/chaoxing-download-helper.user.js
// @updateURL    https://raw.githubusercontent.com/AlexbeatsZ/tampermonkey-scripts/main/scripts/chaoxing-download-helper.user.js
// @match        https://*.chaoxing.com/*mycourse/studentstudy*
// @match        https://*.chaoxing.com/*mycourse/teacherstudy*
// @match        https://*.chaoxing.com/*screen/*
// @match        https://*.chaoxing.com/ananas/modules/pdf/*
// @grant        GM_download
// @connect      chaoxing.com
// @connect      *.chaoxing.com
// @connect      cldisk.com
// @connect      *.cldisk.com
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(() => {
    'use strict';

    const CHANNEL = 'local-chaoxing-courseware-v2';
    const documentTypes = /^(pdf|pptx?|docx?|xlsx?|txt|rtf|od[pts]|csv|zip|rar|7z)$/i;
    const domainIs = (host, root) => host === root || host.endsWith('.' + root);

    function cleanFilename(value) {
        return String(value || '课件').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_')
            .replace(/[. ]+$/g, '').slice(0, 160) || '课件';
    }

    function readString(body, field) {
        const re = new RegExp('["\x27]' + field + '["\x27]\\s*:\\s*(["\x27])((?:\\\\.|(?!\\1)[\\s\\S])*)\\1');
        const match = body.match(re);
        if (!match) return '';
        return match[2].replace(/\\(u[\da-f]{4}|x[\da-f]{2}|[\\/'"bfnrt])/gi, (_, escape) => {
            if (/^[ux]/i.test(escape)) return String.fromCharCode(parseInt(escape.slice(1), 16));
            return ({ b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' })[escape] ?? escape;
        });
    }

    function parseFileInfo(text) {
        const match = text.match(/\b(?:var|let|const)\s+fileinfo\s*=\s*\{([\s\S]*?)\};/);
        if (!match) return null;
        const body = match[1];
        const id = readString(body, 'objectId');
        if (!id) return null;
        return {
            name: readString(body, 'filename') || readString(body, 'name'),
            suffix: readString(body, 'suffix'), id,
            size: Number(readString(body, 'filesize')) || 0,
        };
    }

    function normalizeAttachment(info) {
        if (!info || !/^[a-f\d]{32}$/i.test(String(info.id || info.objectid || ''))) return null;
        const name = String(info.name || info.filename || '课件');
        const suffix = String(info.suffix || (name.match(/\.([a-z\d]+)$/i) || [])[1] || '').replace(/^\./, '');
        if (suffix && !documentTypes.test(suffix)) return null;
        return { id: String(info.id || info.objectid), name: cleanFilename(name), suffix };
    }

    function normalizeFile(info, baseUrl) {
        // The original-file endpoint and the PDF endpoint are separate resources.
        if (!info || typeof info.pdf !== 'string' || !info.pdf) return null;
        try {
            const url = new URL(info.pdf, baseUrl);
            if (url.protocol !== 'https:' || url.username || url.password ||
                !(domainIs(url.hostname, 'cldisk.com') || domainIs(url.hostname, 'chaoxing.com'))) return null;
            if (!/\.pdf$/i.test(url.pathname)) return null;
            const name = cleanFilename(String(info.filename || info.name || '课件')
                .replace(/\.(?:pdf|pptx?|docx?|xlsx?|txt|rtf|od[pts]|csv|zip|rar|7z)$/i, '')) + '.pdf';
            const pages = Number(info.pagenum);
            return {
                id: String(info.id || info.objectid || url.pathname).slice(0, 200), name, suffix: 'pdf',
                pages: Number.isInteger(pages) && pages > 0 ? pages : 0, url: url.href,
            };
        } catch { return null; }
    }

    // Allow local checks with Node.js without a browser or dependencies.
    if (typeof document === 'undefined') {
        if (typeof module !== 'undefined') module.exports = { cleanFilename, parseFileInfo, normalizeFile, normalizeAttachment };
        return;
    }

    function readCurrentFile() {
        for (const script of document.querySelectorAll('script:not([src])')) {
            const info = parseFileInfo(script.textContent || '');
            if (!info) continue;
            const input = document.querySelector('#fileInfoNameInput');
            info.name = input?.value || input?.textContent || info.name;
            return normalizeAttachment(info);
        }
        return null;
    }

    const isCourse = /\/mycourse\/(studentstudy|teacherstudy)/.test(location.pathname);
    if (window.top !== window) {
        // Run inside every matched preview frame; no cross-origin DOM access is needed.
        let targetOrigin = '';
        const candidates = [...Array.from(location.ancestorOrigins || []).reverse(), document.referrer];
        for (const candidate of candidates) {
            try {
                const url = new URL(candidate);
                if (url.protocol === 'https:' && domainIs(url.hostname, 'chaoxing.com')) {
                    targetOrigin = url.origin;
                    break;
                }
            } catch { /* An empty referrer is harmless. */ }
        }
        if (!targetOrigin) return;
        const send = () => {
            const file = readCurrentFile();
            if (file) window.top.postMessage({ channel: CHANNEL, file }, targetOrigin);
        };
        send();
        setInterval(send, 3000);
        return;
    }

    if (!isCourse) return;
    const files = new Map();
    const shadowHost = document.createElement('div');
    shadowHost.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647';
    document.body.appendChild(shadowHost);
    const ui = shadowHost.attachShadow({ mode: 'closed' });
    ui.innerHTML = `
        <style>
            :host{font:14px/1.5 system-ui,sans-serif;color:#172b3a}button,a{font:inherit}
            button{cursor:pointer;border:0;border-radius:7px;padding:8px 13px;background:#176950;color:white}
            button:disabled{cursor:wait;opacity:.6}#toggle{box-shadow:0 3px 16px #0003}
            #panel{box-sizing:border-box;width:min(420px,calc(100vw - 40px));max-height:65vh;overflow:auto;
                margin-bottom:10px;background:white;border:1px solid #dbe2e5;border-radius:12px;box-shadow:0 6px 30px #0003;padding:18px}
            [hidden]{display:none!important}.heading{display:flex;justify-content:space-between;align-items:center;font-size:17px;font-weight:600}
            #close{background:#edf2f0;color:#172b3a;padding:3px 9px}p{font-size:12px;color:#647681;margin:9px 0}
            .file{padding:13px 0;border-top:1px solid #edf0f2}.name{overflow-wrap:anywhere;font-weight:600}
            .meta{font-size:12px;color:#647681;margin:3px 0 8px}.actions{display:flex;align-items:center;gap:14px}
            a{font-size:12px;color:#176950}.status{font-size:12px;margin-top:6px;color:#647681}
        </style>
        <section id="panel" hidden aria-label="本章课件下载">
            <div class="heading"><span>本章课件 PDF</span><button id="close" aria-label="关闭">×</button></div>
            <div id="list"></div>
        </section>
        <button id="toggle">课件下载 (0)</button>`;
    const panel = ui.querySelector('#panel');
    const list = ui.querySelector('#list');
    const toggle = ui.querySelector('#toggle');
    toggle.onclick = () => { panel.hidden = !panel.hidden; };
    ui.querySelector('#close').onclick = () => { panel.hidden = true; };

    function activeFrames() {
        const sources = new Set();
        const walk = (doc, depth) => {
            if (depth > 6) return;
            for (const frame of doc.querySelectorAll('iframe')) {
                try {
                    if (frame.contentWindow) sources.add(frame.contentWindow);
                    if (frame.contentDocument) walk(frame.contentDocument, depth + 1);
                } catch { /* Its own userscript handles cross-origin preview frames. */ }
            }
        };
        walk(document, 0);
        return sources;
    }

    function render() {
        toggle.textContent = '课件下载 (' + files.size + ')';
        list.replaceChildren();
        if (!files.size) {
            list.textContent = '暂未发现课件，请等待页面加载或刷新页面。';
            return;
        }
        for (const entry of files.values()) {
            const file = entry.file;
            const candidate = entry.candidate;
            const row = document.createElement('div');
            row.className = 'file';
            const title = document.createElement('div');
            title.className = 'name';
            title.textContent = file?.name || candidate.name;
            const meta = document.createElement('div');
            meta.className = 'meta';
            meta.textContent = file ? ['PDF', file.pages ? file.pages + ' 页' : ''].filter(Boolean).join(' · ') : '正在读取 PDF 地址';
            const actions = document.createElement('div');
            actions.className = 'actions';
            const download = document.createElement('button');
            download.textContent = entry.loading ? '正在读取…' : file ? '下载 PDF' : '重试';
            download.disabled = entry.loading;
            const open = document.createElement('a');
            open.textContent = '打开 PDF';
            if (file) open.href = file.url;
            else open.hidden = true;
            open.target = '_blank';
            open.rel = 'noopener noreferrer';
            const status = document.createElement('div');
            status.className = 'status';
            status.textContent = entry.error || '';
            download.onclick = () => {
                const current = files.get(candidate.id);
                if (!current || (current.source !== window && !activeFrames().has(current.source))) {
                    status.textContent = '章节已切换，请使用当前章节的文件。';
                    return;
                }
                if (!current.file) { resolveEntry(current); return; }
                const liveFile = current.file;
                download.disabled = true;
                status.textContent = '正在下载…';
                const fail = () => {
                    download.disabled = false;
                    status.textContent = '直接下载未完成，可点击「打开 PDF」保存。';
                };
                try {
                    GM_download({ url: liveFile.url, name: liveFile.name, saveAs: false, timeout: 120000,
                        onload: () => { download.disabled = false; status.textContent = '下载完成'; },
                        onerror: fail, ontimeout: fail,
                    });
                } catch { fail(); }
            };
            actions.append(download, open);
            row.append(title, meta, actions, status);
            list.appendChild(row);
        }
    }

    async function resolveEntry(entry) {
        entry.loading = true;
        entry.error = '';
        render();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
            const endpoint = new URL('/ananas/status/' + entry.candidate.id, location.origin);
            endpoint.search = new URLSearchParams({ flag: 'normal', _dc: String(Date.now()) }).toString();
            const response = await fetch(endpoint.href, { credentials: 'include', cache: 'no-store', signal: controller.signal });
            if (!response.ok) throw new Error('课件接口返回 HTTP ' + response.status);
            const data = await response.json();
            const file = normalizeFile({ ...data, id: entry.candidate.id, name: entry.candidate.name }, location.origin);
            if (!file) throw new Error('暂未找到 PDF，请稍后重试。');
            if (files.get(entry.candidate.id) === entry) entry.file = file;
        } catch (error) {
            if (files.get(entry.candidate.id) === entry) {
                entry.error = error.name === 'AbortError' ? '读取超时，请重试。' : error.message;
            }
        } finally {
            clearTimeout(timeout);
            entry.loading = false;
            if (files.get(entry.candidate.id) === entry) render();
        }
    }

    function addFile(candidate, source) {
        const existing = files.get(candidate.id);
        if (existing) { existing.source = source; return; }
        const entry = { candidate, source, file: null, loading: true, error: '' };
        files.set(candidate.id, entry);
        resolveEntry(entry);
    }

    function chapterKey() {
        return location.href + '|' + (document.querySelector('#mainid h1')?.textContent || '') +
            '|' + (document.querySelector('iframe#iframe')?.getAttribute('src') || '');
    }
    let currentChapter = chapterKey();
    function syncChapter() {
        const key = chapterKey();
        if (key !== currentChapter) {
            currentChapter = key;
            files.clear();
            render();
        }
    }

    window.addEventListener('message', event => {
        if (event.data?.channel !== CHANNEL || !event.data.file) return;
        try {
            const origin = new URL(event.origin);
            if (origin.protocol !== 'https:' || !domainIs(origin.hostname, 'chaoxing.com')) return;
        } catch { return; }
        if (!activeFrames().has(event.source)) return;
        syncChapter();
        const file = normalizeAttachment(event.data.file);
        if (file) addFile(file, event.source);
    });

    render();
    const ownFile = readCurrentFile();
    if (ownFile) addFile(ownFile, window);
    setInterval(() => {
        syncChapter();
        const active = activeFrames();
        let changed = false;
        for (const [id, entry] of files) {
            if (entry.source !== window && !active.has(entry.source)) {
                files.delete(id);
                changed = true;
            }
        }
        if (changed) render();
    }, 1500);
})();
