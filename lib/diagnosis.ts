/**
 * 診断モジュール
 * 
 * 設計原則:
 * 1. 抽出JSONのみを入力とする（画像は直接見ない）
 * 2. 各項目に根拠（evidence）を必ず含める
 * 3. nullの項目は「要確認」として断定的な判断を避ける
 */

import { 
  ExtractedFacts, 
  ExtractedField,
  DiagnosisResult, 
  DiagnosisItem, 
  DiagnosisStatus,
  ExtractionLog 
} from './types';
import { getNullFields } from './verification';

// ====================================
// 診断基準
// ====================================

/** 仲介手数料の適正基準（月数） */
const BROKERAGE_FEE_FAIR_MONTHS = 0.5;

/** 火災保険の適正基準（円） */
const FIRE_INSURANCE_FAIR_AMOUNT = 16000;

// ====================================
// 診断関数
// ====================================

/**
 * 抽出結果から診断を実行
 * 画像は一切参照しない。抽出JSONのみで診断する。
 */
export function diagnose(
  flyerFacts: ExtractedFacts,
  estimateFacts: ExtractedFacts,
  unconfirmedFields: string[] = []
): DiagnosisResult {
  console.log("[Diagnosis] 診断開始（抽出JSONのみを使用）");
  
  const items: DiagnosisItem[] = [];
  let totalOriginal = 0;
  let totalFair = 0;
  
  // 賃料を取得（計算用）
  const rent = estimateFacts.rent.value ?? flyerFacts.rent.value ?? 0;
  
  // 各項目の診断
  
  // 1. 敷金
  const depositItem = diagnoseDeposit(flyerFacts, estimateFacts, rent, unconfirmedFields);
  if (depositItem) {
    items.push(depositItem);
    totalOriginal += depositItem.price_original ?? 0;
    totalFair += depositItem.price_fair ?? 0;
  }
  
  // 2. 礼金
  const keyMoneyItem = diagnoseKeyMoney(flyerFacts, estimateFacts, rent, unconfirmedFields);
  if (keyMoneyItem) {
    items.push(keyMoneyItem);
    totalOriginal += keyMoneyItem.price_original ?? 0;
    totalFair += keyMoneyItem.price_fair ?? 0;
  }
  
  // 3. 仲介手数料
  const brokerageItem = diagnoseBrokerageFee(flyerFacts, estimateFacts, rent, unconfirmedFields);
  if (brokerageItem) {
    items.push(brokerageItem);
    totalOriginal += brokerageItem.price_original ?? 0;
    totalFair += brokerageItem.price_fair ?? 0;
  }
  
  // 4. 保証会社料
  const guaranteeItem = diagnoseGuaranteeFee(flyerFacts, estimateFacts, unconfirmedFields);
  if (guaranteeItem) {
    items.push(guaranteeItem);
    totalOriginal += guaranteeItem.price_original ?? 0;
    totalFair += guaranteeItem.price_fair ?? 0;
  }
  
  // 5. 火災保険
  const fireInsuranceItem = diagnoseFireInsurance(flyerFacts, estimateFacts, unconfirmedFields);
  if (fireInsuranceItem) {
    items.push(fireInsuranceItem);
    totalOriginal += fireInsuranceItem.price_original ?? 0;
    totalFair += fireInsuranceItem.price_fair ?? 0;
  }
  
  // 6. 24時間サポート等
  const supportItem = diagnoseSupportService(flyerFacts, estimateFacts, unconfirmedFields);
  if (supportItem) {
    items.push(supportItem);
    totalOriginal += supportItem.price_original ?? 0;
    totalFair += supportItem.price_fair ?? 0;
  }
  
  // 7. 鍵交換
  const keyExchangeItem = diagnoseKeyExchange(flyerFacts, estimateFacts, unconfirmedFields);
  if (keyExchangeItem) {
    items.push(keyExchangeItem);
    totalOriginal += keyExchangeItem.price_original ?? 0;
    totalFair += keyExchangeItem.price_fair ?? 0;
  }
  
  // 8. クリーニング
  const cleaningItem = diagnoseCleaning(flyerFacts, estimateFacts, unconfirmedFields);
  if (cleaningItem) {
    items.push(cleaningItem);
    totalOriginal += cleaningItem.price_original ?? 0;
    totalFair += cleaningItem.price_fair ?? 0;
  }
  
  // 9. その他の項目
  for (const otherItem of estimateFacts.other_items) {
    const diagnosed = diagnoseOtherItem(otherItem, flyerFacts, unconfirmedFields);
    if (diagnosed) {
      items.push(diagnosed);
      totalOriginal += diagnosed.price_original ?? 0;
      totalFair += diagnosed.price_fair ?? 0;
    }
  }
  
  // 賃料・管理費を加算
  const rentAmount = estimateFacts.rent.value ?? 0;
  const managementFee = estimateFacts.management_fee.value ?? 0;
  totalOriginal += rentAmount + managementFee;
  totalFair += rentAmount + managementFee;
  
  // 総評生成
  const discountAmount = totalOriginal - totalFair;
  const hasUnconfirmed = unconfirmedFields.length > 0;
  const proReview = generateProReview(items, discountAmount, hasUnconfirmed, unconfirmedFields);
  
  // リスクスコア計算
  const riskScore = calculateRiskScore(items, discountAmount, totalOriginal);
  
  // 抽出品質評価
  const extractionQuality = evaluateExtractionQuality(flyerFacts, estimateFacts);
  
  const result: DiagnosisResult = {
    property_name: estimateFacts.property_name.value ?? flyerFacts.property_name.value ?? "不明",
    room_number: estimateFacts.room_number.value ?? flyerFacts.room_number.value ?? "不明",
    items,
    total_original: totalOriginal,
    total_fair: totalFair,
    discount_amount: discountAmount,
    pro_review: { content: proReview },
    risk_score: riskScore,
    has_unconfirmed_items: hasUnconfirmed,
    unconfirmed_item_names: unconfirmedFields,
    extraction_quality: extractionQuality,
    extraction_log: {
      flyer_extracted: flyerFacts.total_items_found > 0,
      estimate_extracted: estimateFacts.total_items_found > 0,
      conflicts_detected: [],
      verification_performed: [],
      final_null_fields: getNullFields(flyerFacts),
    },
  };
  
  console.log("[Diagnosis] 診断完了:", {
    total_original: totalOriginal,
    total_fair: totalFair,
    discount_amount: discountAmount,
    items_count: items.length,
    has_unconfirmed: hasUnconfirmed,
  });
  
  return result;
}

