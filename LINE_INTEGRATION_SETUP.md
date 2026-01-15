# LINE連携機能セットアップガイド

## 概要

このドキュメントでは、賃貸初期費用AI診断ツールにLINE連携機能を追加するための設定手順を説明します。

## 機能

1. **Web診断結果のLINE引き継ぎ**
   - 診断完了後、「LINEで続き」ボタンから案件をLINEに連携
   - 画像の再アップロード不要

2. **LIFF自動紐づけ**
   - コード入力なしで自動的にLINEアカウントと案件を紐づけ
   - セキュアなcaseToken（128bit、10分TTL、ワンタイム）

3. **LINE上で案件履歴管理**
   - 「履歴」コマンドで過去の診断結果を確認
   - 複数案件の切り替えが可能

## 必要な環境変数

### 1. LINE認証情報

`.env.local`（ローカル開発）とVercelの環境変数に以下を設定：

```bash
# LINE Channel認証情報
LINE_CHANNEL_SECRET=d21bddc9a72cb577f0da05ba5e1ad63e
LINE_CHANNEL_ACCESS_TOKEN=1B4U03+sEFsaZiWdj96GdP9+56SjVN9Aau0pUgTrakKGqY7jCOh416Xk3wYHIa/zZkL8q5D8y1wfy3o4wh//1NwZhFIDmifw8n3/QamtYxhXw12lRjEDPlGyY6xG5ju7pkK4xpC8Bav90ZeoRtmLFAdB04t89/1O/w1cDnyilFU=

# LIFF ID（LINE Developersで作成したLIFFアプリのID）
NEXT_PUBLIC_LIFF_ID=your-liff-id-here
```

### 2. Vercel KV（データベース）

Vercelダッシュボードで自動設定される変数（手動設定不要）：

- `KV_URL`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `KV_REST_API_READ_ONLY_TOKEN`

## セットアップ手順

### Phase 1: Vercel KVの作成

1. Vercelダッシュボードにログイン
2. プロジェクトを選択
3. **Storage** タブ → **Create Database** → **KV** を選択
4. データベース名を入力（例：`chintai-diagnosis-kv`）
5. **Create** をクリック
6. 環境変数が自動的にプロジェクトに追加されます

### Phase 2: LINE Developersの設定

#### 2.1 Webhook URLの設定

