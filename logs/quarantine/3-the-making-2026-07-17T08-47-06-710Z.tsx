/* QUARANTINE EVIDENCE — this section was replaced with a stub because it did not parse.
 * section : 3-the-making (asymmetric, strategy:scratch, tier:bulk)
 * error   : Expected "=>" but found "="
 * tiers   : only the final bulk output failed
 *
 * Below: [1] the exact code the writer parsed (post sanitize/deNextify/react-import/default-export),
 * (generation recorded no per-tier failures — the transforms are the prime suspect.)
 */
// ---------- [1] FINAL (what the writer parsed) — Expected "=>" but found "="
import React, { useState, useEffect, useRef } from 'react'
export default function TheMaking() {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.2 }
    );

    if (imageRef.current) {
      observer.observe(imageRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section className="bg-background text-foreground py-28">
      <div className="max-w-6xl mx-auto px-6">
        {/* Asymmetric grid: text column (narrower, left) + image column (dominant, right) */}
        <div className="grid grid-cols-3 gap-12 items-start">
          {/* Left column: 1 of 3, text, hanging slightly into negative space */}
          <div className="col-span-1 pt-4">
            <h2 className="text-4xl leading-tight font-serif text-foreground mb-8">
              The Making
            </h2>
            
            <div className="space-y-6 text-lg leading-relaxed font-serif">
              <p className="text-foreground">
                Each copy begins as fibre: cotton rag sourced from textile waste, beaten into pulp in a vat of water. No bleach. No machines beyond what hands can feed. The mixture is lifted on a wooden deckle, shaken once to felt the fibres, and pressed into sheets.
              </p>

              {/* Pull-quote hanging into margin */}
              <blockquote className="text-primary italic font-serif -ml-4 pl-4 border-l-2 border-primary py-2">
                "Some books deserve to physically outlive their commercial life."
              </blockquote>

              <p className="text-muted-foreground">
                Forty sheets for forty copies. Each one takes three minutes to lift. Two hundred minutes of hands in water.
              </p>

              <p className="text-foreground">
                Then the spine. Signatures are folded and stacked—often four, sometimes five depending on page count. A bone folder creases the spine crisp. Thread is waxed. The needle passes through the centrefold of each signature, catches the kettle stitch, knots off. The sewing frame holds tension. Your back aches before the second copy is done.
              </p>

              <p className="text-muted-foreground">
                By the fortieth, your hands know the motion. The rhythm is the argument: this takes time because time is what proves it matters.
              </p>
            </div>
          </div>

          {/* Right column: 2 of 3, dominant image with asymmetric crop and negative space */}
          <div 
            ref={imageRef}
            className={`col-span-2 aspect-[4/5] overflow-hidden rounded-sm transition-all duration-700 ${
              isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
            }`}
          >
            <img
              src="https://image.pollinations.ai/prompt/rawcottonthread%2C%20extreme%20close-up%2C%20macro%20detail%2C%20editorial%20photography%2C%20soft%20diffused%20daylight%2C%2050mm-equivalent%2C%20eye-level%2C%20minimal%20distortion%2C%20no%20wide-angle%20drama%2C%20matte%2C%20gentle%20grain%2C%20no%20text%2C%20no%20watermark%2C%20no%20staged%20lifestyle%20smiles%2C%20no%20bright%20saturated%20color%2C%20no%20stock-photo%20gloss%2C%20no%20digital%20ui%20overlays%2C%20no%20modern%20branding%20props?width=800&height=1000&nologo=true&model=flux&seed=88785"
              alt="Hands sewing signatures at the binding frame, cotton thread and pressed sheets visible"
              className="w-full h-full object-cover object-center filter saturate-75 contrast-110"
              onLoad={() = width={800} height={1000} loading="lazy" decoding="async"> setImageLoaded(true)}
            />
            {/* Duotone overlay (subtle, via blend mode) */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-background/40 mix-blend-multiply pointer-events-none" />
          </div>
        </div>

        {/* Numbered edition marker at the bottom right, editorial style */}
        <div className="mt-16 text-right text-sm tracking-wide text-muted-foreground font-mono">
          Edition 1–40 · Hand-sewn · Cotton rag paper
        </div>
      </div>
    </section>
  );
}
