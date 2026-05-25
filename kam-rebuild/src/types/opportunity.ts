export type Stage = 'Identified' | 'Qualified' | 'Proposal Sent' | 'Negotiation' | 'Won' | 'Lost'

export interface Opportunity {
  id: string
  accountId: string
  accountName: string
  name: string
  ownerId: string
  ownerName: string
  estimatedValue: number
  closeDate: string
  stage: Stage
}
