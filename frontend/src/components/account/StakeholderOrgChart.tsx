import { AlertTriangle, GitBranch, Linkedin, Network, RefreshCcw, UserRound } from 'lucide-react'
import { useMemo } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useStakeholderOrgChart } from '@/hooks/useStakeholders'
import type { StakeholderOrgChartNode } from '@/types/stakeholder'
import { cn } from '@/utils/cn'

type BadgeTone = 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'purple'

interface OrgTreeNode {
  node: StakeholderOrgChartNode
  children: OrgTreeNode[]
}

interface Props {
  accountId: string
  onSelectStakeholder: (stakeholderId: string) => void
}

const UNMAPPED_NODE_ID = 'unmapped_stakeholders'

export function StakeholderOrgChart({ accountId, onSelectStakeholder }: Props) {
  const { nodes, isLoading, error, refetch } = useStakeholderOrgChart(accountId)
  const tree = useMemo(() => buildTree(nodes), [nodes])
  const hasStakeholderNodes = nodes.some(node => !isGroupNode(node))

  return (
    <section className="tk-card overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-surface-border bg-surface-secondary p-4">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Org chart</p>
          <h3 className="mt-1 text-base font-semibold text-ink">Stakeholder hierarchy</h3>
        </div>
        <button className="tk-icon-button shrink-0" onClick={() => void refetch()} aria-label="Refresh stakeholder org chart">
          <RefreshCcw className="h-4 w-4" />
        </button>
      </div>
      <div className="p-4">
        {isLoading && !nodes.length ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : error ? (
          <EmptyState icon={AlertTriangle} heading="Stakeholder hierarchy could not be loaded" body={error.message} action={{ label: 'Retry', onClick: () => void refetch() }} className="rounded-lg border border-surface-border bg-surface-secondary" />
        ) : !hasStakeholderNodes ? (
          <EmptyState icon={Network} heading="No stakeholder hierarchy mapped yet." body="Add stakeholder reporting lines to build the account relationship map." className="rounded-lg border border-surface-border bg-surface-secondary" />
        ) : (
          <div className="overflow-x-auto">
            <ul role="tree" aria-label="Stakeholder hierarchy" className="min-w-[520px] space-y-3">
              {tree.map(item => <OrgTreeItem key={item.node.id} item={item} level={1} onSelectStakeholder={onSelectStakeholder} />)}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

function OrgTreeItem({ item, level, onSelectStakeholder }: { item: OrgTreeNode; level: number; onSelectStakeholder: (stakeholderId: string) => void }) {
  const { node, children } = item
  const group = isGroupNode(node)
  const unmapped = node.parentId === UNMAPPED_NODE_ID || node.id === UNMAPPED_NODE_ID
  const hasChildren = children.length > 0

  return (
    <li role="treeitem" aria-level={level} aria-expanded={hasChildren ? true : undefined} className="list-none">
      {group ? (
        <div className="rounded-lg border border-dashed border-brand-orange/30 bg-brand-orange/10 p-3">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-brand-orange" />
            <span className="text-sm font-semibold text-ink">{node.name}</span>
            <Badge tone="amber">Unmapped</Badge>
          </div>
          <p className="mt-1 text-xs text-ink-secondary">Stakeholders without a mapped reporting line.</p>
        </div>
      ) : (
        <div
          className={cn(
            'block w-full rounded-lg border bg-white p-3 text-left transition-colors hover:bg-surface-tertiary focus:outline-none focus:ring-2 focus:ring-brand-blue/30',
            unmapped ? 'border-dashed border-brand-orange/40' : 'border-surface-border',
          )}
        >
          <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => onSelectStakeholder(node.id)}>
            <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', unmapped ? 'bg-brand-orange/10 text-brand-orange' : 'bg-blue-tint-20 text-brand-blue')}>
              <UserRound className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">{node.name}</span>
              <span className="mt-1 block text-xs text-ink-secondary">{node.title || 'No title recorded'}</span>
              <span className="mt-2 flex flex-wrap gap-1.5">
                {node.role ? <Badge tone={roleTone(node.role)}>{titleize(node.role)}</Badge> : null}
                {node.influenceLevel ? <Badge tone={influenceTone(node.influenceLevel)}>{titleize(node.influenceLevel)}</Badge> : null}
                {node.sentiment ? <Badge tone={sentimentTone(node.sentiment)}>{titleize(node.sentiment)}</Badge> : null}
                {node.relationshipStrength ? <Badge tone={relationshipTone(node.relationshipStrength)}>{titleize(node.relationshipStrength)}</Badge> : null}
                {unmapped ? <Badge tone="amber">Unmapped</Badge> : null}
                {node.sensitiveFieldsRedacted ? <Badge tone="gray">Redacted</Badge> : null}
              </span>
            </span>
          </button>
          {node.linkedinUrl ? (
            <a
              href={node.linkedinUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-12 mt-3 inline-flex items-center gap-1.5 rounded-md border border-brand-blue/20 bg-blue-tint-20 px-2.5 py-1 text-xs font-semibold text-brand-blue transition-colors hover:border-brand-blue/40 hover:bg-brand-blue/10"
            >
              <Linkedin className="h-3.5 w-3.5" />
              LinkedIn
            </a>
          ) : null}
        </div>
      )}
      {hasChildren ? (
        <ul role="group" className={cn('mt-3 space-y-3 border-l pl-4', unmapped ? 'border-brand-orange/30' : 'border-surface-border')}>
          {children.map(child => <OrgTreeItem key={child.node.id} item={child} level={level + 1} onSelectStakeholder={onSelectStakeholder} />)}
        </ul>
      ) : null}
    </li>
  )
}

function buildTree(nodes: StakeholderOrgChartNode[]) {
  const nodeMap = new Map<string, OrgTreeNode>()
  const roots: OrgTreeNode[] = []

  nodes.forEach(node => nodeMap.set(node.id, { node, children: [] }))
  nodes.forEach(node => {
    const item = nodeMap.get(node.id)
    if (!item) return
    const parent = node.parentId ? nodeMap.get(node.parentId) : undefined
    if (parent) parent.children.push(item)
    else roots.push(item)
  })

  sortTree(roots)
  return roots
}

function sortTree(items: OrgTreeNode[]) {
  items.sort((a, b) => {
    if (a.node.id === UNMAPPED_NODE_ID) return 1
    if (b.node.id === UNMAPPED_NODE_ID) return -1
    return a.node.name.localeCompare(b.node.name)
  })
  items.forEach(item => sortTree(item.children))
}

function isGroupNode(node: StakeholderOrgChartNode) {
  return node.id === UNMAPPED_NODE_ID || node.role === 'group'
}

function Badge({ tone, children }: { tone: BadgeTone; children: string }) {
  const toneClass: Record<BadgeTone, string> = {
    green: 'border-rag-green/20 bg-rag-green/10 text-rag-green',
    amber: 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange',
    red: 'border-rag-red/20 bg-rag-red/10 text-rag-red',
    blue: 'border-brand-blue/20 bg-blue-tint-20 text-brand-blue',
    gray: 'border-surface-border bg-surface-tertiary text-ink-secondary',
    purple: 'border-purple-500/20 bg-purple-50 text-purple-700',
  }
  return <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider', toneClass[tone])}>{children}</span>
}

function roleTone(role: string): BadgeTone {
  if (role === 'executive_sponsor') return 'purple'
  if (role === 'economic_buyer' || role === 'commercial_owner') return 'blue'
  if (role === 'technical_decision_maker') return 'green'
  if (role === 'group') return 'amber'
  return 'gray'
}

function influenceTone(influence: string): BadgeTone {
  if (influence === 'critical') return 'red'
  if (influence === 'high') return 'amber'
  if (influence === 'medium') return 'blue'
  return 'gray'
}

function relationshipTone(relationship: string): BadgeTone {
  if (relationship === 'champion' || relationship === 'strong') return 'green'
  if (relationship === 'developing') return 'blue'
  if (relationship === 'weak') return 'amber'
  return 'gray'
}

function sentimentTone(sentiment: string): BadgeTone {
  if (sentiment === 'champion' || sentiment === 'positive') return 'green'
  if (sentiment === 'negative') return 'red'
  return 'gray'
}

function titleize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}
