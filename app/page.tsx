"use client";
import { useState, useEffect, useRef } from "react";
import html2canvas from "html2canvas";

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
  pro_review: {
    title: string;
    content: string;
  };
  knowledge: {
    title: string;
    content: string;
  };
  risk_score?: number;
};

// --- 画像圧縮関数 (ここがポイント！) ---
// 大きな画像を読み込んで、幅1024px以下・画質60%に圧縮します
const compressImage = async (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました"));

    img.onload = () => {
      const canvas = document.createElement("canvas");
      // 最大幅を1024pxに制限（これなら文字も読めて、容量は軽い）
      const maxWidth = 1024;
      const scaleSize = maxWidth / img.width;
      const width = Math.min(maxWidth, img.width);
      const height = img.height * (img.width > maxWidth ? scaleSize : 1);

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("圧縮処理に失敗しました"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      // JPEG品質0.6（60%）で圧縮
      canvas.toBlob((blob) => {
        if (blob) {
          // 元のファイル名を引き継ぎつつ、新しい軽量ファイルを作成
          resolve(new File([blob], file.name, { type: "image/jpeg" }));
        } else {
          reject(new Error("画像の圧縮に失敗しました"));
        }
      }, "image/jpeg", 0.6);
    };

    reader.readAsDataURL(file);
  });
};

