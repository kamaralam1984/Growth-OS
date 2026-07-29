import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * No real Discord/Slack community/public forum exists yet — routing to the
 * real /contact form (rather than a fake invite link) so real interest is
 * genuinely captured, honoring the spec's own "show placeholders rather than
 * fake links" rule.
 */
function CommunitySupport() {
  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-8">
        <SectionHeading
          eyebrow="Community & support"
          title="No public community yet — but we want to hear from you"
          description="We don't have a Discord, Slack community, or public forum today. Rather than link somewhere that doesn't exist, tell us directly."
        />
        <Card glass className="w-full max-w-xl">
          <CardHeader>
            <div className="flex items-center gap-2">
              <MessageCircle className="size-5 text-primary" strokeWidth={2.5} />
              <CardTitle>Talk to us directly</CardTitle>
            </div>
            <CardDescription>
              Questions, feedback, or interested in an early developer community when we launch one? Reach out.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/contact?department=SUPPORT">Contact developer support</Link>
            </Button>
          </CardContent>
        </Card>
      </Container>
    </section>
  );
}

export default CommunitySupport;
export { CommunitySupport };
