"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fadeInUp, staggerContainer } from "@/animations";
import { ADMIN_COMING_SOON } from "@/lib/admin-platform-content";

/**
 * Honest "coming soon" list — every item here is confirmed absent from the
 * codebase today (src/app/admin/_components/admin-sidebar.tsx's own code
 * comment documents platform-wide org/user management as deliberately out
 * of scope so far). Never presented as already built.
 */
function AdminComingSoon() {
  if (ADMIN_COMING_SOON.length === 0) {
    return null;
  }

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="On our roadmap"
          title="What's next for the admin platform"
          description="We'd rather show you an honest roadmap than a dashboard full of fake data."
        />
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {ADMIN_COMING_SOON.map((item) => (
            <motion.div key={item.title} variants={fadeInUp}>
              <Card glass>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    <Badge variant="accent">Coming soon</Badge>
                  </div>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-6 text-center">
                    <Sparkles className="size-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}

export default AdminComingSoon;
export { AdminComingSoon };
