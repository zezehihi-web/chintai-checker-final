import { NextResponse } from "next/server";

// 一時的なストレージ（本番環境ではデータベースやRedisなどを使用）
const shareStorage = new Map<string, { data: any; createdAt: number }>();

// 24時間後に自動削除
const EXPIRY_TIME = 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { result } = body;

    if (!result) {
      return NextResponse.json({ error: "結果データが必要です" }, { status: 400 });
    }

    // 一意のIDを生成
    const shareId = Math.random().toString(36).substring(2, 15) + 
                    Math.random().toString(36).substring(2, 15);

    // 結果を保存（物件名などの個人情報を除外した共有用データ）
    const shareData = {
      items: result.items,
      total_original: result.total_original,
      total_fair: result.total_fair,
      discount_amount: result.discount_amount,
      pro_review: result.pro_review,
      risk_score: result.risk_score,
    };

    shareStorage.set(shareId, {
      data: shareData,
      createdAt: Date.now(),
    });

    // 期限切れデータをクリーンアップ
    cleanupExpiredData();

    return NextResponse.json({ shareId });
  } catch (error: any) {
    console.error("Share API Error:", error);
    return NextResponse.json({ error: "保存エラーが発生しました" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const shareId = searchParams.get("id");

    if (!shareId) {
      return NextResponse.json({ error: "共有IDが必要です" }, { status: 400 });
    }

    const stored = shareStorage.get(shareId);

    if (!stored) {
      return NextResponse.json({ error: "共有リンクが見つかりません" }, { status: 404 });
    }

    // 期限切れチェック
    if (Date.now() - stored.createdAt > EXPIRY_TIME) {
      shareStorage.delete(shareId);
      return NextResponse.json({ error: "共有リンクの有効期限が切れています" }, { status: 410 });
    }

    return NextResponse.json({ result: stored.data });
  } catch (error: any) {
    console.error("Share GET Error:", error);
    return NextResponse.json({ error: "取得エラーが発生しました" }, { status: 500 });
  }
}

function cleanupExpiredData() {
  const now = Date.now();
  for (const [id, value] of shareStorage.entries()) {
    if (now - value.createdAt > EXPIRY_TIME) {
      shareStorage.delete(id);
    }
  }
}

