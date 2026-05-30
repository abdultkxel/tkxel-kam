declare module 'lucide-react' {
  import type { ForwardRefExoticComponent, RefAttributes, SVGProps } from 'react'

  export type LucideIcon = ForwardRefExoticComponent<Omit<SVGProps<SVGSVGElement>, 'ref'> & RefAttributes<SVGSVGElement>>

  export const AlertCircle: LucideIcon
  export const AlertTriangle: LucideIcon
  export const Archive: LucideIcon
  export const ArrowDown: LucideIcon
  export const ArrowLeft: LucideIcon
  export const ArrowRight: LucideIcon
  export const ArrowUp: LucideIcon
  export const ArrowUpDown: LucideIcon
  export const BarChart3: LucideIcon
  export const Bell: LucideIcon
  export const BellRing: LucideIcon
  export const BookOpen: LucideIcon
  export const Bot: LucideIcon
  export const BriefcaseBusiness: LucideIcon
  export const Building2: LucideIcon
  export const Calculator: LucideIcon
  export const Calendar: LucideIcon
  export const CalendarCheck2: LucideIcon
  export const CalendarClock: LucideIcon
  export const CalendarDays: LucideIcon
  export const CalendarPlus: LucideIcon
  export const Check: LucideIcon
  export const CheckCircle2: LucideIcon
  export const ChevronDown: LucideIcon
  export const ChevronLeft: LucideIcon
  export const ChevronRight: LucideIcon
  export const ClipboardCheck: LucideIcon
  export const ClipboardList: LucideIcon
  export const Clock3: LucideIcon
  export const Download: LucideIcon
  export const Edit3: LucideIcon
  export const ExternalLink: LucideIcon
  export const Eye: LucideIcon
  export const EyeOff: LucideIcon
  export const FileCheck2: LucideIcon
  export const FileDown: LucideIcon
  export const FileSearch: LucideIcon
  export const FileText: LucideIcon
  export const Filter: LucideIcon
  export const FilterX: LucideIcon
  export const Flag: LucideIcon
  export const GitCompare: LucideIcon
  export const Globe2: LucideIcon
  export const GraduationCap: LucideIcon
  export const GripVertical: LucideIcon
  export const History: LucideIcon
  export const Home: LucideIcon
  export const Info: LucideIcon
  export const KeyRound: LucideIcon
  export const Layers3: LucideIcon
  export const LayoutGrid: LucideIcon
  export const LineChart: LucideIcon
  export const Link: LucideIcon
  export const Link2: LucideIcon
  export const ListChecks: LucideIcon
  export const Loader2: LucideIcon
  export const Lock: LucideIcon
  export const LogIn: LucideIcon
  export const LogOut: LucideIcon
  export const Mail: LucideIcon
  export const Menu: LucideIcon
  export const MessageCircle: LucideIcon
  export const Mic2: LucideIcon
  export const Minus: LucideIcon
  export const MoveHorizontal: LucideIcon
  export const Paperclip: LucideIcon
  export const PenLine: LucideIcon
  export const Pencil: LucideIcon
  export const PencilLine: LucideIcon
  export const PhoneCall: LucideIcon
  export const Play: LucideIcon
  export const PlaySquare: LucideIcon
  export const PlugZap: LucideIcon
  export const Plus: LucideIcon
  export const Printer: LucideIcon
  export const RefreshCcw: LucideIcon
  export const RefreshCw: LucideIcon
  export const RotateCcw: LucideIcon
  export const Save: LucideIcon
  export const Search: LucideIcon
  export const SearchCheck: LucideIcon
  export const Send: LucideIcon
  export const Settings: LucideIcon
  export const ShieldAlert: LucideIcon
  export const ShieldCheck: LucideIcon
  export const SlidersHorizontal: LucideIcon
  export const Sparkles: LucideIcon
  export const Table2: LucideIcon
  export const Tags: LucideIcon
  export const Target: LucideIcon
  export const ThumbsDown: LucideIcon
  export const ThumbsUp: LucideIcon
  export const Trash2: LucideIcon
  export const TrendingUp: LucideIcon
  export const Unplug: LucideIcon
  export const Upload: LucideIcon
  export const UploadCloud: LucideIcon
  export const UserRound: LucideIcon
  export const Users: LucideIcon
  export const UsersRound: LucideIcon
  export const X: LucideIcon
  export const XCircle: LucideIcon
}

declare module 'date-fns' {
  type DateInput = Date | number | string

  export function addDays(date: DateInput, amount: number): Date
  export function addMonths(date: DateInput, amount: number): Date
  export function differenceInCalendarDays(dateLeft: DateInput, dateRight: DateInput): number
  export function eachDayOfInterval(interval: { start: DateInput; end: DateInput }): Date[]
  export function endOfMonth(date: DateInput): Date
  export function format(date: DateInput, formatStr: string, options?: unknown): string
  export function formatDistanceToNow(date: DateInput, options?: unknown): string
  export function getDay(date: DateInput): number
  export function isAfter(date: DateInput, dateToCompare: DateInput): boolean
  export function isBefore(date: DateInput, dateToCompare: DateInput): boolean
  export function isSameDay(dateLeft: DateInput, dateRight: DateInput): boolean
  export function isSameMonth(dateLeft: DateInput, dateRight: DateInput): boolean
  export function parseISO(argument: string): Date
  export function startOfMonth(date: DateInput): Date
  export function subDays(date: DateInput, amount: number): Date
  export function subMinutes(date: DateInput, amount: number): Date
  export function subMonths(date: DateInput, amount: number): Date
}
