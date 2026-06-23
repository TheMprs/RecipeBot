// Frying sizzle for the "I made this" button (Pixabay, free for commercial use)
import sizzleUrl from '../assets/sizzle.mp3'

// Preload at module load so the first click doesn't pay the fetch/decode cost
const audio = new Audio(sizzleUrl)
audio.volume = 0.5
audio.preload = 'auto'

export function playSizzle() {
  try {
    audio.currentTime = 0
    audio.play().catch(() => {}) // autoplay blocked / audio unavailable — stay silent
  } catch {
    // stay silent
  }
}
