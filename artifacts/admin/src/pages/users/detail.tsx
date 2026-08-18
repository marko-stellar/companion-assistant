import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "wouter";
import { ArrowLeft, Check, ShieldAlert, Clock, Calendar, Image as ImageIcon, Brain, ListChecks, MessageSquare, Shield, User, Bot, Phone, Tablet, RefreshCw, Trash2, Wifi, WifiOff } from "lucide-react";
import { 
  useGetAdminUser, 
  getGetAdminUserQueryKey,
  useUpdateAdminUser,
  useListAdminCompanions,
  useGetEmergencyContact,
  getGetEmergencyContactQueryKey,
  useUpsertEmergencyContact,
  useGetDndPeriod,
  getGetDndPeriodQueryKey,
  useUpsertDndPeriod,
  useGetDeviceStatus,
  getGetDeviceStatusQueryKey,
  useGenerateDeviceCode,
  useRevokeDeviceSession,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";

// -----------------------------------------------------------------------------
// PROFILE TAB
// -----------------------------------------------------------------------------
const profileSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  preferredFormOfAddress: z.string().nullable().optional(),
  timezone: z.string().min(1, "Timezone is required"),
  language: z.enum(["en", "hr"]),
  isActive: z.boolean(),
  deviceIdentifier: z.string().nullable().optional(),
});
type ProfileValues = z.infer<typeof profileSchema>;

