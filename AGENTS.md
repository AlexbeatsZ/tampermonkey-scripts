# Goal

将 Chrome 中由篡改猴管理的用户脚本（排除 LinkSwift）发布到可供篡改猴自动更新的 GitHub 仓库，并为 Translator 与 Dark Model 提供加密的多设备设置同步。

# Current State

- 已从下载目录导入 AI Conversation Navigator、ChatGPT Copy Fix、Dark Model；LinkSwift 未导入。来源 SHA-256 记录在 `imports.json`。
- Translator 已由 `AlexbeatsZ/kiss-translator` 和 GitHub Pages 发布，不在本仓库重复维护。
- 三个本地脚本已写入公开 `@updateURL`；公开仓库为 `AlexbeatsZ/tampermonkey-scripts`，默认分支 `main`。
- Dark Model 2.1 使用 Translator 的 `kt_` GitHub Gist 同步码，按规则合并并端到端加密；个人网站列表已从公开源码默认值移除。
- 远端主提交 `0979a71` 已发布；三个 Raw 脚本和同步库均验证 HTTP 200，远端树无 LinkSwift。
- 同步设计：`docs/design/sync-architecture.md`。修改更新地址、凭据处理、合并或同步 UI 前必须阅读。

# Active Work

- [x] 导入脚本并排除 LinkSwift。
- [x] 添加自动更新地址、来源清单、秘密扫描和同步核心测试。
- [x] 为 Dark Model 添加加密 Gist 同步、逐规则冲突合并、删除墓碑、每日拉取和修改后上传。
- [x] 运行完整验证，创建公开 GitHub 仓库，提交并推送。
- [x] 验证远端树、Raw 安装地址和 LinkSwift 不存在。
- [ ] 用户在 Translator 创建最小 `gist` 权限令牌和加密口令，并在各设备导入 `kt_` 同步码。

# Build / Run / Test

- 完整本地验证：`.\tools\validate.ps1`。
- 单测：`node --test .\tests\dark-model-sync-core.test.cjs`。
- 验证会检查脚本语法、更新地址、LinkSwift 排除、常见凭据和私网/Tailscale 地址。
- 实机验收需要用户覆盖安装新版脚本，并在第二台设备验证 Translator 与 Dark Model 规则拉取；不要清空现有 GM 存储。

# Durable Lessons

- `chrome://extensions/` 与 `chrome-extension://` 页面受浏览器控制安全策略保护。不要通过 Chrome Profile、Local Storage、IndexedDB、原始 CDP 或其他浏览器表面绕过；使用篡改猴官方导出作为数据边界。
- 篡改猴无需凭据自动更新要求公开脚本 URL；代码公开与配置数据私密必须分层。Secret Gist 本身不是访问控制，配置正文必须加密。
- Dark Model 的个人规则曾嵌在公开默认值中并含私网地址；发布前应清空源码默认规则，依靠现有 GM 存储首次上传到加密 Gist。