// ====================================
// 個別項目の診断
// ====================================

function diagnoseDeposit(
  flyer: ExtractedFacts,
  estimate: ExtractedFacts,
  rent: number,
  unconfirmedFields: string[]
): DiagnosisItem | null {
  const flyerMonths = flyer.deposit_months.value;
  const estimateMonths = estimate.deposit_months.value;
  
  if (flyerMonths === null && estimateMonths === null) return null;
  
  const months = estimateMonths ?? flyerMonths ?? 0;
  const amount = months * rent;
  
  const isUnconfirmed = unconfirmedFields.includes('deposit_months');
  
  return {
    name: "敷金",
    price_original: amount,
    price_fair: amount, // 敷金は通常適正
    status: isUnconfirmed ? 'requires_confirmation' : 'fair',
    reason: isUnconfirmed 
      ? "読み取りに不確実性があります。確認を推奨します。"
      : `${months}ヶ月分として適正です。`,
    evidence: {
      flyer_evidence: flyer.deposit_months.evidence_text,
      estimate_evidence: estimate.deposit_months.evidence_text,
      source_description: `図面: ${flyer.deposit_months.evidence_text ?? '記載なし'} / 見積書: ${estimate.deposit_months.evidence_text ?? '記載なし'}`,
    },
    requires_confirmation: isUnconfirmed,
    confidence: Math.max(flyer.deposit_months.confidence, estimate.deposit_months.confidence),
  };
}

function diagnoseKeyMoney(
  flyer: ExtractedFacts,
  estimate: ExtractedFacts,
  rent: number,
  unconfirmedFields: string[]
): DiagnosisItem | null {
  const flyerMonths = flyer.key_money_months.value;
  const estimateMonths = estimate.key_money_months.value;
  
  if (flyerMonths === null && estimateMonths === null) return null;
  
  const months = estimateMonths ?? flyerMonths ?? 0;
  const amount = months * rent;
  
  const isUnconfirmed = unconfirmedFields.includes('key_money_months');
  
  // 矛盾チェック: flyerで0なのにestimateで1以上
  let status: DiagnosisStatus = 'fair';
  let reason = `${months}ヶ月分です。`;
  
  if (flyerMonths === 0 && estimateMonths && estimateMonths > 0) {
    status = 'cut';
    reason = `図面では礼金0（${flyer.key_money_months.evidence_text}）ですが、見積書では${estimateMonths}ヶ月請求されています。削除できる可能性が高いです。`;
  } else if (isUnconfirmed) {
    status = 'requires_confirmation';
    reason = "読み取りに不確実性があります。確認を推奨します。";
  }
  
  return {
    name: "礼金",
    price_original: amount,
    price_fair: status === 'cut' ? 0 : amount,
    status,
    reason,
    evidence: {
      flyer_evidence: flyer.key_money_months.evidence_text,
      estimate_evidence: estimate.key_money_months.evidence_text,
      source_description: `図面: ${flyer.key_money_months.evidence_text ?? '記載なし'} / 見積書: ${estimate.key_money_months.evidence_text ?? '記載なし'}`,
    },
    requires_confirmation: isUnconfirmed,
    confidence: Math.max(flyer.key_money_months.confidence, estimate.key_money_months.confidence),
  };
}

