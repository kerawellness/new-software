export type FollowUpPatient = {
  id: string;
  full_name: string;
  patient_code: string;
  phone: string;
};

export type FollowUpRow = {
  id: string;
  reason: string;
  due_date: string;
  status: "pending" | "scheduled" | "completed" | "overdue";
  notes: string | null;
  created_at: string;
  patients: FollowUpPatient | null;
};
