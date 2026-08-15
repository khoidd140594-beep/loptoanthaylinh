// @ts-nocheck
/**
 * TSAPreviewModal.tsx
 * Modal xem trước & chỉnh sửa đề thi TSA – 6 dạng câu hỏi
 * Tương đương phần preview trong ExamMgmt nhưng dành riêng cho cấu trúc TSA
 */

import React, { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import MathText from './MathText'
import { TSA_SECTION_COLORS } from '../services/tsaScoringService'
import type {
  TSAExamData, TSAQuestion, TSASectionId,
  TSAChoiceOption, TSATFStatement, TSADragItem, TSABlank, TSAMatchPair
} from '../services/tsaParserService'
import {
  X as XIcon, Edit2, Save, XCircle, ChevronDown, ChevronUp,
  Plus, Trash2, Check, ToggleLeft, List, CheckSquare,
  MoveHorizontal, Type, Link2, BookOpen
} from 'lucide-react'
import toast from 'react-hot-toast'

// ─────────────────────────────────────────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────────────────────────────────────────
interface TSAPreviewModalProps {
  examData: TSAExamData
  examId: string
  examTitle: string
  onClose: () => void
  onSaved?: (updated: TSAExamData) => void
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION ICON MAP
// ─────────────────────────────────────────────────────────────────────────────
const SECTION_ICON = {
  I: <List className="w-3.5 h-3.5" />,
  II: <ToggleLeft className="w-3.5 h-3.5" />,
  III: <CheckSquare className="w-3.5 h-3.5" />,
  IV: <MoveHorizontal className="w-3.5 h-3.5" />,
  V: <Type className="w-3.5 h-3.5" />,
  VI: <Link2 className="w-3.5 h-3.5" />,
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function TSAPreviewModal({
  examData: initialData, examId, examTitle, onClose, onSaved
}: TSAPreviewModalProps) {
  const [examData, setExamData] = useState<TSAExamData>(initialData)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<TSAQuestion | null>(null)
  const [saving, setSaving] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<TSASectionId>>(new Set())

  const toggleCollapse = (id: TSASectionId) =>
    setCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const startEdit = useCallback((q: TSAQuestion) => {
    setEditingId(q.id)
    setEditForm(JSON.parse(JSON.stringify(q)))
  }, [])

  const cancelEdit = () => { setEditingId(null); setEditForm(null) }

  const saveEdit = async () => {
    if (!editForm) return
    setSaving(true)
    const tid = toast.loading('Đang lưu...')
    try {
      // Rebuild examData với câu đã sửa
      const updatedSections = examData.sections.map(sec => ({
        ...sec,
        questions: sec.questions.map(q => q.id === editForm.id ? editForm : q)
      }))
      const updatedData: TSAExamData = {
        ...examData,
        sections: updatedSections,
        questions: updatedSections.flatMap(s => s.questions),
      }
      const { error } = await supabase
        .from('exams').update({ data: updatedData }).eq('id', examId)
      if (error) throw error

      setExamData(updatedData)
      setEditingId(null)
      setEditForm(null)
      onSaved?.(updatedData)
      toast.success('Đã lưu câu hỏi!', { id: tid })
    } catch (e: any) {
      toast.error('Lỗi lưu: ' + e.message, { id: tid })
    } finally {
      setSaving(false)
    }
  }

  const totalQ = examData.sections.reduce((n, s) => n + s.questions.length, 0)

  const content = (
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center p-2 md:p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gray-50 rounded-2xl w-full max-w-5xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-orange-600 to-amber-500 text-white px-5 py-4 flex items-start justify-between gap-4 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="w-5 h-5 opacity-80" />
              <h2 className="text-lg font-black">{examTitle}</h2>
              <span className="bg-white/20 border border-white/30 text-white text-[10px] font-black px-2 py-0.5 rounded-full">TSA</span>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-white/80">
              <span>{examData.sections.length} phần</span>
              <span>·</span>
              <span>{totalQ} câu</span>
              {examData.sections.map(sec => {
                const c = TSA_SECTION_COLORS[sec.id as TSASectionId]
                return (
                  <span key={sec.id} className="flex items-center gap-1 text-xs bg-white/15 px-2 py-0.5 rounded-full">
                    <span className="font-black">{sec.id}.</span> {sec.questions.length}
                  </span>
                )
              })}
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0 transition">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">
          {examData.sections.map(section => {
            const colors = TSA_SECTION_COLORS[section.id as TSASectionId]
            const isCollapsed = collapsed.has(section.id)
            return (
              <div key={section.id}>
                {/* Section header */}
                <button
                  onClick={() => toggleCollapse(section.id)}
                  className={`w-full bg-gradient-to-r ${colors.gradient} text-white flex items-center justify-between px-5 py-3 border-b-4 ${colors.border} sticky top-0 z-10`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center font-black text-sm">{section.id}</span>
                    <div className="text-left">
                      <div className="font-black text-sm">{section.name}</div>
                      <div className="text-white/70 text-xs">{section.questions.length} câu · {section.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs font-bold">{section.questions.length} câu</span>
                    {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  </div>
                </button>

                {/* Questions */}
                {!isCollapsed && (
                  <div className="bg-white divide-y divide-gray-100">
                    {section.questions.map(q => {
                      const isEditing = editingId === q.id
                      return (
                        <TSAQuestionCard
                          key={q.id}
                          question={q}
                          colors={colors}
                          isEditing={isEditing}
                          editForm={isEditing ? editForm : null}
                          setEditForm={setEditForm}
                          onEdit={() => startEdit(q)}
                          onSave={saveEdit}
                          onCancel={cancelEdit}
                          saving={saving}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}

// ─────────────────────────────────────────────────────────────────────────────
// QUESTION CARD
// ─────────────────────────────────────────────────────────────────────────────
function TSAQuestionCard({ question, colors, isEditing, editForm, setEditForm, onEdit, onSave, onCancel, saving }) {
  const TYPE_LABEL = {
    tsa_multiple_choice: 'Trắc nghiệm',
    tsa_true_false: 'Đúng / Sai',
    tsa_multiple_select: 'Chọn nhiều',
    tsa_drag_drop: 'Kéo thả',
    tsa_fill_blank: 'Điền khuyết',
    tsa_matching: 'Ghép đôi',
  }

  return (
    <div className="hover:bg-gray-50/60 transition-colors">
      {/* Card header */}
      <div className={`flex items-center gap-3 px-5 py-3 border-b border-gray-100 ${colors.light}`}>
        <span className={`px-2.5 py-1 rounded-lg text-xs font-black text-white ${colors.dot.replace('bg-', 'bg-')}`}
          style={{ background: undefined }}
        >
          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-white font-black text-sm ${colors.dot}`}>
            {question.number}
          </span>
        </span>
        <span className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md border ${colors.badge}`}>
          {question.type === 'tsa_multiple_choice' && <List className="w-3 h-3" />}
          {question.type === 'tsa_true_false' && <ToggleLeft className="w-3 h-3" />}
          {question.type === 'tsa_multiple_select' && <CheckSquare className="w-3 h-3" />}
          {question.type === 'tsa_drag_drop' && <MoveHorizontal className="w-3 h-3" />}
          {question.type === 'tsa_fill_blank' && <Type className="w-3 h-3" />}
          {question.type === 'tsa_matching' && <Link2 className="w-3 h-3" />}
          {TYPE_LABEL[question.type]}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {!isEditing ? (
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 text-gray-600 hover:bg-white hover:border-orange-300 hover:text-orange-700 transition-all"
            >
              <Edit2 className="w-3.5 h-3.5" /> Sửa
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={onSave} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-all"
              >
                <Save className="w-3.5 h-3.5" /> {saving ? 'Lưu...' : 'Lưu'}
              </button>
              <button
                onClick={onCancel} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-all"
              >
                <XCircle className="w-3.5 h-3.5" /> Hủy
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Question body */}
      <div className="px-5 py-4 space-y-4">
        {/* Question text */}
        {!isEditing ? (
          <MathText html={question.text} className="text-gray-800 text-sm leading-relaxed" block />
        ) : (
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1.5">Nội dung câu hỏi (HTML)</label>
            <textarea
              value={editForm?.text ?? ''}
              onChange={e => setEditForm((f: TSAQuestion) => ({ ...f, text: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl font-mono text-xs outline-none focus:border-orange-400 transition resize-y"
            />
          </div>
        )}

        {/* Type-specific display/edit */}
        {question.type === 'tsa_multiple_choice' && (
          <MCPreview question={question} isEditing={isEditing} editForm={editForm} setEditForm={setEditForm} />
        )}
        {question.type === 'tsa_true_false' && (
          <TFPreview question={question} isEditing={isEditing} editForm={editForm} setEditForm={setEditForm} />
        )}
        {question.type === 'tsa_multiple_select' && (
          <MSPreview question={question} isEditing={isEditing} editForm={editForm} setEditForm={setEditForm} />
        )}
        {question.type === 'tsa_drag_drop' && (
          <DDPreview question={question} isEditing={isEditing} editForm={editForm} setEditForm={setEditForm} />
        )}
        {question.type === 'tsa_fill_blank' && (
          <FBPreview question={question} isEditing={isEditing} editForm={editForm} setEditForm={setEditForm} />
        )}
        {question.type === 'tsa_matching' && (
          <MatchPreview question={question} isEditing={isEditing} editForm={editForm} setEditForm={setEditForm} />
        )}

        {/* Solution */}
        {question.solution && !isEditing && (
          <details className="group">
            <summary className="text-xs font-bold text-blue-600 cursor-pointer hover:text-blue-800 list-none flex items-center gap-1.5">
              <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" /> 💡 Xem lời giải
            </summary>
            <div className="mt-2 p-3 bg-blue-50 border-l-4 border-blue-400 rounded-r-xl">
              <MathText html={question.solution} className="text-sm text-gray-700" block />
            </div>
          </details>
        )}
        {isEditing && (
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1.5">Lời giải (HTML)</label>
            <textarea
              value={editForm?.solution ?? ''}
              onChange={e => setEditForm((f: TSAQuestion) => ({ ...f, solution: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl font-mono text-xs outline-none focus:border-orange-400 transition resize-y"
              placeholder="Nhập lời giải..."
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// I. TRẮC NGHIỆM NHIỀU LỰA CHỌN
// ─────────────────────────────────────────────────────────────────────────────
function MCPreview({ question, isEditing, editForm, setEditForm }) {
  const opts: TSAChoiceOption[] = isEditing ? (editForm?.choiceOptions ?? []) : (question.choiceOptions ?? [])

  if (!isEditing) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {opts.map((opt, idx) => (
          <div key={opt.letter} className={`flex items-start gap-2.5 p-3 rounded-xl border-2 ${opt.isCorrect ? 'border-blue-400 bg-blue-50' : 'border-gray-100 bg-gray-50'}`}>
            <span className={`w-6 h-6 rounded-full text-xs font-black text-white flex items-center justify-center shrink-0 ${opt.isCorrect ? 'bg-blue-500' : 'bg-gray-300'}`}>
              {String.fromCharCode(65 + idx)}
            </span>
            <MathText html={opt.text} className={`flex-1 text-sm pt-0.5 ${opt.isCorrect ? 'text-blue-800 font-semibold' : 'text-gray-700'}`} />
            {opt.isCorrect && <Check className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-bold text-gray-500 block">Đáp án (nhấn chữ cái để đánh dấu đúng)</label>
      {opts.map((opt, idx) => (
        <div key={opt.letter} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditForm((f: any) => ({
              ...f,
              choiceOptions: f.choiceOptions.map((o: TSAChoiceOption, i: number) => ({ ...o, isCorrect: i === idx }))
            }))}
            className={`w-8 h-8 rounded-full font-black text-xs shrink-0 transition-all ${opt.isCorrect ? 'bg-blue-600 text-white ring-2 ring-blue-400' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {String.fromCharCode(65 + idx)}
          </button>
          <input
            type="text"
            value={opt.text}
            onChange={e => setEditForm((f: any) => ({
              ...f,
              choiceOptions: f.choiceOptions.map((o: TSAChoiceOption, i: number) => i === idx ? { ...o, text: e.target.value } : o)
            }))}
            className="flex-1 px-3 py-1.5 border-2 border-gray-200 rounded-xl text-sm outline-none focus:border-orange-400 transition"
            placeholder={`Đáp án ${String.fromCharCode(65 + idx)}`}
          />
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// II. ĐÚNG / SAI
// ─────────────────────────────────────────────────────────────────────────────
function TFPreview({ question, isEditing, editForm, setEditForm }) {
  const stmts: TSATFStatement[] = isEditing ? (editForm?.tfStatements ?? []) : (question.tfStatements ?? [])

  if (!isEditing) {
    return (
      <div className="rounded-xl border-2 border-teal-200 overflow-hidden">
        <div className="grid grid-cols-[1fr_70px_70px] bg-teal-600 text-white text-xs font-black">
          <div className="px-4 py-2.5">Mệnh đề</div>
          <div className="py-2.5 text-center border-l border-teal-500">Đúng</div>
          <div className="py-2.5 text-center border-l border-teal-500">Sai</div>
        </div>
        {stmts.map((stmt, idx) => (
          <div key={stmt.label} className={`grid grid-cols-[1fr_70px_70px] border-t border-teal-100 ${stmt.isTrue ? 'bg-emerald-50/50' : 'bg-red-50/30'}`}>
            <div className="px-4 py-3 flex gap-2 items-start">
              <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-[10px] font-black flex items-center justify-center shrink-0">{String.fromCharCode(97 + idx)}</span>
              <MathText html={stmt.text} className="flex-1 text-sm text-gray-800" />
            </div>
            <div className={`text-center border-l border-teal-100 flex items-center justify-center ${stmt.isTrue ? 'bg-emerald-500 text-white' : ''}`}>
              {stmt.isTrue && <Check className="w-5 h-5 stroke-[3]" />}
            </div>
            <div className={`text-center border-l border-teal-100 flex items-center justify-center ${!stmt.isTrue ? 'bg-red-500 text-white' : ''}`}>
              {!stmt.isTrue && <XIcon className="w-5 h-5 stroke-[3]" />}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-bold text-gray-500 block">Mệnh đề (nhấn nút để đổi Đúng/Sai)</label>
      {stmts.map((stmt, idx) => (
        <div key={stmt.label} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditForm((f: any) => ({
              ...f,
              tfStatements: f.tfStatements.map((s: TSATFStatement, i: number) => i === idx ? { ...s, isTrue: !s.isTrue } : s)
            }))}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-black shrink-0 transition-all ${stmt.isTrue ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white'}`}
          >
            {String.fromCharCode(97 + idx).toUpperCase()}: {stmt.isTrue ? 'ĐÚNG' : 'SAI'}
          </button>
          <input
            type="text" value={stmt.text}
            onChange={e => setEditForm((f: any) => ({
              ...f,
              tfStatements: f.tfStatements.map((s: TSATFStatement, i: number) => i === idx ? { ...s, text: e.target.value } : s)
            }))}
            className="flex-1 px-3 py-1.5 border-2 border-gray-200 rounded-xl text-sm outline-none focus:border-orange-400 transition"
            placeholder={`Mệnh đề ${String.fromCharCode(97 + idx)}`}
          />
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// III. CHỌN NHIỀU ĐÁP ÁN ĐÚNG
// ─────────────────────────────────────────────────────────────────────────────
function MSPreview({ question, isEditing, editForm, setEditForm }) {
  const opts: TSAChoiceOption[] = isEditing ? (editForm?.choiceOptions ?? []) : (question.choiceOptions ?? [])
  const correctLetters = opts.filter(o => o.isCorrect).map((o, i) => String.fromCharCode(65 + opts.indexOf(o))).join(', ')

  if (!isEditing) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-violet-600 font-bold">Đáp án đúng: {correctLetters || '—'}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {opts.map((opt, idx) => (
            <div key={opt.letter} className={`flex items-center gap-2.5 p-3 rounded-xl border-2 ${opt.isCorrect ? 'border-violet-400 bg-violet-50' : 'border-gray-100 bg-gray-50'}`}>
              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${opt.isCorrect ? 'bg-violet-500 border-violet-500' : 'border-gray-300'}`}>
                {opt.isCorrect && <Check className="w-3 h-3 text-white stroke-[3]" />}
              </div>
              <span className={`w-6 h-6 rounded-full text-xs font-black text-white flex items-center justify-center shrink-0 ${opt.isCorrect ? 'bg-violet-500' : 'bg-gray-300'}`}>
                {String.fromCharCode(65 + idx)}
              </span>
              <MathText html={opt.text} className="flex-1 text-sm text-gray-700" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-bold text-gray-500 block">Đáp án (click checkbox để đánh dấu đúng, có thể chọn nhiều)</label>
      {opts.map((opt, idx) => (
        <div key={opt.letter} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditForm((f: any) => ({
              ...f,
              choiceOptions: f.choiceOptions.map((o: TSAChoiceOption, i: number) => i === idx ? { ...o, isCorrect: !o.isCorrect } : o)
            }))}
            className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center shrink-0 font-black text-xs transition-all ${opt.isCorrect ? 'bg-violet-500 border-violet-500 text-white' : 'border-gray-300 text-gray-500 hover:border-violet-400'}`}
          >
            {opt.isCorrect ? <Check className="w-4 h-4 stroke-[3]" /> : String.fromCharCode(65 + idx)}
          </button>
          <input
            type="text" value={opt.text}
            onChange={e => setEditForm((f: any) => ({
              ...f,
              choiceOptions: f.choiceOptions.map((o: TSAChoiceOption, i: number) => i === idx ? { ...o, text: e.target.value } : o)
            }))}
            className="flex-1 px-3 py-1.5 border-2 border-gray-200 rounded-xl text-sm outline-none focus:border-orange-400 transition"
          />
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// IV. KÉO THẢ
// ─────────────────────────────────────────────────────────────────────────────
function DDPreview({ question, isEditing, editForm, setEditForm }) {
  const bank: TSADragItem[] = isEditing ? (editForm?.dragBank ?? []) : (question.dragBank ?? [])

  if (!isEditing) {
    const correct = bank.filter(i => i.correctSlot !== null).sort((a, b) => (a.correctSlot ?? 0) - (b.correctSlot ?? 0))
    const distractors = bank.filter(i => i.correctSlot === null)
    return (
      <div className="space-y-3">
        <div>
          <p className="text-xs font-bold text-orange-600 mb-2">✅ Đáp án đúng ({correct.length} slot):</p>
          <div className="flex flex-wrap gap-2">
            {correct.map(item => (
              <div key={item.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 border-2 border-orange-300 rounded-xl text-sm font-bold text-orange-800">
                <span className="text-[10px] bg-orange-200 text-orange-700 px-1.5 py-0.5 rounded-full font-black">Ô {item.correctSlot}</span>
                <MathText html={item.text} className="inline" />
              </div>
            ))}
          </div>
        </div>
        {distractors.length > 0 && (
          <div>
            <p className="text-xs font-bold text-gray-400 mb-2">🎭 Mồi nhử ({distractors.length}):</p>
            <div className="flex flex-wrap gap-2">
              {distractors.map(item => (
                <span key={item.id} className="px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-600">
                  <MathText html={item.text} className="inline" />
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <label className="text-xs font-bold text-gray-500 block">Bank items (slot = số ô → điền; 0 = mồi nhử)</label>
      {bank.map((item, idx) => (
        <div key={item.id} className="flex items-center gap-2">
          <input
            type="number" min={0}
            value={item.correctSlot ?? 0}
            onChange={e => {
              const v = parseInt(e.target.value) || 0
              setEditForm((f: any) => ({
                ...f,
                dragBank: f.dragBank.map((b: TSADragItem, i: number) => i === idx ? { ...b, correctSlot: v === 0 ? null : v } : b)
              }))
            }}
            className="w-16 px-2 py-1.5 border-2 border-gray-200 rounded-lg text-center font-bold text-sm outline-none focus:border-orange-400"
          />
          <input
            type="text" value={item.text}
            onChange={e => setEditForm((f: any) => ({
              ...f,
              dragBank: f.dragBank.map((b: TSADragItem, i: number) => i === idx ? { ...b, text: e.target.value } : b)
            }))}
            className="flex-1 px-3 py-1.5 border-2 border-gray-200 rounded-xl text-sm outline-none focus:border-orange-400 transition"
            placeholder="Nội dung item"
          />
          <button
            type="button"
            onClick={() => setEditForm((f: any) => ({ ...f, dragBank: f.dragBank.filter((_: any, i: number) => i !== idx) }))}
            className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setEditForm((f: any) => ({
          ...f,
          dragBank: [...f.dragBank, { id: `item_${Date.now()}`, text: '', correctSlot: null }]
        }))}
        className="flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:text-orange-800 transition"
      >
        <Plus className="w-3.5 h-3.5" /> Thêm item
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// V. ĐIỀN KHUYẾT
// ─────────────────────────────────────────────────────────────────────────────
function FBPreview({ question, isEditing, editForm, setEditForm }) {
  const blanks: TSABlank[] = isEditing ? (editForm?.blanks ?? []) : (question.blanks ?? [])

  if (!isEditing) {
    return (
      <div className="flex flex-wrap gap-3">
        {blanks.map(blank => (
          <div key={blank.index} className="flex items-center gap-2 px-4 py-2 bg-rose-50 border-2 border-rose-300 rounded-xl">
            <span className="w-6 h-6 rounded-full bg-rose-500 text-white text-xs font-black flex items-center justify-center">{blank.index}</span>
            <span className="font-bold text-rose-800 text-sm">{blank.answer || <em className="text-gray-400 font-normal">Chưa có đáp án</em>}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-bold text-gray-500 block">Đáp án từng ô trống</label>
      {blanks.map((blank, idx) => (
        <div key={blank.index} className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-rose-100 text-rose-700 text-xs font-black flex items-center justify-center shrink-0">{blank.index}</span>
          <input
            type="text" value={blank.answer}
            onChange={e => setEditForm((f: any) => ({
              ...f,
              blanks: f.blanks.map((b: TSABlank, i: number) => i === idx ? { ...b, answer: e.target.value } : b)
            }))}
            className="flex-1 px-3 py-1.5 border-2 border-gray-200 rounded-xl text-sm outline-none focus:border-orange-400 transition font-bold"
            placeholder={`Đáp án ô ${blank.index}`}
          />
          <button
            type="button"
            onClick={() => setEditForm((f: any) => ({ ...f, blanks: f.blanks.filter((_: any, i: number) => i !== idx) }))}
            className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setEditForm((f: any) => ({
          ...f,
          blanks: [...f.blanks, { index: f.blanks.length + 1, answer: '' }]
        }))}
        className="flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:text-rose-800 transition"
      >
        <Plus className="w-3.5 h-3.5" /> Thêm ô trống
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// VI. GHÉP ĐÔI
// ─────────────────────────────────────────────────────────────────────────────
function MatchPreview({ question, isEditing, editForm, setEditForm }) {
  const left = isEditing ? (editForm?.matchLeft ?? []) : (question.matchLeft ?? [])
  const right = isEditing ? (editForm?.matchRight ?? []) : (question.matchRight ?? [])
  const correct: TSAMatchPair[] = isEditing ? (editForm?.matchCorrect ?? []) : (question.matchCorrect ?? [])

  const getCorrectLetter = (num: number) => correct.find(p => p.leftNum === num)?.rightLetter

  if (!isEditing) {
    return (
      <div className="rounded-xl border-2 border-cyan-200 overflow-hidden">
        {/* Right column */}
        <div className="grid grid-cols-2 divide-x divide-cyan-200 bg-cyan-50 p-3 gap-4">
          <div>
            <p className="text-[10px] font-black text-cyan-600 uppercase mb-2">Cột trái</p>
            <div className="space-y-1.5">
              {left.map(item => (
                <div key={item.num} className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-600 text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">{item.num}</span>
                  <MathText html={item.text} className="text-xs text-gray-700" />
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-black text-cyan-600 uppercase mb-2">Cột phải</p>
            <div className="space-y-1.5">
              {right.map(item => (
                <div key={item.letter} className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-400 text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">{item.letter}</span>
                  <MathText html={item.text} className="text-xs text-gray-700" />
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Correct pairs */}
        <div className="bg-white border-t-2 border-cyan-200 p-3">
          <p className="text-[10px] font-black text-cyan-600 uppercase mb-2">✅ Đáp án ghép</p>
          <div className="flex flex-wrap gap-2">
            {left.map(item => {
              const letter = getCorrectLetter(item.num)
              return (
                <div key={item.num} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border-2 ${letter ? 'border-cyan-300 bg-cyan-50 text-cyan-800' : 'border-gray-200 bg-gray-50 text-gray-400'}`}>
                  <span className="font-black">{item.num}</span>
                  <span className="text-gray-400">→</span>
                  <span className="font-black">{letter ?? '?'}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  const setCorrectPair = (leftNum: number, rightLetter: string) => {
    setEditForm((f: any) => {
      const existing = f.matchCorrect.find((p: TSAMatchPair) => p.leftNum === leftNum)
      let updated: TSAMatchPair[]
      if (existing) {
        updated = f.matchCorrect.map((p: TSAMatchPair) =>
          p.leftNum === leftNum ? { ...p, rightLetter } : p
        )
      } else {
        updated = [...f.matchCorrect, { leftNum, rightLetter }]
      }
      return { ...f, matchCorrect: updated }
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Left column edit */}
        <div>
          <label className="text-xs font-bold text-gray-500 block mb-2">Cột trái (số)</label>
          <div className="space-y-1.5">
            {left.map((item, idx) => (
              <div key={item.num} className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-cyan-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">{item.num}</span>
                <input
                  type="text" value={item.text}
                  onChange={e => setEditForm((f: any) => ({
                    ...f,
                    matchLeft: f.matchLeft.map((l: any, i: number) => i === idx ? { ...l, text: e.target.value } : l)
                  }))}
                  className="flex-1 px-2 py-1 border border-gray-200 rounded-lg text-xs outline-none focus:border-cyan-400"
                />
              </div>
            ))}
          </div>
        </div>
        {/* Right column edit */}
        <div>
          <label className="text-xs font-bold text-gray-500 block mb-2">Cột phải (chữ cái)</label>
          <div className="space-y-1.5">
            {right.map((item, idx) => (
              <div key={item.letter} className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-cyan-400 text-white text-[10px] font-black flex items-center justify-center shrink-0">{item.letter}</span>
                <input
                  type="text" value={item.text}
                  onChange={e => setEditForm((f: any) => ({
                    ...f,
                    matchRight: f.matchRight.map((r: any, i: number) => i === idx ? { ...r, text: e.target.value } : r)
                  }))}
                  className="flex-1 px-2 py-1 border border-gray-200 rounded-lg text-xs outline-none focus:border-cyan-400"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Correct pairs */}
      <div>
        <label className="text-xs font-bold text-gray-500 block mb-2">Đáp án ghép (chọn chữ cái phải cho từng số trái)</label>
        <div className="flex flex-wrap gap-3">
          {left.map(item => {
            const current = getCorrectLetter(item.num) ?? ''
            return (
              <div key={item.num} className="flex items-center gap-1.5">
                <span className="w-6 h-6 rounded-full bg-cyan-600 text-white text-[10px] font-black flex items-center justify-center">{item.num}</span>
                <span className="text-gray-400 text-xs">→</span>
                <select
                  value={current}
                  onChange={e => setCorrectPair(item.num, e.target.value)}
                  className="px-2 py-1 border-2 border-cyan-200 rounded-lg text-xs font-bold outline-none focus:border-cyan-400"
                >
                  <option value="">—</option>
                  {right.map(r => (
                    <option key={r.letter} value={r.letter}>{r.letter}</option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
