import { ScoreActivityTask } from '@/types/scoreActivity'
import { User } from '@/types/user'
import { emitTimelineEvent } from '@/utils/emitTimelineEvent'

export function emitScoreActivityCompletion(task: ScoreActivityTask, user: User, evidenceNote: string) {
  return emitTimelineEvent({
    accountId: task.accountId,
    eventType: 'manual_note',
    module: 'activity',
    title: `Score activity completed: ${task.title}`,
    description: evidenceNote,
    performedBy: user.id,
    performedByName: user.name,
    sourceRecordId: task.id,
    sourceRecordType: 'score_activity',
    sourceRecordRoute: `/accounts/${task.accountId}?tab=health`,
    tags: ['score-activity', task.calculatorId, task.criterionId],
    metadata: {
      taskId: task.id,
      templateId: task.templateId,
      calculatorId: task.calculatorId,
      criterionId: task.criterionId,
    },
    isSensitive: false,
    isSystemGenerated: false,
    isImmutable: false,
  })
}
