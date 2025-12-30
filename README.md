This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## 動作確認手順

### 1. 環境変数の設定

プロジェクトルートに `.env.local` ファイルを作成し、Gemini APIキーを設定してください：

```bash
GEMINI_API_KEY=your_gemini_api_key_here
```

> **注意**: Gemini APIキーは [Google AI Studio](https://makersuite.google.com/app/apikey) で取得できます。

### 2. 依存関係のインストール

```bash
npm install
```

### 3. 開発サーバーの起動

```bash
npm run dev
```

### 4. ブラウザでアクセス

[http://localhost:3000](http://localhost:3000) を開いてください。

### 5. 動作確認のテスト

1. **見積書の画像をアップロード**
   - 「見積書」エリアをクリックして画像を選択（必須）
   - 見積書の画像ファイル（JPG、PNGなど）を選択

2. **図面の画像をアップロード（任意）**
   - 「募集図面」エリアをクリックして画像を選択
   - 図面の画像ファイルを選択

3. **診断実行**
   - 「適正価格を診断する」ボタンをクリック
   - 解析が完了すると結果画面が表示されます

4. **結果の確認**
   - 削減可能な金額が表示される
   - 各項目の詳細（交渉可、削除推奨など）が表示される
   - AIエージェントの総評が表示される

### トラブルシューティング

- **APIエラーが発生する場合**: `.env.local` ファイルに正しい `GEMINI_API_KEY` が設定されているか確認してください
- **画像がアップロードできない場合**: 画像ファイルの形式（JPG、PNGなど）を確認してください
- **解析が完了しない場合**: ブラウザのコンソールとターミナルのエラーメッセージを確認してください

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
