import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-session";
import { todayISO } from "@/lib/format";

/** Shows one motivation quote per user per day, acknowledged in the database. */
export function DailyMotivation() {
  const { data: profile } = useProfile();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["motivation", todayISO(), profile?.id],
    enabled: !!profile?.id && !!profile?.clinic_id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!profile?.id) return null;

      const { data: ack } = await supabase
        .from("motivation_acknowledgements")
        .select("id")
        .eq("user_id", profile.id)
        .eq("ack_date", todayISO())
        .maybeSingle();
      if (ack) return null;

      const { data: quotes } = await supabase
        .from("motivation_quotes")
        .select("id, quote")
        .eq("active", true);
      if (!quotes?.length) return null;

      const index = new Date().getDate() % quotes.length;
      return quotes[index] ?? null;
    },
  });

  const acknowledge = useMutation({
    mutationFn: async () => {
      if (!profile?.id || !data) return;
      await supabase.from("motivation_acknowledgements").insert({
        user_id: profile.id,
        quote_id: data.id,
        ack_date: todayISO(),
      });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["motivation"] }),
  });

  return (
    <Dialog open={!!data} onOpenChange={(open) => !open && acknowledge.mutate()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mb-1 grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground">
            <Sparkles className="size-5" aria-hidden />
          </div>
          <DialogTitle>Today's motivation</DialogTitle>
          <DialogDescription className="pt-1 text-base text-foreground">
            {data?.quote}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button className="w-full" onClick={() => acknowledge.mutate()}>
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
