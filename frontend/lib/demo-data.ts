import { todayISO } from "@/lib/format";
import type { FlowState } from "@/lib/constants";

export const DEMO_ID_PREFIX = "demo-";
export const SHOW_DEMO_DATA_KEY = "clinic-compass-show-demo-data";

export function isDemoId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(DEMO_ID_PREFIX);
}

function dayOffset(days: number): string {
  const d = new Date(`${todayISO()}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function inDateRange(day: string, from?: string | null | undefined, to?: string | null | undefined): boolean {
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

type DemoDateOpts = { from?: string | null | undefined; to?: string | null | undefined };

export type DemoPatient = {
  id: string;
  patient_code: string;
  full_name: string;
  phone: string;
  patient_type: string;
  status: string;
  created_at: string;
  visits: { visit_date: string }[];
};

const DEMO_PEOPLE = [
  { name: "Demo Ananya Sharma", phone: "9000000001", gender: "female" },
  { name: "Demo Rohan Mehta", phone: "9000000002", gender: "male" },
  { name: "Demo Priya Nair", phone: "9000000003", gender: "female" },
  { name: "Demo Vikram Patel", phone: "9000000004", gender: "male" },
  { name: "Demo Sneha Iyer", phone: "9000000005", gender: "female" },
  { name: "Demo Arjun Reddy", phone: "9000000006", gender: "male" },
  { name: "Demo Meera Joshi", phone: "9000000007", gender: "female" },
  { name: "Demo Kabir Khan", phone: "9000000008", gender: "male" },
  { name: "Demo Diya Kapoor", phone: "9000000009", gender: "female" },
  { name: "Demo Ishaan Desai", phone: "9000000010", gender: "male" },
] as const;

const FLOW_PLAN: FlowState[] = [
  "schedule",
  "schedule",
  "schedule",
  "waiting",
  "waiting",
  "engage",
  "engage",
  "done",
  "done",
  "done",
];

const PROCEDURES = [
  "Demo Consultation",
  "Demo Scaling",
  "Demo Filling",
  "Demo Extraction",
  "Demo Root Canal",
  "Demo Crown",
  "Demo Whitening",
  "Demo X-Ray",
  "Demo Ortho Review",
  "Demo Implant Review",
] as const;

const COSTS = [500, 1500, 2000, 2500, 6000, 8000, 4500, 800, 1000, 1200] as const;

export function getDemoPatients(): DemoPatient[] {
  const today = todayISO();
  return DEMO_PEOPLE.map((p, i) => ({
    id: `${DEMO_ID_PREFIX}patient-${i + 1}`,
    patient_code: `DEMO${String(i + 1).padStart(4, "0")}`,
    full_name: p.name,
    phone: p.phone,
    patient_type: "regular",
    status: "active",
    created_at: `${dayOffset(-i)}T10:00:00.000Z`,
    visits: [{ visit_date: i < 7 ? today : dayOffset(-i) }],
  }));
}

export function getDemoAppointments(opts?: DemoDateOpts) {
  const today = todayISO();
  const from = opts?.from ?? null;
  const to = opts?.to ?? null;
  const patients = getDemoPatients();

  return patients
    .map((patient, i) => {
      const flow = FLOW_PLAN[i]!;
      const hour = 9 + (i % 7);
      const start = `${String(hour).padStart(2, "0")}:00`;
      const end = `${String(hour + 1).padStart(2, "0")}:00`;
      const now = new Date().toISOString();
      return {
        id: `${DEMO_ID_PREFIX}appt-${i + 1}`,
        appointment_date: today,
        start_time: start,
        end_time: end,
        reason: i % 2 === 0 ? "Tooth pain" : "Cleaning",
        notes: "[Demo — not saved]",
        appointment_status: (flow === "done" ? "confirmed" : "scheduled") as
          | "scheduled"
          | "confirmed"
          | "cancelled"
          | "no_show",
        flow_status: flow,
        dentist_id: null,
        patients: {
          id: patient.id,
          full_name: patient.full_name,
          patient_code: patient.patient_code,
          phone: patient.phone,
        },
        pending_patients: null,
        profiles: { id: `${DEMO_ID_PREFIX}doctor`, name: "Demo Doctor" },
        arrived_at:
          flow === "waiting" || flow === "engage" || flow === "done" ? now : null,
        engaged_at: flow === "engage" || flow === "done" ? now : null,
        completed_at: flow === "done" ? now : null,
      };
    })
    .filter((row) => inDateRange(row.appointment_date, from, to));
}

export function getDemoFlowAppointments() {
  return getDemoAppointments({ from: todayISO(), to: todayISO() }).map((a) => ({
    id: a.id,
    start_time: a.start_time,
    reason: a.reason,
    notes: a.notes,
    flow_status: a.flow_status,
    arrived_at: a.arrived_at,
    engaged_at: a.engaged_at,
    completed_at: a.completed_at,
    patients: a.patients,
    pending_patients: a.pending_patients,
  }));
}

export function getDemoVisits(opts?: DemoDateOpts) {
  const today = todayISO();
  const from = opts?.from ?? null;
  const to = opts?.to ?? null;
  const patients = getDemoPatients();

  return patients
    .map((patient, i) => {
      const hasTreatment = i % 2 === 1;
      const visitDate = i < 7 ? today : dayOffset(-i);
      const proc = PROCEDURES[i]!;
      const cost = COSTS[i]!;
      return {
        id: `${DEMO_ID_PREFIX}visit-${i + 1}`,
        patient_id: patient.id,
        visit_date: visitDate,
        reason: hasTreatment ? "Procedure" : "Consultation",
        chief_complaint: hasTreatment ? "Procedure" : "Consultation",
        clinical_notes: "[Demo — not saved]",
        diagnosis: hasTreatment ? proc : "Routine check",
        treatment_performed: hasTreatment ? proc : null,
        post_care_instructions: hasTreatment ? "Rinse with warm salt water." : null,
        patients: {
          id: patient.id,
          full_name: patient.full_name,
          patient_code: patient.patient_code,
          phone: patient.phone,
        },
        profiles: { id: `${DEMO_ID_PREFIX}doctor`, name: "Demo Doctor" },
        treatments: hasTreatment
          ? [
              {
                id: `${DEMO_ID_PREFIX}tx-${i + 1}`,
                name: proc,
                cost,
                tooth_number: null,
              },
            ]
          : [],
      };
    })
    .filter((row) => inDateRange(row.visit_date, from, to));
}

export function getDemoFollowUps(opts?: DemoDateOpts) {
  const from = opts?.from ?? null;
  const to = opts?.to ?? null;
  const patients = getDemoPatients();

  return patients
    .map((patient, i) => {
      const status =
        i < 4 ? ("pending" as const) : i < 7 ? ("scheduled" as const) : ("completed" as const);
      const due_date = i < 4 ? dayOffset(i - 3) : i < 7 ? dayOffset(i + 2) : dayOffset(-2);
      return {
        id: `${DEMO_ID_PREFIX}fu-${i + 1}`,
        reason: i % 2 === 1 ? `Review after ${PROCEDURES[i]}` : "Routine recall",
        due_date,
        status,
        notes: "[Demo — not saved]",
        created_at: `${dayOffset(-i)}T09:00:00.000Z`,
        patients: {
          id: patient.id,
          full_name: patient.full_name,
          patient_code: patient.patient_code,
          phone: patient.phone,
        },
      };
    })
    .filter((row) => inDateRange(row.due_date, from, to));
}

export function getDemoAuditLogs(opts?: DemoDateOpts) {
  const from = opts?.from ?? null;
  const to = opts?.to ?? null;
  const patients = getDemoPatients();
  const actions = [
    "patient_created",
    "appointment_created",
    "patient_arrived",
    "visit_completed",
    "payment_recorded",
    "followup_created",
    "invoice_created",
    "patient_updated",
    "treatment_completed",
    "demo_preview",
  ] as const;

  return patients
    .map((patient, i) => {
      const day = i < 7 ? todayISO() : dayOffset(-i);
      return {
        id: `${DEMO_ID_PREFIX}log-${i + 1}`,
        action: actions[i]!,
        entity_type: i % 2 === 0 ? "patient" : "appointment",
        entity_id: patient.id,
        metadata: { demo: true, name: patient.full_name },
        created_at: `${day}T${String(10 + (i % 8)).padStart(2, "0")}:15:00.000Z`,
        userName: "Demo Staff",
      };
    })
    .filter((row) => inDateRange(row.created_at.slice(0, 10), from, to));
}

export function getDemoInvoices() {
  const patients = getDemoPatients();
  return patients.map((patient, i) => {
    const amount = COSTS[i]!;
    const paid = i < 5 ? amount : i < 7 ? Math.round(amount / 2) : 0;
    const balance = Math.max(0, amount - paid);
    const status =
      balance <= 0 ? ("paid" as const) : paid > 0 ? ("partial" as const) : ("unpaid" as const);
    return {
      id: `${DEMO_ID_PREFIX}inv-${i + 1}`,
      invoice_number: `DEMO-INV-${String(i + 1).padStart(3, "0")}`,
      invoice_date: i < 7 ? todayISO() : dayOffset(-i),
      total_amount: amount,
      tax_amount: 0,
      grand_total: amount,
      paid_amount: paid,
      balance_amount: balance,
      status,
      patients: {
        id: patient.id,
        full_name: patient.full_name,
        patient_code: patient.patient_code,
        phone: patient.phone,
      },
    };
  });
}

export function isShowDemoDataStored(): boolean {
  return false;
}

export function clearShowDemoData(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SHOW_DEMO_DATA_KEY);
  } catch {
    // ignore quota / private mode
  }
  window.dispatchEvent(new Event("clinic-compass-demo-data"));
}

export function getDemoPayments() {
  const invoices = getDemoInvoices().filter((inv) => inv.paid_amount > 0);
  const methods = ["cash", "upi", "card", "upi", "cash"] as const;
  return invoices.map((inv, i) => ({
    id: `${DEMO_ID_PREFIX}pay-${i + 1}`,
    amount: inv.paid_amount,
    payment_date: inv.invoice_date,
    payment_method: methods[i % methods.length]!,
    notes: "[Demo — not saved]",
    created_at: `${inv.invoice_date}T11:00:00.000Z`,
    patients: inv.patients,
    invoices: {
      id: inv.id,
      invoice_number: inv.invoice_number,
      grand_total: inv.grand_total,
      balance_amount: inv.balance_amount,
    },
  }));
}

export function getDemoInstallmentPlans() {
  const invoices = getDemoInvoices().filter((inv) => inv.balance_amount > 0 && inv.paid_amount > 0);
  return invoices.slice(0, 3).map((inv, i) => {
    const months = 3;
    const remaining = inv.balance_amount;
    const each = Math.round(remaining / months);
    return {
      id: `${DEMO_ID_PREFIX}plan-${i + 1}`,
      status: "active" as const,
      down_payment: inv.paid_amount,
      number_of_installments: months,
      created_at: `${inv.invoice_date}T12:00:00.000Z`,
      invoices: {
        id: inv.id,
        invoice_number: inv.invoice_number,
        grand_total: inv.grand_total,
        balance_amount: inv.balance_amount,
        patients: inv.patients,
      },
      installments: Array.from({ length: months }, (_, m) => ({
        id: `${DEMO_ID_PREFIX}inst-${i + 1}-${m + 1}`,
        due_date: dayOffset(30 * (m + 1)),
        amount: m === months - 1 ? remaining - each * (months - 1) : each,
        paid_amount: 0,
        status: "pending" as const,
      })),
    };
  });
}

/** Raw rows for Analytics when dummy data is on (never written to Supabase). */
export function getDemoAnalyticsSource() {
  const patients = getDemoPatients();
  const invoices = getDemoInvoices();
  const payments = getDemoPayments();
  const visits = getDemoVisits();
  const followUps = getDemoFollowUps();
  const appointments = getDemoAppointments();

  return {
    payments: payments.map((p) => ({
      amount: p.amount,
      payment_date: p.payment_date,
    })),
    invoices: invoices.map((inv) => ({
      grand_total: inv.grand_total,
      paid_amount: inv.paid_amount,
      balance_amount: inv.balance_amount,
      status: inv.status,
      invoice_date: inv.invoice_date,
    })),
    patients: patients.map((p) => ({
      id: p.id,
      created_at: p.created_at,
    })),
    treatments: visits.flatMap((v) =>
      (v.treatments ?? []).map((t) => ({
        name: t.name,
        cost: t.cost,
        treatment_date: v.visit_date,
        patient_id: v.patients.id,
      })),
    ),
    appointments: appointments.map((a) => ({
      appointment_status: a.appointment_status,
      flow_status: a.flow_status,
      appointment_date: a.appointment_date,
      patient_id: a.patients?.id ?? null,
    })),
    followUps: followUps.map((f) => ({
      due_date: f.due_date,
      status: f.status,
    })),
    onlineReqs: patients.slice(0, 4).map((p, i) => ({
      created_at: `${dayOffset(-i)}T08:00:00.000Z`,
      status: (i % 2 === 0 ? "confirmed" : "requested") as "confirmed" | "requested",
    })),
  };
}

export function getDemoWhatsAppTemplates() {
  return [
    {
      id: `${DEMO_ID_PREFIX}wa-1`,
      name: "Demo Appointment Reminder",
      category: "appointment",
      message: "Hi {{name}}, reminder for your visit at {{clinic}} on {{date}}. [Demo]",
      active: true,
      trigger_event: null,
    },
    {
      id: `${DEMO_ID_PREFIX}wa-2`,
      name: "Demo Follow-up Care",
      category: "follow_up",
      message: "Hi {{name}}, time for your follow-up at {{clinic}}. [Demo]",
      active: true,
      trigger_event: null,
    },
    {
      id: `${DEMO_ID_PREFIX}wa-3`,
      name: "Demo Payment Due",
      category: "payment",
      message: "Hi {{name}}, a balance is due at {{clinic}}. [Demo]",
      active: true,
      trigger_event: null,
    },
    {
      id: `${DEMO_ID_PREFIX}wa-4`,
      name: "Demo Case History",
      category: "case_history",
      message: "Hi {{name}}, sharing your visit summary from {{clinic}}. [Demo]",
      active: true,
      trigger_event: null,
    },
    {
      id: `${DEMO_ID_PREFIX}wa-5`,
      name: "Demo Thank You",
      category: "appointment",
      message: "Thank you {{name}} for visiting {{clinic}}. [Demo]",
      active: true,
      trigger_event: null,
    },
    {
      id: `${DEMO_ID_PREFIX}wa-6`,
      name: "Demo Reschedule",
      category: "appointment",
      message: "Hi {{name}}, please confirm a new slot with {{clinic}}. [Demo]",
      active: true,
      trigger_event: null,
    },
    {
      id: `${DEMO_ID_PREFIX}wa-7`,
      name: "Demo Post Scaling",
      category: "follow_up",
      message: "Hi {{name}}, avoid hot/cold food for 24 hours. [Demo]",
      active: true,
      trigger_event: null,
    },
    {
      id: `${DEMO_ID_PREFIX}wa-8`,
      name: "Demo Balance Reminder",
      category: "payment",
      message: "Hi {{name}}, kindly clear the remaining balance. [Demo]",
      active: true,
      trigger_event: null,
    },
    {
      id: `${DEMO_ID_PREFIX}wa-9`,
      name: "Demo Review Request",
      category: "follow_up",
      message: "Hi {{name}}, how are you feeling after treatment? [Demo]",
      active: true,
      trigger_event: null,
    },
    {
      id: `${DEMO_ID_PREFIX}wa-10`,
      name: "Demo Next Visit",
      category: "appointment",
      message: "Hi {{name}}, book your next cleaning at {{clinic}}. [Demo]",
      active: true,
      trigger_event: null,
    },
  ];
}
