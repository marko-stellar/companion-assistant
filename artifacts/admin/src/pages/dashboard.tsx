import { useGetAdminDashboard } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, Activity, Bot } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function Dashboard() {
  const { data, isLoading } = useGetAdminDashboard();

  if (isLoading) {
    return (
      <div className="p-8 space-y-8 flex-1 overflow-y-auto">
        <div>
          <Skeleton className="h-10 w-48 mb-2" />
          <Skeleton className="h-5 w-64" />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-8 space-y-8 flex-1 overflow-y-auto">
      <div>
        <h1 className="text-3xl font-serif tracking-tight text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of the COMPANION system.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.totalUsers}</div>
            <p className="text-xs text-muted-foreground mt-1">Registered seniors in the system</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Users</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.activeUsers}</div>
            <p className="text-xs text-muted-foreground mt-1">Currently marked active</p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Companions</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4 mt-2">
              {data.companionDistribution.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data available.</p>
              ) : (
                data.companionDistribution.map((c) => (
                  <div key={c.companionId || "unassigned"} className="flex items-center">
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">{c.companionName}</p>
                    </div>
                    <div className="font-medium text-sm">{c.count} {c.count === 1 ? 'user' : 'users'}</div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
