import { completedLuloUtcDaily, currentLuloUtcDaily, luloSourcesForChartDay, utcLuloDayKey, withCurrentLuloUtcEarnings } from './luloUtcDaily';

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

describe('completed UTC Lulo day stays on its original date', () => {
  const at = new Date('2026-10-31T00:08:00Z'); // 5:08 PM PDT, Oct 30
  const saved = {
    lulo_last_synced_at: at.toISOString(),
    lulo_daily_performance: [
      { date: '2026-10-30', amount: 0.57 },
      { date: '2026-10-31', amount: 0.014 },
    ],
  };
  test('October 30 keeps $0.57 after 00:00 UTC; Oct 31 keeps only its new earnings', () => {
    const live = currentLuloUtcDaily([saved], at);
    expect(live).toEqual({ utcDay: '2026-10-31', status: 'ready', amount: 0.014 });
    expect(luloSourcesForChartDay({ Lulo: .57, Loopscale: .45 }, [saved],
      '2026-10-30', '2026-10-30', live)).toEqual({ Lulo: .57, Loopscale: .45 });
    expect(luloSourcesForChartDay({ Lulo: .57, Loopscale: .45 }, [saved],
      '2026-10-31', '2026-10-30', live)).toEqual({ Lulo: .014 });
  });
  test('new UTC day with no posted interest does not steal prior day earnings', () => {
    const pending = { ...saved, lulo_daily_performance: [saved.lulo_daily_performance[0]] };
    const live = currentLuloUtcDaily([pending], at);
    expect(live.status).toBe('awaiting-utc-reading');
    expect(luloSourcesForChartDay({ Lulo: .57, Loopscale: .45 }, [pending],
      '2026-10-30', '2026-10-30', live)).toEqual({ Lulo: .57, Loopscale: .45 });
    expect(luloSourcesForChartDay({}, [pending],
      '2026-10-31', '2026-10-30', live)).toEqual({});
  });
  test('completed-day duplicate rows do not double-count; partial data retains ledger', () => {
    const duplicate = { ...saved, lulo_daily_performance: [
      { date: '2026-10-30', amount: .57 },
      { date: '2026-10-30', amount: .57 },
    ] };
    expect(completedLuloUtcDaily([duplicate], '2026-10-30')).toBe(.57);
    const live = currentLuloUtcDaily([duplicate], at);
    expect(luloSourcesForChartDay({ Lulo: .57 }, [duplicate],
      '2026-10-30', '2026-10-30', live)).toEqual({ Lulo: .57 });
    expect(luloSourcesForChartDay({ Lulo: .57 }, [{ lulo_daily_performance: [] }],
      '2026-10-30', '2026-10-30', live)).toEqual({ Lulo: .57 });
  });
  test('PST reset and UTC month-end keep earnings on the UTC date', () => {
    const pst = new Date('2026-11-02T00:08:00Z'); // 4:08 PM PST, Nov 1
    const project = {
      lulo_last_synced_at: pst.toISOString(),
      lulo_daily_performance: [
        { date: '2026-11-01', amount: .57 },
        { date: '2026-11-02', amount: .02 },
      ],
    };
    const live = currentLuloUtcDaily([project], pst);
    expect(luloSourcesForChartDay({}, [project], '2026-11-01','2026-11-01',live).Lulo).toBe(.57);
    expect(luloSourcesForChartDay({}, [project], '2026-11-02','2026-11-01',live).Lulo).toBe(.02);
    expect(luloSourcesForChartDay({}, [project], '2026-11-03','2026-11-01',live)).toEqual({});
  });
});
