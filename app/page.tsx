"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import NextImage from "next/image";

// --- 型定義 ---
type AnalysisResult = {
  property_name: string;
  room_number: string;
  items: {
    name: string;
    price_original: number;
    price_fair: number;
    status: "fair" | "negotiable" | "cut" | "warning" | "requires_confirmation";
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
  warning_amount?: number;
  has_flyer?: boolean;
  pro_review: { content: string; };
  risk_score: number;
  has_unconfirmed_items?: boolean;
  unconfirmed_item_names?: string[];
  extraction_quality?: 'high' | 'medium' | 'low';
  // 裏コマンド用
  is_secret_mode?: boolean;
  secret_type?: string;
  fortune_title?: string;
  fortune_subtitle?: string;
  fortune_person_type?: string;
  fortune_items?: {
    category: string;
    score: number;
    icon: string;
    detail: string;
    lucky_item?: string;
    lucky_direction?: string;
    ideal_property?: string;
  }[];
  fortune_action_advice?: string[];
  fortune_lucky_color?: string;
  fortune_lucky_number?: string;
  fortune_power_spot?: string;
  fortune_summary?: string;
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
    <div className="fixed inset-0 z-50 bg-black">
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
                  ? "w-11/12 max-w-lg aspect-4-3" 
                  : "w-5/6 max-w-md aspect-3-4"
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

// --- 占いスコアゲージコンポーネント ---
const FortuneGauge = ({ score, category }: { score: number; category: string }) => {
  const getGradient = () => {
    if (score >= 90) return "from-yellow-400 via-amber-400 to-yellow-500";
    if (score >= 80) return "from-purple-400 via-pink-400 to-purple-500";
    return "from-blue-400 via-cyan-400 to-blue-500";
  };

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-purple-200/80">{category}</span>
        <span className="text-sm font-black text-white">{score}%</span>
      </div>
      <div className="h-2 bg-purple-900/50 rounded-full overflow-hidden">
        <div 
          className={`h-full w-full bg-gradient-to-r ${getGradient()} rounded-full transition-transform duration-1000 ease-out relative overflow-hidden`}
          style={{ transform: `scaleX(${Math.max(0, Math.min(1, score / 100))})`, transformOrigin: "left" }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer"></div>
        </div>
      </div>
    </div>
  );
};

// --- 占い結果UIコンポーネント ---
const FortuneResult = ({ result }: { result: AnalysisResult }) => {
  const getBackgroundTheme = () => {
    switch (result.secret_type) {
      case "face": return "from-purple-900 via-indigo-900 to-purple-900";
      case "animal": return "from-emerald-900 via-teal-900 to-emerald-900";
      case "food": return "from-orange-900 via-amber-900 to-orange-900";
      default: return "from-blue-900 via-purple-900 to-blue-900";
    }
  };

  const getTypeBadgeStyle = () => {
    switch (result.secret_type) {
      case "face": return "bg-gradient-to-r from-purple-500/30 to-pink-500/30 border-purple-400/50";
      case "animal": return "bg-gradient-to-r from-emerald-500/30 to-teal-500/30 border-emerald-400/50";
      case "food": return "bg-gradient-to-r from-amber-500/30 to-orange-500/30 border-amber-400/50";
      default: return "bg-gradient-to-r from-blue-500/30 to-purple-500/30 border-blue-400/50";
    }
  };

  const getMainIcon = () => {
    switch (result.secret_type) {
      case "face": return "🔮";
      case "animal": return "🐾";
      case "food": return "🍽️";
      default: return "✨";
    }
  };

  return (
    <div className={`bg-gradient-to-br ${getBackgroundTheme()} rounded-3xl p-8 relative overflow-hidden shadow-2xl`}>
      {/* 神秘的な背景エフェクト */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-10 left-10 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-20 right-10 w-40 h-40 bg-pink-500/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/4 w-24 h-24 bg-blue-500/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }}></div>
        {/* 星のパターン */}
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: `radial-gradient(circle at 20% 30%, rgba(255,255,255,0.3) 1px, transparent 1px),
                           radial-gradient(circle at 80% 20%, rgba(255,255,255,0.2) 1px, transparent 1px),
                           radial-gradient(circle at 40% 70%, rgba(255,255,255,0.4) 1px, transparent 1px),
                           radial-gradient(circle at 70% 60%, rgba(255,255,255,0.2) 1px, transparent 1px),
                           radial-gradient(circle at 30% 90%, rgba(255,255,255,0.3) 1px, transparent 1px)`,
          backgroundSize: '100px 100px'
        }}></div>
      </div>

      <div className="relative z-10">
        {/* ヘッダー */}
        <div className="text-center mb-8 animate-fade-in-up">
          <div className="text-6xl mb-4 animate-bounce-slow">{getMainIcon()}</div>
          <h2 className="text-2xl md:text-3xl font-black text-white mb-2 tracking-wide">
            {result.fortune_title || "特別鑑定結果"}
          </h2>
          <p className="text-purple-200/80 text-sm">
            {result.fortune_subtitle || "あなただけの特別な診断"}
          </p>
        </div>

        {/* タイプ表示 */}
        {result.fortune_person_type && (
          <div className="text-center mb-8 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <div className={`inline-block ${getTypeBadgeStyle()} backdrop-blur-sm border rounded-full px-6 py-3`}>
              <p className="text-white font-bold text-lg">
                「{result.fortune_person_type}」
              </p>
            </div>
          </div>
        )}

        {/* 鑑定項目 */}
        {result.fortune_items && (
          <div className="space-y-4 mb-8">
            {result.fortune_items.map((item, index) => (
              <div 
                key={index} 
                className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/20 animate-fade-in-up"
                style={{ animationDelay: `${0.2 + index * 0.1}s` }}
              >
                <div className="flex items-start gap-4">
                  <div className="text-3xl flex-shrink-0">{item.icon}</div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-white font-bold text-lg">{item.category}</h3>
                      <div className="flex items-center gap-1">
                        <span className={`text-2xl font-black ${item.score >= 90 ? 'text-yellow-400' : item.score >= 80 ? 'text-pink-400' : 'text-blue-400'}`}>
                          {item.score}
                        </span>
                        <span className="text-purple-200/60 text-sm">点</span>
                      </div>
                    </div>
                    <FortuneGauge score={item.score} category={item.category} />
                    <p className="text-purple-100/90 text-sm mt-3 leading-relaxed">
                      {item.detail}
                    </p>
                    {item.lucky_item && (
                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-yellow-400 text-xs">🍀 ラッキーアイテム:</span>
                        <span className="text-yellow-200 text-xs font-bold">{item.lucky_item}</span>
                      </div>
                    )}
                    {item.ideal_property && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-emerald-400 text-xs">🏠 理想の物件:</span>
                        <span className="text-emerald-200 text-xs font-bold">{item.ideal_property}</span>
                      </div>
                    )}
                    {item.lucky_direction && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-cyan-400 text-xs">🧭 吉方位:</span>
                        <span className="text-cyan-200 text-xs font-bold">{item.lucky_direction}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ラッキー情報 */}
        <div className="grid grid-cols-3 gap-3 mb-8 animate-fade-in-up" style={{ animationDelay: '0.5s' }}>
          {result.fortune_lucky_color && (
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center border border-white/20">
              <p className="text-2xl mb-1">🎨</p>
              <p className="text-purple-200/60 text-[10px] mb-1">ラッキーカラー</p>
              <p className="text-white font-bold text-sm">{result.fortune_lucky_color}</p>
            </div>
          )}
          {result.fortune_lucky_number && (
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center border border-white/20">
              <p className="text-2xl mb-1">🔢</p>
              <p className="text-purple-200/60 text-[10px] mb-1">ラッキーナンバー</p>
              <p className="text-white font-bold text-sm">{result.fortune_lucky_number}</p>
            </div>
          )}
          {result.fortune_power_spot && (
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center border border-white/20">
              <p className="text-2xl mb-1">⛩️</p>
              <p className="text-purple-200/60 text-[10px] mb-1">パワースポット</p>
              <p className="text-white font-bold text-sm">{result.fortune_power_spot}</p>
            </div>
          )}
        </div>

        {/* 行動指針 */}
        {result.fortune_action_advice && result.fortune_action_advice.length > 0 && (
          <div className="bg-gradient-to-r from-yellow-500/20 to-amber-500/20 backdrop-blur-sm rounded-2xl p-5 border border-yellow-400/30 mb-8 animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
            <h3 className="text-yellow-300 font-bold text-lg mb-4 flex items-center gap-2">
              <span>📜</span> 今日からの行動指針
            </h3>
            <div className="space-y-3">
              {result.fortune_action_advice.map((advice, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-yellow-400/30 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-yellow-300 text-xs font-bold">{index + 1}</span>
                  </div>
                  <p className="text-yellow-100/90 text-sm leading-relaxed">{advice}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 総括 */}
        {result.fortune_summary && (
          <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/20 animate-fade-in-up" style={{ animationDelay: '0.7s' }}>
            <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
              <span>🌟</span> 鑑定師からのメッセージ
            </h3>
            <p className="text-purple-100/90 text-sm leading-relaxed whitespace-pre-wrap">
              {result.fortune_summary}
            </p>
          </div>
        )}

        {/* 注意書き */}
        <div className="mt-8 text-center animate-fade-in-up" style={{ animationDelay: '0.8s' }}>
          <p className="text-purple-300/60 text-xs mb-6">
            ※今回の診断結果はあくまで画像から分かる範囲でのAI占い結果です。<br/>
            エンタメとしてお楽しみください🔮✨
          </p>
        </div>

        {/* 部屋探しへの導線 */}
        <div className="text-center animate-fade-in-up" style={{ animationDelay: '0.9s' }}>
          <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 backdrop-blur-sm rounded-2xl p-6 border border-green-400/30">
            <p className="text-green-300 text-sm mb-4">
              🏠 運命の物件を見つけに行きませんか？
            </p>
            <a
              href={process.env.NEXT_PUBLIC_LINE_URL || "https://lin.ee/Hnl9hkO"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-[#06C755] to-[#05b34c] text-white font-bold py-3 px-8 rounded-full shadow-lg hover:scale-105 transition-all"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M12 2C6.48 2 2 5.56 2 10.1c0 2.45 1.3 4.63 3.4 6.1-.15.8-.5 2.15-.56 2.47-.05.24.1.47.34.47.1 0 .2-.03.27-.08.05-.03 2.6-1.73 3.63-2.45.62.17 1.28.26 1.95.26 5.52 0 10-3.56 10-8.1S17.52 2 12 2z"/>
              </svg>
              LINEで相談する
            </a>
          </div>
        </div>
      </div>
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
  const [isCreatingLineLink, setIsCreatingLineLink] = useState(false);
  
  // カメラ関連
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<UploadTarget>("estimate");
  
  // ファイル入力参照
  const estimateInputRef = useRef<HTMLInputElement>(null);
  const planInputRef = useRef<HTMLInputElement>(null);
  const conditionInputRef = useRef<HTMLInputElement>(null);

  // 図面追加時の自動再診断フラグ
  const shouldAutoReanalyzeRef = useRef(false);

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
        // 既に診断結果があり、図面がなかった場合は自動再診断フラグを立てる
        if (result && result.has_flyer === false && estimateFile) {
          shouldAutoReanalyzeRef.current = true;
        }
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

  // 図面追加時の自動再診断
  useEffect(() => {
    if (shouldAutoReanalyzeRef.current && planFile && estimateFile && !isLoading) {
      shouldAutoReanalyzeRef.current = false;
      // 少し遅延を入れてから再診断を実行
      setTimeout(() => {
        handleAnalyze();
      }, 500);
    }
  }, [planFile]);

  // 裏コマンドモード判定用の状態
  const [isSecretModeLoading, setIsSecretModeLoading] = useState(false);
  const [secretType, setSecretType] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!estimateFile) return;
    setIsLoading(true);
    setLoadingProgress(0);
    progressRef.current = 0;
    setErrorMessage("");
    setResult(null);
    setIsSecretModeLoading(false);
    setSecretType(null);

    // 経過時間の計測開始
    loadingStartRef.current = Date.now();
    setLoadingElapsed(0);
    
    const updateElapsed = () => {
      const elapsed = Math.floor((Date.now() - loadingStartRef.current) / 1000);
      setLoadingElapsed(elapsed);
      elapsedTimerRef.current = setTimeout(updateElapsed, 1000);
    };
    updateElapsed();

    // 通常モード用のローディングメッセージ
    const normalLoadingMessages = [
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

    // 裏コマンドモード用のローディングメッセージ
    const secretLoadingMessages = [
      "🔮 裏コマンド起動中...",
      "✨ 神秘の力が目覚めています...",
      "🌟 占い師に接続しています...",
      "🔮 マダム・エステートを呼び出し中...",
      "💫 運命の糸を読み解いています...",
      "🌙 星々の配置を確認しています...",
      "✨ あなたのオーラを感知中...",
      "🔮 水晶玉に映像が浮かんできました...",
      "💫 運命の書を紐解いています...",
      "🌟 特別な鑑定を準備中...",
      "✨ 神秘のメッセージを受信中...",
      "🔮 鑑定結果をまとめています..."
    ];

    let loadingMessages = normalLoadingMessages;
    let messageIndex = 0;
    
    // メッセージを3秒ごとに切り替える
    const messageTimerRef = { current: null as NodeJS.Timeout | null };
    const updateMessage = () => {
      if (messageIndex < loadingMessages.length) {
        setLoadingStep(loadingMessages[messageIndex]);
        messageIndex++;
      } else {
        // メッセージが一周したら最後の方を繰り返す
        setLoadingStep(loadingMessages[loadingMessages.length - 1]);
      }
      messageTimerRef.current = setTimeout(updateMessage, 3000); // 3秒ごと
    };
    setLoadingStep(loadingMessages[0]);
    messageIndex = 1;
    messageTimerRef.current = setTimeout(updateMessage, 3000);

    // プログレスバーのアニメーション（30秒想定）
    const runAnimation = () => {
      const current = progressRef.current;
      const elapsed = (Date.now() - loadingStartRef.current) / 1000;
      
      // 30秒で95%に到達するペースで進行
      const targetProgress = Math.min(95, (elapsed / 30) * 95);
      
      // 現在の進捗と目標の差分を徐々に埋める
      const diff = targetProgress - current;
      const increment = Math.max(0.1, diff * 0.15);
      
      if (current + increment < 99) { 
        progressRef.current = Math.min(99, current + increment); 
      }
      setLoadingProgress(progressRef.current);
      timerRef.current = setTimeout(runAnimation, 150);
    };
    runAnimation();
    
    // クリーンアップ用に参照を保存
    const cleanupMessageTimer = () => {
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    };

    // 裏コマンドモードに切り替える関数
    const switchToSecretMode = (type: string) => {
      setIsSecretModeLoading(true);
      setSecretType(type);
      loadingMessages = secretLoadingMessages;
      messageIndex = 0;
      setLoadingStep(secretLoadingMessages[0]);
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

      // まず画像分類を行い、裏コマンドかどうかを判定
      setLoadingStep("画像を解析しています...");
      const classifyFormData = new FormData();
      classifyFormData.append("estimate", formData.get("estimate") as File);
      
      try {
        const classifyRes = await fetch("/api/classify", { method: "POST", body: classifyFormData });
        if (classifyRes.ok) {
          const classifyData = await classifyRes.json();
          console.log("画像分類結果:", classifyData);
          
          if (classifyData.isSecretMode) {
            // 裏コマンドモードに切り替え
            switchToSecretMode(classifyData.type);
          }
        }
      } catch (classifyError) {
        console.log("分類スキップ（通常モードで続行）:", classifyError);
      }

      console.log("📤 APIリクエスト送信開始...");
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      console.log("📥 APIレスポンス受信:", {
        status: res.status,
        statusText: res.statusText,
        ok: res.ok
      });
      
      if (!res.ok) {
         let errorData: Record<string, string> = {};
         try {
           errorData = await res.json();
           console.error("❌ APIエラーレスポンス:", errorData);
         } catch (parseError) {
           console.error("❌ エラーレスポンスのパースに失敗:", parseError);
           const errorText = await res.text();
           console.error("❌ レスポンス本文:", errorText.substring(0, 500));
           errorData = { error: `サーバーエラー（ステータス: ${res.status}）` };
         }
         
         console.error("❌ ========== フロントエンドエラー ==========");
         console.error("ステータスコード:", res.status);
         console.error("エラーデータ:", errorData);
         console.error("===========================================");
         
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
      
      // デバッグ: 裏コマンドモードかどうか確認
      console.log("API Response:", data.result);
      console.log("is_secret_mode:", data.result.is_secret_mode);
      console.log("secret_type:", data.result.secret_type);
      
      if (timerRef.current) clearTimeout(timerRef.current);
      if (elapsedTimerRef.current) clearTimeout(elapsedTimerRef.current);
      cleanupMessageTimer();

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
      cleanupMessageTimer();
      
      console.error("❌ ========== フロントエンドキャッチエラー ==========");
      console.error("エラータイプ:", error?.constructor?.name || typeof error);
      console.error("エラーメッセージ:", error instanceof Error ? error.message : String(error));
      if (error instanceof Error) {
        console.error("エラースタック:", error.stack);
      }
      console.error("================================================");
      
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
    return `【賃貸初期費用AI診断】\n` +
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
      // URLだけをコピー（テキストは含めない）
      navigator.clipboard.writeText(url);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };
  
  const handleDownloadImage = async () => {
    if (!resultRef.current) return;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const exportBg = result?.is_secret_mode ? "#0f172a" : "#ffffff";
      const canvas = await html2canvas(resultRef.current, { 
        backgroundColor: exportBg, 
        scale: 2,
        useCORS: true,
        logging: false,
        allowTaint: false,
        onclone: (clonedDoc: Document) => {
          // キャプチャ時にアニメーション/トランジション由来の「真っ白」を防ぐ
          const style = clonedDoc.createElement("style");
          style.textContent = `
            *, *::before, *::after {
              animation: none !important;
              transition: none !important;
            }
          `;
          clonedDoc.head.appendChild(style);

          // 結果領域の背景と可視状態を強制（opacity/transformが残って白抜けするのを防ぐ）
          const exportEl = clonedDoc.getElementById("result-export");
          if (exportEl) {
            (exportEl as HTMLElement).style.backgroundColor = exportBg;
            (exportEl as HTMLElement).style.opacity = "1";
            (exportEl as HTMLElement).style.transform = "none";
            (exportEl as HTMLElement).style.filter = "none";
          }
        },
      } as Parameters<typeof html2canvas>[1]);
      const link = document.createElement("a");
      link.download = `診断結果.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (error) { 
      console.error("画像保存エラー:", error);
      alert("保存に失敗しました"); 
    }
  };

  // LINE連携ハンドラー
  const handleLineLink = async () => {
    if (!result || isCreatingLineLink) return;
    setIsCreatingLineLink(true);
    try {
      // 1. 案件作成＋caseToken発行
      const res = await fetch('/api/case/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result }),
      });

      if (!res.ok) throw new Error('案件の作成に失敗しました');

      const { caseId, caseToken } = await res.json();

      // 2. LIFF URLへ遷移（diag_idとcaseTokenを含める）
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
      if (!liffId || liffId === 'your-liff-id-here') {
        alert('LIFF IDが設定されていません。管理者にお問い合わせください。');
        return;
      }

      // diag_id（caseId）とcaseTokenの両方を含める
      const liffUrl = `https://liff.line.me/${liffId}?state=${caseToken}&diag_id=${caseId}`;
      window.location.href = liffUrl;
    } catch (error) {
      console.error('LINE link creation error:', error);
      alert('LINEとの連携に失敗しました');
    } finally {
      setIsCreatingLineLink(false);
    }
  };

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 font-sans pb-20 relative overflow-hidden">
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
          <div className="text-center mb-10 mt-8 md:mt-12">
            <h2 className="text-4xl md:text-7xl font-extrabold text-white mb-3 md:mb-4 leading-tight">
              賃貸初期費用<span className="text-yellow-400 font-extrabold">AI</span><span className="text-blue-400">診断</span>
            </h2>
            <p className="text-slate-400 text-xs md:text-sm">
              AIが図面と見積もりを照合し、<br className="md:hidden"/>交渉可能な項目を洗い出します。
            </p>
          </div>

          {/* 撮影のコツ */}
          <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-2xl p-4 mb-8 animate-fade-in-up">
            <div className="flex items-start gap-3">
              <span className="text-2xl">📸</span>
              <div>
                <p className="text-amber-300 font-bold text-xs mb-1.5">撮影のコツ</p>
                <ul className="text-amber-200/80 text-[10px] space-y-0.5">
                  <li>・<span className="font-bold text-amber-200">平らな場所</span>に置いて正面から</li>
                  <li>・<span className="font-bold text-amber-200">反射を避けて</span>全体が見える状態</li>
                  <li>・<span className="font-bold text-amber-200">ピントを合わせて</span>撮影</li>
                </ul>
              </div>
            </div>
          </div>

          {/* 2カラムレイアウト: 左=見積書, 右=図面 */}
          <div className="grid grid-cols-2 gap-2 md:gap-4 mb-8">
            {/* 左カラム: 見積書 */}
            <div className="flex flex-col">
              <div className="flex items-center gap-1 md:gap-2 mb-2 md:mb-3">
                <span className="bg-red-500 text-white text-[9px] md:text-xs font-bold px-1.5 md:px-2 py-0.5 md:py-1 rounded-full">必須</span>
                <h3 className="text-sm md:text-base font-bold text-white">見積書</h3>
              </div>
              
              <div className="bg-slate-800/50 border-2 border-dashed border-slate-600 rounded-2xl p-4 md:p-6 relative overflow-hidden hover:border-blue-500/50 transition-all group flex-1 min-h-72 flex flex-col">
                {estimatePreview ? (
                  <div className="relative flex-1 flex items-center justify-center py-4">
                    <img src={estimatePreview} className="w-full h-full max-h-64 object-contain rounded-lg" alt="見積書プレビュー" />
                    <button
                      onClick={() => {
                        if (estimatePreview) URL.revokeObjectURL(estimatePreview);
                        setEstimateFile(null);
                        setEstimatePreview(null);
                      }}
                      className="absolute top-2 right-2 bg-red-500 text-white w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-600 text-sm z-10"
                      aria-label="見積書画像を削除"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-4 md:py-6 flex flex-col justify-center flex-1">
                    <div className="mb-3 md:mb-4 flex justify-center">
                      <img 
                        src="/estimate-icon.png" 
                        alt="見積書" 
                        className="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow-md"
                      />
                    </div>
                    <p className="text-slate-400 text-xs md:text-sm mb-3 md:mb-4">見積書の画像</p>
                    <div className="flex gap-2 justify-center flex-wrap">
                      <button
                        onClick={() => openCamera("estimate")}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all text-sm min-h-[44px] touch-manipulation"
                      >
                        <span>📷</span> 撮影
                      </button>
                      <button
                        onClick={() => estimateInputRef.current?.click()}
                        className="bg-slate-700 hover:bg-slate-600 text-white font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all text-sm min-h-[44px] touch-manipulation"
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

            {/* 右カラム: 募集図面 */}
            <div className="flex flex-col">
              <div className="flex items-center gap-1 md:gap-2 mb-2 md:mb-3">
                <span className="bg-emerald-500/80 text-white text-[9px] md:text-xs font-bold px-1.5 md:px-2 py-0.5 md:py-1 rounded-full">推奨</span>
                <h3 className="text-sm md:text-base font-bold text-white">募集図面</h3>
                <span className="text-slate-500 text-[9px] md:text-xs">精度UP</span>
              </div>
              
              <div className="bg-slate-800/50 border-2 border-dashed border-slate-600 rounded-2xl p-4 md:p-6 relative overflow-hidden hover:border-blue-500/50 transition-all group flex-1 min-h-72 flex flex-col">
                {planPreview ? (
                  <div className="relative flex-1 flex items-center justify-center py-4">
                    <img src={planPreview} className="w-full h-full max-h-64 object-contain rounded-lg" alt="募集図面プレビュー" />
                    <button
                      onClick={() => {
                        if (planPreview) URL.revokeObjectURL(planPreview);
                        setPlanFile(null);
                        setPlanPreview(null);
                      }}
                      className="absolute top-2 right-2 bg-red-500 text-white w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-600 text-sm z-10"
                      aria-label="図面画像を削除"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-4 md:py-6 flex flex-col justify-center flex-1">
                    <div className="mb-3 md:mb-4 flex justify-center">
                      <img 
                        src="/plan-icon.png" 
                        alt="図面" 
                        className="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow-md"
                      />
                    </div>
                    <p className="text-slate-400 text-xs md:text-sm mb-3 md:mb-4">図面の画像</p>
                    <div className="flex gap-2 justify-center flex-wrap">
                      <button
                        onClick={() => openCamera("plan")}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all text-sm min-h-[44px] touch-manipulation"
                      >
                        <span>📷</span> 撮影
                      </button>
                      <button
                        onClick={() => planInputRef.current?.click()}
                        className="bg-slate-700 hover:bg-slate-600 text-white font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all text-sm min-h-[44px] touch-manipulation"
                      >
                        <span>🖼️</span> 選択
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
            </div>
          </div>

          <div className="text-center mt-6">
            {!isLoading ? (
              <button
                onClick={handleAnalyze}
                disabled={!estimateFile}
                className={`w-full md:w-auto px-8 md:px-16 py-3 md:py-4 rounded-xl font-bold text-base md:text-lg shadow-xl transition-all ${
                  !estimateFile 
                    ? "bg-slate-700 text-slate-500 cursor-not-allowed shadow-none" 
                    : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/30"
                }`}
              >
                {!estimateFile ? "見積書をアップロード" : "適正価格を診断"}
              </button>
            ) : (
              <div className={`backdrop-blur-sm rounded-2xl p-6 border shadow-xl max-w-md mx-auto ${
                isSecretModeLoading 
                  ? "bg-gradient-to-br from-purple-900/90 via-indigo-900/90 to-purple-900/90 border-purple-500/50" 
                  : "bg-slate-800/80 border-slate-700"
              }`}>
                {/* 上部: 進捗率と経過時間 */}
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full animate-pulse ${
                      isSecretModeLoading ? "bg-purple-400" : "bg-blue-500"
                    }`}></div>
                    <span className="text-sm font-bold text-white">
                      {isSecretModeLoading ? "🔮 特別鑑定中" : "AI診断中"}
                    </span>
                </div>
                  <div className="text-right">
                    <span className={`text-2xl font-black ${
                      isSecretModeLoading ? "text-purple-400" : "text-blue-400"
                    }`}>{Math.floor(loadingProgress)}</span>
                    <span className="text-sm text-slate-400">%</span>
                </div>
                </div>
                
                {/* プログレスバー */}
                <div className={`h-2 rounded-full overflow-hidden mb-4 ${
                  isSecretModeLoading ? "bg-purple-900/50" : "bg-slate-700"
                }`}>
                  <div 
                    className={`h-full w-full transition-transform duration-300 relative ${
                      isSecretModeLoading 
                        ? "bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500" 
                        : "bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-500"
                    }`}
                    style={{ transform: `scaleX(${Math.max(0, Math.min(1, loadingProgress / 100))})`, transformOrigin: "left" }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
                  </div>
                </div>
                
                {/* 現在のステップ */}
                <div className={`rounded-lg p-3 mb-3 ${
                  isSecretModeLoading ? "bg-purple-800/50" : "bg-slate-900/50"
                }`}>
                  <p className={`text-sm font-medium text-center ${
                    isSecretModeLoading ? "text-purple-100" : "text-white"
                  }`}>{loadingStep}</p>
                </div>
                
                {/* 裏コマンドモード時の追加演出 */}
                {isSecretModeLoading && (
                  <div className="text-center mb-3">
                    <p className="text-purple-300/80 text-xs animate-pulse">
                      ✨ あなたの運命を読み解いています ✨
                    </p>
                  </div>
                )}
                
                {/* 経過時間と残り時間目安 */}
                <div className={`flex justify-between text-xs ${
                  isSecretModeLoading ? "text-purple-400/70" : "text-slate-500"
                }`}>
                  <span>経過: {loadingElapsed}秒</span>
                  <span>
                    {(() => {
                      // 経過時間から残り時間を推定（30秒想定）
                      const estimatedTotal = 30;
                      const remaining = Math.max(0, estimatedTotal - loadingElapsed);
                      if (isSecretModeLoading) {
                        if (remaining > 20) return "占い師が集中しています...";
                        if (remaining > 10) return "運命の糸を紡いでいます...";
                        if (remaining > 5) return "まもなく鑑定完了...";
                        return "結果が出てきます...";
                      }
                      if (remaining > 20) return `残り約${Math.ceil(remaining / 5) * 5}秒`;
                      if (remaining > 10) return `残り約${remaining}秒`;
                      if (remaining > 5) return "まもなく完了";
                      if (loadingElapsed < 60) return "処理中...";
                      return "もう少しお待ちください...";
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
          
          {/* 裏コマンドモード: 占い風UI */}
          {result.is_secret_mode ? (
            <>
              <div id="result-export" ref={resultRef} style={{ backgroundColor: "#ffffff" }} className="rounded-3xl overflow-hidden">
                <FortuneResult result={result} />
              </div>
              
              {/* 共有・LINE連携ボタン */}
              <div className="mb-8 mt-8">
                <div className="flex gap-2 md:gap-4 mb-4">
                  <button onClick={handleDownloadImage} className="flex-1 py-3 rounded-xl font-bold bg-slate-700 text-white text-sm hover:bg-slate-600 flex items-center justify-center gap-2 shadow-md">
                    <span>💾</span> 画像DL
                  </button>
                  <button 
                    onClick={handleCopyLink} 
                    disabled={isCreatingShare}
                    className="flex-1 bg-slate-700 text-slate-200 font-bold text-sm py-3 rounded-xl hover:bg-slate-600 border border-slate-600 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreatingShare ? "⏳ 準備中..." : isCopied ? "✨ コピーしました！" : "🔗 共有用リンクコピー"}
                  </button>
                </div>
                {/* LINE連携ボタン */}
                <button 
                  onClick={handleLineLink} 
                  disabled={isCreatingLineLink}
                  className="col-span-2 bg-gradient-to-r from-[#06C755] to-[#05b34c] text-white py-4 rounded-xl font-black text-base shadow-lg hover:from-[#05b34c] hover:to-[#04a042] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 transition-all hover:scale-[1.02] relative overflow-hidden group"
                  style={{
                    boxShadow: '0 10px 30px rgba(6, 199, 85, 0.3)'
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                  <div className="relative z-10 flex items-center gap-3">
                    <div className="w-6 h-6 flex items-center justify-center">
                      {isCreatingLineLink ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                          <path d="M12 2C6.48 2 2 5.56 2 10.1c0 2.45 1.3 4.63 3.4 6.1-.15.8-.5 2.15-.56 2.47-.05.24.1.47.34.47.1 0 .2-.03.27-.08.05-.03 2.6-1.73 3.63-2.45.62.17 1.28.26 1.95.26 5.52 0 10-3.56 10-8.1S17.52 2 12 2z"/>
                        </svg>
                      )}
                    </div>
                    <span className="tracking-wide">
                      {isCreatingLineLink ? "準備中..." : "LINEで続きを確認"}
                    </span>
                  </div>
                </button>
              </div>
              
              <div className="mt-4 text-center">
                <button onClick={handleReset} className="text-purple-300 text-sm hover:text-purple-100 font-bold py-4 transition-colors">
                  🔄 もう一度占う
                </button>
              </div>
            </>
          ) : (
          /* 通常モード: 診断結果UI */
          <>
          <div id="result-export" ref={resultRef} className="bg-white p-8 rounded-3xl border border-slate-200 shadow-2xl relative overflow-hidden mb-8 animate-scale-in text-slate-600">
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
              {result.warning_amount && result.warning_amount > 0 && (
                <p className="text-blue-100 text-xs mt-3 opacity-90">
                  ※ 別途、要確認項目あり（¥{formatYen(result.warning_amount)}）
                </p>
              )}
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

            {/* 🔴 削減可能な項目 (cut/negotiable) */}
            {result.items.filter(i => i.status === 'cut' || i.status === 'negotiable').length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">🔴</span>
                  <h3 className="text-sm font-bold text-red-600">削減可能な項目</h3>
                </div>
                <div className="space-y-3">
                  {result.items.filter(i => i.status === 'cut' || i.status === 'negotiable').map((item, index) => (
                    <div
                      key={index}
                      className="border rounded-xl p-4 animate-fade-in-up bg-red-50 border-red-100"
                      style={{ animationDelay: `${0.2 + index * 0.05}s` }}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-slate-800">{item.name}</span>
                        <span className={`text-[10px] font-bold text-white px-2 py-0.5 rounded ${
                          item.status === 'cut' ? 'bg-red-500' : 'bg-orange-500'
                        }`}>
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
                      {item.evidence && (
                        <div className="mt-2 pt-2 border-t border-slate-200">
                          <p className="text-[10px] text-slate-400 font-bold mb-1">📋 根拠</p>
                          <p className="text-[10px] text-slate-500">{item.evidence.source_description}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 🟡 要確認項目 (warning) */}
            {result.items.filter(i => i.status === 'warning').length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">🟡</span>
                  <h3 className="text-sm font-bold text-amber-600">要確認項目</h3>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-3">
                  <p className="text-xs text-amber-700 mb-2">
                    <span className="font-bold">⚠️ これらの項目は削減可能額に含まれていません</span>
                  </p>
                  <p className="text-xs text-amber-600">
                    募集図面との照合やプロによる確認が必要です。詳細は不動産会社または弊社にご相談ください。
                  </p>
                </div>
                <div className="space-y-3">
                  {result.items.filter(i => i.status === 'warning').map((item, index) => (
                    <div
                      key={index}
                      className="border rounded-xl p-4 animate-fade-in-up bg-amber-50 border-amber-200"
                      style={{ animationDelay: `${0.2 + index * 0.05}s` }}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-slate-800">{item.name}</span>
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                          要確認
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-amber-700">{item.reason}</p>
                        <div className="text-right whitespace-nowrap ml-2">
                          <span className="text-amber-600 font-bold">¥{formatYen(item.price_original)}</span>
                        </div>
                      </div>
                      {item.evidence && (
                        <div className="mt-2 pt-2 border-t border-amber-200">
                          <p className="text-[10px] text-amber-500 font-bold mb-1">📋 根拠</p>
                          <p className="text-[10px] text-amber-600">{item.evidence.source_description}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 🟢 適正な項目 (fair) */}
            {result.items.filter(i => i.status === 'fair').length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">🟢</span>
                  <h3 className="text-sm font-bold text-emerald-600">適正な項目</h3>
                </div>
                <div className="text-xs text-slate-500 space-y-2">
                  {result.items.filter(i => i.status === 'fair').map((item, idx) => (
                    <div key={idx} className="border border-emerald-100 bg-emerald-50/30 rounded-lg p-3">
                      <div className="flex justify-between">
                        <span className="font-medium text-slate-700">{item.name}</span>
                        <span className="text-emerald-600 font-bold">¥{formatYen(item.price_fair)}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">{item.reason}</p>
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

          {/* 図面追加ボタン（図面未アップロード時のみ表示） */}
          {result.has_flyer === false && (
            <div className="mb-6">
              <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-3">
                <p className="text-sm font-bold text-blue-700 mb-1">📄 より正確な診断が可能です</p>
                <p className="text-xs text-blue-600">
                  募集図面を追加すると、要確認項目の判定精度が大幅に向上します。
                </p>
              </div>
              <button
                onClick={() => {
                  // 図面アップロード用のinputをクリック
                  if (planInputRef.current) {
                    planInputRef.current.click();
                  }
                }}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-3 shadow-lg transition-all hover:scale-[1.02]"
              >
                <span className="text-2xl">📄</span>
                <span>募集図面を追加して再診断</span>
              </button>
            </div>
          )}

          <div className="flex gap-2 md:gap-4 mb-8">
            <button onClick={handleDownloadImage} className="flex-1 py-3 rounded-xl font-bold bg-slate-700 text-white text-sm hover:bg-slate-600 flex items-center justify-center gap-2 shadow-md">
              <span>💾</span> 画像DL
            </button>
            <button 
              onClick={handleCopyLink} 
              disabled={isCreatingShare}
              className="flex-1 bg-slate-700 text-slate-200 font-bold text-sm py-3 rounded-xl hover:bg-slate-600 border border-slate-600 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreatingShare ? "⏳ 準備中..." : isCopied ? "✨ コピーしました！" : "🔗 共有用リンクコピー"}
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
              const negotiationText = "交渉が面倒、怖いと感じる方は、弊社で全ての交渉を代行しお得に契約できるようサポートが可能です。希望の場合はLINEでご相談ください。";
              
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
             <div className="relative z-10">
               {/* LINE連携ボタン（CV） */}
               <button 
                 onClick={handleLineLink} 
                 disabled={isCreatingLineLink}
                 className="relative w-full bg-[#06C755] hover:brightness-105 shadow-xl rounded-full overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform min-h-24 md:min-h-28 px-6 py-5"
                 style={{
                   boxShadow: '0 12px 36px rgba(6, 199, 85, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.28)'
                 }}
               >
                 {/* シマー（約4秒おき） */}
                 <div className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-20 animate-shine"></div>

                 <div className="relative flex items-center justify-center gap-4">
                   {/* 左側：LINE公式ロゴ */}
                   {isCreatingLineLink ? (
                     <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-white/90 flex-shrink-0" />
                   ) : (
                     <NextImage
                       src="/line-logo.png"
                       alt="LINEロゴ"
                       width={44}
                       height={44}
                       className="flex-shrink-0 drop-shadow-md"
                     />
                   )}

                   {/* 右側：テキスト（2行） */}
                   {isCreatingLineLink ? (
                     <div className="text-xl md:text-2xl font-extrabold text-white drop-shadow-md">
                       準備中...
                     </div>
                   ) : (
                     (result.discount_amount ?? 0) > 0 ? (
                       <div className="flex flex-col text-left leading-tight">
                         <span className="text-lg md:text-xl font-bold text-white drop-shadow-md">
                           <span className="text-[#ff0000] font-extrabold text-xl md:text-2xl text-outline-white-strong mr-1">割引済み</span>
                           <span className="text-white">の見積もりを</span>
                         </span>
                         <span className="text-xl md:text-2xl font-extrabold text-white drop-shadow-md">無料で確認する</span>
                       </div>
                     ) : (
                       <div className="flex flex-col text-left leading-tight">
                         <span className="text-lg md:text-xl font-bold text-white drop-shadow-md">詳細の見積りを</span>
                         <span className="text-xl md:text-2xl font-extrabold text-white drop-shadow-md">無料で確認する</span>
                       </div>
                     )
                   )}
                 </div>
               </button>
             </div>
             <div className="relative z-10 mt-6 pt-6 border-t border-slate-700">
                <div className="flex flex-wrap gap-2 md:gap-4 text-[10px] md:text-sm justify-center md:justify-start">
                  <div className="flex items-center gap-1 md:gap-2 text-slate-300 group">
                    <div className="relative w-6 h-6 md:w-8 md:h-8 flex items-center justify-center bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-lg shadow-md group-hover:shadow-lg transition-all">
                      <span className="text-sm md:text-lg" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}>📅</span>
                    </div>
                    <span className="font-black tracking-tight text-[10px] md:text-sm whitespace-nowrap" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>365日対応</span>
                  </div>
                  <div className="flex items-center gap-1 md:gap-2 text-slate-300 group">
                    <div className="relative w-6 h-6 md:w-8 md:h-8 flex items-center justify-center bg-gradient-to-br from-amber-500/20 to-amber-600/20 rounded-lg shadow-md group-hover:shadow-lg transition-all">
                      <span className="text-sm md:text-lg" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}>🏆</span>
                    </div>
                    <span className="font-black tracking-tight text-[10px] md:text-sm whitespace-nowrap" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>実績800件</span>
                  </div>
                  <div className="flex items-center gap-1 md:gap-2 text-slate-300 group">
                    <div className="relative w-6 h-6 md:w-8 md:h-8 flex items-center justify-center bg-gradient-to-br from-green-500/20 to-green-600/20 rounded-lg shadow-md group-hover:shadow-lg transition-all">
                      <span className="text-sm md:text-lg" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}>📱</span>
                    </div>
                    <span className="font-black tracking-tight text-[10px] md:text-sm whitespace-nowrap" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>来店不要</span>
                  </div>
                  <div className="flex items-center gap-1 md:gap-2 text-slate-300 group">
                    <div className="relative w-6 h-6 md:w-8 md:h-8 flex items-center justify-center bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 rounded-lg shadow-md group-hover:shadow-lg transition-all">
                      <span className="text-sm md:text-lg" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}>💰</span>
                    </div>
                    <span className="font-black tracking-tight text-[10px] md:text-sm whitespace-nowrap" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>仲介手数料無料</span>
                  </div>
                  <div className="flex items-center gap-1 md:gap-2 text-slate-300 group">
                    <div className="relative w-6 h-6 md:w-8 md:h-8 flex items-center justify-center bg-gradient-to-br from-purple-500/20 to-purple-600/20 rounded-lg shadow-md group-hover:shadow-lg transition-all">
                      <span className="text-sm md:text-lg" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}>✅</span>
                    </div>
                    <span className="font-black tracking-tight text-[10px] md:text-sm whitespace-nowrap" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>不要オプション無し</span>
                  </div>
                </div>
             </div>
          </div>

          <button onClick={handleReset} className="block w-full text-center text-slate-500 text-sm hover:text-blue-400 font-bold py-4 transition-colors">
            🔄 別の物件を診断する
          </button>
          </>
          )}

        </div>
      )}

      <footer className="text-center text-slate-600 text-xs py-10">
        © 2024 Smart Rent Check System
      </footer>
    </div>
  );
}
