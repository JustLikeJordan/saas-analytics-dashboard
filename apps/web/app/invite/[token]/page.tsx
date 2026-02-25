import type { Metadata } from 'next';
import InviteAccept from './InviteAccept';

export const metadata: Metadata = {
  title: 'Join Organization — SaaS Analytics Dashboard',
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <InviteAccept token={token} />
    </div>
  );
}
