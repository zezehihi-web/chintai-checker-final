"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

type AnalysisResult = {
  items: {
    name: string;
    price_original: number;
    price_fair: number;
    status: "fair" | "negotiable" | "cut";
    reason: string;
  }[];
  total_original: number;
  total_fair: number;
  discount_amount: number;
  pro_review: { content: string; };
  risk_score: number;
};

// --- 危険度ゲージコンポーネント（バー型） ---
const RiskGauge = ({ score }: { score: number }) => {
  // お金のイメージ：ゴールド/金色のグラデーション
  const goldColors = {
    light: "#fbbf24", // amber-400
    mid: "#f59e0b",   // amber-500
    dark: "#d97706",  // amber-600
    darker: "#b45309" // amber-700
  };
  
  let textColor = "text-amber-700";
  let coinColor = goldColors;
  
  if (score > 40) {
    // 警告：オレンジゴールド
    coinColor = {
      light: "#fb923c", // orange-400
      mid: "#f97316",   // orange-500
      dark: "#ea580c",  // orange-600
      darker: "#c2410c" // orange-700
    };
    textColor = "text-orange-700";
  }
  if (score > 70) {
    // 危険：赤銅色
    coinColor = {
      light: "#f87171", // red-400
      mid: "#ef4444",   // red-500
      dark: "#dc2626",  // red-600
      darker: "#b91c1c" // red-700
    };
    textColor = "text-red-700";
  }

  return (
    <div className="w-full animate-fade-in-up">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-slate-700 tracking-wide uppercase">払いすぎ危険度</span>
        <div className="flex items-baseline gap-1">
          <span className={`text-3xl font-black ${textColor} drop-shadow-md`} style={{ 
            textShadow: `0 2px 8px ${coinColor.mid}40`
          }}>{score}</span>
          <span className="text-sm text-slate-400 font-medium">/100</span>
        </div>
      </div>
      
      {/* メインゲージコンテナ */}
      <div className="relative">
        {/* 背景の光る効果 */}
        <div className="absolute inset-0 bg-gradient-to-r from-amber-100/30 via-yellow-100/20 to-amber-100/30 rounded-full blur-xl -z-10" style={{ height: '150%', top: '-25%' }}></div>
        
        {/* ゲージ本体（細く） */}
        <div className="relative h-6 bg-gradient-to-br from-slate-200 to-slate-300 rounded-full overflow-hidden shadow-inner border border-slate-300/50">
          {/* 背景パターン（コインのイメージ） */}
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(0,0,0,0.1) 1px, transparent 1px)',
            backgroundSize: '12px 12px'
          }}></div>
          
          {/* プログレスバー（ゴールド/金色） */}
          <div 
            className="h-full w-full rounded-full transition-transform duration-1000 ease-out relative overflow-hidden"
            style={{ 
              transform: `scaleX(${Math.max(0, Math.min(1, score / 100))})`,
              transformOrigin: "left",
              background: `linear-gradient(90deg, ${coinColor.darker} 0%, ${coinColor.dark} 25%, ${coinColor.mid} 50%, ${coinColor.light} 75%, ${coinColor.mid} 100%)`,
              boxShadow: `
                inset 0 1px 2px rgba(255,255,255,0.3),
                inset 0 -1px 2px rgba(0,0,0,0.2),
                0 0 12px ${coinColor.mid}60,
                0 0 6px ${coinColor.light}40
              `
            }}
          >
            {/* メタリックな光沢 */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/50 via-transparent to-black/20"></div>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
            
            {/* コインのようなハイライト */}
            <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/60 via-white/20 to-transparent"></div>
            <div className="absolute top-1/2 left-0 right-0 h-1/2 bg-gradient-to-b from-transparent via-black/10 to-black/20"></div>
            
            {/* コインの縁のような効果 */}
            <div className="absolute top-0 left-0 bottom-0 w-1 bg-gradient-to-r from-white/40 to-transparent"></div>
            <div className="absolute top-0 right-0 bottom-0 w-1 bg-gradient-to-l from-white/40 to-transparent"></div>
          </div>
          
          {/* スコア表示（ゲージ上） */}
          {score > 20 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-xs font-black text-white drop-shadow-lg" style={{
                textShadow: '0 1px 3px rgba(0,0,0,0.5), 0 0 4px rgba(0,0,0,0.3)'
              }}>{score}%</span>
            </div>
          )}
        </div>
        
        {/* 安全/危険のインジケーター */}
        <div className="mt-3 flex justify-between items-center">
          <span className="text-xs text-slate-500 font-medium">安全</span>
          <div className="flex gap-1.5">
            {Array.from({ length: 5 }).map((_, i) => {
              const isActive = i * 25 < score;
              return (
                <div
                  key={i}
                  className="relative"
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: isActive ? coinColor.mid : '#e2e8f0',
                    boxShadow: isActive 
                      ? `0 0 8px ${coinColor.mid}60, inset 0 1px 2px rgba(255,255,255,0.3), inset 0 -1px 2px rgba(0,0,0,0.2)`
                      : 'inset 0 1px 2px rgba(0,0,0,0.1)',
                  }}
                >
                  {isActive && (
                    <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent rounded-full"></div>
                  )}
                </div>
              );
            })}
          </div>
          <span className="text-xs text-slate-500 font-medium">危険</span>
        </div>
      </div>
    </div>
  );
};