// --- 背景コンポーネント ---
const TechBackground = () => (
  <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-[#0F172A]">
    <div className="absolute top-[-20%] right-[-20%] w-[800px] h-[800px] bg-blue-600/20 rounded-full blur-[120px] animate-pulse-slow"></div>
    <div className="absolute bottom-[-20%] left-[-20%] w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[100px] animate-pulse-slow delay-1000"></div>
    <div className="absolute top-0 left-0 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 mix-blend-overlay"></div>
  </div>
);

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

  // ファイル選択ハンドラ
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

  // 解析実行
  const handleAnalyze = async () => {
    if (!estimateFile) return;
    setIsLoading(true);
    setLoadingProgress(0);
    progressRef.current = 0;
    setErrorMessage("");
    setResult(null);

    // プログレスバーのアニメーション
    const runAnimation = () => {
      const current = progressRef.current;
      let increment = 0; let delay = 100;
      if (current < 20) { increment = 1.0; delay = 80; setLoadingStep("見積書データをスキャン中..."); }
      else if (current < 40) { increment = 0.5; delay = 100; setLoadingStep("物件情報と金額を抽出中..."); }
      else if (current < 60) { increment = 0.4; delay = 120; setLoadingStep("法規・相場データベースと照合中..."); }
      else if (current < 80) { increment = 0.3; delay = 150; setLoadingStep("隠れコスト・不要オプション検知中..."); }
      else { increment = 0.05; delay = 200; setLoadingStep("削減レポートを作成中..."); }
      if (current + increment < 99) { progressRef.current += increment; } 
      else { progressRef.current = 99; }
      setLoadingProgress(progressRef.current);
      timerRef.current = setTimeout(runAnimation, delay);
    };
    runAnimation();

    try {
      const formData = new FormData();

      // ★ここで送信前に画像を圧縮！
      setLoadingStep("画像を最適化中(軽量化)...");
      
      try {
        const compressedEstimate = await compressImage(estimateFile);
        formData.append("estimate", compressedEstimate);
      } catch (e) {
        console.error("圧縮失敗:", e);
        // 圧縮に失敗したら元のファイルを使う（保険）
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

      setLoadingStep("AIが解析中...");
      
      // API送信
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
         throw new Error("サーバーからの応答が不正です（タイムアウトの可能性があります）");
      }

      const data = await res.json();
      
      if (timerRef.current) clearTimeout(timerRef.current);

      if (!res.ok) throw new Error(data.error || "解析失敗");
      
      setLoadingProgress(100);
      setLoadingStep("診断完了！");

      setTimeout(() => {
        const risk = Math.min(100, Math.round((data.result.discount_amount / data.result.total_original) * 300));
        setResult({ ...data.result, risk_score: risk });
        setIsLoading(false);
      }, 600);

    } catch (error: any) {
      if (timerRef.current) clearTimeout(timerRef.current);
      console.error(error);
      setErrorMessage(error.message || "解析エラーが発生しました。");
      setIsLoading(false);
    }
  };

  const formatYen = (num: number) => new Intl.NumberFormat('ja-JP').format(num);

  // シェア機能
  const generateShareText = () => {
    if (!result) return "";
    return `【${result.property_name}】の初期費用診断💡\n見直しで約【${formatYen(result.discount_amount)}円】安くなるかも！？\n浮いたお金で「${result.savings_magic}」ができちゃう✨\n\n👇 診断はこちら\n`;
  };
  const shareUrl = typeof window !== 'undefined' ? window.location.href : "";

  const handleShareLine = () => window.open(`https://line.me/R/msg/text/?${encodeURIComponent(generateShareText() + shareUrl)}`, '_blank');
  const handleShareX = () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(generateShareText())}&url=${encodeURIComponent(shareUrl)}&hashtags=初期費用チェック,賃貸ライフハック`, '_blank');
  const handleCopyLink = () => {
    navigator.clipboard.writeText(generateShareText() + shareUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };
  
  const handleDownloadImage = async () => {
    if (!resultRef.current) return;
    try {
      const canvas = await html2canvas(resultRef.current, { backgroundColor: "#0B1120", scale: 2 } as any);
      const link = document.createElement("a");
      link.download = `初期費用診断_${result?.property_name || "結果"}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) { alert("保存に失敗しました"); }
  };

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-200 font-sans selection:bg-blue-500/30 overflow-x-hidden relative pb-40">
      <TechBackground />

      <div className="relative z-10 max-w-3xl mx-auto p-4 md:p-8">
        
        {/* Header */}
        <header className="text-center mb-10 pt-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-4 rounded-full bg-slate-800/80 border border-slate-700 backdrop-blur-md text-xs font-semibold text-blue-400 tracking-wider uppercase shadow-lg">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            AI Rent Checker
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white mb-4 tracking-tight leading-tight drop-shadow-2xl">
            賃貸・初期費用<br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">「払いすぎ」</span>診断
          </h1>
          <p className="text-slate-400 text-sm md:text-base max-w-lg mx-auto leading-relaxed">
            AIが宅建業法と相場に基づき徹底チェック。<br/>
            契約前に「適正価格」を知ることで、損を回避しましょう。
          </p>
        </header>

        {/* Upload Area */}
        <div className="grid md:grid-cols-2 gap-5 mb-10">
          <label className="group cursor-pointer relative">
            <div className="relative h-48 bg-[#131B2E]/60 backdrop-blur-md border-2 border-slate-700/50 group-hover:border-blue-500/50 rounded-2xl p-6 flex flex-col items-center justify-center transition-all duration-300 shadow-xl overflow-hidden hover:bg-[#131B2E]/80">
              <input type="file" accept="image/*" onChange={handleEstimateChange} className="hidden" />
              {estimatePreview ? (
                <img src={estimatePreview} className="w-full h-full object-contain rounded opacity-90" />
              ) : (
                <>
                  <div className="w-14 h-14 bg-gradient-to-br from-blue-600/20 to-indigo-600/20 rounded-xl flex items-center justify-center mb-3 text-3xl group-hover:scale-110 transition-transform">📄</div>
                  <span className="font-bold text-slate-200">見積書を選択</span>
                  <span className="text-[10px] text-blue-300 mt-2 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20">必須</span>
                </>
              )}
            </div>
          </label>
          <label className="group cursor-pointer relative">
            <div className="relative h-48 bg-[#131B2E]/60 backdrop-blur-md border-2 border-slate-700/50 group-hover:border-emerald-500/50 rounded-2xl p-6 flex flex-col items-center justify-center transition-all duration-300 shadow-xl overflow-hidden hover:bg-[#131B2E]/80">
              <input type="file" accept="image/*" onChange={handlePlanChange} className="hidden" />
              {planPreview ? (
                <img src={planPreview} className="w-full h-full object-contain rounded opacity-90" />
              ) : (
                <>
                  <div className="w-14 h-14 bg-gradient-to-br from-emerald-600/20 to-teal-600/20 rounded-xl flex items-center justify-center mb-3 text-3xl group-hover:scale-110 transition-transform">🗺️</div>
                  <span className="font-bold text-slate-200">図面を選択</span>
                  <span className="text-[10px] text-emerald-300 mt-2 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">任意</span>
                </>
              )}
            </div>
          </label>
        </div>

        {/* Action Button & Loader */}
        <div className="mb-12 text-center">
          {!isLoading ? (
            <button
              onClick={handleAnalyze}
              disabled={!estimateFile}
              className={`
                relative w-full md:w-auto px-12 py-5 rounded-full font-bold text-lg tracking-wide transition-all transform hover:scale-[1.02] active:scale-95 shadow-xl
                ${!estimateFile
                  ? "bg-slate-800 text-slate-600 cursor-not-allowed" 
                  : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-blue-500/30"
                }
              `}
            >
              {!estimateFile ? "画像を選んでください" : "診断スタート 🔍"}
            </button>
          ) : (
            <div className="bg-[#131B2E]/90 backdrop-blur rounded-2xl p-6 border border-blue-500/30 shadow-2xl max-w-md mx-auto relative overflow-hidden">
              <div className="flex justify-between items-end mb-2">
                <span className="text-xs font-bold text-blue-400 animate-pulse">AI ANALYZING</span>
                <span className="text-xl font-mono font-bold text-white">{Math.floor(loadingProgress)}%</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mb-3 relative">
                <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500 transition-all duration-200 ease-out" style={{ width: `${loadingProgress}%` }}></div>
              </div>
              <p className="text-slate-300 text-sm font-medium animate-fade-in-up">{loadingStep}</p>
            </div>
          )}
        </div>
        
        {/* エラー表示 */}
        {errorMessage && (
          <div className="max-w-md mx-auto mb-10 p-4 bg-red-500/10 border border-red-500/50 rounded-xl text-center">
            <p className="text-red-300 text-sm font-bold">⚠️ {errorMessage}</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="animate-fade-in-up space-y-6">
            
            <div ref={resultRef} className="bg-slate-900 text-slate-200 p-6 md:p-8 rounded-3xl border border-slate-700 shadow-2xl relative overflow-hidden">
              {/* 透かし */}
              <div className="absolute top-0 right-0 p-8 opacity-5 font-black text-9xl text-white select-none pointer-events-none">RESULT</div>

              {/* Property Info */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-700/50 pb-6 mb-6 gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                    {result.property_name}
                    <span className="text-lg font-normal text-slate-400 bg-slate-800 px-3 py-0.5 rounded-lg">
                      {result.room_number}
                    </span>
                  </h2>
                </div>
                {/* Risk Score */}
                <div className="bg-slate-800 px-5 py-2 rounded-xl border border-slate-700 text-center">
                  <p className="text-[10px] text-slate-400 mb-1">払いすぎ危険度</p>
                  <div className={`text-2xl font-black ${result.risk_score && result.risk_score > 50 ? 'text-red-500' : 'text-yellow-500'}`}>
                    {result.risk_score} <span className="text-sm font-normal text-slate-500">/100</span>
                  </div>
                </div>
              </div>

              {/* 削減額 */}
              <div className="bg-gradient-to-br from-blue-900/40 to-indigo-900/40 border border-blue-500/30 rounded-2xl p-6 mb-6 text-center relative overflow-hidden">
                <p className="text-blue-300 text-sm font-bold tracking-wider mb-2 relative z-10">見直し後の削減見込み額</p>
                <div className="flex items-center justify-center gap-1 mb-2 relative z-10">
                  <span className="text-5xl md:text-7xl font-bold text-white tracking-tighter drop-shadow-lg">
                    -{formatYen(result.discount_amount)}
                  </span>
                  <span className="text-xl text-blue-300 font-bold self-end mb-3">円</span>
                </div>
                <div className="inline-block bg-slate-900/60 rounded-lg px-4 py-1 text-sm text-slate-400 relative z-10">
                  提示額 ¥{formatYen(result.total_original)} → 適正額 ¥{formatYen(result.total_fair)}
                </div>
              </div>

              {/* AI Review */}
              <div className="mb-6 bg-slate-800/50 rounded-xl p-5 border-l-4 border-blue-500">
                <h3 className="text-blue-400 font-bold text-sm mb-2">🤖 AIエージェントの総評</h3>
                <h4 className="font-bold text-white mb-2">{result.pro_review.title}</h4>
                <p className="text-sm text-slate-300 leading-relaxed">{result.pro_review.content}</p>
              </div>

              {/* Warning List */}
              {result.items.filter(i => i.status !== 'fair').length > 0 && (
                <div className="mb-6">
                  <h3 className="text-red-400 font-bold mb-3">⚠️ 交渉・削除推奨</h3>
                  <div className="space-y-3">
                    {result.items.filter(i => i.status !== 'fair').map((item, index) => (
                      <div key={index} className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-bold text-white">{item.name}</span>
                          <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded font-bold">
                            {item.status === 'cut' ? '削除推奨' : '交渉可'}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm mb-2 bg-black/20 p-2 rounded">
                          <span className="text-slate-400 line-through">¥{formatYen(item.price_original)}</span>
                          <span className="text-white font-bold">→ ¥{formatYen(item.price_fair)}</span>
                        </div>
                        <p className="text-xs text-slate-400">💡 {item.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Fair List */}
              {result.items.filter(i => i.status === 'fair').length > 0 && (
                <div>
                  <h3 className="text-green-400 font-bold mb-3">✅ 適正な項目</h3>
                  <div className="bg-slate-800/50 rounded-xl border border-slate-700 divide-y divide-slate-700/50">
                    {result.items.filter(i => i.status === 'fair').map((item, index) => (
                      <div key={index} className="flex justify-between p-3 text-sm">
                        <span className="text-slate-300">{item.name}</span>
                        <span className="text-green-400 font-mono">¥{formatYen(item.price_fair)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Share & Save */}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={handleDownloadImage} className="col-span-2 bg-slate-800 hover:bg-slate-700 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 border border-slate-600">
                <span>💾</span> 画像で保存
              </button>
              <button onClick={handleShareX} className="bg-black hover:bg-gray-900 text-white py-3 rounded-xl font-bold border border-gray-700 flex items-center justify-center gap-2">
                ポスト
              </button>
              <button onClick={handleShareLine} className="bg-[#06C755] hover:bg-[#05b34c] text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                LINE
              </button>
            </div>
            
            <button onClick={handleCopyLink} className="w-full text-slate-500 text-sm py-2 hover:text-white transition-colors">
              {isCopied ? "リンクをコピーしました！" : "🔗 結果のリンクをコピー"}
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-[#0f172a] border-t border-slate-800 pt-16 pb-16 text-center">
        <div className="max-w-xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-white mb-4">結果はあくまで目安です。</h2>
          <p className="text-slate-400 mb-8 text-sm">
            正確な判断はプロにご相談ください。<br/>
            LINEで無料相談も可能です。
          </p>
          <a href="https://line.me/R/ti/p/@your_id" target="_blank" className="inline-block bg-[#06C755] hover:bg-[#05b34c] text-white font-bold text-xl px-10 py-4 rounded-2xl shadow-lg transition-transform hover:scale-105">
            LINEでプロに相談
          </a>
        </div>
      </footer>
    </div>
  );
}