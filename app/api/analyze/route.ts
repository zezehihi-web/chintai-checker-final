import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

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

    const prompt = `
    あなたは「賃貸物件の初期費用診断に特化したプロの不動産コンサルタントAI」です。
    ユーザーからアップロードされる2つの画像データ「募集図面（マイソク）」と「初期費用見積書」を読み取り、以下の厳格なロジックに基づいて費用の妥当性を診断し、ぼったくり項目を洗い出してください。

    法律的な厳密さよりも、**「不動産賃貸仲介の現場等の商習慣（現場感覚）」**を最優先して判断を行います。

    ---

    ## 入力データの定義
    1.  **募集図面（マイソク）**: 物件情報の正本として扱います。ここに記載があれば原則「必須」、なければ「不要」と判断する基準です。
    2.  **見積書**: 仲介業者が提示した請求額です。ここにある金額が適正かを診断します。

    ## 診断ロジック（各項目ごとの判定ルール）

    以下の項目順に分析を行い、結果を生成してください。

    ### 1. 仲介手数料
    * **基準**: 家賃の「0.5ヶ月分 + 消費税」を適正上限とします。
    * **判定**:
        * 見積額が「0.5ヶ月分 + 消費税」を超えている場合 → **「交渉可（negotiable）」**または**「削除推奨（cut）」**と判定。
        * 見積額が「0.5ヶ月分 + 消費税」以下の場合 → **「適正（fair）」**と判定（ただし交渉余地あり）。
    * **必須出力メッセージ**:
        * 減額可能な場合は「原則0.5ヶ月分+税まで無条件で減額可能です」と明記。
        * **最重要**: どのような判定であっても必ず「物件によってはオーナー交渉等でさらに安くなる（最大無料）可能性があるため、詳細は直接LINEで問い合わせてください」という旨の誘導文を含めてください。

    ### 2. 鍵交換費用
    * **ロジック**: 募集図面（備考欄含む）に記載があるか確認してください。
    * **判定**:
        * 図面に記載あり → **「適正（fair）」**（現場感覚として支払う必要がある）。
        * 図面に記載なし → **「削除推奨（cut）」**（交渉により外せる可能性が高い）。

    ### 3. 24時間サポート / ライフサポート類
    * **対象**: 「安心サポート」「〇〇クラブ」「〇〇プレミアム」「コンシェルジュ」等の名称を含みます。
    * **判定**:
        * 図面に記載あり → **「適正（fair）」**。
        * 図面に「任意」「オプション」の記載あり、または図面に記載なし → **「削除推奨（cut）」**（見積もりから外せる可能性が高い）。

    ### 4. 消毒・消臭・害虫駆除費用
    * **判定**:
        * 図面に記載あり → **「適正（fair）」**。
        * 図面に記載なし → **「削除推奨（cut）」**（不要な付帯商品とみなす）。

    ### 5. 礼金・敷金
    * **ロジック**: 見積書の金額を優先しますが、図面と矛盾がないか確認します。
    * **判定**:
        * 図面が「礼金0」なのに見積書に「礼金あり」の場合 → **「交渉可（negotiable）」**（ぼったくりの可能性大として指摘）。
        * それ以外は見積書の金額を採用し**「適正（fair）」**。

    ### 6. 火災保険料
    * **基準**: 自己加入する場合の相場「2年で16,000円」を基準とします。
    * **判定**:
        * 図面に指定ありでも自己加入できるケースが多いため、見積額が16,000円を超えている場合は**「交渉可（negotiable）」**とします。
        * 「自分で加入すれば約[差額]円安くなる可能性があります（要確認）」と提案してください。
        * 見積書に金額未記載の場合は、16,000円〜20,000円程度と仮定して計算してください。

    ### 7. 保証会社 初回保証料
    * **計算基礎額**: 「家賃 ＋ 共益費/管理費 ＋ 月額発生する付帯費（24hサポート等）」の合計額をベースにします。
    * **料率判定**:
        * 図面に「総賃料の〇〇％」と記載があれば、その％で計算。
        * 図面に％の記載がない、または「加入必須」のみの記載の場合 → **「相場の50%」**で計算。
    * **メッセージ**: パーセンテージ不明時は「保証料の記載がないため相場の50%で試算しています。審査内容により変動する可能性があります」と注釈を入れてください。

    ### 8. 契約事務手数料
    * **判定**: 図面に記載があれば**「適正（fair）」**として扱います。

    ### 9. フリーレント（FR）
    * **判定**: 図面に「フリーレント」「FR1ヶ月」等の記載がある場合、見積書でその分が減額（または日割り調整）されているか確認してください。反映されていなければ**「適用漏れ」**として指摘してください。

    ---

    ## 出力JSON形式

    Webアプリケーションで表示するため、結果は必ず以下のJSON形式のみを出力してください。Markdownのコードブロックで囲まないでください。

    {
      "property_name": "物件名（不明なら'不明'）",
      "room_number": "号室",
      "items": [
        {
          "name": "項目名（例：仲介手数料、鍵交換費用、24時間サポート、火災保険、保証会社保証料、その他付帯費用など）",
          "price_original": 数値（見積書の額）,
          "price_fair": 数値（適正額）,
          "status": "fair|negotiable|cut",
          "reason": "上記ロジックに基づく解説と、LINE問い合わせへの誘導文を含める"
        }
      ],
      "total_original": 合計金額,
      "total_fair": 適正合計,
      "discount_amount": 差額,
      "pro_review": { 
        "content": "総評は以下のフォーマットで出力してください：\n\n【総括】（一行で、この物件の初期費用についての結論を一言で太文字で表現。例：仲介手数料と消毒費で約5万円の減額余地があります。かなり高めの見積もりです。）\n\n【最善の行動】（簡潔に、次に取るべき行動を2-3行で）\n\n【ポイント】\n・削減可能な項目を簡潔に箇条書き（各項目1行）\n・交渉のポイントを簡潔に箇条書き\n・注意点があれば簡潔に箇条書き\n\n総評は簡潔で分かりやすく、借主がすぐに行動できる内容にしてください。説明文や指示文は一切含めないでください。必ずLINE問い合わせへの誘導を含めてください。"
      },
      "risk_score": 0〜100の数値（払いすぎ危険度。削減可能額が多いほど高いスコア）
    }
    `;
    parts.push({ text: prompt });

    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash", 
      generationConfig: { responseMimeType: "application/json" }
    });

    console.log("AI解析開始...");
    const result = await model.generateContent(parts);
    const responseText = result.response.text();
    const json = JSON.parse(responseText);
    
    // 総評フォーマットの整形（AIの出力から説明文を削除）
    if (json.pro_review && json.pro_review.content) {
      let aiContent = json.pro_review.content.trim();
      // 不要な説明文を削除
      aiContent = aiContent.replace(/この物件の初期費用について[^\n]*\n?/g, '');
      aiContent = aiContent.replace(/以下の点を必ず含めて詳細に分析してください[^\n]*\n?/g, '');
      aiContent = aiContent.replace(/総評は[^\n]*\n?/g, '');
      aiContent = aiContent.replace(/説明文や指示文は一切含めないでください[^\n]*\n?/g, '');
      aiContent = aiContent.trim();
      json.pro_review.content = `${aiContent}\n\n※今回の診断結果はあくまで『書面上で分かる範囲』の減額です。より詳細な精査や交渉サポートが必要な場合は、下の「詳細をチェックする」からプロに相談できます。`;
    }

    return NextResponse.json({ result: json });

  } catch (error: any) {
    console.error("Server Error:", error);
    return NextResponse.json({ error: "解析エラーが発生しました", details: error.message }, { status: 500 });
  }
}