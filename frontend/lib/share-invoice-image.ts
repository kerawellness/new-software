type ShareInvoiceImageOptions = {
  element: HTMLElement;
  invoiceNumber: string;
  patientName: string;
  clinicName: string;
};

type RenderedInvoice = {
  blob: Blob;
  width: number;
  height: number;
};

async function renderInvoiceImage(element: HTMLElement): Promise<RenderedInvoice> {
  const { toBlob } = await import("html-to-image");
  await document.fonts?.ready;

  const width = element.scrollWidth;
  const height = element.scrollHeight;
  const blob = await toBlob(element, {
    backgroundColor: "#faf9f6",
    cacheBust: true,
    pixelRatio: 2,
    width,
    height,
  });

  if (!blob) throw new Error("Unable to create the invoice image.");
  return { blob, width, height };
}

function safeInvoiceNumber(invoiceNumber: string) {
  return invoiceNumber.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

export async function shareInvoiceImage({
  element,
  invoiceNumber,
  patientName,
  clinicName,
}: ShareInvoiceImageOptions): Promise<"shared" | "cancelled"> {
  const { blob } = await renderInvoiceImage(element);

  const file = new File([blob], `invoice-${safeInvoiceNumber(invoiceNumber)}.png`, {
    type: "image/png",
  });

  if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
    throw new Error(
      "Image sharing is not supported on this device. Open the invoice on a supported mobile browser.",
    );
  }

  try {
    await navigator.share({
      files: [file],
      title: `Invoice ${invoiceNumber}`,
      text: `Hello ${patientName}, please find invoice ${invoiceNumber} from ${clinicName}.`,
    });
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    throw error;
  }
}

export async function printInvoiceA4(element: HTMLElement, invoiceNumber: string) {
  const printWindow = window.open("", "_blank", "width=900,height=1000");
  if (!printWindow) throw new Error("Allow pop-ups to print this invoice.");

  printWindow.document.write(
    "<p style='font-family:sans-serif;padding:24px'>Preparing A4 invoice…</p>",
  );

  try {
    const { blob } = await renderInvoiceImage(element);
    const imageUrl = URL.createObjectURL(blob);
    const title = `Invoice ${safeInvoiceNumber(invoiceNumber)}`;

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
      <html>
        <head>
          <title>${title}</title>
          <style>
            @page { size: A4 portrait; margin: 0; }
            * { box-sizing: border-box; }
            html, body { width: 210mm; height: 297mm; margin: 0; background: white; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .page {
              width: 210mm;
              height: 297mm;
              padding: 10mm;
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
            }
            img { display: block; max-width: 190mm; max-height: 277mm; object-fit: contain; }
          </style>
        </head>
        <body>
          <main class="page"><img id="invoice" src="${imageUrl}" alt="${title}" /></main>
        </body>
      </html>`);
    printWindow.document.close();

    const image = printWindow.document.getElementById("invoice") as HTMLImageElement | null;
    if (!image) throw new Error("Unable to prepare the A4 print page.");
    const startPrint = () => {
      printWindow.focus();
      printWindow.print();
    };
    if (image.complete) startPrint();
    else image.onload = startPrint;
    printWindow.addEventListener(
      "afterprint",
      () => {
        URL.revokeObjectURL(imageUrl);
        printWindow.close();
      },
      { once: true },
    );
  } catch (error) {
    printWindow.close();
    throw error;
  }
}

export async function downloadInvoicePdfA4(element: HTMLElement, invoiceNumber: string) {
  const { jsPDF } = await import("jspdf");
  const { blob, width, height } = await renderInvoiceImage(element);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 10;
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2;
  const scale = Math.min(availableWidth / width, availableHeight / height);
  const imageWidth = width * scale;
  const imageHeight = height * scale;
  const x = (pageWidth - imageWidth) / 2;
  const y = (pageHeight - imageHeight) / 2;
  const bytes = new Uint8Array(await blob.arrayBuffer());

  pdf.addImage(bytes, "PNG", x, y, imageWidth, imageHeight, undefined, "FAST");
  pdf.save(`invoice-${safeInvoiceNumber(invoiceNumber)}.pdf`);
}
