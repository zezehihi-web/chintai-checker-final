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

const compressImage = async (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target?.result as string; };
    reader.onerror = () => reject(new Error("読み込み失敗"));
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const maxWidth = 1024;
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
      }, "image/jpeg", 0.6);
    };
    reader.readAsDataURL(file);
  });
};

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
      if (current < 20) { increment = 1.0; delay = 80; setLoadingStep("スキャン中..."); }
      else if (current < 40) { increment = 0.5; delay = 100; setLoadingStep("情報抽出中..."); }
      else if (current < 60) { increment = 0.4; delay = 120; setLoadingStep("データベース照合中..."); }
      else if (current < 80) { increment = 0.3; delay = 150; setLoadingStep("不要オプション検知中..."); }
      else { increment = 0.05; delay = 200; setLoadingStep("レポート作成中..."); }
      if (current + increment < 99) { progressRef.current += increment; } 
      else { progressRef.current = 99; }
      setLoadingProgress(progressRef.current);
      timerRef.current = setTimeout(runAnimation, delay);
    };
    runAnimation();

    try {
      const formData = new FormData();
      setLoadingStep("画像を軽量化中...");
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
      setLoadingStep("AIが解析中...");
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      if (!res.ok) {
         const data = await res.json().catch(() => ({}));
         throw new Error(data.error || "サーバーエラー");
      }
      const data = await res.json();
      if (timerRef.current) clearTimeout(timerRef.current);
      
      setLoadingProgress(100);
      setLoadingStep("完了！");
      setTimeout(() => {
        const risk = Math.min(100, Math.round((data.result.discount_amount / data.result.total_original) * 300));
        setResult({ ...data.result, risk_score: risk });
        setIsLoading(false);
      }, 600);
    } catch (error: any) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setErrorMessage(error.message || "解析失敗");
      setIsLoading(false);
    }
  };

  const formatYen = (num: number) => new Intl.NumberFormat('ja-JP').format(num);
  const generateShareText = () => result ? `【${result.property_name}】初期費用診断💡\n見直し目安：-${formatYen(result.discount_amount)}円\n\n👇診断はこちら\n` : "";
  const shareUrl = typeof window !== 'undefined' ? window.location.href : "";
  const handleShareLine = () => window.open(`https://line.me/R/msg/text/?${encodeURIComponent(generateShareText() + shareUrl)}`, '_blank');
  const handleShareX = () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(generateShareText())}&url=${encodeURIComponent(shareUrl)}`, '_blank');
  const handleCopyLink = () => { navigator.clipboard.writeText(generateShareText() + shareUrl); setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); };

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-200 font-sans pb-40 relative">
      <TechBackground />
      <div className="relative z-10 max-w-3xl mx-auto p-4 md:p-8">
        <header className="text-center mb-10 pt-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-4 rounded-full bg-slate-800/80 border border-slate-700 backdrop-blur-md text-xs font-semibold text-blue-400 uppercase shadow-lg">AI Rent Checker</div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white mb-4">賃貸・初期費用<br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">「払いすぎ」</span>診断</h1>
        </header>

        <div className="grid md:grid-cols-2 gap-5 mb-10">
          <label className="group cursor-pointer relative">
            <div className="relative h-48 bg-[#131B2E]/60 border-2 border-slate-700/50 rounded-2xl p-6 flex flex-col items-center justify-center hover:bg-[#131B2E]/80">
              <input type="file" accept="image/*" onChange={handleEstimateChange} className="hidden" />
              {estimatePreview ? <img src={estimatePreview} className="w-full h-full object-contain" /> : <span className="font-bold text-slate-200">📄 見積書を選択 (必須)</span>}
            </div>
          </label>
          <label className="group cursor-pointer relative">
            <div className="relative h-48 bg-[#131B2E]/60 border-2 border-slate-700/50 rounded-2xl p-6 flex flex-col items-center justify-center hover:bg-[#131B2E]/80">
              <input type="file" accept="image/*" onChange={handlePlanChange} className="hidden" />
              {planPreview ? <img src={planPreview} className="w-full h-full object-contain" /> : <span className="font-bold text-slate-200">🗺️ 図面を選択 (任意)</span>}
            </div>
          </label>
        </div>

        <div className="mb-12 text-center">
          {!isLoading ? (
            <button onClick={handleAnalyze} disabled={!estimateFile} className={`w-full md:w-auto px-12 py-5 rounded-full font-bold text-lg shadow-xl ${!estimateFile ? "bg-slate-800 text-slate-600" : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white"}`}>{!estimateFile ? "画像を選んでください" : "診断スタート 🔍"}</button>
          ) : (
            <div className="bg-[#131B2E]/90 backdrop-blur rounded-2xl p-6 border border-blue-500/30 max-w-md mx-auto">
              <div className="flex justify-between items-end mb-2"><span className="text-xs font-bold text-blue-400 animate-pulse">ANALYZING</span><span className="text-xl font-bold text-white">{Math.floor(loadingProgress)}%</span></div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mb-3 relative"><div className="absolute top-0 left-0 h-full bg-blue-500 transition-all duration-200" style={{ width: `${loadingProgress}%` }}></div></div>
              <p className="text-slate-300 text-sm">{loadingStep}</p>
            </div>
          )}
        </div>
        
        {errorMessage && <div className="max-w-md mx-auto mb-10 p-4 bg-red-500/10 border border-red-500/50 rounded-xl text-center text-red-300 font-bold">{errorMessage}</div>}

        {result && (
          <div className="space-y-6">
            <div className="bg-slate-900 text-slate-200 p-6 md:p-8 rounded-3xl border border-slate-700 shadow-2xl relative overflow-hidden">
              <h2 className="text-2xl font-bold text-white mb-6">{result.property_name} <span className="text-lg font-normal text-slate-400">({result.room_number})</span></h2>
              
              <div className="bg-gradient-to-br from-blue-900/40 to-indigo-900/40 border border-blue-500/30 rounded-2xl p-6 mb-6 text-center">
                <p className="text-blue-300 text-sm font-bold mb-2">削減見込み額</p>
                <div className="text-5xl font-bold text-white mb-2">-{formatYen(result.discount_amount)}<span className="text-xl text-blue-300">円</span></div>
              </div>

              <div className="mb-6 bg-slate-800/50 rounded-xl p-5 border-l-4 border-blue-500">
                <h3 className="text-blue-400 font-bold text-sm mb-2">🤖 AI総評</h3>
                <p className="text-sm text-slate-300">{result.pro_review.content}</p>
              </div>

              {result.items.filter(i => i.status !== 'fair').length > 0 && (
                <div className="mb-6 space-y-3">
                  <h3 className="text-red-400 font-bold">⚠️ 交渉推奨項目</h3>
                  {result.items.filter(i => i.status !== 'fair').map((item, index) => (
                    <div key={index} className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                      <div className="flex justify-between font-bold text-white mb-1"><span>{item.name}</span><span className="text-xs bg-red-500 px-2 py-0.5 rounded">{item.status === 'cut' ? '削除' : '交渉'}</span></div>
                      <div className="text-sm"><span className="line-through text-slate-500">¥{formatYen(item.price_original)}</span> <span className="font-bold text-white">→ ¥{formatYen(item.price_fair)}</span></div>
                      <p className="text-xs text-slate-400 mt-1">💡 {item.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button onClick={handleShareX} className="bg-black text-white py-3 rounded-xl font-bold border border-gray-700">ポスト</button>
              <button onClick={handleShareLine} className="bg-[#06C755] text-white py-3 rounded-xl font-bold">LINE</button>
            </div>
            <button onClick={handleCopyLink} className="w-full text-slate-500 text-sm py-2 hover:text-white">{isCopied ? "コピーしました！" : "🔗 リンクをコピー"}</button>
          </div>
        )}
      </div>
    </div>
  );
}