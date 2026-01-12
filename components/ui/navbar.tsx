"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Menu, X } from "lucide-react"

const AGENTIK_NAVY = "#304F9D"

export function Navbar() {
  const [open, setOpen] = useState(false)

  return (
    <header className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-6xl">
      {/* Barra principal */}
      <div className="flex items-center justify-between rounded-full border border-black/10 bg-white/75 backdrop-blur-xl px-4 py-2 shadow-sm">
        
        {/* LOGO */}
        <Link href="/" className="flex items-center gap-2">
          <div className="relative h-9 w-9 rounded-xl bg-white border border-black/10 flex items-center justify-center">
            <Image
              src="/agentik-navy.svg"
              alt="Agentik"
              width={28}
              height={28}
              priority
            />
          </div>

          <div className="hidden sm:block leading-tight">
            <p
              className="text-sm font-semibold"
              style={{ color: AGENTIK_NAVY }}
            >
              Agentik
            </p>
            <p className="text-[11px] text-slate-500">
              Empleados virtuales
            </p>
          </div>
        </Link>

        {/* LINKS DESKTOP */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <a href="#services" style={{ color: AGENTIK_NAVY }} className="hover:opacity-80">
            Soluciones
          </a>
          <a href="#como-funciona" style={{ color: AGENTIK_NAVY }} className="hover:opacity-80">
            Cómo funciona
          </a>
          <a href="#pricing" style={{ color: AGENTIK_NAVY }} className="hover:opacity-80">
            Planes
          </a>
        </nav>

        {/* CTA DESKTOP */}
        <div className="hidden md:flex items-center gap-3">
          <a
            href="#pricing"
            className="rounded-full border border-black/10 px-4 py-2 text-sm font-semibold hover:bg-slate-50 transition"
            style={{ color: AGENTIK_NAVY }}
          >
            Ver planes
          </a>

          <a
            href="/agentes/marketing"
            className="rounded-full px-4 py-2 text-sm font-semibold text-white transition"
            style={{ backgroundColor: AGENTIK_NAVY }}
          >
            Probar Luca
          </a>
        </div>

        {/* BOTÓN MOBILE */}
        <button
          onClick={() => setOpen(!open)}
          className="md:hidden flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white"
          style={{ color: AGENTIK_NAVY }}
          aria-label="Abrir menú"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* MENÚ MOBILE */}
      {open && (
        <div className="mt-2 rounded-2xl border border-black/10 bg-white/95 backdrop-blur-xl px-5 py-5 shadow-md md:hidden">
          <nav className="flex flex-col gap-4 text-sm font-medium">
            <a href="#services" onClick={() => setOpen(false)} style={{ color: AGENTIK_NAVY }}>
              Soluciones
            </a>
            <a href="#como-funciona" onClick={() => setOpen(false)} style={{ color: AGENTIK_NAVY }}>
              Cómo funciona
            </a>
            <a href="#pricing" onClick={() => setOpen(false)} style={{ color: AGENTIK_NAVY }}>
              Planes
            </a>

            <div className="pt-4 flex flex-col gap-3">
              <a
                href="#pricing"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-black/10 px-4 py-2 text-center font-semibold"
                style={{ color: AGENTIK_NAVY }}
              >
                Ver planes
              </a>

              <a
                href="/agentes/marketing"
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-2 text-center font-semibold text-white"
                style={{ backgroundColor: AGENTIK_NAVY }}
              >
                Probar Luca
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}