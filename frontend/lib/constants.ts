// Central, reusable clinical + workflow definitions. Never duplicate these in components.

export const MEDICAL_HISTORY: Record<string, string[]> = {
  "Cardiac / Blood Pressure": [
    "Angina",
    "Cardiac Disorder",
    "Cardiac Stent",
    "Heart Valve Defect",
    "Bradycardia",
    "Tachycardia",
    "Hypertension",
    "Hypotension",
    "High BP",
    "Bypass Surgery",
    "CABG",
    "Angioplasty Done",
    "Angiography Done",
  ],
  "Diabetes / Metabolic": [
    "Diabetes Mellitus",
    "Diabetes Mellitus Type 1",
    "Diabetes Mellitus Type 2",
    "High Insulin",
    "High Cholesterol",
    "Obesity",
    "Anaemia",
    "Gout",
    "Hyperuricemia",
  ],
  Respiratory: ["Asthma", "Bronchitis", "Sinusitis", "TB"],
  Neurological: ["Epilepsy", "Migraine", "Parkinson's Disease", "Hemiplegia", "Vertigo"],
  "Endocrine / Thyroid": [
    "Hypothyroidism",
    "Hyperthyroidism",
    "Hormonal Insufficiency",
    "Thyroid Disorder",
  ],
  "Kidney / Liver": [
    "Kidney Disease",
    "Nephritis",
    "Renal Dysfunction",
    "Liver Disorder",
    "Hepatitis",
    "Hepatitis B",
  ],
  Gastrointestinal: [
    "Gastritis",
    "Dyspepsia",
    "Hyperacidity",
    "Peptic Ulcer",
    "Constipation",
    "Abdominal Hernia",
    "Inguinal Hernia",
  ],
  Musculoskeletal: [
    "Arthritis",
    "Osteoarthritis – Knee",
    "Rheumatoid Arthritis",
    "Spondylitis",
    "Back Pain",
    "Low Back Pain",
    "Atypical Neck Pain",
  ],
  Other: [
    "Cancer",
    "HIV/AIDS",
    "Sickle Cell Disease",
    "Psoriasis",
    "Leucoderma",
    "Sjögren's Syndrome",
    "Cleft Lip",
    "Retina Problem",
    "Skin Allergy",
    "Hair Fall",
    "Depression",
  ],
};

export const ALLERGY_OPTIONS = [
  "Diclofenac",
  "Milk Products",
  "Penicillin",
  "Sulfa Drugs",
  "Other Drug Allergy",
  "Other Food Allergy",
  "Other Allergy",
];

export const ALLERGY_SEVERITY = ["Mild", "Moderate", "Severe"];

export const MEDICATION_OPTIONS = [
  "Aspirin",
  "Anticoagulant Drugs",
  "Blood Thinners",
  "Antidiabetic Drugs",
  "Antihypertensive Drugs",
  "Antidepressant Drugs",
  "Psychotropic Drugs",
  "Atorvastatin",
  "OCPs",
];

export const HABIT_OPTIONS = [
  "Active Smoker",
  "Oral Tobacco",
  "Alcohol Problem",
  "Chronic Alcoholic",
];

export const FLOW_STATES = ["schedule", "waiting", "engage", "done"] as const;
export type FlowState = (typeof FLOW_STATES)[number];

export const FLOW_LABELS: Record<FlowState, string> = {
  schedule: "Expected",
  waiting: "Waiting",
  engage: "In Chair",
  done: "Done",
};

export const FLOW_NEXT: Record<FlowState, FlowState | null> = {
  schedule: "waiting",
  waiting: "engage",
  engage: "done",
  done: null,
};

export const FLOW_ACTION_LABEL: Record<FlowState, string> = {
  schedule: "Arrived",
  waiting: "In chair",
  engage: "Done",
  done: "Completed",
};

/** Column header accent — structural only; card wait-time escalation stays separate. */
export const FLOW_COLUMN_BAND: Record<FlowState, string> = {
  schedule: "border-t-[3px] border-t-ink-300",
  waiting: "border-t-[3px] border-t-warning-text",
  engage: "border-t-[3px] border-t-info-text",
  done: "border-t-[3px] border-t-success-text",
};

export const FLOW_COLUMN_HEADER: Record<FlowState, string> = {
  schedule: "text-ink-500",
  waiting: "text-warning-text",
  engage: "text-info-text",
  done: "text-success-text",
};

export function canTransition(from: FlowState, to: FlowState) {
  return FLOW_NEXT[from] === to;
}

export const PAYMENT_METHODS = ["cash", "card", "upi", "bank_transfer", "other"] as const;
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  upi: "UPI",
  bank_transfer: "Bank Transfer",
  other: "Other",
};

export const TREATMENT_STATUSES = ["planned", "in_progress", "completed", "cancelled"] as const;
export const FOLLOW_UP_STATUSES = ["pending", "scheduled", "completed", "overdue"] as const;
export const INSTALLMENT_COUNTS = [1, 2, 3, 6, 12];

export const ROLES = ["admin", "dentist", "receptionist"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  dentist: "Dentist",
  receptionist: "Receptionist",
};

export const WHATSAPP_CATEGORIES = [
  "appointment",
  "follow_up",
  "payment",
  "case_history",
] as const;

export const WHATSAPP_CATEGORY_LABELS: Record<(typeof WHATSAPP_CATEGORIES)[number], string> = {
  appointment: "Appointment",
  follow_up: "Follow-up",
  payment: "Payment",
  case_history: "Case history",
};

export const CURRENCIES = [
  { value: "INR", label: "Indian Rupee (₹)" },
  { value: "USD", label: "US Dollar ($)" },
  { value: "EUR", label: "Euro (€)" },
  { value: "GBP", label: "British Pound (£)" },
  { value: "AED", label: "UAE Dirham (AED)" },
  { value: "SAR", label: "Saudi Riyal (SAR)" },
  { value: "MYR", label: "Malaysian Ringgit (RM)" },
  { value: "SGD", label: "Singapore Dollar (S$)" },
] as const;

export const TREATMENT_CATEGORIES = [
  "general",
  "restorative",
  "orthodontics",
  "endodontics",
  "periodontics",
  "prosthodontics",
  "surgery",
  "cosmetic",
  "other",
] as const;

export const PATIENT_TYPES = ["regular", "vip", "child", "senior", "walk_in", "referral"] as const;
export type PatientType = (typeof PATIENT_TYPES)[number];
export const PATIENT_TYPE_LABELS: Record<PatientType, string> = {
  regular: "Regular",
  vip: "VIP",
  child: "Child",
  senior: "Senior Citizen",
  walk_in: "Walk-in",
  referral: "Referral",
};

export const WHATSAPP_TRIGGERS = ["appointment_booked", "follow_up_scheduled", "visit_completed"] as const;
export type WhatsAppTrigger = (typeof WHATSAPP_TRIGGERS)[number];
export const WHATSAPP_TRIGGER_LABELS: Record<WhatsAppTrigger, string> = {
  appointment_booked: "Appointment Booked",
  follow_up_scheduled: "Follow-up Scheduled",
  visit_completed: "Visit Completed",
};

