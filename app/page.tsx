"use client";
import { useState, useRef } from "react";

// --- 型定義 ---
type AnalysisResult = {
  property_name: string;
  room_number: string;
  items: {
    name: string;
    price_original: number;
    price_fair: number;
    status: "fair" | "negotiable" | "cut" | "requires_confirmation";
    reason: string;
    is_insurance?: boolean;
    // 新規追加: 根拠情報
    evidence?: {
      flyer_evidence: string | null;
      estimate_evidence: string | null;
      source_description: string;
    };
    requires_confirmation?: boolean;
    confidence?: number;
  }[];
  total_original: number;
  total_fair: number;
  discount_amount: number;
  pro_review: { content: string; };
  risk_score: number;
  // 新規追加
  has_unconfirmed_items?: boolean;
  unconfirmed_item_names?: string[];
  extraction_quality?: 'high' | 'medium' | 'low';
};

// --- 画像圧縮関数 ---
const compressImage = async (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target?.result as string; };
    reader.onerror = () => reject(new Error("読み込み失敗"));
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const maxWidth = 1200;
      const scaleSize = maxWidth / img.width;
      const width = Math.min(maxWidth, img.width);
      const height = img.height * (img.width > maxWidth ? scaleSize : 1);
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvasエラー")); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (blob) resolve(new File([blob], file.name, { type: "image/jpeg" }));
        else reject(new Error("圧縮失敗"));
      }, "image/jpeg", 0.7);
    };
    reader.readAsDataURL(file);
  });
};

// --- 危険度ゲージコンポーネント（お金のイメージ、細いデザイン） ---
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
            className="h-full rounded-full transition-all duration-1000 ease-out relative overflow-hidden"
            style={{ 
              width: `${score}%`,
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
          
          {/* 数値表示（コインの上に） */}
          {score > 20 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-xs font-black text-white drop-shadow-lg" style={{
                textShadow: '0 1px 3px rgba(0,0,0,0.5), 0 0 4px rgba(0,0,0,0.3)'
              }}>{score}%</span>
            </div>
          )}
        </div>
        
        {/* 下部のコインインジケーター */}
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

