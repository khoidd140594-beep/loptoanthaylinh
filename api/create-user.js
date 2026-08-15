import { requireStaff, adminClient, sendError, CAN_ADMIN } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    // Trước đây route này không kiểm tra người gọi. Vì nó dùng SERVICE_ROLE_KEY
    // (bỏ qua RLS), bất kỳ ai biết địa chỉ đều tự tạo được tài khoản ADMIN.
    await requireStaff(req, { allow: CAN_ADMIN });

    const { email, password, name, role } = req.body || {};

    if (!email || !password || !name) {
      return res.status(400).json({ ok: false, error: 'Cần email, password và name.' });
    }
    // Chỉ nhận đúng những vai trò hệ thống biết, không nhận chuỗi tự do.
    if (!['ADMIN', 'TEACHER'].includes(role)) {
      return res.status(400).json({ ok: false, error: 'Vai trò không hợp lệ.' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ ok: false, error: 'Mật khẩu cần ít nhất 8 ký tự.' });
    }

    const supabaseAdmin = adminClient();

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Tự xác thực email để đăng nhập được ngay
      user_metadata: { name },
    });

    if (authError) throw Object.assign(new Error(authError.message), { statusCode: 400 });

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ name, role, active: true })
      .eq('id', authData.user.id);

    if (profileError) {
      // Tạo được tài khoản đăng nhập nhưng hồ sơ hỏng — dọn lại để không
      // để lại tài khoản "mồ côi" đăng nhập được mà không có vai trò.
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {});
      throw Object.assign(new Error(profileError.message), { statusCode: 400 });
    }

    return res.status(200).json({
      ok: true,
      // Không trả nguyên object user — nó chứa nhiều thông tin không cần thiết.
      user: { id: authData.user.id, email: authData.user.email, name, role },
    });
  } catch (error) {
    return sendError(res, error, 'Không tạo được người dùng.');
  }
}
