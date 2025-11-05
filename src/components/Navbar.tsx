import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Calendar, LogOut, Store, Bell } from "lucide-react";

export const Navbar = () => {
  const { user, signOut } = useAuth();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="border-b bg-card">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <Calendar className="h-6 w-6 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold">SlotSwapper</span>
        </Link>

        {user && (
          <div className="flex items-center gap-2">
            <Link to="/">
              <Button
                variant={isActive("/") ? "default" : "ghost"}
                size="sm"
              >
                <Calendar className="mr-2 h-4 w-4" />
                My Calendar
              </Button>
            </Link>
            <Link to="/marketplace">
              <Button
                variant={isActive("/marketplace") ? "default" : "ghost"}
                size="sm"
              >
                <Store className="mr-2 h-4 w-4" />
                Marketplace
              </Button>
            </Link>
            <Link to="/requests">
              <Button
                variant={isActive("/requests") ? "default" : "ghost"}
                size="sm"
              >
                <Bell className="mr-2 h-4 w-4" />
                Requests
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut()}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        )}
      </div>
    </nav>
  );
};
