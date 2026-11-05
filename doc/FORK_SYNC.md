# 本仓库的分支管理与上游同步约定

> **适用对象**：在 `williamlovejane/wrong-notebook-latest` 中工作的所有开发者与 AI agent（Claude Code、Codex、Cursor、WorkBuddy 等）。
> **优先级**：本文关于分支、远程、提交与同步的规则，**高于** `AGENTS.md` 和 `doc/BRANCH_WORKFLOW.md` 中来自上游的描述。
> 建立时间：2026-11-05。

## 1. 这是什么仓库

本仓库是 [`margrop/wrong-notebook`](https://github.com/margrop/wrong-notebook) 的 fork。上游持续更新，本仓库也在上面做自定义开发与发布。为避免「每次同步都要重新解一遍冲突」，采用**双分支分层**：一条分支只做上游的纯镜像，另一条承载全部自定义改动，冲突只收敛在后一条分支上。

### remote 拓扑（本地实际配置）

| 名称 | 地址 | 用途 |
| --- | --- | --- |
| `origin` | `git@github.com:williamlovejane/wrong-notebook-latest.git` | **本 fork**，日常 `git push` 的目标 |
| `upstream` | `https://github.com/margrop/wrong-notebook.git` | **唯一合法的同步源头** |
| `margrop` | 同上（HTTPS，无 `.git` 后缀） | 迁移前遗留的只读别名，保留即可 |
| `wttwins` | `https://github.com/wttwins/wrong-notebook` | 历史误占用 `upstream` 名字的另一分叉，**不要用** |
| `old-fork` | `git@github.com:williamlovejane/wrong-notebook.git` | 旧 fork，仅存档，不要再推送 |

> 上游 `AGENTS.md` 提到的 `github` 远程、Gitea 私有远程、`scripts/check-public-history.py`、`.githooks` 上传前检查，属于上游项目的发布流程，**本仓库没有配置也不适用**，不要照搬执行。

## 2. 两条分支，职责严格分离

| 分支 | 内容 | 允许的操作 |
| --- | --- | --- |
| `main` | `margrop/wrong-notebook` 的 main，**逐提交一致** | 只允许快进（fast-forward）到上游；由同步脚本更新 |
| `release` | 纯镜像 + 全部自定义开发 + 历次冲突解决结果 | 所有开发、提交、构建、打标签、发布都在这里 |

**三条铁律**

1. **只在 `release` 上写代码、提交、推送**（`git push origin release`）。
2. **`main` 永远不提交自己的代码，不 force push，不在网页上手动改**。它一旦和上游分叉，同步脚本会拒绝工作并要求人工处理。
3. **不要绕过同步流程**：不要用 GitHub 网页的 `Sync fork` 去覆盖 `release`，不要让 CI/定时任务自动把上游 merge 进 `release`（CI 解不了冲突），不要对 `release` 做 `hardreset` 到上游。

> 目前远端默认分支（origin/HEAD）仍是 `main`，所以 `git clone` 后**第一件事必须是 `git checkout release`**，否则会在纯镜像分支上开发。建议维护者在 GitHub 仓库设置中把默认分支改成 `release`。

## 3. 日常开发

```bash
git checkout release                 # clone 后必做；确认分支再动手
# ... 开发、测试、提交 ...
git push origin release              # 自定义内容只推 release
```

提交规范沿用 `AGENTS.md`：`<type>: <中文描述>`，不添加 AI 署名，按功能拆分提交。

## 4. 按需同步上游：`sync-upstream.sh`

脚本在仓库根目录，**已纳入版本控制**，无硬编码本机路径，任何 clone 都可直接使用。

```bash
./sync-upstream.sh                  # 默认 merge：追平 main → 把上游合入 release
./sync-upstream.sh fetch-only       # 只追平 main，不碰 release（先看上游更新时使用）
./sync-upstream.sh rebase           # 变基；release 历史含 merge commit，慎用
```

可用环境变量覆盖默认值：`UPSTREAM_REMOTE`（默认 `upstream`）、`UPSTREAM_URL`、`MIRROR_BRANCH`（默认 `main`）、`DEV_BRANCH`（默认 `release`）。

脚本实际做的事：

1. 校验当前分支是 `release`、工作区无未提交代码改动（AI 工具目录除外）；**全程不切换分支**，本地未提交文件不会被 checkout 干扰。
2. 校验 `upstream` 确实指向 `margrop/wrong-notebook`，防止误同步到 `wttwins` 等其它分叉。
3. 自动开启 `git rerere.enabled`，`fetch upstream` + `fetch origin`。
4. 校验本地 `main` 是 `upstream/main` 的祖先（即纯镜像未被污染），然后用 `git push origin <sha>:refs/heads/main` 加 `git update-ref` **直接更新 main 的引用**（不切分支），并同步 `origin/main`。
5. `merge` / `rebase` 模式下，把 `main` 并入当前 `release`；成功只提示推送，**不自动 push**。

同步后请检查改动、跑测试（至少 `npm run lint` 与相关测试），再 `git push origin release`。上游更新频繁时，`fetch-only` 可以每天跑，合并保持每周或每个里程碑一次即可。

## 5. 冲突处理

- 冲突**只应出现在 `release ← main` 这一步**，这正是分层设计的目的；`main` 的快进永远零冲突。
- 脚本已开启 `git rerere`，同一处冲突只解一次，后续自动复用解法。
- 冲突时脚本会退出并打印后续命令，按提示执行：

  ```bash
  git add . && git merge --continue     # rebase 模式则是 git rebase --continue
  git push origin release
  ```

- 合并 `AGENTS.md`、`README*`、`doc/` 等上游文档时，**不要图省事整文件选 ours 或 theirs**：保留本仓库新增内容（尤其是 `AGENTS.md` 顶部的覆盖声明和本文），同时合入上游的新说明。
- 长期减负的根本办法是把通用改动提 PR 回上游；每被合并一个，本地分叉就少一块。
- 如确实需要定制合并行为，可在 `.gitattributes` 中对个别文件设置策略（如锁文件 `merge=union`），但**不要**给 `AGENTS.md` 设 `merge=ours`，那会静默丢掉上游文档更新。

## 6. 明确禁止

- 在 `main` 上提交、`git push --force` `main`、用网页 `Sync fork` 覆盖 `release`。
- 把 `wttwins` / `old-fork` / `margrop` 当同步目标；同步源只认 `upstream`。
- 删除 `AGENTS.md` 顶部的「本 fork 必读」段落或本文。
- 提交 AI 工具本地数据：`.workbuddy-ai/`、`.workbuddy/` 已在 `.gitignore` 中排除。注意 `.workbuddy/memory/2026-11-03.md` 是历史遗留的**已跟踪文件**且长期带有本地修改，gitignore 对它无效——**不要 `git add .` 把它带上，也不要提交它的本地改动**。提交时显式列出文件，别用 `git add -A`。
- 在 CI 里解决冲突、自动强推 `release`。

## 7. 新环境首次配置

```bash
git clone git@github.com:williamlovejane/wrong-notebook-latest.git
cd wrong-notebook-latest
git checkout release                                    # 必须，默认分支是纯镜像 main
git remote add upstream https://github.com/margrop/wrong-notebook.git
git config rerere.enabled true
./sync-upstream.sh fetch-only                            # 验证链路可用
```

如果 `upstream` 已存在但地址不对，先 `git remote set-url upstream https://github.com/margrop/wrong-notebook.git`。

## 8. 迁移记录与回滚锚点

2026-11-05 由「本地 main 混写自定义代码 + 手动同步」迁移到双分支结构，全程**未 reset、未 force push、未切换工作区分支**：

- 本地 `main` 改名为 `release`（`53f56cdb`，含 12 个相对上游的自定义提交与历次冲突解决结果），并首次推送到 `origin/release`；此前这些提交只存在本地、未推送到任何远端。
- 新建 `main` 指向 `origin/main`（`ae89afc2`），与 `upstream/main` 完全一致。
- 回滚锚点：本地 tag `backup/pre-migration-20261105` = `53f56cdb`。
- remote 整理：旧 `origin` 改名为 `old-fork`、`origin` 切到新 fork；误指向 `wttwins` 的 `upstream` 改名为 `wttwins`，新建正确的 `upstream`。

需要核对结构是否健康时：

```bash
git rev-parse main upstream/main origin/main   # 三者必须相同
git log --oneline main..release | head         # 应只列出自定义提交
git remote -v                                  # upstream 必须是 margrop
```
