export type CollectTargetInstallment = {
  id: string;
  amount: number;
  paid_amount: number;
  planId: string;
  totalCount: number;
  index: number;
};

export type RecordInvoicePaymentResult = {
  invoiceId: string;
  invoiceNumber: string;
  patientId: string;
  patientName: string;
  remaining: number;
  nextDueDate: string | null;
  clinicId: string;
};

export type InstallmentRecord = {
  id: string;
  amount: number;
  paid_amount: number;
  status: string;
  due_date: string;
};

export type InstallmentPlanRecord = {
  id: string;
  installments: InstallmentRecord[] | null;
};
