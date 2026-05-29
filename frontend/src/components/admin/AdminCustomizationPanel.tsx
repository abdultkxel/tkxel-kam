import { ArrowDown, ArrowUp, Check, Plus, Save } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

type StepType = 'Task' | 'Milestone' | 'Content send' | 'Meeting' | 'Approval'
type FieldType = 'text' | 'number' | 'date' | 'dropdown' | 'multi-select' | 'boolean'

interface PlaybookStep {
  id: string
  type: StepType
  title: string
}

interface CustomField {
  id: string
  target: 'Account KYC' | 'Opportunity'
  name: string
  type: FieldType
}

const brandColours = ['brand-blue', 'brand-blue-dark', 'brand-orange', 'rag-green']

export function AdminCustomizationPanel() {
  const [stages, setStages] = useState([
    { name: 'Adoption', description: 'Client moves from onboarding into meaningful usage.', rule: 'Usage >= 60 for 2 periods', override: 'leadership', approval: true, colour: 'brand-blue' },
    { name: 'Recovery', description: 'Risk motion for critical account health.', rule: 'Overall score < 60', override: 'leadership', approval: true, colour: 'brand-orange' },
  ])
  const [steps, setSteps] = useState<PlaybookStep[]>([
    { id: 'step-1', type: 'Task', title: 'Confirm stakeholder map' },
    { id: 'step-2', type: 'Meeting', title: 'Schedule executive checkpoint' },
    { id: 'step-3', type: 'Content send', title: 'Share relevant playbook material' },
  ])
  const [fields, setFields] = useState<CustomField[]>([
    { id: 'field-1', target: 'Account KYC', name: 'Executive sponsor status', type: 'dropdown' },
    { id: 'field-2', target: 'Opportunity', name: 'Service line', type: 'multi-select' },
  ])
  const [draggedStep, setDraggedStep] = useState<string | null>(null)

  function moveStep(id: string, direction: -1 | 1) {
    const index = steps.findIndex(step => step.id === id)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= steps.length) return
    const next = [...steps]
    const [item] = next.splice(index, 1)
    next.splice(nextIndex, 0, item)
    setSteps(next)
  }

  function dropStep(targetId: string) {
    if (!draggedStep || draggedStep === targetId) return
    const source = steps.find(step => step.id === draggedStep)
    if (!source) return
    const next = steps.filter(step => step.id !== draggedStep)
    const targetIndex = next.findIndex(step => step.id === targetId)
    next.splice(targetIndex, 0, source)
    setSteps(next)
    setDraggedStep(null)
  }

  return (
    <div className="space-y-4">
      <section className="tk-card overflow-hidden">
        <div className="border-b border-surface-border p-5">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Stage automation</p>
          <h2 className="text-base font-semibold text-ink">Stage Rule Builder</h2>
        </div>
        <div className="grid gap-3 p-5">
          {stages.map((stage, index) => (
            <article key={stage.name} className="grid gap-3 rounded-lg border border-surface-border p-4">
              <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
                <input className="tk-input font-semibold" value={stage.name} onChange={event => setStages(items => items.map((item, itemIndex) => (itemIndex === index ? { ...item, name: event.target.value } : item)))} />
                <input className="tk-input" value={stage.description} onChange={event => setStages(items => items.map((item, itemIndex) => (itemIndex === index ? { ...item, description: event.target.value } : item)))} />
              </div>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
                <input className="tk-input" value={stage.rule} onChange={event => setStages(items => items.map((item, itemIndex) => (itemIndex === index ? { ...item, rule: event.target.value } : item)))} />
                <select className="tk-input" value={stage.colour} onChange={event => setStages(items => items.map((item, itemIndex) => (itemIndex === index ? { ...item, colour: event.target.value } : item)))}>
                  {brandColours.map(colour => <option key={colour}>{colour}</option>)}
                </select>
                <label className="flex min-h-[44px] items-center gap-2 whitespace-nowrap text-sm font-semibold text-ink">
                  <input type="checkbox" checked={stage.approval} onChange={event => setStages(items => items.map((item, itemIndex) => (itemIndex === index ? { ...item, approval: event.target.checked } : item)))} className="peer sr-only" />
                  <span className="flex h-5 w-5 items-center justify-center rounded-sm border border-surface-border bg-white text-white peer-checked:border-brand-blue peer-checked:bg-brand-blue">
                    <Check className="h-3 w-3" />
                  </span>
                  Approval
                </label>
              </div>
            </article>
          ))}
          <button className="tk-button-secondary justify-self-start" onClick={() => toast.success('Stage rules saved as draft')}>
            <Save className="h-4 w-4" />
            Save stage rules
          </button>
        </div>
      </section>

      <section className="tk-card overflow-hidden">
        <div className="border-b border-surface-border p-5">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Playbook templates</p>
          <h2 className="text-base font-semibold text-ink">Drag-and-drop Step Editor</h2>
        </div>
        <div className="grid gap-3 p-5">
          {steps.map(step => (
            <article
              key={step.id}
              draggable
              onDragStart={() => setDraggedStep(step.id)}
              onDragOver={event => event.preventDefault()}
              onDrop={() => dropStep(step.id)}
              className="grid cursor-grab gap-3 rounded-lg border border-surface-border bg-white p-4 active:cursor-grabbing md:grid-cols-[180px_1fr_auto]"
            >
              <select className="tk-input" value={step.type} onChange={event => setSteps(items => items.map(item => (item.id === step.id ? { ...item, type: event.target.value as StepType } : item)))}>
                {['Task', 'Milestone', 'Content send', 'Meeting', 'Approval'].map(type => <option key={type}>{type}</option>)}
              </select>
              <input className="tk-input" value={step.title} onChange={event => setSteps(items => items.map(item => (item.id === step.id ? { ...item, title: event.target.value } : item)))} />
              <div className="flex gap-2">
                <button className="tk-icon-button" onClick={() => moveStep(step.id, -1)} aria-label="Move step up"><ArrowUp className="h-4 w-4" /></button>
                <button className="tk-icon-button" onClick={() => moveStep(step.id, 1)} aria-label="Move step down"><ArrowDown className="h-4 w-4" /></button>
              </div>
            </article>
          ))}
          <button className="tk-button-secondary justify-self-start" onClick={() => setSteps(items => [...items, { id: `step-${items.length + 1}`, type: 'Task', title: 'New playbook step' }])}>
            <Plus className="h-4 w-4" />
            Add step
          </button>
        </div>
      </section>

      <section className="tk-card overflow-hidden">
        <div className="border-b border-surface-border p-5">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Extensible fields</p>
          <h2 className="text-base font-semibold text-ink">Custom Fields</h2>
        </div>
        <div className="grid gap-3 p-5">
          {fields.map(field => (
            <article key={field.id} className="grid gap-3 rounded-lg border border-surface-border p-4 md:grid-cols-[180px_1fr_180px]">
              <select className="tk-input" value={field.target} onChange={event => setFields(items => items.map(item => (item.id === field.id ? { ...item, target: event.target.value as CustomField['target'] } : item)))}>
                <option>Account KYC</option>
                <option>Opportunity</option>
              </select>
              <input className="tk-input" value={field.name} onChange={event => setFields(items => items.map(item => (item.id === field.id ? { ...item, name: event.target.value } : item)))} />
              <select className="tk-input" value={field.type} onChange={event => setFields(items => items.map(item => (item.id === field.id ? { ...item, type: event.target.value as FieldType } : item)))}>
                {['text', 'number', 'date', 'dropdown', 'multi-select', 'boolean'].map(type => <option key={type}>{type}</option>)}
              </select>
            </article>
          ))}
          <button className="tk-button-secondary justify-self-start" onClick={() => setFields(items => [...items, { id: `field-${items.length + 1}`, target: 'Account KYC', name: 'New custom field', type: 'text' }])}>
            <Plus className="h-4 w-4" />
            Add field
          </button>
        </div>
      </section>
    </div>
  )
}
