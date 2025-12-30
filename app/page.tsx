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
    status: "fair" | "negotiable" | "cut";
    reason: string;
    is_insurance?: boolean;
  }[];
  total_original: number;
  total_fair: number;
  discount_amount: number;
  pro_review: { content: string; };
  risk_score: number;
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

// --- 危険度ゲージコンポーネント（バー型） ---
const RiskGauge = ({ score }: { score: number }) => {
  let barColor = "bg-gradient-to-r from-green-400 to-green-600";
  let textColor = "text-green-600";
  let bgColor = "bg-green-50";
  
  if (score > 40) {
    barColor = "bg-gradient-to-r from-yellow-400 to-yellow-600";
    textColor = "text-yellow-600";
    bgColor = "bg-yellow-50";
  }
  if (score > 70) {
    barColor = "bg-gradient-to-r from-red-400 to-red-600";
    textColor = "text-red-600";
    bgColor = "bg-red-50";
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-slate-700">払いすぎ危険度</span>
        <span className={`text-2xl font-black ${textColor}`}>{score}<span className="text-sm text-slate-400">/100</span></span>
      </div>
      <div className="relative h-8 bg-slate-100 rounded-full overflow-hidden shadow-inner">
        {/* 背景グラデーション */}
        <div className={`absolute inset-0 ${bgColor} opacity-30`}></div>
        {/* プログレスバー */}
        <div 
          className={`h-full ${barColor} rounded-full transition-all duration-1000 ease-out shadow-lg relative overflow-hidden`}
          style={{ width: `${score}%` }}
        >
          {/* 光沢エフェクト */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
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
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setEstimateFile(file);
      setEstimatePreview(URL.createObjectURL(file));
      setErrorMessage("");
    }
  };
  const handlePlanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPlanFile(file);
      setPlanPreview(URL.createObjectURL(file));
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
         const data = await res.json().catch(() => ({}));
         throw new Error(data.error || "システムエラーが発生しました");
      }
      const data = await res.json();
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
      window.open(`https://line.me/R/msg/text/?${encodeURIComponent(generateShareText() + url)}`, '_blank');
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
    <div className="min-h-screen bg-slate-50 text-slate-600 font-sans pb-20">
      
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-3xl mx-auto px-6 py-4 flex justify-center items-center">
          <h1 className="text-lg md:text-xl font-bold text-slate-800 tracking-tight">
            賃貸初期費用<span className="text-blue-600">診断</span>
          </h1>
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

          <div className="grid md:grid-cols-2 gap-6 mb-10">
            <label className="group cursor-pointer block">
              <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-6 flex flex-col items-center justify-center h-56 hover:border-blue-500 hover:bg-blue-50/50 transition-all relative overflow-hidden">
                <input type="file" accept="image/*" onChange={handleEstimateChange} className="hidden" />
                {estimatePreview ? (
                  <img src={estimatePreview} className="w-full h-full object-contain absolute inset-0 p-2" />
                ) : (
                  <>
                    <div className="text-4xl mb-3">📄</div>
                    <span className="font-bold text-slate-700">見積書</span>
                    <span className="text-xs text-white bg-red-500 px-2 py-0.5 rounded-full mt-2 font-bold">必須</span>
                  </>
                )}
              </div>
            </label>
            <label className="group cursor-pointer block">
              <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-6 flex flex-col items-center justify-center h-56 hover:border-emerald-500 hover:bg-emerald-50/50 transition-all relative overflow-hidden">
                <input type="file" accept="image/*" onChange={handlePlanChange} className="hidden" />
                {planPreview ? (
                  <img src={planPreview} className="w-full h-full object-contain absolute inset-0 p-2" />
                ) : (
                  <>
                    <div className="text-4xl mb-3">🗺️</div>
                    <span className="font-bold text-slate-700">募集図面</span>
                    <span className="text-xs text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full mt-2">任意</span>
                  </>
                )}
              </div>
            </label>
          </div>

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
          
          <div ref={resultRef} className="bg-white p-8 rounded-3xl border border-slate-200 shadow-2xl relative overflow-hidden mb-8">
            {/* Header */}
            <div className="border-b border-slate-100 pb-8 mb-8">
              {/* 物件名と号室（中央配置） */}
              <div className="text-center mb-6">
                <div className="flex items-baseline justify-center gap-3 flex-wrap">
                  <h2 className="text-2xl md:text-3xl font-black text-slate-900 leading-tight">
                    {result.property_name && result.property_name !== "不明" ? result.property_name : "物件名入力なし"}
                  </h2>
                  {result.room_number !== "不明" && (
                    <span className="text-lg md:text-xl text-slate-500 font-bold bg-slate-100 px-3 py-1 rounded">
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

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <button onClick={handleDownloadImage} className="col-span-2 py-3 rounded-xl font-bold bg-slate-800 text-white text-sm hover:bg-slate-700 flex items-center justify-center gap-2 shadow-md">
              <span>💾</span> 画像を保存
            </button>
            <button 
              onClick={handleShareX} 
              disabled={isCreatingShare}
              className="bg-black text-white py-3 rounded-xl font-bold text-sm shadow-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isCreatingShare ? "⏳" : "X"} {isCreatingShare ? "準備中..." : "Xでシェア"}
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
          <div className="bg-blue-50 rounded-xl p-5 border-l-4 border-blue-500 text-slate-700 text-sm leading-relaxed mb-8">
            <h3 className="font-bold text-blue-700 mb-3 flex items-center gap-2">🤖 AIエージェントの総評</h3>
            {(() => {
              // 不要な説明文を削除
              let content = result.pro_review.content.trim();
              // 説明文的なパターンを削除
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
              
              return (
                <>
                  {summary && (
                    <p className="font-black text-blue-700 text-base mb-3">{summary}</p>
                  )}
                  {restLines.map((line, i) => {
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
                </>
              );
            })()}
          </div>

          {/* CV Section */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xl mb-8 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 h-32 bg-green-50 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/2"></div>
             <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="text-left flex-1">
                  <h3 className="text-lg font-bold text-slate-900 mb-2">
                    AIの診断結果を<br/><span className="text-green-600">プロが無料で精査</span>します
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    保存した画像を送るだけで、最安値プランをご提案。
                  </p>
                </div>
                <a 
                  href={process.env.NEXT_PUBLIC_LINE_URL || "https://line.me/R/ti/p/@your_id"} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="flex-shrink-0 bg-gradient-to-r from-[#06C755] to-[#05b34c] hover:from-[#05b34c] hover:to-[#04a042] text-white font-bold py-5 px-10 rounded-2xl shadow-2xl shadow-green-300/50 transition-all hover:scale-105 hover:shadow-green-400/60 flex items-center gap-2 text-lg relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 relative z-10"><path d="M12 2C6.48 2 2 5.56 2 10.1c0 2.45 1.3 4.63 3.4 6.1-.15.8-.5 2.15-.56 2.47-.05.24.1.47.34.47.1 0 .2-.03.27-.08.05-.03 2.6-1.73 3.63-2.45.62.17 1.28.26 1.95.26 5.52 0 10-3.56 10-8.1S17.52 2 12 2z"/></svg>
                  <span className="relative z-10">詳細を今すぐ確認</span>
                </a>
             </div>
             <div className="relative z-10 mt-6 pt-6 border-t border-slate-200">
                <div className="flex flex-wrap gap-3 text-xs justify-center md:justify-start">
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <span className="text-base">📅</span>
                    <span className="font-bold">365日対応</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <span className="text-base">🏆</span>
                    <span className="font-bold">実績800件以上</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <span className="text-base">📱</span>
                    <span className="font-bold">来店不要</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <span className="text-base">💰</span>
                    <span className="font-bold">仲介手数料最大無料</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <span className="text-base">✅</span>
                    <span className="font-bold">不要オプション一切無し</span>
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