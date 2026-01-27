'use client'

import React from 'react'
import Image from 'next/image'
import { ArrowRight, CalendarDays, MessageCircle, Megaphone, Globe, Sparkles } from 'lucide-react'

import { Navbar } from '@/components/ui/navbar'
import { Card, CardContent } from '@/components/ui/card'

type AgentStatus = 'active' | 'preview'

type Agent = {
  name: string
  role: string
  status: AgentStatus
  description: string
  imageSrc: string
  href: string
  cta: string
  icon: React.ReactNode
}

const AGENTIK_BLUE = '#304f9d'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function StatusPill({ status }: { status: AgentStatus }) {
  const isActive = status === 'active'
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
        isActive ? 'bg-green-100 text-green-800' : 'border border-black/20 text-black'
      )}
    >
      {isActive ? 'Activo' : 'Preview'}
    </span>
  )
}

function AgentAvatar({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="mx-auto h-20 w-20 rounded-2xl bg-[#f7f8fa] border border-black/10 flex items-center justify-center overflow-hidden">
      <Image src={src} alt={alt} width={96} height={96} className="h-full w-full object-cover" />
    </div>
  )
}

export default function AgentsPage() {
  const agents: Agent[] = [
    {
      name: 'Mila',
      role: 'Agente WhatsApp',
      status: 'active',
      description:
        'Atiende chats, responde preguntas, califica prospectos y guía a tus clientes hacia la compra con tono humano y consistente.',
      imageSrc: '/agents/mila.png',
      href: '/agents/mila',
      cta: 'Activar Mila',
      icon: <MessageCircle className="h-4 w-4" />,
    },
    {
      name: 'Luca',
      role: 'Social Media Manager',
      status: 'active',
      description:
        'Crea contenido y publica en TikTok (v1). Optimiza copy, hashtags y CTA según tu objetivo: ventas, seguidores o likes.',
      imageSrc: '/agents/luca.png',
      href: '/agents/luca',
      cta: 'Activar Luca',
      icon: <Megaphone className="h-4 w-4" />,
    },
    {
      name: 'Sofi',
      role: 'Gestión página web',
      status: 'preview',
      description:
        'Actualiza contenido, banners, secciones y FAQs. Te ayuda a mantener tu web viva y lista para convertir visitantes.',
      imageSrc: '/agents/sofi.png',
      href: '/agents/sofi',
      cta: 'Ver Sofi',
      icon: <Globe className="h-4 w-4" />,
    },
    {
      name: 'Enzo',
      role: 'Reservas y citas',
      status: 'preview',
      description:
        'Gestiona agenda, disponibilidad, confirmaciones y recordatorios. Ideal para servicios, reservas y citas recurrentes.',
      imageSrc: '/agents/enzo.png',
      href: '/agents/enzo',
      cta: 'Ver Enzo',
      icon: <CalendarDays className="h-4 w-4" />,
    },
  ]

  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      <Navbar />

      {/* HERO (sin robot, centrado y alineado al centro) */}
      <section className="bg-[#f7f8fa]">
        <div className="mx-auto max-w-7xl px-6 pt-28 pb-10 md:pt-32 md:pb-12">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-gray-600 text-sm uppercase tracking-wide">Agentik • Empleados virtuales con IA</p>

            <h1 className="mt-4 text-4xl md:text-5xl font-bold leading-tight" style={{ color: AGENTIK_BLUE }}>
              Elige a tu empleado con IA
            </h1>

            <p className="mt-5 text-gray-700 text-lg leading-relaxed">
              Agentik crea empleados con IA que realizan tareas reales por tu negocio, proyecto o trabajo profesional.
              Cada agente está entrenado para un rol específico.
            </p>

            <div className="mt-7 flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="#agents"
                className="inline-flex items-center justify-center rounded-xl px-6 py-3 font-semibold text-white transition"
                style={{ backgroundColor: AGENTIK_BLUE }}
              >
                Ver agentes disponibles
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>

              <a
                href="/contact"
                className="inline-flex items-center justify-center rounded-xl px-6 py-3 font-semibold transition"
                style={{ border: `1px solid ${AGENTIK_BLUE}`, color: AGENTIK_BLUE }}
              >
                Quiero un agente personalizado
                <Sparkles className="ml-2 h-4 w-4" />
              </a>
            </div>

            <div className="mt-6 text-sm text-gray-500">Empieza con uno. Agrega más cuando lo necesites.</div>
          </div>
        </div>
      </section>

      {/* CARDS */}
      <section id="agents" className="pb-16 md:pb-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div className="max-w-2xl">
              <h2 className="text-2xl md:text-3xl font-bold" style={{ color: AGENTIK_BLUE }}>
                Agentes disponibles
              </h2>
              <p className="mt-2 text-gray-600">
                Activos: puedes empezar hoy. Preview: requieren autorización o integración personalizada.
              </p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {agents.map((a) => (
              <Card key={a.href} className="border-black/10 bg-white hover:shadow-md transition">
                {/* 👇 flex-col y mt-auto para fijar botones abajo */}
                <CardContent className="p-6 h-full flex flex-col">
                  <div className="flex items-start justify-between gap-4">
                    <StatusPill status={a.status} />
                    <span className="inline-flex items-center gap-2 text-xs text-gray-500">
                      {a.icon}
                      {a.role}
                    </span>
                  </div>

                  <div className="mt-5 text-center">
                    <AgentAvatar src={a.imageSrc} alt={`${a.name} - ${a.role}`} />
                    <h3 className="mt-4 text-lg font-semibold" style={{ color: AGENTIK_BLUE }}>
                      {a.name}
                    </h3>
                    <p className="mt-3 text-sm text-gray-600 leading-relaxed">{a.description}</p>
                  </div>

                  {/* Empuja CTA al fondo para que todas queden parejitas */}
                  <div className="mt-auto pt-6">
                    <div className="pt-4 border-t border-black/5">
                      <a
                        href={a.href}
                        className={cx('inline-flex items-center justify-center w-full rounded-xl px-5 py-2.5 font-semibold transition')}
                        style={{
                          backgroundColor: a.status === 'active' ? AGENTIK_BLUE : 'transparent',
                          color: a.status === 'active' ? 'white' : AGENTIK_BLUE,
                          border: a.status === 'active' ? 'none' : `1px solid ${AGENTIK_BLUE}`,
                        }}
                      >
                        {a.cta}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </a>

                      {a.status === 'preview' && (
                        <p className="mt-2 text-xs text-gray-500">Requiere autorización o integración personalizada.</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Franja de concepto */}
          <div className="mt-10 rounded-2xl border border-black/10 bg-white p-6">
            <p className="text-gray-700">
              Cada agente trabaja de forma independiente, pero puede colaborar con otros dentro de Agentik para automatizar
              procesos completos (ventas, contenido, soporte y operación).
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}