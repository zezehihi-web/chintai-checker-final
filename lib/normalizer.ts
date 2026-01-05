/**
 * 表記ゆれ辞書と正規化モジュール
 * 
 * 設計原則:
 * 1. 「記載なし→0」は禁止。0は明確な根拠がある場合のみ
 * 2. evidence_textがない場合はvalueをnullに強制
 * 3. 省略表記を正規化
 */

import { ExtractedField, ExtractedFacts, ExtractionSource } from './types';

// ====================================
// 省略表記辞書
// ====================================

/** 礼金の表記ゆれ辞書 */
export const KEY_MONEY_PATTERNS: Record<string, number | null> = {
  // 0を意味する表記（明確な根拠）
  "礼0": 0,
  "礼なし": 0,
  "礼金なし": 0,
  "礼金0": 0,
  "礼金0ヶ月": 0,
  "礼金無し": 0,
  "礼金無": 0,
  "なし": 0,
  "無し": 0,
  "無": 0,
  "0": 0,
  "0ヶ月": 0,
  "ゼロ": 0,
  
  // 1ヶ月を意味する表記
  "礼1": 1,
  "礼金1": 1,
  "礼金1ヶ月": 1,
  "1": 1,
  "1ヶ月": 1,
  "1ケ月": 1,
  "1か月": 1,
  
  // 2ヶ月を意味する表記
  "礼2": 2,
  "礼金2": 2,
  "礼金2ヶ月": 2,
  "2": 2,
  "2ヶ月": 2,
  "2ケ月": 2,
  "2か月": 2,
  
  // 不明・要確認を意味する表記（nullにする）
  "-": null,
  "ー": null,
  "—": null,
  "未定": null,
  "相談": null,
  "応相談": null,
  "要相談": null,
  "別途": null,
  "別途相談": null,
  "お問い合わせ": null,
  "問合せ": null,
};

/** 敷金の表記ゆれ辞書 */
export const DEPOSIT_PATTERNS: Record<string, number | null> = {
  "敷0": 0,
  "敷なし": 0,
  "敷金なし": 0,
  "敷金0": 0,
  "敷金0ヶ月": 0,
  "敷金無し": 0,
  "敷金無": 0,
  "敷1": 1,
  "敷金1": 1,
  "敷金1ヶ月": 1,
  "敷2": 2,
  "敷金2": 2,
  "敷金2ヶ月": 2,
  // 不明
  "-": null,
  "ー": null,
  "—": null,
  "未定": null,
  "相談": null,
};

/** 敷礼複合パターン（例: "敷礼 0/1" → 敷0 礼1） */
export const COMBINED_DEPOSIT_KEY_MONEY_PATTERNS: Record<string, { deposit: number; key_money: number }> = {
  "敷礼0/0": { deposit: 0, key_money: 0 },
  "敷礼0/1": { deposit: 0, key_money: 1 },
  "敷礼1/0": { deposit: 1, key_money: 0 },
  "敷礼1/1": { deposit: 1, key_money: 1 },
  "敷礼1/2": { deposit: 1, key_money: 2 },
  "敷礼2/1": { deposit: 2, key_money: 1 },
  "敷礼2/2": { deposit: 2, key_money: 2 },
  "0/0": { deposit: 0, key_money: 0 },
  "0/1": { deposit: 0, key_money: 1 },
  "1/0": { deposit: 1, key_money: 0 },
  "1/1": { deposit: 1, key_money: 1 },
  "1/2": { deposit: 1, key_money: 2 },
};

/** 仲介手数料の表記ゆれ */
export const BROKERAGE_FEE_PATTERNS: Record<string, number | null> = {
  "仲介手数料無料": 0,
  "仲介無料": 0,
  "手数料無料": 0,
  "0円": 0,
  "無料": 0,
  "0.5ヶ月": 0.5,
  "0.5": 0.5,
  "半月": 0.5,
  "1ヶ月": 1,
  "1.0ヶ月": 1,
  "1": 1,
  "1.1ヶ月": 1.1,
};

// ====================================
// 0値の根拠チェック
// ====================================

/** 0として認められるevidenceパターン */
const ZERO_EVIDENCE_PATTERNS = [
  /礼0/i,
  /礼なし/i,
  /礼金なし/i,
  /礼金0/i,
  /礼金無/i,
  /敷0/i,
  /敷なし/i,
  /敷金なし/i,
  /敷金0/i,
  /敷金無/i,
  /なし/i,
  /無し/i,
  /無料/i,
  /0円/i,
  /^0$/,
  /^0ヶ月$/,
];

/**
 * 0値が正当な根拠を持つかチェック
 * @returns true: 0として許可, false: nullにすべき
 */
export function isValidZeroEvidence(evidenceText: string | null): boolean {
  if (!evidenceText) return false;
  
  const normalized = evidenceText.trim().toLowerCase();
  return ZERO_EVIDENCE_PATTERNS.some(pattern => pattern.test(normalized));
}

// ====================================
// 正規化関数
// ====================================

/**
 * 単一フィールドの正規化
 * - evidenceがなければvalueをnullに強制
 * - 0値の正当性チェック
 */
