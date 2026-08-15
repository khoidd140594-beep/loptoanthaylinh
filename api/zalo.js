/**
 * api/zalo.js — cầu nối giữa web quản lý và zalo-service trên Render.
 *
 * Vì sao phải đi qua đây: API_KEY của zalo-service không được lọt xuống trình duyệt.
 * Dự án này là Vite SPA nên mọi thứ trong src/ đều nằm trong bundle công khai —
 * key chỉ được phép tồn tại trong biến môi trường của Vercel Function.
 *
 * Biến môi trường cần đặt trên Vercel:
 *   ZALO_BACKEND_URL      = https://zalo-service-xxx.onrender.com   (không có / ở cuối)
 *   ZALO_BACKEND_API_KEY  = đúng chuỗi API_KEY đã đặt trên Render
 *
 * Client gọi:  POST /api/zalo  { path, payload?, query?, log? }
 */
import { requireStaff, adminClient, httpError, sendError, CAN_ADMIN } from './_auth.js';

const BACKEND_URL = String(process.env.ZALO_BACKEND_URL || '').replace(/\/+$/, '');
const BACKEND_API_KEY = String(process.env.ZALO_BACKEND_API_KEY || '');

/* ------------------------------------------------------------------ *
 * Nhật ký đã gửi
 *
 * Mục đích: cảnh báo khi định gửi lại thông báo mà lớp đó đã nhận rồi.
 * Mốc ghi là "đã vào hàng đợi", chưa phải "Zalo đã nhận" — nên giao diện
 * dùng nó để CẢNH BÁO chứ không chặn cứng việc gửi lại.
 * ------------------------------------------------------------------ */
const LOG_TABLE = 'zalo_send_logs';
const LOG_KINDS = ['TUITION', 'ATTENDANCE', 'GRADES'];

function parseLogRef(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const kind = String(raw.kind || '');
  const classId = String(raw.classId || '').trim();
  const periodKey = String(raw.periodKey || '').trim();

  if (!LOG_KINDS.includes(kind) || !classId || !periodKey) return null;

  const students = Array.isArray(raw.students)
    ? raw.students
        .map((s) => ({
          id: String(s?.id || '').trim(),
          name: s?.name ? String(s.name) : null,
          phone: s?.phone ? String(s.phone) : null,
        }))
        .filter((s) => s.id)
    : [];

  return { kind, classId, periodKey, students };
}

/** Đọc nhật ký của một lớp trong một kỳ → { studentId: { at, byUid, ... } } */
async function readSentLog(ref) {
  const { data, error } = await adminClient()
    .from(LOG_TABLE)
    .select('student_id, sent_at, by_uid, by_role, job_id, student_name, phone')
    .eq('kind', ref.kind)
    .eq('class_id', ref.classId)
    .eq('period_key', ref.periodKey);

  if (error) throw httpError(500, `Không đọc được nhật ký gửi: ${error.message}`);

  const out = {};
  for (const row of data || []) {
    out[row.student_id] = {
      at: row.sent_at,
      byUid: row.by_uid,
      byRole: row.by_role,
      jobId: row.job_id || undefined,
      name: row.student_name || undefined,
      phone: row.phone || undefined,
    };
  }
  return out;
}

