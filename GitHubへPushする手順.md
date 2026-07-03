# GitHubへPushする手順

Codex側からGitHubへ直接接続できなかったため、Macのターミナルで以下を実行してください。

## 実行するコマンド

```bash
cd /private/tmp/travel-ai-deploy
git push -u origin main
```

GitHubのログイン確認が出た場合は、画面の案内に従ってログインしてください。

## Push先

```text
https://github.com/yusuke96nakano/enjoy-travel.git
```

## Pushできた後

Vercelで以下を行います。

1. Vercelを開く
2. `Add New...` → `Project`
3. GitHubの `enjoy-travel` を選択
4. Framework Preset が `Next.js` になっていることを確認
5. `Deploy` を押す

公開URLが出たら、そのURLをスマホで開けます。
