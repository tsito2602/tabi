import { useState } from 'react';
import { Text, View } from 'react-native';
import { usePalette } from '@/theme/theme-provider';
import type { PreparedPlacement } from '@/data/planner';
import { validPlanTime } from '@/data/itinerary-placement';
import { formatDate } from '@/utils/dates';
import { FormSheet } from './form-sheet';
import { DateRangePicker } from './date-range-picker';
import { ActionButton } from './ui/action-button';

export function PlannerTimeSheet({ placement, error, onClose, onConfirm }: {
  placement: PreparedPlacement; error: string; onClose: () => void; onConfirm: (time: string) => void;
}) {
  const p = usePalette();
  const [time, setTime] = useState(placement.input.time);
  const [wrongDay, setWrongDay] = useState(false);
  return <FormSheet visible title="配置先の時刻を調整" onClose={onClose} onSave={() => onConfirm(time)} saveLabel="配置する"
    canSave={!wrongDay && validPlanTime(time)} dirty={time !== placement.input.time} error={wrongDay ? '配置先の日付は変更せず、時刻を選んでください。' : error || undefined}>
    <Text style={{ color: p.ink, fontSize: 23, lineHeight: 31, fontWeight: '600' }}>{placement.input.title}</Text>
    <Text style={{ color: p.slate, fontSize: 14, lineHeight: 22 }}>{formatDate(placement.slot.day)}のこの位置に置くには、時刻の調整が必要です。予約の日時は変更しません。</Text>
    <Text style={{ color: p.warning, fontSize: 14, lineHeight: 22 }}>{placement.conflict}</Text>
    <DateRangePicker mode="single" showTime label="配置先の日時" startDate={placement.slot.day} endDate={placement.slot.day} startTime={time}
      onChange={range => { setWrongDay(range.startDate !== placement.slot.day); setTime(range.startTime); }} />
    {placement.original?.details?.endTime ? <Text style={{ color: p.smoke, fontSize: 12, lineHeight: 19 }}>時刻を変更すると終了日時も同じ長さだけ移動します。時刻未定にすると、開始・終了の時刻を解除します。</Text> : null}
    <View style={{ alignSelf: 'flex-start', marginTop: 8 }}><ActionButton label="時刻未定で配置する" onPress={() => onConfirm('')} /></View>
  </FormSheet>;
}