async function writeSentLog(ref, staff, jobId) {
  if (!ref.students.length) return;

  const sentAt = new Date().toISOString();
  const rows = ref.students.map((student) => ({
    kind: ref.kind,
    class_id: ref.classId,
    period_key: ref.periodKey,
    student_id: student.id,
    student_name: student.name,
    phone: student.phone,
    job_id: jobId || null,
    sent_at: sentAt,
    by_uid: staff.uid,
    by_role: staff.role,
  }));

  // Gửi lại cho cùng một em thì ghi đè lần gửi trước, không tạo dòng mới.
  const { error } = await adminClient()
    .from(LOG_TABLE)
    .upsert(rows, { onConflict: 'kind,class_id,period_key,student_id' });

  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ *
 * Danh sách đường dẫn được phép chuyển tiếp
 *
 * Đây là allowlist, không phải blocklist: đường dẫn nào không khớp thì từ chối.
 * Nếu không có nó, client tự đặt path là gì cũng gọi được sang Render.
 * ------------------------------------------------------------------ */
const ID = '[A-Za-z0-9_-]+';

const ROUTES = [
  // Đọc
  { test: /^health$/, method: 'GET' },
  { test: /^threads$/, method: 'GET' },
  { test: new RegExp(`^messages/${ID}$`), method: 'GET' },
  { test: /^updates$/, method: 'GET' },
  { test: new RegExp(`^job/${ID}$`), method: 'GET' },

  // Gửi và cập nhật
  { test: /^send$/, method: 'POST' },
  { test: /^send-bulk$/, method: 'POST' },
  { test: /^send-file$/, method: 'POST' },
  { test: /^resolve$/, method: 'POST' },
  { test: new RegExp(`^read/${ID}$`), method: 'POST' },
  { test: new RegExp(`^threads/${ID}/name$`), method: 'POST' },

  // Kết nối lại tài khoản Zalo — chỉ ADMIN, vì việc này đổi tài khoản mà cả
  // trung tâm đang dùng để nhắn phụ huynh.
  { test: /^login\/state$/, method: 'GET', adminOnly: true },
  { test: /^login\/start$/, method: 'POST', adminOnly: true },
  { test: /^login\/retry$/, method: 'POST', adminOnly: true },
];

function resolveUpstream(pathValue) {
  const path = String(pathValue || '').replace(/^\/+/, '').trim();
  if (!path) throw httpError(400, 'Thiếu đường dẫn Zalo.');

  const route = ROUTES.find((r) => r.test.test(path));
  if (!route) throw httpError(400, `Đường dẫn Zalo không hợp lệ: ${path}`);

  return { path, method: route.method, adminOnly: route.adminOnly };
}

/* ------------------------------------------------------------------ *
 * Kiểm tra dữ liệu gửi lên
 *
 * Thư mục api/ không được tsc kiểm tra (tsconfig chỉ include "src"), nên mọi
 * giả định về kiểu dữ liệu phải được kiểm tra tại chạy.
 * ------------------------------------------------------------------ */
/** Vercel giới hạn body request 4.5MB, base64 phình ~33%. */
const MAX_BASE64_CHARS = 3_000_000;
const MAX_FILES = 5;

function validateFiles(files, where) {
  if (!Array.isArray(files) || files.length === 0) {
    throw httpError(400, `${where}: danh sách files rỗng.`);
  }
  if (files.length > MAX_FILES) {
    throw httpError(400, `${where}: tối đa ${MAX_FILES} file mỗi tin.`);
  }

  files.forEach((raw, index) => {
    const file = raw ?? {};

    if (!file.base64 && !file.url) {
      throw httpError(400, `${where}, file ${index + 1}: cần base64 hoặc url.`);
    }
    if (!file.url && !String(file.filename || '').includes('.')) {
      throw httpError(400, `${where}, file ${index + 1}: filename phải có phần mở rộng.`);
    }
    if (typeof file.base64 === 'string' && file.base64.length > MAX_BASE64_CHARS) {
      throw httpError(
        400,
        `${where}, file ${index + 1} quá lớn để gửi trực tiếp. ` +
          'Hãy nén ảnh, hoặc tải lên Drive rồi truyền "url".',
      );
    }
  });
}

function validatePayload(path, payload) {
  const body = payload ?? {};

  if (path === 'send') {
    if (!String(body.message || '').trim() || (!body.phone && !body.userId)) {
      throw httpError(400, 'Tin nhắn cần có nội dung và số điện thoại hoặc userId.');
    }
    return;
  }

  if (path === 'send-bulk') {
    const items = body.items;
    if (!Array.isArray(items) || items.length === 0 || items.length > 200) {
      throw httpError(400, 'Danh sách gửi phải có từ 1 đến 200 người.');
    }

    // Tổng dung lượng cả lô cũng phải nằm trong giới hạn body của Vercel.
    let totalBase64 = 0;

    items.forEach((raw, index) => {
      const item = raw ?? {};
      const where = `Dòng thứ ${index + 1}`;

      if (!item.phone && !item.userId) {
        throw httpError(400, `${where} thiếu số điện thoại.`);
      }

      const hasFiles = Array.isArray(item.files) && item.files.length > 0;

      // Tin chỉ có file thì message được phép rỗng.
      if (!String(item.message || '').trim() && !hasFiles) {
        throw httpError(400, `${where} thiếu nội dung và cũng không có file.`);
      }

      if (hasFiles) {
        validateFiles(item.files, where);
        for (const f of item.files) {
          if (typeof f?.base64 === 'string') totalBase64 += f.base64.length;
        }
      }
    });

    if (totalBase64 > MAX_BASE64_CHARS) {
      throw httpError(
        400,
        'Tổng dung lượng file của cả lô vượt giới hạn. Gửi ít người hơn mỗi lượt, ' +
          'hoặc tải file lên Drive rồi truyền "url".',
      );
    }
    return;
  }

  if (path === 'send-file') {
    if (!body.phone && !body.userId) throw httpError(400, 'Cần số điện thoại hoặc userId.');
    validateFiles(body.files, 'Tin nhắn');
    return;
  }

  if (path === 'resolve') {
    if (!String(body.phone || '').trim()) throw httpError(400, 'Thiếu số điện thoại.');
    return;
  }

  // read/:id, threads/:id/name, login/* không cần payload bắt buộc.
}

/* ------------------------------------------------------------------ *
 * Xây URL kèm query (dùng cho updates?since=...)
 * ------------------------------------------------------------------ */
const ALLOWED_QUERY = new Set(['since']);

function buildUrl(path, query) {
  const url = new URL(`${BACKEND_URL}/${path}`);

  if (query && typeof query === 'object') {
    for (const [key, value] of Object.entries(query)) {
      if (ALLOWED_QUERY.has(key) && value != null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

/* ------------------------------------------------------------------ *
 * Handler
 * ------------------------------------------------------------------ */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Chỉ hỗ trợ POST.' });
  }

  try {
    const staff = await requireStaff(req);
    const path = String(req.body?.path || '');

    // 'sent-log' xử lý ngay tại đây, không chuyển tiếp sang Render —
    // nhật ký nằm ở Supabase, zalo-service không biết gì về nó.
    if (path === 'sent-log') {
      const ref = parseLogRef(req.body?.payload);
      if (!ref) {
        return res
          .status(400)
          .json({ ok: false, error: 'Cần kind, classId và periodKey hợp lệ.' });
      }

      const students = await readSentLog(ref);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true, students });
    }

    if (!BACKEND_URL || !BACKEND_API_KEY) {
      const missing = [
        !BACKEND_URL && 'ZALO_BACKEND_URL',
        !BACKEND_API_KEY && 'ZALO_BACKEND_API_KEY',
      ]
        .filter(Boolean)
        .join(', ');
      return res.status(500).json({ ok: false, error: `Thiếu ${missing} trên Vercel.` });
    }

    const upstream = resolveUpstream(path);

    if (upstream.adminOnly && !CAN_ADMIN.includes(staff.role)) {
      return res
        .status(403)
        .json({ ok: false, error: 'Chỉ quản trị viên được kết nối lại tài khoản Zalo.' });
    }

    const payload = req.body?.payload;
    if (upstream.method === 'POST') validatePayload(upstream.path, payload);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const upstreamResponse = await fetch(buildUrl(upstream.path, req.body?.query), {
        method: upstream.method,
        headers: {
          'x-api-key': BACKEND_API_KEY,
          'Content-Type': 'application/json',
        },
        ...(upstream.method === 'POST' ? { body: JSON.stringify(payload ?? {}) } : {}),
        signal: controller.signal,
      });

      const text = await upstreamResponse.text();

      if (['send', 'send-bulk', 'send-file'].includes(upstream.path)) {
        console.log(
          `[api/zalo] ${staff.role} ${staff.uid} → ${upstream.path} (${upstreamResponse.status})`,
        );

        // Chỉ ghi nhật ký khi backend đã nhận vào hàng đợi.
        if (upstreamResponse.ok) {
          const ref = parseLogRef(req.body?.log);

          if (ref) {
            let jobId = '';
            try {
              jobId = String(JSON.parse(text)?.jobId || '');
            } catch {
              /* không có jobId thì vẫn ghi log */
            }

            // Ghi log hỏng không được làm hỏng việc gửi — tin đã đi rồi.
            try {
              await writeSentLog(ref, staff, jobId);
            } catch (logError) {
              console.error('[api/zalo] Không ghi được nhật ký:', logError);
            }
          }
        }
      }

      res.status(upstreamResponse.status);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(text);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      return res.status(504).json({ ok: false, error: 'Dịch vụ Zalo phản hồi quá chậm.' });
    }
    return sendError(res, error, 'Không gọi được dịch vụ Zalo.');
  }
}