export function normalizeField<T>(field: ExtractedField<T>): ExtractedField<T> {
  // evidenceがない場合はvalueをnullに
  if (!field.evidence_text || field.evidence_text.trim() === '') {
    return {
      ...field,
      value: null as T,
      extraction_note: field.extraction_note || 'evidence_text がないため value を null に設定',
    };
  }
  
  // 数値フィールドで0の場合、根拠チェック
  if (typeof field.value === 'number' && field.value === 0) {
    if (!isValidZeroEvidence(field.evidence_text)) {
      return {
        ...field,
        value: null as T,
        extraction_note: '0の根拠が不十分なため null に変更（元evidence: ' + field.evidence_text + '）',
      };
    }
  }
  
  return field;
}

/**
 * 礼金の表記を正規化
 */
export function normalizeKeyMoney(evidenceText: string | null): number | null {
  if (!evidenceText) return null;
  
  const normalized = evidenceText.trim()
    .replace(/\s+/g, '')
    .replace(/ケ月/g, 'ヶ月')
    .replace(/か月/g, 'ヶ月');
  
  // 辞書でマッチ
  if (KEY_MONEY_PATTERNS.hasOwnProperty(normalized)) {
    return KEY_MONEY_PATTERNS[normalized];
  }
  
  // 数字のみの場合
  const numMatch = normalized.match(/^(\d+(?:\.\d+)?)(?:ヶ月)?$/);
  if (numMatch) {
    return parseFloat(numMatch[1]);
  }
  
  return null;
}

/**
 * 敷金の表記を正規化
 */
export function normalizeDeposit(evidenceText: string | null): number | null {
  if (!evidenceText) return null;
  
  const normalized = evidenceText.trim()
    .replace(/\s+/g, '')
    .replace(/ケ月/g, 'ヶ月')
    .replace(/か月/g, 'ヶ月');
  
  if (DEPOSIT_PATTERNS.hasOwnProperty(normalized)) {
    return DEPOSIT_PATTERNS[normalized];
  }
  
  const numMatch = normalized.match(/^(\d+(?:\.\d+)?)(?:ヶ月)?$/);
  if (numMatch) {
    return parseFloat(numMatch[1]);
  }
  
  return null;
}

/**
 * 金額の正規化（円表記のパース）
 */
export function normalizeAmount(evidenceText: string | null): number | null {
  if (!evidenceText) return null;
  
  // カンマ、円記号、スペースを除去
  const cleaned = evidenceText
    .replace(/[,，]/g, '')
    .replace(/円/g, '')
    .replace(/¥/g, '')
    .replace(/\s/g, '')
    .trim();
  
  // 数値として解析
  const num = parseFloat(cleaned);
  if (!isNaN(num) && num >= 0) {
    return num;
  }
  
  return null;
}

/**
 * ExtractedFacts全体の正規化
 */
export function normalizeFacts(facts: ExtractedFacts): ExtractedFacts {
  return {
    ...facts,
    property_name: normalizeField(facts.property_name),
    room_number: normalizeField(facts.room_number),
    rent: normalizeField(facts.rent),
    management_fee: normalizeField(facts.management_fee),
    deposit_months: normalizeField(facts.deposit_months),
    key_money_months: normalizeField(facts.key_money_months),
    brokerage_fee: normalizeField(facts.brokerage_fee),
    brokerage_fee_months: normalizeField(facts.brokerage_fee_months),
    brokerage_fee_tax_included: normalizeField(facts.brokerage_fee_tax_included),
    administrative_fee: normalizeField(facts.administrative_fee),
    guarantee_fee: normalizeField(facts.guarantee_fee),
    fire_insurance: normalizeField(facts.fire_insurance),
    support_service: normalizeField(facts.support_service),
    key_exchange: normalizeField(facts.key_exchange),
    cleaning_fee: normalizeField(facts.cleaning_fee),
    renewal_fee: normalizeField(facts.renewal_fee),
    free_rent_months: normalizeField(facts.free_rent_months),
    contract_start_date: normalizeField(facts.contract_start_date),
    move_in_date: normalizeField(facts.move_in_date),
    other_items: facts.other_items.map(item => ({
      ...item,
      value: normalizeField(item.value),
    })),
  };
}

// ====================================
// ロギング
// ====================================

export interface NormalizationLog {
  field_name: string;
  original_value: any;
  original_evidence: string | null;
  normalized_value: any;
  action: 'kept' | 'nullified_no_evidence' | 'nullified_invalid_zero' | 'normalized';
  reason: string;
}

/**
 * 正規化処理のログを生成
 */
export function logNormalization(
  fieldName: string,
  originalField: ExtractedField<any>,
  normalizedField: ExtractedField<any>
): NormalizationLog {
  let action: NormalizationLog['action'] = 'kept';
  let reason = '';
  
  if (originalField.value !== null && normalizedField.value === null) {
    if (!originalField.evidence_text) {
      action = 'nullified_no_evidence';
      reason = 'evidence_text がないため null 化';
    } else if (originalField.value === 0) {
      action = 'nullified_invalid_zero';
      reason = '0 の根拠が不十分なため null 化';
    }
  } else if (originalField.value !== normalizedField.value) {
    action = 'normalized';
    reason = '値を正規化';
  }
  
  return {
    field_name: fieldName,
    original_value: originalField.value,
    original_evidence: originalField.evidence_text,
    normalized_value: normalizedField.value,
    action,
    reason,
  };
}

