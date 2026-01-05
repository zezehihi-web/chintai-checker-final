/**
 * 検証パスモジュール
 * 
 * 設計原則:
 * 1. flyerとestimateの矛盾を検出
 * 2. 矛盾がある項目のみ再検証
 * 3. 再検証でもevidenceが取れなければnull（要確認）
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  ExtractedFacts, 
  ExtractedField, 
  ConflictItem, 
  VerificationResult 
} from './types';
import { verifyField } from './extraction';

// ====================================
// 矛盾検出の閾値
// ====================================

/** 低信頼度の閾値 */
const LOW_CONFIDENCE_THRESHOLD = 0.5;

/** 重要項目（必ず検証する） */
const CRITICAL_FIELDS = [
  'key_money_months',  // 礼金
  'deposit_months',    // 敷金
  'rent',              // 賃料
  'management_fee',    // 管理費
  'brokerage_fee',     // 仲介手数料
];

// ====================================
// 矛盾検出
// ====================================

/**
 * flyerとestimateの矛盾を検出
 */
export function detectConflicts(
  flyerFacts: ExtractedFacts,
  estimateFacts: ExtractedFacts
): ConflictItem[] {
  const conflicts: ConflictItem[] = [];
  
  // 検査対象フィールド
  const fieldsToCheck: (keyof ExtractedFacts)[] = [
    'key_money_months',
    'deposit_months',
    'rent',
    'management_fee',
    'brokerage_fee_months',
    'free_rent_months',
  ];
  
  for (const fieldName of fieldsToCheck) {
    const flyerField = flyerFacts[fieldName] as ExtractedField<number | string | null>;
    const estimateField = estimateFacts[fieldName] as ExtractedField<number | string | null>;
    
    // ケース1: flyerがnullまたは低信頼度なのにestimateに値がある
    if (
      (flyerField.value === null || flyerField.confidence < LOW_CONFIDENCE_THRESHOLD) &&
      estimateField.value !== null
    ) {
      conflicts.push({
        field_name: fieldName,
        flyer_value: flyerField,
        estimate_value: estimateField,
        conflict_type: 'flyer_null_estimate_exists',
        needs_verification: true,
      });
      continue;
    }
    
    // ケース2: 値が不一致
    if (
      flyerField.value !== null &&
      estimateField.value !== null &&
      flyerField.value !== estimateField.value
    ) {
      conflicts.push({
        field_name: fieldName,
        flyer_value: flyerField,
        estimate_value: estimateField,
        conflict_type: 'value_mismatch',
        needs_verification: true,
      });
      continue;
    }
    
    // ケース3: 重要項目で低信頼度
    if (
      CRITICAL_FIELDS.includes(fieldName) &&
      (flyerField.confidence < LOW_CONFIDENCE_THRESHOLD || 
       !flyerField.evidence_text)
    ) {
      conflicts.push({
        field_name: fieldName,
        flyer_value: flyerField,
        estimate_value: estimateField,
        conflict_type: 'low_confidence',
        needs_verification: true,
      });
    }
  }
  
  console.log(`[Verification] 矛盾検出完了: ${conflicts.length}件の矛盾を検出`);
  conflicts.forEach(c => {
    console.log(`  - ${c.field_name}: ${c.conflict_type}`);
    console.log(`    flyer: ${c.flyer_value.value} (evidence: ${c.flyer_value.evidence_text})`);
    console.log(`    estimate: ${c.estimate_value.value} (evidence: ${c.estimate_value.evidence_text})`);
  });
  
  return conflicts;
}

// ====================================
// 検証実行
// ====================================

/**
 * 矛盾項目の再検証を実行
 */
