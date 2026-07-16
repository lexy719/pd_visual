// hero-004 — default export ScrollExpandMedia, takes props + children (no built-in demo data).
// Uses image mode so no video file is needed. This mount is also the scroll-jack test rig:
// scrolling should GROW the media and lock the page at top until it's fully expanded.
import ScrollExpandMedia from './active-component'

export default function App() {
  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <ScrollExpandMedia
        mediaType="image"
        mediaSrc="https://images.unsplash.com/photo-1682687982501-1e58ab814714?q=80&w=1280&auto=format&fit=crop"
        bgImageSrc="https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=1920&auto=format&fit=crop"
        title="Dynamic Image Showcase"
        date="Underwater Adventure"
        scrollToExpand="Scroll to Expand"
      >
        <div className="mx-auto max-w-3xl text-black dark:text-white">
          <h2 className="mb-4 text-3xl font-bold">About This Component</h2>
          <p className="text-lg">
            Once the media finishes expanding, the page releases and this content becomes scrollable.
          </p>
        </div>
      </ScrollExpandMedia>
    </div>
  )
}
