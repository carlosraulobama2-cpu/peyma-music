import { formatDuration, formatNumber, formatTotalDuration, clamp, getInitials, shuffle, sumDuration } from './index';

describe('formatDuration', () => {
  it('formats seconds as m:ss', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formats over an hour as h:mm:ss', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('is defensive against invalid input', () => {
    expect(formatDuration(NaN)).toBe('0:00');
    expect(formatDuration(-5)).toBe('0:00');
  });
});

describe('formatTotalDuration', () => {
  it('formats short durations in minutes or seconds', () => {
    expect(formatTotalDuration(45)).toBe('45 s');
    expect(formatTotalDuration(600)).toBe('10 min');
  });

  it('formats long durations in hours and minutes', () => {
    expect(formatTotalDuration(3900)).toBe('1 h 5 min');
    expect(formatTotalDuration(7200)).toBe('2 h');
  });
});

describe('formatNumber', () => {
  it('abbreviates large numbers with a comma decimal', () => {
    expect(formatNumber(950)).toBe('950');
    expect(formatNumber(1500)).toBe('1,5K');
    expect(formatNumber(1250000)).toBe('1,25M');
  });
});

describe('clamp', () => {
  it('keeps values within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('falls back to min for non-finite input', () => {
    expect(clamp(NaN, 2, 8)).toBe(2);
  });
});

describe('getInitials', () => {
  it('takes the first letter of up to two words', () => {
    expect(getInitials('Ana Pérez López')).toBe('AP');
    expect(getInitials('Cher')).toBe('C');
  });

  it('falls back for empty input', () => {
    expect(getInitials('   ')).toBe('?');
  });
});

describe('shuffle', () => {
  it('preserves all elements without mutating the source array', () => {
    const original = [1, 2, 3, 4, 5];
    const shuffled = shuffle(original);
    expect(shuffled).toHaveLength(original.length);
    expect([...shuffled].sort()).toEqual([...original].sort());
    expect(original).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('sumDuration', () => {
  it('adds up durations, ignoring invalid entries', () => {
    expect(sumDuration([{ duration: 60 }, { duration: 30 }, { duration: NaN }])).toBe(90);
    expect(sumDuration([])).toBe(0);
  });
});
