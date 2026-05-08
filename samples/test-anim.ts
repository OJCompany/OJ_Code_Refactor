// 애니메이션 테스트용

interface IRecord {
  [key: string]: IRecord | IRecord[] | string | number | boolean | null;
}

export function serialize<T>(value: T): string {
  return JSON.stringify(value);
}

export function deserialize<T>(json: string): T {
  return JSON.parse(json) as T;
}

export function pick(obj: IRecord, keys: string[]): IRecord {
  const result: IRecord = {};
  for (const k of keys) result[k] = obj[k];
  return result;
}

export function omit(obj: IRecord, keys: string[]): IRecord {
  const result: IRecord = { ...obj };
  for (const k of keys) delete result[k];
  return result;
}

export function deepEqual<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}