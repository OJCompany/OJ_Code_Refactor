async function fetchUser(id: string): Promise<any> {
  const res = await fetch(`/api/users/${id}`);
  const data: any = await res.json();
  return data;
}

function parseUserProfile(raw: any): any {
  const profile: any = {};
  profile.name = raw.name ?? 'Unknown';
  profile.age = parseInt(raw.age, 10);
  profile.roles = (raw.roles ?? []).map((r: any) => r.toUpperCase());
  return profile;
}

function mergeResponses(a: any, b: any): any {
  return { ...a, ...b, merged: true };
}

async function loadDashboard(userId: string): Promise<any> {
  const user: any = await fetchUser(userId);
  const profile: any = parseUserProfile(user);

  const settingsRes = await fetch(`/api/settings/${userId}`);
  const settings: any = await settingsRes.json();

  return mergeResponses(profile, settings);
}

function extractError(response: any): string {
  if (response.error && response.error.message) {
    return response.error.message;
  }
  return 'Unknown error';
}
