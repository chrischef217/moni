const RE = 6371.00877
const GRID = 5.0
const SLAT1 = 30.0
const SLAT2 = 60.0
const OLON = 126.0
const OLAT = 38.0
const XO = 43
const YO = 136

const DEGRAD = Math.PI / 180.0

export type KmaGridPoint = {
  nx: number
  ny: number
}

/**
 * Converts WGS84 latitude/longitude to the KMA village forecast 5 km grid.
 * Formula follows the Lambert Conformal Conic conversion used by the
 * KMA short-term forecast service.
 */
export function toKmaGrid(latitude: number, longitude: number): KmaGridPoint {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('위도와 경도가 올바르지 않습니다.')
  }
  if (latitude < 30 || latitude > 45 || longitude < 120 || longitude > 135) {
    throw new Error('대한민국 범위의 위도·경도를 입력해 주세요.')
  }

  const re = RE / GRID
  const slat1 = SLAT1 * DEGRAD
  const slat2 = SLAT2 * DEGRAD
  const olon = OLON * DEGRAD
  const olat = OLAT * DEGRAD

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5)
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn)

  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5)
  sf = Math.pow(sf, sn) * Math.cos(slat1) / sn

  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5)
  ro = re * sf / Math.pow(ro, sn)

  let ra = Math.tan(Math.PI * 0.25 + latitude * DEGRAD * 0.5)
  ra = re * sf / Math.pow(ra, sn)

  let theta = longitude * DEGRAD - olon
  if (theta > Math.PI) theta -= 2.0 * Math.PI
  if (theta < -Math.PI) theta += 2.0 * Math.PI
  theta *= sn

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  }
}
