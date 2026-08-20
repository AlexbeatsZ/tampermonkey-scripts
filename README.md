# Tampermonkey Scripts

这个仓库保存需要跨设备更新的用户脚本；LinkSwift 明确排除。脚本源码公开，便于篡改猴直接检查 `@updateURL`。个人网站规则、GitHub 令牌、加密口令、API Key 和 Cookie 不进入仓库。

## 安装与更新

- [AI Conversation Navigator](https://raw.githubusercontent.com/AlexbeatsZ/tampermonkey-scripts/main/scripts/ai-conversation-navigator.user.js)
- [ChatGPT Copy Fix](https://raw.githubusercontent.com/AlexbeatsZ/tampermonkey-scripts/main/scripts/chatgpt-copy-fix.user.js)
- [Dark Model](https://raw.githubusercontent.com/AlexbeatsZ/tampermonkey-scripts/main/scripts/dark-model.user.js)
- [Translator](https://alexbeatsz.github.io/kiss-translator/kiss-translator.user.js)（继续由现有 [kiss-translator](https://github.com/AlexbeatsZ/kiss-translator) 仓库发布，避免维护两份源码）

第一次在现有设备上点击以上链接并覆盖安装后，脚本会获得新的更新地址。随后在篡改猴设置中把“检查脚本更新间隔”设为每天；仓库内三个脚本和 Translator 都会使用各自的 `@updateURL` 更新。

## Translator 与 Dark Model 配置同步

同步数据使用同一个 GitHub Secret Gist。Secret Gist 只是“不参与公开搜索”，并非真正私有，因此配置正文会用独立口令通过 AES-GCM 加密。

1. [创建只授予 `gist` 权限的专用 GitHub classic PAT](https://github.com/settings/tokens/new?scopes=gist&description=Tampermonkey%20settings%20sync)，不要使用 `gh auth token` 或带 `repo` 权限的日常令牌。
2. 在 Translator 的“网页翻译”页找到紧跟网站列表的“不自动翻译网站 · 设备同步”，填写 PAT 和一个独立、至少 6 个字符的加密口令，然后选择“连接并同步”。
3. 打开 Dark Model 的“网页黑暗模式设置”，在“设备同步”填写同一个 PAT 和加密口令，选择“连接并同步”。Gist ID 留空即可自动发现 Translator 创建的 Gist。
4. 在其他设备安装脚本后重复第 2–3 步。

PAT 和加密口令应当像密码一样保管，不要发到聊天、Issue、仓库或公开剪贴板服务。

Translator **只同步“不自动翻译的网站”域名列表**；语言、翻译引擎、API、快捷键、翻译调优、字幕设置和其他网站规则字段均不同步。Dark Model 只同步自己的按网站模式。两者都按网站逐项合并，多设备删除使用墓碑记录，避免旧设备恢复已删除的项目；本地修改会尽快上传，每 24 小时至少拉取一次。

## 验证

在 PowerShell 中运行：

```powershell
.\tools\validate.ps1
```

验证包含 JavaScript 语法、同步合并/加密测试、更新地址、LinkSwift 排除以及常见秘密和私网地址扫描。

## 来源

原始下载文件及 SHA-256 记录在 [imports.json](./imports.json)。Dark Model 内嵌 Dark Reader 4.9.128，保留其 MIT 许可证文本；Translator 仍遵循其原仓库的 GPL-3.0 许可证。
