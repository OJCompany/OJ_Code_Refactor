async function fetchUser(id: string): Promise<any> {
  const res = await fetch(`/api/users/${id}`);
  const data: any = await res.json();
  return data;
}

function parseResponse(raw: any): any {
  if (!raw || !raw.data) return null;
  return raw.data;
}

const cache: Array<any> = [];

function processUsers(users: any[]): any[] {
  return users.map((u: any) => ({
    id: u.id,
    name: u.name,
  }));
}
