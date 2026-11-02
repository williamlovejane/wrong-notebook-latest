# 贡献指南

感谢你愿意改进智能错题本！提交问题或代码前，请先阅读以下说明。英文贡献同样欢迎。

## 反馈问题与建议

- 使用 [Issues](https://github.com/margrop/wrong-notebook/issues) 报告 Bug 或提出功能建议，请先搜索是否已有相同的问题。
- 报告 Bug 时请写明版本号（「设置 → 关于」或 `/api/health`）、部署方式、使用的 AI 提供商与模型、复现步骤和相关日志。
- 日志、截图和配置中请去掉 API Key、密码、访问地址等敏感信息。
- 安全漏洞请不要公开提交，按 [SECURITY.md](SECURITY.md) 私下报告。

## 开发环境

需要 Node.js 22 及以上，推荐 24（见 `.nvmrc`，CI 与 Docker 镜像均使用 24）。

```bash
npm ci
npx prisma generate
cp .env.example .env        # 按需填写 AI 提供商的 API Key
npx prisma migrate dev
npx prisma db seed
npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/rebuild-system-tags.ts
npm run dev                 # http://localhost:3000，默认管理员 admin@localhost / 123456
```

更多说明见 [README](README.md) 和 [doc/](doc/) 目录。

## 提交代码

1. Fork 本仓库，从 `main` 创建分支。
2. 保持改动聚焦：一个 Pull Request 只解决一件事，多个相互独立的改动请拆成多个提交或 PR。
3. 遵循项目约定（详见 [AGENTS.md](AGENTS.md)）：
   - TypeScript 避免 `any`；界面文字放在 `src/lib/translations.ts`，同时提供中英文；页面需同时适配手机和电脑。
   - 修改 AI 调用时同步更新所有提供商，提示词集中在 `src/lib/ai/prompts.ts`。
   - 修改 `prisma/schema.prisma` 时使用正式迁移，且迁移只能新增、不能删除或修改已有列和数据。
   - 功能、配置或默认值变化时同步更新 `README.md` 与 `README.en.md`。
4. 提交信息格式：`<type>: <描述>`，type 取 `feat` / `fix` / `docs` / `style` / `refactor` / `test` / `chore` / `ci`。
5. 提交前运行：

   ```bash
   npm run lint
   npm run test:unit
   npm run test:integration
   ```

   CI 会运行 `npm run lint`，出现任何错误或警告都会失败。涉及页面流程的改动请运行 `npm run test:e2e`，完整检查可运行 `bash scripts/ci.sh`。
6. 发起 Pull Request，说明改动内容、原因和测试方式；界面改动请附截图。PR 须通过 CI（含 E2E）后才能合并。

## 依赖与安全检查

[CodeQL](.github/workflows/codeql.yml) 在每次推送、PR 和每周定时扫描 TypeScript、安卓 Java 代码与 CI 工作流，结果见仓库的 Security 页面。依赖由 [Dependabot](.github/dependabot.yml) 每周检查：次要版本和补丁版本合并成一个 PR，主版本升级单独提 PR；安全更新随时提交。Prisma 主版本升级会影响数据库迁移和安卓单机版的引擎编译，需要人工评估。

## 许可

提交的贡献将按本项目的 [MIT 许可证](LICENSE) 发布。
