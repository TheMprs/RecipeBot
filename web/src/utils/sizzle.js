// Frying sizzle for the "I made this" button (Pixabay, free for commercial use)
import sizzleUrl from '../assets/sizzle.mp3'

let audio = null

export function playSizzle() {
  try {
    if (!audio) {
      audio = new Audio(sizzleUrl)
      audio.volume = 0.5
    }
    audio.currentTime = 0
    audio.play().catch(() => {}) // autoplay blocked / audio unavailable — stay silent
  } catch {
    // stay silent
  }
}
