import { supabase } from '@/lib/supabase';

export interface SupabaseUploadResult {
  fileUrl: string;     
  filePath: string;    
  fileName: string;
  sizeBytes: number;
}

const base64ToBlob = (base64: string, contentType: string = 'application/pdf'): Blob => {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: contentType });
};

// ─── XỬ LÝ UPLOAD PDF ──────────────────────────────────────────────
export const uploadPdfToSupabase = async (
  base64Data: string,
  fileName: string
): Promise<SupabaseUploadResult> => {
  console.log(`📤 Đang tải "${fileName}" lên Supabase...`);
  
  const fileBlob = base64ToBlob(base64Data);
  const uniqueFilePath = `pdfs/${Date.now()}_${fileName.replace(/\s+/g, '_')}`;

  const { error } = await supabase.storage
    .from('exams_pdf') 
    .upload(uniqueFilePath, fileBlob, {
      contentType: 'application/pdf',
      upsert: false
    });

  if (error) {
    console.error('Lỗi Supabase:', error);
    throw new Error('Lỗi khi tải lên Supabase: ' + error.message);
  }

  const { data: publicUrlData } = supabase.storage
    .from('exams_pdf')
    .getPublicUrl(uniqueFilePath);

  console.log(`✅ Tải thành công: ${publicUrlData.publicUrl}`);

  return {
    fileUrl: publicUrlData.publicUrl,
    filePath: uniqueFilePath,
    fileName: fileName,
    sizeBytes: fileBlob.size
  };
};

export const deletePdfFromSupabase = async (filePath: string): Promise<void> => {
  if (!filePath) return;
  try {
    await supabase.storage.from('exams_pdf').remove([filePath]);
    console.log(`🗑️ Đã xóa file trên Supabase: ${filePath}`);
  } catch (err) {
    console.warn('Lỗi khi xóa file Supabase:', err);
  }
};

// ─── XỬ LÝ ĐỀ THI LATEX (TÁCH ẢNH TIKZ BASE64) ────────────────────

// Hàm bóc tách Base64 ra khỏi JSON để tối ưu dung lượng DB
const extractImagesFromExam = (examData: any) => {
  const imageDocuments: any[] = [];

  const strippedQuestions = (examData.questions || []).map((q: any) => {
    if (!q.images?.length) return q;
    return {
      ...q,
      images: q.images.map((img: any, idx: number) => {
        if (img.base64) {
          imageDocuments.push({
            question_number: q.number,
            image_index:     idx,
            image_id:        img.id || `img_${q.number}_${idx}`,
            filename:        img.filename || '',
            content_type:    img.contentType || 'image/png',
            base64:          img.base64,
          });
          // Trả về bản sao không có chuỗi base64 khổng lồ
          return { id: img.id || `img_${q.number}_${idx}`, filename: img.filename, contentType: img.contentType };
        }
        return img;
      }),
    };
  });

  const qMap = new Map<number, any>(strippedQuestions.map((q: any) => [q.number, q]));
  const strippedSections = (examData.sections || []).map((s: any) => ({
    ...s,
    questions: (s.questions || []).map((q: any) => qMap.get(q.number) || q),
  }));

  return {
    strippedData: { ...examData, questions: strippedQuestions, sections: strippedSections },
    imageDocuments,
  };
};

export const createExam = async (
  examData: any
): Promise<string> => {
  // 1. Tách ảnh ra khỏi data
  const { strippedData, imageDocuments } = extractImagesFromExam(examData);

  // 2. Lưu vào bảng exams (cấu trúc data được gom vào cột jsonb `data` theo chuẩn dự án của thầy)
  const { data, error } = await supabase
    .from('exams')
    .insert({
      title:         strippedData.title,
      data:          strippedData, // ✅ Gộp toàn bộ vào cột data
      created_by:    strippedData.createdBy,
    })
    .select('id').single();
    
  if (error) throw error;
  const examId: string = data.id;

  // 3. Đẩy mảng Base64 vào bảng exam_images để gọi riêng
  if (imageDocuments.length > 0) {
    const rows = imageDocuments.map((img) => ({ ...img, exam_id: examId }));
    const { error: imgErr } = await supabase.from('exam_images').insert(rows);
    if (imgErr) console.error('Lỗi lưu ảnh:', imgErr);
  }
  
  return examId;
};
