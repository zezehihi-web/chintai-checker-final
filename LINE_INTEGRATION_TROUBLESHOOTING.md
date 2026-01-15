# LINE連携機能 トラブルシューティング指示書

## 現状

LINE連携機能の実装は完了していますが、**Webhookエンドポイントが404/405エラーを返す**問題が発生しています。

## 実装済みの内容

### ✅ 完了している実装

1. **データベース（Vercel KV）**
   - データベース名: `chintai-diagnosis-kv`
   - 環境変数は設定済み（ローカルとVercel）

2. **LIFF設定**
   - LIFF ID: `2008901046-GM21GYm9`
   - エンドポイントURL: `https://chintai-matching-app.vercel.app/liff/link`
   - 環境変数: `NEXT_PUBLIC_LIFF_ID` 設定済み

3. **実装済みファイル**
   - `lib/kv.ts` - Vercel KV操作
   - `lib/line-signature.ts` - Webhook署名検証
   - `lib/line-client.ts` - LINE API クライアント
   - `app/api/case/create/route.ts` - 案件作成API
   - `app/api/line/link/route.ts` - LIFF連携API
   - `app/api/line/webhook/route.ts` - Webhook受信API
   - `app/liff/layout.tsx` - LIFFレイアウト
   - `app/liff/link/page.tsx` - LIFF自動紐づけページ
   - `app/page.tsx` - 「LINEで続き」ボタン追加済み

4. **環境変数（ローカル）**
   - `.env.local`に以下が設定済み:
     - `GEMINI_API_KEY`
     - `LINE_CHANNEL_SECRET`
     - `LINE_CHANNEL_ACCESS_TOKEN`
     - `NEXT_PUBLIC_LIFF_ID=2008901046-GM21GYm9`
     - `KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `REDIS_URL`

## 現在の問題

### 問題1: Webhookエンドポイントが404エラーを返す

**症状:**
- URL: `https://chintai-matching-app.vercel.app/api/line/webhook`
- ブラウザでアクセスすると404エラー
- LINE Developers ConsoleのWebhook検証でも405エラー（Method Not Allowed）

**確認済み:**
- ✅ ローカルビルドは成功（`npm run build`）
- ✅ ルートは正しく認識されている（`/api/line/webhook`が表示される）
- ✅ ファイルは正しく配置されている（`app/api/line/webhook/route.ts`）
- ✅ `vercel.json`に設定追加済み

**推測される原因:**
1. Vercelのデプロイ時にルートが正しく認識されていない
2. ビルドエラーが発生しているが、ログで確認できていない
3. Next.jsのルーティング設定の問題

### 問題2: LINE Developers ConsoleのWebhook検証で405エラー

**症状:**
- LINE Developers ConsoleでWebhook URLを検証すると「405 Method Not Allowed」エラー
- メッセージ: "ボットサーバーから200以外のHTTPステータスコードが返されました。(405 Method Not Allowed)"

**実装済みの対策:**
- ✅ エラー時も200ステータスを返すように修正済み
- ✅ GETハンドラーを追加済み（検証用）
- ✅ 詳細ログを追加済み

### 問題3: LIFFアプリで「LINEの友達ではないユーザー、またはLINEアカウントが違うため表示できません」エラー

**症状:**
- LIFFページ（`/liff/link`）にアクセスすると、エラーメッセージが表示される
- メッセージ: "LINEの友達ではないユーザー、またはLINEアカウントが違うため表示できません。"

**考えられる原因:**

1. **LIFFアプリとMessaging APIチャネルの連携不足**
   - `liff.sendMessages()`を使用するには、LIFFアプリがMessaging APIチャネルと連携している必要がある
   - LINE Loginチャネルで作成したLIFFアプリを、Messaging APIチャネルと連携させる必要がある

2. **ボットリンク機能の設定不足**
   - LIFFアプリ作成時に「ボットリンク機能」をオンにしていない
   - または、Messaging APIチャネルとの連携が完了していない

