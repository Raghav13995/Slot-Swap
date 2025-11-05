import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Store, ArrowRightLeft } from "lucide-react";
import { format } from "date-fns";

interface Event {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  status: string;
  user_id: string;
  profiles?: {
    full_name: string;
  };
}

const Marketplace = () => {
  const { user } = useAuth();
  const [swappableSlots, setSwappableSlots] = useState<Event[]>([]);
  const [mySwappableSlots, setMySwappableSlots] = useState<Event[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (user) {
      fetchSwappableSlots();
      fetchMySwappableSlots();
    }
  }, [user]);

  const fetchSwappableSlots = async () => {
    if (!user) return;

    // First get events
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('*')
      .eq('status', 'SWAPPABLE')
      .neq('user_id', user.id)
      .order('start_time', { ascending: true });

    if (eventsError) {
      toast.error("Failed to load marketplace");
      console.error(eventsError);
      setLoading(false);
      return;
    }

    // Then get profiles for those events
    if (events && events.length > 0) {
      const userIds = events.map(e => e.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', userIds);

      if (!profilesError && profiles) {
        const enrichedEvents = events.map(event => {
          const profile = profiles.find(p => p.user_id === event.user_id);
          return {
            ...event,
            profiles: profile ? { full_name: profile.full_name } : { full_name: 'Unknown' }
          };
        });
        setSwappableSlots(enrichedEvents as Event[]);
      } else {
        setSwappableSlots(events as Event[]);
      }
    } else {
      setSwappableSlots([]);
    }
    
    setLoading(false);
  };

  const fetchMySwappableSlots = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'SWAPPABLE')
      .order('start_time', { ascending: true });

    if (error) {
      console.error(error);
    } else {
      setMySwappableSlots(data || []);
    }
  };

  const requestSwap = async (myEventId: string) => {
    if (!user || !selectedSlot) return;

    // Create swap request
    const { error } = await supabase
      .from('swap_requests')
      .insert({
        requester_id: user.id,
        requester_event_id: myEventId,
        recipient_id: selectedSlot.user_id,
        recipient_event_id: selectedSlot.id,
        status: 'PENDING'
      });

    if (error) {
      toast.error("Failed to create swap request");
      console.error(error);
      return;
    }

    // Update both events to SWAP_PENDING
    const { error: updateError } = await supabase
      .from('events')
      .update({ status: 'SWAP_PENDING' })
      .in('id', [myEventId, selectedSlot.id]);

    if (updateError) {
      toast.error("Failed to update event status");
      console.error(updateError);
    } else {
      toast.success("Swap request sent!");
      setDialogOpen(false);
      setSelectedSlot(null);
      fetchSwappableSlots();
      fetchMySwappableSlots();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Marketplace</h1>
          <p className="text-muted-foreground">Browse and request swappable time slots</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          </div>
        ) : swappableSlots.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Store className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">No swappable slots available</p>
              <p className="text-sm text-muted-foreground">Check back later for new opportunities</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {swappableSlots.map((slot) => (
              <Card key={slot.id} className="transition-shadow hover:shadow-lg">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{slot.title}</CardTitle>
                    <Badge variant="success">Available</Badge>
                  </div>
                  <CardDescription>
                    Offered by {slot.profiles?.full_name}
                  </CardDescription>
                  <CardDescription>
                    {format(new Date(slot.start_time), "PPp")}
                    <br />
                    to {format(new Date(slot.end_time), "p")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    className="w-full"
                    onClick={() => {
                      setSelectedSlot(slot);
                      setDialogOpen(true);
                    }}
                    disabled={mySwappableSlots.length === 0}
                  >
                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                    Request Swap
                  </Button>
                  {mySwappableSlots.length === 0 && (
                    <p className="mt-2 text-xs text-muted-foreground text-center">
                      You need a swappable slot to request swaps
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Select Your Slot to Swap</DialogTitle>
              <DialogDescription>
                Choose one of your swappable slots to offer in exchange
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              {selectedSlot && (
                <Card className="bg-muted">
                  <CardHeader>
                    <CardTitle className="text-base">Their Slot</CardTitle>
                    <CardDescription>
                      {selectedSlot.title}
                      <br />
                      {format(new Date(selectedSlot.start_time), "PPp")}
                    </CardDescription>
                  </CardHeader>
                </Card>
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium">Your Swappable Slots:</p>
                {mySwappableSlots.map((mySlot) => (
                  <Card key={mySlot.id} className="cursor-pointer transition-all hover:border-primary">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{mySlot.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(mySlot.start_time), "PPp")}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => requestSwap(mySlot.id)}
                        >
                          Offer This
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default Marketplace;
