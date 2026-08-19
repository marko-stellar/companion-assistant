/**
 * SafetyTab — safety events for a senior user: what was detected, what was
 * sent to family, and delivery status (including visible failures).
 *
 * Honest by design: an alert is only shown as "Sent" when the SMS provider
 * confirmed delivery; failures show the provider error. Emergency services
 * are never contacted — the copy makes that explicit.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  MessageSquareWarning,
  Send,
} from "lucide-react";
import {
  useGetAdminUserSafetyEvents,
  getGetAdminUserSafetyEventsQueryKey,
  useResolveAdminSafetyEvent,
  useSendAdminSafetyTestSMS,
  type SafetyEvent,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const CATEGORY_LABELS: Record<string, string> = {
  FALL: "Fall",
  CHEST_PAIN: "Chest pain",
  BREATHING: "Breathing difficulty",
  SELF_HARM: "Self-harm risk",
  OTHER_URGENT: "Urgent concern",
};

function AlertStatusBadge({ event }: { event: SafetyEvent }) {
  switch (event.alertStatus) {
    case "SENT":
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          SMS sent{event.recipientName ? ` to ${event.recipientName}` : ""}
        </Badge>
      );
    case "SIMULATED":
      return (
        <Badge variant="secondary">
          <MessageSquareWarning className="mr-1 h-3 w-3" />
          Simulated (test mode — no real SMS)
        </Badge>
      );
    case "FAILED":
      return (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" />
          SMS failed
        </Badge>
      );
    case "PENDING":
    case "SENDING":
      return (
        <Badge variant="secondary">
          <Clock className="mr-1 h-3 w-3" />
          {event.alertStatus === "SENDING" ? "Sending…" : "Pending"}
        </Badge>
      );
    default:
      return <Badge variant="outline">No alert sent</Badge>;
  }
}

function EventCard({ event, userId }: { event: SafetyEvent; userId: string }) {
  const queryClient = useQueryClient();
  const resolveMutation = useResolveAdminSafetyEvent({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: getGetAdminUserSafetyEventsQueryKey(userId),
        });
      },
    },
  });

  return (
    <Card className={event.resolved ? "opacity-70" : "border-red-200"}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert
              className={`h-4 w-4 ${event.resolved ? "text-muted-foreground" : "text-red-600"}`}
            />
            <CardTitle className="text-base">
              {CATEGORY_LABELS[event.category] ?? event.category}
            </CardTitle>
            <Badge variant={event.severity === "high" ? "destructive" : "secondary"}>
              {event.severity}
            </Badge>
            {event.confidence != null && (
              <span className="text-xs text-muted-foreground">
                confidence {(event.confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <AlertStatusBadge event={event} />
            {event.resolved ? (
              <Badge variant="outline">Resolved</Badge>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={resolveMutation.isPending}
                onClick={() => resolveMutation.mutate({ id: event.id })}
              >
                Mark resolved
              </Button>
            )}
          </div>
        </div>
        <CardDescription>
          {new Date(event.createdAt).toLocaleString()}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {event.triggerText && (
          <p className="rounded-md bg-muted p-2 italic">"{event.triggerText}"</p>
        )}
        {event.alertStatus === "FAILED" && event.providerError && (
          <p className="text-red-600">
            Delivery failed after {event.smsAttempts} attempt
            {event.smsAttempts === 1 ? "" : "s"}: {event.providerError}
          </p>
        )}
        {event.alertStatus === "SIMULATED" && (
          <p className="text-amber-700">
            Development test mode: delivery was simulated — no real message
            reached the family. Configure an SMS provider for real alerts.
          </p>
        )}
        {event.alertStatus === "SENT" && (
          <p className="text-muted-foreground">
            Family notified{event.recipientPhone ? ` at ${event.recipientPhone}` : ""}
            {event.smsSentAt ? ` · ${new Date(event.smsSentAt).toLocaleString()}` : ""}.
            Emergency services were not contacted.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function TestSMSCard() {
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const testMutation = useSendAdminSafetyTestSMS({
    mutation: {
      onSuccess: (data) => {
        if (data.success && data.simulated) {
          setResult(
            "Simulated only (development test mode) — no real SMS was sent. Configure an SMS provider for real delivery.",
          );
        } else if (data.success) {
          setResult("Test message delivered successfully.");
        } else {
          setResult(`Delivery failed: ${data.error ?? "unknown error"}`);
        }
      },
      onError: (err) => {
        setResult(
          `Request failed: ${err instanceof Error ? err.message : "invalid input"}`,
        );
      },
    },
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareWarning className="h-4 w-4" />
          Test the alert system
        </CardTitle>
        <CardDescription>
          Sends a clearly labelled TEST message to the number below. No safety
          event is created and no real alert is triggered.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Input
            placeholder="+385 91 ..."
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="max-w-xs"
          />
          <Button
            disabled={testMutation.isPending || phone.trim().length < 6}
            onClick={() => {
              setResult(null);
              testMutation.mutate({ data: { phone: phone.trim() } });
            }}
          >
            <Send className="mr-1 h-4 w-4" />
            Send test SMS
          </Button>
        </div>
        {result && (
          <p
            className={`mt-2 text-sm ${
              result.startsWith("Test message")
                ? "text-green-700"
                : result.startsWith("Simulated")
                  ? "text-amber-700"
                  : "text-red-600"
            }`}
          >
            {result}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function SafetyTab({ userId }: { userId: string }) {
  const { data, isLoading, refetch } = useGetAdminUserSafetyEvents(userId);
  const events = data?.events ?? [];
  const unresolved = events.filter((e) => !e.resolved);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Safety events</h3>
          <p className="text-sm text-muted-foreground">
            Urgent concerns detected in conversation. Alerts go to the primary
            emergency contact only — emergency services are never contacted
            automatically.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RefreshCw className="mr-1 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <TestSMSCard />

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No safety events recorded. That's good news.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {unresolved.length > 0 && (
            <p className="text-sm font-medium text-red-700">
              {unresolved.length} unresolved event
              {unresolved.length === 1 ? "" : "s"}
            </p>
          )}
          {events.map((event) => (
            <EventCard key={event.id} event={event} userId={userId} />
          ))}
        </div>
      )}
    </div>
  );
}
