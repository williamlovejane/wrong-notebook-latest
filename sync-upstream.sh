#!/usr/bin/env bash
# 按需把 margrop/wrong-notebook 的更新同步进本 fork
#   ./sync-upstream.sh              默认：追平纯镜像 main，再 merge 进 release
#   ./sync-upstream.sh rebase       变基方式（本项目历史含 merge commit，慎用）
#   ./sync-upstream.sh fetch-only   只追平 main，不碰 release
#
# 设计要点：全程不切换分支 —— main 用 ref 操作更新，工作区始终留在 release，
# 因此本地未提交的文件不会被 checkout 干扰。main 永不写自己的代码。
set -euo pipefail

UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/margrop/wrong-notebook.git}"
MIRROR_BRANCH="${MIRROR_BRANCH:-main}"
DEV_BRANCH="${DEV_BRANCH:-release}"
MODE="${1:-merge}"

case "${MODE}" in merge|rebase|fetch-only) ;; *) echo "用法: ${0} [merge|rebase|fetch-only]" >&2; exit 1 ;; esac

REPO="$(git -C "$(dirname "${0}")" rev-parse --show-toplevel 2>/dev/null)" || { echo "错误：脚本所在目录不在 git 仓库中" >&2; exit 1; }
cd "${REPO}"

CURRENT="$(git rev-parse --abbrev-ref HEAD)"
[ "${CURRENT}" = "${DEV_BRANCH}" ] || { echo "错误：当前在 ${CURRENT}，请先 git checkout ${DEV_BRANCH}（脚本不切换分支以保护工作区）" >&2; exit 1; }

DIRTY="$(git status --porcelain -- . ':(exclude).workbuddy' ':(exclude).workbuddy-ai')"
[ -z "${DIRTY}" ] || { echo "错误：工作区有未提交的代码改动，请先 commit 或 stash：" >&2; echo "${DIRTY}" >&2; exit 1; }

# 确认同步源确实是 margrop，避免误同步到 wttwins 等其它分叉
if ! git remote get-url "${UPSTREAM_REMOTE}" >/dev/null 2>&1; then
  git remote add "${UPSTREAM_REMOTE}" "${UPSTREAM_URL}"
fi
ACTUAL="$(git remote get-url "${UPSTREAM_REMOTE}")"
case "${ACTUAL}" in
  *margrop/wrong-notebook*) ;;
  *) echo "错误：${UPSTREAM_REMOTE} 指向 ${ACTUAL}，不是 margrop/wrong-notebook" >&2; exit 1 ;;
esac

git config rerere.enabled true
git fetch "${UPSTREAM_REMOTE}" --prune
git fetch origin --prune

UP="refs/remotes/${UPSTREAM_REMOTE}/${MIRROR_BRANCH}"
LOCAL="refs/heads/${MIRROR_BRANCH}"
if ! git merge-base --is-ancestor "${LOCAL}" "${UP}"; then
  echo "错误：fork 的 ${MIRROR_BRANCH} 与上游已分叉，需人工处理" >&2; exit 1
fi

if [ "$(git rev-parse "${UP}")" = "$(git rev-parse "${LOCAL}")" ]; then
  echo "==> [1/2] 上游无新提交，${MIRROR_BRANCH} 已是最新"
else
  echo "==> [1/2] 更新纯镜像 ${MIRROR_BRANCH}: $(git rev-parse --short "${LOCAL}") -> $(git rev-parse --short "${UP}")"
  git push origin "$(git rev-parse "${UP}"):refs/heads/${MIRROR_BRANCH}"
  git update-ref "${LOCAL}" "${UP}"
  git fetch origin --prune
fi

if [ "${MODE}" = "fetch-only" ]; then
  echo "完成：${MIRROR_BRANCH} 已追平上游，未触碰 ${DEV_BRANCH}"
  exit 0
fi

echo "==> [2/2] 把 ${MIRROR_BRANCH} 并入 ${DEV_BRANCH}（冲突只在这里出现）"
if [ "${MODE}" = "rebase" ]; then
  if ! git rebase "${MIRROR_BRANCH}"; then
    echo "冲突：解决后 git add . && git rebase --continue，再 git push --force-with-lease origin ${DEV_BRANCH}" >&2
    exit 1
  fi
  echo "完成，检查后推送：git push --force-with-lease origin ${DEV_BRANCH}"
else
  if ! git merge --no-edit "${MIRROR_BRANCH}"; then
    echo "冲突：解决后 git add . && git merge --continue，再 git push origin ${DEV_BRANCH}" >&2
    exit 1
  fi
  echo "完成，检查后推送：git push origin ${DEV_BRANCH}"
fi
