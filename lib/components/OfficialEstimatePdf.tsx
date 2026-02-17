/**
 * 正式概算見積書PDFコンポーネント
 *
 * 株式会社beberise名義のA4見積書を @react-pdf/renderer で生成する。
 * 「診断」「削減」等の語は使わず、一般的な不動産見積書として出力する。
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
// スタイル定義
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  page: {
    fontFamily: 'NotoSansJP',
    fontSize: 10,
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 40,
    color: '#1a1a1a',
  },

  // --- ヘッダー ---
  title: {
    fontSize: 20,
    fontWeight: 700,
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: 4,
  },
  titleUnderline: {
    borderBottomWidth: 2,
    borderBottomColor: '#1a1a1a',
    marginBottom: 24,
    marginHorizontal: 100,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  dateText: {
    fontSize: 9,
    marginBottom: 12,
    textAlign: 'right',
  },
  customerName: {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 2,
  },
  customerSuffix: {
    fontSize: 10,
    marginBottom: 8,
  },
  companyName: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 2,
  },
  companyDetail: {
    fontSize: 8,
    color: '#555555',
    marginBottom: 1,
  },
  stampBox: {
    width: 50,
    height: 50,
    borderWidth: 1,
    borderColor: '#cccccc',
    borderRadius: 25,
    marginTop: 4,
    alignSelf: 'flex-end',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stampText: {
    fontSize: 6,
    color: '#cccccc',
  },

  // --- 合計欄（ヘッダー直下） ---
  totalBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f0f4f8',
    borderWidth: 1,
    borderColor: '#333333',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: 700,
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: 700,
  },

  // --- 物件情報 ---
  propertySection: {
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  propertyRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  propertyLabel: {
    fontSize: 9,
    fontWeight: 700,
    width: 60,
    color: '#555555',
  },
  propertyValue: {
    fontSize: 9,
  },

  // --- 明細テーブル ---
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#333333',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableHeaderText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: 700,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableRowAlt: {
    backgroundColor: '#fafafa',
  },
  colNo: {
    width: 30,
  },
  colName: {
    flex: 1,
  },
  colAmount: {
    width: 120,
    textAlign: 'right',
  },

  // --- テーブル合計行 ---
  tableTotalRow: {
    flexDirection: 'row',
    borderTopWidth: 2,
    borderTopColor: '#333333',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  tableTotalLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: 700,
    textAlign: 'right',
    paddingRight: 12,
  },
  tableTotalAmount: {
    width: 120,
    fontSize: 13,
    fontWeight: 700,
    textAlign: 'right',
  },

  // --- 備考欄 ---
  notesSection: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#999999',
    padding: 12,
  },
  notesTitle: {
    fontSize: 9,
    fontWeight: 700,
    marginBottom: 6,
    color: '#333333',
  },
  notesText: {
    fontSize: 7.5,
    lineHeight: 1.6,
    color: '#444444',
    marginBottom: 3,
  },

  // --- フッター ---
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 7,
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
      <Page size="A4" style={styles.page}>
        {/* ===== タイトル ===== */}
        <Text style={styles.title}>初期費用概算御見積書</Text>
        <View style={styles.titleUnderline} />

        {/* ===== 発行日 ===== */}
        <Text style={styles.dateText}>発行日: {formatDate(date)}</Text>

        {/* ===== ヘッダー（宛名 / 自社情報） ===== */}
        <View style={styles.headerRow}>
          {/* 左: 宛名 */}
          <View style={styles.headerLeft}>
            <Text style={styles.customerName}>お客様</Text>
            <Text style={styles.customerSuffix}>御中</Text>
            <View style={{ marginTop: 8 }}>
              <Text style={{ fontSize: 9, color: '#555555' }}>
                下記の通りお見積り申し上げます。
              </Text>
            </View>
          </View>

          {/* 右: 自社情報 */}
          <View style={styles.headerRight}>
            <Text style={styles.companyName}>株式会社beberise</Text>
            <Text style={styles.companyDetail}>〒150-0043</Text>
            <Text style={styles.companyDetail}>
              東京都渋谷区道玄坂1-2-3 渋谷ビル4F
            </Text>
            <Text style={styles.companyDetail}>TEL: 03-XXXX-XXXX</Text>
            <Text style={styles.companyDetail}>
              Mail: info@beberise.co.jp
            </Text>
            <View style={styles.stampBox}>
              <Text style={styles.stampText}>印</Text>
            </View>
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
        {/* テーブルヘッダー */}
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, styles.colNo]}>No.</Text>
          <Text style={[styles.tableHeaderText, styles.colName]}>項目名</Text>
          <Text style={[styles.tableHeaderText, styles.colAmount]}>
            金額（税込）
          </Text>
        </View>

        {/* テーブルボディ */}
        {items.map((item, index) => (
          <View
            key={index}
            style={[
              styles.tableRow,
              index % 2 === 1 ? styles.tableRowAlt : {},
            ]}
          >
            <Text style={[{ fontSize: 9 }, styles.colNo]}>{index + 1}</Text>
            <Text style={[{ fontSize: 9 }, styles.colName]}>{item.name}</Text>
            <Text style={[{ fontSize: 9 }, styles.colAmount]}>
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
