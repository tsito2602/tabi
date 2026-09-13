import { useThemedStyles } from '@/theme/theme-provider';
import { useModalViewport } from '@/hooks/use-modal-viewport';
import { useFormKeyboard } from '@/hooks/use-form-keyboard';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { mono, type Palette } from '@/constants/design';

import { calendarDate, displayDate, monthDays, rangeRows, selectRangeDate, type DateRange } from './date-range';

import type { DateRangePickerProps as Props } from './date-range-picker.types';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const WEEKDAY_HEIGHT = 32;
const ROW_HEIGHT = 46;
const MARKER_SIZE = 36;
const BAND_HEIGHT = MARKER_SIZE;

function validTime(value: string) {
  return !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function todayValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

export function DateRangePicker({ startDate, endDate, startTime = '', endTime = '', disabled, label = '期間', mode = 'range', onChange, showTime = false, startLabel, endLabel }: Props) {
  const styles = useThemedStyles(createStyles);

  const [open, setOpen] = useState(false);
  const firstLabel = startLabel ?? (mode === 'single' ? '日付' : '出発日');
  const lastLabel = endLabel ?? '帰着日';
  const value = (date: string, time: string) => `${displayDate(date)}${showTime && time ? ` ${time}` : ''}`;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={mode === 'single' ? `${firstLabel} ${value(startDate, startTime)}` : `${firstLabel} ${value(startDate, startTime)}、${lastLabel} ${value(endDate, endTime)}`}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, disabled && styles.disabled, pressed && styles.pressed]}>
        <View accessibilityElementsHidden style={styles.calendarIcon}>
          <View style={styles.calendarTop} />
          <View style={styles.calendarDots}><View style={styles.calendarDot} /><View style={styles.calendarDot} /></View>
        </View>
        {mode === 'single' ? (
          <View style={styles.triggerPart}><Text style={styles.triggerMeta}>{firstLabel}</Text><Text style={styles.triggerValue}>{value(startDate, startTime)}</Text></View>
        ) : (
          <>
            <View style={styles.triggerPart}><Text style={styles.triggerMeta}>{firstLabel}</Text><Text style={styles.triggerValue}>{value(startDate, startTime)}</Text></View>
            <Text style={styles.triggerDash}>—</Text>
            <View style={styles.triggerPart}><Text style={styles.triggerMeta}>{lastLabel}</Text><Text style={styles.triggerValue}>{value(endDate, endTime)}</Text></View>
          </>
        )}
      </Pressable>
      {open ? <DateRangeDialog startDate={startDate} endDate={endDate} startTime={startTime} endTime={endTime} startLabel={firstLabel} endLabel={lastLabel} label={label} mode={mode} showTime={showTime} close={() => setOpen(false)} onChange={onChange} /> : null}
    </View>
  );
}

