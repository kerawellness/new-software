import { Banknote, CreditCard } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { formatCurrency, formatDate } from "@/lib/format";
import { parseClinicBillExtras } from "@/lib/clinic-identity";

export type InvoiceBillClinic = {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
  tax_enabled?: boolean | null;
  tax_label?: string | null;
  tax_rate?: number | null;
};

export type InvoiceBillPatient = {
  full_name: string;
  patient_code: string;
  phone?: string | null;
  address?: string | null;
};

export type InvoiceBillItem = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
};

export type InvoiceBillData = {
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  tax_amount: number;
  grand_total: number;
  paid_amount: number;
  balance_amount: number;
  notes?: string | null;
  status?: string | null;
};

type InvoiceBillTemplateProps = {
  clinic: InvoiceBillClinic | null | undefined;
  patient: InvoiceBillPatient | null | undefined;
  invoice: InvoiceBillData;
  items: InvoiceBillItem[];
  currency: string;
  /** Optional next installment / payment due date */
  paymentDueDate?: string | null;
  className?: string;
  /** Compact spacing for on-screen fit */
  compact?: boolean;
};

/**
 * Standalone printable clinic invoice template.
 * Keep presentation-only — pass live invoice data from the page.
 */
export function InvoiceBillTemplate({
  clinic,
  patient,
  invoice,
  items,
  currency,
  paymentDueDate,
  className,
  compact = false,
}: InvoiceBillTemplateProps) {
  const clinicName = clinic?.name ?? "Dental Clinic";
  const taxLabel = clinic?.tax_label?.trim() || "Tax";
  const taxRate = Number(clinic?.tax_rate ?? 0);
  const showTax = Number(invoice.tax_amount) > 0 || Boolean(clinic?.tax_enabled && taxRate > 0);
  const billExtras = parseClinicBillExtras(clinic?.address);

  const contactLine = [
    billExtras.address || null,
    clinic?.phone ? `Ph: ${clinic.phone}` : null,
    clinic?.email?.trim(),
  ]
    .filter(Boolean)
    .join("  |  ");

  const pad = compact ? "px-5 py-4" : "px-8 py-8 sm:px-10 sm:py-10";
  const titleSize = compact ? "text-2xl" : "text-3xl sm:text-4xl";
  const sectionGap = compact ? "mt-3" : "mt-6";
  const tableGap = compact ? "mt-4" : "mt-8";
  const cellPad = compact ? "px-2 py-1.5" : "px-3 py-2.5";
  const footerGap = compact ? "mt-4 pt-3" : "mt-10 pt-5";

  return (
    <article
      id="invoice-bill-template"
      className={[
        "invoice-bill-sheet mx-auto w-[794px] min-h-0 max-w-none bg-[#faf9f6] text-slate-900 shadow-sm print:min-h-[1123px] print:shadow-none",
        className ?? "",
      ].join(" ")}
    >
      <div className={pad}>
        <header className={`flex flex-col items-center text-center border-b border-slate-200 ${compact ? "pb-3" : "pb-6"}`}>
          <div className="flex items-center gap-2">
            {clinic?.logo_url && !isPdfLogo(clinic.logo_url) ? (
              <img
                src={clinic.logo_url}
                alt=""
                className={compact ? "h-7 w-7 object-contain" : "h-10 w-10 object-contain"}
              />
            ) : clinic?.logo_url ? (
              <span
                className={`grid place-items-center rounded bg-[#0f5c5c] font-semibold text-white ${
                  compact ? "h-7 w-7 text-[8px]" : "h-10 w-10 text-[9px]"
                }`}
              >
                PDF
              </span>
            ) : (
              <ToothMark className={compact ? "h-7 w-7" : "h-9 w-9"} />
            )}
            <h1
              className={`font-bold tracking-[0.08em] uppercase text-[#0f5c5c] ${
                compact ? "text-sm sm:text-base" : "text-lg sm:text-xl"
              }`}
            >
              {clinicName}
            </h1>
          </div>
          {contactLine ? (
            <p className={`text-slate-600 max-w-xl leading-snug ${compact ? "mt-1 text-[10px]" : "mt-2 text-[11px] sm:text-xs"}`}>
              {contactLine}
            </p>
          ) : null}
          {billExtras.gstin ? (
            <p className={`text-slate-600 ${compact ? "mt-0.5 text-[10px]" : "mt-1 text-[11px] sm:text-xs"}`}>
              GSTIN: {billExtras.gstin}
            </p>
          ) : (
            <p className={`text-amber-800 print:hidden ${compact ? "mt-0.5 text-[10px]" : "mt-1 text-[11px] sm:text-xs"}`}>
              Add GSTIN in Settings so it appears on printed bills.
            </p>
          )}
          <p className={`${compact ? "mt-2" : "mt-5"} ${titleSize} font-serif font-semibold tracking-wide text-slate-900`}>
            INVOICE
          </p>
        </header>

        <section className={`${sectionGap} grid gap-3 sm:grid-cols-2 text-[11px] sm:text-xs`}>
          <div className="space-y-1 sm:pr-3 sm:border-r sm:border-slate-200">
            <Row label="Patient Name" value={patient?.full_name ?? "—"} />
            <Row label="Patient Code" value={patient?.patient_code ?? "—"} />
            <Row label="Address" value={patient?.address?.trim() || "—"} />
            <Row label="Contact" value={patient?.phone?.trim() || "—"} />
          </div>
          <div className="space-y-1 sm:pl-2">
            <Row label="Invoice No" value={invoice.invoice_number} />
            <Row label="Issued Date" value={formatDate(invoice.invoice_date)} />
            <Row
              label="Payment Due Date"
              value={paymentDueDate ? formatDate(paymentDueDate) : "—"}
            />
          </div>
        </section>

        <section className={`${tableGap}`}>
          <table className="w-full border-collapse text-[11px] sm:text-xs">
            <thead>
              <tr className="bg-[#0f5c5c] text-white">
                <th className={`${cellPad} text-left font-semibold`}>#</th>
                <th className={`${cellPad} text-left font-semibold`}>Treatment / Description</th>
                <th className={`${cellPad} text-left font-semibold whitespace-nowrap`}>Date</th>
                <th className={`${cellPad} text-center font-semibold`}>Qty</th>
                <th className={`${cellPad} text-right font-semibold whitespace-nowrap`}>Unit Price</th>
                <th className={`${cellPad} text-right font-semibold`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr className="border-b border-slate-200 bg-white">
                  <td colSpan={6} className={`${cellPad} text-center text-slate-500 italic`}>
                    No line items on this invoice.
                  </td>
                </tr>
              ) : (
                items.map((item, index) => (
                  <tr
                    key={item.id}
                    className={
                      index % 2 === 0
                        ? "bg-white border-b border-slate-200"
                        : "bg-slate-50/80 border-b border-slate-200"
                    }
                  >
                    <td className={`${cellPad} text-slate-600`}>{index + 1}</td>
                    <td className={`${cellPad} font-medium text-slate-900`}>{item.description}</td>
                    <td className={`${cellPad} text-slate-600 whitespace-nowrap`}>
                      {formatDate(invoice.invoice_date)}
                    </td>
                    <td className={`${cellPad} text-center tabular-nums`}>{item.quantity}</td>
                    <td className={`${cellPad} text-right tabular-nums whitespace-nowrap`}>
                      {formatCurrency(item.unit_price, currency)}
                    </td>
                    <td className={`${cellPad} text-right tabular-nums font-medium whitespace-nowrap`}>
                      {formatCurrency(item.amount, currency)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className={`${compact ? "mt-3" : "mt-6"} flex justify-end`}>
          <div className="w-full max-w-xs space-y-1 text-[11px] sm:text-xs">
            <TotalRow label="Subtotal" value={formatCurrency(invoice.total_amount, currency)} />
            {showTax ? (
              <TotalRow
                label={`${taxLabel}${taxRate > 0 ? ` (${taxRate}%)` : ""}`}
                value={formatCurrency(invoice.tax_amount, currency)}
              />
            ) : null}
            <div className="flex justify-between border-t border-slate-300 pt-1.5 mt-0.5 font-bold text-xs sm:text-sm">
              <span>Total Amount Due</span>
              <span className="tabular-nums">{formatCurrency(invoice.grand_total, currency)}</span>
            </div>
          </div>
        </section>

        <section className={tableGap}>
          <div className="bg-[#0f5c5c] px-3 py-1.5 text-white text-[11px] sm:text-xs font-semibold tracking-wide uppercase">
            Payment Summary &amp; Current Balance
          </div>
          <div className="grid gap-3 sm:grid-cols-2 border border-t-0 border-slate-200 bg-white px-3 py-3 text-[11px] sm:text-xs">
            <div className="space-y-1.5">
              <p className="font-semibold text-slate-800">Payments Received</p>
              <div className="flex justify-between">
                <span className="text-slate-600">Paid to Date</span>
                <span className="tabular-nums font-medium text-slate-800">
                  {formatCurrency(invoice.paid_amount, currency)}
                </span>
              </div>
            </div>
            <div className="space-y-1.5 sm:border-l sm:border-slate-200 sm:pl-3">
              <div className="flex justify-between">
                <span className="text-slate-600">Total Invoice Due</span>
                <span className="tabular-nums">{formatCurrency(invoice.grand_total, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Less Paid</span>
                <span className="tabular-nums">-{formatCurrency(invoice.paid_amount, currency)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold">
                <span>Balance Amount</span>
                <span
                  className={[
                    "tabular-nums",
                    Number(invoice.balance_amount) > 0 ? "text-red-700" : "text-slate-800",
                  ].join(" ")}
                >
                  {formatCurrency(invoice.balance_amount, currency)}
                </span>
              </div>
            </div>
          </div>
        </section>

        {invoice.notes?.trim() ? (
          <section className={`${compact ? "mt-2" : "mt-5"} text-[11px] text-slate-600`}>
            <p className="font-semibold text-slate-800 mb-0.5">Notes</p>
            <p className="whitespace-pre-wrap line-clamp-3 print:line-clamp-none">{invoice.notes}</p>
          </section>
        ) : null}

        <footer className={`${footerGap} flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between border-t border-slate-200`}>
          <div className="flex items-center gap-1.5 text-[#0f5c5c]">
            <CreditCard className={compact ? "size-4" : "size-5"} aria-hidden />
            <Banknote className={compact ? "size-4" : "size-5"} aria-hidden />
            <span className="text-[10px] text-slate-500 ml-1">
              {billExtras.upi ? `UPI: ${billExtras.upi}` : "Cash · Card · UPI · Bank Transfer"}
            </span>
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-600 sm:text-right space-y-0.5 max-w-sm">
            <p>Please make payments payable to {clinicName}.</p>
            <p className="italic text-slate-500">Thank you for choosing {clinicName}.</p>
          </div>
        </footer>
      </div>
    </article>
  );
}

/**
 * Scales the invoice sheet to fit the visible frame (contain): both width and height.
 * Content is absolutely positioned so unscaled A4 size does not expand the dialog.
 * Print resets scale via CSS.
 */
export function InvoiceBillFitFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [natural, setNatural] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    const update = () => {
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      // Measure unscaled size (ignore transform)
      const cw = Math.max(content.scrollWidth, content.offsetWidth, 1);
      const ch = Math.max(content.scrollHeight, content.offsetHeight, 1);
      if (vw <= 0) return;

      const widthScale = vw / cw;
      // If height is not ready yet, fit width only so mobile still shrinks
      const heightScale = vh > 8 ? vh / ch : widthScale;
      const next = Math.min(widthScale, heightScale, 1);
      const safe = Number.isFinite(next) && next > 0 ? next : 1;
      setScale(safe);
      setNatural({ w: cw, h: ch });
    };

    update();
    const raf = window.requestAnimationFrame(update);
    const ro = new ResizeObserver(() => {
      update();
      window.requestAnimationFrame(update);
    });
    ro.observe(viewport);
    ro.observe(content);
    window.addEventListener("resize", update);
    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [children]);

  const layoutW = natural.w ? natural.w * scale : "100%";
  const layoutH = natural.h ? natural.h * scale : "100%";

  return (
    <div
      ref={viewportRef}
      className={[
        "invoice-bill-fit-frame relative h-full min-h-0 w-full overflow-hidden",
        className ?? "",
      ].join(" ")}
    >
      <div
        className="relative mx-auto max-h-full max-w-full"
        style={{
          width: layoutW,
          height: layoutH,
        }}
      >
        <div
          ref={contentRef}
          className="invoice-bill-fit-content absolute left-0 top-0 origin-top-left print:relative print:origin-top print:!scale-100"
          style={{ transform: `scale(${scale})` }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="font-semibold text-slate-800">{label}:</span>{" "}
      <span className="text-slate-700">{value}</span>
    </p>
  );
}

function TotalRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className={`flex justify-between ${muted ? "text-slate-500" : "text-slate-700"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function isPdfLogo(url: string) {
  const value = url.trim().toLowerCase();
  return value.startsWith("data:application/pdf") || value.endsWith(".pdf");
}

function ToothMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={className ?? "h-9 w-9 text-[#0f5c5c]"}
      aria-hidden
      fill="currentColor"
    >
      <path d="M20 4c-4.2 0-7.5 2.4-8.8 5.8C9.8 12.8 8 16.2 8 20.2c0 3.4 1.2 6.2 2.8 7.6.9.8 1.7.7 2.2-.3l1.6-3.4c.4-.8 1.2-.8 1.6 0l1.3 2.8c.5 1.1 1.4 1.1 1.9 0l1.3-2.8c.4-.8 1.2-.8 1.6 0l1.6 3.4c.5 1 1.3 1.1 2.2.3C30.8 26.4 32 23.6 32 20.2c0-4-1.8-7.4-3.2-10.4C27.5 6.4 24.2 4 20 4z" />
    </svg>
  );
}
