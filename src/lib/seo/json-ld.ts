export interface FaqEntry {
  question: string;
  answer: string;
}

/** Generic FAQPage JSON-LD builder — real content only, sourced from wherever the actual FAQ list lives (see faq.tsx). */
export function buildFaqPageJsonLd(faqs: FaqEntry[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}