1. [LINE Developers Console](https://developers.line.biz/console/) にログイン
2. チャネルを選択
3. **Messaging API** タブ
4. **Webhook URL** に以下を設定：
   ```
   https://your-domain.vercel.app/api/line/webhook
   ```
5. **Webhook の利用** を **オン** に設定
6. **応答メッセージ** を **オフ** に設定（重要！）
7. **検証** ボタンで接続テスト

#### 2.2 LIFFアプリの作成

1. LINE Developersコンソールでチャネルを選択
2. **LIFF** タブ → **追加** をクリック
3. 以下の設定：
   - **LIFFアプリ名**: 賃貸初期費用診断連携
   - **サイズ**: Full
   - **エンドポイントURL**: `https://your-domain.vercel.app/liff/link`
   - **Scope**: `profile`, `openid` にチェック
   - **ボットリンク機能**: オン（推奨）
4. **追加** をクリック
5. 作成された **LIFF ID**（例：`1234567890-AbCdEfGh`）をコピー
6. `.env.local` と Vercel環境変数の `NEXT_PUBLIC_LIFF_ID` に設定

### Phase 3: Vercel環境変数の設定

1. Vercelダッシュボード → プロジェクト → **Settings** → **Environment Variables**
2. 以下の変数を追加：

| 変数名 | 値 | 環境 |
|--------|-----|------|
| `LINE_CHANNEL_SECRET` | `d21bddc9a72cb577f0da05ba5e1ad63e` | Production, Preview, Development |
| `LINE_CHANNEL_ACCESS_TOKEN` | （上記の長いトークン） | Production, Preview, Development |
| `NEXT_PUBLIC_LIFF_ID` | （LIFFアプリのID） | Production, Preview, Development |

3. **Save** をクリック

### Phase 4: デプロイ

```bash
# 変更をコミット
git add .
git commit -m "Add LINE integration feature"

# Vercelにプッシュ（自動デプロイ）
git push origin main
```

デプロイ後、Webhook URLとLIFF エンドポイントURLが有効になります。

## 動作確認

### 1. ローカルテスト

```bash
# 開発サーバー起動
npm run dev
```

- 診断を実行
- 結果画面で「LINEで続き」ボタンを確認
- ボタンクリック（ローカルではLIFFページでエラーになる可能性あり）

### 2. 本番テスト

1. 診断ツールで診断を実行
2. 結果画面で「LINEで続き」ボタンをクリック
3. LINEアプリが開き、自動的に連携される
4. LINEに「引き継ぎが完了しました！」メッセージが届く
5. LINE上で「履歴」と送信
6. 案件一覧が表示される
7. 番号（1-5）を送信して案件を選択
8. 「はい」と送信して詳細を確認

## トラブルシューティング

### Webhook接続エラー

**症状**: Webhookの検証が失敗する

**対処**:
1. デプロイが完了しているか確認
2. URLが正しいか確認（`/api/line/webhook`）
3. Vercelのログを確認（Function Logs）

### LIFF初期化エラー

**症状**: 「LIFF IDが設定されていません」

**対処**:
1. `NEXT_PUBLIC_LIFF_ID` が環境変数に設定されているか確認
2. Vercelで再デプロイ（環境変数変更後は再デプロイが必要）

### caseTokenエラー

**症状**: 「リンクの有効期限が切れました」

**対処**:
- caseTokenは10分間のみ有効
- 診断結果画面から再度「LINEで続き」ボタンをクリック

### 案件が表示されない

**症状**: 「履歴」で案件が表示されない

**対処**:
1. LIFF連携が成功したか確認（成功メッセージを確認）
2. Vercel KVが正しく設定されているか確認
3. Vercel KVのデータを確認（Storage → KV → Browse Data）

## データ構造

### Vercel KV Keys

- `case:{case_id}` - 案件データ（30日TTL）
- `caseToken:{token}` - 案件トークン（10分TTL、ワンタイム）
- `lineUser:{line_user_id}` - LINEユーザー情報
- `userCases:{line_user_id}` - ユーザーの案件IDリスト
- `activeCase:{line_user_id}` - アクティブな案件ID

## セキュリティ

1. **caseToken**
   - 128bit（32文字hex）のランダムトークン
   - 10分間のみ有効（TTL）
   - 1回使用したら無効化（ワンタイム）

2. **accessToken検証**
   - LINE Profile API経由でtokenを検証
   - サーバー側で必ずuserIdを確認

3. **情報漏洩対策**
   - 全API: `line_user_id`でフィルタリング
   - 他人の案件にはアクセス不可

4. **Webhook署名検証**
   - HMAC-SHA256で署名を検証
   - 不正なリクエストは400エラー

## API エンドポイント

### POST /api/case/create
案件作成＋caseToken発行

**Input:**
```json
{
  "result": { /* 診断結果オブジェクト */ }
}
```

**Output:**
```json
{
  "caseId": "uuid",
  "caseToken": "32文字hex"
}
```

### POST /api/line/link
LIFF→サーバー連携

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Input:**
```json
{
  "caseToken": "32文字hex"
}
```

**Output:**
```json
{
  "success": true,
  "caseId": "uuid"
}
```

### POST /api/line/webhook
LINE Webhook受信

**Headers:**
```
x-line-signature: {signature}
```

**Input:**
```json
{
  "events": [/* LINE Webhook Events */]
}
```

## LINE Botコマンド

| コマンド | 説明 |
|----------|------|
| `履歴` | 案件一覧を表示（直近5件） |
| `1`-`5` | 案件を選択（履歴表示後） |
| `はい` | 選択した案件の詳細を表示 |

## 参考リンク

- [LINE Messaging API ドキュメント](https://developers.line.biz/ja/docs/messaging-api/)
- [LIFF ドキュメント](https://developers.line.biz/ja/docs/liff/)
- [Vercel KV ドキュメント](https://vercel.com/docs/storage/vercel-kv)
- [友だち追加URL](https://lin.ee/DPUjEfr)

## サポート

問題が発生した場合は、以下を確認してください：

1. Vercel Function Logs
2. LINE Developers Console → Webhook ログ
3. ブラウザのコンソールログ

---

**実装完了日**: 2026年1月15日
**実装者**: Claude AI (Sonnet 4.5)
