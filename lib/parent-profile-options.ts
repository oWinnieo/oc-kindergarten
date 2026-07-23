export const PARENT_LANGUAGE_OPTIONS = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
] as const;

export const PARENT_TIMEZONE_OPTIONS = [
  { value: 'Asia/Shanghai', label: '中国' },
  { value: 'America/New_York', label: '美国' },
  { value: 'Europe/London', label: '英国' },
  { value: 'Asia/Tokyo', label: '日本' },
  { value: 'Asia/Seoul', label: '韩国' },
  { value: 'Asia/Singapore', label: '新加坡' },
] as const;

function optionValue(
  options: readonly { value: string; label: string }[],
  value: string | undefined,
): string {
  return options.some((option) => option.value === value) ? (value ?? '') : '';
}

function optionLabel(
  options: readonly { value: string; label: string }[],
  value: string | undefined,
): string {
  return options.find((option) => option.value === value)?.label ?? '未设置';
}

export function parentLanguageValue(value: string | undefined): string {
  if (!value) return '';
  const exact = optionValue(PARENT_LANGUAGE_OPTIONS, value);
  if (exact) return exact;
  const base = value.split('-')[0]?.toLowerCase();
  return optionValue(PARENT_LANGUAGE_OPTIONS, base === 'zh' ? 'zh-CN' : base);
}

export function parentTimezoneValue(value: string | undefined): string {
  return optionValue(PARENT_TIMEZONE_OPTIONS, value);
}

export function parentLanguageLabel(value: string | undefined): string {
  return optionLabel(PARENT_LANGUAGE_OPTIONS, parentLanguageValue(value));
}

export function parentTimezoneLabel(value: string | undefined): string {
  return optionLabel(PARENT_TIMEZONE_OPTIONS, value);
}