3. **チャネルの不一致**
   - LIFFアプリが作成されたLINE Loginチャネルと、Messaging APIチャネルが異なる
   - 同じプロバイダー配下で、チャネル間の連携が必要

4. **エンドポイントURLの設定ミス**
   - LIFFアプリのエンドポイントURLが正しく設定されていない
   - デプロイ後のURLと一致していない

**確認すべきこと:**

1. **LINE Developers Consoleで確認**
   - LINE Loginチャネル（LIFFアプリが作成されたチャネル）を選択
   - 「LIFF」タブ → LIFFアプリの設定を確認
   - 「ボットリンク機能」がオンになっているか確認
   - 「連携するMessaging APIチャネル」が正しく設定されているか確認

2. **Messaging APIチャネルとの連携**
   - LINE LoginチャネルとMessaging APIチャネルが同じプロバイダー配下にあるか確認
   - 必要に応じて、チャネル間の連携を設定

3. **エンドポイントURLの確認**
   - LIFFアプリのエンドポイントURL: `https://chintai-matching-app.vercel.app/liff/link`
   - 実際のデプロイURLと一致しているか確認

**修正方法:**

1. **ボットリンク機能を有効化**
   - LINE Developers Console → LINE Loginチャネル → LIFFタブ
   - LIFFアプリを編集
   - 「ボットリンク機能」をオンに設定
   - 「連携するMessaging APIチャネル」で「ヘヤマッチ」チャネルを選択
   - 保存

2. **`liff.sendMessages()`の使用を条件付きにする**
   - メッセージ送信が失敗しても処理を続行できるようにする
   - または、メッセージ送信をオプションにする

3. **エラーハンドリングの改善**
   - `liff.sendMessages()`のエラーを適切にキャッチ
   - エラー時も処理を続行し、ユーザーに通知

## 必要な作業

### 1. 問題の特定

**確認すべきこと:**
1. **VercelのBuild Logsを確認**
   - デプロイ詳細画面 → "Build Logs"セクション
   - エラーメッセージがないか確認
   - TypeScriptのコンパイルエラーがないか確認

2. **VercelのFunction Logsを確認**
   - Deployments → 最新のデプロイ → "Logs"タブ
   - `/api/line/webhook`へのリクエストログを確認
   - エラーメッセージの詳細を確認

3. **VercelのFunctions一覧を確認**
   - Deployments → 最新のデプロイ → "Resources"タブ
   - `/api/line/webhook`がFunctions一覧に表示されているか確認

### 2. 修正作業

**可能性のある修正:**

#### A. ルーティングの問題
- `app/api/line/webhook/route.ts`のエクスポートを確認
- Next.jsのApp Routerのルーティング規則に準拠しているか確認

#### B. ビルド時の問題
- TypeScriptの型エラーがないか確認
- インポートパス（`@/lib/...`）が正しく解決されているか確認

#### C. Vercel設定の問題
- `vercel.json`の設定が正しいか確認
- 必要に応じて`next.config.ts`を調整

#### D. 環境変数の問題
- Vercelの環境変数が正しく設定されているか確認
- 特に`LINE_CHANNEL_SECRET`と`LINE_CHANNEL_ACCESS_TOKEN`が設定されているか

### 3. テスト手順

1. **ローカルでテスト**
   ```bash
   npm run build
   npm run start
   # 別ターミナルで
   curl http://localhost:3000/api/line/webhook
   ```

2. **Vercelでテスト**
   - デプロイ完了後、ブラウザで以下にアクセス:
     ```
     https://chintai-matching-app.vercel.app/api/line/webhook
     ```
   - 期待される結果: JSONレスポンス（`{"status":"ok",...}`）

3. **LINE Webhook検証**
   - LINE Developers Console → Messaging API設定 → Webhook URL → 「検証」ボタン
   - 成功すれば「成功」と表示される

