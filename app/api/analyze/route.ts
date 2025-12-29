import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

// タイムアウト対策
export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const estimateFile = formData.get("estimate") as File;
    const planFile = formData.get("plan") as File | null;

    if (!estimateFile) {
      return NextResponse.json({ error: "見積書の画像が必要です" }, { status: 400 });
    }

    const parts: any[] = [];
    
    // 画像処理
    const estimateBuffer = Buffer.from(await estimateFile.arrayBuffer());
    parts.push({
      inlineData: { mimeType: estimateFile.type, data: estimateBuffer.toString("base64") },
    });

    if (planFile) {
      const planBuffer = Buffer.from(await planFile.arrayBuffer());
      parts.push({
        inlineData: { mimeType: planFile.type, data: planBuffer.toString("base64") },
      });
    }

    // ★ここにこれまでの「脳みそ」を集約しました
    const prompt = `
    あなたは「入居者の味方」となる不動産交渉の超プロフェッショナルです。
    宅地建物取引業法、消費者契約法、および最新の賃貸市場トレンド（SNSでの集客動向含む）に基づき、
    添付された見積書（と募集図面）を徹底的に精査し、借主が損をしないための「真の適正価格」を算出してください。

    【最重要：判定ロジック】
    以下の基準で厳格に判定してください。

    1. **募集図面との整合性チェック（最優先）**
       - 図面がある場合、そこに記載のない項目（消毒代、安心サポート、簡易消火器など）が見積もりに勝手に入っていたら、強い根拠（「契約条件ではありません」）を持って「削除推奨（cut）」としてください。
       - 図面に記載があっても「（任意）」「（オプション）」の表記があれば「交渉可」です。

    2. **火災保険の適正化**
       - 相場（単身1.5〜1.8万円/2年、ファミリー2〜2.5万円/2年）より高い場合、「交渉可（negotiable）」としてください。
       - 理由欄には「指定の保険が高い場合、自分で安い保険に加入することで減額できる可能性があります」と明記してください。

    3. **仲介手数料の「含み」**
       - 原則「0.5ヶ月分（税別）」を適正ラインとしますが、もし1ヶ月分請求されていたら「交渉可」です。
       - **重要:** たとえ0.5ヶ月になっていても、物件によっては「貸主負担」により**「仲介手数料0円」にできる可能性**があります。AIでは物件ごとのAD（広告料）有無までは判別できないため、総評で必ず「プロに確認すれば0円になるかも」と誘導してください。

    4. **鍵交換代**
       - 国交省ガイドラインでは原則「貸主負担」です。図面に「借主負担」と明記がない限り交渉可能です。

    【出力JSONの構造】
    Markdown記法は含めず、純粋なJSON文字列だけを返してください。
    {
      "property_name": "物件名",
      "room_number": "号室",
      "items": [
        {
          "name": "項目名",
          "price_original": 数値,
          "price_fair": 適正数値,
          "status": "fair|negotiable|cut",
          "reason": "ユーザーがそのまま不動産屋に言えるような、説得力のある交渉フレーズ。法令やガイドラインを根拠に。",
          "is_insurance": true/false
        }
      ],
      "total_original": 合計,
      "total_fair": 適正合計,
      "discount_amount": 差額,
      "savings_magic": "浮いたお金でできること（ポジティブに）",
      "pro_review": { 
        "title": "AIエージェントからの重要アドバイス", 
        "content": "今回の診断結果はあくまで『書面上で分かる範囲』の減額です。実は、物件によっては仲介手数料が『0円』になったり、さらなる値引きができる可能性があります。これが適用できる物件かどうかは、業者間データベースでの確認が必要です。下のボタンからプロに問い合わせて、最終的な『最安値』を確認してください。" 
      },
      "knowledge": { 
        "title": "知っトク！賃貸の裏知識", 
        "content": "仲介手数料や付帯商品に関する、不動産業界のちょっとした裏話や豆知識。" 
      }
    }
    `;
    parts.push({ text: prompt });

    // モデル指定
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash", 
      generationConfig: { responseMimeType: "application/json" }
    });

    console.log("AI解析開始(脳みそ強化版)...");
    const result = await model.generateContent(parts);
    const responseText = result.response.text();
    const json = JSON.parse(responseText);
    
    return NextResponse.json({ result: json });

  } catch (error: any) {
    console.error("Server Error:", error);
    return NextResponse.json({ error: "解析エラーが発生しました", details: error.message }, { status: 500 });
  }
}