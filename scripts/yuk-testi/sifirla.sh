#!/bin/zsh
# Yalnızca yerel emülatör (demo-playbook): veriyi ve Auth hesaplarını siler, tohumu yeniden yazar.
export PATH="$HOME/.local/node/bin:$PATH"
cd "$(dirname "$0")"
node lib/sil.mjs 2>&1 | grep -v Metadata | grep -v trace-warn
curl -s -X DELETE "http://127.0.0.1:9099/emulator/v1/projects/demo-playbook/accounts" >/dev/null
node tohum.mjs 2>&1 | grep -v Metadata | grep -v trace-warn
node gecmis.mjs 2>&1 | grep -v Metadata | grep -v trace-warn
