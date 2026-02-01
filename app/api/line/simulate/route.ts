/**
 * LINE分岐ロジックの擬似実行API（LINEアプリ不要）
 *
 * POST /api/line/simulate
 * Input:
 * {
 *   "messageText": "はい",
 *   "currentState": "property_confirm" | "application_intent" | "consultation" | "waiting_images" | "completed",
 *   "caseId": "optional",
 *   "userId": "optional",
 *   "persist": false,
 *   "useKv": false
 * }
 *
 * If LINE_SIMULATE_TOKEN is set, pass header: x-simulate-token
 */

import { NextResponse } from "next/server";
import type { Message } from "@line/bot-sdk";
import {
  getConversationState,
  setConversationState,
  getActiveCase,
  setActiveCase,
  getCase,
  getUserCases,
} from "@/lib/kv";

type ConversationStep = "property_confirm" | "application_intent" | "consultation" | "waiting_images" | "completed";

const propertySearchUrl = "https://suumo.jp/chintai/";

const buildPropertyConfirmFlex = (propertyDisplay: string): Message => ({
  type: "flex",
  altText: "確認する物件はこの物件で合ってますか？",
  contents: {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "物件の確認",
          weight: "bold",
          size: "xl",
          color: "#333333",
          margin: "md",
          align: "center",
        },
        {
          type: "text",
          text: propertyDisplay,
          size: "lg",
          color: "#666666",
          margin: "sm",
          align: "center",
          wrap: true,
        },
        { type: "separator", margin: "lg" },
        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          margin: "lg",
          contents: [
            {
              type: "button",
              style: "primary",
              color: "#007AFF",
              height: "sm",
              action: { type: "message", label: "はい", text: "はい" },
            },
            {
              type: "button",
              style: "secondary",
              color: "#808080",
              height: "sm",
              action: { type: "message", label: "いいえ", text: "いいえ" },
            },
            {
              type: "button",
              style: "primary",
              color: "#FF9500",
              height: "sm",
              action: { type: "message", label: "相談したい", text: "相談したい" },
            },
          ],
        },
      ],
    },
    styles: { body: { backgroundColor: "#FFFFFF" } },
  },
});

const buildApplicationIntentFlex = (): Message => ({
  type: "flex",
  altText: "お申し込みについて",
  contents: {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "お申し込みをご希望ですか？",
          weight: "bold",
          size: "lg",
          color: "#333333",
          margin: "md",
          align: "center",
        },
        { type: "separator", margin: "lg" },
        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          margin: "lg",
          contents: [
            {
              type: "button",
              style: "primary",
              color: "#06C755",
              height: "sm",
              action: { type: "message", label: "申し込みをしたい", text: "申し込みをしたい" },
            },
            {
              type: "button",
              style: "secondary",
              color: "#9CA3AF",
              height: "sm",
              action: { type: "message", label: "申し込みしない", text: "申し込みしない" },
            },
            {
              type: "button",
              style: "primary",
              color: "#FF9500",
              height: "sm",
              action: { type: "message", label: "相談したい", text: "相談したい" },
            },
          ],
        },
      ],
    },
    styles: { body: { backgroundColor: "#FFFFFF" } },
  },
});

const buildPropertySearchTemplate = (): Message => ({
  type: "template",
  altText: "他の物件を探す",
  template: {
    type: "buttons",
    text: "承知しました。ほかの物件をお探しでしたら、こちらのAI物件探しシステムをご利用ください。",
    actions: [{ type: "uri", label: "物件を探す", uri: propertySearchUrl }],
  },
});

