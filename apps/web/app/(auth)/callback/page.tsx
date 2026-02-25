import type { Metadata } from 'next';
import CallbackHandler from './CallbackHandler';

export const metadata: Metadata = {
  title: 'Signing in...',
};

export default async function CallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; state?: string; error?: string }>;
}) {
  const params = await searchParams;

  if (params.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm space-y-4 rounded-lg bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">Authentication Failed</h1>
          <p className="text-sm text-gray-600">
            Google denied the sign-in request. Please try again.
          </p>
          <a
            href="/login"
            className="inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Back to Sign In
          </a>
        </div>
      </div>
    );
  }

  return <CallbackHandler code={params.code} state={params.state} />;
}
