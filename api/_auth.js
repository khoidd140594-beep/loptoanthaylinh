/**
 * api/_auth.js — kiểm tra danh tính và quyền cho các API route.
 *
 * Vì sao cần: mọi route trong api/ đều dùng SUPABASE_SERVICE_ROLE_KEY, mà key này
 * bỏ qua toàn bộ RLS. Không kiểm tra ở đây thì bất kỳ ai biết địa chỉ đều gọi được.
 *
 * File bắt đầu bằng dấu gạch dưới nên Vercel KHÔNG coi là endpoint — chỉ là
 * module dùng chung, không truy cập được từ ngoài.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Vai trò được phép nhắn tin cho phụ huynh. */
export const CAN_MESSAGE = ['ADMIN', 'TEACHER'];

/** Vai trò được phép làm việc ảnh hưởng cả trung tâm (đổi tài khoản Zalo, tạo user). */
export const CAN_ADMIN = ['ADMIN'];

let cached = null;

export function adminClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw httpError(
      500,
      'Thiếu VITE_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trên Vercel.',
    );
  }

  if (!cached) {
    cached = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return cached;
}

export function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

/**
 * Xác thực người gọi và trả về { uid, role, name }.
 *
 * @param {import('http').IncomingMessage & { headers: Record<string,string> }} req
 * @param {{ allow?: string[] }} [options] Danh sách vai trò được phép. Mặc định CAN_MESSAGE.
 */
export async function requireStaff(req, options = {}) {
  const allow = options.allow ?? CAN_MESSAGE;

  const header = String(req.headers?.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw httpError(401, 'Chưa đăng nhập.');

  const supabase = adminClient();

  // getUser(token) tự kiểm tra chữ ký và hạn của JWT.
  const { data, error } = await supabase.auth.getUser(match[1].trim());
  if (error || !data?.user) {
    throw httpError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, active, name')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profileError) {
    throw httpError(500, `Không đọc được hồ sơ người dùng: ${profileError.message}`);
  }
  if (!profile) throw httpError(403, 'Tài khoản chưa có hồ sơ trong hệ thống.');
  if (profile.active !== true) throw httpError(403, 'Tài khoản đã bị khoá.');

  const role = String(profile.role || '');
  if (!allow.includes(role)) {
    throw httpError(403, 'Tài khoản không có quyền thực hiện việc này.');
  }

  return { uid: data.user.id, role, name: profile.name || '' };
}

/** Trả lỗi về client theo đúng mã trạng thái đã gắn trong httpError. */
export function sendError(res, error, fallbackMessage = 'Đã có lỗi xảy ra.') {
  const statusCode = Number(error?.statusCode) || 500;
  const message = error instanceof Error ? error.message : fallbackMessage;

  if (statusCode >= 500) console.error('[api]', error);

  return res.status(statusCode).json({ ok: false, error: message });
}
