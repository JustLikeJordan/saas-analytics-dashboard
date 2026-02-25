import type { Metadata } from 'next';
import LoginButton from './LoginButton';

export const metadata: Metadata = {
  title: 'Sign In — SaaS Analytics Dashboard',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const params = await searchParams;
  const redirectPath = params.redirect ?? '/dashboard';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-8 rounded-lg bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-gray-900">SaaS Analytics</h1>
          <p className="mt-2 text-sm text-gray-600">
            AI-powered insights for your business data
          </p>
        </div>

        <LoginButton redirectPath={redirectPath} />

        <p className="text-center text-xs text-gray-500">
          By signing in, you agree to our terms of service.
        </p>
      </div>
    </div>
  );
}