function ProfileTab({ user }: { user: any }) {
  const queryClient = useQueryClient();
  const updateMutation = useUpdateAdminUser({
    mutation: {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetAdminUserQueryKey(user.id), data);
      }
    }
  });

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      preferredFormOfAddress: user.preferredFormOfAddress || "",
      timezone: user.timezone || "America/New_York",
      language: user.language as "en" | "hr",
      isActive: user.isActive,
      deviceIdentifier: user.deviceIdentifier || "",
    },
  });

  const onSubmit = async (values: ProfileValues) => {
    await updateMutation.mutateAsync({
      id: user.id,
      data: values
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Details</CardTitle>
        <CardDescription>Manage personal information and system access.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="preferredFormOfAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Preferred Form of Address</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value || ""} />
                  </FormControl>
                  <FormDescription>How the companion should address them.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Timezone</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a timezone" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                        <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                        <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                        <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                        <SelectItem value="Europe/London">London (GMT)</SelectItem>
                        <SelectItem value="Europe/Zagreb">Zagreb (CET/CEST)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Primary Language</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a language" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="hr">Croatian</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="deviceIdentifier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Device Identifier</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value || ""} placeholder="Tablet serial or MAC address" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Active Account</FormLabel>
                    <FormDescription>
                      When inactive, the tablet interface will not function.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end pt-4 border-t">
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// COMPANION TAB
// -----------------------------------------------------------------------------
function CompanionTab({ user }: { user: any }) {
  const queryClient = useQueryClient();
  const { data: companions, isLoading } = useListAdminCompanions();
  
  const updateMutation = useUpdateAdminUser({
    mutation: {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetAdminUserQueryKey(user.id), data);
      }
    }
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const handleSelect = (companionId: string) => {
    updateMutation.mutate({ id: user.id, data: { companionId } });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        {companions?.map(companion => {
          const isSelected = user.companionId === companion.id;
          return (
            <div 
              key={companion.id}
              onClick={() => handleSelect(companion.id)}
              className={`relative overflow-hidden cursor-pointer rounded-xl border-2 p-6 transition-all ${
                isSelected 
                  ? "border-primary bg-primary/5 shadow-sm" 
                  : "border-transparent bg-card hover:bg-accent/50"
              }`}
            >
              {isSelected && (
                <div className="absolute top-4 right-4 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                  <Check className="h-4 w-4" />
                </div>
              )}
              <div className="flex items-center gap-4 mb-3">
                <div className={`h-12 w-12 rounded-full flex items-center justify-center ${isSelected ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                  <Bot className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{companion.name}</h3>
                  <p className="text-sm text-muted-foreground capitalize">{companion.gender}</p>
                </div>
              </div>
              {companion.tagline && (
                <p className="text-sm text-muted-foreground mt-2 italic">"{companion.tagline}"</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// EMERGENCY CONTACT TAB
// -----------------------------------------------------------------------------
const emergencySchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(5, "Phone is required"),
  relationship: z.string().optional(),
  isActive: z.boolean().default(true),
});
type EmergencyValues = z.infer<typeof emergencySchema>;

function EmergencyContactTab({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useGetEmergencyContact(userId, { query: { retry: false } });
  
  const upsertMutation = useUpsertEmergencyContact({
    mutation: {
      onSuccess: (newData) => {
        queryClient.setQueryData(getGetEmergencyContactQueryKey(userId), newData);
      }
    }
  });

  const form = useForm<EmergencyValues>({
    resolver: zodResolver(emergencySchema),
    defaultValues: {
      name: "",
      phone: "",
      relationship: "",
      isActive: true,
    },
  });

  useEffect(() => {
    if (data) {
      form.reset({
        name: data.name,
        phone: data.phone,
        relationship: data.relationship || "",
        isActive: data.isActive,
      });
    }
  }, [data, form]);

  const onSubmit = async (values: EmergencyValues) => {
    await upsertMutation.mutateAsync({ id: userId, data: values });
  };

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const isNotConfigured = !data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Emergency Contact</CardTitle>
        <CardDescription>Primary contact person to notify in case of emergencies.</CardDescription>
      </CardHeader>
      <CardContent>
        {isNotConfigured && (
          <div className="mb-6 p-4 border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 rounded-lg text-amber-800 dark:text-amber-200 text-sm flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-1">Not configured</p>
              <p>Please set up an emergency contact. This information is critical for the safety features.</p>
            </div>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="John Smith" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="+1 (555) 000-0000" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="relationship"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Relationship</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} placeholder="e.g. Son, Daughter, Nurse" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Active Contact</FormLabel>
                    <FormDescription>
                      System will reach out to this contact when alerts are triggered.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end pt-4 border-t">
              <Button type="submit" disabled={upsertMutation.isPending}>
                {upsertMutation.isPending ? "Saving..." : "Save Contact"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// DND TAB
// -----------------------------------------------------------------------------
const DAYS = [
  { id: "Mon", label: "Monday" },
  { id: "Tue", label: "Tuesday" },
  { id: "Wed", label: "Wednesday" },
  { id: "Thu", label: "Thursday" },
  { id: "Fri", label: "Friday" },
  { id: "Sat", label: "Saturday" },
  { id: "Sun", label: "Sunday" },
];

const dndSchema = z.object({
  label: z.string().optional(),
  startTime: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Format must be HH:MM"),
  endTime: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Format must be HH:MM"),
  isActive: z.boolean(),
  recurrenceDays: z.array(z.string()),
});
type DndValues = z.infer<typeof dndSchema>;

function DndTab({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetDndPeriod(userId, { query: { retry: false } });
  
  const upsertMutation = useUpsertDndPeriod({
    mutation: {
      onSuccess: (newData) => {
        queryClient.setQueryData(getGetDndPeriodQueryKey(userId), newData);
      }
    }
  });

  const form = useForm<DndValues>({
    resolver: zodResolver(dndSchema),
    defaultValues: {
      label: "",
      startTime: "22:00",
      endTime: "07:00",
      isActive: true,
      recurrenceDays: [],
    },
  });

  useEffect(() => {
    if (data) {
      form.reset({
        label: data.label || "",
        startTime: data.startTime,
        endTime: data.endTime,
        isActive: data.isActive,
        recurrenceDays: data.recurrenceDays || [],
      });
    }
  }, [data, form]);

  const onSubmit = async (values: DndValues) => {
    await upsertMutation.mutateAsync({ id: userId, data: values });
  };

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const isNotConfigured = !data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Do Not Disturb</CardTitle>
        <CardDescription>Configure quiet hours where the companion won't initiate interactions.</CardDescription>
      </CardHeader>
      <CardContent>
        {isNotConfigured && (
          <div className="mb-6 p-4 border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-900 rounded-lg text-blue-800 dark:text-blue-200 text-sm">
            <p>DND is not currently configured. The companion may initiate check-ins at any time.</p>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormDescription>Local HH:MM</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormDescription>Local HH:MM (can be next day)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="recurrenceDays"
              render={() => (
                <FormItem>
                  <div className="mb-4">
                    <FormLabel className="text-base">Recurring Days</FormLabel>
                    <FormDescription>Select days. Leave empty to apply every day.</FormDescription>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {DAYS.map((day) => (
                      <FormField
                        key={day.id}
                        control={form.control}
                        name="recurrenceDays"
                        render={({ field }) => {
                          return (
                            <FormItem
                              key={day.id}
                              className="flex flex-row items-start space-x-2 space-y-0 bg-muted/50 px-3 py-2 rounded-md border cursor-pointer hover:bg-muted/80 transition-colors"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(day.id)}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([...field.value, day.id])
                                      : field.onChange(
                                          field.value?.filter(
                                            (value) => value !== day.id
                                          )
                                        )
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="font-normal cursor-pointer">
                                {day.label}
                              </FormLabel>
                            </FormItem>
                          )
                        }}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Enable DND Period</FormLabel>
                    <FormDescription>Toggle this schedule on or off</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end pt-4 border-t">
              <Button type="submit" disabled={upsertMutation.isPending}>
                {upsertMutation.isPending ? "Saving..." : "Save DND Rules"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// DEVICE TAB
// -----------------------------------------------------------------------------

function DeviceTab({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { data: status, isLoading } = useGetDeviceStatus(userId);

  const generateMutation = useGenerateDeviceCode({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDeviceStatusQueryKey(userId) });
      },
    },
  });

  const revokeMutation = useRevokeDeviceSession({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDeviceStatusQueryKey(userId) });
        generateMutation.reset();
      },
    },
  });

  function formatRelativeTime(date: Date | string | null | undefined): string {
    if (!date) return "Never";
    const d = typeof date === "string" ? new Date(date) : date;
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  function formatExpiry(date: Date | string | null | undefined): string {
    if (!date) return "";
    const d = typeof date === "string" ? new Date(date) : date;
    const diff = d.getTime() - Date.now();
    if (diff <= 0) return "Expired";
    const hrs = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (hrs > 0) return `Expires in ${hrs}h ${mins}m`;
    return `Expires in ${mins}m`;
  }

  const generatedCode = generateMutation.data;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Session status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Tablet className="h-4 w-4" />
            Device Status
          </CardTitle>
          <CardDescription>
            Manage the physical tablet assigned to this senior.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              {status?.hasActiveSession ? (
                <Wifi className="h-5 w-5 text-green-500" />
              ) : (
                <WifiOff className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium text-sm">
                  {status?.hasActiveSession ? "Tablet assigned" : "No tablet assigned"}
                </p>
                {status?.hasActiveSession && (
                  <p className="text-xs text-muted-foreground">
                    Last seen: {formatRelativeTime(status.lastSeenAt)}
                  </p>
                )}
              </div>
            </div>
            {status?.hasActiveSession && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => revokeMutation.mutate({ id: userId })}
                disabled={revokeMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {revokeMutation.isPending ? "Revoking…" : "Revoke"}
              </Button>
            )}
          </div>

          {revokeMutation.isSuccess && (
            <p className="text-sm text-green-600">Device session revoked. The tablet will be signed out.</p>
          )}
        </CardContent>
      </Card>

      {/* Setup code */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Setup Code</CardTitle>
          <CardDescription>
            Generate a one-time code for the senior to enter on their tablet. Valid for 24 hours.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Show existing pending code status */}
          {status?.hasPendingCode && !generatedCode && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-4 text-sm text-amber-700 dark:text-amber-400">
              A pending code already exists ({formatExpiry(status.codeExpiresAt)}). Generating a new one will invalidate it.
            </div>
          )}

          {/* Freshly generated code — show prominently */}
          {generatedCode && (
            <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-primary/30 bg-primary/5 p-6">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Setup Code — enter on the tablet
              </p>
              <p className="font-mono text-5xl tracking-[0.4em] font-bold text-primary select-all">
                {generatedCode.code}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatExpiry(generatedCode.expiresAt)}
              </p>
            </div>
          )}

          <Button
            onClick={() => generateMutation.mutate({ id: userId })}
            disabled={generateMutation.isPending}
            variant={generatedCode ? "outline" : "default"}
            className="w-full sm:w-auto"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${generateMutation.isPending ? "animate-spin" : ""}`} />
            {generateMutation.isPending
              ? "Generating…"
              : generatedCode
              ? "Regenerate Code"
              : "Generate Setup Code"}
          </Button>

          {generateMutation.isError && (
            <p className="text-sm text-destructive">Failed to generate code. Please try again.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------------
// CONVERSATIONS TAB
// -----------------------------------------------------------------------------

interface ConversationSession {
  id: string;
  userId: string;
  language: string | null;
  startedAt: string;
  endedAt: string | null;
  summary: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ConversationMessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  language: string | null;
  latencyMs: number | null;
  providerMeta: Record<string, unknown> | null;
  createdAt: string;
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return "ongoing";
  const diffMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  const mins = Math.floor(diffMs / 60000);
  const secs = Math.floor((diffMs % 60000) / 1000);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

function ConversationsTab({ userId }: { userId: string }) {
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ConversationSession | null>(null);
  const [messages, setMessages] = useState<ConversationMessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/users/${userId}/conversations`, { credentials: "include" })
      .then(r => r.json())
      .then((data: { conversations?: ConversationSession[] }) => {
        setSessions(data.conversations ?? []);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load conversations.");
        setLoading(false);
      });
  }, [userId]);

  const openSession = useCallback(async (session: ConversationSession) => {
    setSelectedSession(session);
    setLoadingMessages(true);
    setMessages([]);
    try {
      const r = await fetch(`/api/admin/conversations/${session.id}/messages`, { credentials: "include" });
      const data: { messages?: ConversationMessageItem[] } = await r.json();
      setMessages(data.messages ?? []);
    } catch {
      setMessages([]);
    }
    setLoadingMessages(false);
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="py-12 text-center text-destructive">{error}</CardContent>
      </Card>
    );
  }

  if (sessions.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-24 text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-6">
            <MessageSquare className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No conversations yet</h3>
          <p className="text-muted-foreground max-w-md">Conversations will appear here once the senior starts talking with their companion.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Session list */}
      <div className="space-y-2 lg:col-span-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1 mb-3">
          {sessions.length} session{sessions.length !== 1 ? "s" : ""}
        </p>
        {sessions.map(s => (
          <button
            key={s.id}
            onClick={() => openSession(s)}
            className={`w-full text-left rounded-lg border p-3 transition-colors hover:bg-muted/50 ${
              selectedSession?.id === s.id ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-medium text-muted-foreground">{formatDate(s.startedAt)}</span>
              {s.language && (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                  {s.language}
                </span>
              )}
            </div>
            <div className="text-sm font-medium leading-snug">
              {formatTime(s.startedAt)}
              {" · "}
              <span className="text-muted-foreground">{formatDuration(s.startedAt, s.endedAt)}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{s.messageCount} messages</span>
              {s.summary && <span>· has summary</span>}
            </div>
            {s.summary && (
              <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2 italic">{s.summary}</p>
            )}
          </button>
        ))}
      </div>

      {/* Transcript panel */}
      <div className="lg:col-span-2">
        {!selectedSession ? (
          <Card className="border-dashed h-full min-h-[300px] flex items-center justify-center">
            <CardContent className="text-center text-muted-foreground py-12">
              <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Select a session to view the transcript</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base">
                    {formatDate(selectedSession.startedAt)} · {formatTime(selectedSession.startedAt)}
                  </CardTitle>
                  <CardDescription className="mt-0.5">
                    {formatDuration(selectedSession.startedAt, selectedSession.endedAt)}
                    {" · "}
                    {selectedSession.messageCount} messages
                    {selectedSession.language && ` · ${selectedSession.language.toUpperCase()}`}
                  </CardDescription>
                </div>
                <span className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary whitespace-nowrap">
                  Read-only
                </span>
              </div>
              {selectedSession.summary && (
                <div className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground italic border border-border/50">
                  <span className="font-semibold not-italic text-foreground/70 mr-1">Summary:</span>
                  {selectedSession.summary}
                </div>
              )}
            </CardHeader>
            <CardContent>
              {loadingMessages ? (
                <div className="space-y-3 py-4">
                  <Skeleton className="h-10 w-3/4" />
                  <Skeleton className="h-10 w-2/3 ml-auto" />
                  <Skeleton className="h-10 w-3/4" />
                </div>
              ) : messages.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">No messages found.</p>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                  {messages.map(m => (
                    <div
                      key={m.id}
                      className={`flex gap-3 ${m.role === "assistant" ? "flex-row-reverse" : "flex-row"}`}
                    >
                      {/* Avatar dot */}
                      <div
                        className={`mt-1 h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          m.role === "user"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-violet-100 text-violet-700"
                        }`}
                      >
                        {m.role === "user" ? "S" : "C"}
                      </div>

                      {/* Bubble */}
                      <div className={`max-w-[75%] ${m.role === "assistant" ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                        <div
                          className={`rounded-xl px-3 py-2 text-sm leading-relaxed ${
                            m.role === "user"
                              ? "bg-muted text-foreground rounded-tl-sm"
                              : "bg-primary text-primary-foreground rounded-tr-sm"
                          }`}
                        >
                          {m.content}
                        </div>
                        <div className="flex items-center gap-2 px-1">
                          <span className="text-[10px] text-muted-foreground">{formatTime(m.createdAt)}</span>
                          {m.language && (
                            <span className="text-[10px] text-muted-foreground uppercase">{m.language}</span>
                          )}
                          {m.latencyMs != null && (
                            <span className="text-[10px] text-muted-foreground">{m.latencyMs}ms</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// MAIN COMPONENT
// -----------------------------------------------------------------------------

function PlaceholderTab({ title, description, icon: Icon }: { title: string, description: string, icon: any }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-24 text-center">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-6">
          <Icon className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-xl font-semibold mb-2">{title}</h3>
        <p className="text-muted-foreground max-w-md">{description}</p>
        <div className="mt-8 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
          Coming Soon
        </div>
      </CardContent>
    </Card>
  );
}

export function UserDetail() {
  const params = useParams();
  const id = params.id as string;
  const { data: user, isLoading } = useGetAdminUser(id, { query: { enabled: !!id } });

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-48 mb-2" />
        <Skeleton className="h-6 w-96 mb-8" />
        <Skeleton className="h-10 w-full mb-6" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[50vh]">
        <h2 className="text-xl font-semibold mb-2">User Not Found</h2>
        <p className="text-muted-foreground mb-6">The senior profile you are looking for does not exist.</p>
        <Button asChild>
          <Link href="/users">Back to Users</Link>
        </Button>
      </div>
    );
  }

  const tabs = [
    { id: "profile", label: "Profile", icon: User, component: <ProfileTab user={user} /> },
    { id: "companion", label: "Companion", icon: Bot, component: <CompanionTab user={user} /> },
    { id: "emergency", label: "Emergency", icon: Phone, component: <EmergencyContactTab userId={user.id} /> },
    { id: "dnd", label: "DND", icon: Clock, component: <DndTab userId={user.id} /> },
    { id: "reminders", label: "Reminders", icon: Calendar, component: <PlaceholderTab title="Reminders" description="Schedule daily medicine, water, and activity reminders." icon={Calendar} /> },
    { id: "appointments", label: "Appointments", icon: Clock, component: <PlaceholderTab title="Appointments" description="Manage upcoming doctor visits and family calls." icon={Clock} /> },
    { id: "photos", label: "Photos", icon: ImageIcon, component: <PlaceholderTab title="Photo Gallery" description="Upload familiar faces and places for the companion to reference." icon={ImageIcon} /> },
    { id: "memories", label: "Memories", icon: Brain, component: <PlaceholderTab title="Memories & Context" description="Provide life context—hometown, past careers, favorite music." icon={Brain} /> },
    { id: "routines", label: "Routines", icon: ListChecks, component: <PlaceholderTab title="Daily Routines" description="Set up morning and evening rituals." icon={ListChecks} /> },
    { id: "conversations", label: "Conversations", icon: MessageSquare, component: <ConversationsTab userId={user.id} /> },
    { id: "safety", label: "Safety", icon: Shield, component: <PlaceholderTab title="Safety & Alerts" description="Configure fall detection, prolonged silence, and distress word alerts." icon={Shield} /> },
    { id: "device", label: "Device", icon: Tablet, component: <DeviceTab userId={user.id} /> },
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto w-full flex-1 overflow-y-auto">
      <div className="mb-8">
        <Link href="/users" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-primary transition-colors mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Users
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-serif tracking-tight text-foreground">{user.displayName}</h1>
            <p className="text-muted-foreground mt-1">Configure settings and companion preferences.</p>
          </div>
          <div className="flex items-center gap-3">
            {!user.isActive && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-muted-foreground text-sm font-medium border">
                Inactive
              </span>
            )}
            {user.companion && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium border border-primary/20">
                <Bot className="h-4 w-4" />
                {user.companion.name}
              </span>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <div className="relative">
          <div className="overflow-x-auto pb-4 -mb-4 snap-x no-scrollbar">
            <TabsList className="inline-flex w-max min-w-full justify-start h-auto p-1 bg-muted/50 rounded-xl">
              {tabs.map(tab => (
                <TabsTrigger 
                  key={tab.id} 
                  value={tab.id}
                  className="flex items-center gap-2 py-2 px-4 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm snap-start"
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>

        <div className="mt-6">
          {tabs.map(tab => (
            <TabsContent key={tab.id} value={tab.id} className="mt-0 outline-none focus-visible:ring-0">
              {tab.component}
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
}
