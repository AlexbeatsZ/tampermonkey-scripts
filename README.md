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

1. 在 Translator 的设置中打开数据同步，选择 `GitHub Gist`。
2. 使用只授予 `gist` 权限的专用 GitHub classic PAT，不要使用 `gh auth token` 或带 `repo` 权限的日常令牌。
3. 设置一个独立、至少 6 个字符的加密口令，然后执行一次“立即同步”。
4. 在 Translator 中复制以 `kt_` 开头的同步码。
5. 打开 Dark Model 的“网页黑暗模式设置”，把同步码粘贴到“设备同步”，选择“连接并同步”。
6. 在其他设备重复安装脚本和第 4–5 步。

`kt_` 同步码同时包含 Gist 访问令牌和加密口令，应当像密码一样保管，不要发到聊天、Issue、仓库或公开剪贴板服务。

Dark Model 会按网站规则逐项合并，多设备删除使用墓碑记录，避免旧设备把已删除规则恢复；本地修改会尽快上传，每 24 小时至少拉取一次。Translator 使用自身现有的加密 Gist 同步机制。

## 验证

在 PowerShell 中运行：

```powershell
.\tools\validate.ps1
```

验证包含 JavaScript 语法、同步合并/加密测试、更新地址、LinkSwift 排除以及常见秘密和私网地址扫描。

## 来源

原始下载文件及 SHA-256 记录在 [imports.json](./imports.json)。Dark Model 内嵌 Dark Reader 4.9.128，保留其 MIT 许可证文本；Translator 仍遵循其原仓库的 GPL-3.0 许可证。