## 重要な情報

### プロジェクト情報
- **プロジェクト名**: `chintai-matching-app`
- **Vercel URL**: `https://chintai-matching-app.vercel.app`
- **GitHubリポジトリ**: `ychihi393/chintai-checker-final`
- **ブランチ**: `main`

### LINE設定情報
- **Channel Secret**: `d21bddc9a72cb577f0da05ba5e1ad63e`
- **Channel Access Token**: `1B4U03+sEFsaZiWdj96GdP9+56SjVN9Aau0pUgTrakKGqY7jCOh416Xk3wYHIa/zZkL8q5D8y1wfy3o4wh//1NwZhFIDmifw8n3/QamtYxhXw12lRjEDPlGyY6xG5ju7pkK4xpC8Bav90ZeoRtmLFAdB04t89/1O/w1cDnyilFU=`
- **LIFF ID**: `2008901046-GM21GYm9`
- **Webhook URL**: `https://chintai-matching-app.vercel.app/api/line/webhook`
- **LIFF エンドポイントURL**: `https://chintai-matching-app.vercel.app/liff/link`

### ファイル構造
```
app/
  api/
    line/
      link/
        route.ts
      webhook/
        route.ts
    case/
      create/
        route.ts
  liff/
    layout.tsx
    link/
      page.tsx
lib/
  kv.ts
  line-client.ts
  line-signature.ts
```

## 期待される動作

### 正常に動作した場合の流れ

1. **診断完了後**
   - ユーザーが「LINEで続き」ボタンをクリック
   - `/api/case/create`が呼ばれ、案件が作成される
   - caseTokenが発行される
   - LIFF URLにリダイレクトされる

2. **LIFF連携**
   - LIFFページが開く
   - `liff.init()`が実行される
   - accessTokenが取得される
   - `/api/line/link`にPOSTリクエスト
   - 案件とLINEユーザーが紐づけられる
   - 成功メッセージがLINEに送信される

3. **LINE Bot操作**
   - ユーザーが「履歴」と送信
   - `/api/line/webhook`がPOSTリクエストを受信
   - 署名検証が成功
   - 案件一覧が返される
   - ユーザーが番号を選択
   - 案件詳細が表示される

## 次のステップ

1. **VercelのBuild LogsとFunction Logsを確認**
2. **エラーの原因を特定**
3. **修正を実装**
4. **再デプロイしてテスト**
5. **LINE Webhook検証を実行**

## 参考ドキュメント

- `LINE_INTEGRATION_SETUP.md` - セットアップガイド
- `LINE_INTEGRATION_CHECKLIST.md` - 実装チェックリスト
- [LINE Messaging API ドキュメント](https://developers.line.biz/ja/docs/messaging-api/)
- [Next.js App Router ドキュメント](https://nextjs.org/docs/app)

---

**作成日**: 2026年1月15日
**問題の状態**: 
- Webhookエンドポイントが404/405エラーを返す
- LIFFアプリで「友達ではないユーザー」エラーが発生
**優先度**: 高（LINE連携機能の核心部分）

## 追加の問題: LIFFアプリのエラー

### 問題3の詳細な修正手順

**即座に試せる修正:**

1. **`app/liff/link/page.tsx`の修正**
   - `liff.sendMessages()`の呼び出しをtry-catchで囲む
   - エラー時も処理を続行するようにする

2. **LINE Developers Consoleでの設定確認**
   - LINE Loginチャネル → LIFF → アプリ編集
   - 「ボットリンク機能」: オン
   - 「連携するMessaging APIチャネル」: 「ヘヤマッチ」を選択
   - エンドポイントURL: `https://chintai-matching-app.vercel.app/liff/link` を確認

3. **代替案: メッセージ送信をオプション化**
   - `liff.sendMessages()`が失敗しても、連携処理は完了させる
   - エラー時はログに記録するだけにする
