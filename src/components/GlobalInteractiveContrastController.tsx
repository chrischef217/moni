'use client'

import { useEffect } from 'react'

type Rgba = { r: number; g: number; b: number; a: number }

const INTERACTIVE_SELECTOR = [
  'button',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
  '[role="button"]',
  'a[href]',
].join(',')

const CORRECTED_CLASS = 'moni-auto-contrast-text'
const COLOR_VARIABLE = '--moni-auto-contrast-color'

function clamp(value: number, min = 0, max = 255) {
  return Math.min(max, Math.max(min, value))
}

function parseColor(value: string): Rgba | null {
  const match = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/i)
  if (!match) return null

  return {
    r: clamp(Number(match[1])),
    g: clamp(Number(match[2])),
    b: clamp(Number(match[3])),
    a: match[4] === undefined ? 1 : Math.min(1, Math.max(0, Number(match[4]))),
  }
}

function composite(foreground: Rgba, background: Rgba): Rgba {
  const alpha = foreground.a + background.a * (1 - foreground.a)
  if (alpha <= 0) return { r: 255, g: 255, b: 255, a: 0 }

  return {
    r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
    g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
    b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
    a: alpha,
  }
}

function renderedBackground(element: HTMLElement): Rgba {
  let current: HTMLElement | null = element
  let result: Rgba = { r: 255, g: 255, b: 255, a: 0 }

  while (current) {
    const layer = parseColor(window.getComputedStyle(current).backgroundColor)
    if (layer && layer.a > 0) {
      result = result.a === 0 ? layer : composite(result, layer)
      if (result.a >= 0.995) break
    }
    current = current.parentElement
  }

  return result.a >= 0.995 ? result : composite(result, { r: 255, g: 255, b: 255, a: 1 })
}

function linearChannel(value: number) {
  const normalized = value / 255
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4
}

function luminance(color: Rgba) {
  return 0.2126 * linearChannel(color.r)
    + 0.7152 * linearChannel(color.g)
    + 0.0722 * linearChannel(color.b)
}

function contrastRatio(first: Rgba, second: Rgba) {
  const lighter = Math.max(luminance(first), luminance(second))
  const darker = Math.min(luminance(first), luminance(second))
  return (lighter + 0.05) / (darker + 0.05)
}

function rgbToHsl(color: Rgba) {
  const r = color.r / 255
  const g = color.g / 255
  const b = color.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const lightness = (max + min) / 2

  if (delta === 0) return { hue: 0, saturation: 0, lightness }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  let hue = 0

  if (max === r) hue = 60 * (((g - b) / delta) % 6)
  else if (max === g) hue = 60 * ((b - r) / delta + 2)
  else hue = 60 * ((r - g) / delta + 4)

  if (hue < 0) hue += 360
  return { hue, saturation, lightness }
}

function suitableDarkText(background: Rgba) {
  const { hue, saturation } = rgbToHsl(background)

  if (saturation < 0.12) return '#1f3442'
  if (hue >= 20 && hue < 68) return '#765100'
  if (hue >= 68 && hue < 175) return '#0f6b4c'
  if (hue >= 175 && hue < 250) return '#1f5873'
  if (hue >= 250 && hue < 325) return '#5b3f8c'
  return '#9c3636'
}

function isButtonLike(element: HTMLElement) {
  if (element.matches('button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"]')) return true
  if (!element.matches('a[href]')) return false

  const style = window.getComputedStyle(element)
  const horizontalPadding = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
  const verticalPadding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
  const borderRadius = Number.parseFloat(style.borderTopLeftRadius)
  return horizontalPadding >= 12 && verticalPadding >= 6 && borderRadius >= 4
}

function clearCorrection(element: HTMLElement) {
  element.classList.remove(CORRECTED_CLASS)
  element.style.removeProperty(COLOR_VARIABLE)
  delete element.dataset.moniContrastCorrected
}

function auditElement(element: HTMLElement) {
  if (!element.isConnected || !isButtonLike(element)) return

  const style = window.getComputedStyle(element)
  const text = parseColor(style.color)
  if (!text) return

  const background = renderedBackground(element)
  const backgroundLuminance = luminance(background)
  const textLuminance = luminance(text)
  const ratio = contrastRatio(text, background)

  // Preserve white text on genuinely dark buttons. Only correct light surfaces
  // where white or near-white text fails normal readable contrast.
  const needsCorrection = backgroundLuminance >= 0.52
    && textLuminance >= 0.72
    && ratio < 4.5

  if (!needsCorrection) {
    if (element.dataset.moniContrastCorrected === 'true') clearCorrection(element)
    return
  }

  element.style.setProperty(COLOR_VARIABLE, suitableDarkText(background))
  element.classList.add(CORRECTED_CLASS)
  element.dataset.moniContrastCorrected = 'true'
}

function auditAll() {
  const elements = Array.from(document.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR))
  for (const element of elements) auditElement(element)
  document.body.dataset.moniContrastAuditCount = String(
    document.querySelectorAll(`[data-moni-contrast-corrected="true"]`).length,
  )
}

export default function GlobalInteractiveContrastController() {
  useEffect(() => {
    let frame: number | null = null

    const scheduleAudit = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        auditAll()
      })
    }

    const auditEventTarget = (event: Event) => {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>(INTERACTIVE_SELECTOR)
        : null
      if (!target) return
      window.requestAnimationFrame(() => auditElement(target))
    }

    auditAll()

    const observer = new MutationObserver(scheduleAudit)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'disabled', 'aria-disabled', 'aria-pressed'],
    })

    window.addEventListener('resize', scheduleAudit)
    document.addEventListener('pointerover', auditEventTarget, true)
    document.addEventListener('pointerout', auditEventTarget, true)
    document.addEventListener('focusin', auditEventTarget, true)
    document.addEventListener('focusout', auditEventTarget, true)

    return () => {
      observer.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', scheduleAudit)
      document.removeEventListener('pointerover', auditEventTarget, true)
      document.removeEventListener('pointerout', auditEventTarget, true)
      document.removeEventListener('focusin', auditEventTarget, true)
      document.removeEventListener('focusout', auditEventTarget, true)
      document.querySelectorAll<HTMLElement>(`[data-moni-contrast-corrected="true"]`).forEach(clearCorrection)
      delete document.body.dataset.moniContrastAuditCount
    }
  }, [])

  return (
    <style jsx global>{`
      .${CORRECTED_CLASS} {
        color: var(${COLOR_VARIABLE}) !important;
      }
    `}</style>
  )
}
