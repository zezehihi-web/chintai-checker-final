/**
 * Vercel KV操作のヘルパー関数
 *
 * 案件（case）、caseToken、LINEユーザーのデータ管理
 */

import crypto from 'crypto';

type KvClient = {
  get: <T = unknown>(key: string) => Promise<T | null>;
  set: (key: string, value: unknown) => Promise<unknown>;
  del: (key: string) => Promise<unknown>;
  setex: (key: string, ttlSeconds: number, value: unknown) => Promise<unknown>;
  ttl: (key: string) => Promise<number>;
};

type MemoryEntry = { value: unknown; expiresAtMs: number | null };

function createMemoryKv(): KvClient {
  const store = new Map<string, MemoryEntry>();

  const isExpired = (entry: MemoryEntry) =>
    entry.expiresAtMs !== null && entry.expiresAtMs <= Date.now();

  const getEntry = (key: string): MemoryEntry | null => {
    const entry = store.get(key);
    if (!entry) return null;
    if (isExpired(entry)) {
      store.delete(key);
      return null;
    }
    return entry;
  };

  return {
    async get<T = unknown>(key: string) {
      const entry = getEntry(key);
      return (entry ? (entry.value as T) : null);
    },
    async set(key: string, value: unknown) {
      store.set(key, { value, expiresAtMs: null });
      return "OK";
    },
    async del(key: string) {
      store.delete(key);
      return 1;
    },
    async setex(key: string, ttlSeconds: number, value: unknown) {
      store.set(key, { value, expiresAtMs: Date.now() + ttlSeconds * 1000 });
      return "OK";
    },
    async ttl(key: string) {
      const entry = getEntry(key);
      if (!entry) return -2; // Redis互換: key not found
      if (entry.expiresAtMs === null) return -1; // no expire
      return Math.max(0, Math.floor((entry.expiresAtMs - Date.now()) / 1000));
    },
  };
}

let kvClientSingleton: KvClient | null = null;

async function getKv(): Promise<KvClient> {
  if (kvClientSingleton) return kvClientSingleton;

  try {
    // NOTE: @vercel/kv が未インストールでもUIを起動できるようにする（ローカル開発用フォールバック）
    // bundler解決を避けるため eval(require) を使う
    const req = (0, eval)("require") as NodeRequire; // eslint-disable-line no-eval
    const mod = req("@vercel/kv") as { kv?: KvClient };
    if (!mod?.kv) throw new Error("`@vercel/kv` loaded but `kv` export missing");
    kvClientSingleton = mod.kv;
    return kvClientSingleton;
  } catch (e) {
    console.warn("[kv] @vercel/kv が見つからないためメモリKVで代替します（再起動で消えます）", e);
    kvClientSingleton = createMemoryKv();
    return kvClientSingleton;
  }
}

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

export interface ConversationState {
  line_user_id: string;
  step: 'property_confirm' | 'application_intent' | 'consultation' | 'waiting_images' | 'completed';
  case_id: string;
  updated_at: string;
}

/**
 * 案件を作成
 * @param result 診断結果
 * @returns case_id
 */
export async function createCase(result: any): Promise<string> {
  const kv = await getKv();
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
    caseData
  );

  return caseId;
}

/**
 * caseTokenを発行（10分TTL、ワンタイム）
 * @param caseId 案件ID
 * @returns caseToken（32文字hex）
 */
export async function createCaseToken(caseId: string): Promise<string> {
  const kv = await getKv();
  // 128bit（16バイト）のランダムトークン → 32文字のhex
  const token = crypto.randomBytes(16).toString('hex');

  // 10分TTL
  await kv.setex(
    `caseToken:${token}`,
    600,
    {
      case_id: caseId,
      created_at: Date.now(),
    }
  );

  return token;
}

/**
 * caseTokenを検証して消費（ワンタイム）
 * @param token caseToken
 * @returns case_id（トークンが有効な場合）、null（無効な場合）
 */
export async function consumeCaseToken(token: string): Promise<string | null> {
  const kv = await getKv();
  const key = `caseToken:${token}`;
  const data = await kv.get<{ case_id: string; created_at: number }>(key);

  if (!data) {
    return null; // トークンが存在しない or 期限切れ
  }

  // トークンを削除（ワンタイム）
  await kv.del(key);

  return data.case_id;
}

/**
 * 案件をLINEユーザーに紐づける
 * @param caseId 案件ID
 * @param lineUserId LINE User ID
 */
export async function linkCaseToUser(caseId: string, lineUserId: string): Promise<void> {
  const kv = await getKv();
  // 案件データを取得
  const caseData = await kv.get<CaseData>(`case:${caseId}`);
  if (!caseData) {
    throw new Error('Case not found');
  }

  caseData.line_user_id = lineUserId;

  // 案件データを更新
  const ttl = await kv.ttl(`case:${caseId}`);
  await kv.setex(`case:${caseId}`, ttl > 0 ? ttl : 30 * 24 * 60 * 60, caseData);

  // LINEユーザーが存在しない場合は作成
  const userKey = `lineUser:${lineUserId}`;
  const existingUser = await kv.get<LineUser>(userKey);

  if (!existingUser) {
    const lineUser: LineUser = {
      line_user_id: lineUserId,
      created_at: new Date().toISOString(),
      last_active_at: new Date().toISOString(),
    };
    await kv.set(userKey, lineUser);
  } else {
    // 最終アクティブ日時を更新
    existingUser.last_active_at = new Date().toISOString();
    await kv.set(userKey, existingUser);
  }

  // ユーザーの案件リストに追加
  const userCasesKey = `userCases:${lineUserId}`;
  const userCasesData = await kv.get<{ case_ids: string[] }>(userCasesKey);
  let caseIds: string[] = [];

  if (userCasesData) {
    caseIds = userCasesData.case_ids || [];
  }

  // 既に存在しない場合のみ追加（先頭に追加＝新しい順）
  if (!caseIds.includes(caseId)) {
    caseIds.unshift(caseId);

    // 最大100件まで保持
    if (caseIds.length > 100) {
      caseIds = caseIds.slice(0, 100);
    }

    await kv.set(userCasesKey, { case_ids: caseIds });
  }
}

