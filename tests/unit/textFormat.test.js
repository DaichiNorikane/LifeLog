import { describe, expect, it } from 'vitest';

import { formatElenaText } from '@/lib/line/textFormat';

describe('formatElenaText', () => {
  it('inserts a line break after each sentence', () => {
    expect(formatElenaText('今日はよく頑張りましたね。明日も続けましょう。'))
      .toBe('今日はよく頑張りましたね。\n明日も続けましょう。');
  });

  it('breaks after the emoji that follows the punctuation, not before it', () => {
    expect(formatElenaText('すごいです！✨この調子ですよ💪明日も頑張りましょう！'))
      .toBe('すごいです！✨\nこの調子ですよ💪明日も頑張りましょう！');
  });

  it('does not break inside a quoted phrase', () => {
    expect(formatElenaText('「頑張って！」と言いたいです。本当に。'))
      .toBe('「頑張って！」\nと言いたいです。\n本当に。');
  });

  it('keeps existing line breaks without doubling them', () => {
    expect(formatElenaText('一文目です。\n二文目です。'))
      .toBe('一文目です。\n二文目です。');
  });

  it('collapses runs of blank lines', () => {
    expect(formatElenaText('一文目です。\n\n\n\n二文目です。'))
      .toBe('一文目です。\n\n二文目です。');
  });

  it('leaves numbers and mid-sentence text untouched', () => {
    expect(formatElenaText('目安は1日1,800kcal、タンパク質は75.5gです。'))
      .toBe('目安は1日1,800kcal、タンパク質は75.5gです。');
  });

  it('handles empty and nullish input', () => {
    expect(formatElenaText('')).toBe('');
    expect(formatElenaText(null)).toBe('');
    expect(formatElenaText(undefined)).toBe('');
  });

  it('trims a trailing newline it would otherwise leave', () => {
    expect(formatElenaText('終わりです。')).toBe('終わりです。');
  });
});
