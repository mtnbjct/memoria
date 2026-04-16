# memoria

雑に書き流したメモをAIが自動で整理してくれる、個人用メモアプリ。

- **雑に投げ込む** → AIが意味のある単位に切り分け、タグ・エンティティ・タスクを抽出
- **3ペイン構成**: 要点 / メモ (原文) / タスク
- **絞り込み駆動**: タグや自由テキストの条件をAND合成、3ペインが同じ条件で連動
- **自然言語質問**: 過去のメモに対して「○○って今どうなってる？」とチャット形式で問い合わせ (RAG)

## プライバシー

- **データは完全にローカル保存** (自PC内の単一のSQLiteファイル)。外部サービスに保存されません
- **LLM にだけはメモの内容を送信します**。送った内容が学習に使われるかは利用するプロバイダのポリシー次第です
  - **Azure OpenAI**: 既定で学習に使われません (エンタープライズ向けポリシー)
  - **OpenAI API**: 既定で学習に使われません (API経由の入力はデフォルトopt-out)
  - **OpenAI 互換エンドポイント**: プロバイダごとに異なります。各サービスのポリシーを確認してください
  - **Ollama**: 完全ローカル実行。ネットワーク送信なし
- プライバシー重視なら Azure OpenAI か Ollama を推奨

---

## セットアップ

### 前提
- Node.js 20+
- npm

### インストール

```bash
git clone git@github.com:<your-account>/memoria.git
cd memoria
npm install
cp .env.local.example .env.local
```

### LLMプロバイダの設定

`.env.local` を編集して、以下のいずれかを設定します。

**OpenAI 公式** (個人利用で手軽)
```
LLM_PROVIDER=openai
EMBED_DIM=1536
OPENAI_API_KEY=sk-...
```

**OpenAI 互換エンドポイント** (LiteLLM proxy, vLLM, Together AI, Groq など)
```
LLM_PROVIDER=openai
EMBED_DIM=1536
OPENAI_API_KEY=your-key
OPENAI_BASE_URL=https://your-endpoint/v1
OPENAI_CHAT_MODEL=your-model-name
OPENAI_EMBEDDING_MODEL=your-embedding-model
```

**Azure OpenAI** (会社提供のものなど、学習利用を回避したい場合)
```
LLM_PROVIDER=azure
EMBED_DIM=1536
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_API_VERSION=2024-10-21
AZURE_OPENAI_CHAT_DEPLOYMENT=gpt-4o
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-small
```

**Ollama** (完全ローカル、無料、ネットに出さない)
```
LLM_PROVIDER=ollama
EMBED_DIM=768
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_CHAT_MODEL=llama3.1
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

> ⚠ プロバイダを切り替えて embedding の次元が変わる場合、既存の `data/memoria.db` は作り直しが必要です。

---

## 起動

### 開発モード

```bash
npm run dev
```
→ http://localhost:3000

### 本番モード

```bash
npm run build
npm start
```

---

## Windowsで常駐させる

毎回CLIを立ち上げずに、ログオン時に自動起動させる方法です。

1. 一度ビルド: `npm run build`
2. タスクスケジューラ (`taskschd.msc`) を開き「タスクの作成」
3. **トリガー**: 「ログオン時」
4. **操作**: プログラム `powershell.exe` / 引数:
   ```
   -WindowStyle Hidden -File "<プロジェクトのフルパス>\scripts\start-memoria.ps1"
   ```
5. **条件**: 「AC電源のみ」のチェックを外す
6. OK → 一度「実行」で動作確認

以後ブラウザで `http://localhost:3000` を開くだけで使えます。ログは `logs/` に出力されます。

**コード更新後の再起動:**
```powershell
npm run build
Stop-Process -Name node -Force
Start-ScheduledTask -TaskName memoria
```

---

## ライセンス

MIT License. 詳細は [LICENSE](./LICENSE) を参照。
