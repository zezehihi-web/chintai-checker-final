/**
 * 賃貸初期費用診断 API
 * 
 * シンプル版 + 裏コマンド機能:
 * - 見積書/図面の場合 → 通常の診断
 * - 関係ない画像の場合 → 特別な診断（占い/褒め倒し）
 * 
 * 【重要】このAPIはGemini APIに画像を送信する前に、
 * 厳密なバリデーションを行い、ByteStringエラーを防止します。
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import {
  createImagePart,
  buildGeminiContent,
  debugGeminiContent,
  containsNonAscii,
  GeminiImagePart,
  GeminiContentPart,
} from "@/lib/gemini-utils";

export const maxDuration = 60;

// APIキーの確認
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY が環境変数に設定されていません");
  console.error("環境変数の確認方法:");
  console.error("1. .env.local ファイルに GEMINI_API_KEY=your_key_here を追加");
  console.error("2. Vercelの場合は環境変数設定で GEMINI_API_KEY を追加");
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || "");

/**
 * 【ガード関数】Gemini APIを呼び出す前の最終チェック
 * 不正なデータを検出した場合は400エラーを返す
 */
function validateContentBeforeApiCall(content: GeminiContentPart[]): { valid: boolean; error?: string } {
  for (let i = 0; i < content.length; i++) {
    const part = content[i];
    
    // 【最重要】パーツがオブジェクト形式であることを確認
    if (!part || typeof part !== "object" || Array.isArray(part)) {
      return { 
        valid: false, 
        error: `パーツ[${i}]: オブジェクト形式ではありません（型: ${typeof part}, Array: ${Array.isArray(part)}）` 
      };
    }
    
    if ("inlineData" in part) {
      // 画像パーツの検証
      const data = part.inlineData.data;
      
      // 型チェック
      if (typeof data !== "string") {
        return { 
          valid: false, 
          error: `パーツ[${i}]: dataが文字列ではありません（型: ${typeof data}）` 
        };
      }
      
      // 空チェック
      if (data.length === 0) {
        return { 
          valid: false, 
          error: `パーツ[${i}]: dataが空です` 
        };
      }
      
      // 非ASCIIチェック（最重要）
      if (containsNonAscii(data)) {
        const firstNonAsciiIndex = data.split("").findIndex((char) => char.charCodeAt(0) > 127);
        const charCode = data.charCodeAt(firstNonAsciiIndex);
        const char = data.charAt(firstNonAsciiIndex);
        return { 
          valid: false, 
          error: `パーツ[${i}]: Base64データに非ASCII文字を検出。位置=${firstNonAsciiIndex}, コード=${charCode}, 文字="${char}"。プロンプトテキストが画像データに混入しています。` 
        };
      }
    } else if ("text" in part) {
      // 【最重要】テキストパーツが { text: string } 形式であることを確認
      if (typeof part.text !== "string") {
        return { 
          valid: false, 
          error: `パーツ[${i}]: textが文字列ではありません（型: ${typeof part.text}）` 
        };
      }
      
      // 生の文字列でないことを確認（undiciの_Headers.appendエラーを防ぐ）
      if (part.constructor === String || typeof part === "string") {
        return { 
          valid: false, 
          error: `パーツ[${i}]: 生の文字列です。必ず { text: string } オブジェクト形式にしてください` 
        };
      }
    } else {
      return { 
        valid: false, 
        error: `パーツ[${i}]: 無効な形式です（inlineDataもtextもありません）` 
      };
    }
  }
  
  return { valid: true };
}

