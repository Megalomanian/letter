#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 一键把这一页推送到你的代码托管仓库（Gitee / GitHub / GitLab / Codeberg 都行）
#
#   ./deploy.sh git@gitee.com:你的用户名/letter.git
#   ./deploy.sh https://github.com/你的用户名/letter.git
#
# 推完之后，去平台的「Pages / 静态网站」里开启服务，就能拿到 HTTPS 的 URL。
# 详细步骤见 docs/DEPLOY.md
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")"

REMOTE="${1:-}"
if [ -z "$REMOTE" ]; then
  echo "用法： ./deploy.sh <git 仓库地址>"
  echo "例子： ./deploy.sh git@gitee.com:yourname/letter.git"
  exit 1
fi

if [ ! -d .git ]; then
  git init -q -b main 2>/dev/null || { git init -q && git checkout -q -b main; }
  echo "已初始化本地仓库（分支 main）"
fi

# 没配过身份的话给个仓库内的占位，避免 commit 失败
git config user.email >/dev/null 2>&1 || git config user.email "you@example.com"
git config user.name  >/dev/null 2>&1 || git config user.name  "$(whoami)"

git add -A
git commit -q -m "一封信：静态页面 + Canvas 动画" || echo "（没有新的改动需要提交）"

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE"
else
  git remote add origin "$REMOTE"
fi

git push -u origin main

echo
echo "✅ 推送完成：$REMOTE"
echo "下一步：在托管平台开启 Pages / 静态网站服务，拿到 HTTPS URL。"
echo "注意：GitHub Pages 需要把仓库设为 Public；EdgeOne Pages 支持直接上传压缩包。"
