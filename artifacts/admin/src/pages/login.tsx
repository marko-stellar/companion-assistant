import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/contexts/auth-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useState } from "react";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function Login() {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setError(null);
    try {
      await login({ data: values });
    } catch (err: any) {
      setError(err?.error || "Failed to log in. Please check your credentials.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Ambient decorative elements */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      
      <Card className="w-full max-w-md relative z-10 shadow-2xl border-border/50">
        <CardHeader className="space-y-3 pb-8 pt-10 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <div className="w-6 h-6 rounded-full bg-primary opacity-80" />
          </div>
          <CardTitle className="font-serif text-3xl italic font-light tracking-wide text-foreground">
            companion
          </CardTitle>
          <CardDescription className="uppercase tracking-widest text-xs font-medium text-muted-foreground">
            Administrative Access
          </CardDescription>
        </CardHeader>
        <CardContent className="px-10 pb-10">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="admin@example.com" {...field} className="bg-background/50 h-11" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} className="bg-background/50 h-11" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button 
                type="submit" 
                className="w-full h-11 text-base font-medium mt-2" 
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? "Authenticating..." : "Sign In"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
