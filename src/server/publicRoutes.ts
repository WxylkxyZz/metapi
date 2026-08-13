export function isPublicApiRoute(url: string): boolean {
  return url.startsWith('/api/oauth/callback/');
}
