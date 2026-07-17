/* QUARANTINE EVIDENCE — this section was replaced with a stub because it did not parse.
 * section : 6-the-sisters (editorial, strategy:motion-primitive, tier:bulk)
 * error   : Unexpected closing "ParallexDepth" tag does not match opening "ParallaxDepth" tag
 * tiers   : only the final bulk output failed
 *
 * Below: [1] the exact code the writer parsed (post sanitize/deNextify/react-import/default-export),
 * (generation recorded no per-tier failures — the transforms are the prime suspect.)
 */
// ---------- [1] FINAL (what the writer parsed) — Unexpected closing "ParallexDepth" tag does not match opening "ParallaxDepth" tag
import ParallaxDepth from './lib-parallax-depth'

export default function TheSisters() {
  return (
    <section className="section-pad bg-background">
      <div className="container-page">
        <div className="grid grid-cols-12 gap-8 items-start">
          {/* Left column: editorial text */}
          <div className="col-span-12 md:col-span-7">
            <h2 className="text-foreground mb-8">The Sisters</h2>
            
            <div className="space-y-6 text-sm leading-relaxed">
              <p className="text-foreground">
                In a workshop on Rua da Reboleira in Porto, two sisters—Clara and Marta—work with cotton rag, thread, and books nobody else will print anymore. They began Verso not as a business plan but as an argument: that some poetry is too good to let die just because it won't pay for itself.
              </p>
              
              <p className="text-muted-foreground">
                The economics of publishing have always been brutal to poets. A book sells forty copies, maybe fifty. The printer moves on. The book goes out of print. Within five years, nobody can find it. Within ten, it becomes a rumor. Verso interrupts that erasure. By hand.
              </p>
              
              <p className="text-foreground">
                Each edition is exactly forty copies. Forty sewn bindings. Forty covers made from their own handmade paper—cotton rag boiled, beaten, pressed. No shortcuts. No offset printing. No compromise on weight or texture or the way the spine opens. The book feels like it was made to last longer than its market did.
              </p>
              
              <p className="text-muted-foreground">
                They work slowly. A single edition takes three months. They choose the poets—Portuguese voices mostly, from the twentieth century, voices that fell through the commercial cracks. They set the type. They pull the proofs. They stitch the signatures by hand over an afternoon with coffee and the sound of the street outside.
              </p>
              
              <p className="text-foreground">
                This is not a luxury press. There are no gilt edges, no leather, no special-edition theatrics. It is stubborn, quiet, and utterly committed to the idea that a book's worth has nothing to do with how many copies sell.
              </p>
            </div>
          </div>

          {/* Right column: image + margin */}
          <div className="col-span-12 md:col-span-5">
            <div className="sticky top-12">
              <img
                src="https://image.pollinations.ai/prompt/raw%20cotton%20rag%20paper%20and%20thread%20%E2%80%94%20pulp%2C%20sewn%20signatures%2C%20bound%20spines%20in%20undyed%20cream%20and%20oxblood%20thread%2C%20verso%20cotton%20pulp%20hands%2C%20close-up%20detail%20shot%2C%20editorial%20photography%2C%20soft%20north-facing%20window%20light%2C%20low%20contrast%2C%20slightly%20overcast%2C%2050mm-equivalent%2C%20eye-level%2C%20minimal%20distortion%2C%20quiet%20documentary%20framing%2C%20ink-on-cream%20duotone%2C%20visible%20paper%20grain%2C%20no%20gloss%2C%20no%20text%2C%20no%20watermark%2C%20no%20stock%20office%20imagery%2C%20no%20generic%20bookshelves%2C%20no%20smiling%20posed%20portraits%2C%20no%20digital%20screens%2C%20no%20bright%20saturated%20color?width=480&height=640&nologo=true&model=flux&seed=56499"
                alt="Hands working with cotton rag pulp and thread in the Verso workshop"
                className="w-full h-auto mb-8 bg-card"
               width={480} height={640} loading="lazy" decoding="async" />
              <div className="space-y-8">
                <blockquote className="text-xs text-primary italic leading-relaxed border-l-2 border-primary pl-4">
                  "Some books deserve to physically outlive their commercial life."
                </blockquote>
                
                <div className="bg-card p-6 space-y-2">
                  <div className="text-3xl font-light text-primary">40</div>
                  <p className="text-xs text-muted-foreground">copies per edition</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Full-bleed parallax image: cotton pulp detail */}
      <ParallaxDepth
        image="https://image.pollinations.ai/prompt/raw%20cotton%20rag%20paper%20and%20thread%20%E2%80%94%20pulp%2C%20sewn%20signatures%2C%20bound%20spines%20in%20undyed%20cream%20and%20oxblood%20thread%2C%20verso%20cotton%20pulp%20detail%2C%20close-up%20detail%20shot%2C%20editorial%20photography%2C%20soft%20north-facing%20window%20light%2C%20low%20contrast%2C%20slightly%20overcast%2C%2050mm-equivalent%2C%20eye-level%2C%20minimal%20distortion%2C%20quiet%20documentary%20framing%2C%20ink-on-cream%20duotone%2C%20visible%20paper%20grain%2C%20no%20gloss%2C%20no%20text%2C%20no%20watermark%2C%20no%20stock%20office%20imagery%2C%20no%20generic%20bookshelves%2C%20no%20smiling%20posed%20portraits%2C%20no%20digital%20screens%2C%20no%20bright%20saturated%20color?width=1920&height=600&nologo=true&model=flux&seed=56499"
        intensity="subtle"
        minHeight="60vh"
        className="mt-16"
      >
        <div className="h-full flex items-center justify-center opacity-0 pointer-events-none">
          {/* Content passes through; parallax does the visual work */}
        </div>
      </ParallexDepth>

      {/* Bottom: CTA section */}
      <div className="container-page mt-16">
        <div className="grid grid-cols-12 gap-8">
          <div className="col-span-12 md:col-span-7">
            <p className="text-sm text-muted-foreground mb-6">
              Every three months, a new edition. Follow the work on our current project.
            </p>
            <a
              href="#current-edition"
              className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/80 mi mi-lift group"
            >
              See current edition
              <svg className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
