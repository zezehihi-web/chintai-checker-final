/**
 * 賃貸初期費用診断 API
 * 
 * 新アーキテクチャ:
 * 1. 抽出と診断の完全分離
 * 2. 図面(flyer)と見積書(estimate)を別々のリクエストで処理
 * 3. 矛盾検出と検証パス
 * 4. evidenceがなければnull（0にしない）
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { extractFromFlyer, extractFromEstimate } from "@/lib/extraction";
import { detectConflicts, verifyConflicts, mergeExtractedFacts, getUnconfirmedFields } from "@/lib/verification";
import { diagnose } from "@/lib/diagnosis";
import { fileToImageBuffer, validateImage, logImageProcessing, ImageBuffer } from "@/lib/image-preprocessing";
import { ExtractedFacts, createEmptyExtractedFacts } from "@/lib/types";

export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: Request) {
  const startTime = Date.now();
  
  try {
    const formData = await req.formData();
    const estimateFile = formData.get("estimate") as File | null;
    const planFile = formData.get("plan") as File | null;

    // ====================================
    // バリデーション
    // ====================================
    
    if (!estimateFile) {
      return NextResponse.json({ error: "見積書の画像が必要です" }, { status: 400 });
    }

    const estimateValidation = validateImage(estimateFile);
    if (!estimateValidation.valid) {
      return NextResponse.json({ error: estimateValidation.error }, { status: 400 });
    }

    if (planFile) {
      const planValidation = validateImage(planFile);
      if (!planValidation.valid) {
        return NextResponse.json({ error: planValidation.error }, { status: 400 });
      }
    }

    // ====================================
    // 画像の前処理
    // ====================================
    
    console.log("[API] 画像の前処理開始...");
    
    const estimateImages: ImageBuffer[] = [await fileToImageBuffer(estimateFile)];
    logImageProcessing('estimate', estimateImages.length, estimateImages[0].buffer.length);
    
    let flyerImages: ImageBuffer[] = [];
    if (planFile) {
      flyerImages = [await fileToImageBuffer(planFile)];
      logImageProcessing('flyer', flyerImages.length, flyerImages[0].buffer.length);
    }

    // モデル名
    const modelName = process.env.GEMINI_MODEL_NAME || "gemini-2.5-flash";
    console.log("[API] 使用モデル:", modelName);

    // ====================================
    // Step A: 抽出フェーズ（画像から事実を抽出）
    // ====================================
    
    console.log("[API] === Step A: 抽出フェーズ開始 ===");
    
    // 図面と見積書を別々のリクエストで処理（参照混線防止）
    let flyerFacts: ExtractedFacts;
    let estimateFacts: ExtractedFacts;
    
    // 並列で抽出（パフォーマンス向上）
    const extractionPromises: Promise<ExtractedFacts>[] = [];
    
    // 見積書の抽出（必須）
    extractionPromises.push(
      extractFromEstimate(genAI, estimateImages, modelName)
        .catch((error) => {
          console.error("[API] 見積書抽出エラー:", error);
          return createEmptyExtractedFacts("estimate");
        })
    );
    
    // 図面の抽出（任意）
    if (flyerImages.length > 0) {
      extractionPromises.push(
        extractFromFlyer(genAI, flyerImages, modelName)
          .catch((error) => {
            console.error("[API] 図面抽出エラー:", error);
            return createEmptyExtractedFacts("flyer");
          })
      );
    } else {
      extractionPromises.push(Promise.resolve(createEmptyExtractedFacts("flyer")));
    }
    
    const [extractedEstimate, extractedFlyer] = await Promise.all(extractionPromises);
    estimateFacts = extractedEstimate;
    flyerFacts = extractedFlyer;
    
    console.log("[API] 抽出完了:", {
      flyer_items: flyerFacts.total_items_found,
      estimate_items: estimateFacts.total_items_found,
      flyer_key_money: flyerFacts.key_money_months.value,
      flyer_key_money_evidence: flyerFacts.key_money_months.evidence_text,
      estimate_key_money: estimateFacts.key_money_months.value,
    });

    // ====================================
    // Step B: 検証フェーズ（矛盾検出と再確認）
    // ====================================
    
    console.log("[API] === Step B: 検証フェーズ開始 ===");
    
    // 矛盾検出
    const conflicts = detectConflicts(flyerFacts, estimateFacts);
    console.log("[API] 検出された矛盾:", conflicts.length);
    
    // 矛盾がある場合のみ再検証
    let verificationResults = new Map();
    if (conflicts.length > 0 && flyerImages.length > 0) {
      console.log("[API] 矛盾項目の再検証を実行...");
      verificationResults = await verifyConflicts(
        genAI,
        conflicts,
        flyerImages,
        estimateImages,
        modelName
      );
    }
    
    // 抽出結果をマージ
    const { mergedFlyer, mergedEstimate } = mergeExtractedFacts(
      flyerFacts,
      estimateFacts,
      verificationResults
    );
    
    // 要確認項目のリスト
    const unconfirmedFields = getUnconfirmedFields(verificationResults);
    console.log("[API] 要確認項目:", unconfirmedFields);

    // ====================================
    // Step C: 診断フェーズ（抽出JSONのみを使用）
    // ====================================
    
    console.log("[API] === Step C: 診断フェーズ開始（画像は参照しない） ===");
    
    // 診断実行（画像は一切参照しない）
    const diagnosisResult = diagnose(mergedFlyer, mergedEstimate, unconfirmedFields);
    
    console.log("[API] 診断完了:", {
      total_original: diagnosisResult.total_original,
      total_fair: diagnosisResult.total_fair,
      discount_amount: diagnosisResult.discount_amount,
      has_unconfirmed: diagnosisResult.has_unconfirmed_items,
      extraction_quality: diagnosisResult.extraction_quality,
    });

    // ====================================
    // レスポンス整形
    // ====================================
    
    // 従来の形式に変換（UI互換性のため）
    const legacyResult = convertToLegacyFormat(diagnosisResult);
    
    const processingTime = Date.now() - startTime;
    console.log(`[API] 処理完了: ${processingTime}ms`);

    return NextResponse.json({ 
      result: legacyResult,
      // 追加のメタ情報（デバッグ用）
      meta: {
        processing_time_ms: processingTime,
        extraction_quality: diagnosisResult.extraction_quality,
        has_unconfirmed_items: diagnosisResult.has_unconfirmed_items,
        unconfirmed_fields: unconfirmedFields,
        conflicts_detected: conflicts.length,
      }
    });

  } catch (error: any) {
    console.error("[API] Server Error:", error);
    console.error("[API] Error stack:", error.stack);
    
    // エラーハンドリング
    let errorMessage = "解析エラーが発生しました";
    let errorDetails = error.message || "不明なエラー";
    let statusCode = 500;
    
    if (error.status === 429 || error.message?.includes('429') || error.message?.includes('rate limit')) {
      errorMessage = "APIレート制限に達しました";
      errorDetails = "しばらく時間をおいてから再度お試しください。";
      statusCode = 429;
    } else if (error.message?.includes("JSON")) {
      errorMessage = "AIからの応答の解析に失敗しました";
      errorDetails = "もう一度お試しください。";
    }
    
    return NextResponse.json({ 
      error: errorMessage, 
      details: errorDetails,
    }, { status: statusCode });
  }
}

/**
 * 新しい診断結果を従来のUI形式に変換
 */
function convertToLegacyFormat(diagnosis: any): any {
  return {
    property_name: diagnosis.property_name,
    room_number: diagnosis.room_number,
    items: diagnosis.items.map((item: any) => ({
      name: item.name,
      price_original: item.price_original ?? 0,
      price_fair: item.price_fair ?? 0,
      status: item.status === 'requires_confirmation' ? 'negotiable' : item.status,
      reason: item.reason,
      // 新規追加: 根拠情報
      evidence: item.evidence,
      requires_confirmation: item.requires_confirmation,
      confidence: item.confidence,
    })),
    total_original: diagnosis.total_original,
    total_fair: diagnosis.total_fair,
    discount_amount: diagnosis.discount_amount,
    pro_review: diagnosis.pro_review,
    risk_score: diagnosis.risk_score,
    // 新規追加
    has_unconfirmed_items: diagnosis.has_unconfirmed_items,
    unconfirmed_item_names: diagnosis.unconfirmed_item_names,
    extraction_quality: diagnosis.extraction_quality,
  };
}
