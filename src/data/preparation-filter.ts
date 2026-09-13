import { assigneeName, memberAssignee } from './assignee';
import type { TripMember } from './types';

export type PreparationFilter = { kind: 'all' } | { kind: 'shared' } | { kind: 'assignee'; value: string };
export type PreparationEntry = { assignee?: string; shared?: boolean };

export const matchesPreparationFilter = (item: PreparationEntry, filter: PreparationFilter) =>
  filter.kind === 'all' || (filter.kind === 'shared' ? item.shared === true : (item.assignee ?? '') === filter.value);

export function preparationFilterOptions(members: TripMember[], items: PreparationEntry[], includeShared: boolean) {
  const assignees = [...new Set([...members.map((member) => memberAssignee(member.id)), ...items.map((item) => item.assignee ?? '').filter(Boolean)])];
  return [
    { key: 'all', label: 'すべて', filter: { kind: 'all' } as PreparationFilter },
    ...assignees.map((value) => ({ key: value, label: assigneeName(value, members), filter: { kind: 'assignee', value } as PreparationFilter })),
    ...(includeShared ? [{ key: 'shared', label: '共用', filter: { kind: 'shared' } as PreparationFilter }] : []),
    { key: 'unassigned', label: '未指定', filter: { kind: 'assignee', value: '' } as PreparationFilter },
  ];
}
