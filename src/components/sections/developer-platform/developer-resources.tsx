"use client";

import { motion } from "framer-motion";
import { Download, FileJson, Terminal } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fadeInUp, staggerContainer } from "@/animations";

interface Resource {
  icon: typeof Download;
  title: string;
  description: string;
  href: string;
  cta: string;
}

// Real, downloadable files — generated and verified against the actual API this session.
const RESOURCES: Resource[] = [
  { icon: FileJson, title: "OpenAPI Specification", description: "A real, valid OpenAPI 3.0 spec for every documented endpoint.", href: "/openapi.yaml", cta: "Download openapi.yaml" },
  { icon: Download, title: "Postman Collection", description: "Import directly into Postman — Bearer auth pre-configured.", href: "/kvl-api.postman_collection.json", cta: "Download collection" },
  { icon: Terminal, title: "CLI Tool", description: "A real command-line client covering all 4 endpoints. Not published to npm yet — clone the repo and run it locally.", href: "", cta: "See CLI docs below" },
];

function DeveloperResources() {
  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading eyebrow="Resources" title="Real, downloadable resources" />
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid w-full grid-cols-1 gap-5 sm:grid-cols-3"
        >
          {RESOURCES.map((resource) => {
            const Icon = resource.icon;
            return (
              <motion.div key={resource.title} variants={fadeInUp}>
                <Card glass className="flex h-full flex-col">
                  <CardHeader>
                    <Icon className="mb-2 size-5 text-primary" strokeWidth={2.5} />
                    <CardTitle className="text-base">{resource.title}</CardTitle>
                    <CardDescription>{resource.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto">
                    {resource.title === "CLI Tool" ? (
                      <p className="text-xs text-muted-foreground">{resource.cta}</p>
                    ) : (
                      <Button asChild variant="outline" size="sm">
                        <a href={resource.href} download>
                          {resource.cta}
                        </a>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      </Container>
    </section>
  );
}

export default DeveloperResources;
export { DeveloperResources };
