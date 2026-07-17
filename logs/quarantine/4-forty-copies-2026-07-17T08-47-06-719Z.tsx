/* QUARANTINE EVIDENCE — this section was replaced with a stub because it did not parse.
 * section : 4-forty-copies (editorial, strategy:scratch, tier:bulk)
 * error   : Expected "=>" but found "="
 * tiers   : only the final bulk output failed
 *
 * Below: [1] the exact code the writer parsed (post sanitize/deNextify/react-import/default-export),
 * (generation recorded no per-tier failures — the transforms are the prime suspect.)
 */
// ---------- [1] FINAL (what the writer parsed) — Expected "=>" but found "="
import React, { useState, useEffect, useRef } from 'react'
export default function FortycopiesSection() {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => {
      if (sectionRef.current) {
        observer.unobserve(sectionRef.current);
      }
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="bg-background text-foreground py-24 md:py-32"
    >
      <div className="max-w-5xl mx-auto px-6 md:px-12">
        {/* Header */}
        <div className="mb-24 md:mb-32">
          <h2 className="text-4xl md:text-5xl font-serif font-light leading-tight tracking-tight mb-8">
            Forty Copies
          </h2>
          <p className="text-lg md:text-xl text-muted-foreground font-light leading-relaxed max-w-2xl">
            Each edition exists as a discrete object. Not inventory. Not a print run. Forty bound books, each numbered and signed.
          </p>
        </div>

        {/* Main editorial grid: text left, image right with generous margins */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-16 md:gap-24 items-start">
          {/* Left column: editorial text */}
          <div className="md:col-span-1">
            <div className="space-y-8">
              <p className="text-base md:text-lg text-foreground font-light leading-relaxed">
                Why forty? It's not arbitrary. Forty is the threshold where a book stops being a favour and becomes a statement. Small enough that each copy retains weight. Large enough to reach.
              </p>

              {/* Pull quote */}
              <div className="border-l-2 border-primary pl-6 py-4">
                <p className="text-base md:text-lg font-serif italic text-primary leading-relaxed">
                  "Each number is a commitment to physical permanence."
                </p>
              </div>

              <p className="text-base md:text-lg text-foreground font-light leading-relaxed">
                Every copy bears a handwritten number on its colophon. Copy 1 through 40. This isn't decoration. It means each book is witnessed, accounted for. Someone in Porto bound it. Someone knows it exists.
              </p>
            </div>
          </div>

          {/* Right column: image + caption */}
          <div className="md:col-span-2">
            <div className="space-y-6">
              {/* Image container with duotone treatment */}
              <div
                className={`bg-card rounded-sm overflow-hidden transition-opacity duration-700 ${
                  isVisible ? 'opacity-100' : 'opacity-0'
                }`}
              >
                <img
                  src="https://image.pollinations.ai/prompt/rawcottoncolophon%2C%20close-up%20detail%20shot%2C%20editorial%20photography%2C%20soft%20diffused%20daylight%2C%2050mm-equivalent%2C%20eye-level%2C%20minimal%20distortion%2C%20no%20wide-angle%20drama%2C%20matte%2C%20gentle%20grain%2C%20no%20text%2C%20no%20watermark%2C%20no%20staged%20lifestyle%20smiles%2C%20no%20bright%20saturated%20color%2C%20no%20stock-photo%20gloss%2C%20no%20digital%20ui%20overlays%2C%20no%20modern%20branding%20props?width=800&height=600&nologo=true&model=flux&seed=88792"
                  alt="Handwritten colophon page of numbered edition, duotone"
                  className="w-full h-auto object-cover aspect-[4/3] filter contrast-110"
                  onLoad={() = width={800} height={600} loading="lazy" decoding="async"> setImageLoaded(true)}
                />
              </div>

              {/* Caption in margin-style placement */}
              <div className="pt-4 border-t border-border">
                <p className="text-sm md:text-base text-muted-foreground font-light leading-relaxed max-w-xl">
                  Colophon page, hand-bound. Each copy numbered in ink, signed. The numbering is not logistics—it is the book acknowledging itself as a finite, intentional object.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Secondary narrative block, full width below */}
        <div className="mt-24 md:mt-32 grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-24">
          <div className="space-y-8">
            <h3 className="text-2xl md:text-3xl font-serif font-light leading-tight">
              Paper and Hand
            </h3>
            <p className="text-base md:text-lg text-foreground font-light leading-relaxed">
              The paper we use is made in our studio—cotton rag stock, no acid, no rush. It will outlast ink. It will outlast binding trends. It was made to be held for decades.
            </p>
            <p className="text-base md:text-lg text-foreground font-light leading-relaxed">
              Forty copies, hand-sewn. No machinery. No compromise on thread or stitch. The cost per book is irrelevant. The cost per generation of readers is the only measure that matters.
            </p>
          </div>

          <div className="space-y-8">
            <h3 className="text-2xl md:text-3xl font-serif font-light leading-tight">
              What the Number Means
            </h3>
            <p className="text-base md:text-lg text-foreground font-light leading-relaxed">
              A number is a genealogy. Copy 37 will be read by someone who knows copies 1–36 exist. This edition is not a wave of identical objects. It's a family of witnesses to the same poem.
            </p>
            <p className="text-base md:text-lg text-foreground font-light leading-relaxed">
              Each number is also a refusal. A refusal of the warehouse, the remainder pile, the clearance. These forty books will never be discounted. They will never be bulk. They are forty decisions to keep something alive.
            </p>
          </div>
        </div>

        {/* Closing statement */}
        <div className="mt-24 md:mt-32 pt-16 md:pt-24 border-t border-border">
          <p className="text-lg md:text-xl text-foreground font-light leading-relaxed max-w-3xl">
            Verso publishes editions of out-of-print Portuguese poetry—work that no commercial press will reprint because the numbers don't work. We believe the numbers are wrong. We believe some books deserve to outlive their market. Forty numbered copies, hand-bound, is how we argue.
          </p>
        </div>
      </div>
    </section>
  );
}
