// nav-002 — the stored code exports the FloatingNav PRIMITIVE, not a demo.
// This mount supplies navItems and a tall scroll area so the hide/reveal behaviour is testable.
import { FloatingNav } from './active-component'

const navItems = [
  { name: 'Home', link: '#' },
  { name: 'About', link: '#about' },
  { name: 'Contact', link: '#contact' }
]

export default function App() {
  return (
    <div className="relative w-full">
      <FloatingNav navItems={navItems} />
      <div className="grid min-h-[250vh] grid-cols-1 place-items-start bg-white dark:bg-black">
        <p className="mt-40 w-full text-center text-3xl font-bold text-neutral-600 dark:text-white">
          Scroll down past 5%, then scroll up to reveal the navbar.
        </p>
      </div>
    </div>
  )
}
