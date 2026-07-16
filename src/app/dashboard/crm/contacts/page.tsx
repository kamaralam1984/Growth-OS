import { Container } from "@/components/ui/container";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "../../_lib/require-membership";
import { CrmContactForm } from "../_components/crm-contact-form";
import { ContactList } from "../_components/contact-list";
import { CsvImportButton } from "../_components/csv-import-button";
import { importContactsFile } from "../_lib/import-export";

export default async function CrmContactsPage() {
  const { membership } = await requireActiveMembership("/dashboard/crm/contacts");
  const organizationId = membership.organizationId;

  const [contacts, companies] = await Promise.all([
    prisma.contact.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: { company: { select: { id: true, name: true } } },
    }),
    prisma.company.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Contacts</h1>
            <p className="text-sm text-muted-foreground">
              Full contact management — name, position, business email/phone, LinkedIn, department, company, and a
              relationship score. The same Contact rows also power Outreach&rsquo;s campaign contacts.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <CsvImportButton label="Import CSV/Excel" action={importContactsFile} />
            <CrmContactForm companies={companies} />
          </div>
        </div>

        <ContactList
          companies={companies}
          contacts={contacts.map((c) => ({
            id: c.id,
            firstName: c.firstName,
            lastName: c.lastName,
            email: c.email,
            jobTitle: c.jobTitle,
            phone: c.phone,
            department: c.department,
            linkedin: c.linkedin,
            relationshipScore: c.relationshipScore,
            companyName: c.company?.name ?? null,
            companyId: c.company?.id ?? null,
          }))}
        />
      </Container>
    </main>
  );
}
