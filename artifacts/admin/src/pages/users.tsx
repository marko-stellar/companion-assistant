import { useState } from "react";
import { Link } from "wouter";
import { Search, Plus, UserCircle, Clock } from "lucide-react";
import { useListAdminUsers } from "@workspace/api-client-react";
import { format } from "date-fns";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/lib/use-debounce";

export function UsersList() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const { data: users, isLoading } = useListAdminUsers(
    debouncedSearch ? { search: debouncedSearch } : {}
  );

  return (
    <div className="p-8 flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-serif tracking-tight text-foreground">Seniors</h1>
          <p className="text-muted-foreground mt-1">Manage users receiving care.</p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/users/new">
            <Plus className="h-4 w-4" />
            Add Senior
          </Link>
        </Button>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by name..." 
            className="pl-9 bg-card"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="border rounded-xl bg-card flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Companion</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Timezone</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : !users || users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <UserCircle className="h-12 w-12 mb-4 opacity-20" />
                      <p className="font-medium text-foreground">No users found</p>
                      <p className="text-sm">Try adjusting your search or add a new senior.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id} className="group">
                    <TableCell className="font-medium">
                      <Link href={`/users/${user.id}`} className="hover:underline hover:text-primary transition-colors">
                        {user.displayName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {user.companionName ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary text-secondary-foreground text-xs font-medium">
                          {user.companionName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs italic">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.isActive ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          Inactive
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm flex items-center gap-1.5 mt-1">
                      <Clock className="h-3 w-3" />
                      {user.timezone}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(user.createdAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/users/${user.id}`}>
                          Manage
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
