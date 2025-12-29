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
  savings_magic: string;
  pro_review: { title: string; content: string; };
  knowledge: { title: string; content: string; };
  risk_score?: number;
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

export default function Home() {
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
      setResult(null);
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
      if (current < 20) { increment = 1.0; delay = 80; setLoadingStep("見積書データをスキャン中..."); }
      else if (current < 40) { increment = 0.5; delay = 100; setLoadingStep("項目と金額を抽出中..."); }
      else if (current < 60) { increment = 0.4; delay = 120; setLoadingStep("法令・相場データベースと照合中..."); }
      else if (current < 80) { increment = 0.3; delay = 150; setLoadingStep("不要オプション・特約を検知中..."); }
      else { increment = 0.05; delay = 200; setLoadingStep("正式レポートを作成中..."); }
      
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

      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      if (!res.ok) {
         const data = await res.json().catch(() => ({}));
         throw new Error(data.error || "システムエラーが発生しました");
      }

      const data = await res.json();
      if (timerRef.current) clearTimeout(timerRef.current);
      
      setLoadingProgress(100);
      setLoadingStep("診断完了");

      setTimeout(() => {
        const risk = Math.min(100, Math.round((data.result.discount_amount / data.result.total_original) * 300));
        setResult({ ...data.result, risk_score: risk });
        setIsLoading(false);
      }, 600);

    } catch (error: any) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setErrorMessage(error.message || "解析に失敗しました。もう一度お試しください。");
      setIsLoading(false);
    }
  };

  const formatYen = (num: number) => new Intl.NumberFormat('ja-JP').format(num);

  const generateShareText = () => {
    if (!result) return "";
    return `【${result.property_name}】の初期費用診断💡\n見直し目安：約【${formatYen(result.discount_amount)}円】\n浮いたお金で「${result.savings_magic}」✨\n\n👇 診断結果\n`;
  };
  const shareUrl = typeof window !== 'undefined' ? window.location.href : "";

  const handleShareLine = () => window.open(`https://line.me/R/msg/text/?${encodeURIComponent(generateShareText() + shareUrl)}`, '_blank');
  const handleShareX = () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(generateShareText())}&url=${encodeURIComponent(shareUrl)}&hashtags=賃貸,初期費用`, '_blank');
  const handleCopyLink = () => {
    navigator.clipboard.writeText(generateShareText() + shareUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };
  
  const handleDownloadImage = async () => {
    if (!resultRef.current) return;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(resultRef.current, { backgroundColor: "#ffffff", scale: 2 } as any);
      const link = document.createElement("a");
      link.download = `初期費用診断_${result?.property_name || "結果"}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) { alert("画像の保存に失敗しました"); }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-600 font-sans selection:bg-blue-100 pb-20">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-3xl mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">
            賃貸初期費用<span className="text-blue-600">診断</span>
          </h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-6 md:p-10">
        
        {/* Main Title Area */}
        <div className="text-center mb-12 mt-4">
          <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4 leading-tight">
            その見積もり、<br/>
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 text-transparent bg-clip-text">本当に適正価格</span>ですか？
          </h2>
          <p className="text-slate-500 text-sm md:text-base">
            AIが市場価格と照合し、過剰な請求を徹底チェック。<br/>
            交渉で削除できる項目を自動で洗い出します。
          </p>
        </div>

        {/* Upload Area */}
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <label className="group cursor-pointer block">
            <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-8 flex flex-col items-center justify-center h-56 transition-all hover:border-blue-500 hover:bg-blue-50/50 hover:shadow-lg relative overflow-hidden">
              <input type="file" accept="image/*" onChange={handleEstimateChange} className="hidden" />
              {estimatePreview ? (
                <img src={estimatePreview} className="w-full h-full object-contain absolute inset-0 p-2" />
              ) : (
                <>
                  <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4 text-3xl">📄</div>
                  <span className="font-bold text-slate-700">見積書をアップロード</span>
                  <span className="text-xs text-white bg-red-500 px-2 py-0.5 rounded-full mt-2 font-bold">必須</span>
                </>
              )}
            </div>
          </label>
          <label className="group cursor-pointer block">
            <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-8 flex flex-col items-center justify-center h-56 transition-all hover:border-emerald-500 hover:bg-emerald-50/50 hover:shadow-lg relative overflow-hidden">
              <input type="file" accept="image/*" onChange={handlePlanChange} className="hidden" />
              {planPreview ? (
                <img src={planPreview} className="w-full h-full object-contain absolute inset-0 p-2" />
              ) : (
                <>
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4 text-3xl">🗺️</div>
                  <span className="font-bold text-slate-700">募集図面をアップロード</span>
                  <span className="text-xs text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full mt-2">任意</span>
                </>
              )}
            </div>
          </label>
        </div>

        {/* Action Button */}
        <div className="mb-16 text-center">
          {!isLoading ? (
            <button
              onClick={handleAnalyze}
              disabled={!estimateFile}
              className={`
                w-full md:w-auto px-16 py-5 rounded-xl font-bold text-lg shadow-xl transition-all transform hover:-translate-y-1 active:translate-y-0
                ${!estimateFile
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none" 
                  : "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-500/30"
                }
              `}
            >
              {!estimateFile ? "画像を選択してください" : "適正価格を診断する"}
            </button>
          ) : (
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xl max-w-sm mx-auto">
              <div className="flex justify-between text-sm font-bold text-slate-700 mb-2">
                <span>解析進行中...</span>
                <span>{Math.floor(loadingProgress)}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
                <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${loadingProgress}%` }}></div>
              </div>
              <p className="text-xs text-slate-500">{loadingStep}</p>
            </div>
          )}
        </div>
        
        {/* Error Message */}
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-center text-sm font-bold mb-8">
            {errorMessage}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-8">
            
            <div ref={resultRef} className="bg-white p-8 rounded-3xl border border-slate-200 shadow-2xl relative overflow-hidden">
              {/* Header */}
              <div className="border-b border-slate-100 pb-6 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">{result.property_name}</h2>
                  <span className="text-slate-500 text-sm font-medium">{result.room_number}</span>
                </div>
                <div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
                  <span className="text-xs text-slate-500 block">払いすぎ危険度</span>
                  <span className={`text-2xl font-black ${result.risk_score && result.risk_score > 50 ? 'text-red-500' : 'text-yellow-500'}`}>
                    {result.risk_score}<span className="text-sm text-slate-400 font-normal">/100</span>
                  </span>
                </div>
              </div>

              {/* Savings Impact */}
              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl p-8 mb-8 text-center shadow-lg relative overflow-hidden">
                <div className="relative z-10">
                  <p className="text-blue-100 text-sm font-bold mb-2">適正価格への見直し効果</p>
                  <div className="text-5xl md:text-6xl font-bold mb-2 tracking-tight">
                    -{formatYen(result.discount_amount)}<span className="text-xl font-medium">円</span>
                  </div>
                  <p className="text-sm bg-white/20 inline-block px-3 py-1 rounded-full backdrop-blur-sm">
                    {result.savings_magic}
                  </p>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-8">
                {/* 削除・交渉推奨 */}
                {result.items.filter(i => i.status !== 'fair').length > 0 && (
                  <div>
                    <h3 className="text-red-600 font-bold mb-4 flex items-center gap-2">
                      <span>⚠️</span> 交渉・削除できる可能性が高い項目
                    </h3>
                    <div className="space-y-3">
                      {result.items.filter(i => i.status !== 'fair').map((item, index) => (
                        <div key={index} className="bg-red-50 border border-red-100 rounded-xl p-4">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-bold text-slate-800">{item.name}</span>
                            <span className="text-xs font-bold text-white bg-red-500 px-2 py-1 rounded">
                              {item.status === 'cut' ? '削除推奨' : '交渉可'}
                            </span>
                          </div>
                          <div className="flex items-baseline gap-2 text-sm mb-2">
                            <span className="text-slate-400 line-through">¥{formatYen(item.price_original)}</span>
                            <span className="text-red-600 font-bold text-lg">→ ¥{formatYen(item.price_fair)}</span>
                          </div>
                          <p className="text-xs text-slate-600 bg-white p-2 rounded border border-red-100">
                            💡 {item.reason}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 適正項目 */}
                {result.items.filter(i => i.status === 'fair').length > 0 && (
                  <div>
                    <h3 className="text-emerald-600 font-bold mb-4 flex items-center gap-2">
                      <span>✅</span> 適正な項目
                    </h3>
                    <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-200">
                      {result.items.filter(i => i.status === 'fair').map((item, index) => (
                        <div key={index} className="flex justify-between p-3 text-sm">
                          <span className="text-slate-600">{item.name}</span>
                          <span className="text-emerald-600 font-medium">¥{formatYen(item.price_fair)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* AI Review */}
              <div className="mt-8 bg-slate-50 rounded-xl p-6 border-l-4 border-blue-500">
                <h3 className="text-blue-600 font-bold text-sm mb-2">総評コメント</h3>
                <p className="text-sm text-slate-700 leading-relaxed">{result.pro_review.content}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-4">
              <button onClick={handleDownloadImage} className="col-span-2 py-4 rounded-xl font-bold bg-slate-800 text-white hover:bg-slate-700 transition-colors flex items-center justify-center gap-2">
                <span>💾</span> 結果画像を保存
              </button>
              <button onClick={handleShareX} className="bg-black text-white py-3 rounded-xl font-bold text-sm">Xでシェア</button>
              <button onClick={handleShareLine} className="bg-[#06C755] text-white py-3 rounded-xl font-bold text-sm">LINEでシェア</button>
            </div>
          </div>
        )}

        {/* CTA Section (信頼性アピール + LINE誘導) */}
        <section className="mt-20 mb-10">
          <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-2xl text-center overflow-hidden relative">
            
            <h3 className="text-2xl font-bold text-slate-800 mb-6">
              AIの診断結果をもとに、<br/>
              <span className="text-blue-600">プロが正確な金額</span>を算出します
            </h3>

            {/* 3つのアピールポイント */}
            <div className="grid md:grid-cols-3 gap-4 mb-8">
              <div className="bg-slate-50 p-4 rounded-xl">
                <div className="text-2xl mb-1">⚡</div>
                <div className="font-bold text-slate-800 text-sm">年中無休で<br/>即レス対応</div>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl">
                <div className="text-2xl mb-1">🏆</div>
                <div className="font-bold text-slate-800 text-sm">交渉実績<br/>800件超のプロ</div>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl">
                <div className="text-2xl mb-1">📱</div>
                <div className="font-bold text-slate-800 text-sm">来店不要<br/>スマホで完結</div>
              </div>
            </div>

            <p className="text-slate-500 text-sm mb-6">
              診断結果のスクリーンショットを送ってください。<br/>
              担当者が内容を精査し、最安値での契約をサポートします。
            </p>

            <a 
              href="https://line.me/R/ti/p/@your_id" 
              target="_blank" 
              rel="noopener noreferrer"
              className="block w-full bg-[#06C755] hover:bg-[#05b34c] text-white font-bold text-xl py-5 rounded-xl shadow-lg transition-transform hover:scale-[1.02]"
            >
              正確な詳細をチェックする
              <span className="block text-xs font-normal opacity-90 mt-1">（LINEが開きます）</span>
            </a>

          </div>
        </section>

      </div>
      
      {/* Footer */}
      <footer className="text-center text-slate-400 text-xs py-10">
        © 2024 Smart Rent Check System
      </footer>

    </div>
  );
}