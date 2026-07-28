import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { SalesInquiryStatusSelect } from "./_components/sales-inquiry-status-select";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  NEW: "default",
  CONTACTED: "accent",
  CLOSED: "secondary",
};

function formatDateTime(date: Date): string {
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Platform-operator-only inbox for the public marketing site's "Talk to
 * sales" / contact form submissions (src/app/api/sales-inquiries/route.ts).
 * Platform-level, not organization-scoped — a visitor submitting this form
 * is pre-signup, so there's no tenant Lead/CRM pipeline to show it in yet.
 */
export default async function AdminSalesInquiriesPage() {
  await requirePlatformOwner("/admin/sales-inquiries");

  const inquiries = await prisma.salesInquiry.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  const newCount = inquiries.filter((i) => i.status === "NEW").length;

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Sales Inquiries</h1>
        <p className="text-sm text-muted-foreground">
          {newCount} new of {inquiries.length} total, from the public site&apos;s &ldquo;Talk to sales&rdquo; form.
        </p>
      </div>

      <Card glass>
        <CardHeader>
          <CardTitle>All inquiries</CardTitle>
          <CardDescription>{inquiries.length} total</CardDescription>
        </CardHeader>
        <CardContent>
          {inquiries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No inquiries submitted yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inquiries.map((inquiry) => (
                  <TableRow key={inquiry.id}>
                    <TableCell className="text-foreground">{inquiry.name}</TableCell>
                    <TableCell className="text-muted-foreground">{inquiry.company}</TableCell>
                    <TableCell className="text-muted-foreground">{inquiry.businessEmail}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{inquiry.department}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDateTime(inquiry.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={STATUS_VARIANT[inquiry.status] ?? "outline"}>{inquiry.status}</Badge>
                        <SalesInquiryStatusSelect inquiryId={inquiry.id} status={inquiry.status} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Container>
  );
}