export async function POST(req: Request) {
  try {
    // APIキーの再確認（リクエスト時）
    if (!GEMINI_API_KEY) {
      console.error("❌ APIリクエスト時: GEMINI_API_KEY が未設定");
      return NextResponse.json({ 
        error: "APIキーが設定されていません", 
        details: "サーバー管理者にお問い合わせください。GEMINI_API_KEY が環境変数に設定されているか確認してください。" 
      }, { status: 500 });
    }

    const formData = await req.formData();
    const estimateFile = formData.get("estimate") as File | null;
    const planFile = formData.get("plan") as File | null;
    const conditionFile = formData.get("condition") as File | null;

    if (!estimateFile) {
      return NextResponse.json({ error: "見積書の画像が必要です" }, { status: 400 });
    }

    // ファイルサイズの検証
    if (estimateFile.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "見積書の画像サイズが大きすぎます（20MB以下にしてください）" }, { status: 400 });
    }
    if (planFile && planFile.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "募集図面の画像サイズが大きすぎます（20MB以下にしてください）" }, { status: 400 });
    }
    if (conditionFile && conditionFile.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "条件欄の画像サイズが大きすぎます（20MB以下にしてください）" }, { status: 400 });
    }

    // ファイルタイプの検証
    if (!estimateFile.type.startsWith('image/')) {
      return NextResponse.json({ error: "見積書は画像ファイルである必要があります" }, { status: 400 });
    }
    if (planFile && !planFile.type.startsWith('image/')) {
      return NextResponse.json({ error: "募集図面は画像ファイルである必要があります" }, { status: 400 });
    }
    if (conditionFile && !conditionFile.type.startsWith('image/')) {
      return NextResponse.json({ error: "条件欄は画像ファイルである必要があります" }, { status: 400 });
    }

    const primaryModel = process.env.GEMINI_MODEL_NAME || "gemini-2.5-pro";
    
    console.log("🔧 設定確認:");
    console.log("  - 使用モデル:", primaryModel);
    console.log("  - APIキー設定:", GEMINI_API_KEY ? `✅ 設定済み (${GEMINI_API_KEY.substring(0, 10)}...)` : "❌ 未設定");
    console.log("  - 見積書ファイル:", estimateFile ? `✅ ${estimateFile.name} (${estimateFile.size} bytes)` : "❌ なし");
    console.log("  - 図面ファイル:", planFile ? `✅ ${planFile.name} (${planFile.size} bytes)` : "なし");
    console.log("  - 条件欄ファイル:", conditionFile ? `✅ ${conditionFile.name} (${conditionFile.size} bytes)` : "なし");

    // 【重要】画像パーツを安全に作成
    // この段階で厳密なバリデーションが行われる
    const imageParts: GeminiImagePart[] = [];
    
    // 見積書画像パーツ作成
    let estimateImagePart: GeminiImagePart;
    try {
      estimateImagePart = await createImagePart(estimateFile);
      imageParts.push(estimateImagePart);
      console.log("✅ 見積書画像パーツ作成成功:", {
        mimeType: estimateImagePart.inlineData.mimeType,
        dataLength: estimateImagePart.inlineData.data.length,
      });
    } catch (imageError: any) {
      console.error("❌ 見積書画像パーツ作成失敗:", imageError.message);
      return NextResponse.json({ 
        error: "見積書画像の処理に失敗しました", 
        details: imageError.message 
      }, { status: 400 });
    }

    // 図面画像パーツ作成（オプション）
    if (planFile) {
      try {
        const planImagePart = await createImagePart(planFile);
        imageParts.push(planImagePart);
        console.log("✅ 図面画像パーツ作成成功:", {
          mimeType: planImagePart.inlineData.mimeType,
          dataLength: planImagePart.inlineData.data.length,
        });
      } catch (imageError: any) {
        console.error("⚠️ 図面画像パーツ作成失敗（スキップ）:", imageError.message);
        // 図面はオプションなので、失敗しても続行
      }
    }

    // 条件欄画像パーツ作成（オプション）
    if (conditionFile) {
      try {
        const conditionImagePart = await createImagePart(conditionFile);
        imageParts.push(conditionImagePart);
        console.log("✅ 条件欄画像パーツ作成成功:", {
          mimeType: conditionImagePart.inlineData.mimeType,
          dataLength: conditionImagePart.inlineData.data.length,
        });
      } catch (imageError: any) {
        console.error("⚠️ 条件欄画像パーツ作成失敗（スキップ）:", imageError.message);
        // 条件欄もオプションなので、失敗しても続行
      }
    }

    // ========================================
    // 【第1段階】画像の種類を判定
    // ========================================
    const classificationPrompt = `
この画像を分析して、以下のどれに該当するか判定してください。

1. "estimate" - 賃貸の見積書・初期費用明細書
2. "flyer" - 賃貸の募集図面・マイソク
3. "face" - 人の顔が写っている写真
4. "animal" - 動物が写っている写真
5. "food" - 食べ物の写真
6. "scenery" - 風景・建物の写真
7. "other" - その他

JSON形式で出力してください:
{
  "type": "estimate" | "flyer" | "face" | "animal" | "food" | "scenery" | "other",
  "confidence": 0-100,
  "description": "画像の簡単な説明"
}
`;

    // 分類用コンテンツを構築（見積書画像のみ使用）
    let classificationContent: GeminiContentPart[];
    try {
      classificationContent = buildGeminiContent([estimateImagePart], classificationPrompt);
      console.log("✅ 分類用コンテンツ構築成功");
      debugGeminiContent(classificationContent);
    } catch (buildError: any) {
      console.error("❌ 分類用コンテンツ構築失敗:", buildError.message);
      return NextResponse.json({ 
        error: "リクエストの構築に失敗しました", 
        details: buildError.message 
      }, { status: 500 });
    }

    // 【ガード】API呼び出し前の最終チェック
    const classificationValidation = validateContentBeforeApiCall(classificationContent);
    if (!classificationValidation.valid) {
      console.error("❌ 分類コンテンツ検証失敗:", classificationValidation.error);
      return NextResponse.json({ 
        error: "画像データが不正です", 
        details: classificationValidation.error 
      }, { status: 400 });
    }
    
    // 【追加検証】テキストパーツが正しい形式であることを確認
    for (let i = 0; i < classificationContent.length; i++) {
      const part = classificationContent[i];
      if ("text" in part) {
        if (typeof part !== "object" || Array.isArray(part) || typeof part.text !== "string") {
          console.error(`❌ 致命的エラー: 分類コンテンツのパーツ[${i}]（テキスト）が正しい形式ではありません`);
          return NextResponse.json({ 
            error: "リクエストの形式が不正です", 
            details: `テキストパーツ[${i}]が { text: string } 形式ではありません` 
          }, { status: 400 });
        }
        console.log(`✅ 分類コンテンツ パーツ[${i}]（テキスト）検証OK: { text: "${part.text.substring(0, 30)}..." }`);
      }
    }
    
    const model = genAI.getGenerativeModel({ 
      model: primaryModel, 
      generationConfig: { 
        responseMimeType: "application/json",
        temperature: 0
      }
    });
    
    console.log("🔍 画像分類開始... モデル:", primaryModel);
    let classification;
    try {
      // 【重要】generateContentにはパーツ配列を直接渡す（SDKの正しい使い方）
      // 各パーツは必ず { inlineData: {...} } または { text: string } のオブジェクト形式である必要がある
      console.log("📤 generateContent呼び出し前の最終確認（分類）:");
      console.log(`  - パーツ数: ${classificationContent.length}`);
      classificationContent.forEach((part, idx) => {
        console.log(`  - パーツ[${idx}]: ${"inlineData" in part ? "画像" : "text" in part ? "テキスト" : "不明"}, 型: ${typeof part}`);
      });
      
      const classificationResult = await model.generateContent(classificationContent);
      const classificationText = classificationResult.response.text();
      console.log("✅ 分類API応答受信（最初の500文字）:", classificationText.substring(0, 500));
      const cleanedClassification = classificationText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      classification = JSON.parse(cleanedClassification);
      console.log("✅ 画像分類成功:", classification);
    } catch (classificationError: any) {
      console.error("❌ ========== 画像分類エラー ==========");
      console.error("エラータイプ:", classificationError?.constructor?.name || typeof classificationError);
      console.error("エラーメッセージ:", classificationError?.message || "メッセージなし");
      console.error("エラースタック:", classificationError?.stack || "スタックなし");
      
      // ByteStringエラーの場合は詳細な情報を出力
      if (classificationError?.message?.includes("ByteString")) {
        console.error("⚠️ ByteStringエラーが発生しました - 画像データに無効な文字が含まれています");
        debugGeminiContent(classificationContent);
      }
      
      // APIキー関連のエラーをチェック
      if (classificationError?.message?.includes("API_KEY") || 
          classificationError?.message?.includes("api key") || 
          classificationError?.message?.includes("API key") ||
          classificationError?.message?.includes("401") ||
          classificationError?.message?.includes("403")) {
        console.error("⚠️ APIキー関連のエラーの可能性が高いです");
        console.error("GEMINI_API_KEY の設定を確認してください");
      }
      
      console.error("=====================================");
      throw new Error(`画像分類に失敗しました: ${classificationError.message}`);
    }
    
    console.log("画像分類結果:", classification);

    // ========================================
    // 【裏コマンド】関係ない画像の場合
    // ========================================
    if (classification.type !== "estimate" && classification.type !== "flyer") {
      console.log("裏コマンド発動！画像タイプ:", classification.type);
      
      let secretPrompt = "";
      
      if (classification.type === "face") {
        // 顔写真 → 占い風の診断
        secretPrompt = `
あなたは伝説の占い師「マダム・エステート」です。
この人物の写真から、運命を詳細に読み解いてください。

【重要ルール】
- 必ずポジティブで褒め倒す（ネガティブな表現は禁止）
- 各項目は3〜4文で具体的かつ詳細に書く
- 顔の特徴に言及しながら運勢を語る
- 部屋探しに絡めたアドバイスを入れる
- 行動指針は具体的で実行可能なアドバイス

【スコアの付け方 - 重要】
スコアはリアリティを持たせるために、項目ごとにバラつきを持たせてください：
- 65〜95の範囲で変動させる
- 全項目を高得点にしない（1〜2項目は70以下でも良い）
- 得意分野は90以上、成長中の分野は65〜75程度
- ただし、どの項目もポジティブな解釈で説明する

JSON形式で出力:
{
  "fortune_title": "マダム・エステートの運命鑑定",
  "fortune_subtitle": "あなただけの特別な運命を読み解きます",
  "fortune_person_type": "この人のタイプを一言で（例: 情熱的なリーダータイプ、穏やかな癒し系タイプ など）",
  "fortune_items": [
    {
      "category": "総合運",
      "score": 75-92の数値（リアルなバラつき）,
      "icon": "⭐",
      "detail": "3〜4文で具体的な運勢を語る。顔の特徴から読み取れる性格や運命について詳しく書く。",
      "lucky_item": "ラッキーアイテム（例: 観葉植物、ブルーのアイテムなど）"
    },
    {
      "category": "金運",
      "score": 65-90の数値（項目ごとに変える）,
      "icon": "💰",
      "detail": "金運についての詳細。お金の使い方や貯め方の傾向、これから訪れる金運の波について。スコアが低めでも「これから上昇の兆し」などポジティブに。",
      "lucky_item": "金運アップのアイテム"
    },
    {
      "category": "恋愛運",
      "score": 68-95の数値（バラつき持たせる）,
      "icon": "💕",
      "detail": "恋愛運についての詳細。この人の魅力や恋愛傾向、出会いのチャンスについて。",
      "lucky_item": "恋愛運アップのアイテム"
    },
    {
      "category": "仕事運",
      "score": 70-93の数値,
      "icon": "💼",
      "detail": "仕事運についての詳細。この人に向いている仕事や成功するコツについて。",
      "lucky_item": "仕事運アップのアイテム"
    },
    {
      "category": "住居運",
      "score": 80-98の数値（部屋探し関連なので高めOK）,
      "icon": "🏠",
      "detail": "住居運についての詳細。相性の良い物件の特徴や、部屋探しのベストタイミングについて。必ず部屋探しに絡める。",
      "lucky_direction": "吉方位（例: 東南、南西など）",
      "ideal_property": "この人に合う物件の特徴"
    }
  ],
  "fortune_action_advice": [
    "今日から実践できる具体的なアドバイス1（部屋探しに絡める）",
    "具体的なアドバイス2",
    "具体的なアドバイス3"
  ],
  "fortune_lucky_color": "ラッキーカラー",
  "fortune_lucky_number": "ラッキーナンバー",
  "fortune_power_spot": "パワースポット（例: 神社、海辺など）",
  "fortune_summary": "300文字以上の詳細な総括。この人の運命、才能、これからの展望について壮大に褒め倒す。最後は必ず「最高の物件との運命的な出会いが、もうすぐそこまで来ています✨」で締める。"
}
`;
      } else if (classification.type === "animal") {
        // 動物 → 動物鑑定
        secretPrompt = `
あなたは世界的に有名な動物鑑定士「ドクター・アニマルエステート」です。
この動物を詳細に鑑定してください。

【重要ルール】
- 必ずポジティブで褒め倒す（ネガティブ禁止）
- 各項目は3〜4文で具体的に書く
- 動物の特徴を細かく観察して言及する
- ペット可物件に絡めたアドバイスを入れる

【スコアの付け方 - 重要】
スコアはリアリティを持たせるために、項目ごとにバラつきを持たせてください：
- 70〜98の範囲で変動させる
- 1〜2項目は75以下でもOK（成長の余地として）
- 特に優れた点は95以上にしてメリハリを
- どの項目もポジティブな解釈で説明すること

JSON形式で出力:
{
  "fortune_title": "ドクター・アニマルエステートの特別鑑定",
  "fortune_subtitle": "この子の素晴らしさを科学的に証明します",
  "fortune_person_type": "この子のタイプ（例: 甘えん坊プリンス、クールビューティー など）",
  "fortune_items": [
    {
      "category": "可愛さ",
      "score": 82-98の数値（バラつき持たせる）,
      "icon": "💖",
      "detail": "3〜4文でこの子の可愛さを具体的に説明。表情、毛並み、目の輝きなど細部に言及。",
      "lucky_item": "この子が喜ぶアイテム"
    },
    {
      "category": "癒しパワー",
      "score": 75-95の数値,
      "icon": "✨",
      "detail": "この子が持つ癒しの力について詳しく。見ているだけでどんな効果があるかを語る。",
      "lucky_item": "癒し効果を高めるアイテム"
    },
    {
      "category": "知性",
      "score": 68-92の数値（個性として低めもあり）,
      "icon": "🧠",
      "detail": "この子の賢さについて。表情から読み取れる知性、コミュニケーション能力について。スコアが低めの場合は「素直さ」「無邪気さ」としてポジティブに。",
      "lucky_item": "知性を伸ばすアイテム"
    },
    {
      "category": "オーラ",
      "score": 78-96の数値,
      "icon": "🌟",
      "detail": "この子が放つオーラについて。周りに与える影響力や存在感について語る。",
      "lucky_item": "オーラを強めるアイテム"
    },
    {
      "category": "住居相性",
      "score": 85-98の数値（物件関連は高めOK）,
      "icon": "🏠",
      "detail": "この子と暮らすのに最適な物件の特徴。広さ、日当たり、周辺環境について具体的に。",
      "ideal_property": "この子に合う物件の条件",
      "lucky_direction": "吉方位"
    }
  ],
  "fortune_action_advice": [
    "この子との生活を最高にするためのアドバイス1（ペット可物件に絡める）",
    "具体的なアドバイス2",
    "具体的なアドバイス3"
  ],
  "fortune_lucky_color": "この子のラッキーカラー",
  "fortune_lucky_number": "ラッキーナンバー",
  "fortune_power_spot": "この子と行くべき場所",
  "fortune_summary": "300文字以上の詳細な総括。この子の素晴らしさを壮大に褒め倒す。最後は「この子と最高の暮らしができるペット可物件、きっと見つかります🏠✨」で締める。"
}
`;
      } else if (classification.type === "food") {
        // 食べ物 → グルメ鑑定
        secretPrompt = `
あなたは伝説の美食家「グルメ・エステート卿」です。
この料理を詳細に鑑定してください。

【重要ルール】
- 必ずポジティブで褒め倒す（ネガティブ禁止）
- 各項目は3〜4文で具体的に書く
- 料理の特徴を細かく観察して言及する
- キッチンや物件に絡めたアドバイスを入れる

【スコアの付け方 - 重要】
スコアはリアリティを持たせるために、項目ごとにバラつきを持たせてください：
- 65〜96の範囲で変動させる
- 1〜2項目は70台前半でもOK（伸びしろとして）
- 特に優れた点は90以上にしてメリハリを
- どの項目もポジティブな解釈で説明すること

JSON形式で出力:
{
  "fortune_title": "グルメ・エステート卿の三ツ星鑑定",
  "fortune_subtitle": "この逸品の真価を見極めます",
  "fortune_person_type": "料理の格付け（例: ミシュラン級の逸品、心を満たすソウルフード など）",
  "fortune_items": [
    {
      "category": "ビジュアル",
      "score": 72-95の数値（バラつき持たせる）,
      "icon": "📸",
      "detail": "3〜4文で見た目の素晴らしさを詳しく。色彩、盛り付け、器との調和について。",
      "lucky_item": "この料理に合う飲み物"
    },
    {
      "category": "美味しさ",
      "score": 78-96の数値,
      "icon": "😋",
      "detail": "味わいの予測を詳しく。香り、食感、味のバランスについて想像して語る。",
      "lucky_item": "味を引き立てるもの"
    },
    {
      "category": "幸福度",
      "score": 75-94の数値,
      "icon": "💖",
      "detail": "この料理を食べた人がどれだけ幸せになれるかを語る。心理的効果について。",
      "lucky_item": "幸福度を上げるもの"
    },
    {
      "category": "料理力",
      "score": 65-90の数値（謙虚さも評価）,
      "icon": "👨‍🍳",
      "detail": "作り手の料理スキルを詳しく褒める。技術、センス、愛情について。スコアが控えめでも「家庭的な温かみ」などポジティブに。",
      "lucky_item": "料理力を上げるアイテム"
    },
    {
      "category": "キッチン運",
      "score": 82-97の数値（物件関連は高めOK）,
      "icon": "🏠",
      "detail": "この料理を作れる人にふさわしいキッチンについて。理想の物件の条件を語る。",
      "ideal_property": "理想のキッチンの条件",
      "lucky_direction": "キッチンの吉方位"
    }
  ],
  "fortune_action_advice": [
    "料理の腕を活かすためのアドバイス1（キッチン付き物件に絡める）",
    "具体的なアドバイス2",
    "具体的なアドバイス3"
  ],
  "fortune_lucky_color": "料理に合うカラー",
  "fortune_lucky_number": "ラッキーナンバー",
  "fortune_power_spot": "食の運気を上げる場所",
  "fortune_summary": "300文字以上の詳細な総括。この料理と作り手を壮大に褒め倒す。最後は「こんな素晴らしい料理を作れるあなたには、広いキッチンのある物件がきっと見つかります🏠✨」で締める。"
}
`;
      } else {
        // その他 → 万能褒め鑑定
        secretPrompt = `
あなたは「万物鑑定士マスター・エステート」です。
この画像を詳細に鑑定してください。

画像の内容: ${classification.description}

【重要ルール】
- 必ずポジティブで褒め倒す（ネガティブ禁止）
- 各項目は3〜4文で具体的に書く
- 画像の特徴を細かく観察して言及する
- 不動産や新生活に絡めたアドバイスを入れる

【スコアの付け方 - 重要】
スコアはリアリティを持たせるために、項目ごとにバラつきを持たせてください：
- 65〜95の範囲で変動させる
- 1〜2項目は75以下でもOK（成長の可能性として）
- 特に優れた点は90以上にしてメリハリを
- どの項目もポジティブな解釈で説明すること

JSON形式で出力:
{
  "fortune_title": "マスター・エステートの特別鑑定",
  "fortune_subtitle": "この画像に秘められた価値を見極めます",
  "fortune_person_type": "この画像のタイプ（例: 芸術的センスの結晶、幸運を呼ぶ一枚 など）",
  "fortune_items": [
    {
      "category": "素晴らしさ",
      "score": 75-93の数値（バラつき持たせる）,
      "icon": "✨",
      "detail": "3〜4文でこの画像の素晴らしさを具体的に説明。構図、被写体、雰囲気について。",
      "lucky_item": "この画像に関連するラッキーアイテム"
    },
    {
      "category": "芸術性",
      "score": 68-92の数値,
      "icon": "🎨",
      "detail": "芸術的な観点から詳しく分析。色彩、バランス、印象について語る。スコアが控えめでも「素朴な美しさ」などポジティブに。",
      "lucky_item": "芸術性を高めるアイテム"
    },
    {
      "category": "センス",
      "score": 72-95の数値,
      "icon": "💎",
      "detail": "この画像を選んだ/撮った人のセンスについて詳しく褒める。",
      "lucky_item": "センスを磨くアイテム"
    },
    {
      "category": "運気",
      "score": 70-90の数値,
      "icon": "🌟",
      "detail": "この画像から感じる運気について。見た人にどんな良い影響があるか。",
      "lucky_item": "運気を上げるアイテム"
    },
    {
      "category": "住居運",
      "score": 80-96の数値（物件関連は高めOK）,
      "icon": "🏠",
      "detail": "この画像を持つ人の住居運について。理想の物件との出会いについて語る。",
      "ideal_property": "相性の良い物件の特徴",
      "lucky_direction": "吉方位"
    }
  ],
  "fortune_action_advice": [
    "この画像から得られる幸運を活かすアドバイス1（物件探しに絡める）",
    "具体的なアドバイス2",
    "具体的なアドバイス3"
  ],
  "fortune_lucky_color": "ラッキーカラー",
  "fortune_lucky_number": "ラッキーナンバー",
  "fortune_power_spot": "パワースポット",
  "fortune_summary": "300文字以上の詳細な総括。この画像と持ち主を壮大に褒め倒す。最後は「このセンスをお持ちのあなたには、きっと最高の物件が見つかります🏠✨」で締める。"
}
`;
      }

      // 裏コマンドモード用のコンテンツを構築
      let secretContent: GeminiContentPart[];
      try {
        secretContent = buildGeminiContent([estimateImagePart], secretPrompt);
        console.log("✅ 裏コマンド用コンテンツ構築成功");
        debugGeminiContent(secretContent);
      } catch (buildError: any) {
        console.error("❌ 裏コマンド用コンテンツ構築失敗:", buildError.message);
        return NextResponse.json({ 
          error: "リクエストの構築に失敗しました", 
          details: buildError.message 
        }, { status: 500 });
      }

      // 【ガード】API呼び出し前の最終チェック
      const secretValidation = validateContentBeforeApiCall(secretContent);
      if (!secretValidation.valid) {
        console.error("❌ 裏コマンドコンテンツ検証失敗:", secretValidation.error);
        return NextResponse.json({ 
          error: "画像データが不正です", 
          details: secretValidation.error 
        }, { status: 400 });
      }

      // 【追加検証】テキストパーツが正しい形式であることを確認
      for (let i = 0; i < secretContent.length; i++) {
        const part = secretContent[i];
        if ("text" in part) {
          if (typeof part !== "object" || Array.isArray(part) || typeof part.text !== "string") {
            console.error(`❌ 致命的エラー: 裏コマンドコンテンツのパーツ[${i}]（テキスト）が正しい形式ではありません`);
            return NextResponse.json({ 
              error: "リクエストの形式が不正です", 
              details: `テキストパーツ[${i}]が { text: string } 形式ではありません` 
            }, { status: 400 });
          }
          console.log(`✅ 裏コマンドコンテンツ パーツ[${i}]（テキスト）検証OK: { text: "${part.text.substring(0, 30)}..." }`);
        }
      }

      const secretModel = genAI.getGenerativeModel({ 
        model: primaryModel, 
        generationConfig: { 
          responseMimeType: "application/json",
          temperature: 0.9 // 創造性を上げる
        }
      });
      
      try {
        console.log("🔮 裏コマンド診断開始... タイプ:", classification.type);
        // 【重要】generateContentにはパーツ配列を直接渡す（SDKの正しい使い方）
        // 各パーツは必ず { inlineData: {...} } または { text: string } のオブジェクト形式である必要がある
        console.log("📤 generateContent呼び出し前の最終確認（裏コマンド）:");
        console.log(`  - パーツ数: ${secretContent.length}`);
        secretContent.forEach((part, idx) => {
          console.log(`  - パーツ[${idx}]: ${"inlineData" in part ? "画像" : "text" in part ? "テキスト" : "不明"}, 型: ${typeof part}`);
        });
        
        const secretResult = await secretModel.generateContent(secretContent);
        const secretText = secretResult.response.text();
        console.log("✅ 裏コマンドAI応答受信（最初の500文字）:", secretText.substring(0, 500));
        
        const cleanedSecret = secretText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const secretJson = JSON.parse(cleanedSecret);
        
        // 裏コマンドフラグを追加
        secretJson.is_secret_mode = true;
        secretJson.secret_type = classification.type;
        secretJson.has_unconfirmed_items = false;
        secretJson.unconfirmed_item_names = [];
        
        console.log("✅ 裏コマンド診断完了！");
        return NextResponse.json({ result: secretJson });
      } catch (secretError: any) {
        console.error("❌ ========== 裏コマンドエラー ==========");
        console.error("エラータイプ:", secretError?.constructor?.name || typeof secretError);
        console.error("エラーメッセージ:", secretError?.message || "メッセージなし");
        console.error("エラースタック:", secretError?.stack || "スタックなし");
        
        // ByteStringエラーの場合は詳細な情報を出力
        if (secretError?.message?.includes("ByteString")) {
          console.error("⚠️ ByteStringエラーが発生しました - 画像データに無効な文字が含まれています");
          debugGeminiContent(secretContent);
        }
        
        // APIキー関連のエラーをチェック
        if (secretError?.message?.includes("API_KEY") || 
            secretError?.message?.includes("api key") || 
            secretError?.message?.includes("API key") ||
            secretError?.message?.includes("401") ||
            secretError?.message?.includes("403")) {
          console.error("⚠️ APIキー関連のエラーの可能性が高いです");
          console.error("GEMINI_API_KEY の設定を確認してください");
        }
        
        console.error("=====================================");
        throw new Error(`裏コマンド処理エラー: ${secretError.message}`);
      }
    }

    // ========================================
    // 【通常モード】見積書/図面の診断
    // ========================================
    console.log("通常診断モード開始...");
    
    const prompt = `
あなたは「入居者の味方をする、経験豊富な不動産コンサルタント」です。
見積書と募集図面を**厳密に照合**し、不当な費用を見つけ出してください。

## 【画像の説明】
- 1枚目: 見積書（必須）
- 2枚目以降: 募集図面（マイソク）または条件欄のアップ画像（任意）

---

## 【禁止事項・制約】
- **絶対に使用禁止のワード**: 「AD」「広告料」「バックマージン」「キックバック」などの業界裏事情用語は一切使わないこと
- **過度な期待を持たせる表現の禁止**: 「仲介手数料が0円になる」といった保証できない内容は書かないこと
- **仲介手数料が賃料の0.5ヶ月分（税別）以下の場合**: 「fair（適正）」とすること
- **削減可能額の最大化**: 削減できる可能性がある項目は、必ず「cut」または「negotiable」として判定し、削減可能額に計上してください。「fair」は本当に削減の余地がない場合のみ使用してください

---

## 【重要】類似項目の名称マッチング

以下の項目は**同一項目**として扱ってください：
- 「入居者安心サポート」「24時間サポート」「24時間ライフサポート」「安心サポート」「緊急サポート」→ すべて同じ
- 「消毒」「抗菌」「室内消毒」「室内抗菌」「消毒施工」「抗菌消臭」「室内抗菌・消毒施工費」→ すべて同じ

---

## 【最重要】判定ルールと4つのカテゴリ

以下の優先順位に従って、機械的に判定を行ってください。

### 優先順位1：【仲介手数料の厳格判定】
**重要**: 仲介手数料は原則として賃料の0.5ヶ月分（税別）＝0.55ヶ月分（税込）が適正です。これを超える場合は必ず削減可能として判定してください。

| 条件 | 判定 (status) | 適正価格 (price_fair) | 理由 (reason) |
| :--- | :--- | :--- | :--- |
| **賃料の1ヶ月分（税込）以上の場合** | **negotiable** | 賃料の0.55ヶ月分（税込） | "原則は賃料の0.5ヶ月分（税別）＝0.55ヶ月分（税込）です。1ヶ月分以上の場合、交渉により0.55ヶ月分まで減額できる可能性が高いです。" |
| **賃料の0.6ヶ月分（税込）以上、1ヶ月分未満の場合** | **negotiable** | 賃料の0.55ヶ月分（税込） | "0.5ヶ月分（税別）を超えているため、交渉により0.55ヶ月分まで減額できる可能性があります。" |
| **賃料の0.55ヶ月分（税込）以下の場合** | **fair** | そのまま | "適正な金額です。" |
| **火災保険が2万円超の場合** | **negotiable** | 15,000〜20,000 | "相場より割高です。自分で安い保険（借家人賠償責任保険）に加入できる可能性があります。" |

### 優先順位2：【付帯費用の厳格判定】
**対象キーワード**: 害虫駆除, 室内消毒, 消臭抗菌, 24時間サポート, 安心サポート, 緊急サポート, 事務手数料, 書類作成費, 入居者安心サポート, 24時間ライフサポート

**重要原則**: これらの付帯費用は原則として「不要（0円にできる）」と判定してください。削減可能額にしっかり計上することが重要です。

**重要**: 鍵交換費用は含めないこと（鍵交換は通常必須のため）

1. **図面がアップロードされていない場合 OR 図面に該当項目の記載が確認できない場合**
   - 判定: **cut** （削減可能額に計上）
   - 適正価格: 0円
   - 理由: "一般的には任意のオプションサービスです。不要であれば外せます。交渉により削減できます。"

2. **図面に記載があり「任意」「オプション」と明記されている場合**
   - 判定: **cut** （削減可能額に計上）
   - 適正価格: 0円
   - 理由: "任意のオプションサービスです。不要であれば外せます。"

3. **図面に記載があり「必須」と明記されている場合**
   - 判定: **negotiable** （削減可能額に計上）
   - 適正価格: 0円
   - 理由: "図面に記載がありますが、交渉次第で外せる可能性が高いです。削減を試みる価値があります。"

4. **図面に記載がなく、かつ一般的に不要と判断できる項目**
   - 判定: **cut** （削減可能額に計上）
   - 適正価格: 0円
   - 理由: "一般的には不要なオプションサービスです。交渉により削減できます。"

### 優先順位3：【要確認項目】（Warning）※削減可能額に含まれない
**重要**: このカテゴリは極力使わないでください。削減可能額に計上されないため、可能な限り「cut」または「negotiable」として判定してください。

**例外ケース**: 図面に明確に「必須」と記載があり、かつ削減が困難と判断される場合のみ「warning」を使用してください。

### 優先順位4：【ホワイトリスト項目】（適正）
対象: **敷金, 礼金, 賃料, 前家賃, 共益費/管理費, 更新料, 保証会社利用料, 鍵交換代, 町内会費, 口座振替手数料, クリーニング費**

**重要**: これらの項目は基本的に適正ですが、削減可能な余地がある場合は必ず「negotiable」として判定し、削減可能額に計上してください。

1. **基本ルール**
   - 見積書に記載があれば、**図面から読み取れなくても "fair"** と判定する
   - 理由: "物件固有の条件であり、適正な費用です。"

2. **例外（Cut/Negotiableにするケース）**
   - 図面に明確に**「礼金0円」「礼金なし」「鍵交換代無」**という文字が読み取れた場合に限り、**cut** とする
   - 更新料が高額（賃料の1ヶ月分以上）の場合、**negotiable** として判定し、適正価格を設定する
   - 保証会社利用料が相場（3,000〜5,000円）を大幅に超える場合、**negotiable** として判定する

---

## 【出力形式】JSON

Markdown記法は含めず、純粋なJSON文字列だけを返してください。

## 【最重要】判定の厳格化ルール

**削減可能額を最大化するために、以下のルールを厳格に守ってください：**

1. **「fair（適正）」は最小限に**: 本当に削減の余地がない場合のみ「fair」と判定してください。少しでも削減できる可能性がある場合は「negotiable」または「cut」として判定し、削減可能額に計上してください。

2. **付帯費用は原則「cut」**: 「安心サポート」「除菌消臭」「書類作成費」「事務手数料」などの付帯費用は、図面に「必須」と明記されていない限り、原則として「cut（0円）」として判定してください。

3. **仲介手数料の厳格判定**: 賃料の1ヶ月分（税込）以上の場合、必ず「negotiable」として判定し、適正価格を「賃料の0.55ヶ月分（税込）」に設定してください。

4. **「warning」は極力使わない**: 「warning」は削減可能額に含まれません。削減の余地がある場合は必ず「cut」または「negotiable」として判定してください。

5. **削減可能額の算出**: 各項目の price_original から price_fair を引いた値を正確に計算し、discount_amount に反映してください。status が「cut」または「negotiable」の項目は必ず削減可能額に含めてください。

**重要**: "warning" 項目の金額は、discount_amountやtotal_fairの計算に含めないこと。ただし、可能な限り「warning」を使わず、「cut」または「negotiable」として判定してください。

{
  "property_name": "物件名（不明なら'物件名入力なし'）",
  "room_number": "号室",
  "items": [
    {
      "name": "見積書に記載された項目名",
      "price_original": 見積書の金額（数値）,
      "price_fair": 適正価格（数値）,
      "status": "fair|negotiable|cut|warning",
      "reason": "上記の判定ルールに基づいた具体的なアドバイス",
      "is_insurance": true/false（火災保険の場合のみtrue）
    }
  ],
  "total_original": 見積書合計,
  "total_fair": 適正合計（warningは含めず、fairとnegotiableのみで計算）,
  "discount_amount": 差額（total_original - total_fair）,
  "warning_amount": warning項目の合計金額,
  "has_flyer": 図面がアップロードされているかどうか（true/false）,
  "pro_review": {
    "content": "この物件の初期費用における最大の問題点と、次に取るべき具体的なアクション。warning項目がある場合は図面確認を促す内容を含めること。"
  },
  "risk_score": 0〜100（削減額の割合に応じて算出、warning分は含めない）
}
`;

    // 通常診断用のコンテンツを構築
    let mainContent: GeminiContentPart[];
    try {
      mainContent = buildGeminiContent(imageParts, prompt);
      console.log("✅ 通常診断用コンテンツ構築成功");
      debugGeminiContent(mainContent);
    } catch (buildError: any) {
      console.error("❌ 通常診断用コンテンツ構築失敗:", buildError.message);
      return NextResponse.json({ 
        error: "リクエストの構築に失敗しました", 
        details: buildError.message 
      }, { status: 500 });
    }

    // 【ガード】API呼び出し前の最終チェック
    const mainValidation = validateContentBeforeApiCall(mainContent);
    if (!mainValidation.valid) {
      console.error("❌ 通常診断コンテンツ検証失敗:", mainValidation.error);
      return NextResponse.json({ 
        error: "画像データが不正です", 
        details: mainValidation.error 
      }, { status: 400 });
    }
    
    // 【追加検証】テキストパーツが正しい形式であることを確認
    for (let i = 0; i < mainContent.length; i++) {
      const part = mainContent[i];
      if ("text" in part) {
        if (typeof part !== "object" || Array.isArray(part) || typeof part.text !== "string") {
          console.error(`❌ 致命的エラー: 通常診断コンテンツのパーツ[${i}]（テキスト）が正しい形式ではありません`);
          return NextResponse.json({ 
            error: "リクエストの形式が不正です", 
            details: `テキストパーツ[${i}]が { text: string } 形式ではありません` 
          }, { status: 400 });
        }
        console.log(`✅ 通常診断コンテンツ パーツ[${i}]（テキスト）検証OK: { text: "${part.text.substring(0, 30)}..." }`);
      }
    }
    
    console.log("🤖 通常診断モード: AIリクエスト送信...");
    let result;
    let responseText;
    try {
      // 【重要】generateContentにはパーツ配列を直接渡す（SDKの正しい使い方）
      // 各パーツは必ず { inlineData: {...} } または { text: string } のオブジェクト形式である必要がある
      console.log("📤 generateContent呼び出し前の最終確認（通常診断）:");
      console.log(`  - パーツ数: ${mainContent.length}`);
      mainContent.forEach((part, idx) => {
        console.log(`  - パーツ[${idx}]: ${"inlineData" in part ? "画像" : "text" in part ? "テキスト" : "不明"}, 型: ${typeof part}`);
      });
      
      result = await model.generateContent(mainContent);
      responseText = result.response.text();
      console.log("✅ AI応答を受信しました（長さ:", responseText.length, "文字）");
    } catch (generateError: any) {
      console.error("❌ ========== AI生成エラー ==========");
      console.error("エラータイプ:", generateError?.constructor?.name || typeof generateError);
      console.error("エラーメッセージ:", generateError?.message || "メッセージなし");
      console.error("エラースタック:", generateError?.stack || "スタックなし");
      
      // ByteStringエラーの場合は詳細な情報を出力
      if (generateError?.message?.includes("ByteString")) {
        console.error("⚠️ ByteStringエラーが発生しました - 画像データに無効な文字が含まれています");
        debugGeminiContent(mainContent);
      }
      
      // APIキー関連のエラーをチェック
      if (generateError?.message?.includes("API_KEY") || 
          generateError?.message?.includes("api key") || 
          generateError?.message?.includes("API key") ||
          generateError?.message?.includes("401") ||
          generateError?.message?.includes("403")) {
        console.error("⚠️ APIキー関連のエラーの可能性が高いです");
        console.error("GEMINI_API_KEY の設定を確認してください");
      }
      
      console.error("=====================================");
      throw generateError;
    }
    
    // JSONパース
    let json;
    try {
      const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      console.log("📝 パース前のテキスト（最初の1000文字）:", cleanedText.substring(0, 1000));
      json = JSON.parse(cleanedText);
      console.log("✅ JSONパース成功");
    } catch (parseError: any) {
      console.error("❌ ========== JSON Parse Error ==========");
      console.error("エラーメッセージ:", parseError.message);
      console.error("エラースタック:", parseError.stack);
      console.error("レスポンス全文の長さ:", responseText.length);
      console.error("レスポンス全文（最初の2000文字）:", responseText.substring(0, 2000));
      console.error("レスポンス全文（最後の500文字）:", responseText.substring(Math.max(0, responseText.length - 500)));
      console.error("=========================================");
      throw new Error(`AIの応答の解析に失敗しました: ${parseError.message}\n応答の最初の500文字: ${responseText.substring(0, 500)}`);
    }
    
    // 後処理
    if (json.items && Array.isArray(json.items)) {
      json.items = json.items.map((item: any) => {
        if (item.price_original === null) {
          return {
            ...item,
            price_original: 0,
            requires_confirmation: true,
            reason: item.reason + "（※読み取り要確認）"
          };
        }
        return {
          ...item,
          requires_confirmation: false
        };
      });
      
      const hasUnconfirmed = json.items.some((item: any) => item.requires_confirmation);
      json.has_unconfirmed_items = hasUnconfirmed;
      json.unconfirmed_item_names = json.items
        .filter((item: any) => item.requires_confirmation)
        .map((item: any) => item.name);
      
      // 削減可能額を各項目の削減額の合計として再計算
      // warning項目は除外し、各項目の price_original - price_fair を合計する
      try {
        const aiCalculatedDiscount = json.discount_amount ?? 0; // AIが計算した元の値を保持
        const calculatedDiscountAmount = json.items
          .filter((item: any) => item && item.status !== 'warning') // warning項目を除外
          .reduce((sum: number, item: any) => {
            // 数値に変換（文字列やnullの場合は0として扱う）
            const original = typeof item.price_original === 'number' ? item.price_original : 
                            (typeof item.price_original === 'string' ? parseFloat(item.price_original) || 0 : 0);
            const fair = typeof item.price_fair === 'number' ? item.price_fair : 
                        (typeof item.price_fair === 'string' ? parseFloat(item.price_fair) || 0 : 0);
            const itemDiscount = original - fair;
            return sum + Math.max(0, itemDiscount); // 負の値は0として扱う
          }, 0);
        
        // 計算した削減額で上書き
        json.discount_amount = calculatedDiscountAmount;
        
        console.log("削減額再計算:", {
          ai_calculated: aiCalculatedDiscount,
          recalculated: calculatedDiscountAmount,
          difference: aiCalculatedDiscount - calculatedDiscountAmount,
          items_count: json.items.length,
          non_warning_items: json.items.filter((item: any) => item && item.status !== 'warning').length
        });
      } catch (calcError: any) {
        console.error("削減額再計算エラー:", calcError);
        console.error("エラー詳細:", {
          message: calcError.message,
          stack: calcError.stack,
          json_items: json.items ? JSON.stringify(json.items.slice(0, 3)) : 'items not found'
        });
        // エラーが発生した場合は、AIが計算した値をそのまま使用（フォールバック）
        console.warn("削減額の再計算に失敗しました。AIが計算した値をそのまま使用します。");
      }
    }

    console.log("診断完了:", {
      items_count: json.items?.length,
      total_original: json.total_original,
      discount_amount: json.discount_amount
    });

    return NextResponse.json({ result: json });

  } catch (error: any) {
    console.error("❌ ========== サーバーエラー ==========");
    console.error("エラータイプ:", error?.constructor?.name || typeof error);
    console.error("エラーメッセージ:", error?.message || "メッセージなし");
    console.error("エラーステータス:", error?.status || "ステータスなし");
    console.error("エラースタック:", error?.stack || "スタックなし");
    
    // APIキー関連のエラーをチェック
    if (error?.message?.includes("API_KEY") || error?.message?.includes("api key") || error?.message?.includes("API key")) {
      console.error("⚠️ APIキー関連のエラーの可能性があります");
      console.error("GEMINI_API_KEY の設定を確認してください");
    }
    
    // Gemini APIのエラーをチェック
    if (error?.message?.includes("429") || error?.status === 429) {
      console.error("⚠️ APIレート制限に達しました");
    }
    
    let errorMessage = "解析エラーが発生しました";
    let errorDetails = error.message || "不明なエラー";
    
    // より詳細なエラー情報をログに記録
    if (error.message) {
      console.error("エラーメッセージ詳細:", error.message);
      if (error.message.includes("削減額再計算")) {
        console.error("削減額再計算でエラーが発生しました");
        errorMessage = "削減額の計算中にエラーが発生しました";
        errorDetails = "診断結果の処理中に問題が発生しました。もう一度お試しください。";
      } else if (error.message.includes("JSON") || error.message.includes("パース")) {
        errorMessage = "AIからの応答の解析に失敗しました";
        errorDetails = "もう一度お試しください。";
      } else if (error.message.includes("API_KEY") || error.message?.includes("api key")) {
        errorMessage = "APIキーが正しく設定されていません";
        errorDetails = "サーバー管理者にお問い合わせください。";
      } else if (error.message.includes("ByteString")) {
        errorMessage = "画像データの処理に失敗しました";
        errorDetails = "画像データに問題があります。別の画像で再度お試しください。";
      }
    }
    
    if (error.status === 429 || error.message?.includes('429')) {
      errorMessage = "APIレート制限に達しました";
      errorDetails = "しばらく時間をおいてから再度お試しください。";
    }
    
    console.error("返却するエラーレスポンス:", { error: errorMessage, details: errorDetails, status: error.status || 500 });
    console.error("=====================================");
    
    return NextResponse.json({ 
      error: errorMessage, 
      details: errorDetails
    }, { status: error.status || 500 });
  }
}
