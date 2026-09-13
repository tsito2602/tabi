import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenShell } from '@/components/screen-shell';
import { Palette } from '@/constants/theme';

const bookings = [
  { id: 'flight', code: 'AIR', mark: 'HND → FUK', title: 'ANA 257', date: '9/14', time: '10:30', detail: '第2ターミナル · 確認番号 74K2', color: Palette.sky },
  { id: 'hotel', code: 'STAY', mark: '2 NIGHTS', title: 'THE BASICS FUKUOKA', date: '9/14', time: '15:00', detail: '朝食なし · 予約者 つばさ', color: Palette.sun },
  { id: 'car', code: 'DRIVE', mark: 'TOYOTA', title: '博多駅前店', date: '9/15', time: '09:00', detail: 'ヤリス・禁煙 · 18:00返却', color: '#C9E4CF' },
  { id: 'food', code: 'TABLE', mark: '2 GUESTS', title: '博多もつ鍋 やま中', date: '9/15', time: '19:30', detail: 'テーブル席 · 2名', color: '#F6B5A5' },
];

export default function BookingsScreen() {
  const [open, setOpen] = useState<string | null>('flight');
  return (
    <ScreenShell kicker="オフラインでも見せられます" title="旅のポケット" action={<Pressable accessibilityLabel="予約を追加" style={styles.addButton}><Text style={styles.addText}>＋</Text></Pressable>}>
      <View style={styles.notice}><View style={styles.noticeDot} /><Text style={styles.noticeText}>4件すべて端末に保存済み</Text><Text style={styles.noticeMeta}>更新 23:41</Text></View>
      <View style={styles.stack}>
        {bookings.map((booking, index) => {
          const expanded = open === booking.id;
          return (
            <Pressable key={booking.id} onPress={() => setOpen(expanded ? null : booking.id)} accessibilityRole="button" accessibilityState={{ expanded }} style={({ pressed }) => [styles.ticket, { backgroundColor: booking.color, transform: [{ rotate: `${index % 2 ? 0.45 : -0.35}deg` }] }, pressed && styles.pressed]}>
              <View style={styles.ticketMain}>
                <View style={styles.ticketTop}><Text style={styles.code}>{booking.code}</Text><Text style={styles.mark}>{booking.mark}</Text></View>
                <Text style={styles.ticketTitle}>{booking.title}</Text>
                <Text style={styles.detail}>{booking.detail}</Text>
                {expanded ? <View style={styles.actions}><View style={styles.primaryAction}><Text style={styles.primaryActionText}>チケットを表示</Text></View><View style={styles.secondaryAction}><Text style={styles.secondaryActionText}>詳細</Text></View></View> : null}
              </View>
              <View style={styles.perforation}><View style={styles.notchTop} /><View style={styles.dash} /><View style={styles.notchBottom} /></View>
              <View style={styles.ticketStub}><Text style={styles.stubDate}>{booking.date}</Text><Text style={styles.stubTime}>{booking.time}</Text><Text style={styles.chevron}>{expanded ? '−' : '+'}</Text></View>
            </Pressable>
          );
        })}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  addButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: Palette.coral, alignItems: 'center', justifyContent: 'center' },
  addText: { color: Palette.white, fontSize: 25, marginTop: -2 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Palette.white, borderRadius: 17, paddingHorizontal: 15, paddingVertical: 13 },
  noticeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#43A36E' },
  noticeText: { flex: 1, color: Palette.ink, fontSize: 13, fontWeight: '800' },
  noticeMeta: { color: Palette.muted, fontSize: 11 },
  stack: { gap: 13 },
  ticket: { minHeight: 162, borderRadius: 25, flexDirection: 'row', overflow: 'hidden' },
  ticketMain: { flex: 1, padding: 20 },
  ticketTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  code: { color: Palette.ink, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  mark: { color: '#3C5957', fontSize: 10, fontWeight: '800' },
  ticketTitle: { color: Palette.ink, fontSize: 20, lineHeight: 25, fontWeight: '900', marginTop: 18 },
  detail: { color: '#405A57', fontSize: 12, lineHeight: 18, marginTop: 5 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 18 },
  primaryAction: { backgroundColor: Palette.ink, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 10 },
  primaryActionText: { color: Palette.white, fontSize: 12, fontWeight: '800' },
  secondaryAction: { borderWidth: 1, borderColor: '#78918D', borderRadius: 13, paddingHorizontal: 14, paddingVertical: 9 },
  secondaryActionText: { color: Palette.ink, fontSize: 12, fontWeight: '800' },
  perforation: { width: 1, marginVertical: 13, borderLeftWidth: 1, borderStyle: 'dashed', borderColor: '#6F8883' },
  notchTop: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: Palette.paper, top: -22, left: -9 },
  notchBottom: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: Palette.paper, bottom: -22, left: -9 },
  dash: { flex: 1 },
  ticketStub: { width: 92, alignItems: 'center', justifyContent: 'center', padding: 10 },
  stubDate: { color: '#405A57', fontSize: 12, fontWeight: '800' },
  stubTime: { color: Palette.ink, fontSize: 21, fontWeight: '900', marginTop: 4 },
  chevron: { color: Palette.ink, fontSize: 20, marginTop: 12 },
  pressed: { opacity: 0.7 },
});
