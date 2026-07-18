# The device library — verified composition, ready to apply

These are the page's built-in compositional devices. The geometry is already correct and responsive;
a section chooses WHICH device fits its content and applies the class, never rebuilding the layout by
hand. Reaching for a device is how a section gets depth or tension instead of another stacked
rectangle. Use one or two per section, never all of them.

## Device: dev-overlap — two elements that occlude

tags: device, composition, overlap, depth, layering, editorial, asymmetric

Use dev-overlap when a section pairs a large visual with a block of text or a card and you want real
depth: the container takes className "dev-overlap" and its FIRST child (usually the image) is
overlapped by its SECOND child (the card or text block), which sits above it and offset downward. Add
"dev-overlap-left" to mirror the arrangement. It suits editorial and asymmetric compositions and is
the single most effective cure for a page of separated rectangles, because occlusion is what the eye
reads as depth. Give the front element a solid background (bg-card) so the overlap actually occludes
rather than muddling both layers. It collapses to a clean stack on narrow screens automatically.

## Device: dev-offset-grid — a grid with staggered columns

tags: device, composition, grid, offset, rhythm, gallery, modular

Use dev-offset-grid instead of a plain grid when showing three or more sibling items — cards, images,
process steps — and the uniform row feels mechanical: alternate children sit lower, producing a
rhythm that reads as considered rather than generated. It suits gallery and modular compositions and
works best when items vary slightly in height anyway. Do not use it for content where alignment
carries meaning, such as a comparison table or a pricing row, where the stagger would read as an
error rather than a decision. It flattens to an aligned grid on narrow screens.

## Device: dev-quote-break — a pull-quote that breaks the measure

tags: device, composition, quote, editorial, tension, grid-break, typography

Use dev-quote-break for a single strong quotation or claim inside a body of text: the block extends
beyond the text measure with an accent rule, breaking the column deliberately and creating the
tension that a perfectly obedient grid never produces. This is the recommended way to spend a page's
ONE grid break — large enough to read as intentional, and it returns to the flow immediately after.
Use it once per page at most; a second break dissolves the discipline the first one played against.
Pair it with genuinely quotable content, never with ordinary body copy that happens to be important.

## Device: dev-bleed — escape the container to the viewport edge

tags: device, composition, bleed, full-bleed, media, cinematic, immersive

Use dev-bleed on a band that should run the full width of the viewport — a hero image, a colour
field, a single cinematic moment — while every other block respects the container. The device is safe
by construction: the page clips horizontally, so a bleed can never create a sideways scrollbar. Its
power comes entirely from contrast, so use it once or twice per page; bleeding every section produces
a slideshow with no structure and removes the container rhythm that makes the bleed feel like an
event.

## Device: dev-stat-row — oversized numerals as the scale jump

tags: device, composition, stats, numbers, scale, hierarchy, proof

Use dev-stat-row when a page has real numbers worth remembering — years, counts, percentages,
editions, prices: wrap the row in "dev-stat-row" and give each item a "dev-stat-n" numeral with a
"dev-stat-l" label. The numerals render at display scale in the locked display face, providing the
single dramatic scale jump that makes a page feel confident. Only use it with genuine figures; a
stat row of invented or vague numbers is the most transparent filler on a page. Two to four items
works; more turns the drama into a table.

## Device: dev-feature-grid — capability cards that complete their rows

tags: device, composition, features, cards, saas, product, grid

Use dev-feature-grid for capability or service blocks in product, SaaS, and service registers: the
grid auto-fits so rows always complete, which removes the ragged trailing gap that makes a generated
grid look broken. Each child is already carded (surface, border, radius, padding) from the locked
theme, so a section supplies only the content. Give every item the same shape — an icon or short
label, a title, one sentence — because uneven card content is what makes a feature section look
assembled. Four or six items read better than five.

## Device: dev-logo-wall — social proof as wordmarks

tags: device, composition, logos, proof, saas, agency, trust

Use dev-logo-wall for a row of client or partner names as styled TEXT wordmarks, never as image
files: a wall of mismatched logo images at different weights and crops is the cheapest-looking
element on the web, while consistent typographic wordmarks read as deliberate. It belongs adjacent to
the ask in product and agency registers, where proof does its work next to the decision. Only include
names that are real for the brief; invented client logos are both dishonest and immediately obvious.

## Device: dev-frame — a matted frame for media

tags: device, composition, frame, media, craft, detail, consistency

Use dev-frame to mat an image or embed inside a bordered surface, and then use it for EVERY framed
image on the page: the value is in the repetition, since one consistent frame treatment is a craft
signal while three different treatments read as carelessness. It suits editorial, portfolio, and
product pages where imagery should feel presented rather than pasted in. Skip it entirely on
full-bleed media, where a frame would contradict the bleed.
