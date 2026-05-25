export type SummaryType = 'account_brief' | 'period_summary' | 'pre_meeting_brief' | 'risk_narrative'

export interface SummarySection {
  title: string
  body: string
  citations: string[]
}

export interface AISummary {
  id: string
  accountId: string
  type: SummaryType
  generatedAt: string
  sourceEntryIds: string[]
  sections: SummarySection[]
  disclaimer: string
  feedback?: 'up' | 'down'
  editedNoteId?: string
}
