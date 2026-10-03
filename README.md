# Tampermonkey Scripts

这个仓库保存需要跨设备更新的用户脚本；LinkSwift 明确排除。脚本源码公开，便于篡改猴直接检查 `@updateURL`。个人网站规则、GitHub 令牌、加密口令、API Key 和 Cookie 不进入仓库。

## 安装与更新

- [AI Conversation Navigator](https://raw.githubusercontent.com/AlexbeatsZ/tampermonkey-scripts/main/scripts/ai-conversation-navigator.user.js)
- [ChatGPT Copy Fix](https://raw.githubusercontent.com/AlexbeatsZ/tampermonkey-scripts/main/scripts/chatgpt-copy-fix.user.js)
- [Dark Model](https://raw.githubusercontent.com/AlexbeatsZ/tampermonkey-scripts/main/scripts/dark-model.user.js)
- [Translator](https://alexbeatsz.github.io/kiss-translator/kiss-translator.user.js)（继续由现有 [kiss-translator](https://github.com/AlexbeatsZ/kiss-translator) 仓库发布，避免维护两份源码）

第一次在现有设备上点击以上链接并覆盖安装后，脚本会获得新的更新地址。随后在篡改猴设置中把“检查脚本更新间隔”设为每天；仓库内三个脚本和 Translator 都会使用各自的 `@updateURL` 更新。

## AI Conversation Navigator 独立维护版

AI Conversation Navigator 由 AlexbeatsZ 在本仓库独立维护。当前版本为 `102.0.2-local`，以现有定制脚本为发布基线，之后的修改与版本发布由本仓库管理。功能包括默认收起的深色悬浮导航面板、对话书签、AI Studio 用户轮次过滤和 Arena 滚动控制。

脚本的主页、源码、问题反馈、更新检查和下载地址均指向本仓库。`@namespace https://greasyfork.org` 仅保留为已有安装的兼容标识，不是更新地址；脚本名称、GM 存储键和书签格式继续沿用，便于覆盖更新。已使用本仓库更新地址的设备可直接在篡改猴中检查更新；其他设备通过上方安装链接覆盖现有脚本一次，再确认脚本设置中的更新地址为本仓库 Raw 地址。

发布与兼容约定见 [导航器设计](docs/design/ai-conversation-navigator.md)。

## Translator / Dark Model multi-device sync

Both userscripts now use the private ROG loopback sync service instead of GitHub Gist. ROG hosts `127.0.0.1:17892`; OMEN and Mac reuse their SSH-over-Tailscale local forwards, so the userscripts always talk to the same loopback URL.

Dark Model synchronizes only its default mode and per-site `darkreader/filter/off` rules. Local edits upload after a short debounce, clean devices pull once per hour, and `????` forces a pull/merge immediately. Server data is AES-256-GCM encrypted at rest. No GitHub token, Gist ID, or sync passphrase is required in the userscript.

## 验证

在 PowerShell 中运行：

```powershell
npm ci
.\tools\validate.ps1
```

验证包含 JavaScript 语法、同步合并/加密测试、更新地址、LinkSwift 排除以及常见秘密和私网地址扫描。

ChatGPT Copy Fix 的 DOM/复制回归测试运行 `npm run test:copy`。浏览器验收页运行 `node tools/copy-fix-browser-fixture.cjs`，然后访问 `http://127.0.0.1:18367`；选区测试需按实际 Ctrl+C/Cmd+C。参见 [复制设计](docs/design/chatgpt-copy-fix.md) 与 [3.4.11 验证记录](docs/testing/chatgpt-copy-fix.md)。

## 来源

原始下载文件及 SHA-256 记录在 [imports.json](./imports.json)。Dark Model 内嵌 Dark Reader 4.9.128，保留其 MIT 许可证文本；Translator 仍遵循其原仓库的 GPL-3.0 许可证。
