"use client";

import { useState } from "react";

type SimResult = {
  ok?: boolean;
  error?: string;
  result?: {
    nextState?: string | null;
    replies?: Array<{ type: string; text?: string }>;
  };
};

const buttons = [
  { label: "はい", value: "はい" },
  { label: "いいえ", value: "いいえ" },
  { label: "相談したい", value: "相談したい" },
  { label: "申し込みをしたい", value: "申し込みをしたい" },
  { label: "申し込みしない", value: "申し込みしない" },
  { label: "履歴", value: "履歴" },
];

const states = [
  { label: "property_confirm（物件確認）", value: "property_confirm" },
  { label: "application_intent（申し込み意向）", value: "application_intent" },
  { label: "consultation（相談）", value: "consultation" },
  { label: "waiting_images（画像待ち）", value: "waiting_images" },
  { label: "completed（完了）", value: "completed" },
];

export default function LineTestPage() {
  const [currentState, setCurrentState] = useState("property_confirm");
  const [messageText, setMessageText] = useState("はい");
  const [caseId, setCaseId] = useState("demo-case");
  const [result, setResult] = useState<SimResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const runTest = async () => {
    setIsLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/line/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageText,
          currentState,
          caseId,
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch (error: unknown) {
      setResult({ error: error instanceof Error ? error.message : "通信に失敗しました" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#f5f7fb] text-slate-900 p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-black mb-4">LINE 分岐テスト（簡単版）</h1>
        <p className="text-sm text-slate-600 mb-6">
          ボタンを押すだけで分岐の結果が表示されます。LINEアプリ不要です。
        </p>

        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-5 mb-6">
          <div className="text-sm font-bold mb-2">現在の状態</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
            {states.map((state) => (
              <button
                key={state.value}
                onClick={() => setCurrentState(state.value)}
                className={`px-3 py-2 rounded-lg text-sm border ${
                  currentState === state.value
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-700 border-slate-200 hover:border-blue-400"
                }`}
              >
                {state.label}
              </button>
            ))}
          </div>

          <div className="text-sm font-bold mb-2">送るメッセージ</div>
          <div className="flex flex-wrap gap-2 mb-4">
            {buttons.map((btn) => (
              <button
                key={btn.value}
                onClick={() => setMessageText(btn.value)}
                className={`px-3 py-2 rounded-lg text-sm border ${
                  messageText === btn.value
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-white text-slate-700 border-slate-200 hover:border-emerald-400"
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <div className="text-sm font-bold mb-2">caseId（適当でOK）</div>
          <input
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-4"
            placeholder="demo-case"
          />

          <button
            onClick={runTest}
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-3 rounded-xl shadow-md disabled:opacity-50"
          >
            {isLoading ? "実行中..." : "テスト実行"}
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-5">
          <div className="text-sm font-bold mb-2">結果</div>
          {!result && <p className="text-sm text-slate-500">まだ実行していません。</p>}
          {result?.error && <p className="text-sm text-red-600">{result.error}</p>}
          {result?.result && (
            <div className="text-sm text-slate-700 space-y-2">
              <div>
                <span className="font-bold">次の状態:</span>{" "}
                {result.result.nextState ?? "（変更なし）"}
              </div>
              <div>
                <span className="font-bold">返答メッセージ:</span>
                <div className="mt-2 space-y-2">
                  {result.result.replies?.map((reply, index) => (
                    <div key={index} className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                      {reply.type === "text" ? reply.text : `[${reply.type}]`}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-500 mt-6">
          使い方: ここで「はい/いいえ/相談したい」を押して結果が変われば、LINE分岐ロジック自体は正しく動いています。
        </p>
      </div>
    </div>
  );
}
