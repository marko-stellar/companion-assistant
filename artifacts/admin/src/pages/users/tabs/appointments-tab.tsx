import { useState } from "react";
import { Clock, MapPin, Pencil, Plus, Power, X } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminAppointments,
  getListAdminAppointmentsQueryKey,
  useCreateAdminAppointment,
  useUpdateAdminAppointment,
  useDeleteAdminAppointment,
  type Appointment,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  datetimeLocalToUtcIso,
  utcIsoToDatetimeLocal,
  formatInTimezone,
} from "@/lib/datetime";

const appointmentSchema = z
  .object({
    title: z.string().min(1, "Title is required"),
    details: z.string().optional(),
    location: z.string().optional(),
    startsAt: z.string().min(1, "Start time is required"),
    endsAt: z.string().optional(),
    isActive: z.boolean(),
  })
  .superRefine((val, ctx) => {
    if (val.endsAt && new Date(val.endsAt) <= new Date(val.startsAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAt"],
        message: "End must be after start",
      });
    }
  });
type AppointmentValues = z.infer<typeof appointmentSchema>;

function AppointmentForm({
  userId,
  appointment,
  onClose,
}: {
  userId: string;
  appointment: Appointment | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getListAdminAppointmentsQueryKey(userId),
    });

  const createMutation = useCreateAdminAppointment({
    mutation: { onSuccess: () => { invalidate(); onClose(); } },
  });
  const updateMutation = useUpdateAdminAppointment({
    mutation: { onSuccess: () => { invalidate(); onClose(); } },
  });

  const form = useForm<AppointmentValues>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      title: appointment?.title ?? "",
      details: appointment?.details ?? "",
      location: appointment?.location ?? "",
      startsAt: appointment ? utcIsoToDatetimeLocal(appointment.startsAtUtc) : "",
      endsAt: appointment?.endsAtUtc
        ? utcIsoToDatetimeLocal(appointment.endsAtUtc)
        : "",
      isActive: appointment?.isActive ?? true,
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = async (values: AppointmentValues) => {
    const base = {
      title: values.title.trim(),
      details: values.details?.trim() || null,
      location: values.location?.trim() || null,
      startsAtUtc: datetimeLocalToUtcIso(values.startsAt),
      endsAtUtc: values.endsAt ? datetimeLocalToUtcIso(values.endsAt) : null,
    };
    if (appointment) {
      await updateMutation.mutateAsync({
        id: appointment.id,
        data: { ...base, isActive: values.isActive },
      });
    } else {
      await createMutation.mutateAsync({ id: userId, data: base });
    }
  };

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>
            {appointment ? "Edit Appointment" : "New Appointment"}
          </CardTitle>
          <CardDescription>
            Enter times in your local time — they're stored in UTC.
          </CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close form">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. Doctor visit" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. City Clinic, Room 4" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="details"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Details (optional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} placeholder="Notes…" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="startsAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Starts</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endsAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ends (optional)</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {appointment && (
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Active</FormLabel>
                      <FormDescription>
                        Inactive appointments are hidden from the tablet.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}

            <div className="flex justify-end gap-3 pt-2 border-t">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? "Saving…"
                  : appointment
                    ? "Save Changes"
                    : "Create Appointment"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

export function AppointmentsTab({
  userId,
  timezone,
}: {
  userId: string;
  timezone?: string;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useListAdminAppointments(userId, undefined, {
    query: { queryKey: getListAdminAppointmentsQueryKey(userId) },
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);

  const deleteMutation = useDeleteAdminAppointment({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: getListAdminAppointmentsQueryKey(userId),
        }),
    },
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const appointments = [...(data?.appointments ?? [])].sort(
    (a, b) =>
      new Date(a.startsAtUtc).getTime() - new Date(b.startsAtUtc).getTime(),
  );

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Appointments</h3>
          <p className="text-sm text-muted-foreground">
            Doctor visits, family calls, and other scheduled events.
          </p>
        </div>
        {!formOpen && (
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Appointment
          </Button>
        )}
      </div>

      {formOpen && (
        <AppointmentForm
          key={editing?.id ?? "new"}
          userId={userId}
          appointment={editing}
          onClose={closeForm}
        />
      )}

      {appointments.length === 0 && !formOpen ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Clock className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No upcoming appointments.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {appointments.map((appt) => (
            <Card key={appt.id} className={appt.isActive ? "" : "opacity-60"}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium truncate">{appt.title}</span>
                      {!appt.isActive && (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatInTimezone(appt.startsAtUtc, timezone)}
                      {appt.endsAtUtc
                        ? ` – ${formatInTimezone(appt.endsAtUtc, timezone)}`
                        : ""}
                    </p>
                    {appt.location && (
                      <p className="text-sm text-muted-foreground inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {appt.location}
                      </p>
                    )}
                    {appt.details && (
                      <p className="text-sm text-muted-foreground">{appt.details}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditing(appt);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      Edit
                    </Button>
                    {appt.isActive && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate({ id: appt.id })}
                      >
                        <Power className="h-3.5 w-3.5 mr-1.5" />
                        Deactivate
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
