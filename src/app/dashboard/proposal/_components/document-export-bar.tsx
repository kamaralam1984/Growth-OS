import { FileDown, Printer } from "lucide-react";

export interface DocumentExportBarProps {
  kindSlug: "proposal" | "quotation" | "contract" | "invoice" | "business-document";
  id: string;
}

/** Reused on every document type's detail page — PDF/DOCX export (real files from the shared document engine) plus a Print link that opens the PDF for the browser's native print dialog. */
export function DocumentExportBar({ kindSlug, id }: DocumentExportBarProps) {
  const base = `/api/documents/export/${kindSlug}/${id}`;
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <a href={`${base}?format=pdf`} className="flex items-center gap-1.5 text-primary hover:underline">
        <FileDown className="size-4" /> Export PDF
      </a>
      <a href={`${base}?format=docx`} className="flex items-center gap-1.5 text-primary hover:underline">
        <FileDown className="size-4" /> Export DOCX
      </a>
      <a href={`${base}?format=pdf`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-primary hover:underline">
        <Printer className="size-4" /> Print
      </a>
    </div>
  );
}