export async function POST(req: Request) {
  const token = process.env.LINE_SIMULATE_TOKEN;
  if (token) {
    const provided = req.headers.get("x-simulate-token");
    if (provided !== token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await req.json();
  const messageTextRaw = String(body.messageText || "").trim();
  const messageText = messageTextRaw || "";
  const currentState = body.currentState as ConversationStep | undefined;
  const caseIdInput = body.caseId as string | undefined;
  const userId = body.userId as string | undefined;
  const persist = Boolean(body.persist);
  const useKv = Boolean(body.useKv);

  let state = currentState || null;
  let caseId = caseIdInput || null;

  if (useKv && userId) {
    const conversationState = await getConversationState(userId);
    const activeCase = await getActiveCase(userId);
    state = state || conversationState?.step || null;
    caseId = caseId || conversationState?.case_id || activeCase?.case_id || null;
  }

  const replies: Message[] = [];
  let nextState: ConversationStep | null = null;

  if (!messageText) {
    return NextResponse.json({ error: "messageText is required" }, { status: 400 });
  }

  if (state === "property_confirm" && caseId) {
    if (messageText === "はい") {
      replies.push(buildApplicationIntentFlex());
      nextState = "application_intent";
    } else if (messageText === "いいえ") {
    replies.push({ type: "text", text: "恐れ入りますが、こちらに見積書と図面をLINEのチャットで直接お送りいただけますか？" });
      nextState = "waiting_images";
    } else if (messageText === "相談したい") {
    replies.push({ type: "text", text: "承知しました。相談内容を簡単にメッセージ（LINEのメッセージ）でお知らせください。" });
      nextState = "consultation";
    }
  }

  if (!nextState && state === "application_intent" && caseId) {
    if (messageText === "申し込みをしたい" || messageText === "申し込みする") {
      replies.push({ type: "text", text: "承知しました。担当者より詳細な初期費用の見積もりと申し込み方法について連絡いたします。" });
      nextState = "completed";
    } else if (messageText === "いいえ" || messageText === "申し込みしない" || messageText === "他の物件を探す") {
      replies.push(buildPropertySearchTemplate());
      nextState = "completed";
    } else if (messageText === "相談したい") {
      replies.push({ type: "text", text: "承知しました。相談内容を簡単にメッセージ（LINEのメッセージ）でお知らせください。" });
      nextState = "consultation";
    }
  }

  if (!nextState && state === "consultation" && caseId) {
    replies.push({ type: "text", text: "相談内容を承知しました。担当者より返信いたします。" });
    nextState = "completed";
  }

  if (!nextState && (messageText === "履歴" || messageText === "りれき" || messageText === "history")) {
    if (useKv && userId) {
      const cases = await getUserCases(userId, 5);
      if (cases.length === 0) {
        replies.push({ type: "text", text: "まだ案件がありません。\n診断ページで「LINEで続き」ボタンを押して連携してください。" });
      } else {
        let message = "📋 あなたの案件履歴（直近5件）\n\n";
        cases.forEach((c, index) => {
          message += `${index + 1}. ${c.display_title}\n`;
        });
        message += "\n番号を送信して案件を選択してください。";
        replies.push({ type: "text", text: message });
      }
    } else {
      replies.push({ type: "text", text: "履歴を確認するには userId + useKv を指定してください。" });
    }
  }

  if (!nextState && (messageText === "はい" || messageText === "Yes" || messageText === "yes")) {
    if (caseId && useKv) {
      const active = await getCase(caseId);
      if (active?.result) {
        const result = active.result;
        let detailMessage = `📊 案件詳細\n\n`;
        detailMessage += `提示額: ¥${result.total_original?.toLocaleString() || "0"}\n`;
        detailMessage += `適正額: ¥${result.total_fair?.toLocaleString() || "0"}\n`;
        detailMessage += `削減可能額: ¥${result.discount_amount?.toLocaleString() || "0"}\n\n`;
        detailMessage += `リスクスコア: ${result.risk_score || 0}/100\n\n`;
        detailMessage += `プロからのアドバイス:\n${result.pro_review?.content || "診断結果をご確認ください"}\n\n`;
        detailMessage += `交渉が面倒、怖いと感じる方は、弊社で全ての交渉を代行しお得に契約できるようサポートが可能です。希望の場合はLINEでご相談ください。`;
        replies.push({ type: "text", text: detailMessage });
      } else {
        replies.push({ type: "text", text: "アクティブ案件の詳細が見つかりません。" });
      }
    } else {
      replies.push({ type: "text", text: "案件詳細を返すには caseId + useKv を指定してください。" });
    }
  }

  if (replies.length === 0) {
    replies.push({
      type: "text",
      text: "メッセージを受け取りました。\n\n「履歴」と送信すると診断結果の一覧を確認できます。\n\nご不明な点がございましたら、お気軽にお問い合わせください。",
    });
  }

  if (persist && userId && nextState && caseId) {
    await setConversationState(userId, nextState, caseId);
  }
  if (persist && userId && caseId) {
    await setActiveCase(userId, caseId);
  }

  return NextResponse.json({
    ok: true,
    input: {
      messageText,
      currentState: state,
      caseId,
      userId,
      persist,
      useKv,
    },
    result: {
      nextState,
      replies,
    },
  });
}