export async function verifyConflicts(
  genAI: GoogleGenerativeAI,
  conflicts: ConflictItem[],
  flyerImages: { buffer: Buffer; mimeType: string }[],
  estimateImages: { buffer: Buffer; mimeType: string }[],
  modelName: string = "gemini-2.5-flash"
): Promise<Map<string, VerificationResult>> {
  const results = new Map<string, VerificationResult>();
  
  for (const conflict of conflicts) {
    if (!conflict.needs_verification) continue;
    
    console.log(`[Verification] ${conflict.field_name} の再検証を実行...`);
    
    // flyerの再検証
    let verifiedField: ExtractedField<number | string | null>;
    
    if (flyerImages.length > 0) {
      verifiedField = await verifyField(
        genAI,
        flyerImages,
        conflict.field_name,
        modelName
      );
    } else {
      // flyerがない場合はestimateを使用
      verifiedField = conflict.estimate_value;
    }
    
    // 検証結果の判定
    let status: VerificationResult['verification_status'];
    let note: string;
    
    if (verifiedField.evidence_text && verifiedField.value !== null) {
      status = 'confirmed';
      note = `再検証で確認: evidence="${verifiedField.evidence_text}"`;
    } else if (conflict.estimate_value.evidence_text && conflict.estimate_value.value !== null) {
      // flyerで確認できなければestimateの値を採用（ただし要確認フラグ）
      verifiedField = conflict.estimate_value;
      status = 'unconfirmed';
      note = `flyerで確認不可。estimateの値を採用: evidence="${conflict.estimate_value.evidence_text}"`;
    } else {
      status = 'requires_manual_check';
      note = '再検証でもevidenceが取得できませんでした。手動確認が必要です。';
      verifiedField = {
        value: null,
        evidence_text: null,
        confidence: 0,
        source: 'flyer',
        page_or_image_index: 0,
        extraction_note: note,
      };
    }
    
    results.set(conflict.field_name, {
      field_name: conflict.field_name,
      verified_value: verifiedField,
      verification_status: status,
      verification_note: note,
    });
    
    console.log(`[Verification] ${conflict.field_name} 検証結果:`, {
      status,
      value: verifiedField.value,
      evidence: verifiedField.evidence_text,
    });
  }
  
  return results;
}

// ====================================
// 抽出結果のマージ
// ====================================

/**
 * flyer, estimate, 検証結果をマージして最終的なExtractedFactsを生成
 */
export function mergeExtractedFacts(
  flyerFacts: ExtractedFacts,
  estimateFacts: ExtractedFacts,
  verificationResults: Map<string, VerificationResult>
): { mergedFlyer: ExtractedFacts; mergedEstimate: ExtractedFacts } {
  
  // flyerの更新
  const mergedFlyer = { ...flyerFacts };
  
  for (const [fieldName, result] of verificationResults) {
    if (result.verification_status === 'confirmed' || result.verification_status === 'unconfirmed') {
      const key = fieldName as keyof ExtractedFacts;
      if (key in mergedFlyer && typeof mergedFlyer[key] === 'object') {
        (mergedFlyer[key] as ExtractedField<any>) = {
          ...result.verified_value,
          extraction_note: result.verification_note,
        };
      }
    }
  }
  
  return {
    mergedFlyer,
    mergedEstimate: estimateFacts, // estimateはそのまま
  };
}

/**
 * 要確認項目のリストを取得
 */
export function getUnconfirmedFields(
  verificationResults: Map<string, VerificationResult>
): string[] {
  const unconfirmed: string[] = [];
  
  for (const [fieldName, result] of verificationResults) {
    if (result.verification_status === 'requires_manual_check' || 
        result.verification_status === 'unconfirmed') {
      unconfirmed.push(fieldName);
    }
  }
  
  return unconfirmed;
}

/**
 * nullの項目をリストアップ
 */
export function getNullFields(facts: ExtractedFacts): string[] {
  const nullFields: string[] = [];
  
  const fieldsToCheck: (keyof ExtractedFacts)[] = [
    'rent',
    'management_fee',
    'deposit_months',
    'key_money_months',
    'brokerage_fee',
    'brokerage_fee_months',
    'guarantee_fee',
    'fire_insurance',
    'support_service',
    'key_exchange',
    'cleaning_fee',
    'free_rent_months',
  ];
  
  for (const fieldName of fieldsToCheck) {
    const field = facts[fieldName] as ExtractedField<any>;
    if (field.value === null) {
      nullFields.push(fieldName);
    }
  }
  
  return nullFields;
}

