import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Clock, Trash2 } from "lucide-react";
import { format } from "date-fns";

interface Event {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  status: "BUSY" | "SWAPPABLE" | "SWAP_PENDING";
}

const Dashboard = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (user) {
      fetchEvents();
      
      // Subscribe to realtime changes
      const channel = supabase
        .channel('events-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'events',
            filter: `user_id=eq.${user.id}`
          },
          () => {
            fetchEvents();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const fetchEvents = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('user_id', user.id)
      .order('start_time', { ascending: true });

    if (error) {
      toast.error("Failed to load events");
      console.error(error);
    } else {
      setEvents((data || []) as Event[]);
    }
    setLoading(false);
  };

  const handleCreateEvent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const formData = new FormData(e.currentTarget);
    const title = formData.get("title") as string;
    const startTime = formData.get("startTime") as string;
    const endTime = formData.get("endTime") as string;

    const { error } = await supabase
      .from('events')
      .insert({
        user_id: user.id,
        title,
        start_time: startTime,
        end_time: endTime,
        status: 'BUSY'
      });

    if (error) {
      toast.error("Failed to create event");
      console.error(error);
    } else {
      toast.success("Event created!");
      setDialogOpen(false);
      fetchEvents();
    }
  };

  const toggleSwappable = async (eventId: string, currentStatus: string) => {
    if (currentStatus === 'SWAP_PENDING') {
      toast.error("Cannot modify event with pending swap");
      return;
    }

    const newStatus = currentStatus === 'BUSY' ? 'SWAPPABLE' : 'BUSY';

    const { error } = await supabase
      .from('events')
      .update({ status: newStatus })
      .eq('id', eventId);

    if (error) {
      toast.error("Failed to update event");
      console.error(error);
    } else {
      toast.success(newStatus === 'SWAPPABLE' ? "Event marked as swappable" : "Event marked as busy");
      fetchEvents();
    }
  };

  const deleteEvent = async (eventId: string) => {
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', eventId);

    if (error) {
      toast.error("Failed to delete event");
      console.error(error);
    } else {
      toast.success("Event deleted");
      fetchEvents();
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'BUSY':
        return <Badge variant="default">Busy</Badge>;
      case 'SWAPPABLE':
        return <Badge variant="success">Swappable</Badge>;
      case 'SWAP_PENDING':
        return <Badge variant="warning">Pending Swap</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">My Calendar</h1>
            <p className="text-muted-foreground">Manage your time slots</p>
          </div>
          
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Event
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreateEvent}>
                <DialogHeader>
                  <DialogTitle>Create New Event</DialogTitle>
                  <DialogDescription>
                    Add a new time slot to your calendar
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      name="title"
                      placeholder="Team Meeting"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="startTime">Start Time</Label>
                    <Input
                      id="startTime"
                      name="startTime"
                      type="datetime-local"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endTime">End Time</Label>
                    <Input
                      id="endTime"
                      name="endTime"
                      type="datetime-local"
                      required
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit">Create Event</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          </div>
        ) : events.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Clock className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">No events yet</p>
              <p className="text-sm text-muted-foreground">Create your first event to get started</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <Card key={event.id} className="transition-shadow hover:shadow-lg">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{event.title}</CardTitle>
                    {getStatusBadge(event.status)}
                  </div>
                  <CardDescription>
                    {format(new Date(event.start_time), "PPp")}
                    <br />
                    to {format(new Date(event.end_time), "p")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Button
                      variant={event.status === 'SWAPPABLE' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleSwappable(event.id, event.status)}
                      className="flex-1"
                      disabled={event.status === 'SWAP_PENDING'}
                    >
                      {event.status === 'SWAPPABLE' ? 'Mark Busy' : 'Make Swappable'}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteEvent(event.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
