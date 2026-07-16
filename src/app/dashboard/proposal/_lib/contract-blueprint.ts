import type { DocumentBlueprint } from "@/lib/documents";

export interface ContractBlueprintInput {
  title: string;
  contractNumber: string;
  content: string;
  organizationName: string;
  logoUrl?: string | null;
  gstNumber?: string | null;
  registrationNumber?: string | null;
  clientName: string;
  value?: number | null;
  currency?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  createdAt: Date;
}

export function buildContractBlueprint(input: ContractBlueprintInput): DocumentBlueprint {
  const dateRange = [input.startDate ? `Start: ${input.startDate.toLocaleDateString()}` : null, input.endDate ? `End: ${input.endDate.toLocaleDateString()}` : null].filter(Boolean).join("  ·  ");

  return {
    docKind: "CONTRACT",
    title: input.title,
    subtitle: `Agreement between ${input.organizationName} and ${input.clientName}`,
    documentNumber: input.contractNumber,
    brand: { organizationName: input.organizationName, logoUrl: input.logoUrl, gstNumber: input.gstNumber, registrationNumber: input.registrationNumber },
    preparedFor: { name: input.clientName },
    coverNote: dateRange || undefined,
    tableOfContents: false,
    sections: [{ heading: "Agreement Terms", body: input.content }],
    signatureBlock: { parties: [{ role: input.clientName }, { role: input.organizationName }] },
    footerText: input.organizationName,
    generatedAt: input.createdAt,
  };
}
