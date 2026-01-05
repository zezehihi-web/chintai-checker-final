"use client";
import { useState, useRef, useCallback, useEffect } from "react";

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
  has_unconfirmed_items?: boolean;
  unconfirmed_item_names?: string[];
  extraction_quality?: 'high' | 'medium' | 'low';
};

type UploadTarget = "estimate" | "plan" | "condition";

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

// --- カスタムカメラコンポーネント ---
const CameraCapture = ({ 
  isOpen, 
  onClose, 
  onCapture, 
  targetType 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onCapture: (file: File) => void;
  targetType: UploadTarget;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getGuideText = () => {
    switch (targetType) {
      case "estimate":
        return "見積書全体を枠内に収めてください";
      case "plan":
        return "募集図面全体を枠内に収めてください";
      case "condition":
        return "条件欄（家賃・敷金・礼金・備考）を拡大して撮影";
    }
  };

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsReady(true);
      }
    } catch (err) {
      console.error("Camera error:", err);
      setError("カメラへのアクセスが許可されていません");
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsReady(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, startCamera, stopCamera]);

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `capture_${Date.now()}.jpg`, { type: "image/jpeg" });
        onCapture(file);
        onClose();
      }
    }, "image/jpeg", 0.9);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black">
      {/* ヘッダー */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/80 to-transparent p-4 pt-safe">
        <div className="flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-white font-bold flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 backdrop-blur-sm"
          >
            <span>✕</span> 閉じる
          </button>
        </div>
      </div>

      {/* カメラビュー */}
      <div className="relative w-full h-full flex items-center justify-center">
        {error ? (
          <div className="text-center p-8">
            <p className="text-white text-lg mb-4">{error}</p>
            <button
              onClick={onClose}
              className="bg-white text-black px-6 py-3 rounded-full font-bold"
            >
              ギャラリーから選択
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            
            {/* ガイド枠オーバーレイ */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {/* 暗い背景 */}
              <div className="absolute inset-0 bg-black/40"></div>
              
              {/* ガイド枠 - 図面は横向き、その他は縦向き */}
              <div className={`relative border-4 border-white rounded-xl shadow-2xl bg-transparent z-10 ${
                targetType === "plan" 
                  ? "w-[90%] max-w-lg aspect-[4/3]" 
                  : "w-[85%] max-w-md aspect-[3/4]"
              }`}>
                {/* コーナーマーク */}
                <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-amber-400 rounded-tl-lg"></div>
                <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-amber-400 rounded-tr-lg"></div>
                <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-amber-400 rounded-bl-lg"></div>
                <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-amber-400 rounded-br-lg"></div>
                
                {/* 中央のクロスガイド */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-0.5 bg-white/50"></div>
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-0.5 h-12 bg-white/50"></div>
                </div>
              </div>
              
              {/* ガイドテキスト */}
              <div className="absolute bottom-32 left-0 right-0 text-center z-20">
                <p className="text-white text-lg font-bold drop-shadow-lg px-4 py-2 bg-black/50 rounded-full inline-block">
                  {getGuideText()}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 撮影ボタン */}
      {isReady && !error && (
        <div className="absolute bottom-8 left-0 right-0 flex justify-center z-20 pb-safe">
          <button
            onClick={handleCapture}
            className="w-20 h-20 bg-white rounded-full border-4 border-white shadow-2xl flex items-center justify-center active:scale-95 transition-transform"
          >
            <div className="w-16 h-16 bg-white rounded-full border-2 border-slate-200 flex items-center justify-center">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full"></div>
            </div>
          </button>
        </div>
      )}

      {/* 撮影の注意 */}
      <div className="absolute top-20 left-0 right-0 z-20 px-4">
        <div className="bg-amber-500/90 backdrop-blur-sm rounded-xl p-3 text-center">
          <p className="text-white text-sm font-bold">📸 撮影のコツ</p>
          <p className="text-white/90 text-xs mt-1">
            ・書類を平らな場所に置いて正面から撮影<br/>
            ・照明の反射を避けて全体が読める状態で
          </p>
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

// --- 危険度ゲージコンポーネント ---
const RiskGauge = ({ score }: { score: number }) => {
  const goldColors = {
    light: "#fbbf24",
    mid: "#f59e0b",
    dark: "#d97706",
    darker: "#b45309"
  };
  
  let textColor = "text-amber-700";
  let coinColor = goldColors;
  
  if (score > 40) {
    coinColor = {
      light: "#fb923c",
      mid: "#f97316",
      dark: "#ea580c",
      darker: "#c2410c"
    };
    textColor = "text-orange-700";
  }
  if (score > 70) {
    coinColor = {
      light: "#f87171",
      mid: "#ef4444",
      dark: "#dc2626",
      darker: "#b91c1c"
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
      
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-100/30 via-yellow-100/20 to-amber-100/30 rounded-full blur-xl -z-10" style={{ height: '150%', top: '-25%' }}></div>
        
        <div className="relative h-6 bg-gradient-to-br from-slate-200 to-slate-300 rounded-full overflow-hidden shadow-inner border border-slate-300/50">
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(0,0,0,0.1) 1px, transparent 1px)',
            backgroundSize: '12px 12px'
          }}></div>
          
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
            <div className="absolute inset-0 bg-gradient-to-b from-white/50 via-transparent to-black/20"></div>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
            <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/60 via-white/20 to-transparent"></div>
            <div className="absolute top-1/2 left-0 right-0 h-1/2 bg-gradient-to-b from-transparent via-black/10 to-black/20"></div>
            <div className="absolute top-0 left-0 bottom-0 w-1 bg-gradient-to-r from-white/40 to-transparent"></div>
            <div className="absolute top-0 right-0 bottom-0 w-1 bg-gradient-to-l from-white/40 to-transparent"></div>
          </div>
          
          {score > 20 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-xs font-black text-white drop-shadow-lg" style={{
                textShadow: '0 1px 3px rgba(0,0,0,0.5), 0 0 4px rgba(0,0,0,0.3)'
              }}>{score}%</span>
            </div>
          )}
        </div>
        
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
  const [conditionFile, setConditionFile] = useState<File | null>(null);
  const [estimatePreview, setEstimatePreview] = useState<string | null>(null);
  const [planPreview, setPlanPreview] = useState<string | null>(null);
  const [conditionPreview, setConditionPreview] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStep, setLoadingStep] = useState("");
  const [loadingElapsed, setLoadingElapsed] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const progressRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const elapsedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const loadingStartRef = useRef<number>(0);
  const resultRef = useRef<HTMLDivElement>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  
  // カメラ関連
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<UploadTarget>("estimate");
  
  // ファイル入力参照
  const estimateInputRef = useRef<HTMLInputElement>(null);
  const planInputRef = useRef<HTMLInputElement>(null);
  const conditionInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (file: File, target: UploadTarget) => {
    if (!file.type.startsWith('image/')) {
      setErrorMessage("画像ファイルを選択してください");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage("画像サイズが大きすぎます（10MB以下にしてください）");
      return;
    }
    
    const preview = URL.createObjectURL(file);
    
    switch (target) {
      case "estimate":
        if (estimatePreview) URL.revokeObjectURL(estimatePreview);
        setEstimateFile(file);
        setEstimatePreview(preview);
        break;
      case "plan":
        if (planPreview) URL.revokeObjectURL(planPreview);
        setPlanFile(file);
        setPlanPreview(preview);
        break;
      case "condition":
        if (conditionPreview) URL.revokeObjectURL(conditionPreview);
        setConditionFile(file);
        setConditionPreview(preview);
        break;
    }
    setErrorMessage("");
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, target: UploadTarget) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileChange(file, target);
    }
  };

  const openCamera = (target: UploadTarget) => {
    setCameraTarget(target);
    setIsCameraOpen(true);
  };

  const handleCameraCapture = (file: File) => {
    handleFileChange(file, cameraTarget);
  };

  const handleAnalyze = async () => {
    if (!estimateFile) return;
    setIsLoading(true);
    setLoadingProgress(0);
    progressRef.current = 0;
    setErrorMessage("");
    setResult(null);

    // 経過時間の計測開始
    loadingStartRef.current = Date.now();
    setLoadingElapsed(0);
    
    const updateElapsed = () => {
      const elapsed = Math.floor((Date.now() - loadingStartRef.current) / 1000);
      setLoadingElapsed(elapsed);
      elapsedTimerRef.current = setTimeout(updateElapsed, 1000);
    };
    updateElapsed();

    // ローディングメッセージ（しっかり考えている感を演出）
    const loadingMessages = [
      "見積書の文字データを読み取っています...",
      "各項目の金額を認識しています...",
      "図面の条件欄と照らし合わせています...",
      "敷金・礼金の記載を確認しています...",
      "仲介手数料の妥当性を分析しています...",
      "保証会社の費用を業界相場と比較しています...",
      "付帯オプションの必要性を精査しています...",
      "24時間サポートの記載を図面と照合しています...",
      "消毒・抗菌費用の妥当性を検証しています...",
      "火災保険料を市場相場データベースと照合中...",
      "鍵交換費用の適正価格を算出しています...",
      "過去の診断データと比較分析しています...",
      "削減可能な項目を特定しています...",
      "交渉時のポイントを整理しています...",
      "リスク評価スコアを計算しています...",
      "最終的な診断結果をまとめています...",
      "レポートを生成しています...",
      "もうすぐ完了します..."
    ];
    
    let messageIndex = 0;
    
    // メッセージを5秒ごとに切り替える
    const messageTimerRef = { current: null as NodeJS.Timeout | null };
    const updateMessage = () => {
      if (messageIndex < loadingMessages.length) {
        setLoadingStep(loadingMessages[messageIndex]);
        messageIndex++;
      }
      messageTimerRef.current = setTimeout(updateMessage, 5000); // 5秒ごと
    };
    setLoadingStep(loadingMessages[0]);
    messageIndex = 1;
    messageTimerRef.current = setTimeout(updateMessage, 5000);

    // プログレスバーのアニメーション（90秒想定でゆっくり進む）
    const runAnimation = () => {
      const current = progressRef.current;
      const elapsed = (Date.now() - loadingStartRef.current) / 1000;
      
      // 90秒で95%に到達するペースで進行
      const targetProgress = Math.min(95, (elapsed / 90) * 95);
      
      // 現在の進捗と目標の差分を徐々に埋める
      const diff = targetProgress - current;
      const increment = Math.max(0.05, diff * 0.1);
      
      if (current + increment < 99) { 
        progressRef.current = Math.min(99, current + increment); 
      }
      setLoadingProgress(progressRef.current);
      timerRef.current = setTimeout(runAnimation, 200);
    };
    runAnimation();
    
    // クリーンアップ用に参照を保存
    const cleanupMessageTimer = () => {
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    };

    try {
      const formData = new FormData();
      setLoadingStep("画像を最適化中...");
      try {
        const compressedEstimate = await compressImage(estimateFile);
        formData.append("estimate", compressedEstimate);
      } catch {
        formData.append("estimate", estimateFile);
      }
      if (planFile) {
        try {
          const compressedPlan = await compressImage(planFile);
          formData.append("plan", compressedPlan);
        } catch {
          formData.append("plan", planFile);
        }
      }
      if (conditionFile) {
        try {
          const compressedCondition = await compressImage(conditionFile);
          formData.append("condition", compressedCondition);
        } catch {
          formData.append("condition", conditionFile);
        }
      }

      setLoadingStep("AI解析中...");
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      if (!res.ok) {
         let errorData: Record<string, string> = {};
         try {
           errorData = await res.json();
         } catch {
           errorData = { error: `サーバーエラー（ステータス: ${res.status}）` };
         }
         
         if (res.status === 429) {
           const rateLimitMessage = errorData.details || errorData.error || "APIレート制限に達しました。しばらく時間をおいてから再度お試しください。";
           throw new Error(rateLimitMessage);
         }
         
         const errorMsg = errorData.error || errorData.details || "システムエラーが発生しました";
         throw new Error(errorMsg);
      }
      const data = await res.json();
      if (!data.result) {
        throw new Error("解析結果の形式が正しくありません");
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      if (elapsedTimerRef.current) clearTimeout(elapsedTimerRef.current);
      
      setLoadingProgress(100);
      setLoadingStep("✨ 診断完了！");
      setTimeout(() => {
        setResult(data.result);
        setShareId(null);
        setIsLoading(false);
        setCurrentView("result");
        window.scrollTo({ top: 0, behavior: 'instant' });
      }, 600);
    } catch (error: unknown) {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (elapsedTimerRef.current) clearTimeout(elapsedTimerRef.current);
      const errorMsg = error instanceof Error ? error.message : "解析に失敗しました。";
      setErrorMessage(errorMsg);
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setEstimateFile(null);
    setPlanFile(null);
    setConditionFile(null);
    setEstimatePreview(null);
    setPlanPreview(null);
    setConditionPreview(null);
    setResult(null);
    setCurrentView("top");
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const formatYen = (num: number) => new Intl.NumberFormat('ja-JP').format(num);

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
      const canvas = await html2canvas(resultRef.current, { backgroundColor: "#ffffff", scale: 2 } as Parameters<typeof html2canvas>[1]);
      const link = document.createElement("a");
      link.download = `診断結果.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch { alert("保存に失敗しました"); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 font-sans pb-20 relative overflow-hidden">
      {/* 背景装飾 */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl"></div>
        {/* グリッドパターン */}
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '50px 50px'
        }}></div>
      </div>
      
      <header className="bg-slate-900/80 backdrop-blur-xl border-b border-slate-700/50 sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-6 py-4 flex justify-center items-center">
          <button
            onClick={() => {
              setCurrentView("top");
              handleReset();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="text-lg md:text-xl font-black text-white tracking-tight hover:text-blue-400 transition-colors cursor-pointer"
          >
            賃貸初期費用<span className="text-blue-400">診断</span>
          </button>
        </div>
      </header>

      {/* カメラUI */}
      <CameraCapture
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCameraCapture}
        targetType={cameraTarget}
      />

      {/* ================= TOP VIEW ================= */}
      {currentView === "top" && (
        <div className="max-w-3xl mx-auto p-6 md:p-10 animate-fade-in">
          <div className="text-center mb-10 mt-4">
            <h2 className="text-2xl md:text-4xl font-extrabold text-white mb-4 leading-tight">
              その見積もり、<br/>
              <span className="bg-gradient-to-r from-blue-400 to-cyan-400 text-transparent bg-clip-text">本当に適正価格</span>ですか？
            </h2>
            <p className="text-slate-400 text-sm">
              AIが図面と見積もりを照合し、<br/>交渉可能な項目を洗い出します。
            </p>
          </div>

          {/* 撮影のコツ */}
          <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-2xl p-4 mb-8 animate-fade-in-up">
            <div className="flex items-start gap-3">
              <span className="text-2xl">📸</span>
              <div>
                <p className="text-amber-300 font-bold text-sm mb-2">撮影のコツ</p>
                <ul className="text-amber-200/80 text-xs space-y-1">
                  <li>・書類を<span className="font-bold text-amber-200">平らな場所に置いて正面</span>から撮影</li>
                  <li>・<span className="font-bold text-amber-200">照明の反射を避けて</span>全体が読める状態で</li>
                  <li>・文字がぼやけないよう<span className="font-bold text-amber-200">ピントを合わせて</span>撮影</li>
                </ul>
              </div>
            </div>
          </div>

          {/* 2カラムレイアウト: 左=見積書, 右=図面＆条件欄 */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            {/* 左カラム: 見積書 */}
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">必須</span>
                <h3 className="text-base font-bold text-white">見積書</h3>
              </div>
              
              <div className="bg-slate-800/50 border-2 border-dashed border-slate-600 rounded-2xl p-4 relative overflow-hidden hover:border-blue-500/50 transition-all group flex-1 min-h-[280px] flex flex-col justify-center">
                {estimatePreview ? (
                  <div className="relative flex-1 flex items-center justify-center">
                    <img src={estimatePreview} className="w-full h-full max-h-[250px] object-contain rounded-lg" alt="見積書プレビュー" />
                    <button
                      onClick={() => {
                        if (estimatePreview) URL.revokeObjectURL(estimatePreview);
                        setEstimateFile(null);
                        setEstimatePreview(null);
                      }}
                      className="absolute top-2 right-2 bg-red-500 text-white w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-600 text-sm"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <div className="mb-3 flex justify-center">
                      <img 
                        src="/estimate-icon.png" 
                        alt="見積書" 
                        className="w-16 h-16 object-contain drop-shadow-md"
                      />
                    </div>
                    <p className="text-slate-400 text-sm mb-4">見積書の画像</p>
                    <div className="flex gap-2 justify-center flex-wrap">
                      <button
                        onClick={() => openCamera("estimate")}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all text-sm"
                      >
                        <span>📷</span> 撮影
                      </button>
                      <button
                        onClick={() => estimateInputRef.current?.click()}
                        className="bg-slate-700 hover:bg-slate-600 text-white font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all text-sm"
                      >
                        <span>🖼️</span> 選択
                      </button>
                    </div>
                    <input
                      ref={estimateInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleInputChange(e, "estimate")}
                      className="hidden"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 右カラム: 募集図面＆条件欄（縦並び） */}
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <span className="bg-emerald-500/80 text-white text-xs font-bold px-2 py-1 rounded-full">推奨</span>
                <h3 className="text-base font-bold text-white">募集図面</h3>
                <span className="text-slate-500 text-xs">精度UP</span>
              </div>
              
              <div className="flex flex-col gap-3 flex-1">
                {/* 募集図面（全体） */}
                <div className="bg-slate-800/50 border-2 border-dashed border-slate-600 rounded-xl p-3 relative overflow-hidden hover:border-emerald-500/50 transition-all flex-1 min-h-[130px] flex flex-col justify-center">
                  {planPreview ? (
                    <div className="relative flex-1 flex items-center justify-center">
                      <img src={planPreview} className="w-full h-full max-h-[110px] object-contain rounded-lg" alt="募集図面プレビュー" />
                      <button
                        onClick={() => {
                          if (planPreview) URL.revokeObjectURL(planPreview);
                          setPlanFile(null);
                          setPlanPreview(null);
                        }}
                        className="absolute -top-1 -right-1 bg-red-500 text-white w-5 h-5 rounded-full flex items-center justify-center hover:bg-red-600 text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between px-2">
                      <div className="flex items-center gap-2">
                        <img 
                          src="/plan-icon.png" 
                          alt="図面" 
                          className="w-10 h-10 object-contain drop-shadow-md"
                        />
                        <div>
                          <p className="text-slate-300 text-xs font-bold">図面全体</p>
                          <p className="text-slate-500 text-[10px]">物件情報が記載された図面</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openCamera("plan")}
                          className="bg-emerald-600/80 hover:bg-emerald-600 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 text-xs transition-all"
                        >
                          📷
                        </button>
                        <button
                          onClick={() => planInputRef.current?.click()}
                          className="bg-slate-700/80 hover:bg-slate-600 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 text-xs transition-all"
                        >
                          🖼️
                        </button>
                      </div>
                      <input
                        ref={planInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleInputChange(e, "plan")}
                        className="hidden"
                      />
                    </div>
                  )}
                </div>

                {/* 条件欄アップ */}
                <div className="bg-slate-800/50 border-2 border-dashed border-slate-600 rounded-xl p-3 relative overflow-hidden hover:border-emerald-500/50 transition-all flex-1 min-h-[130px] flex flex-col justify-center">
                  {conditionPreview ? (
                    <div className="relative flex-1 flex items-center justify-center">
                      <img src={conditionPreview} className="w-full h-full max-h-[110px] object-contain rounded-lg" alt="条件欄プレビュー" />
                      <button
                        onClick={() => {
                          if (conditionPreview) URL.revokeObjectURL(conditionPreview);
                          setConditionFile(null);
                          setConditionPreview(null);
                        }}
                        className="absolute -top-1 -right-1 bg-red-500 text-white w-5 h-5 rounded-full flex items-center justify-center hover:bg-red-600 text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between px-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">🔍</span>
                        <div>
                          <p className="text-slate-300 text-xs font-bold">条件欄を拡大撮影</p>
                          <p className="text-slate-500 text-[10px]">家賃・敷金・礼金・備考欄を拡大</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openCamera("condition")}
                          className="bg-emerald-600/80 hover:bg-emerald-600 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 text-xs transition-all"
                        >
                          📷
                        </button>
                        <button
                          onClick={() => conditionInputRef.current?.click()}
                          className="bg-slate-700/80 hover:bg-slate-600 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 text-xs transition-all"
                        >
                          🖼️
                        </button>
                      </div>
                      <input
                        ref={conditionInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleInputChange(e, "condition")}
                        className="hidden"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 精度アップの説明 */}
          <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 rounded-xl p-3 mb-8">
            <p className="text-emerald-300 text-xs text-center">
              💡 募集図面を追加すると、記載条件と見積書を照合してより正確に診断できます
            </p>
          </div>

          <div className="text-center">
            {!isLoading ? (
              <button
                onClick={handleAnalyze}
                disabled={!estimateFile}
                className={`w-full md:w-auto px-16 py-4 rounded-xl font-bold text-lg shadow-xl transition-all ${
                  !estimateFile 
                    ? "bg-slate-700 text-slate-500 cursor-not-allowed shadow-none" 
                    : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/30"
                }`}
              >
                {!estimateFile ? "見積書をアップロードしてください" : "適正価格を診断する"}
              </button>
            ) : (
              <div className="bg-slate-800/80 backdrop-blur-sm rounded-2xl p-6 border border-slate-700 shadow-xl max-w-md mx-auto">
                {/* 上部: 進捗率と経過時間 */}
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    <span className="text-sm font-bold text-white">AI診断中</span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black text-blue-400">{Math.floor(loadingProgress)}</span>
                    <span className="text-sm text-slate-400">%</span>
                  </div>
                </div>
                
                {/* プログレスバー */}
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden mb-4">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-500 transition-all duration-300 relative"
                    style={{ width: `${loadingProgress}%` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
                  </div>
                </div>
                
                {/* 現在のステップ */}
                <div className="bg-slate-900/50 rounded-lg p-3 mb-3">
                  <p className="text-sm text-white font-medium text-center">{loadingStep}</p>
                </div>
                
                {/* 経過時間と残り時間目安 */}
                <div className="flex justify-between text-xs text-slate-500">
                  <span>経過: {loadingElapsed}秒</span>
                  <span>
                    {(() => {
                      // 経過時間から残り時間を推定（90秒想定）
                      const estimatedTotal = 90;
                      const remaining = Math.max(0, estimatedTotal - loadingElapsed);
                      if (remaining > 60) return `残り約${Math.ceil(remaining / 10) * 10}秒`;
                      if (remaining > 30) return `残り約${Math.ceil(remaining / 10) * 10}〜${Math.ceil(remaining / 10) * 10 + 10}秒`;
                      if (remaining > 10) return `残り約${remaining}秒`;
                      if (remaining > 0) return "まもなく完了";
                      return "処理中...";
                    })()}
                  </span>
                </div>
              </div>
            )}
          </div>
          {errorMessage && <div className="mt-6 bg-red-500/20 text-red-400 px-4 py-3 rounded-lg text-center text-sm font-bold border border-red-500/30">{errorMessage}</div>}
        </div>
      )}

      {/* ================= RESULT VIEW ================= */}
      {currentView === "result" && result && (
        <div className="max-w-3xl mx-auto p-6 md:p-10 animate-fade-in-up">
          
          <div ref={resultRef} className="bg-white p-8 rounded-3xl border border-slate-200 shadow-2xl relative overflow-hidden mb-8 animate-scale-in text-slate-600">
            <div className="border-b border-slate-100 pb-8 mb-8 animate-fade-in-up">
              <div className="text-center mb-3">
                <p className="text-xs text-slate-400 font-bold tracking-wider uppercase mb-2">物件名</p>
              </div>
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
              <div className="max-w-md mx-auto">
                <RiskGauge score={result.risk_score} />
              </div>
            </div>

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

          <div className="grid grid-cols-2 gap-4 mb-8">
            <button onClick={handleDownloadImage} className="col-span-2 py-3 rounded-xl font-bold bg-slate-700 text-white text-sm hover:bg-slate-600 flex items-center justify-center gap-2 shadow-md">
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
              className="col-span-2 bg-slate-700 text-slate-200 font-bold text-sm py-3 rounded-xl hover:bg-slate-600 border border-slate-600 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreatingShare ? "⏳ 準備中..." : isCopied ? "✨ コピーしました！" : "🔗 共有用リンクをコピー"}
            </button>
            {shareId && (
              <div className="col-span-2 bg-blue-500/20 border border-blue-500/30 rounded-xl p-3 text-xs text-blue-300">
                <p className="font-bold mb-1">共有リンクが作成されました</p>
                <p className="text-blue-400 break-all">{typeof window !== 'undefined' ? `${window.location.origin}/share/${shareId}` : ""}</p>
              </div>
            )}
          </div>

          <div className="bg-slate-800/80 backdrop-blur-sm rounded-xl p-5 border-l-4 border-blue-500 text-slate-300 text-sm leading-relaxed mb-8 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
            <h3 className="font-bold text-blue-400 mb-3 flex items-center gap-2">🤖 AIエージェントの総評</h3>
            {(() => {
              let content = result.pro_review.content.trim();
              content = content.replace(/この物件の初期費用について[^\n]*\n?/g, '');
              content = content.replace(/以下の点を必ず含めて詳細に分析してください[^\n]*\n?/g, '');
              content = content.replace(/総評は[^\n]*\n?/g, '');
              content = content.replace(/説明文や指示文は一切含めないでください[^\n]*\n?/g, '');
              
              const seenLines = new Set<string>();
              const lines = content.split('\n').filter(line => {
                const trimmed = line.trim();
                if (!trimmed) return false;
                if (trimmed.match(/^【出力JSON形式】|^Markdown|^savings_magic/)) return false;
                if (trimmed.match(/この物件の初期費用について/)) return false;
                if (trimmed.match(/以下の点を必ず含めて/)) return false;
                if (trimmed.match(/総評は[^\n]*フォーマット/)) return false;
                const normalized = trimmed.toLowerCase().replace(/\s+/g, ' ');
                if (seenLines.has(normalized)) return false;
                seenLines.add(normalized);
                return true;
              });
              
              if (lines.length === 0) {
                return <p className="text-slate-400">総評を読み込み中...</p>;
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
              
              const noticeText = "※今回の診断結果はあくまで『書面上で分かる範囲』の減額です。";
              const negotiationText = "交渉が面倒、怖いと感じる方もご安心ください。私たちが全ての交渉を代行し、最安値で契約できるようサポートします。まずはLINEでご相談ください。";
              
              const filteredRestLines = restLines.filter(line => {
                const trimmed = line.trim();
                return trimmed !== noticeText && !trimmed.includes(noticeText) && 
                       trimmed !== negotiationText && !trimmed.includes(negotiationText);
              });
              
              return (
                <>
                  {summary && (
                    <p className="font-black text-blue-300 text-base mb-3">{summary}</p>
                  )}
                  {filteredRestLines.map((line, i) => {
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
                  <p className="text-red-400 font-bold text-sm mt-4 mb-2">{noticeText}</p>
                  <p className="text-slate-400 text-sm">{negotiationText}</p>
                </>
              );
            })()}
          </div>

          <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-700 rounded-3xl p-6 shadow-xl mb-8 relative overflow-hidden animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
             <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/2"></div>
             <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="text-left flex-1">
                  <h3 className="text-lg font-bold text-white mb-2">
                    AIの診断結果を<br/><span className="text-green-400">プロが無料で精査</span>します
                  </h3>
                  <p className="text-[10px] text-slate-500">
                    リンクをコピーして送るだけで、最安値プランをご提案。
                  </p>
                </div>
                <a 
                  href={process.env.NEXT_PUBLIC_LINE_URL || "https://line.me/R/ti/p/@your_id"} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="flex-shrink-0 bg-gradient-to-r from-[#06C755] to-[#05b34c] hover:from-[#05b34c] hover:to-[#04a042] text-white font-black py-5 px-10 rounded-2xl shadow-2xl shadow-green-500/30 transition-all hover:scale-105 hover:shadow-green-500/50 flex items-center gap-3 text-lg relative overflow-hidden group"
                  style={{
                    boxShadow: '0 10px 30px rgba(6, 199, 85, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                  <div className="relative z-10 w-8 h-8 flex items-center justify-center">
                    <div className="absolute inset-0 bg-white/20 rounded-full blur-sm"></div>
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 relative z-10 drop-shadow-lg" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>
                      <path d="M12 2C6.48 2 2 5.56 2 10.1c0 2.45 1.3 4.63 3.4 6.1-.15.8-.5 2.15-.56 2.47-.05.24.1.47.34.47.1 0 .2-.03.27-.08.05-.03 2.6-1.73 3.63-2.45.62.17 1.28.26 1.95.26 5.52 0 10-3.56 10-8.1S17.52 2 12 2z"/>
                    </svg>
                  </div>
                  <span className="relative z-10 tracking-wide">詳細を今すぐ確認</span>
                </a>
             </div>
             <div className="relative z-10 mt-6 pt-6 border-t border-slate-700">
                <div className="flex flex-wrap gap-4 text-sm justify-center md:justify-start">
                  <div className="flex items-center gap-2 text-slate-300 group">
                    <div className="relative w-8 h-8 flex items-center justify-center bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-lg shadow-md group-hover:shadow-lg transition-all">
                      <span className="text-lg" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}>📅</span>
                    </div>
                    <span className="font-black tracking-tight" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>365日対応</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-300 group">
                    <div className="relative w-8 h-8 flex items-center justify-center bg-gradient-to-br from-amber-500/20 to-amber-600/20 rounded-lg shadow-md group-hover:shadow-lg transition-all">
                      <span className="text-lg" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}>🏆</span>
                    </div>
                    <span className="font-black tracking-tight" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>実績800件以上</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-300 group">
                    <div className="relative w-8 h-8 flex items-center justify-center bg-gradient-to-br from-green-500/20 to-green-600/20 rounded-lg shadow-md group-hover:shadow-lg transition-all">
                      <span className="text-lg" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}>📱</span>
                    </div>
                    <span className="font-black tracking-tight" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>来店不要</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-300 group">
                    <div className="relative w-8 h-8 flex items-center justify-center bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 rounded-lg shadow-md group-hover:shadow-lg transition-all">
                      <span className="text-lg" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}>💰</span>
                    </div>
                    <span className="font-black tracking-tight" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>仲介手数料最大無料</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-300 group">
                    <div className="relative w-8 h-8 flex items-center justify-center bg-gradient-to-br from-purple-500/20 to-purple-600/20 rounded-lg shadow-md group-hover:shadow-lg transition-all">
                      <span className="text-lg" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}>✅</span>
                    </div>
                    <span className="font-black tracking-tight" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>不要オプション一切無し</span>
                  </div>
                </div>
             </div>
          </div>

          <button onClick={handleReset} className="block w-full text-center text-slate-500 text-sm hover:text-blue-400 font-bold py-4 transition-colors">
            🔄 別の物件を診断する
          </button>

        </div>
      )}

      <footer className="text-center text-slate-600 text-xs py-10">
        © 2024 Smart Rent Check System
      </footer>
    </div>
  );
}