function DateRangeDialog({ startDate, endDate, startTime = '', endTime = '', startLabel = '出発日', endLabel = '帰着日', label = '期間', mode, showTime = false, close, onChange }: Props & { close: () => void }) {
  const styles = useThemedStyles(createStyles);

  const viewport = useModalViewport(true);
  const scroll = useRef<ScrollView>(null);
  useFormKeyboard(scroll);
  const initial = startDate || endDate || todayValue();
  const [range, setRange] = useState<DateRange>({ startDate, endDate });
  const [anchorDate, setAnchorDate] = useState(startDate);
  const [hoverDate, setHoverDate] = useState('');
  const [phase, setPhase] = useState<'start' | 'end'>(mode === 'range' && startDate && !endDate ? 'end' : 'start');
  const [timePhase, setTimePhase] = useState<'start' | 'end'>('start');
  const [times, setTimes] = useState({ startTime, endTime });
  const [month, setMonth] = useState(initial.slice(0, 7));
  const [yearText, setYearText] = useState(initial.slice(0, 4));
  const [gridWidth, setGridWidth] = useState(0);
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5)) - 1;
  const days = useMemo(() => monthDays(year, monthIndex), [monthIndex, year]);
  const previewRange = useMemo<DateRange>(() => {
    if (mode !== 'range' || phase !== 'end' || range.endDate || !range.startDate || !hoverDate) return range;
    return hoverDate < range.startDate
      ? { startDate: hoverDate, endDate: range.startDate }
      : { startDate: range.startDate, endDate: hoverDate };
  }, [hoverDate, mode, phase, range]);

  const changeMonth = (value: string) => {
    setHoverDate('');
    setMonth(value);
    setYearText(value.slice(0, 4));
  };

  const applyYear = () => {
    const value = Number(yearText);
    if (!Number.isInteger(value) || value < 1 || value > 9999) {
      setYearText(month.slice(0, 4));
      return;
    }
    changeMonth(`${String(value).padStart(4, '0')}-${month.slice(5)}`);
  };

  const choose = (date: string) => {
    if (mode === 'single') {
      setRange({ startDate: date, endDate: date });
      setAnchorDate(date);
      setTimePhase('start');
      return;
    }
    const next = selectRangeDate(range, phase, date);
    if (!next.endDate) setAnchorDate(next.startDate);
    setRange(next);
    setPhase(next.endDate ? 'start' : 'end');
    setTimePhase(next.endDate ? 'end' : 'start');
  };

  const hint = mode === 'single'
    ? '日付を選択してください。'
    : phase === 'end' && range.startDate
      ? '帰着日を選択。同じ日なら日帰りです。'
      : range.endDate
        ? 'この期間でよければ「決定」を押してください。'
        : '出発日を選択してください。';

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <SafeAreaView testID="modal-viewport" style={[styles.backdrop, viewport]}>
        <Pressable accessibilityLabel="日付選択を閉じる" onPress={close} style={StyleSheet.absoluteFill} />
        <View testID="picker-sheet" accessibilityViewIsModal style={styles.dialog}>
          <ScrollView ref={scroll} contentContainerStyle={styles.dialogContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.heading}>
            <Text style={styles.dialogTitle}>{label}</Text>
            <Pressable accessibilityLabel="日付選択を閉じる" onPress={close} style={styles.iconButton}><Text style={styles.close}>×</Text></Pressable>
          </View>

          <View style={styles.summary}>
            <Pressable onPress={() => { setPhase('start'); setTimePhase('start'); }} style={[styles.summaryPart, (showTime ? timePhase === 'start' : phase === 'start') && styles.summaryActive]}>
              <Text style={styles.summaryMeta}>{startLabel}</Text>
              <Text style={styles.summaryValue}>{displayDate(range.startDate)}{showTime && times.startTime ? ` ${times.startTime}` : ''}</Text>
            </Pressable>
            {mode === 'range' ? <Pressable onPress={() => { setPhase('end'); setTimePhase('end'); }} style={[styles.summaryPart, (showTime ? timePhase === 'end' : phase === 'end') && styles.summaryActive]}>
              <Text style={styles.summaryMeta}>{endLabel}</Text>
              <Text style={styles.summaryValue}>{displayDate(range.endDate)}{showTime && times.endTime ? ` ${times.endTime}` : ''}</Text>
            </Pressable> : null}
          </View>

          <View style={styles.monthControls}>
            <Pressable accessibilityLabel="前の月" onPress={() => changeMonth(calendarDate(year, monthIndex - 1, 1).slice(0, 7))} style={styles.iconButton}><Text style={styles.arrow}>‹</Text></Pressable>
            <View style={styles.yearField}>
              <TextInput accessibilityLabel="年を入力" keyboardType="number-pad" maxLength={4} onBlur={applyYear} onChangeText={setYearText} onSubmitEditing={applyYear} selectTextOnFocus style={styles.yearInput} value={yearText} />
              <Text style={styles.yearSuffix}>年</Text>
            </View>
            <Text style={styles.monthLabel}>{monthIndex + 1}月</Text>
            <Pressable accessibilityLabel="次の月" onPress={() => changeMonth(calendarDate(year, monthIndex + 1, 1).slice(0, 7))} style={styles.iconButton}><Text style={styles.arrow}>›</Text></Pressable>
          </View>

          <View onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)} style={styles.grid}>
            {gridWidth ? <DateRangeHighlight anchorDate={anchorDate} days={days} gridWidth={gridWidth} markerRange={range} previewEndDate={hoverDate} range={previewRange} /> : null}
            {WEEKDAYS.map((weekday) => <View key={weekday} style={styles.weekdayCell}><Text style={styles.weekday}>{weekday}</Text></View>)}
            {days.map((date, index) => {
              if (!date) return <View key={`blank-${index}`} style={styles.dayCell} />;
              const previewSelected = date === hoverDate;
              const selected = date === range.startDate || date === range.endDate;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${displayDate(date)}${date === range.startDate ? '、開始日' : ''}${date === range.endDate ? '、終了日' : ''}`}
                  aria-selected={selected}
                  key={date}
                  onHoverIn={() => setHoverDate(date)}
                  onHoverOut={() => setHoverDate((current) => current === date ? '' : current)}
                  onPress={() => choose(date)}
                  style={styles.dayCell}>
                  <Text style={[styles.day, (selected || previewSelected) && styles.daySelected]}>{Number(date.slice(8))}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text accessibilityLiveRegion="polite" style={styles.hint}>{hint}</Text>
          {showTime ? <TimeSelector
            label={mode === 'single' ? '時刻' : timePhase === 'start' ? `${startLabel}の時刻` : `${endLabel}の時刻`}
            onChange={(value) => setTimes((current) => timePhase === 'start' ? { ...current, startTime: value } : { ...current, endTime: value })}
            value={timePhase === 'start' ? times.startTime : times.endTime}
          /> : null}
          <View style={styles.actions}>
            <Pressable onPress={() => { setRange({ startDate: '', endDate: '' }); setHoverDate(''); setTimes({ startTime: '', endTime: '' }); setPhase('start'); setTimePhase('start'); }} style={styles.clearButton}><Text style={styles.clearText}>クリア</Text></Pressable>
            <Pressable disabled={!range.startDate || (mode === 'range' && !range.endDate) || !validTime(times.startTime) || !validTime(times.endTime)} onPress={() => { onChange({ ...range, ...times }); close(); }} style={({ pressed }) => [styles.confirmButton, (!range.startDate || (mode === 'range' && !range.endDate) || !validTime(times.startTime) || !validTime(times.endTime)) && styles.confirmDisabled, pressed && styles.pressed]}><Text style={styles.confirmText}>決定</Text></Pressable>
          </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function TimeSelector({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  const styles = useThemedStyles(createStyles);

  return <View style={styles.timeSection}>
    <View style={styles.timeHeading}>
      <Text style={styles.timeLabel}>{label}</Text>
      <input
        aria-label={label}
        className="native-time-input"
        type="time"
        step={60}
        value={value}
        onInput={(event) => onChange(event.currentTarget.value)}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {value ? <Pressable accessibilityRole="button" accessibilityLabel={`${label}をクリア`} onPress={() => onChange('')} style={styles.iconButton}><Text style={styles.clearText}>×</Text></Pressable> : null}
    </View>
  </View>;
}

function DateRangeHighlight({ anchorDate, days, gridWidth, markerRange, previewEndDate, range }: { anchorDate: string; days: (string | null)[]; gridWidth: number; markerRange: DateRange; previewEndDate: string; range: DateRange }) {
  const styles = useThemedStyles(createStyles);

  const anchor = days.indexOf(anchorDate);
  const anchorRow = anchor < 0 ? (range.startDate < (days.find(Boolean) ?? '') ? 0 : 5) : Math.floor(anchor / 7);
  const rows = rangeRows(days, range);
  return (
    <View pointerEvents="none" style={styles.highlights}>
      {rows.map((segment, row) => {
        const origin = anchor < 0 ? (anchorRow === 0 ? 0 : 6) : Math.max(0, Math.min(6, anchor - row * 7));
        const firstDate = segment ? days[row * 7 + segment.first] : null;
        const lastDate = segment ? days[row * 7 + segment.last] : null;
        const bounds = segment ? {
          start: segment.first + (firstDate === range.startDate ? 0.5 : 0),
          end: segment.last + (lastDate === range.endDate ? 0.5 : 1),
        } : null;
        return <RangeBand bounds={bounds} gridWidth={gridWidth} key={row} origin={origin} row={row} />;
      })}
      <DateMarker gridWidth={gridWidth} index={days.indexOf(markerRange.startDate)} />
      <DateMarker
        gridWidth={gridWidth}
        index={markerRange.endDate && markerRange.endDate !== markerRange.startDate ? days.indexOf(markerRange.endDate) : -1}
        origin={anchor}
      />
      <DateMarker
        gridWidth={gridWidth}
        index={days.indexOf(previewEndDate)}
        origin={days.indexOf(markerRange.endDate || markerRange.startDate)}
        preview
      />
    </View>
  );
}

function RangeBand({ bounds, gridWidth, origin, row }: { bounds: { start: number; end: number } | null; gridWidth: number; origin: number; row: number }) {
  const styles = useThemedStyles(createStyles);

  const cell = gridWidth / 7;
  const [left] = useState(() => new Animated.Value((bounds?.start ?? origin + 0.5) * cell));
  const [width] = useState(() => new Animated.Value(bounds ? (bounds.end - bounds.start) * cell : 0));
  const [opacity] = useState(() => new Animated.Value(bounds && bounds.end > bounds.start ? 1 : 0));
  useEffect(() => {
    Animated.parallel([
      Animated.timing(left, { toValue: (bounds?.start ?? origin + 0.5) * cell, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(width, { toValue: bounds ? Math.max(0, bounds.end - bounds.start) * cell : 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(opacity, { toValue: bounds && bounds.end > bounds.start ? 1 : 0, duration: 160, useNativeDriver: false }),
    ]).start();
  }, [bounds, cell, left, opacity, origin, width]);
  return <Animated.View style={[styles.band, { left, top: WEEKDAY_HEIGHT + row * ROW_HEIGHT + 5 + (MARKER_SIZE - BAND_HEIGHT) / 2, width, opacity }]} />;
}

function DateMarker({ gridWidth, index, origin = -1, preview = false }: { gridWidth: number; index: number; origin?: number; preview?: boolean }) {
  const styles = useThemedStyles(createStyles);

  const [position] = useState(() => new Animated.ValueXY());
  const [opacity] = useState(() => new Animated.Value(index >= 0 ? 1 : 0));
  const positioned = useRef(false);
  useEffect(() => {
    if (index < 0) {
      Animated.timing(opacity, { toValue: 0, duration: 120, useNativeDriver: false }).start();
      return;
    }
    const target = { x: ((index % 7) + 0.5) * gridWidth / 7 - MARKER_SIZE / 2, y: WEEKDAY_HEIGHT + Math.floor(index / 7) * ROW_HEIGHT + 5 };
    if (!positioned.current) {
      const start = origin >= 0 ? { x: ((origin % 7) + 0.5) * gridWidth / 7 - MARKER_SIZE / 2, y: WEEKDAY_HEIGHT + Math.floor(origin / 7) * ROW_HEIGHT + 5 } : target;
      position.setValue(start);
      positioned.current = true;
    }
    Animated.parallel([
      Animated.spring(position, { toValue: target, damping: 22, stiffness: 230, mass: 0.75, useNativeDriver: false }),
      Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: false }),
    ]).start();
  }, [gridWidth, index, opacity, origin, position]);
  return <Animated.View style={[styles.marker, preview && styles.markerPreview, { left: position.x, top: position.y, opacity }]} />;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  field: { gap: 8 },
  label: { color: palette.slate, fontFamily: mono, fontSize: 11 },
  trigger: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.paper, borderRadius: 8, paddingHorizontal: 14 },
  calendarIcon: { width: 24, height: 24, borderWidth: 1.5, borderColor: palette.ocean, borderRadius: 6, overflow: 'hidden' },
  calendarTop: { height: 6, borderBottomWidth: 1.5, borderBottomColor: palette.ocean, backgroundColor: palette.sky },
  calendarDots: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  calendarDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: palette.ocean },
  triggerPart: { flex: 1, minWidth: 0 },
  triggerMeta: { color: palette.smoke, fontFamily: mono, fontSize: 9 },
  triggerValue: { color: palette.ink, fontSize: 13, fontWeight: '700', marginTop: 3 },
  triggerDash: { color: palette.ash },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.65 },
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(24,42,54,0.34)', padding: 16 },
  dialog: { width: '100%', maxWidth: 500, maxHeight: '96%', backgroundColor: palette.canvas, borderRadius: 28, overflow: 'hidden' },
  dialogContent: { padding: 20 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dialogTitle: { color: palette.ink, fontSize: 24, fontWeight: '900', letterSpacing: -0.6 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  close: { color: palette.ink, fontSize: 30, lineHeight: 32, fontWeight: '400' },
  summary: { flexDirection: 'row', gap: 8, marginTop: 16 },
  summaryPart: { flex: 1, minHeight: 60, justifyContent: 'center', backgroundColor: palette.mist, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: 'transparent' },
  summaryActive: { backgroundColor: palette.sky, borderColor: palette.ocean },
  summaryMeta: { color: palette.smoke, fontFamily: mono, fontSize: 9 },
  summaryValue: { color: palette.ink, fontSize: 13, fontWeight: '700', marginTop: 3 },
  monthControls: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 },
  arrow: { color: palette.ink, fontSize: 30, lineHeight: 32 },
  yearField: { height: 40, flexDirection: 'row', alignItems: 'center', backgroundColor: palette.paper, borderRadius: 8, paddingLeft: 10, paddingRight: 8 },
  yearInput: { width: 46, color: palette.ink, fontSize: 15, fontWeight: '700', textAlign: 'right', padding: 0 },
  yearSuffix: { color: palette.slate, fontSize: 13, marginLeft: 3 },
  monthLabel: { width: 42, color: palette.ink, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  grid: { position: 'relative', flexDirection: 'row', flexWrap: 'wrap' },
  highlights: { position: 'absolute', inset: 0, zIndex: 0 },
  weekdayCell: { width: `${100 / 7}%`, height: WEEKDAY_HEIGHT, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  weekday: { color: palette.smoke, fontFamily: mono, fontSize: 10 },
  dayCell: { width: `${100 / 7}%`, height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  day: { color: palette.ink, fontSize: 14, fontWeight: '600', zIndex: 3 },
  daySelected: { color: palette.onOcean, fontWeight: '900' },
  band: { position: 'absolute', height: BAND_HEIGHT, borderRadius: BAND_HEIGHT / 2, backgroundColor: palette.sky },
  marker: { position: 'absolute', width: MARKER_SIZE, height: MARKER_SIZE, borderRadius: MARKER_SIZE / 2, backgroundColor: palette.ocean },
  markerPreview: { backgroundColor: palette.smoke },
  hint: { minHeight: 18, color: palette.slate, fontSize: 12, textAlign: 'center', marginTop: 10 },
  timeSection: { backgroundColor: palette.paper, borderRadius: 16, padding: 12, marginTop: 10 },
  timeHeading: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  timeLabel: { flex: 1, color: palette.ink, fontSize: 13, fontWeight: '800' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  clearButton: { minWidth: 72, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  clearText: { color: palette.slate, fontSize: 14, fontWeight: '700' },
  confirmButton: { minWidth: 112, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.ocean, borderRadius: 8 },
  confirmDisabled: { opacity: 0.35 },
  confirmText: { color: palette.onOcean, fontSize: 15, fontWeight: '700' },
});
