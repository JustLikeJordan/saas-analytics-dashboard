import { Card, CardContent, CardHeader } from '@/components/ui/card';

function SkeletonBar({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-muted ${className ?? ''}`}
      style={{ animationDuration: '1500ms', animationTimingFunction: 'ease-in-out' }}
    />
  );
}

export default function AdminLoading() {
  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <SkeletonBar className="h-8 w-48" />

      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <SkeletonBar className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <SkeletonBar className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <SkeletonBar className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonBar key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
