import { currentLuloUtcDaily, utcLuloDayKey, withCurrentLuloUtcEarnings } from './luloUtcDaily';

describe('Lulo UTC rollover vs. Pacific dashboard', () => {
  const p = (day, amount, synced) => ({
    lulo_last_synced_at: synced,
    lulo_daily_performance: [{ date: day, amount }],
  });
  test('reset is 5 PM PDT on Oct 30 and 4 PM PST on Nov 2', () => {
    expect(utcLuloDayKey('2026-10-30T23:59:59Z')).toBe('2026-10-30');
    expect(utcLuloDayKey('2026-10-31T00:00:00Z')).toBe('2026-10-31');
    expect(utcLuloDayKey('2026-11-02T00:00:00Z')).toBe('2026-11-02');
  });
  test('live UTC amount replaces stale larger prior-day amount', () => {
    const result = currentLuloUtcDaily([p('2026-10-31', .025, '2026-10-31T00:06:00Z')], new Date('2026-10-31T00:07:00Z'));
    expect(result).toEqual({ utcDay: '2026-10-31', status: 'ready', amount: .025 });
    expect(withCurrentLuloUtcEarnings({ Lulo: .22, Loopscale: .45 }, result, true))
      .toEqual({ Lulo: .025, Loopscale: .45 });
  });
  test('missing new UTC bucket is pending, not carried forward as prior-day profit', () => {
    const result = currentLuloUtcDaily([p('2026-10-30', .22, '2026-10-31T00:06:00Z')], new Date('2026-10-31T00:07:00Z'));
    expect(result.status).toBe('awaiting-utc-reading');
    expect(withCurrentLuloUtcEarnings({Lulo: .22}, result, true)).toEqual({});
  });
  test('preserves historic Pacific-day ledger and never adds duplicated rows', () => {
    expect(withCurrentLuloUtcEarnings({ Lulo: .22 }, {status:'ready', amount:.025}, false))
      .toEqual({ Lulo: .22 });
    const result = currentLuloUtcDaily([
      { lulo_last_synced_at:'2026-10-31T00:06:00Z',
        lulo_daily_performance:[{date:'2026-10-31',amount:.025},{date:'2026-10-31',amount:.025}] },
    ], new Date('2026-10-31T00:07:00Z'));
    expect(result.amount).toBe(.025);
  });
});
