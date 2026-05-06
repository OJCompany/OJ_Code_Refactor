function deepClone(obj: any): any {
  return JSON.parse(JSON.stringify(obj));
}

function pick(obj: any, keys: string[]): any {
  const result: any = {};
  for (const key of keys) {
    if (key in obj) result[key] = obj[key];
  }
  return result;
}

function sortBy(arr: any[], key: string): any[] {
  return [...arr].sort((a: any, b: any) => {
    if (a[key] < b[key]) return -1;
    if (a[key] > b[key]) return 1;
    return 0;
  });
}

function groupBy(arr: any[], key: string): Record<string, any[]> {
  return arr.reduce((acc: any, item: any) => {
    const group = String(item[key]);
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});
}

function flatMap(arr: any[], fn: (item: any) => any): any[] {
  return arr.reduce((acc: any[], item: any) => acc.concat(fn(item)), []);
}
