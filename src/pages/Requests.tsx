import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Bell, Check, X } from "lucide-react";
import { format } from "date-fns";

interface SwapRequest {
  id: string;
  status: string;
  created_at: string;
  requester_id: string;
  recipient_id: string;
  requester_event: {
    id: string;
    title: string;
    start_time: string;
    end_time: string;
  };
  recipient_event: {
    id: string;
    title: string;
    start_time: string;
    end_time: string;
  };
  requester_profile?: {
    full_name: string;
  };
  recipient_profile?: {
    full_name: string;
  };
}

const Requests = () => {
  const { user } = useAuth();
  const [incomingRequests, setIncomingRequests] = useState<SwapRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<SwapRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchRequests();
    }
  }, [user]);

  const fetchRequests = async () => {
    if (!user) return;

    // Fetch incoming requests with events
    const { data: incoming, error: incomingError } = await supabase
      .from('swap_requests')
      .select('*')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false });

    if (incomingError) {
      console.error('Incoming requests error:', incomingError);
    }

    // Fetch outgoing requests with events
    const { data: outgoing, error: outgoingError } = await supabase
      .from('swap_requests')
      .select('*')
      .eq('requester_id', user.id)
      .order('created_at', { ascending: false });

    if (outgoingError) {
      console.error('Outgoing requests error:', outgoingError);
    }

    // Enrich incoming with event and profile data
    if (incoming && incoming.length > 0) {
      const eventIds = [
        ...incoming.map(r => r.requester_event_id),
        ...incoming.map(r => r.recipient_event_id)
      ];
      const requesterIds = incoming.map(r => r.requester_id);

      const { data: events } = await supabase
        .from('events')
        .select('id, title, start_time, end_time')
        .in('id', eventIds);

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', requesterIds);

      const enrichedIncoming = incoming.map(req => ({
        ...req,
        requester_event: events?.find(e => e.id === req.requester_event_id) || {
          id: '', title: 'Unknown', start_time: '', end_time: ''
        },
        recipient_event: events?.find(e => e.id === req.recipient_event_id) || {
          id: '', title: 'Unknown', start_time: '', end_time: ''
        },
        requester_profile: profiles?.find(p => p.user_id === req.requester_id)
          ? { full_name: profiles.find(p => p.user_id === req.requester_id)!.full_name }
          : { full_name: 'Unknown' }
      }));
      setIncomingRequests(enrichedIncoming as SwapRequest[]);
    } else {
      setIncomingRequests([]);
    }

    // Enrich outgoing with event and profile data
    if (outgoing && outgoing.length > 0) {
      const eventIds = [
        ...outgoing.map(r => r.requester_event_id),
        ...outgoing.map(r => r.recipient_event_id)
      ];
      const recipientIds = outgoing.map(r => r.recipient_id);

      const { data: events } = await supabase
        .from('events')
        .select('id, title, start_time, end_time')
        .in('id', eventIds);

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', recipientIds);

      const enrichedOutgoing = outgoing.map(req => ({
        ...req,
        requester_event: events?.find(e => e.id === req.requester_event_id) || {
          id: '', title: 'Unknown', start_time: '', end_time: ''
        },
        recipient_event: events?.find(e => e.id === req.recipient_event_id) || {
          id: '', title: 'Unknown', start_time: '', end_time: ''
        },
        recipient_profile: profiles?.find(p => p.user_id === req.recipient_id)
          ? { full_name: profiles.find(p => p.user_id === req.recipient_id)!.full_name }
          : { full_name: 'Unknown' }
      }));
      setOutgoingRequests(enrichedOutgoing as SwapRequest[]);
    } else {
      setOutgoingRequests([]);
    }

    setLoading(false);
  };

  const handleAcceptSwap = async (request: SwapRequest) => {
    // Start transaction-like operations
    // 1. Update swap request status
    const { error: updateError } = await supabase
      .from('swap_requests')
      .update({ status: 'ACCEPTED' })
      .eq('id', request.id);

    if (updateError) {
      toast.error("Failed to accept swap");
      console.error(updateError);
      return;
    }

    // 2. Swap the user_ids on both events
    const { error: swapError1 } = await supabase
      .from('events')
      .update({ user_id: request.recipient_id, status: 'BUSY' })
      .eq('id', request.requester_event.id);

    const { error: swapError2 } = await supabase
      .from('events')
      .update({ user_id: request.requester_id, status: 'BUSY' })
      .eq('id', request.recipient_event.id);

    if (swapError1 || swapError2) {
      toast.error("Failed to swap events");
      console.error(swapError1 || swapError2);
      return;
    }

    toast.success("Swap accepted! Events have been exchanged.");
    fetchRequests();
  };

  const handleRejectSwap = async (request: SwapRequest) => {
    // 1. Update swap request status
    const { error: updateError } = await supabase
      .from('swap_requests')
      .update({ status: 'REJECTED' })
      .eq('id', request.id);

    if (updateError) {
      toast.error("Failed to reject swap");
      console.error(updateError);
      return;
    }

    // 2. Set both events back to SWAPPABLE
    const { error: resetError } = await supabase
      .from('events')
      .update({ status: 'SWAPPABLE' })
      .in('id', [request.requester_event.id, request.recipient_event.id]);

    if (resetError) {
      toast.error("Failed to reset event status");
      console.error(resetError);
      return;
    }

    toast.success("Swap rejected. Events are now available again.");
    fetchRequests();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="warning">Pending</Badge>;
      case 'ACCEPTED':
        return <Badge variant="success">Accepted</Badge>;
      case 'REJECTED':
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Swap Requests</h1>
          <p className="text-muted-foreground">Manage your swap requests</p>
        </div>

        <Tabs defaultValue="incoming" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="incoming">
              Incoming ({incomingRequests.filter(r => r.status === 'PENDING').length})
            </TabsTrigger>
            <TabsTrigger value="outgoing">
              Outgoing ({outgoingRequests.filter(r => r.status === 'PENDING').length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="incoming" className="mt-6">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
              </div>
            ) : incomingRequests.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Bell className="mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="text-lg font-medium">No incoming requests</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {incomingRequests.map((request) => (
                  <Card key={request.id} className="transition-shadow hover:shadow-lg">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-base">Swap Request</CardTitle>
                        {getStatusBadge(request.status)}
                      </div>
                      <CardDescription>
                        From {request.requester_profile?.full_name}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">They offer:</p>
                        <p className="font-medium">{request.requester_event.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(request.requester_event.start_time), "PPp")}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">For your:</p>
                        <p className="font-medium">{request.recipient_event.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(request.recipient_event.start_time), "PPp")}
                        </p>
                      </div>
                      {request.status === 'PENDING' && (
                        <div className="flex gap-2">
                          <Button
                            variant="default"
                            size="sm"
                            className="flex-1"
                            onClick={() => handleAcceptSwap(request)}
                          >
                            <Check className="mr-2 h-4 w-4" />
                            Accept
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="flex-1"
                            onClick={() => handleRejectSwap(request)}
                          >
                            <X className="mr-2 h-4 w-4" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="outgoing" className="mt-6">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
              </div>
            ) : outgoingRequests.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Bell className="mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="text-lg font-medium">No outgoing requests</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {outgoingRequests.map((request) => (
                  <Card key={request.id} className="transition-shadow hover:shadow-lg">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-base">Swap Request</CardTitle>
                        {getStatusBadge(request.status)}
                      </div>
                      <CardDescription>
                        To {request.recipient_profile?.full_name}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">You offered:</p>
                        <p className="font-medium">{request.requester_event.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(request.requester_event.start_time), "PPp")}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">For their:</p>
                        <p className="font-medium">{request.recipient_event.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(request.recipient_event.start_time), "PPp")}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Requests;
