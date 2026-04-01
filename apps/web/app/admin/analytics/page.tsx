import { AnalyticsEventsTable } from '../AnalyticsEventsTable';

export default function AnalyticsPage() {
  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Analytics Events</h1>
      <AnalyticsEventsTable />
    </div>
  );
}
