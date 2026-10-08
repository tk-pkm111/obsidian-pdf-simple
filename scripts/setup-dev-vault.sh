#!/usr/bin/env bash
# 開発用 Vault（dev-vault/）を用意する。何度実行しても安全（冪等）。
#   - hot-reload プラグイン（pjeby/hot-reload）を最新リリースから取得
#   - このプラグイン用のフォルダと .hotreload マーカーを作成
#   - community-plugins.json を用意（初回は Obsidian 側で「信頼して有効化」が必要）
set -euo pipefail
cd "$(dirname "$0")/.."

PLUGIN_ID="$(node -p "require('./manifest.json').id")"
VAULT="dev-vault"
PLUGIN_DIR="$VAULT/.obsidian/plugins/$PLUGIN_ID"
HOT_RELOAD_DIR="$VAULT/.obsidian/plugins/hot-reload"

mkdir -p "$PLUGIN_DIR" "$HOT_RELOAD_DIR"
touch "$PLUGIN_DIR/.hotreload"

for file in main.js manifest.json; do
	curl -sSfL "https://github.com/pjeby/hot-reload/releases/latest/download/$file" \
		-o "$HOT_RELOAD_DIR/$file"
done
echo "hot-reload $(node -p "require('./$HOT_RELOAD_DIR/manifest.json').version") -> $HOT_RELOAD_DIR"

COMMUNITY_PLUGINS="$VAULT/.obsidian/community-plugins.json"
if [ ! -f "$COMMUNITY_PLUGINS" ]; then
	printf '[\n\t"hot-reload",\n\t"%s"\n]\n' "$PLUGIN_ID" > "$COMMUNITY_PLUGINS"
	echo "created $COMMUNITY_PLUGINS"
fi

echo "dev-vault ready: $(pwd)/$VAULT"
echo "next: npm run dev  (build + copy to $PLUGIN_DIR)"
