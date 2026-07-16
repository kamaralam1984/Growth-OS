import type { Variants } from "framer-motion";

/**
 * KVL GrowthOS — Shared animation primitives.
 *
 * Consumed by section components via framer-motion's `variants` prop,
 * typically with:
 *   <motion.div variants={fadeInUp} initial="hidden" whileInView="visible"
 *     viewport={{ once: true, margin: "-80px" }} />
 */

export const DURATIONS = {
  fast: 0.15,
  base: 0.3,
  slow: 0.6,
  slower: 0.9,
} as const;

export const EASES = {
  outExpo: [0.16, 1, 0.3, 1] as [number, number, number, number],
  spring: [0.34, 1.56, 0.64, 1] as [number, number, number, number],
  outQuad: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATIONS.slow, ease: EASES.outExpo },
  },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATIONS.base } },
};

export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

/**
 * Per-word/char stagger reveal. Apply `textReveal` to a `staggerContainer`
 * (or its own parent with `staggerChildren`) wrapping individual
 * word/char spans, each animated with this variant.
 *
 *   <motion.span variants={staggerContainer} initial="hidden" whileInView="visible">
 *     {words.map((word) => (
 *       <motion.span key={word} variants={textReveal} className="inline-block">
 *         {word}&nbsp;
 *       </motion.span>
 *     ))}
 *   </motion.span>
 */
export const textReveal: Variants = {
  hidden: { opacity: 0, y: "0.5em" },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATIONS.slow, ease: EASES.outExpo },
  },
};

/**
 * Slow pulsing glow — spread as an `animate` prop for a persistent glow
 * (e.g. on a CTA button or badge), not tied to viewport/hover state.
 *
 *   <motion.div animate={glowPulse.animate} className="shadow-glow-emerald" />
 */
export const glowPulse = {
  animate: {
    opacity: [0.6, 1, 0.6],
    scale: [1, 1.03, 1],
    transition: {
      duration: 2.6,
      repeat: Infinity,
      repeatType: "mirror" as const,
      ease: EASES.outQuad,
    },
  },
};
