import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router, Switch, Route, Redirect } from 'wouter';
import { AuthProvider } from '@/contexts/auth-context';
import { AppLayout } from '@/components/layout/layout';

import { Login } from '@/pages/login';
import { Dashboard } from '@/pages/dashboard';
import { UsersList } from '@/pages/users';
import { NewUser } from '@/pages/users/new';
import { UserDetail } from '@/pages/users/detail';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  const base = import.meta.env.BASE_URL || '/';

  return (
    <QueryClientProvider client={queryClient}>
      <Router base={base}>
        <AuthProvider>
          <AppLayout>
            <Switch>
              <Route path="/login" component={Login} />
              <Route path="/dashboard" component={Dashboard} />
              <Route path="/users" component={UsersList} />
              <Route path="/users/new" component={NewUser} />
              <Route path="/users/:id" component={UserDetail} />
              
              <Route path="/">
                <Redirect to="/dashboard" />
              </Route>
              <Route>
                <div className="flex h-screen items-center justify-center">
                  <div className="text-center">
                    <h1 className="text-4xl font-bold mb-2">404</h1>
                    <p className="text-muted-foreground">Page not found.</p>
                  </div>
                </div>
              </Route>
            </Switch>
          </AppLayout>
        </AuthProvider>
      </Router>
    </QueryClientProvider>
  );
}