function diagnoseBrokerageFee(
  flyer: ExtractedFacts,
  estimate: ExtractedFacts,
  rent: number,
  unconfirmedFields: string[]
): DiagnosisItem | null {
  const estimateAmount = estimate.brokerage_fee.value;
  const estimateMonths = estimate.brokerage_fee_months.value;
  
  if (estimateAmount === null && estimateMonths === null) return null;
  
  let amount = estimateAmount ?? 0;
  let months = estimateMonths ?? 0;
  
  // 月数から計算
  if (amount === 0 && months > 0) {
    amount = months * rent * 1.1; // 税込
  }
  
  // 月数を推定
  if (months === 0 && amount > 0 && rent > 0) {
    months = amount / (rent * 1.1);
  }
  
  const isUnconfirmed = unconfirmedFields.includes('brokerage_fee') || unconfirmedFields.includes('brokerage_fee_months');
  
  let status: DiagnosisStatus = 'fair';
  let reason = "";
  let fairAmount = amount;
  
  if (months > BROKERAGE_FEE_FAIR_MONTHS) {
    status = 'negotiable';
    fairAmount = rent * BROKERAGE_FEE_FAIR_MONTHS * 1.1;
    reason = `原則は0.5ヶ月分ですが、${months.toFixed(1)}ヶ月分請求されています。減額できる可能性が高いです。`;
  } else if (isUnconfirmed) {
    status = 'requires_confirmation';
    reason = "読み取りに不確実性があります。確認を推奨します。";
  } else {
    reason = `${months.toFixed(1)}ヶ月分で適正です。`;
  }
  
  return {
    name: "仲介手数料",
    price_original: amount,
    price_fair: fairAmount,
    status,
    reason,
    evidence: {
      flyer_evidence: flyer.brokerage_fee.evidence_text ?? flyer.brokerage_fee_months.evidence_text,
      estimate_evidence: estimate.brokerage_fee.evidence_text ?? estimate.brokerage_fee_months.evidence_text,
      source_description: `見積書: ${estimate.brokerage_fee.evidence_text ?? estimate.brokerage_fee_months.evidence_text ?? '記載なし'}`,
    },
    requires_confirmation: isUnconfirmed,
    confidence: Math.max(estimate.brokerage_fee.confidence, estimate.brokerage_fee_months.confidence),
  };
}

function diagnoseGuaranteeFee(
  flyer: ExtractedFacts,
  estimate: ExtractedFacts,
  unconfirmedFields: string[]
): DiagnosisItem | null {
  const amount = estimate.guarantee_fee.value;
  if (amount === null) return null;
  
  const isUnconfirmed = unconfirmedFields.includes('guarantee_fee');
  
  return {
    name: "保証会社料",
    price_original: amount,
    price_fair: amount, // 通常は適正
    status: isUnconfirmed ? 'requires_confirmation' : 'fair',
    reason: isUnconfirmed 
      ? "読み取りに不確実性があります。確認を推奨します。"
      : "保証会社利用は一般的です。",
    evidence: {
      flyer_evidence: flyer.guarantee_fee.evidence_text,
      estimate_evidence: estimate.guarantee_fee.evidence_text,
      source_description: `見積書: ${estimate.guarantee_fee.evidence_text ?? '記載なし'}`,
    },
    requires_confirmation: isUnconfirmed,
    confidence: estimate.guarantee_fee.confidence,
  };
}

