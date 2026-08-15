// =============================================================================
// src/services/firebaseReport.ts  (APP QUẢN LÝ TRUNG TÂM)
//
// Ghi phiếu kết quả lên "dịch vụ phiếu" dùng chung (project chambai4grade-e232a)
// và trả về link xem phiếu trên domain Vercel của app chấm bài.
//
// Cài đặt: npm i firebase
// =============================================================================

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { buildReportHtml, type ReportData } from './reportHtml';

// ⚠️ DÁN ĐÚNG config của project chambai4grade-e232a
// (copy y nguyên firebaseConfig đang chạy tốt ở app CHẤM BÀI -> src/services/firebase.ts).
// Bắt buộc projectId phải là 'chambai4grade-e232a'.

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const cfg = {
  apiKey: "AIzaSyARaaz3b-Y2_AkJxX1hc32cRZvXQrJMR9I",
  authDomain: "chambai4grade-e232a.firebaseapp.com",
  projectId: "chambai4grade-e232a",
  storageBucket: "chambai4grade-e232a.firebasestorage.app",
  messagingSenderId: "1074327373317",
  appId: "1:1074327373317:web:e9ab443d5d2f4c11737e6c",
  measurementId: "G-RKMYF3G9EM"
};
// Dùng app Firebase tên riêng để không đụng app mặc định (nếu sau này có)
const app = getApps().some(a => a.name === 'reportApp') ? getApp('reportApp') : initializeApp(cfg, 'reportApp');
const auth = getAuth(app);
const db = getFirestore(app);

// Link gốc tới function dựng HTML (đang chạy ở app chấm bài)
const REPORT_BASE = 'https://chambai4grade.vercel.app/r/';

export type { ReportData };

// Ghi phiếu, trả về link công khai để chia sẻ
export async function createReportLink(data: ReportData): Promise<string> {
  if (!auth.currentUser) {
    try { await signInAnonymously(auth); } catch { /* nếu rule reports cho create công khai thì bỏ qua được */ }
  }
  const ref = await addDoc(collection(db, 'reports'), {
    payload: JSON.stringify(data),
    studentName: data.studentName,
    examTitle: data.examTitle,
    total: data.total,
    createdAt: serverTimestamp(),
  });
  return REPORT_BASE + ref.id;
}

// Lấy HTML đầy đủ (cho nút "Tải HTML")
export function getReportHtml(data: ReportData): string {
  return buildReportHtml(data);
}
