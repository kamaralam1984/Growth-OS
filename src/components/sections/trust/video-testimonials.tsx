"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, PlayCircle } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { fadeInUp, staggerContainer } from "@/animations";
import { VIDEO_TESTIMONIALS, type VideoTestimonial } from "@/lib/trust-content";

/**
 * Architecture-only for now — VIDEO_TESTIMONIALS is empty until real
 * recorded client videos exist (see src/lib/trust-content.ts's header
 * comment). Renders an honest "coming soon" state below, matching the
 * visual language of src/app/profile/_components/coming-soon-card.tsx.
 * The populated-mode gallery + popup player is fully implemented and
 * ready to go the moment real entries are added to that array — no
 * changes needed here. The popup player follows the same Dialog-based
 * pattern as src/components/ui/video-modal.tsx.
 */

function VideoTestimonialCard({
  video,
  onOpen,
}: {
  video: VideoTestimonial;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-card transition-shadow duration-150 hover:shadow-elevated"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element -- real client-recorded thumbnails are arbitrary uploaded/external URLs, matching the plain-<img> convention used across this codebase rather than next/image, which would require remotePatterns for an unknown future host. */}
        <img
          src={video.thumbnailUrl}
          alt=""
          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors duration-150 group-hover:bg-black/40">
          <PlayCircle className="size-12 text-white drop-shadow-lg" strokeWidth={1.5} />
        </div>
        <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-0.5 text-xs font-medium text-white">
          {video.duration}
        </span>
      </div>
      <div className="flex flex-col gap-1 p-4">
        <p className="text-sm font-semibold text-foreground">{video.clientName}</p>
        <p className="text-xs text-muted-foreground">
          {video.company} &middot; {video.project}
        </p>
      </div>
    </button>
  );
}

function VideoTestimonials() {
  const [openVideo, setOpenVideo] = useState<VideoTestimonial | null>(null);
  const hasVideos = VIDEO_TESTIMONIALS.length > 0;

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Video testimonials"
          title="Hear it directly from our clients"
          description="Short recorded conversations about the results real engagements produced."
        />

        {hasVideos ? (
          <>
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
            >
              {VIDEO_TESTIMONIALS.map((video) => (
                <motion.div key={video.videoUrl} variants={fadeInUp}>
                  <VideoTestimonialCard video={video} onOpen={() => setOpenVideo(video)} />
                </motion.div>
              ))}
            </motion.div>

            <Dialog open={openVideo !== null} onOpenChange={(open) => !open && setOpenVideo(null)}>
              <DialogContent className="max-w-2xl">
                {openVideo ? (
                  <>
                    <DialogHeader>
                      <DialogTitle>{openVideo.clientName}</DialogTitle>
                      <DialogDescription>
                        {openVideo.company} &middot; {openVideo.project}
                      </DialogDescription>
                    </DialogHeader>
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption -- no real caption/subtitle track exists yet for these architecture-only video testimonials (no video content exists at all — VIDEO_TESTIMONIALS is empty); a fabricated <track src> would violate the "never invent placeholder data" rule in src/lib/trust-content.ts. Add a real captions track alongside the real videoUrl once real recordings exist. */}
                    <video
                      controls
                      src={openVideo.videoUrl}
                      className="w-full rounded-xl border border-border"
                    >
                      Your browser does not support the video tag.
                    </video>
                    <p className="mt-4 text-sm leading-relaxed text-foreground">{openVideo.results}</p>
                  </>
                ) : null}
              </DialogContent>
            </Dialog>
          </>
        ) : (
          <Card glass className="w-full max-w-2xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Video testimonials</CardTitle>
                <Badge variant="accent">Coming soon</Badge>
              </div>
              <CardDescription>
                Recorded client video testimonials will appear here once they&apos;re available.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
                <Sparkles className="size-6 text-muted-foreground" />
                <p className="max-w-sm text-sm text-muted-foreground">
                  This isn&apos;t built yet — check back in a future release.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </Container>
    </section>
  );
}

export default VideoTestimonials;
export { VideoTestimonials };
