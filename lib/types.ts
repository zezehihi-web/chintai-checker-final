/**
 * 賃貸初期費用診断 - 型定義
 * 
 * 設計原則:
 * 1. 抽出と診断の完全分離
 * 2. 各値に必ずevidence（根拠）を持つ
 * 3. evidenceがなければvalueはnull（0にしない）
 */

// ====================================
// Google Analytics (GA4) 型定義
// ====================================

declare global {
  interface Window {
    gtag?: (
      command: 'config' | 'event' | 'js' | 'set',
      targetId: string | Date,
      config?: {
        event_category?: string;
        event_label?: string;
        [key: string]: unknown;
      }
    ) => void;
    dataLayer?: unknown[];
  }
}

// ====================================
// 抽出フェーズ用の型定義
// ====================================

/** 抽出元ソース */
export type ExtractionSource = "flyer" | "estimate";

/** 個別フィールドの抽出結果 */
export interface ExtractedField<T = number | string | null> {
  /** 抽出された値。evidenceがない場合は必ずnull */
  value: T;
  /** 画像から抽出した根拠テキスト（例: "礼1", "敷金1ヶ月"） */
  evidence_text: string | null;
  /** 信頼度 0-1 */
  confidence: number;
  /** 抽出元 */
  source: ExtractionSource;
  /** 画像のインデックス（複数画像対応） */
  page_or_image_index: number;
  /** 抽出失敗理由（あれば） */
  extraction_note?: string;
}

/** 抽出対象項目 */
export interface ExtractedFacts {
  // 物件基本情報
  property_name: ExtractedField<string>;
  room_number: ExtractedField<string>;
  
  // 基本費用（月数または金額）
  rent: ExtractedField<number>;           // 賃料（円）
  management_fee: ExtractedField<number>; // 管理費/共益費（円）
  deposit_months: ExtractedField<number>; // 敷金（月数）
  key_money_months: ExtractedField<number>; // 礼金（月数）
  
  // 仲介関連
  brokerage_fee: ExtractedField<number>;  // 仲介手数料（円）
  brokerage_fee_months: ExtractedField<number>; // 仲介手数料（月数）
  brokerage_fee_tax_included: ExtractedField<boolean>; // 税込か
  
  // その他費用
  administrative_fee: ExtractedField<number>; // 事務手数料（円）
  guarantee_fee: ExtractedField<number>;      // 保証会社料（円）
  fire_insurance: ExtractedField<number>;     // 火災保険（円）
  support_service: ExtractedField<number>;    // 24hサポート等（円）
  key_exchange: ExtractedField<number>;       // 鍵交換（円）
  cleaning_fee: ExtractedField<number>;       // クリーニング/退去時（円）
  renewal_fee: ExtractedField<number>;        // 更新料（円/月数）
  
  // 特典
  free_rent_months: ExtractedField<number>;   // フリーレント（月数）
  
  // 日付
  contract_start_date: ExtractedField<string>; // 契約開始日
  move_in_date: ExtractedField<string>;        // 入居可能日
  
  // その他の項目（動的）
  other_items: ExtractedOtherItem[];
  
  // メタ情報
  extraction_timestamp: string;
  total_items_found: number;
}

/** その他の抽出項目 */
export interface ExtractedOtherItem {
  name: string;
  value: ExtractedField<number>;
}

/** 空の抽出フィールドを生成 */
export function createEmptyField<T = number | string | null>(source: ExtractionSource): ExtractedField<T> {
  return {
    value: null as T,
    evidence_text: null,
    confidence: 0,
    source,
    page_or_image_index: 0,
  };
}

/** 空の抽出結果を生成 */
export function createEmptyExtractedFacts(source: ExtractionSource): ExtractedFacts {
  return {
    property_name: createEmptyField<string>(source),
    room_number: createEmptyField<string>(source),
    rent: createEmptyField<number>(source),
    management_fee: createEmptyField<number>(source),
    deposit_months: createEmptyField<number>(source),
    key_money_months: createEmptyField<number>(source),
    brokerage_fee: createEmptyField<number>(source),
    brokerage_fee_months: createEmptyField<number>(source),
    brokerage_fee_tax_included: createEmptyField<boolean>(source),
    administrative_fee: createEmptyField<number>(source),
    guarantee_fee: createEmptyField<number>(source),
    fire_insurance: createEmptyField<number>(source),
    support_service: createEmptyField<number>(source),
    key_exchange: createEmptyField<number>(source),
    cleaning_fee: createEmptyField<number>(source),
    renewal_fee: createEmptyField<number>(source),
    free_rent_months: createEmptyField<number>(source),
    contract_start_date: createEmptyField<string>(source),
    move_in_date: createEmptyField<string>(source),
    other_items: [],
    extraction_timestamp: new Date().toISOString(),
    total_items_found: 0,
  };
}

// ====================================
// 検証フェーズ用の型定義
// ====================================

/** 矛盾検出結果 */
export interface ConflictItem {
  field_name: string;
  flyer_value: ExtractedField<number | string | null>;
  estimate_value: ExtractedField<number | string | null>;
  conflict_type: "value_mismatch" | "flyer_null_estimate_exists" | "low_confidence";
  needs_verification: boolean;
}

/** 検証結果 */
export interface VerificationResult {
  field_name: string;
  verified_value: ExtractedField<number | string | null>;
  verification_status: "confirmed" | "unconfirmed" | "requires_manual_check";
  verification_note: string;
}

// ====================================
// 診断フェーズ用の型定義
// ====================================

/** 診断項目のステータス */
export type DiagnosisStatus = "fair" | "negotiable" | "cut" | "requires_confirmation";

