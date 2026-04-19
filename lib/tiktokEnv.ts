// app/lib/tiktokEnv.ts
export function isProdHost(hostname: string, protocol: string) {
  return protocol === "https:" && (hostname === "www.agentickers.com" || hostname === "agentickers.com")
}

export function cookieDomain(hostname: string, protocol: string) {
  return isProdHost(hostname, protocol) ? ".agentickers.com" : undefined
}

export function cookieSecure(hostname: string, protocol: string) {
  return isProdHost(hostname, protocol) // true en prod https, false en local
}