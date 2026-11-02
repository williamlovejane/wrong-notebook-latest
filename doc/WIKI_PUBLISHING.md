# GitHub Wiki 维护与发布

`doc/wiki/` 保存面向公开仓库 `margrop/wrong-notebook` 的中文 Wiki 源文件。`Home.md` 是首页，`_Sidebar.md` 和 `_Footer.md` 分别是 GitHub Wiki 的侧栏与页脚，其他文件各对应一个页面。

`doc/wiki/en/` 保存英文版页面，文件名为对应中文页面名加 `-en` 后缀（如 `Quick-Start-en.md`），与中文页面一一对应；侧栏和页脚由中英文共用。GitHub Wiki 的页面名只取文件名，发布时把 `en/` 中的文件复制到 Wiki 仓库根目录。修改中文页面时同步更新对应的英文页面。

## 链接约定

- Wiki 页面之间使用不带 `.md` 的相对页面名，例如 `[快速开始](Quick-Start)`。
- 仓库源码、专项文档与截图使用完整 GitHub 或 raw.githubusercontent.com URL，避免 Wiki 把路径解析成自己的文件。
- 内容按公开主线核对，不复制本机配置、用户数据或私有部署信息。

## 首次初始化

Wiki 使用独立的 Git 仓库。若 `git ls-remote git@github.com:margrop/wrong-notebook.wiki.git` 提示仓库不存在，需要有权限的账户先在项目的 Wiki 页面创建并保存首个页面，之后再克隆 Wiki 仓库。仅启用 Wiki 功能不会保证 Git 仓库已经初始化。

## 准备可审阅的发布

先在系统临时目录克隆已有 Wiki，再把 `doc/wiki/` 中的 Markdown 文件复制到其根目录。不要删除远端原有但本次未维护的页面。

```bash
wiki_task_dir="$(mktemp -d)"
git clone git@github.com:margrop/wrong-notebook.wiki.git "$wiki_task_dir/wiki"
```

复制 `doc/wiki/*.md` 与 `doc/wiki/en/*.md` 后检查 Wiki 工作副本的 `git status` 与完整差异，确认导航、截图和页面名；仅暂存这次准备发布的文件，提交信息使用中文，例如 `docs: 创建智能错题本中文 Wiki`。

公开历史检查脚本可以从应用源码仓库调用，但工作目录必须位于实际待发布的 Wiki 仓库，传入 Wiki 提交引用：

```bash
# 在 Wiki 仓库中执行，将 SOURCE_REPO 替换为应用源码仓库的绝对路径
python3 "$SOURCE_REPO/scripts/check-public-history.py" HEAD
```

Wiki 仓库没有应用源码仓库的公开基线，脚本会检查其全部可达对象。设置公开的提交邮箱，避免在元数据中带入本机身份。Wiki 不包含应用的 `.githooks`，不能假定应用仓库的上传前钩子会自动保护 Wiki。

## 上传与验收

遵守 [AGENTS.md](../AGENTS.md) 中的规则：先展示 `git status` 与拟推送差异，经用户确认后再执行 GitHub 推送。首次创建线上 Wiki 页面也纳入这次发布确认，准备文件不等于已发布。

取得确认后，先读取远端最新状态，保留已有历史，并正常推送 Wiki 的当前分支；不要强推或用无关的本地初始历史覆盖已初始化的远端。

发布完成后应验证：

1. 本地提交与 Wiki 远端分支 SHA 一致。
2. [线上 Wiki 首页](https://github.com/margrop/wrong-notebook/wiki)可读取。
3. 正文页面、侧栏与页脚链接可打开，公开截图可以加载。
4. 发布范围与审阅差异一致，工作副本没有遗漏待提交文件。

仅修改文档可跳过应用单元、集成测试与构建；仍需检查文档链接、示例、公开内容边界和实际渲染。
