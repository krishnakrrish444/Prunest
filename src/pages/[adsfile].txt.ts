import type { APIRoute, GetStaticPaths } from 'astro';
import { site } from '../config/site';

// ads.txt exists only when a real AdSense publisher ID is configured.
// With no ID, no path is returned and no file is generated.
export const getStaticPaths: GetStaticPaths = () => (site.adsenseClient ? [{ params: { adsfile: 'ads' } }] : []);

export const GET: APIRoute = () =>
  new Response(`google.com, ${site.adsenseClient!.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
