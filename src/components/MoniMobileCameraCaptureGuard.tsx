'use client'

import { useEffect } from 'react'

const CAMERA_BUTTON_TEXT = '카메라로 촬영'

function findPhotoInputs(root: HTMLElement) {
  const inputs = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="file"]'))
  const camera = inputs.find((input) => input.hasAttribute('capture')) || null
  const gallery = inputs.find((input) => input.multiple && !input.hasAttribute('capture')) || null
  return { camera, gallery }
}

function hardenNativePickerInputs(root: HTMLElement) {
  const { camera, gallery } = findPhotoInputs(root)

  if (camera) {
    // Android browsers are much more consistent about opening the native camera
    // when capture is paired with the broad image/* accept token. A comma-separated
    // MIME list can be treated as a generic file/gallery chooser by some devices.
    camera.accept = 'image/*'
    camera.setAttribute('capture', 'environment')
    camera.removeAttribute('multiple')
    camera.dataset.moniPicker = 'camera'
  }

  if (gallery) {
    gallery.accept = 'image/*'
    gallery.removeAttribute('capture')
    gallery.multiple = true
    gallery.dataset.moniPicker = 'gallery'
  }
}

export default function MoniMobileCameraCaptureGuard() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!root) return

    let frame = 0
    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        hardenNativePickerInputs(root)
      })
    }

    // Ensure the attributes are correct before React's onClick invokes input.click().
    // This is deliberately capture-phase so Android sees capture=environment at the
    // exact user gesture that opens the picker.
    const onPointerDown = (event: Event) => {
      const target = event.target instanceof Element ? event.target.closest('button') : null
      if (!target || !root.contains(target)) return
      if ((target.textContent || '').trim() !== CAMERA_BUTTON_TEXT) return
      hardenNativePickerInputs(root)
    }

    const observer = new MutationObserver(schedule)
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['accept', 'capture', 'multiple'] })
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('touchstart', onPointerDown, true)

    hardenNativePickerInputs(root)

    return () => {
      observer.disconnect()
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('touchstart', onPointerDown, true)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  return null
}