export default function SharePage() {
  const params = useParams();
  const router = useRouter();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchShareData = async () => {
      try {
        if (!params.id || typeof params.id !== 'string') {
          throw new Error("共有IDが無効です");
        }
        
        const res = await fetch(`/api/share?id=${params.id}`);
        if (!res.ok) {
          let errorMessage = "データの取得に失敗しました";
          try {
            const errorData = await res.json();
            errorMessage = errorData.error || errorMessage;
          } catch (e) {
            // JSON解析に失敗した場合はデフォルトメッセージを使用
            if (res.status === 404) {
              errorMessage = "共有リンクが見つかりませんでした";
            } else if (res.status === 410) {
              errorMessage = "共有リンクの有効期限が切れています";
            } else {
              errorMessage = `エラーが発生しました（ステータス: ${res.status}）`;
            }
          }
          throw new Error(errorMessage);
        }
        
        const data = await res.json();
        if (!data.result) {
          throw new Error("データ形式が正しくありません");
        }
        setResult(data.result);
      } catch (err: any) {
        console.error("Share data fetch error:", err);
        setError(err.message || "エラーが発生しました");
      } finally {
        setIsLoading(false);
      }
    };

    if (params.id) {
      fetchShareData();
    } else {
      setError("共有IDが指定されていません");
      setIsLoading(false);
    }
  }, [params.id]);

  const formatYen = (num: number) => new Intl.NumberFormat('ja-JP').format(num);

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="min-h-dvh bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-8 shadow-xl max-w-md text-center">
          <div className="text-4xl mb-4">😢</div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">エラー</h2>
          <p className="text-slate-600 mb-6">{error || "データが見つかりませんでした"}</p>
          <button
            onClick={() => router.push("/")}
            className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors"
          >
            トップに戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#02060D] text-slate-600 font-sans pb-20">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-3xl mx-auto px-6 py-4 flex justify-center items-center">
          <h1 className="text-lg md:text-xl font-bold text-slate-800 tracking-tight">
            賃貸初期費用<span className="text-blue-600">診断</span>
          </h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-6 md:p-10 animate-fade-in-up">
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-2xl relative overflow-hidden mb-8">
          {/* Header - 物件名なし */}
          <div className="border-b border-slate-100 pb-8 mb-8">
            <div className="max-w-md mx-auto">
              <RiskGauge score={result.risk_score} />
            </div>
          </div>

          {/* Savings Impact */}
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl p-6 mb-8 text-center shadow-lg relative overflow-hidden">
            <p className="text-blue-100 text-sm font-bold mb-2">削減可能額</p>
            <div className="text-4xl md:text-5xl font-black mb-3 tracking-tight">
              -{formatYen(result.discount_amount)}<span className="text-lg font-medium">円</span>
            </div>
            <div className="inline-flex items-center gap-2 bg-white/20 px-4 py-1.5 rounded-full text-sm backdrop-blur-sm">
              <span className="opacity-80">提示: ¥{formatYen(result.total_original)}</span>
              <span>→</span>
              <span className="font-bold">適正: ¥{formatYen(result.total_fair)}</span>
            </div>
          </div>

          {/* Items List */}
          <div className="space-y-3 mb-4">
            {result.items.filter(i => i.status !== 'fair').map((item, index) => (
              <div key={index} className="bg-red-50 border border-red-100 rounded-xl p-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-slate-800">{item.name}</span>
                  <span className="text-[10px] font-bold text-white bg-red-500 px-2 py-0.5 rounded">
                    {item.status === 'cut' ? '削除推奨' : '交渉可'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-xs text-slate-500">{item.reason}</p>
                  <div className="text-right whitespace-nowrap ml-2">
                    <span className="text-xs text-slate-400 line-through block">¥{formatYen(item.price_original)}</span>
                    <span className="text-red-600 font-bold">¥{formatYen(item.price_fair)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {result.items.filter(i => i.status === 'fair').length > 0 && (
            <div className="mt-6 pt-4 border-t border-slate-100">
              <p className="text-xs font-bold text-emerald-600 mb-2">✅ 適正な項目</p>
              <div className="text-xs text-slate-500 grid grid-cols-2 gap-2">
                {result.items.filter(i => i.status === 'fair').map((item, idx) => (
                  <div key={idx} className="flex justify-between border-b border-slate-100 pb-1">
                    <span>{item.name}</span>
                    <span>¥{formatYen(item.price_fair)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* AI Review */}
        <div className="bg-blue-50 rounded-xl p-5 border-l-4 border-blue-500 text-slate-700 text-sm leading-relaxed mb-8">
          <h3 className="font-bold text-blue-700 mb-3 flex items-center gap-2">🤖 AIエージェントの総評</h3>
          {(() => {
            let content = result.pro_review.content.trim();
            content = content.replace(/この物件の初期費用について[^\n]*\n?/g, '');
            content = content.replace(/以下の点を必ず含めて詳細に分析してください[^\n]*\n?/g, '');
            content = content.replace(/総評は[^\n]*\n?/g, '');
            content = content.replace(/説明文や指示文は一切含めないでください[^\n]*\n?/g, '');
            
            const lines = content.split('\n').filter(line => {
              const trimmed = line.trim();
              return trimmed && 
                     !trimmed.match(/^【出力JSON形式】|^Markdown|^savings_magic/) &&
                     !trimmed.match(/この物件の初期費用について/) &&
                     !trimmed.match(/以下の点を必ず含めて/) &&
                     !trimmed.match(/総評は[^\n]*フォーマット/);
            });
            
            if (lines.length === 0) {
              return <p className="text-slate-600">総評を読み込み中...</p>;
            }
            
            let summaryIndex = -1;
            let summary = '';
            
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].trim().match(/^【総括】/)) {
                if (i + 1 < lines.length) {
                  summaryIndex = i;
                  summary = lines[i + 1].trim();
                  break;
                }
              }
            }
            
            if (summaryIndex === -1 && lines.length > 0) {
              summary = lines[0].trim().replace(/^【総括】\s*/, '').replace(/^総括[：:]\s*/, '');
              summaryIndex = -1;
            }
            
            const restLines = summaryIndex >= 0 
              ? lines.slice(summaryIndex + 2)
              : lines.slice(1);
            
            return (
              <>
                {summary && (
                  <p className="font-black text-blue-700 text-base mb-3">{summary}</p>
                )}
                {restLines.map((line, i) => {
                  const trimmed = line.trim();
                  if (trimmed.match(/^【.*】$/)) {
                    return null;
                  }
                  if (trimmed.startsWith('・') || trimmed.startsWith('-') || trimmed.match(/^\d+\./)) {
                    return <p key={i} className="mb-1.5 ml-2">{trimmed}</p>;
                  }
                  if (!trimmed) {
                    return null;
                  }
                  return <p key={i} className="mb-2">{trimmed}</p>;
                }).filter(Boolean)}
              </>
            );
          })()}
        </div>

        {/* CTA Section - 拡散用 */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden mb-8">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
          <div className="relative z-10 text-center">
            <h2 className="text-2xl md:text-4xl font-black mb-4 leading-tight">
              あなたも<br/>
              <span className="text-yellow-300">診断してみませんか？</span>
            </h2>
            <p className="text-blue-100 mb-8 text-sm md:text-base">
              AIがあなたの見積もりを分析し、<br/>
              削減可能な項目を洗い出します
            </p>
            <button
              onClick={() => router.push("/")}
              className="bg-white text-blue-600 font-black py-5 px-12 rounded-2xl text-lg shadow-2xl hover:scale-105 transition-all hover:shadow-white/50 relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
              <span className="relative z-10">今すぐ診断する</span>
            </button>
          </div>
        </div>

        <div className="text-center">
          <button
            onClick={() => router.push("/")}
            className="text-slate-400 text-sm hover:text-blue-600 font-bold py-4 transition-colors"
          >
            ← トップに戻る
          </button>
        </div>
      </div>

      <footer className="text-center text-slate-400 text-xs py-10">
        © 2024 Smart Rent Check System
      </footer>
    </div>
  );
}