function diagnoseFireInsurance(
  flyer: ExtractedFacts,
  estimate: ExtractedFacts,
  unconfirmedFields: string[]
): DiagnosisItem | null {
  const amount = estimate.fire_insurance.value;
  if (amount === null) return null;
  
  const isUnconfirmed = unconfirmedFields.includes('fire_insurance');
  
  let status: DiagnosisStatus = 'fair';
  let reason = "";
  let fairAmount = amount;
  
  if (amount > FIRE_INSURANCE_FAIR_AMOUNT) {
    status = 'negotiable';
    fairAmount = FIRE_INSURANCE_FAIR_AMOUNT;
    reason = `自己加入すれば約${FIRE_INSURANCE_FAIR_AMOUNT.toLocaleString()}円以下に変更できる可能性があります（ただし火災保険は必ず加入が必要）。`;
  } else if (isUnconfirmed) {
    status = 'requires_confirmation';
    reason = "読み取りに不確実性があります。確認を推奨します。";
  } else {
    reason = "適正な金額です。";
  }
  
  return {
    name: "火災保険",
    price_original: amount,
    price_fair: fairAmount,
    status,
    reason,
    evidence: {
      flyer_evidence: flyer.fire_insurance.evidence_text,
      estimate_evidence: estimate.fire_insurance.evidence_text,
      source_description: `見積書: ${estimate.fire_insurance.evidence_text ?? '記載なし'}`,
    },
    requires_confirmation: isUnconfirmed,
    confidence: estimate.fire_insurance.confidence,
  };
}

function diagnoseSupportService(
  flyer: ExtractedFacts,
  estimate: ExtractedFacts,
  unconfirmedFields: string[]
): DiagnosisItem | null {
  const amount = estimate.support_service.value;
  if (amount === null) return null;
  
  const flyerHasEvidence = flyer.support_service.evidence_text !== null;
  const isUnconfirmed = unconfirmedFields.includes('support_service');
  
  let status: DiagnosisStatus;
  let reason: string;
  
  if (!flyerHasEvidence) {
    status = 'cut';
    reason = "図面に記載がないため、削除できる可能性が高いです。";
  } else if (isUnconfirmed) {
    status = 'requires_confirmation';
    reason = "読み取りに不確実性があります。確認を推奨します。";
  } else {
    status = 'negotiable';
    reason = "任意加入の可能性があります。確認を推奨します。";
  }
  
  return {
    name: "24時間サポート等",
    price_original: amount,
    price_fair: status === 'cut' ? 0 : amount,
    status,
    reason,
    evidence: {
      flyer_evidence: flyer.support_service.evidence_text,
      estimate_evidence: estimate.support_service.evidence_text,
      source_description: `図面: ${flyer.support_service.evidence_text ?? '記載なし'} / 見積書: ${estimate.support_service.evidence_text ?? '記載なし'}`,
    },
    requires_confirmation: isUnconfirmed,
    confidence: estimate.support_service.confidence,
  };
}

function diagnoseKeyExchange(
  flyer: ExtractedFacts,
  estimate: ExtractedFacts,
  unconfirmedFields: string[]
): DiagnosisItem | null {
  const amount = estimate.key_exchange.value;
  if (amount === null) return null;
  
  const flyerHasEvidence = flyer.key_exchange.evidence_text !== null;
  const isUnconfirmed = unconfirmedFields.includes('key_exchange');
  
  let status: DiagnosisStatus;
  let reason: string;
  
  if (flyerHasEvidence) {
    status = isUnconfirmed ? 'requires_confirmation' : 'fair';
    reason = isUnconfirmed 
      ? "読み取りに不確実性があります。確認を推奨します。"
      : "図面に記載があるため、支払いが必要です。";
  } else {
    status = 'negotiable';
    reason = "図面に記載がないため、ガイドライン通りオーナー負担にできる可能性があります。";
  }
  
  return {
    name: "鍵交換",
    price_original: amount,
    price_fair: status === 'negotiable' ? 0 : amount,
    status,
    reason,
    evidence: {
      flyer_evidence: flyer.key_exchange.evidence_text,
      estimate_evidence: estimate.key_exchange.evidence_text,
      source_description: `図面: ${flyer.key_exchange.evidence_text ?? '記載なし'} / 見積書: ${estimate.key_exchange.evidence_text ?? '記載なし'}`,
    },
    requires_confirmation: isUnconfirmed,
    confidence: estimate.key_exchange.confidence,
  };
}

function diagnoseCleaning(
  flyer: ExtractedFacts,
  estimate: ExtractedFacts,
  unconfirmedFields: string[]
): DiagnosisItem | null {
  const amount = estimate.cleaning_fee.value;
  if (amount === null) return null;
  
  const flyerHasEvidence = flyer.cleaning_fee.evidence_text !== null;
  const isUnconfirmed = unconfirmedFields.includes('cleaning_fee');
  
  return {
    name: "クリーニング",
    price_original: amount,
    price_fair: amount,
    status: isUnconfirmed ? 'requires_confirmation' : 'fair',
    reason: isUnconfirmed 
      ? "読み取りに不確実性があります。確認を推奨します。"
      : "退去時クリーニングは一般的です。",
    evidence: {
      flyer_evidence: flyer.cleaning_fee.evidence_text,
      estimate_evidence: estimate.cleaning_fee.evidence_text,
      source_description: `見積書: ${estimate.cleaning_fee.evidence_text ?? '記載なし'}`,
    },
    requires_confirmation: isUnconfirmed,
    confidence: estimate.cleaning_fee.confidence,
  };
}