/** 診断結果の項目 */
export interface DiagnosisItem {
  name: string;
  price_original: number | null;
  price_fair: number | null;
  status: DiagnosisStatus;
  reason: string;
  /** 抽出根拠 */
  evidence: {
    flyer_evidence: string | null;
    estimate_evidence: string | null;
    source_description: string;
  };
  /** 確認が必要か */
  requires_confirmation: boolean;
  /** 信頼度 */
  confidence: number;
}

/** 診断結果全体 */
export interface DiagnosisResult {
  property_name: string;
  room_number: string;
  items: DiagnosisItem[];
  total_original: number;
  total_fair: number;
  discount_amount: number;
  pro_review: { content: string };
  risk_score: number;
  
  // 追加のメタ情報
  has_unconfirmed_items: boolean;
  unconfirmed_item_names: string[];
  extraction_quality: "high" | "medium" | "low";
  
  // デバッグ用
  extraction_log?: ExtractionLog;
}

/** 抽出ログ（デバッグ用） */
export interface ExtractionLog {
  flyer_extracted: boolean;
  estimate_extracted: boolean;
  conflicts_detected: string[];
  verification_performed: string[];
  final_null_fields: string[];
}

// ====================================
// Gemini用のJSON Schema定義
// ====================================

/** 抽出用のJSON Schema（Geminiに渡す） */
export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    property_name: {
      type: "object",
      properties: {
        value: { type: ["string", "null"] },
        evidence_text: { type: ["string", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        page_or_image_index: { type: "integer" },
        extraction_note: { type: "string" }
      },
      required: ["value", "evidence_text", "confidence", "page_or_image_index"]
    },
    room_number: {
      type: "object",
      properties: {
        value: { type: ["string", "null"] },
        evidence_text: { type: ["string", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        page_or_image_index: { type: "integer" }
      },
      required: ["value", "evidence_text", "confidence", "page_or_image_index"]
    },
    rent: {
      type: "object",
      properties: {
        value: { type: ["number", "null"] },
        evidence_text: { type: ["string", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        page_or_image_index: { type: "integer" }
      },
      required: ["value", "evidence_text", "confidence", "page_or_image_index"]
    },
    management_fee: {
      type: "object",
      properties: {
        value: { type: ["number", "null"] },
        evidence_text: { type: ["string", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        page_or_image_index: { type: "integer" }
      },
      required: ["value", "evidence_text", "confidence", "page_or_image_index"]
    },
    deposit_months: {
      type: "object",
      properties: {
        value: { type: ["number", "null"] },
        evidence_text: { type: ["string", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        page_or_image_index: { type: "integer" }
      },
      required: ["value", "evidence_text", "confidence", "page_or_image_index"]
    },
    key_money_months: {
      type: "object",
      properties: {
        value: { type: ["number", "null"] },
        evidence_text: { type: ["string", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        page_or_image_index: { type: "integer" }
      },
      required: ["value", "evidence_text", "confidence", "page_or_image_index"]
    },
    brokerage_fee: {
      type: "object",
      properties: {
        value: { type: ["number", "null"] },
        evidence_text: { type: ["string", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        page_or_image_index: { type: "integer" }
      },
      required: ["value", "evidence_text", "confidence", "page_or_image_index"]
    },
    brokerage_fee_months: {
      type: "object",
      properties: {
        value: { type: ["number", "null"] },
        evidence_text: { type: ["string", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        page_or_image_index: { type: "integer" }
      },
      required: ["value", "evidence_text", "confidence", "page_or_image_index"]
    },
    guarantee_fee: {
      type: "object",
      properties: {
        value: { type: ["number", "null"] },
        evidence_text: { type: ["string", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        page_or_image_index: { type: "integer" }
      },
      required: ["value", "evidence_text", "confidence", "page_or_image_index"]
    },
    fire_insurance: {
      type: "object",
      properties: {
        value: { type: ["number", "null"] },
        evidence_text: { type: ["string", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        page_or_image_index: { type: "integer" }
      },
      required: ["value", "evidence_text", "confidence", "page_or_image_index"]
    },
    support_service: {
      type: "object",
      properties: {
        value: { type: ["number", "null"] },
        evidence_text: { type: ["string", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        page_or_image_index: { type: "integer" }
      },
      required: ["value", "evidence_text", "confidence", "page_or_image_index"]
    },
    key_exchange: {
      type: "object",
      properties: {
        value: { type: ["number", "null"] },
        evidence_text: { type: ["string", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        page_or_image_index: { type: "integer" }
      },
      required: ["value", "evidence_text", "confidence", "page_or_image_index"]
    },
    cleaning_fee: {
      type: "object",
      properties: {
        value: { type: ["number", "null"] },
        evidence_text: { type: ["string", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        page_or_image_index: { type: "integer" }
      },
      required: ["value", "evidence_text", "confidence", "page_or_image_index"]
    },
    free_rent_months: {
      type: "object",
      properties: {
        value: { type: ["number", "null"] },
        evidence_text: { type: ["string", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        page_or_image_index: { type: "integer" }
      },
      required: ["value", "evidence_text", "confidence", "page_or_image_index"]
    },
    other_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          value: {
            type: "object",
            properties: {
              value: { type: ["number", "null"] },
              evidence_text: { type: ["string", "null"] },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              page_or_image_index: { type: "integer" }
            },
            required: ["value", "evidence_text", "confidence", "page_or_image_index"]
          }
        },
        required: ["name", "value"]
      }
    },
    total_items_found: { type: "integer" }
  },
  required: [
    "property_name", "room_number", "rent", "management_fee",
    "deposit_months", "key_money_months", "brokerage_fee",
    "guarantee_fee", "fire_insurance", "support_service",
    "key_exchange", "cleaning_fee", "free_rent_months",
    "other_items", "total_items_found"
  ]
};




