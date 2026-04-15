# memoria

AIが自動で分解・整理する、個人用メモアプリ。
雑に書き流したメモをアトミックな単位に分割し、タグ・エンティティ・タスクを抽出して、ネットワーク的に辿れるようにします。

- **雑に投げ込む** → AIが整文・切り分け
- **3ペイン構成**: 要点 (atoms) / メモ (原文) / タスク
- **絞り込み駆動**: タグや自由テキストの条件をAND合成、3ペインが同じ条件で連動
- **自然言語質問**: RAGで過去のメモに対してチャット形式で問い合わせ (「○○って今どうなってる？」)
- **ローカルファースト**: データは自PC内のSQLiteファイルに保存。外部サービス依存なし（LLMプロバイダを除く）

---

## スクリーンショット / 主要機能

- 投入時にGPTが意味のある単位でアトミックノート化し、タグ・固有名詞・実行可能タスクを抽出
- embedding検索 + 全文検索 + タグ共起でハイブリッド絞り込み
- 絞り込みサジェストは直近の活動を時間減衰スコアで重み付け (最近アツい話題が上位)
- タスクは締切を自然言語から解決 (「金曜まで」→ 記録日基準のISO日付)
- 無限スクロール、ダークモード、タイムゾーン変換

---

## 技術スタック

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **SQLite** (better-sqlite3) + **sqlite-vec** + FTS5
- **Tailwind CSS**
- **OpenAI / Azure OpenAI / Ollama** (切替可)
- データは `./data/memoria.db` (単一ファイル)

---

## セットアップ

### 前提
- Node.js 20+
- npm (または pnpm)

### インストール

```bash
git clone https://github.com/mtnbjct/memoria.git
cd memoria
npm install
cp .env.local.example .env.local
```

### LLMプロバイダの設定

`.env.local` を編集して、以下のいずれかを設定します。

**OpenAI公式** (個人利用で推奨 / 最安)
```
LLM_PROVIDER=openai
EMBED_DIM=1536
OPENAI_API_KEY=sk-...
# OPENAI_CHAT_MODEL=gpt-4o-mini
# OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

**Azure OpenAI** (会社で用意されている場合)
```
LLM_PROVIDER=azure
EMBED_DIM=1536
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_API_VERSION=2024-10-21
AZURE_OPENAI_CHAT_DEPLOYMENT=gpt-4o
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-small
```

**Ollama** (完全ローカル・無料)
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

### 本番モード (ローカル常用向け)

```bash
npm run build
npm start
```

---

## Windowsで常駐させる (推奨)

毎回CLIを立ち上げずに、ログオン時に自動起動する方法です。

### 1. ビルド

```powershell
npm run build
```

### 2. タスクスケジューラに登録

付属の `scripts/start-memoria.ps1` を使います (プロジェクトパスはスクリプト自身が解決するため、どこに配置しても動作します)。

1. `Win+R` → `taskschd.msc` で **タスクスケジューラ** を開く
2. 「タスクの作成」をクリック
3. **全般**タブ:
   - 名前: `memoria`
   - 「最上位の特権で実行する」にチェック
4. **トリガー**タブ → 新規:
   - 「ログオン時」を選択、自分のユーザーを指定
5. **操作**タブ → 新規:
   - プログラム: `powershell.exe`
   - 引数: `-WindowStyle Hidden -File "<プロジェクトのフルパス>\scripts\start-memoria.ps1"`
6. **条件**タブ:
   - 「AC電源のみ」のチェックを外す (ノートPCでも動かしたい場合)
7. OK → 一度「実行」で動作確認

これで Windows ログオン後に裏で memoria が起動し、ブラウザで `http://localhost:3000` を開くだけで使えます。ログは `logs/memoria-YYYYMMDD.log` に書き出されます。

### コード更新後の再起動

```powershell
npm run build
Stop-Process -Name node -Force
Start-ScheduledTask -TaskName memoria
```

---

## 動作の仕組み

1. **ingest**: メモ投入 → GPTが JSON mode で atomic ノートに分割 + タグ・エンティティ・タスク抽出 → embedding生成 → SQLite に格納
2. **探索**: タグ / 自由テキスト / 個別メモ の複数フィルタを AND 合成。自由テキストは embedding で近傍atomのプールを作る
3. **質問 (RAG)**: 質問を embedding → 上位atomを取得 → GPTに根拠として渡し回答生成

---

## プロジェクト構造

```
app/                 -- Next.js App Router (画面 + API)
  page.tsx           -- 3ペインのメインUI
  api/               -- notes / atoms / explore / tasks / ask / topics / suggested-tags
lib/
  db.ts              -- SQLite + sqlite-vec セットアップとスキーマ
  azure.ts           -- LLMプロバイダ抽象
  ingest.ts          -- メモ → atom パイプライン
  explore.ts         -- フィルタ合成と関連タグ
  tasks.ts           -- タスク一覧
  ask.ts             -- RAG ロジック
components/          -- UI部品 (FilterBar, PaneHeader, AskDrawer, ThemeToggle など)
scripts/             -- 公開運用スクリプト (start-memoria.ps1 など)
data/                -- memoria.db が生成される (gitignore済み)
private/             -- 個人用の実験スクリプトやサンプルデータ置き場 (gitignore済み)
```

---

## ライセンス

MIT License. 詳細は [LICENSE](./LICENSE) を参照。
