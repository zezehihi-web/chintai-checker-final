/**
 * Vercel KV操作のヘルパー関数
 *
 * 案件（case）、caseToken、LINEユーザーのデータ管理
 */

import { kv } from '@vercel/kv';
import crypto from 'crypto';

// 型定義
export interface CaseData {
  case_id: string;
  created_at: string;
  expires_at: string;
  line_user_id: string | null;
  result: any; // 診断結果
  display_title?: string;
}

export interface LineUser {
  line_user_id: string;
  created_at: string;
  last_active_at: string;
}

export interface ActiveCase {
  case_id: string;
  updated_at: string;
}

/**
 * 案件を作成
 * @param result 診断結果
 * @returns case_id
 */
export async function createCase(result: any): Promise<string> {
  const caseId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30日後

  // 表示タイトル生成（日時 + 削減可能額）
  const displayTitle = `${formatDate(now)} - ${result.discount_amount?.toLocaleString() || '0'}円削減可能`;

  const caseData: CaseData = {
    case_id: caseId,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    line_user_id: null, // 最初は未連携
    result,
    display_title: displayTitle,
  };

  // 30日TTLで保存
  await kv.setex(
    `case:${caseId}`,
    30 * 24 * 60 * 60,
    JSON.stringify(caseData)
  );

  return caseId;
}

/**
 * caseTokenを発行（10分TTL、ワンタイム）
 * @param caseId 案件ID
 * @returns caseToken（32文字hex）
 */
export async function createCaseToken(caseId: string): Promise<string> {
  // 128bit（16バイト）のランダムトークン → 32文字のhex
  const token = crypto.randomBytes(16).toString('hex');

  // 10分TTL
  await kv.setex(
    `caseToken:${token}`,
    600,
    JSON.stringify({
      case_id: caseId,
      created_at: Date.now(),
    })
  );

  return token;
}

/**
 * caseTokenを検証して消費（ワンタイム）
 * @param token caseToken
 * @returns case_id（トークンが有効な場合）、null（無効な場合）
 */
export async function consumeCaseToken(token: string): Promise<string | null> {
  const key = `caseToken:${token}`;
  const data = await kv.get<string>(key);

  if (!data) {
    return null; // トークンが存在しない or 期限切れ
  }

  // トークンを削除（ワンタイム）
  await kv.del(key);

  const parsed = JSON.parse(data);
  return parsed.case_id;
}

/**
 * 案件をLINEユーザーに紐づける
 * @param caseId 案件ID
 * @param lineUserId LINE User ID
 */
export async function linkCaseToUser(caseId: string, lineUserId: string): Promise<void> {
  // 案件データを取得
  const caseData = await kv.get<string>(`case:${caseId}`);
  if (!caseData) {
    throw new Error('Case not found');
  }

  const parsedCase: CaseData = JSON.parse(caseData);
  parsedCase.line_user_id = lineUserId;

  // 案件データを更新
  const ttl = await kv.ttl(`case:${caseId}`);
  await kv.setex(`case:${caseId}`, ttl > 0 ? ttl : 30 * 24 * 60 * 60, JSON.stringify(parsedCase));

  // LINEユーザーが存在しない場合は作成
  const userKey = `lineUser:${lineUserId}`;
  const existingUser = await kv.get<string>(userKey);

  if (!existingUser) {
    const lineUser: LineUser = {
      line_user_id: lineUserId,
      created_at: new Date().toISOString(),
      last_active_at: new Date().toISOString(),
    };
    await kv.set(userKey, JSON.stringify(lineUser));
  } else {
    // 最終アクティブ日時を更新
    const user: LineUser = JSON.parse(existingUser);
    user.last_active_at = new Date().toISOString();
    await kv.set(userKey, JSON.stringify(user));
  }

  // ユーザーの案件リストに追加
  const userCasesKey = `userCases:${lineUserId}`;
  const userCasesData = await kv.get<string>(userCasesKey);
  let caseIds: string[] = [];

  if (userCasesData) {
    const parsed = JSON.parse(userCasesData);
    caseIds = parsed.case_ids || [];
  }

  // 既に存在しない場合のみ追加（先頭に追加＝新しい順）
  if (!caseIds.includes(caseId)) {
    caseIds.unshift(caseId);

    // 最大100件まで保持
    if (caseIds.length > 100) {
      caseIds = caseIds.slice(0, 100);
    }

    await kv.set(userCasesKey, JSON.stringify({ case_ids: caseIds }));
  }
}

