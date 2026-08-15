import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns'
import { vi } from 'date-fns/locale'
import type { Role } from '@/types'

export const fmt = (date: string | Date | null | undefined, pattern = 'dd/MM/yyyy'): string =>
  date ? format(new Date(date), pattern, { locale: vi }) : '—'

export const fmtVND = (amount: number | null | undefined): string =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
    .format(amount ?? 0)

export const fmtVNDShort = (amount: number | null | undefined): string =>
  new Intl.NumberFormat('vi-VN').format(amount ?? 0) + ' đ'

/** Count working/class days in a month given days-of-week (0=Sun…6=Sat) */
export function countDaysInMonth(year: number, month: number, weekdays: number[] = []): number {
  const days = eachDayOfInterval({
    start: startOfMonth(new Date(year, month - 1)),
    end:   endOfMonth(new Date(year, month - 1)),
  })
  return days.filter(d => weekdays.includes(getDay(d))).length
}

/** Derive planned sessions from schedule string like "2,5" (Thu, Sun) */
export function parseSchedule(scheduleStr: string | null | undefined): number[] {
  if (!scheduleStr) return []
  return scheduleStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
}

interface CalcTuitionParams {
  feePerSession: number
  plannedSessions: number
  absences: number
}

/** Calculate tuition for a student in a class for a given month */
export function calcTuition({ feePerSession, plannedSessions, absences }: CalcTuitionParams): number {
  const attended = Math.max(0, plannedSessions - absences)
  return attended * feePerSession
}

export const roleLabel: Record<Role, string> = {
  ADMIN:   'Quản trị',
  TEACHER: 'Giáo viên',
  TA:      'Trợ giảng',
}

export const statusColor: Record<string, string> = {
  active:   'bg-teal-100 text-teal-800',
  inactive: 'bg-gray-100 text-gray-600',
  paid:     'bg-green-100 text-green-800',
  debt:     'bg-red-100 text-red-700',
}

export function classInitials(name: string | null | undefined): string {
  return name?.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) ?? '??'
}

export function generateStudentCode(index: number): string {
  return `HS${String(index).padStart(3, '0')}`
}

export const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const
