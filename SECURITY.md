# 安全策略

## 支持的版本

只为最新发布的版本修复安全问题。请先升级到 [最新版本](https://github.com/margrop/wrong-notebook/releases/latest)，确认问题仍然存在后再报告。

## 报告漏洞

**请不要通过公开的 Issue、讨论或 Pull Request 报告安全漏洞。**

请使用 GitHub 的私密漏洞报告：打开仓库的 [Security → Report a vulnerability](https://github.com/margrop/wrong-notebook/security/advisories/new)，并尽量提供：

- 受影响的版本和部署方式（Docker、npm、安装包或源码）
- 漏洞类型与影响范围
- 复现步骤或概念验证
- 可能的修复建议（可选）

收到报告后会尽快确认，并在修复发布后公开说明。感谢你帮助项目更安全。

## 自动检查

- [CodeQL](.github/workflows/codeql.yml) 代码扫描：每次推送、PR 和每周定时运行。
- Dependabot：依赖漏洞告警与自动安全更新，配置见 [.github/dependabot.yml](.github/dependabot.yml)。
- 密钥扫描与推送保护：阻止 API Key 等凭据进入仓库。

## 部署建议

- 生产环境务必设置随机的 `NEXTAUTH_SECRET`，并修改默认管理员密码。
- 不对外开放注册时，可在设置中关闭注册。
- API Key 保存在 `config/` 和 `.env` 中，备份或反馈问题时注意脱敏。