/**
 * ユーザーの案件一覧を取得
 * @param lineUserId LINE User ID
 * @param limit 取得件数（デフォルト5件）
 * @returns 案件一覧
 */
export async function getUserCases(lineUserId: string, limit: number = 5): Promise<CaseData[]> {
  const userCasesKey = `userCases:${lineUserId}`;
  const userCasesData = await kv.get<string>(userCasesKey);

  if (!userCasesData) {
    return [];
  }

  const parsed = JSON.parse(userCasesData);
  const caseIds: string[] = parsed.case_ids || [];

  // limitまでの案件を取得
  const limitedIds = caseIds.slice(0, limit);
  const cases: CaseData[] = [];

  for (const caseId of limitedIds) {
    const caseData = await kv.get<string>(`case:${caseId}`);
    if (caseData) {
      const parsedCase: CaseData = JSON.parse(caseData);
      // 自分の案件かつ有効期限内のもののみ
      if (parsedCase.line_user_id === lineUserId) {
        const expiresAt = new Date(parsedCase.expires_at);
        if (expiresAt > new Date()) {
          cases.push(parsedCase);
        }
      }
    }
  }

  return cases;
}

/**
 * アクティブ案件を設定
 * @param lineUserId LINE User ID
 * @param caseId 案件ID
 */
export async function setActiveCase(lineUserId: string, caseId: string): Promise<void> {
  // 案件が存在し、かつユーザーに紐づいているか確認
  const caseData = await kv.get<string>(`case:${caseId}`);
  if (!caseData) {
    throw new Error('Case not found');
  }

  const parsedCase: CaseData = JSON.parse(caseData);
  if (parsedCase.line_user_id !== lineUserId) {
    throw new Error('Unauthorized: Case does not belong to this user');
  }

  const activeCase: ActiveCase = {
    case_id: caseId,
    updated_at: new Date().toISOString(),
  };

  await kv.set(`activeCase:${lineUserId}`, JSON.stringify(activeCase));
}

/**
 * アクティブ案件を取得
 * @param lineUserId LINE User ID
 * @returns 案件データ（存在しない場合はnull）
 */
export async function getActiveCase(lineUserId: string): Promise<CaseData | null> {
  const activeCaseData = await kv.get<string>(`activeCase:${lineUserId}`);

  if (!activeCaseData) {
    return null;
  }

  const activeCase: ActiveCase = JSON.parse(activeCaseData);
  const caseData = await kv.get<string>(`case:${activeCase.case_id}`);

  if (!caseData) {
    return null;
  }

  const parsedCase: CaseData = JSON.parse(caseData);

  // セキュリティチェック: 自分の案件かつ有効期限内
  if (parsedCase.line_user_id !== lineUserId) {
    return null;
  }

  const expiresAt = new Date(parsedCase.expires_at);
  if (expiresAt <= new Date()) {
    return null; // 期限切れ
  }

  return parsedCase;
}

/**
 * 案件データを取得
 * @param caseId 案件ID
 * @returns 案件データ（存在しない場合はnull）
 */
export async function getCase(caseId: string): Promise<CaseData | null> {
  const caseData = await kv.get<string>(`case:${caseId}`);

  if (!caseData) {
    return null;
  }

  return JSON.parse(caseData);
}

/**
 * 日時をフォーマット（表示用）
 * @param date Date
 * @returns フォーマットされた日時
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}/${month}/${day} ${hours}:${minutes}`;
}
