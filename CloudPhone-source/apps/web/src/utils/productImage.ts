import type { SyntheticEvent } from 'react'

export const PLACEHOLDER_IMAGE = '/phones/image-unavailable.png'

export function showProductPlaceholder(event: SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget
  if (image.getAttribute('src') !== PLACEHOLDER_IMAGE) {
    image.src = PLACEHOLDER_IMAGE
  }
}
