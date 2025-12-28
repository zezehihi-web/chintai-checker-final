import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

// ★この1行を追加！（Vercelのタイムアウトを60秒に延長する設定）
export const maxDuration = 60; 

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
// ... (以下、元のコードのまま)