#!/usr/bin/env bash
# 開発時の参照資料を references/ に取得する（git 管理外。再実行で最新に更新）。
#   - obsidian-developer-docs : docs.obsidian.md の元原稿（API ガイド・プラグイン指針・CSS 変数）
#   - obsidian-sample-plugin  : 公式テンプレート（設定ファイルの差分確認用）
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p references

fetch() {
	local repo="$1" dir="references/$2"
	rm -rf "$dir"
	git clone -q --depth 1 "https://github.com/$repo" "$dir"
	rm -rf "$dir/.git"
	echo "fetched $repo -> $dir"
}

fetch obsidianmd/obsidian-developer-docs obsidian-developer-docs
fetch obsidianmd/obsidian-sample-plugin obsidian-sample-plugin
