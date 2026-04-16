import { proxyPostWithCookies } from '@/lib/bff-proxy';

export const POST = proxyPostWithCookies('/integrations/quickbooks/connect');
