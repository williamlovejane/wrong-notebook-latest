#!/usr/bin/env bash
# 重新生成 CHANGELOG.md：每个正式版一节，内容与 GitHub Release 说明一致（见 scripts/release-notes.sh）。
# 预览版不单独列出，其改动归入下一个正式版。
# 用法：
#   bash scripts/changelog.sh                 # 按已有的正式版标签重新生成
#   bash scripts/changelog.sh v2026.10.23     # 发布正式版前：把 HEAD 作为该版本写入，再提交、打标签
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
next=${1:-}
if [[ -n "$next" && ! "$next" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "正式版标签格式应为 v年.月.日：$next" >&2
    exit 1
fi
if [[ -n "$next" ]] && git rev-parse -q --verify "refs/tags/$next" >/dev/null; then
    echo "标签 $next 已存在，直接运行 bash scripts/changelog.sh 即可" >&2
    exit 1
fi

# 首个正式版之前是继承自上游仓库的完整历史，只写一句说明
first=$(git tag --list 'v[0-9]*' --sort=creatordate | command grep -v -- - | head -1 || true)

section() {
    local tag=$1 ref=$2 date=$3
    echo "## [${tag#v}](https://github.com/margrop/wrong-notebook/releases/tag/$tag) - $date"
    echo
    if [[ "$tag" == "$first" ]]; then
        echo "- 首个正式版本，此前的改动见 Git 提交历史"
    else
        bash scripts/release-notes.sh "$tag" "$ref" 2>/dev/null
    fi
    echo
}

{
    echo "# 更新日志"
    echo
    echo "本文件记录各正式版的改动，由 \`scripts/changelog.sh\` 根据提交信息生成，请勿手动编辑。"
    echo "预览版（\`v年.月.日-n\`）的改动见 [GitHub Releases](https://github.com/margrop/wrong-notebook/releases)，并归入其后的正式版。"
    echo
    if [[ -n "$next" ]]; then
        section "$next" HEAD "$(date +%Y-%m-%d)"
    fi
    for tag in $(git tag --list 'v[0-9]*' --sort=-creatordate | command grep -v -- -); do
        section "$tag" "$tag" "$(git log -1 --format=%cs "$tag")"
    done
} > CHANGELOG.md
echo "已生成 CHANGELOG.md" >&2
