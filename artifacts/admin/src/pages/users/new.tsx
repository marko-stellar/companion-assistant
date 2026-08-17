import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useCreateAdminUser, getListAdminUsersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const newUserSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  preferredFormOfAddress: z.string().optional(),
  timezone: z.string().min(1, "Timezone is required"),
  language: z.enum(["en", "hr"]),
  isActive: z.boolean().default(true),
});

type NewUserFormValues = z.infer<typeof newUserSchema>;

export function NewUser() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createMutation = useCreateAdminUser({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
        setLocation(`/users/${data.id}`);
      }
    }
  });

  const form = useForm<NewUserFormValues>({
    resolver: zodResolver(newUserSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      preferredFormOfAddress: "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: "en",
      isActive: true,
    },
  });

  const onSubmit = async (values: NewUserFormValues) => {
    await createMutation.mutateAsync({ data: values });
  };

  return (
    <div className="p-8 max-w-3xl mx-auto w-full">
      <div className="mb-6">
        <Link href="/users" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-primary transition-colors mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Users
        </Link>
        <h1 className="text-3xl font-serif tracking-tight text-foreground">Add New Senior</h1>
        <p className="text-muted-foreground mt-1">Create a new profile for a senior under care.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>Enter the personal details to initialize the account.</CardDescription>
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
                        <Input placeholder="Jane" {...field} />
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
                        <Input placeholder="Doe" {...field} />
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
                      <Input placeholder="e.g. Mrs. Doe, Jane, Nana" {...field} value={field.value || ""} />
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

              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create Profile"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