function diagnoseOtherItem(
  item: { name: string; value: ExtractedField<number> },
  flyer: ExtractedFacts,
  unconfirmedFields: string[]
): DiagnosisItem | null {
  const amount = item.value.value;
  if (amount === null) return null;
  
  // 図面に同様の項目があるか確認
  const flyerHasSimilar = flyer.other_items.some(
    fi => fi.name.includes(item.name) || item.name.includes(fi.name)
  );
  
  let status: DiagnosisStatus = flyerHasSimilar ? 'fair' : 'cut';
  let reason = flyerHasSimilar 
    ? "図面に記載があります。"
    : "図面に記載がないため、削除できる可能性が高いです。";
  
  return {
    name: item.name,
    price_original: amount,
    price_fair: status === 'cut' ? 0 : amount,
    status,
    reason,
    evidence: {
      flyer_evidence: null,
      estimate_evidence: item.value.evidence_text,
      source_description: `見積書: ${item.value.evidence_text ?? '記載なし'}`,
    },
    requires_confirmation: false,
    confidence: item.value.confidence,
  };
}

// ====================================
// 総評生成
// ====================================

function generateProReview(
  items: DiagnosisItem[],
  discountAmount: number,
  hasUnconfirmed: boolean,
  unconfirmedFields: string[]
): string {
  const cutItems = items.filter(i => i.status === 'cut');
  const negotiableItems = items.filter(i => i.status === 'negotiable');
  const confirmationItems = items.filter(i => i.status === 'requires_confirmation');
  
  let review = "";
  
  // 総括
  if (discountAmount > 50000) {
    review += `【総括】約${discountAmount.toLocaleString()}円の削減可能性があります。交渉を推奨します。\n\n`;
  } else if (discountAmount > 0) {
    review += `【総括】約${discountAmount.toLocaleString()}円の削減可能性があります。\n\n`;
  } else {
    review += `【総括】おおむね適正な見積もりです。\n\n`;
  }
  
  // 要確認項目
  if (hasUnconfirmed) {
    review += `【要確認】以下の項目は読み取りに不確実性があります：\n`;
    for (const field of unconfirmedFields) {
      review += `・${getFieldDisplayName(field)}\n`;
    }
    review += `\n`;
  }
  
  // 削減可能項目
  if (cutItems.length > 0 || negotiableItems.length > 0) {
    review += `【ポイント】\n`;
    for (const item of [...cutItems, ...negotiableItems]) {
      review += `・${item.name}: ${item.reason}\n`;
    }
  }
  
  return review;
}

function getFieldDisplayName(fieldName: string): string {
  const displayNames: Record<string, string> = {
    key_money_months: '礼金',
    deposit_months: '敷金',
    rent: '賃料',
    management_fee: '管理費',
    brokerage_fee: '仲介手数料',
    brokerage_fee_months: '仲介手数料',
    guarantee_fee: '保証会社料',
    fire_insurance: '火災保険',
    support_service: '24時間サポート',
    key_exchange: '鍵交換',
    cleaning_fee: 'クリーニング',
  };
  return displayNames[fieldName] ?? fieldName;
}

// ====================================
// リスクスコア・品質評価
// ====================================

function calculateRiskScore(
  items: DiagnosisItem[],
  discountAmount: number,
  totalOriginal: number
): number {
  if (totalOriginal === 0) return 0;
  
  const discountRatio = discountAmount / totalOriginal;
  const cutCount = items.filter(i => i.status === 'cut').length;
  const negotiableCount = items.filter(i => i.status === 'negotiable').length;
  
  let score = discountRatio * 100;
  score += cutCount * 10;
  score += negotiableCount * 5;
  
  return Math.min(100, Math.round(score));
}

function evaluateExtractionQuality(
  flyer: ExtractedFacts,
  estimate: ExtractedFacts
): 'high' | 'medium' | 'low' {
  const flyerNulls = getNullFields(flyer).length;
  const estimateNulls = getNullFields(estimate).length;
  
  const criticalNulls = ['key_money_months', 'deposit_months', 'rent'].filter(
    f => (flyer[f as keyof ExtractedFacts] as ExtractedField<any>).value === null
  ).length;
  
  if (criticalNulls === 0 && flyerNulls < 3) return 'high';
  if (criticalNulls <= 1 && flyerNulls < 5) return 'medium';
  return 'low';
}

