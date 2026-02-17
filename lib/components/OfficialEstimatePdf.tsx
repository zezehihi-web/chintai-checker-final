/**
 * 正式概算見積書PDFコンポーネント
 *
 * 株式会社beberise名義のA4見積書を @react-pdf/renderer で生成する。
 * 「診断」「削減」等の語は使わず、一般的な不動産見積書として出力する。
 * 必ず1ページに収まるようコンパクトに設計。
 */

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';

// ---------------------------------------------------------------------------
// フォント登録（日本語対応）
// ---------------------------------------------------------------------------
Font.register({
  family: 'NotoSansJP',
  fonts: [
    {
      src: 'https://fonts.gstatic.com/s/notosansjp/v56/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75s.ttf',
      fontWeight: 400,
    },
    {
      src: 'https://fonts.gstatic.com/s/notosansjp/v56/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFPYk75s.ttf',
      fontWeight: 700,
    },
  ],
});

// ---------------------------------------------------------------------------
// スタイル定義（1ページに収まるようコンパクトに）
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  page: {
    fontFamily: 'NotoSansJP',
    fontSize: 9,
    paddingTop: 30,
    paddingBottom: 40,
    paddingHorizontal: 36,
    color: '#1a1a1a',
  },

  // --- ヘッダー ---
  title: {
    fontSize: 18,
    fontWeight: 700,
    textAlign: 'center',
    marginBottom: 3,
    letterSpacing: 3,
  },
  titleUnderline: {
    borderBottomWidth: 2,
    borderBottomColor: '#1a1a1a',
    marginBottom: 14,
    marginHorizontal: 80,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  dateText: {
    fontSize: 8,
    marginBottom: 8,
    textAlign: 'right',
  },
  companyName: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 2,
  },
  companyDetail: {
    fontSize: 7.5,
    color: '#555555',
    marginBottom: 1,
  },

  // --- 合計欄（ヘッダー直下） ---
  totalBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f0f4f8',
    borderWidth: 1,
    borderColor: '#333333',
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: 700,
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: 700,
  },

  // --- 物件情報 ---
  propertySection: {
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  propertyRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  propertyLabel: {
    fontSize: 8,
    fontWeight: 700,
    width: 50,
    color: '#555555',
  },
  propertyValue: {
    fontSize: 8,
  },

  // --- 明細テーブル ---
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#333333',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  tableHeaderText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: 700,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  tableRowAlt: {
    backgroundColor: '#fafafa',
  },
  colNo: {
    width: 24,
  },
  colName: {
    flex: 1,
  },
  colAmount: {
    width: 110,
    textAlign: 'right',
  },

  // --- テーブル合計行 ---
  tableTotalRow: {
    flexDirection: 'row',
    borderTopWidth: 2,
    borderTopColor: '#333333',
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  tableTotalLabel: {
    flex: 1,
    fontSize: 10,
    fontWeight: 700,
    textAlign: 'right',
    paddingRight: 10,
  },
  tableTotalAmount: {
    width: 110,
    fontSize: 12,
    fontWeight: 700,
    textAlign: 'right',
  },

  // --- 備考欄 ---
  notesSection: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#999999',
    padding: 8,
  },
  notesTitle: {
    fontSize: 8,
    fontWeight: 700,
    marginBottom: 4,
    color: '#333333',
  },
  notesText: {
    fontSize: 7,
    lineHeight: 1.5,
    color: '#444444',
    marginBottom: 2,
  },

  // --- フッター ---
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 36,
    right: 36,
    textAlign: 'center',
    fontSize: 6,
    color: '#aaaaaa',
  },
});

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------
function formatYen(amount: number): string {
  return `¥${amount.toLocaleString('ja-JP')}`;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${y}年${m}月${d}日`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface EstimateItem {
  name: string;
  amount: number; // price_fair（税込）
}

export interface OfficialEstimatePdfProps {
  /** 物件名 */
  propertyName: string;
  /** 号室 */
  roomNumber: string;
  /** 明細項目（price_fair > 0 のもののみ渡す） */
  items: EstimateItem[];
  /** 合計金額（total_fair） */
  totalAmount: number;
  /** 発行日（省略時は現在日時） */
  issueDate?: Date;
}

// ---------------------------------------------------------------------------
// PDFドキュメント
// ---------------------------------------------------------------------------
const OfficialEstimatePdf: React.FC<OfficialEstimatePdfProps> = ({
  propertyName,
  roomNumber,
  items,
  totalAmount,
  issueDate,
}) => {
  const date = issueDate ?? new Date();

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap={false}>
        {/* ===== タイトル ===== */}
        <Text style={styles.title}>初期費用概算御見積書</Text>
        <View style={styles.titleUnderline} />

        {/* ===== 発行日 ===== */}
        <Text style={styles.dateText}>発行日: {formatDate(date)}</Text>

        {/* ===== ヘッダー（挨拶文 / 自社情報） ===== */}
        <View style={styles.headerRow}>
          {/* 左: 挨拶文 */}
          <View style={styles.headerLeft}>
            <Text style={{ fontSize: 8, color: '#555555' }}>
              下記の通りお見積り申し上げます。
            </Text>
          </View>

          {/* 右: 自社情報 */}
          <View style={styles.headerRight}>
            <Text style={styles.companyName}>株式会社beberise</Text>
            <Text style={styles.companyDetail}>〒107-0052</Text>
            <Text style={styles.companyDetail}>
              東京都港区赤坂６丁目１４−３ 近文ビル 6階A号室
            </Text>
          </View>
        </View>

        {/* ===== 合計金額バナー ===== */}
        <View style={styles.totalBanner}>
          <Text style={styles.totalLabel}>見積合計金額（概算）</Text>
          <Text style={styles.totalAmount}>{formatYen(totalAmount)}</Text>
        </View>

        {/* ===== 物件情報 ===== */}
        <View style={styles.propertySection}>
          <View style={styles.propertyRow}>
            <Text style={styles.propertyLabel}>物件名:</Text>
            <Text style={styles.propertyValue}>
              {propertyName || '—'}
            </Text>
          </View>
          <View style={styles.propertyRow}>
            <Text style={styles.propertyLabel}>号室:</Text>
            <Text style={styles.propertyValue}>
              {roomNumber || '—'}
            </Text>
          </View>
        </View>

        {/* ===== 明細テーブル ===== */}
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, styles.colNo]}>No.</Text>
          <Text style={[styles.tableHeaderText, styles.colName]}>項目名</Text>
          <Text style={[styles.tableHeaderText, styles.colAmount]}>
            金額（税込）
          </Text>
        </View>

        {items.map((item, index) => (
          <View
            key={index}
            style={[
              styles.tableRow,
              index % 2 === 1 ? styles.tableRowAlt : {},
            ]}
          >
            <Text style={[{ fontSize: 8 }, styles.colNo]}>{index + 1}</Text>
            <Text style={[{ fontSize: 8 }, styles.colName]}>{item.name}</Text>
            <Text style={[{ fontSize: 8 }, styles.colAmount]}>
              {formatYen(item.amount)}
            </Text>
          </View>
        ))}

        {/* テーブル合計行 */}
        <View style={styles.tableTotalRow}>
          <Text style={styles.tableTotalLabel}>合計</Text>
          <Text style={styles.tableTotalAmount}>{formatYen(totalAmount)}</Text>
        </View>

        {/* ===== 備考欄 ===== */}
        <View style={styles.notesSection}>
          <Text style={styles.notesTitle}>【備考】</Text>
          <Text style={styles.notesText}>
            ・本見積書は、ご提供いただいた他社様の見積書および募集図面を参考に作成した概算の初期費用見積書となります。
          </Text>
          <Text style={styles.notesText}>
            ・実際の契約条件や正確な金額については、管理会社への確認や交渉が必要となるため、変動する可能性がございます。
          </Text>
          <Text style={styles.notesText}>
            ・最終的には、当社のスタッフが物件ごとに詳細を確認した上で、正式な金額をご案内させていただきます。
          </Text>
        </View>

        {/* ===== フッター ===== */}
        <Text style={styles.footer}>
          株式会社beberise — 初期費用概算御見積書
        </Text>
      </Page>
    </Document>
  );
};

export default OfficialEstimatePdf;
