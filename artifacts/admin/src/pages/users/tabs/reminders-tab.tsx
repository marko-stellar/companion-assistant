import { useState } from "react";
import { Calendar, Pencil, Plus, Pill, Power, X } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminReminders,
  getListAdminRemindersQueryKey,
  useCreateAdminReminder,
  useUpdateAdminReminder,
  useDeleteAdminReminder,
  useListAdminReminderOccurrences,
  getListAdminReminderOccurrencesQueryKey,
  type Reminder,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatInTimezone, formatLocalHHMM } from "@/lib/datetime";

const WEEKDAYS = [
  { id: "MON", label: "Mon" },
  { id: "TUE", label: "Tue" },
  { id: "WED", label: "Wed" },
  { id: "THU", label: "Thu" },
  { id: "FRI", label: "Fri" },
  { id: "SAT", label: "Sat" },
  { id: "SUN", label: "Sun" },
] as const;

const reminderSchema = z
  .object({
    title: z.string().min(1, "Title is required"),
    description: z.string().optional(),
    type: z.enum(["GENERAL", "MEDICATION"]),
    medicationName: z.string().optional(),
    localTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format must be HH:MM"),
    recurrenceDays: z.array(z.string()),
    localDate: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === "MEDICATION" && !val.medicationName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["medicationName"],
        message: "Medication name is required for medication reminders",
      });
    }
    if (val.recurrenceDays.length === 0 && !val.localDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["localDate"],
        message: "Pick a date for a one-time reminder, or select repeat days",
      });
    }
  });
type ReminderValues = z.infer<typeof reminderSchema>;