export default function Home() {
  const [currentView, setCurrentView] = useState<"top" | "result">("top");
  const [estimateFile, setEstimateFile] = useState<File | null>(null);
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [estimatePreview, setEstimatePreview] = useState<string | null>(null);
  const [planPreview, setPlanPreview] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStep, setLoadingStep] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const progressRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [isCopied, setIsCopied] = useState(false);

  const handleEstimateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // ファイルタイプの検証
      if (!file.type.startsWith('image/')) {
        setErrorMessage("画像ファイルを選択してください");
        e.target.value = ''; // リセット
        return;
      }
      
      // ファイルサイズの検証（10MB制限）
      if (file.size > 10 * 1024 * 1024) {
        setErrorMessage("画像サイズが大きすぎます（10MB以下にしてください）");
        e.target.value = ''; // リセット
        return;
      }
      
      try {
        setEstimateFile(file);
        // 既存のプレビューURLを解放
        if (estimatePreview) {
          URL.revokeObjectURL(estimatePreview);
        }
        setEstimatePreview(URL.createObjectURL(file));
        setErrorMessage("");
      } catch (error) {
        console.error("File handling error:", error);
        setErrorMessage("ファイルの読み込みに失敗しました");
        e.target.value = ''; // リセット
      }
    }
  };
  const handlePlanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // ファイルタイプの検証
      if (!file.type.startsWith('image/')) {
        setErrorMessage("画像ファイルを選択してください");
        e.target.value = ''; // リセット
        return;
      }
      
      // ファイルサイズの検証（10MB制限）
      if (file.size > 10 * 1024 * 1024) {
        setErrorMessage("画像サイズが大きすぎます（10MB以下にしてください）");
        e.target.value = ''; // リセット
        return;
      }
      
      try {
        setPlanFile(file);
        // 既存のプレビューURLを解放
        if (planPreview) {
          URL.revokeObjectURL(planPreview);
        }
        setPlanPreview(URL.createObjectURL(file));
        setErrorMessage("");
      } catch (error) {
        console.error("File handling error:", error);
        setErrorMessage("ファイルの読み込みに失敗しました");
        e.target.value = ''; // リセット
      }
    }
  };

  const handleAnalyze = async () => {
    if (!estimateFile) return;
    setIsLoading(true);
    setLoadingProgress(0);
    progressRef.current = 0;
    setErrorMessage("");
    setResult(null);

    const runAnimation = () => {
      const current = progressRef.current;
      let increment = 0; let delay = 100;
      if (current < 20) { increment = 1.0; delay = 80; setLoadingStep("見積書をスキャン中..."); }
      else if (current < 40) { increment = 0.5; delay = 100; setLoadingStep("図面と照合中..."); }
      else if (current < 60) { increment = 0.4; delay = 120; setLoadingStep("市場相場と比較中..."); }
      else if (current < 80) { increment = 0.3; delay = 150; setLoadingStep("削減項目を算出中..."); }
      else { increment = 0.05; delay = 200; setLoadingStep("レポート生成中..."); }
      if (current + increment < 99) { progressRef.current += increment; } 
      else { progressRef.current = 99; }
      setLoadingProgress(progressRef.current);
      timerRef.current = setTimeout(runAnimation, delay);
    };
    runAnimation();

    try {
      const formData = new FormData();
      setLoadingStep("画像を最適化中...");
      try {
        const compressedEstimate = await compressImage(estimateFile);
        formData.append("estimate", compressedEstimate);
      } catch (e) {
        formData.append("estimate", estimateFile);
      }
      if (planFile) {
        try {
          const compressedPlan = await compressImage(planFile);
          formData.append("plan", compressedPlan);
        } catch (e) {
          formData.append("plan", planFile);
        }
      }

      setLoadingStep("AI解析中...");
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      if (!res.ok) {
         let errorData: any = {};
         try {
           errorData = await res.json();
         } catch (e) {
           // JSON解析に失敗した場合
           errorData = { error: `サーバーエラー（ステータス: ${res.status}）` };
         }
         
         // 429エラー（レート制限）の特別処理
         if (res.status === 429) {
           const rateLimitMessage = errorData.details || errorData.error || "APIレート制限に達しました。しばらく時間をおいてから再度お試しください。";
           throw new Error(rateLimitMessage);
         }
         
         const errorMessage = errorData.error || errorData.details || "システムエラーが発生しました";
         throw new Error(errorMessage);
      }
      const data = await res.json();
      if (!data.result) {
        throw new Error("解析結果の形式が正しくありません");
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      
      setLoadingProgress(100);
      setLoadingStep("完了");
      setTimeout(() => {
        setResult(data.result);
        setShareId(null); // 新しい結果なので共有IDをリセット
        setIsLoading(false);
        setCurrentView("result");
        // ★ここを修正：スマホでも確実に一番上にスクロールさせる
        window.scrollTo({ top: 0, behavior: 'instant' });
      }, 600);
    } catch (error: any) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setErrorMessage(error.message || "解析に失敗しました。");
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setEstimateFile(null);
    setPlanFile(null);
    setEstimatePreview(null);
    setPlanPreview(null);
    setResult(null);
    setCurrentView("top");
    // リセット時も一番上へ
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const formatYen = (num: number) => new Intl.NumberFormat('ja-JP').format(num);
  const [shareId, setShareId] = useState<string | null>(null);
  const [isCreatingShare, setIsCreatingShare] = useState(false);

  // 共有用リンクを作成
  const createShareLink = async () => {
    if (!result || isCreatingShare) return;
    setIsCreatingShare(true);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result }),
      });
      if (!res.ok) throw new Error("共有リンクの作成に失敗しました");
      const data = await res.json();
      setShareId(data.shareId);
      return data.shareId;
    } catch (error) {
      console.error("Share creation error:", error);
      alert("共有リンクの作成に失敗しました");
      return null;
    } finally {
      setIsCreatingShare(false);
    }
  };

  // ★修正：シェア用テキスト（物件名なし、拡散推奨）
  const generateShareText = () => {
    if (!result) return "";
    return `【賃貸初期費用診断】\n` +
           `提示額：¥${formatYen(result.total_original)}\n` +
           `適正額：¥${formatYen(result.total_fair)}\n` +
           `⬇️ ⬇️ ⬇️\n` +
           `削減目安：-¥${formatYen(result.discount_amount)}\n\n` +
           `これから部屋探しする人は要チェック！👇\n`;
  };

  const getShareUrl = () => {
    if (shareId) {
      return typeof window !== 'undefined' ? `${window.location.origin}/share/${shareId}` : "";
    }
    return "";
  };

  const handleShareLine = async () => {
    let url = getShareUrl();
    if (!url) {
      const id = await createShareLink();
      if (id) url = typeof window !== 'undefined' ? `${window.location.origin}/share/${id}` : "";
    }
    if (url) {
      // LINE URLスキームでテキストとURLを自動埋め込み
      const shareText = generateShareText() + url;
      window.open(`https://line.me/R/msg/text/?${encodeURIComponent(shareText)}`, '_blank');
    }
  };

  const handleShareX = async () => {
    let url = getShareUrl();
    if (!url) {
      const id = await createShareLink();
      if (id) url = typeof window !== 'undefined' ? `${window.location.origin}/share/${id}` : "";
    }
    if (url) {
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(generateShareText())}&url=${encodeURIComponent(url)}&hashtags=賃貸,初期費用`, '_blank');
    }
  };

  const handleCopyLink = async () => {
    let url = getShareUrl();
    if (!url) {
      const id = await createShareLink();
      if (id) url = typeof window !== 'undefined' ? `${window.location.origin}/share/${id}` : "";
    }
    if (url) {
      navigator.clipboard.writeText(generateShareText() + url);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };
  
  const handleDownloadImage = async () => {
    if (!resultRef.current) return;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(resultRef.current, { backgroundColor: "#ffffff", scale: 2 } as any);
      const link = document.createElement("a");
      link.download = `診断結果.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) { alert("保存に失敗しました"); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40 text-slate-600 font-sans pb-20 relative overflow-hidden">
      {/* 背景装飾 */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-0 left-0 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-200/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }}></div>
      </div>
      
      <header className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-700 sticky top-0 z-50 shadow-lg">
        <div className="max-w-3xl mx-auto px-6 py-4 flex justify-center items-center">
          <button
            onClick={() => {
              setCurrentView("top");
              handleReset();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="text-lg md:text-xl font-black text-white tracking-tight hover:text-blue-300 transition-colors cursor-pointer"
          >
            賃貸初期費用<span className="text-blue-400">診断</span>
          </button>
        </div>
      </header>

      {/* ================= TOP VIEW ================= */}
      {currentView === "top" && (
        <div className="max-w-3xl mx-auto p-6 md:p-10 animate-fade-in">
          <div className="text-center mb-10 mt-4">
            <h2 className="text-2xl md:text-4xl font-extrabold text-slate-900 mb-4 leading-tight">
              その見積もり、<br/>
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 text-transparent bg-clip-text">本当に適正価格</span>ですか？
            </h2>
            <p className="text-slate-500 text-sm">
              AIが図面と見積もりを照合し、<br/>交渉可能な項目を洗い出します。
            </p>
          </div>

          <div className="flex flex-row gap-6 mb-6 justify-center flex-wrap">
            <label className="group cursor-pointer block flex-1 min-w-[200px] max-w-xs">
              <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-6 flex flex-col items-center justify-center h-56 hover:border-blue-500 hover:bg-blue-50/50 transition-all relative overflow-hidden">
                <input type="file" accept="image/*" onChange={handleEstimateChange} className="hidden" />
                {estimatePreview ? (
                  <img src={estimatePreview} className="w-full h-full object-contain absolute inset-0 p-2" />
                ) : (
                  <>
                    <div className="relative mb-3 flex items-center justify-center h-24">
                      <img 
                        src="/estimate-icon.png" 
                        alt="見積書" 
                        className="max-w-[96px] max-h-[96px] object-contain drop-shadow-md"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          const fallback = target.parentElement?.querySelector('.fallback-icon') as HTMLElement;
                          if (fallback) {
                            fallback.classList.remove('hidden');
                            fallback.classList.add('block');
                          }
                          target.style.display = 'none';
                        }}
                      />
                      <div className="text-4xl mb-3 hidden fallback-icon">📄</div>
                    </div>
                    <span className="font-bold text-slate-700">見積書</span>
                    <span className="text-xs text-white bg-red-500 px-2 py-0.5 rounded-full mt-2 font-bold">必須</span>
                  </>
                )}
              </div>
            </label>
            <label className="group cursor-pointer block flex-1 min-w-[200px] max-w-xs">
              <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-6 flex flex-col items-center justify-center h-56 hover:border-emerald-500 hover:bg-emerald-50/50 transition-all relative overflow-hidden">
                <input type="file" accept="image/*" onChange={handlePlanChange} className="hidden" />
                {planPreview ? (
                  <img src={planPreview} className="w-full h-full object-contain absolute inset-0 p-2" />
                ) : (
                  <>
                    <div className="relative mb-3 flex items-center justify-center h-24">
                      <img 
                        src="/plan-icon.png" 
                        alt="募集図面" 
                        className="max-w-[96px] max-h-[96px] object-contain drop-shadow-md"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          const fallback = target.parentElement?.querySelector('.fallback-icon') as HTMLElement;
                          if (fallback) {
                            fallback.classList.remove('hidden');
                            fallback.classList.add('block');
                          }
                          target.style.display = 'none';
                        }}
                      />
                      <div className="text-4xl mb-3 hidden fallback-icon">🗺️</div>
                    </div>
                    <span className="font-bold text-slate-700">募集図面</span>
                    <span className="text-xs text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full mt-2">任意</span>
                  </>
                )}
              </div>
            </label>
          </div>
          
          {/* 募集図面アップロードの説明 */}
          {!planPreview && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-10 text-center animate-fade-in-up">
              <p className="text-sm text-blue-800 font-bold">
                💡 <span className="text-blue-700">募集図面をアップロードすると診断精度がアップします</span>
              </p>
              <p className="text-xs text-blue-600 mt-1">
                図面と見積書を照合することで、より正確な診断が可能になります
              </p>
            </div>
          )}

          <div className="text-center">
            {!isLoading ? (
              <button
                onClick={handleAnalyze}
                disabled={!estimateFile}
                className={`w-full md:w-auto px-16 py-4 rounded-xl font-bold text-lg shadow-xl transition-all ${!estimateFile ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none" : "bg-blue-600 text-white hover:bg-blue-700"}`}
              >
                {!estimateFile ? "画像を選択してください" : "適正価格を診断する"}
              </button>
            ) : (
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xl max-w-sm mx-auto">
                <div className="flex justify-between text-sm font-bold text-slate-700 mb-2">
                  <span>解析進行中...</span>
                  <span>{Math.floor(loadingProgress)}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
                  <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${loadingProgress}%` }}></div>
                </div>
                <p className="text-xs text-slate-500">{loadingStep}</p>
              </div>
            )}
          </div>
          {errorMessage && <div className="mt-6 bg-red-50 text-red-600 px-4 py-3 rounded-lg text-center text-sm font-bold">{errorMessage}</div>}
        </div>
      )}

      {/* ================= RESULT VIEW ================= */}
      {currentView === "result" && result && (
        <div className="max-w-3xl mx-auto p-6 md:p-10 animate-fade-in-up">
          
          <div ref={resultRef} className="bg-white p-8 rounded-3xl border border-slate-200 shadow-2xl relative overflow-hidden mb-8 animate-scale-in">
            {/* Header */}
            <div className="border-b border-slate-100 pb-8 mb-8 animate-fade-in-up">
              {/* 物件名ラベル */}
              <div className="text-center mb-3">
                <p className="text-xs text-slate-400 font-bold tracking-wider uppercase mb-2">物件名</p>
              </div>
              {/* 物件名と号室（中央配置） */}
              <div className="text-center mb-6">
                <div className="flex items-baseline justify-center gap-3 flex-wrap">
                  <h2 className="text-3xl md:text-4xl font-black text-slate-900 leading-tight tracking-tight" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                    {result.property_name && result.property_name !== "不明" ? result.property_name : "物件名入力なし"}
                  </h2>
                  {result.room_number !== "不明" && (
                    <span className="text-xl md:text-2xl text-slate-500 font-black">
                      {result.room_number}
                    </span>
                  )}
                </div>
              </div>
              {/* 危険度ゲージ */}
              <div className="max-w-md mx-auto">
                <RiskGauge score={result.risk_score} />
              </div>
            </div>

            {/* Savings Impact: 「浮いたお金」を削除 */}
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl p-6 mb-8 text-center shadow-lg relative overflow-hidden animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
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

            {/* 要確認項目の警告 */}
            {result.has_unconfirmed_items && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 animate-fade-in-up">
                <div className="flex items-start gap-2">
                  <span className="text-amber-500 text-lg">⚠️</span>
                  <div>
                    <p className="text-sm font-bold text-amber-700">一部の項目は確認が必要です</p>
                    <p className="text-xs text-amber-600 mt-1">
                      画像からの読み取りに不確実性がある項目があります。実際の書類と照合してください。
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Items List */}
            <div className="space-y-3 mb-4">
              {result.items.filter(i => i.status !== 'fair').map((item, index) => (
                <div 
                  key={index} 
                  className={`border rounded-xl p-4 animate-fade-in-up ${
                    item.requires_confirmation 
                      ? 'bg-amber-50 border-amber-200' 
                      : 'bg-red-50 border-red-100'
                  }`} 
                  style={{ animationDelay: `${0.2 + index * 0.05}s` }}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-slate-800">{item.name}</span>
                    <div className="flex items-center gap-1">
                      {item.requires_confirmation && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                          要確認
                        </span>
                      )}
                      <span className={`text-[10px] font-bold text-white px-2 py-0.5 rounded ${
                        item.status === 'cut' ? 'bg-red-500' : 'bg-orange-500'
                      }`}>
                        {item.status === 'cut' ? '削除推奨' : '交渉可'}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-slate-500">{item.reason}</p>
                    <div className="text-right whitespace-nowrap ml-2">
                      <span className="text-xs text-slate-400 line-through block">¥{formatYen(item.price_original)}</span>
                      <span className="text-red-600 font-bold">¥{formatYen(item.price_fair)}</span>
                    </div>
                  </div>
                  {/* 根拠情報の表示 */}
                  {item.evidence && (
                    <div className="mt-2 pt-2 border-t border-slate-200">
                      <p className="text-[10px] text-slate-400 font-bold mb-1">📋 根拠</p>
                      <p className="text-[10px] text-slate-500">{item.evidence.source_description}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {result.items.filter(i => i.status === 'fair').length > 0 && (
              <div className="mt-6 pt-4 border-t border-slate-100">
                <p className="text-xs font-bold text-emerald-600 mb-2">✅ 適正な項目</p>
                <div className="text-xs text-slate-500 space-y-2">
                  {result.items.filter(i => i.status === 'fair').map((item, idx) => (
                    <div key={idx} className="border-b border-slate-100 pb-2">
                      <div className="flex justify-between">
                        <span className="font-medium">{item.name}</span>
                        <span>¥{formatYen(item.price_fair)}</span>
                      </div>
                      {/* 根拠情報の表示 */}
                      {item.evidence && (
                        <p className="text-[10px] text-slate-400 mt-1">
                          根拠: {item.evidence.source_description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <button onClick={handleDownloadImage} className="col-span-2 py-3 rounded-xl font-bold bg-slate-800 text-white text-sm hover:bg-slate-700 flex items-center justify-center gap-2 shadow-md">
              <span>💾</span> 画像を保存
            </button>
            <button 
              onClick={handleShareX} 
              disabled={isCreatingShare}
              className="bg-black text-white py-3 rounded-xl font-bold text-sm shadow-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 animate-fade-in-up"
            >
              {isCreatingShare ? "⏳ 準備中..." : "Xでシェア"}
            </button>
            <button 
              onClick={handleShareLine} 
              disabled={isCreatingShare}
              className="bg-[#06C755] text-white py-3 rounded-xl font-bold text-sm shadow-md hover:bg-[#05b34c] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isCreatingShare ? "⏳" : "📱"} {isCreatingShare ? "準備中..." : "LINEでシェア"}
            </button>
            <button 
              onClick={handleCopyLink} 
              disabled={isCreatingShare}
              className="col-span-2 bg-slate-100 text-slate-600 font-bold text-sm py-3 rounded-xl hover:bg-slate-200 border border-slate-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreatingShare ? "⏳ 準備中..." : isCopied ? "✨ コピーしました！" : "🔗 共有用リンクをコピー"}
            </button>
            {shareId && (
              <div className="col-span-2 bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
                <p className="font-bold mb-1">共有リンクが作成されました</p>
                <p className="text-blue-600 break-all">{typeof window !== 'undefined' ? `${window.location.origin}/share/${shareId}` : ""}</p>
              </div>
            )}
          </div>

          {/* AI Review */}
          <div className="bg-blue-50 rounded-xl p-5 border-l-4 border-blue-500 text-slate-700 text-sm leading-relaxed mb-8 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
            <h3 className="font-bold text-blue-700 mb-3 flex items-center gap-2">🤖 AIエージェントの総評</h3>
            {(() => {
              // 不要な説明文を削除
              let content = result.pro_review.content.trim();
              // 説明文的なパターンを削除
              content = content.replace(/この物件の初期費用について[^\n]*\n?/g, '');
              content = content.replace(/以下の点を必ず含めて詳細に分析してください[^\n]*\n?/g, '');
              content = content.replace(/総評は[^\n]*\n?/g, '');
              content = content.replace(/説明文や指示文は一切含めないでください[^\n]*\n?/g, '');
              
              // 重複した文章を削除（同じ内容が2回以上出てくる場合）
              const seenLines = new Set<string>();
              const lines = content.split('\n').filter(line => {
                const trimmed = line.trim();
                if (!trimmed) return false;
                
                // 説明文的なパターンを除外
                if (trimmed.match(/^【出力JSON形式】|^Markdown|^savings_magic/)) return false;
                if (trimmed.match(/この物件の初期費用について/)) return false;
                if (trimmed.match(/以下の点を必ず含めて/)) return false;
                if (trimmed.match(/総評は[^\n]*フォーマット/)) return false;
                
                // 重複チェック（完全一致）
                const normalized = trimmed.toLowerCase().replace(/\s+/g, ' ');
                if (seenLines.has(normalized)) return false;
                seenLines.add(normalized);
                
                return true;
              });
              
              if (lines.length === 0) {
                return <p className="text-slate-600">総評を読み込み中...</p>;
              }
              
              // 【総括】見出しを探して、その次の行を総括として扱う
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
              
              // 【総括】が見つからない場合は、最初の行を総括として扱う
              if (summaryIndex === -1 && lines.length > 0) {
                summary = lines[0].trim().replace(/^【総括】\s*/, '').replace(/^総括[：:]\s*/, '');
                summaryIndex = -1; // 最初の行を使うのでスキップ
              }
              
              const restLines = summaryIndex >= 0 
                ? lines.slice(summaryIndex + 2) // 【総括】とその次の行をスキップ
                : lines.slice(1); // 最初の行をスキップ
              
              // 固定の注意書きを分離
              const noticeText = "※今回の診断結果はあくまで『書面上で分かる範囲』の減額です。";
              const negotiationText = "交渉が面倒、怖いと感じる方もご安心ください。私たちが全ての交渉を代行し、最安値で契約できるようサポートします。まずはLINEでご相談ください。";
              
              // 固定文章をrestLinesから除外
              const filteredRestLines = restLines.filter(line => {
                const trimmed = line.trim();
                return trimmed !== noticeText && !trimmed.includes(noticeText) && 
                       trimmed !== negotiationText && !trimmed.includes(negotiationText);
              });
              
              return (
                <>
                  {summary && (
                    <p className="font-black text-blue-700 text-base mb-3">{summary}</p>
                  )}
                  {filteredRestLines.map((line, i) => {
                    const trimmed = line.trim();
                    // 【最善の行動】【ポイント】などの見出しは削除（見出し自体は表示しない）
                    if (trimmed.match(/^【.*】$/)) {
                      return null;
                    }
                    // 箇条書き（・で始まる行）はそのまま
                    if (trimmed.startsWith('・') || trimmed.startsWith('-') || trimmed.match(/^\d+\./)) {
                      return <p key={i} className="mb-1.5 ml-2">{trimmed}</p>;
                    }
                    // 空行はスキップ
                    if (!trimmed) {
                      return null;
                    }
                    return <p key={i} className="mb-2">{trimmed}</p>;
                  }).filter(Boolean)}
                  {/* 固定の注意書きを赤文字で表示 */}
                  <p className="text-red-600 font-bold text-sm mt-4 mb-2">{noticeText}</p>
                  <p className="text-slate-700 text-sm">{negotiationText}</p>
                </>
              );
            })()}
          </div>

          {/* CV Section */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xl mb-8 relative overflow-hidden animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
             <div className="absolute top-0 right-0 w-32 h-32 bg-green-50 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/2"></div>
             <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="text-left flex-1">
                  <h3 className="text-lg font-bold text-slate-900 mb-2">
                    AIの診断結果を<br/><span className="text-green-600">プロが無料で精査</span>します
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    リンクをコピーして送るだけで、最安値プランをご提案。
                  </p>
                </div>
                <a 
                  href={process.env.NEXT_PUBLIC_LINE_URL || "https://line.me/R/ti/p/@your_id"} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="flex-shrink-0 bg-gradient-to-r from-[#06C755] to-[#05b34c] hover:from-[#05b34c] hover:to-[#04a042] text-white font-black py-5 px-10 rounded-2xl shadow-2xl shadow-green-300/50 transition-all hover:scale-105 hover:shadow-green-400/60 flex items-center gap-3 text-lg relative overflow-hidden group"
                  style={{
                    boxShadow: '0 10px 30px rgba(6, 199, 85, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                  {/* 立体的なLINEアイコン */}
                  <div className="relative z-10 w-8 h-8 flex items-center justify-center">
                    <div className="absolute inset-0 bg-white/20 rounded-full blur-sm"></div>
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 relative z-10 drop-shadow-lg" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>
                      <path d="M12 2C6.48 2 2 5.56 2 10.1c0 2.45 1.3 4.63 3.4 6.1-.15.8-.5 2.15-.56 2.47-.05.24.1.47.34.47.1 0 .2-.03.27-.08.05-.03 2.6-1.73 3.63-2.45.62.17 1.28.26 1.95.26 5.52 0 10-3.56 10-8.1S17.52 2 12 2z"/>
                    </svg>
                  </div>
                  <span className="relative z-10 tracking-wide">詳細を今すぐ確認</span>
                </a>
             </div>
             <div className="relative z-10 mt-6 pt-6 border-t border-slate-200">
                <div className="flex flex-wrap gap-4 text-sm justify-center md:justify-start">
                  <div className="flex items-center gap-2 text-slate-800 group">
                    <div className="relative w-8 h-8 flex items-center justify-center bg-gradient-to-br from-blue-100 to-blue-200 rounded-lg shadow-md group-hover:shadow-lg transition-all">
                      <span className="text-lg" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}>📅</span>
                    </div>
                    <span className="font-black tracking-tight" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>365日対応</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-800 group">
                    <div className="relative w-8 h-8 flex items-center justify-center bg-gradient-to-br from-amber-100 to-amber-200 rounded-lg shadow-md group-hover:shadow-lg transition-all">
                      <span className="text-lg" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}>🏆</span>
                    </div>
                    <span className="font-black tracking-tight" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>実績800件以上</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-800 group">
                    <div className="relative w-8 h-8 flex items-center justify-center bg-gradient-to-br from-green-100 to-green-200 rounded-lg shadow-md group-hover:shadow-lg transition-all">
                      <span className="text-lg" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}>📱</span>
                    </div>
                    <span className="font-black tracking-tight" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>来店不要</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-800 group">
                    <div className="relative w-8 h-8 flex items-center justify-center bg-gradient-to-br from-emerald-100 to-emerald-200 rounded-lg shadow-md group-hover:shadow-lg transition-all">
                      <span className="text-lg" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}>💰</span>
                    </div>
                    <span className="font-black tracking-tight" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>仲介手数料最大無料</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-800 group">
                    <div className="relative w-8 h-8 flex items-center justify-center bg-gradient-to-br from-purple-100 to-purple-200 rounded-lg shadow-md group-hover:shadow-lg transition-all">
                      <span className="text-lg" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}>✅</span>
                    </div>
                    <span className="font-black tracking-tight" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>不要オプション一切無し</span>
                  </div>
                </div>
             </div>
          </div>

          <button onClick={handleReset} className="block w-full text-center text-slate-400 text-sm hover:text-blue-600 font-bold py-4 transition-colors">
            🔄 別の物件を診断する
          </button>

        </div>
      )}

      <footer className="text-center text-slate-400 text-xs py-10">
        © 2024 Smart Rent Check System
      </footer>
    </div>
  );
}