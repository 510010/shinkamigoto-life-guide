#!/bin/bash
# 上五島くらし案内 データ自動リフレッシュ（スクリプト版）
# 旧エージェントcron kurashi-guide-refresh の後継（2026-11-14 スクリプト化）。
# build_data.py を実行し、site/data.json に変化があればコミット「データ自動更新」して push する。
# 結果は hidden_files/refresh_script.log に1行ずつ記録する（ok updated / ok nochange / FAILED ...）。
set -u
# 実行環境（systemd等）で HOME や TZ が違っても同じ動作にするため固定する
export HOME=/home/hatch
export TZ=Asia/Tokyo
REPO=/home/hatch/workspace/shinkamigoto-life-guide
LOG=/home/hatch/workspace/goals/shinkamigoto-super-app/hidden_files/refresh_script.log
ts() { date '+%Y-%m-%d %H:%M:%S %Z'; }
fail() { echo "$(ts) FAILED $1" >> "$LOG"; exit 1; }

# git push（SSHプロキシ）用の環境変数をシステム標準ファイルから取り込む
if [ -f /etc/profile.d/hatch-egress.sh ]; then
  set -a; . /etc/profile.d/hatch-egress.sh; set +a
fi

cd "$REPO" || fail "cd"
out=$(python3 scripts/build_data.py 2>&1) || fail "build: $out"

if git status --porcelain -- site/data.json | grep -q .; then
  git add site/data.json || fail "git add"
  git commit -q -m "データ自動更新" || fail "git commit"
  gout=$(git push 2>&1) || fail "git push: $gout"
  echo "$(ts) ok updated" >> "$LOG"
else
  echo "$(ts) ok nochange" >> "$LOG"
fi

# ログが大きくなったら直近500行だけ残す
if [ "$(stat -c %s "$LOG" 2>/dev/null || echo 0)" -gt 1048576 ]; then
  tail -n 500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
exit 0
