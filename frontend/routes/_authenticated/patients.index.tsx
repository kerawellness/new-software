import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { UserPlus, Users, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Kpi } from "@/components/common/kpi";
import { PatientLine } from "@/components/common/patient-line";
import { EmptyState, ErrorState, LoadingCards, LoadingKpis } from "@/components/common/states";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNewHotkey } from "@/hooks/use-new-hotkey";
import { useShowDemoData } from "@/hooks/use-show-demo-data";
import { supabase } from "@/integrations/supabase/client";
import { getDemoPatients, isDemoId } from "@/lib/demo-data";
import { formatDate } from "@/lib/format";

type PatientWithVisits = {
  id: string;
  patient_code: string;
  full_name: string;
  phone: string;
  patient_type: string;
  status: string;
  created_at: string;
  visits: { visit_date: string }[];
};

export const Route = createFileRoute("/_authenticated/patients/")({
  head: () => ({
    meta: [
      { title: "Patients — VSP Software" },
      {
        name: "description",
        content: "Search, register and manage every patient record in your dental clinic.",
      },
      { property: "og:title", content: "Patients — VSP Software" },
      { property: "og:description", content: "Search and manage your clinic's patient directory." },
    ],
  }),
  component: PatientsPage,
});

function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function lastVisitDate(visits: { visit_date: string }[] | undefined) {
  if (!Array.isArray(visits) || visits.length === 0) return null;
  return visits.reduce((latest, v) => (v.visit_date > latest ? v.visit_date : latest), "");
}

function PatientsPage() {
  const navigate = useNavigate();
  const { showDemoData } = useShowDemoData();
  const [search, setSearch] = useState("");
  const [rowLimit, setRowLimit] = useState(50);
  const term = useDebounced(search);
  useEffect(() => {
    setRowLimit(50);
  }, [term]);
  useNewHotkey(() => void navigate({ to: "/patients/new" }));

  const countsQuery = useQuery({
    queryKey: ["patients", "counts"],
    queryFn: async () => {
      const [total, quick] = await Promise.all([
        supabase.from("patients").select("id", { count: "exact", head: true }),
        supabase.from("patients").select("id", { count: "exact", head: true }).eq("patient_type", "walk_in"),
      ]);
      if (total.error) throw total.error;
      if (quick.error) throw quick.error;
      const totalCount = total.count ?? 0;
      const quickCount = quick.count ?? 0;
      return {
        total: totalCount,
        quick: quickCount,
        general: Math.max(0, totalCount - quickCount),
      };
    },
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["patients", term, rowLimit],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase
        .from("patients")
        .select("id, patient_code, full_name, phone, patient_type, status, created_at, visits(visit_date)")
        .order("created_at", { ascending: false })
        .order("visit_date", { foreignTable: "visits", ascending: false })
        .limit(rowLimit)
        .limit(1, { foreignTable: "visits" });
      if (term.trim()) {
        const t = term.trim();
        query = query.or(`full_name.ilike.%${t}%,phone.ilike.%${t}%,patient_code.ilike.%${t}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as PatientWithVisits[];
    },
  });

  const patients = useMemo(() => {
    const real = data ?? [];
    if (!showDemoData) return real;
    let demo = getDemoPatients();
    if (term.trim()) {
      const t = term.trim().toLowerCase();
      demo = demo.filter(
        (p) =>
          p.full_name.toLowerCase().includes(t) ||
          p.phone.includes(t) ||
          p.patient_code.toLowerCase().includes(t),
      );
    }
    return [...demo, ...real];
  }, [data, showDemoData, term]);

  const demoCount = showDemoData ? getDemoPatients().length : 0;
  const totalPatients = (countsQuery.data?.total ?? 0) + demoCount;
  const quickPatients = countsQuery.data?.quick ?? 0;
  const generalPatients = (countsQuery.data?.general ?? 0) + demoCount;

  return (
    <AppShell>
      <PageHeader
        title="Patients"
        description="Search by name, phone or patient ID."
        action={
          <Button
            asChild
            className="w-full rounded-xl bg-primary font-semibold text-primary-foreground shadow-xs transition-all hover:bg-primary/90 sm:w-auto"
          >
            <Link to="/patients/new">
              <UserPlus className="mr-1.5 size-4" aria-hidden />
              New Patient
            </Link>
          </Button>
        }
      />

      {countsQuery.isError ? (
        <p className="mb-4 text-sm text-ink-500">Totals could not be loaded.</p>
      ) : countsQuery.isLoading ? (
        <LoadingKpis count={3} className="mb-4 grid-cols-3" />
      ) : (
        <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
          <Kpi label="Total patients" value={totalPatients} icon={Users} accent="patients" />
          <Kpi label="Quick Entry" value={quickPatients} icon={Zap} accent="clinic" />
          <Kpi label="General" value={generalPatients} icon={UserPlus} accent="growth" />
        </div>
      )}

      <div className="mb-5 min-w-0">
        <Input
          placeholder="Search"
          aria-label="Search patients"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isError ? (
        <ErrorState title="Unable to load patients." onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingCards count={4} />
      ) : patients.length === 0 ? (
        <EmptyState
          icon={Users}
          title={term ? "No patients match your search" : "No patients yet"}
          description={term ? "Try a different name or phone number." : "Add your first patient."}
          action={
            <Button asChild className="rounded-xl shadow-xs">
              <Link to="/patients/new">Add your first patient</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {patients.map((p) => {
            const last = lastVisitDate(p.visits);
            const typeLabel = (p.patient_type || "regular").replaceAll("_", " ");
            const row = (
              <PatientLine
                name={p.full_name}
                meta={`${p.patient_code} · ${p.phone || "No phone"} · ${typeLabel}${isDemoId(p.id) ? " · Dummy" : ""}`}
                figure={last ? formatDate(last) : "No visits"}
              />
            );
            if (isDemoId(p.id)) {
              return (
                <div
                  key={p.id}
                  className="rounded-xl border border-dashed border-line bg-surface-1 px-3"
                >
                  {row}
                </div>
              );
            }
            return (
              <Link
                key={p.id}
                to="/patients/$patientId"
                params={{ patientId: p.id }}
                className="block rounded-xl border border-line bg-surface-1 px-3 transition-colors duration-150 hover:bg-surface-2/60"
              >
                {row}
              </Link>
            );
          })}
          {(data?.length ?? 0) >= rowLimit ? (
            <Button type="button" variant="outline" className="w-full" onClick={() => setRowLimit((count) => count + 50)}>
              Show more patients
            </Button>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}
