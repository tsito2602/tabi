import { useLayoutEffect, useRef, useState } from 'react';
import { useTravel } from '@/data/travel-provider';
import { createPlannerCommitter, plannerSourceTitle, preparePlacement, type PlanSource, type PreparedPlacement } from '@/data/planner';
import type { PlacementSlot } from '@/data/itinerary-placement';

export function useItineraryComposer({ initiallyEnabled = false }: { initiallyEnabled?: boolean } = {}) {
  const travel = useTravel();
  const live = useRef(travel);
  useLayoutEffect(() => { live.current = travel; }, [travel]);
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [source, setSource] = useState<PlanSource | null>(null);
  const [pending, setPending] = useState<PreparedPlacement | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [placedId, setPlacedId] = useState<string | null>(null);
  const [placementSequence, setPlacementSequence] = useState(0);
  const committer = useRef(createPlannerCommitter());
  const busy = useRef(false);
  const [scope, setScope] = useState({ tripId: travel.selectedTrip?.id, canEdit: travel.canEdit });
  const [commitStatus, setCommitStatus] = useState({ canUndo: false, linkPending: false });
  const selectionTrip = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    committer.current = createPlannerCommitter();
    selectionTrip.current = undefined;
  }, [travel.selectedTrip?.id, travel.canEdit]);
  // Reset rendered UI before committing a different trip/permission scope.
  // Refs are published/reset only after commit, never by a discarded render.
  if (scope.tripId !== travel.selectedTrip?.id || scope.canEdit !== travel.canEdit) {
    setScope({ tripId: travel.selectedTrip?.id, canEdit: travel.canEdit });
    setEnabled(false); setSource(null); setPending(null); setPlacedId(null); setNotice(''); setError('');
    setCommitStatus({ canUndo: false, linkPending: false });
  }
  const refreshCommitStatus = () => {
    const { canUndo, hasPendingLink } = committer.current;
    setCommitStatus({ canUndo, linkPending: hasPendingLink });
  };
  const select = (next: PlanSource | null) => {
    if (committer.current.hasPendingLink) { setError('作成済みの予定の紐づけを先に再試行してください。'); return; }
    selectionTrip.current = live.current.selectedTrip?.id;
    setSource(next); setError('');
  };
  const finish = (prepared: PreparedPlacement) => {
    const id = committer.current.save(live.current, prepared, live.current);
    setPlacedId(id); setPlacementSequence(value => value + 1); setNotice(prepared.source.kind === 'place' ? '予定を追加しました' : '予定を移動しました');
    setSource(null); setPending(null); setError('');
  };
  const drop = (next: PlanSource, slot: PlacementSlot) => {
    if (busy.current || !enabled || !live.current.canEdit) return;
    busy.current = true;
    try {
      const prepared = preparePlacement(live.current, selectionTrip.current ?? '', next, slot);
      if (prepared.conflict) { setPending(prepared); setSource(null); return; }
      finish(prepared);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '予定を配置できませんでした。'); }
    finally { busy.current = false; refreshCommitStatus(); }
  };
  const confirmTime = (time: string) => {
    if (!pending || busy.current) return;
    busy.current = true;
    try {
      const prepared = preparePlacement(live.current, pending.tripId, pending.source, pending.slot, time);
      if (pending.original) {
        const original = live.current.items.find(i => i.id === pending.original!.id);
        if (!original || original.day !== pending.original.day || original.time !== pending.original.time
          || JSON.stringify(original.details) !== JSON.stringify(pending.original.details)) throw new Error('予定が変更されました。閉じて置き直してください。');
      }
      if (prepared.conflict) { setError(prepared.conflict); return; }
      finish(prepared);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '予定を配置できませんでした。'); }
    finally { busy.current = false; refreshCommitStatus(); }
  };
  return {
    enabled: enabled && travel.canEdit, source, pending, notice, error, placedId, placementSequence,
    canUndo: commitStatus.canUndo, linkPending: commitStatus.linkPending,
    sourceTitle: source ? plannerSourceTitle(travel, source) ?? '予定' : '',
    toggle() { if (!committer.current.hasPendingLink) { setEnabled(v => !v); setSource(null); setPending(null); setError(''); } },
    select, drop, confirmTime,
    cancel() { setSource(null); setPending(null); setError(''); },
    dismissNotice() { setNotice(''); setPlacedId(null); committer.current.clearUndo(); refreshCommitStatus(); },
    undo() {
      if (busy.current) return;
      busy.current = true;
      try { committer.current.undo(live.current, live.current); setNotice('変更を取り消しました'); setPlacedId(null); setError(''); }
      catch (cause) { setError(cause instanceof Error ? cause.message : '取り消せませんでした。'); }
      finally { busy.current = false; refreshCommitStatus(); }
    },
    retry() {
      if (busy.current) return;
      busy.current = true;
      try { const id = committer.current.retry(live.current, live.current); setPlacedId(id); setPlacementSequence(value => value + 1); setSource(null); setNotice('予定を追加しました'); setError(''); }
      catch (cause) { setError(cause instanceof Error ? cause.message : '再試行できませんでした。'); }
      finally { busy.current = false; refreshCommitStatus(); }
    },
  };
}
