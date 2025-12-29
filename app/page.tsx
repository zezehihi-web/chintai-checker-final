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

// --- 画像圧縮関数（シンプル版） ---
const compressImage = async (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target?.result as string; };
    reader.onerror = () => reject(new Error("読み込み失敗"));
    img.onload = () => {
      const canvas = document.createElement("canvas");
      // スマホ対策：サイズを小さく制限
      const maxWidth = 800;
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
  </div>
);

export default function Home() {
  const [estimateFile, setEstimateFile] = useState<File | null>(null);
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [estimatePreview, setEstimatePreview] = useState<string | null>(null);
  const [planPreview, setPlanPreview] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
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
    setLoadingStep("準備中...");
    setErrorMessage("");
    setResult(null);

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
      
      setLoadingStep("AIが解析中... (最大30秒かかります)");
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      if (!res.ok) {
         const data = await res.json().catch(() => ({}));
         throw new Error(data.error || `エラー: ${res.status}`);
      }
      const data = await res.json();
      
      setLoadingStep("完了！");
      const risk = Math.min(100, Math.round((data.result.discount_amount / data.result.total_original) * 300));
      setResult({ ...data.result, risk_score: risk });
      setIsLoading(false);

    } catch (error: any) {
      setErrorMessage(error.message || "解析失敗");
      setIsLoading(false);
    }
  };

  const formatYen = (num: number) => new Intl.NumberFormat('ja-JP').format(num);
  const generateShareText = () => result ? `【${result.property_name}】初期費用診断💡\n見直し目安：-${formatYen(result.discount_amount)}円\n\n👇診断はこちら\n` : "";
  const shareUrl = typeof window !== 'undefined' ? window.location.href : "";
  const handleShareX = () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(generateShareText())}&url=${encodeURIComponent(shareUrl)}`, '_blank');

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-200 font-sans pb-40 relative">
      <TechBackground />
      <div className="relative z-10 max-w-3xl mx-auto p-4 md:p-8">
        <header className="text-center mb-10 pt-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-4 rounded-full bg-slate-800/80 border border-slate-700 text-xs font-semibold text-blue-400 uppercase shadow-lg">AI Rent Checker</div>
          <h1 className="text-3xl font-extrabold text-white mb-4">初期費用<span className="text-blue-500">「払いすぎ」</span>診断</h1>
        </header>

        <div className="grid md:grid-cols-2 gap-5 mb-10">
          <label className="bg-[#131B2E]/60 border-2 border-slate-700/50 rounded-2xl p-6 flex flex-col items-center justify-center h-48">
             <input type="file" accept="image/*" onChange={handleEstimateChange} className="hidden" />
             {estimatePreview ? <img src={estimatePreview} className="h-full object-contain" /> : <span>📄 見積書 (必須)</span>}
          </label>
          <label className="bg-[#131B2E]/60 border-2 border-slate-700/50 rounded-2xl p-6 flex flex-col items-center justify-center h-48">
             <input type="file" accept="image/*" onChange={handlePlanChange} className="hidden" />
             {planPreview ? <img src={planPreview} className="h-full object-contain" /> : <span>🗺️ 図面 (任意)</span>}
          </label>
        </div>

        <div className="mb-12 text-center">
          {!isLoading ? (
            <button onClick={handleAnalyze} disabled={!estimateFile} className="w-full md:w-auto px-12 py-4 rounded-full font-bold bg-blue-600 text-white disabled:bg-slate-700">診断スタート 🔍</button>
          ) : (
            <div className="text-blue-400 font-bold animate-pulse">{loadingStep}</div>
          )}
        </div>
        
        {errorMessage && <div className="p-4 bg-red-900/50 text-red-200 rounded-xl text-center mb-10">{errorMessage}</div>}

        {result && (
          <div className="bg-slate-900 p-6 rounded-3xl border border-slate-700">
            <h2 className="text-2xl font-bold text-white mb-4">{result.property_name}</h2>
            <div className="text-4xl font-bold text-white mb-6 text-center">-{formatYen(result.discount_amount)}<span className="text-lg text-blue-300">円</span></div>
            
            {/* 警告リスト */}
            {result.items.filter(i => i.status !== 'fair').map((item, index) => (
               <div key={index} className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-2">
                 <div className="flex justify-between font-bold text-white">
                   <span>{item.name}</span>
                   <span className="text-xs bg-red-600 px-2 py-1 rounded">{item.status === 'cut' ? '削除' : '交渉'}</span>
                 </div>
                 <div className="text-sm text-slate-300">¥{formatYen(item.price_original)} → <span className="text-white font-bold">¥{formatYen(item.price_fair)}</span></div>
               </div>
            ))}
            
            <div className="mt-6 text-center">
              <button onClick={handleShareX} className="bg-black text-white px-6 py-3 rounded-xl font-bold border border-gray-700">結果をポストする</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}