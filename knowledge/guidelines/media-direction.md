# Media direction for web experiences

Media is evidence in service of a message. These rules describe when a still, a sequence, or a generated video is worth using and how it must degrade gracefully.

## Video hero: use movement to reveal a property

tags: premium, aggressive, playful, video, hero, media, motion, performance

Choose a hero video when movement reveals something a still cannot: material response, transformation, scale, human energy, or a spatial journey. Match the shot's crop and motion to the headline; leave quiet visual space for readable copy. Prepare a poster frame that carries the same message, mute by default, and avoid placing critical information only inside the footage.

## Scroll-linked media: make progress legible

tags: premium, technical, video, scroll, media, motion, accessibility

Scroll-linked media should have a visible relation between scroll progress and visual change. Use a small number of distinct states or chapters rather than scrubbing an arbitrary clip. Ensure the surrounding copy names the change, the experience can be bypassed with normal scrolling, and reduced-motion users receive the final information without simulated camera motion.

## Still imagery: choose an image with a job

tags: premium, minimal, trustworthy, image, media, layout

Every still should do one of three jobs: establish a world, prove a product detail, or make a human outcome credible. Avoid generic stock imagery that could be swapped between brands without changing meaning. Crop and art direction should repeat the page's palette, pace, and point of view rather than competing with them.

## Generated media: direct continuity, not isolated clips

tags: cinematic, video, generated-media, media, motion, consistency

For generated image-to-video, specify a shot bible before producing clips: subject, environment, palette, lighting, camera language, duration, and prohibited artifacts. Generate a small storyboard of connected shots instead of unrelated demonstrations. Store the source image, prompt, selected take, poster, and fallback with the session so the page remains reproducible.

## Media performance: preserve the message first

tags: universal, media, video, performance, accessibility, avoid

Use responsive encodes, a poster, lazy loading below the fold, and explicit dimensions to avoid layout shift. Do not make the call to action or key product explanation depend on a large download. On constrained networks or small screens, prefer the poster and concise copy over a degraded autoplay experience.

## Generated imagery is sharp only inside the container, never full-bleed

tags: media, image, resolution, bleed, quality, craft, generated, sharpness

Generated imagery arrives at a fixed pixel budget, so its usable size is decided before any design
choice is made: roughly 1173px wide at a cinematic crop, less as the frame gets squarer. Inside the
page container that is effectively one-to-one and looks crisp; stretched across a full-bleed band it
is upscaled by anywhere from a fifth to two and a half times, and the result reads as cheap
regardless of how good the composition is. The mistake is invisible at authoring time and obvious on
the page, which is why it survives so many revisions. Reserve full-bleed bands for colour fields,
type, or genuine high-resolution photography, and keep generated imagery within the container where
its resolution is honest. When a page truly needs an edge-to-edge photograph, source it from stock
rather than generating it — sharpness at that size is not something a prompt can fix.