/**
 * ユーザーの案件一覧を取得
 * @param lineUserId LINE User ID
 * @param limit 取得件数（デフォルト5件）
 * @returns 案件一覧
 */
export async function getUserCases(lineUserId: string, limit: number = 5): Promise<CaseData[]> {
  const kv = await getKv();
  const userCasesKey = `userCases:${lineUserId}`;
  const userCasesData = await kv.get<{ case_ids: string[] }>(userCasesKey);

  console.log(`[getUserCases] User: ${lineUserId}, Key: ${userCasesKey}, Found: ${!!userCasesData}`);

  if (!userCasesData) {
    console.log(`[getUserCases] No userCases data found for ${lineUserId}`);
    return [];
  }

  const caseIds: string[] = userCasesData.case_ids || [];
  console.log(`[getUserCases] Found ${caseIds.length} case IDs:`, caseIds.slice(0, 5));

  // limitまでの案件を取得
  const limitedIds = caseIds.slice(0, limit);
  const cases: CaseData[] = [];

  for (const caseId of limitedIds) {
    const caseData = await kv.get<CaseData>(`case:${caseId}`);
    if (caseData) {
      console.log(`[getUserCases] Case ${caseId}: line_user_id=${caseData.line_user_id}, expires_at=${caseData.expires_at}`);
      // 自分の案件かつ有効期限内のもののみ
      if (caseData.line_user_id === lineUserId) {
        const expiresAt = new Date(caseData.expires_at);
        const isValid = expiresAt > new Date();
        console.log(`[getUserCases] Case ${caseId}: isValid=${isValid}, expiresAt=${expiresAt.toISOString()}, now=${new Date().toISOString()}`);
        if (isValid) {
          cases.push(caseData);
        }
      } else {
        console.log(`[getUserCases] Case ${caseId}: line_user_id mismatch (${caseData.line_user_id} !== ${lineUserId})`);
      }
    } else {
      console.log(`[getUserCases] Case ${caseId}: not found in KV`);
    }
  }

  console.log(`[getUserCases] Returning ${cases.length} valid cases`);
  return cases;
}

/**
 * アクティブ案件を設定
 * @param lineUserId LINE User ID
 * @param caseId 案件ID
 */
export async function setActiveCase(lineUserId: string, caseId: string): Promise<void> {
  const kv = await getKv();
  // 案件が存在し、かつユーザーに紐づいているか確認
  const caseData = await kv.get<CaseData>(`case:${caseId}`);
  if (!caseData) {
    throw new Error('Case not found');
  }

  if (caseData.line_user_id !== lineUserId) {
    throw new Error('Unauthorized: Case does not belong to this user');
  }

  const activeCase: ActiveCase = {
    case_id: caseId,
    updated_at: new Date().toISOString(),
  };

  await kv.set(`activeCase:${lineUserId}`, activeCase);
}

/**
 * アクティブ案件を取得
 * @param lineUserId LINE User ID
 * @returns 案件データ（存在しない場合はnull）
 */
export async function getActiveCase(lineUserId: string): Promise<CaseData | null> {
  const kv = await getKv();
  const activeCaseData = await kv.get<ActiveCase>(`activeCase:${lineUserId}`);

  if (!activeCaseData) {
    return null;
  }

  const caseData = await kv.get<CaseData>(`case:${activeCaseData.case_id}`);

  if (!caseData) {
    return null;
  }

  // セキュリティチェック: 自分の案件かつ有効期限内
  if (caseData.line_user_id !== lineUserId) {
    return null;
  }

  const expiresAt = new Date(caseData.expires_at);
  if (expiresAt <= new Date()) {
    return null; // 期限切れ
  }

  return caseData;
}

/**
 * 案件データを取得
 * @param caseId 案件ID
 * @returns 案件データ（存在しない場合はnull）
 */
export async function getCase(caseId: string): Promise<CaseData | null> {
  const kv = await getKv();
  const caseData = await kv.get<CaseData>(`case:${caseId}`);

  if (!caseData) {
    return null;
  }

  return caseData;
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

/**
 * 会話状態を保存
 * @param lineUserId LINE User ID
 * @param step 会話ステップ
 * @param caseId 案件ID
 */
export async function setConversationState(
  lineUserId: string,
  step: ConversationState['step'],
  caseId: string
): Promise<void> {
  const kv = await getKv();
  const state: ConversationState = {
    line_user_id: lineUserId,
    step,
    case_id: caseId,
    updated_at: new Date().toISOString(),
  };

  await kv.set(`conversation:${lineUserId}`, state);
}

/**
 * 会話状態を取得
 * @param lineUserId LINE User ID
 * @returns 会話状態（存在しない場合はnull）
 */
export async function getConversationState(lineUserId: string): Promise<ConversationState | null> {
  const kv = await getKv();
  return await kv.get<ConversationState>(`conversation:${lineUserId}`);
}

/**
 * 会話状態をクリア
 * @param lineUserId LINE User ID
 */
export async function clearConversationState(lineUserId: string): Promise<void> {
  const kv = await getKv();
  await kv.del(`conversation:${lineUserId}`);
}