function ReminderForm({
  userId,
  reminder,
  onClose,
}: {
  userId: string;
  reminder: Reminder | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getListAdminRemindersQueryKey(userId),
    });

  const createMutation = useCreateAdminReminder({
    mutation: { onSuccess: () => { invalidate(); onClose(); } },
  });
  const updateMutation = useUpdateAdminReminder({
    mutation: {
      onSuccess: () => {
        invalidate();
        if (reminder) {
          queryClient.invalidateQueries({
            queryKey: getListAdminReminderOccurrencesQueryKey(reminder.id),
          });
        }
        onClose();
      },
    },
  });

  const form = useForm<ReminderValues>({
    resolver: zodResolver(reminderSchema),
    defaultValues: {
      title: reminder?.title ?? "",
      description: reminder?.description ?? "",
      type: reminder?.type ?? "GENERAL",
      medicationName: reminder?.medicationName ?? "",
      localTime: reminder?.localTime ?? "09:00",
      recurrenceDays: reminder?.recurrenceDays ?? [],
      localDate: reminder?.localDate ?? "",
    },
  });

  const type = form.watch("type");
  const recurrenceDays = form.watch("recurrenceDays");
  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = async (values: ReminderValues) => {
    const payload = {
      title: values.title.trim(),
      description: values.description?.trim() || null,
      type: values.type,
      medicationName:
        values.type === "MEDICATION" ? values.medicationName?.trim() || null : null,
      localTime: values.localTime,
      recurrenceDays: values.recurrenceDays as Reminder["recurrenceDays"],
      localDate:
        values.recurrenceDays.length === 0 ? values.localDate || null : null,
    };
    if (reminder) {
      await updateMutation.mutateAsync({ id: reminder.id, data: payload });
    } else {
      await createMutation.mutateAsync({ id: userId, data: payload });
    }
  };

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>{reminder ? "Edit Reminder" : "New Reminder"}</CardTitle>
          <CardDescription>
            Times are in the senior's local timezone.
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
                      <Input {...field} placeholder="e.g. Morning medication" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="GENERAL">General</SelectItem>
                        <SelectItem value="MEDICATION">Medication</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {type === "MEDICATION" && (
              <FormField
                control={form.control}
                name="medicationName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Medication Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. Lisinopril 10mg" />
                    </FormControl>
                    <FormDescription>
                      The tablet asks for a YES/NO confirmation for medication reminders.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Details (optional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} placeholder="Extra instructions…" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="localTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {recurrenceDays.length === 0 && (
                <FormField
                  control={form.control}
                  name="localDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date (one-time)</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <FormField
              control={form.control}
              name="recurrenceDays"
              render={() => (
                <FormItem>
                  <FormLabel>Repeat on</FormLabel>
                  <div className="flex flex-wrap gap-4">
                    {WEEKDAYS.map((day) => (
                      <FormField
                        key={day.id}
                        control={form.control}
                        name="recurrenceDays"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value.includes(day.id)}
                                onCheckedChange={(checked) => {
                                  field.onChange(
                                    checked
                                      ? [...field.value, day.id]
                                      : field.value.filter((d) => d !== day.id),
                                  );
                                }}
                              />
                            </FormControl>
                            <FormLabel className="font-normal">{day.label}</FormLabel>
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                  <FormDescription>
                    Leave all days unchecked for a one-time reminder.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-2 border-t">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving…" : reminder ? "Save Changes" : "Create Reminder"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function OccurrenceTimeline({
  reminderId,
  timezone,
}: {
  reminderId: string;
  timezone?: string;
}) {
  const { data, isLoading } = useListAdminReminderOccurrences(reminderId, {
    query: {
      queryKey: getListAdminReminderOccurrencesQueryKey(reminderId),
    },
  });

  if (isLoading) return <Skeleton className="h-5 w-64" />;
  const upcoming = (data?.occurrences ?? []).slice(0, 3);
  if (!upcoming.length) {
    return (
      <p className="text-xs text-muted-foreground">No upcoming occurrences.</p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Next:</span>
      {upcoming.map((occ) => (
        <span
          key={occ.id}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
        >
          <Calendar className="h-3 w-3" />
          {formatInTimezone(occ.scheduledForUtc, timezone)}
        </span>
      ))}
    </div>
  );
}

export function RemindersTab({
  userId,
  timezone,
}: {
  userId: string;
  timezone?: string;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useListAdminReminders(userId, undefined, {
    query: { queryKey: getListAdminRemindersQueryKey(userId) },
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);

  const deleteMutation = useDeleteAdminReminder({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: getListAdminRemindersQueryKey(userId),
        }),
    },
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const reminders = (data?.reminders ?? []).filter((r) => r.isActive);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (r: Reminder) => {
    setEditing(r);
    setFormOpen(true);
  };
  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Reminders</h3>
          <p className="text-sm text-muted-foreground">
            Daily medicine, water, and activity reminders spoken by the companion.
          </p>
        </div>
        {!formOpen && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New Reminder
          </Button>
        )}
      </div>

      {formOpen && (
        <ReminderForm
          key={editing?.id ?? "new"}
          userId={userId}
          reminder={editing}
          onClose={closeForm}
        />
      )}

      {reminders.length === 0 && !formOpen ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Calendar className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No active reminders yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reminders.map((reminder) => (
            <Card key={reminder.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={reminder.type === "MEDICATION" ? "default" : "secondary"}
                      >
                        {reminder.type === "MEDICATION" ? (
                          <span className="inline-flex items-center gap-1">
                            <Pill className="h-3 w-3" /> Medication
                          </span>
                        ) : (
                          "General"
                        )}
                      </Badge>
                      <span className="font-medium truncate">{reminder.title}</span>
                      {reminder.type === "MEDICATION" && reminder.medicationName && (
                        <span className="text-sm text-muted-foreground truncate">
                          · {reminder.medicationName}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatLocalHHMM(reminder.localTime)}
                      {reminder.recurrenceDays.length > 0
                        ? ` · ${reminder.recurrenceDays.join(", ")}`
                        : reminder.localDate
                          ? ` · once on ${reminder.localDate}`
                          : " · one-time"}
                    </p>
                    <OccurrenceTimeline
                      reminderId={reminder.id}
                      timezone={timezone}
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(reminder)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate({ id: reminder.id })}
                    >
                      <Power className="h-3.5 w-3.5 mr-1.5" />
                      Deactivate
                    </Button>
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
