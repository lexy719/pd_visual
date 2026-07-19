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

## Device: dev-side-rail — a sticky label column beside long content

tags: device, composition, sticky, side-rail, navigation, orientation, long-form, editorial

Use dev-side-rail when a section is long enough that a reader loses their place — a process with many
steps, a long specification, a chaptered story: the FIRST child becomes a rail that holds position
while the SECOND child scrolls past it. The rail should carry orientation, not decoration: a section
label, a step count, a short contents list, occasionally a persistent call to action. It is the
cheapest way to make a long section feel authored rather than dumped, because the reader always knows
where they are. Do not use it for a short section, where the rail would sit alone in empty space and
read as an unfinished column. The rail unsticks and stacks on narrow screens, where sticky content in
a short viewport would crowd the reader out instead of orienting them.

## Device: dev-compare — an aligned comparison table

tags: device, composition, table, comparison, saas, product, pricing, decision

Use dev-compare when the page asks the reader to choose between options — plans, tiers, your approach
against the usual approach, specifications across models: put a real table inside the container and
let alignment do the work. This is the one place where rhythm devices are WRONG: when items are being
compared, alignment IS the meaning, and a stagger or offset reads as a rendering error. Mark
presence and absence with "dev-compare-yes" and "dev-compare-no" rather than raw ticks and crosses so
the emphasis stays with the locked accent. Keep it to the axes that genuinely differ; a comparison
padded with rows where every column is identical is transparently rigged and destroys the trust the
table was built to earn.

## Device: dev-faq — questions as a typographic list

tags: device, composition, faq, questions, disclosure, editorial, local-service, saas

Use dev-faq for genuine recurring questions — objections before a purchase, practicalities before a
visit, integration questions before adoption: each child is a "details" element with a "summary"
question, and the answer is prose beneath it. Carding an FAQ is one of the clearest tells of a
generated page: answers are prose, and prose does not want a border around it, so the device gives
them a rule and a measure instead. It works with no JavaScript and stays keyboard-accessible, so it
never becomes a motion or hydration problem. Write real questions in the reader's words, not
marketing questions the brand wishes it were asked; five honest entries outperform twelve invented
ones.

## Device: dev-price-table — pricing tiers with one emphasised plan

tags: device, composition, pricing, plans, saas, product, conversion, decision

Use dev-price-table for plan or package selection: each child is a tier with a "dev-price-n" figure
and a "dev-price-p" period, and EXACTLY ONE child also takes "dev-price-featured". The emphasis is
the entire point of the device — three undifferentiated prices hand the decision back to the reader,
which is precisely how a pricing section fails to convert. The device stretches every tier to equal
height and pins the final child of each to the bottom, so the calls to action align across the row
however uneven the feature lists are. Name what each tier is FOR in a short line under the figure;
a tier whose only differentiator is a number gives the reader nothing to decide with.

## Device: dev-stage — a frame, not a band

tags: device, composition, stage, cinematic, immersive, full-viewport, media, hero, layering, anchor

Use dev-stage when a section should be a FRAME rather than a strip of page: media filling it edge to
edge, type layered over the image and hung hard off one corner. Every other device arranges content
inside a horizontal band that the page then stacks, which is why a page of them reads as competent
and never as cinematic — a band can hold a good composition, but the composition is always
subordinate to the stack. A stage is the one structure that is not. Give it a media child with
"dev-stage-media" and a text child with "dev-stage-body"; the corner comes from the page's committed
composition, not from the section.

Reach for it when the image IS the argument — an opening frame, a single held moment, the one place
in a story where the reader should stop. It is spent by repetition in the same way a full bleed is:
two stages on a page are a rhythm, five are a slideshow, and a stage used for a section whose content
is really a list or a comparison is a photograph with an argument buried under it. Keep the body text
short, because type at frame scale is read as an image before it is read as a sentence — a stage
holding a paragraph is a band wearing a costume.

The readability of type over the photograph is handled for you and should not be second-guessed with
hand-picked colours: the image is unknown when the page is written, so a scrim keyed to the anchor
guarantees the contrast instead.
